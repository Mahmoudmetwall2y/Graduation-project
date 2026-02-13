# AWS Migration Guide for AscultiCor

This document outlines the complete migration path from local Docker deployment to AWS production.

## Architecture Overview

### Local Development
```
┌─────────────┐
│  Developer  │
└──────┬──────┘
       │
┌──────▼──────────────────────────────────────────┐
│           Docker Compose (Local)                │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │
│  │Mosquitto │  │Inference │  │   Frontend   │ │
│  │  MQTT    │  │  Service │  │   Next.js    │ │
│  └──────────┘  └──────────┘  └──────────────┘ │
└─────────────────────┬───────────────────────────┘
                      │
                ┌─────▼─────┐
                │ Supabase  │
                │  (Cloud)  │
                └───────────┘
```

### AWS Production
```
                    ┌───────────────┐
                    │  CloudFront   │
                    │   + S3/WAF    │
                    └───────┬───────┘
                            │
    ┌───────────────────────┼───────────────────────┐
    │                       │                       │
┌───▼────────┐    ┌─────────▼──────┐    ┌─────────▼─────────┐
│  Frontend  │    │   AWS IoT Core  │    │  Inference ECS    │
│   (S3/CF)  │    │   (MQTT/TLS)    │    │   + ALB + ASG     │
└────────────┘    └─────────┬───────┘    └─────────┬─────────┘
                            │                       │
                            └───────────┬───────────┘
                                        │
                                  ┌─────▼─────┐
                                  │ Supabase  │
                                  │  (Cloud)  │
                                  └───────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
              ┌─────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐
              │CloudWatch  │    │   Secrets   │    │   X-Ray     │
              │  Logs      │    │   Manager   │    │   Tracing   │
              └────────────┘    └─────────────┘    └─────────────┘
```

## Migration Steps

### Phase 1: MQTT Migration (AWS IoT Core)

#### 1.1 Create IoT Core Resources

```bash
# Create IoT Policy
aws iot create-policy \
  --policy-name AscultiCorDevicePolicy \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": [
        "iot:Connect",
        "iot:Publish",
        "iot:Subscribe",
        "iot:Receive"
      ],
      "Resource": "*"
    }]
  }'

# Get IoT endpoint
aws iot describe-endpoint --endpoint-type iot:Data-ATS
# Output: xxxxxxxxxxxxxx-ats.iot.us-east-1.amazonaws.com
```

#### 1.2 Device Certificate Management

```bash
# For each device, create certificate
aws iot create-keys-and-certificate \
  --set-as-active \
  --certificate-pem-outfile device-cert.pem \
  --public-key-outfile device-public.key \
  --private-key-outfile device-private.key

# Attach policy to certificate
aws iot attach-policy \
  --policy-name AscultiCorDevicePolicy \
  --target arn:aws:iot:region:account:cert/xxxxx

# Create Thing (device representation)
aws iot create-thing --thing-name cardiosense-device-001

# Attach certificate to thing
aws iot attach-thing-principal \
  --thing-name cardiosense-device-001 \
  --principal arn:aws:iot:region:account:cert/xxxxx
```

#### 1.3 Update Inference Service

Update `inference/app/mqtt_handler.py`:

```python
import ssl

class MQTTHandler:
    def __init__(self):
        # ... existing code ...
        
        # AWS IoT Core configuration
        self.aws_iot_endpoint = os.getenv("AWS_IOT_ENDPOINT")
        self.use_aws_iot = bool(self.aws_iot_endpoint)
        
        if self.use_aws_iot:
            self.client = mqtt.Client(
                client_id="cardiosense-inference",
                protocol=mqtt.MQTTv311
            )
            
            # Configure TLS
            self.client.tls_set(
                ca_certs="AmazonRootCA1.pem",
                certfile="device-cert.pem",
                keyfile="device-private.key",
                cert_reqs=ssl.CERT_REQUIRED,
                tls_version=ssl.PROTOCOL_TLSv1_2,
                ciphers=None
            )
            
            self.broker = self.aws_iot_endpoint
            self.port = 8883  # AWS IoT Core port
```

