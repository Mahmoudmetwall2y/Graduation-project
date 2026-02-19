# AscultiCor - Cloud Deployment Guide

Deploy AscultiCor to the cloud for 24/7 independent operation.

## Architecture Overview

```
┌─────────────┐      Internet      ┌─────────────────────────────────────┐
│   ESP32     │  ────────────────> │         Cloud Infrastructure        │
│  + Sensors  │                    │                                     │
└─────────────┘                    │  ┌──────────┐    ┌──────────────┐  │
                                   │  │   AWS    │    │   Inference  │  │
                                   │  │   IoT    │───>│   Service    │  │
                                   │  │  Core    │    │   (ECS/EC2)  │  │
                                   │  └──────────┘    └──────┬───────┘  │
                                   │         │                │          │
                                   │         └────────────────┘          │
                                   │                      │              │
                                   │                      ▼              │
                                   │              ┌──────────────┐       │
                                   │              │  Supabase    │       │
                                   │              │  (Cloud DB)  │       │
                                   │              └──────┬───────┘       │
                                   │                     │               │
                                   └─────────────────────┼───────────────┘
                                                         │
                              ┌──────────────────────────┼──────────┐
                              │                          ▼          │
                              │  ┌──────────┐    ┌──────────────┐   │
                              │  │  Doctor  │    │   Next.js    │   │
                              │  │  Phone   │    │   Frontend   │   │
                              │  └──────────┘    │   (Vercel)   │   │
                              │                  └──────────────┘   │
                              │         Web Dashboard               │
                              └─────────────────────────────────────┘
```

## Option 1: AWS IoT Core + ECS (Production)

### Step 1: AWS IoT Core Setup

#### 1.1 Create IoT Thing
```bash
# Install AWS CLI and configure
aws configure

# Create a thing for your ESP32
aws iot create-thing --thing-name asculticor-device-001

# Create certificates
aws iot create-keys-and-certificate \
  --set-as-active \
  --certificate-pem-outfile device.crt \
  --public-key-outfile public.key \
  --private-key-outfile private.key

# Attach policy (create policy first in AWS Console)
aws iot attach-principal-policy \
  --policy-name AscultiCorPolicy \
  --principal <certificate-arn>

aws iot attach-thing-principal \
  --thing-name asculticor-device-001 \
  --principal <certificate-arn>
```

#### 1.2 IoT Policy
Create policy `AscultiCorPolicy` in AWS IoT Console:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "iot:Connect",
        "iot:Publish",
        "iot:Subscribe",
        "iot:Receive"
      ],
      "Resource": [
        "arn:aws:iot:*:*:client/${iot:Connection.Thing.ThingName}",
        "arn:aws:iot:*:*:topic/org/*",
        "arn:aws:iot:*:*:topicfilter/org/*"
      ]
    }
  ]
}
```

#### 1.3 Update ESP32 Code for AWS IoT

```cpp
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// AWS IoT Core Settings
const char* aws_endpoint = "your-endpoint.iot.us-east-1.amazonaws.com";
const int aws_port = 8883;

// Certificates (paste content here)
const char* ca_cert = R"EOF(
-----BEGIN CERTIFICATE-----
Amazon Root CA 1
-----END CERTIFICATE-----
)EOF";

const char* client_cert = R"EOF(
-----BEGIN CERTIFICATE-----
Your device certificate
-----END CERTIFICATE-----
)EOF";

const char* private_key = R"EOF(
-----BEGIN RSA PRIVATE KEY-----
Your private key
-----END RSA PRIVATE KEY-----
)EOF";

// WiFi
const char* ssid = "YourWiFi";
const char* password = "YourWiFiPassword";

WiFiClientSecure wifiClient;
PubSubClient client(wifiClient);

void setupAWS() {
  wifiClient.setCACert(ca_cert);
  wifiClient.setCertificate(client_cert);
  wifiClient.setPrivateKey(private_key);
  
  client.setServer(aws_endpoint, aws_port);
  client.setCallback(callback);
}

void connectAWS() {
  while (!client.connected()) {
    Serial.print("Connecting to AWS IoT...");
    
    if (client.connect("asculticor-device-001")) {
      Serial.println("connected");
      
      // Subscribe to control topics
      client.subscribe("org/00000000-0000-0000-0000-000000000001/device/00000000-0000-0000-0000-000000000004/control");
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" retrying in 5 seconds");
      delay(5000);
    }
  }
}
```

### Step 2: Deploy Inference Service to AWS ECS

#### 2.1 Create ECS Cluster
```bash
# Using AWS CLI
aws ecs create-cluster --cluster-name asculticor-cluster

