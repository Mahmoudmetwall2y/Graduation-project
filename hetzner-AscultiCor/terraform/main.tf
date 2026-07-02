provider "hcloud" {
  token = var.hcloud_token
}

provider "minio" {
  minio_server   = "${var.object_storage_location}.your-objectstorage.com"
  minio_region   = var.object_storage_location
  minio_user     = var.object_storage_access_key
  minio_password = var.object_storage_secret_key
  minio_ssl      = true
}

locals {
  labels = {
    project     = var.project
    environment = var.environment
    role        = "ai-agent-backend"
    managed_by  = "terraform"
  }
}

data "hcloud_ssh_key" "deploy" {
  name = var.ssh_key_name
}

resource "hcloud_firewall" "server" {
  name = "${var.project}-${var.environment}-ai-agent-fw"

  rule {
    direction   = "in"
    protocol    = "tcp"
    port        = "22"
    source_ips  = var.admin_cidrs
    description = "SSH from admin IPs only"
  }

  dynamic "rule" {
    for_each = var.enable_web_ports ? ["80", "443"] : []

    content {
      direction   = "in"
      protocol    = "tcp"
      port        = rule.value
      source_ips  = ["0.0.0.0/0", "::/0"]
      description = "Public web traffic"
    }
  }

  dynamic "rule" {
    for_each = var.enable_mqtt_tls_port ? ["8883"] : []

    content {
      direction   = "in"
      protocol    = "tcp"
      port        = rule.value
      source_ips  = ["0.0.0.0/0", "::/0"]
      description = "Authenticated MQTT over TLS"
    }
  }
}

resource "hcloud_server" "ai_agent" {
  name        = var.server_name
  server_type = var.server_type
  image       = var.os_image
  location    = var.location
  ssh_keys    = [data.hcloud_ssh_key.deploy.id]
  backups     = var.enable_backups
  labels      = local.labels

  firewall_ids = [
    hcloud_firewall.server.id
  ]

  public_net {
    ipv4_enabled = true
    ipv6_enabled = true
  }

  user_data = <<-CLOUD_INIT
    #cloud-config
    package_update: true
    package_upgrade: true
    packages:
      - ca-certificates
      - curl
      - fail2ban
      - git
      - htop
      - jq
      - unzip
      - vim
      - wget
    timezone: UTC
    runcmd:
      - systemctl enable --now fail2ban
      - sed -i 's/^#\\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
      - sed -i 's/^#\\?PermitRootLogin .*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
      - systemctl restart ssh
  CLOUD_INIT
}

# S3 credentials are created in Hetzner Console because the hcloud API does
# not expose credential creation. The bucket stays private.
resource "minio_s3_bucket" "backups" {
  bucket         = var.backup_bucket_name
  acl            = "private"
  object_locking = false
}
