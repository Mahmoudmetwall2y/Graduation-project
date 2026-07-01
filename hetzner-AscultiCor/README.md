# AscultiCor Hetzner Production Infrastructure

Terraform for the AscultiCor production server, firewall, and private Object
Storage backup bucket.

## Default Server

The default `cx33` server provides 4 shared vCPU, 8 GB RAM, and 80 GB disk.
Use a dedicated-vCPU type if sustained inference load outgrows shared compute.

## Usage

```bash
cd hetzner-AscultiCor/terraform
cp terraform.tfvars.example terraform.tfvars
```

Set the Cloud API token, public admin CIDRs, SSH key name, and S3 credentials.
Generate Object Storage keys in Hetzner Console before applying; Hetzner does
not expose S3 credential creation through the Cloud API.

```bash
terraform init
terraform fmt -check
terraform validate
terraform plan -out=production.tfplan
terraform apply production.tfplan
```

Keep `terraform.tfvars`, plans, state files, and `.terraform` local. The
included `.gitignore` prevents them from being committed.

## Outputs

- `server_ipv4`: public server address
- `server_ipv6`: public IPv6 address
- `ssh_command`: connection command
- `server_type`: selected server type
- `backup_bucket_name`: private backup bucket
- `backup_s3_endpoint`: Hetzner S3 endpoint used by restic

## Encrypted Off-Server Backups

The bucket is private. The production VM uses restic so backup contents are
encrypted before upload. Store S3 credentials in
`/root/.config/asculticor-restic.env` with mode `0600`, and store the restic
repository password separately from the VM. Install `scripts/server-backup.sh`
as `/usr/local/sbin/asculticor-backup`; the existing systemd timer invokes it
nightly and retains 14 daily, 8 weekly, and 12 monthly snapshots.