# Or use AWS Console:
# ECS → Clusters → Create Cluster → Fargate
```

#### 2.2 Create Task Definition

`asculticor-task.json`:
```json
{
  "family": "asculticor-inference",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "executionRoleArn": "arn:aws:iam::YOUR_ACCOUNT:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "inference",
      "image": "YOUR_ECR_REPO/asculticor-inference:latest",
      "portMappings": [
        {
          "containerPort": 8000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "SUPABASE_URL",
          "value": "https://your-project.supabase.co"
        },
        {
          "name": "SUPABASE_SERVICE_ROLE_KEY",
          "value": "your-service-key"
        },
        {
          "name": "MQTT_BROKER",
          "value": "your-endpoint.iot.us-east-1.amazonaws.com"
        },
        {
          "name": "MQTT_PORT",
          "value": "8883"
        },
        {
          "name": "MQTT_USE_TLS",
          "value": "true"
        },
        {
          "name": "ENABLE_DEMO_MODE",
          "value": "false"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/asculticor",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "inference"
        }
      }
    }
  ]
}
```

Register task:
```bash
aws ecs register-task-definition --cli-input-json file://asculticor-task.json
```

#### 2.3 Create ECR Repository and Push Image

```bash
# Create ECR repo
aws ecr create-repository --repository-name asculticor-inference

# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com

# Build and tag
docker build -t asculticor-inference ./inference
docker tag asculticor-inference:latest YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/asculticor-inference:latest

# Push
docker push YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/asculticor-inference:latest
```

#### 2.4 Create ECS Service
```bash
aws ecs create-service \
  --cluster asculticor-cluster \
  --service-name asculticor-inference \
  --task-definition asculticor-inference \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxxx],securityGroups=[sg-xxxx],assignPublicIp=ENABLED}"
```

#### 2.5 Create Application Load Balancer
```bash
# Create ALB for HTTP access
aws elbv2 create-load-balancer \
  --name asculticor-alb \
  --subnets subnet-xxxx subnet-yyyy \
  --security-groups sg-xxxx

# Create target group
aws elbv2 create-target-group \
  --name asculticor-tg \
  --protocol HTTP \
  --port 8000 \
  --vpc-id vpc-xxxx \
  --target-type ip

# Create listener
aws elbv2 create-listener \
  --load-balancer-arn arn:aws:elasticloadbalancing:... \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:...
```

### Step 3: IoT Core Rules (Route ESP32 Data to Inference)

Create IoT Rule to forward MQTT messages to your inference service:

**In AWS IoT Console:**
1. Go to **Message Routing** → **Rules**
2. Create Rule:
   - Name: `AscultiCorToInference`
   - SQL: `SELECT * FROM 'org/+/device/+/session/+/meta'`
   - Action: **HTTP** → Your inference service ALB URL
   - Or use **Lambda** → calls inference API

Alternative: Have inference service subscribe directly to IoT Core topics.

---

## Option 2: Simpler Cloud Setup (Railway + HiveMQ)

For quicker deployment without AWS complexity:

### Step 1: HiveMQ Cloud (Free MQTT Broker)

1. Go to [HiveMQ Cloud](https://www.hivemq.com/mqtt-cloud-broker/)
2. Create free account (up to 100 connections)
3. Create cluster
4. Get credentials:
   - Cluster URL: `your-cluster.hivemq.cloud`
   - Port: `8883` (TLS)
5. Create credentials in console

### Step 2: Deploy Inference to Railway

1. Go to [Railway.app](https://railway.app)
2. Connect your GitHub repo
3. Add environment variables:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-key
   MQTT_BROKER=your-cluster.hivemq.cloud
   MQTT_PORT=8883
   MQTT_USERNAME=your-hivemq-username
   MQTT_PASSWORD=your-hivemq-password
   MQTT_USE_TLS=true
   ENABLE_DEMO_MODE=false
   ```
4. Deploy!

Railway gives you a public URL automatically.

### Step 3: Update ESP32

```cpp
// HiveMQ Cloud
const char* mqtt_server = "your-cluster.hivemq.cloud";
const int mqtt_port = 8883;
const char* mqtt_user = "your-username";
const char* mqtt_pass = "your-password";

WiFiClientSecure wifiClient;  // Use TLS
PubSubClient client(wifiClient);

void setup() {
  wifiClient.setInsecure();  // For testing only - use proper cert in production
  client.setServer(mqtt_server, mqtt_port);
}
```

### Step 4: Deploy Frontend to Vercel

