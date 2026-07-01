output "server_ipv4" {
  description = "Public IPv4 address for the AI agent backend server."
  value       = hcloud_server.ai_agent.ipv4_address
}

output "server_ipv6" {
  description = "Public IPv6 address for the AI agent backend server."
  value       = hcloud_server.ai_agent.ipv6_address
}

output "server_type" {
  description = "Selected Hetzner server type."
  value       = var.server_type
}

output "ssh_command" {
  description = "SSH command for the server."
  value       = "ssh root@${hcloud_server.ai_agent.ipv4_address}"
}

output "backup_bucket_name" {
  description = "Private Object Storage bucket receiving encrypted backups."
  value       = minio_s3_bucket.backups.bucket
}

output "backup_s3_endpoint" {
  description = "S3 endpoint used by restic on the production VM."
  value       = "https://${var.object_storage_location}.your-objectstorage.com"
}