Environment variables:
```bash
AWS_IOT_ENDPOINT=xxxxxx-ats.iot.us-east-1.amazonaws.com
AWS_IOT_PORT=8883
```

### Phase 2: Inference Service Migration (ECS)

#### 2.1 Create ECR Repository

```bash
# Create repository
aws ecr create-repository --repository-name cardiosense/inference

# Get login credentials
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  ACCOUNT.dkr.ecr.us-east-1.amazonaws.com

# Build and push
docker build -t cardiosense/inference ./inference
docker tag cardiosense/inference:latest \
  ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/cardiosense/inference:latest
docker push ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/cardiosense/inference:latest
```

#### 2.2 Create ECS Task Definition

```json
{
  "family": "cardiosense-inference",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "2048",
  "memory": "4096",
  "containerDefinitions": [{
    "name": "inference",
    "image": "ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/cardiosense/inference:latest",
    "essential": true,
    "portMappings": [{
      "containerPort": 8000,
      "protocol": "tcp"
    }],
    "environment": [
      {"name": "SUPABASE_URL", "value": "https://xxx.supabase.co"},
      {"name": "AWS_IOT_ENDPOINT", "value": "xxx-ats.iot.us-east-1.amazonaws.com"}
    ],
    "secrets": [
      {"name": "SUPABASE_SERVICE_ROLE_KEY", "valueFrom": "arn:aws:secretsmanager:..."},
      {"name": "DEVICE_CERT", "valueFrom": "arn:aws:secretsmanager:..."}
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/cardiosense-inference",
        "awslogs-region": "us-east-1",
        "awslogs-stream-prefix": "ecs"
      }
    },
    "healthCheck": {
      "command": ["CMD-SHELL", "curl -f http://localhost:8000/health || exit 1"],
      "interval": 30,
      "timeout": 5,
      "retries": 3
    }
  }]
}
```

#### 2.3 Create ECS Service with ALB

```bash
# Create Application Load Balancer
aws elbv2 create-load-balancer \
  --name cardiosense-inference-alb \
  --subnets subnet-xxx subnet-yyy \
  --security-groups sg-xxx

# Create target group
aws elbv2 create-target-group \
  --name cardiosense-inference-tg \
  --protocol HTTP \
  --port 8000 \
  --vpc-id vpc-xxx \
  --health-check-path /health \
  --health-check-interval-seconds 30 \
  --target-type ip

# Create listener
aws elbv2 create-listener \
  --load-balancer-arn arn:aws:elasticloadbalancing:... \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn=arn:aws:acm:... \
  --default-actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:...

# Create ECS service
aws ecs create-service \
  --cluster cardiosense \
  --service-name inference \
  --task-definition cardiosense-inference \
  --desired-count 2 \
  --launch-type FARGATE \
  --load-balancers targetGroupArn=arn:aws:elasticloadbalancing:...,containerName=inference,containerPort=8000 \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx,subnet-yyy],securityGroups=[sg-xxx],assignPublicIp=ENABLED}"
```

#### 2.4 Configure Auto Scaling

```bash
# Register scalable target
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/cardiosense/inference \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 2 \
  --max-capacity 10

# Create scaling policy (CPU-based)
aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --resource-id service/cardiosense/inference \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name cpu-scaling \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 70.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
    }
  }'
```

### Phase 3: Frontend Migration (S3 + CloudFront)

#### 3.1 Build and Deploy

```bash
cd frontend

# Build for production
npm run build

# Upload to S3
aws s3 sync out/ s3://cardiosense-frontend/ --delete

# Create CloudFront distribution
aws cloudfront create-distribution \
  --origin-domain-name cardiosense-frontend.s3.amazonaws.com \
  --default-root-object index.html
```

#### 3.2 CloudFront Configuration