1. Push frontend code to GitHub
2. Go to [Vercel](https://vercel.com)
3. Import project
4. Add environment variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```
5. Deploy!

---

## Option 3: Hybrid Setup (Recommended for Testing)

Keep inference local but use cloud MQTT:

```
ESP32 ──> Cloud MQTT ──> Local Computer (Inference) ──> Supabase Cloud
```

### Benefits:
- ✅ ESP32 works from anywhere
- ✅ No need to expose your computer to internet
- ✅ Use [ngrok](https://ngrok.com) to tunnel local inference service

### Setup:

1. **Start local inference:**
```bash
docker-compose up inference
```

2. **Expose with ngrok:**
```bash
ngrok http 8000
# Get public URL: https://abc123.ngrok.io
```

3. **Create webhook in HiveMQ/AWS IoT:**
   - Forward MQTT messages to your ngrok URL

4. **ESP32 connects to cloud MQTT**, inference runs on your laptop

---

## Configuration Comparison

| Setup | ESP32 Location | Server Location | Cost | Complexity |
|-------|----------------|-----------------|------|------------|
| **Local Dev** | Same WiFi as PC | Your PC | Free | Low |
| **Raspberry Pi** | Local WiFi | Local Pi | ~$50 | Low |
| **Railway + HiveMQ** | Anywhere | Cloud | ~$5/mo | Medium |
| **AWS Full** | Anywhere | AWS | ~$20-50/mo | High |

---

## ESP32 Cloud Configuration Template

```cpp
/*
 * AscultiCor ESP32 - Cloud Configuration
 * Works with any MQTT broker
 */

// ============== CONFIGURATION ==============
// Uncomment ONE option:

// Option A: Local Network (Development)
// #define MQTT_BROKER "192.168.1.100"
// #define MQTT_PORT 1883
// #define MQTT_USE_TLS false

// Option B: HiveMQ Cloud
#define MQTT_BROKER "your-cluster.hivemq.cloud"
#define MQTT_PORT 8883
#define MQTT_USE_TLS true
#define MQTT_USER "your-username"
#define MQTT_PASS "your-password"

// Option C: AWS IoT Core
// #define MQTT_BROKER "your-endpoint.iot.us-east-1.amazonaws.com"
// #define MQTT_PORT 8883
// #define MQTT_USE_TLS true
// #define USE_AWS_CERTIFICATES true

// Device Info (from Supabase)
#define ORG_ID "00000000-0000-0000-0000-000000000001"
#define DEVICE_ID "00000000-0000-0000-0000-000000000004"

// WiFi
#define WIFI_SSID "YourWiFi"
#define WIFI_PASS "YourWiFiPassword"

// ============== CODE ==============
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>

WiFiClientSecure secureClient;
WiFiClient plainClient;
PubSubClient* client;

void setup() {
  Serial.begin(115200);
  
  // Connect WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(500);
  Serial.println("WiFi connected");
  
  // Setup MQTT based on TLS requirement
  #if MQTT_USE_TLS
    #ifdef USE_AWS_CERTIFICATES
      // Load certificates for AWS
      secureClient.setCACert(rootCA);
      secureClient.setCertificate(deviceCert);
      secureClient.setPrivateKey(deviceKey);
    #else
      // For HiveMQ/RabbitMQ testing (not recommended for production)
      secureClient.setInsecure();
    #endif
    client = new PubSubClient(secureClient);
  #else
    client = new PubSubClient(plainClient);
  #endif
  
  client->setServer(MQTT_BROKER, MQTT_PORT);
  client->setCallback(mqttCallback);
}

void loop() {
  if (!client->connected()) {
    reconnect();
  }
  client->loop();
  
  // Your data streaming code here
}

void reconnect() {
  while (!client->connected()) {
    Serial.print("Connecting to MQTT...");
    
    String clientId = "ESP32-" + String(DEVICE_ID);
    
    #ifdef MQTT_USER
      bool connected = client->connect(clientId.c_str(), MQTT_USER, MQTT_PASS);
    #else
      bool connected = client->connect(clientId.c_str());
    #endif
    
    if (connected) {
      Serial.println("connected");
    } else {
      Serial.print("failed, rc=");
      Serial.println(client->state());
      delay(5000);
    }
  }
}
```

---

## Security Best Practices

### 1. TLS/SSL Everywhere
- Always use port 8883 with TLS
- Never send data over unencrypted connections
- Use proper certificates (not `setInsecure()` in production)

### 2. Device Authentication
- Use unique certificates per device
- Rotate credentials regularly
- Implement device provisioning workflow

### 3. Network Security
- Use VPC/subnets in AWS
- Security groups: only allow necessary ports
- Enable CloudWatch logging

### 4. Data Privacy
- Encrypt data at rest in Supabase
- Implement data retention policies
- HIPAA/GDPR compliance if needed

---

## Cost Estimates

### Development (Free Tier):
- **HiveMQ Cloud**: Free (up to 100 connections)
- **Railway**: $5/month (or free with limits)
- **Supabase**: Free tier
- **Vercel**: Free tier
- **Total**: ~$0-5/month

### Production:
- **AWS IoT Core**: ~$1 per million messages
- **AWS ECS (Fargate)**: ~$20-50/month
- **Supabase**: $25/month (Pro tier)
- **Vercel**: $20/month (Pro tier)
- **Total**: ~$65-95/month

---

## Monitoring & Alerting

### CloudWatch Alarms (AWS):
```bash
# Create alarm for high error rate
aws cloudwatch put-metric-alarm \
  --alarm-name asculticor-high-errors \
  --alarm-description "High error rate in inference" \
  --metric-name ErrorCount \
  --namespace AscultiCor \
  --statistic Sum \
  --period 300 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1
```

### Uptime Monitoring:
- Use **UptimeRobot** or **Pingdom** to monitor services
- Set up Slack/Email alerts

---

## Summary

**For Testing:** Use Hybrid setup (ngrok + HiveMQ free)
**For Production:** Use AWS IoT Core + ECS
**For Simplicity:** Use Railway + HiveMQ

The ESP32 can work from **anywhere in the world** with internet access, completely independent of your computer!

**Next Steps:**
1. Choose your cloud setup
2. Deploy MQTT broker
3. Update ESP32 firmware
4. Deploy inference service
5. Test from different locations
