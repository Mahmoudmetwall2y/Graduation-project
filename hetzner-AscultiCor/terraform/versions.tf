terraform {
  required_version = ">= 1.6.0"

  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.50"
    }

    minio = {
      source  = "aminueza/minio"
      version = "3.33.1"
    }
  }
}