```json
{
  "CallerReference": "cardiosense-frontend",
  "Comment": "AscultiCor Frontend Distribution",
  "Enabled": true,
  "Origins": [{
    "Id": "S3-cardiosense-frontend",
    "DomainName": "cardiosense-frontend.s3.us-east-1.amazonaws.com",
    "S3OriginConfig": {
      "OriginAccessIdentity": ""
    }
  }],
  "DefaultCacheBehavior": {
    "TargetOriginId": "S3-cardiosense-frontend",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": ["GET", "HEAD", "OPTIONS"],
    "CachedMethods": ["GET", "HEAD"],
    "ForwardedValues": {
      "QueryString": false,
      "Cookies": {"Forward": "none"}
    },
    "MinTTL": 0,
    "DefaultTTL": 86400,
    "MaxTTL": 31536000,
    "Compress": true
  },
  "CustomErrorResponses": [{
    "ErrorCode": 404,
    "ResponsePagePath": "/index.html",
    "ResponseCode": "200"
  }],
  "ViewerCertificate": {
    "ACMCertificateArn": "arn:aws:acm:us-east-1:...",
    "SSLSupportMethod": "sni-only",
    "MinimumProtocolVersion": "TLSv1.2_2021"
  }
}
```

### Phase 4: Secrets Management

#### 4.1 Store Secrets

```bash
# Supabase service role key
aws secretsmanager create-secret \
  --name cardiosense/supabase/service-role-key \
  --secret-string "your-service-role-key"

# Device certificates
aws secretsmanager create-secret \
  --name cardiosense/device/cert \
  --secret-string file://device-cert.pem

aws secretsmanager create-secret \
  --name cardiosense/device/private-key \
  --secret-string file://device-private.key
```

#### 4.2 IAM Policy for ECS Task

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "secretsmanager:GetSecretValue"
    ],
    "Resource": [
      "arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:cardiosense/*"
    ]
  }, {
    "Effect": "Allow",
    "Action": [
      "iot:Connect",
      "iot:Subscribe",
      "iot:Receive",
      "iot:Publish"
    ],
    "Resource": "*"
  }, {
    "Effect": "Allow",
    "Action": [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents"
    ],
    "Resource": "arn:aws:logs:*:*:*"
  }]
}
```

### Phase 5: Monitoring & Logging

#### 5.1 CloudWatch Dashboards

```bash
# Create dashboard
aws cloudwatch put-dashboard \
  --dashboard-name AscultiCor \
  --dashboard-body file://cloudwatch-dashboard.json
```

```json
{
  "widgets": [{
    "type": "metric",
    "properties": {
      "metrics": [
        ["AWS/ECS", "CPUUtilization", {"stat": "Average"}],
        [".", "MemoryUtilization", {"stat": "Average"}]
      ],
      "period": 300,
      "stat": "Average",
      "region": "us-east-1",
      "title": "ECS Resource Utilization"
    }
  }, {
    "type": "metric",
    "properties": {
      "metrics": [
        ["AWS/ApplicationELB", "TargetResponseTime", {"stat": "Average"}],
        [".", "RequestCount", {"stat": "Sum"}]
      ],
      "period": 300,
      "region": "us-east-1",
      "title": "ALB Metrics"
    }
  }]
}
```

#### 5.2 CloudWatch Alarms

```bash
# High CPU alarm
aws cloudwatch put-metric-alarm \
  --alarm-name cardiosense-high-cpu \
  --alarm-description "Inference service high CPU" \
  --metric-name CPUUtilization \
  --namespace AWS/ECS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --alarm-actions arn:aws:sns:us-east-1:ACCOUNT:cardiosense-alerts

# Error rate alarm
aws cloudwatch put-metric-alarm \
  --alarm-name cardiosense-high-errors \
  --alarm-description "High error rate" \
  --metric-name 5XXError \
  --namespace AWS/ApplicationELB \
  --statistic Sum \
  --period 60 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --alarm-actions arn:aws:sns:us-east-1:ACCOUNT:cardiosense-alerts
```

### Phase 6: Multi-Instance Session Management

For multiple inference service instances, use Redis for shared session buffers:

#### 6.1 Create ElastiCache Redis

```bash
aws elasticache create-cache-cluster \
  --cache-cluster-id cardiosense-sessions \
  --cache-node-type cache.t3.medium \
  --engine redis \
  --num-cache-nodes 1 \
  --cache-subnet-group-name default
