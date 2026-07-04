variable "hcloud_token" {
  description = "Hetzner Cloud API token."
  type        = string
  sensitive   = true
}

variable "project" {
  description = "Project name used for resource names and labels."
  type        = string
  default     = "AscultiCor"
}

variable "environment" {
  description = "Environment name."
  type        = string
  default     = "production"
}

variable "server_name" {
  description = "Hetzner server name."
  type        = string
  default     = "AscultiCor-ai-agent-1"
}

variable "location" {
  description = "Hetzner location. Common choices: fsn1, nbg1, hel1."
  type        = string
  default     = "fsn1"
}

variable "os_image" {
  description = "OS image for the server."
  type        = string
  default     = "ubuntu-22.04"
}

variable "server_type" {
  description = "Hetzner server type. cx33 is 4 vCPU, 8 GB RAM, 80 GB disk."
  type        = string
  default     = "cx33"
}

variable "ssh_key_name" {
  description = "Existing Hetzner SSH key name to attach to the server."
  type        = string
  default     = "easytravel-production-ai-agent-key"
}

variable "admin_cidrs" {
  description = "Public admin IP ranges allowed to SSH. Example: [\"203.0.113.10/32\"]."
  type        = list(string)
}

variable "enable_web_ports" {
  description = "Allow public HTTP/HTTPS ingress."
  type        = bool
  default     = true
}

variable "enable_mqtt_tls_port" {
  description = "Allow public MQTT over TLS ingress on TCP 8883."
  type        = bool
  default     = true
}

variable "enable_backups" {
  description = "Enable Hetzner backups for the server."
  type        = bool
  default     = false
}

variable "object_storage_location" {
  description = "Hetzner Object Storage location used for backups."
  type        = string
  default     = "fsn1"

  validation {
    condition     = contains(["fsn1", "nbg1", "hel1"], var.object_storage_location)
    error_message = "Object Storage location must be fsn1, nbg1, or hel1."
  }
}

variable "object_storage_access_key" {
  description = "Hetzner S3 access key created in the Cloud Console."
  type        = string
  sensitive   = true
}

variable "object_storage_secret_key" {
  description = "Hetzner S3 secret key created in the Cloud Console."
  type        = string
  sensitive   = true
}

variable "backup_bucket_name" {
  description = "Globally unique private bucket name for encrypted AscultiCor backups."
  type        = string
  default     = "asculticor-production-backups"

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$", var.backup_bucket_name))
    error_message = "Bucket name must be 3-63 lowercase letters, digits, or hyphens."
  }
}