```

#### 6.2 Update Inference Service

```python
import redis
import json

class MQTTHandler:
    def __init__(self):
        # ... existing code ...
        
        # Redis for distributed session state
        self.redis_client = redis.Redis(
            host=os.getenv("REDIS_HOST"),
            port=6379,
            decode_responses=True
        )
    
    def _save_buffer_state(self, buffer_key: str, buffer: SessionBuffer):
        """Save buffer state to Redis."""
        state = {
            'chunks_count': len(buffer.chunks),
            'total_bytes': buffer.total_bytes,
            'total_samples': buffer.total_samples,
            'started_at': buffer.started_at.isoformat(),
            'last_chunk_at': buffer.last_chunk_at.isoformat()
        }
        self.redis_client.setex(
            f"buffer:{buffer_key}",
            3600,  # 1 hour TTL
            json.dumps(state)
        )
    
    def _load_buffer_state(self, buffer_key: str):
        """Load buffer state from Redis."""
        state_json = self.redis_client.get(f"buffer:{buffer_key}")
        if state_json:
            return json.loads(state_json)
        return None
```

### Phase 7: Cost Optimization

#### Estimated Monthly Costs (US East-1, 1000 sessions/day)

| Service | Configuration | Monthly Cost |
|---------|--------------|--------------|
| AWS IoT Core | 1M messages | $8 |
| ECS Fargate | 2 tasks x 2vCPU x 4GB | $146 |
| Application Load Balancer | 1 ALB | $16 |
| ElastiCache (optional) | t3.medium | $65 |
| CloudFront | 100GB transfer | $8.50 |
| S3 | 10GB storage + requests | $1 |
| CloudWatch Logs | 10GB ingestion | $5 |
| **Total** | | **~$250/month** |

#### Cost Reduction Strategies

1. **Use Spot Instances** for non-critical inference workloads
2. **S3 Intelligent Tiering** for recording storage
3. **CloudWatch Logs retention** policies (7-30 days)
4. **Reserved Capacity** for predictable workloads (40% savings)
5. **Auto-scaling policies** to scale down during off-hours

## Testing Checklist

After migration:

- [ ] Device can connect to AWS IoT Core
- [ ] MQTT messages route correctly
- [ ] Inference service receives and processes streams
- [ ] Results stored in Supabase
- [ ] Frontend loads from CloudFront
- [ ] Real-time updates work end-to-end
- [ ] Health checks pass
- [ ] Logs appear in CloudWatch
- [ ] Alarms trigger correctly
- [ ] Auto-scaling works
- [ ] Secrets rotate successfully

## Rollback Plan

If issues occur:

1. **DNS**: Point domain back to local/staging
2. **IoT Core**: Keep both Mosquitto and AWS IoT running during transition
3. **ECS**: Maintain task definition versions, can rollback instantly
4. **CloudFront**: Invalidate cache if needed
5. **Database**: Supabase remains unchanged (no migration needed)

## Production Best Practices

1. **Blue/Green Deployments**: Use ECS deployment configurations
2. **Circuit Breakers**: Implement in application code
3. **Rate Limiting**: AWS WAF rules on CloudFront
4. **DDoS Protection**: Shield Standard (free) or Advanced
5. **Backups**: Automated Supabase backups + point-in-time recovery
6. **Disaster Recovery**: Multi-region setup for critical deployments
7. **Compliance**: HIPAA-eligible services if handling PHI

## Summary

This migration transforms AscultiCor from a local development setup to a scalable, production-ready AWS deployment. The architecture maintains the same logical components while leveraging managed AWS services for reliability, scalability, and operational excellence.

Key benefits:
- **Scalability**: Auto-scaling handles traffic spikes
- **Reliability**: Multi-AZ deployment, health checks
- **Security**: TLS everywhere, secrets management, IAM roles
- **Observability**: Comprehensive logging and monitoring
- **Cost-Effective**: Pay only for what you use

Total migration time: ~1-2 days for experienced DevOps engineer.
