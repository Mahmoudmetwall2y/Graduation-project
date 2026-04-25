#!/usr/bin/env python3
"""Generate Mosquitto passwd and ACL files from Supabase device metadata."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import shutil
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


PASSWD_PATH = Path("/mosquitto/config/passwd")
ACL_PATH = Path("/mosquitto/config/acl")
HASH_ITERATIONS = 101
HASH_BYTES = 64


def deterministic_salt(label: str) -> bytes:
    return hashlib.sha256(label.encode("utf-8")).digest()[:12]


def create_mosquitto_hash(password: str, salt: bytes) -> str:
    derived_key = hashlib.pbkdf2_hmac(
        "sha512",
        password.encode("utf-8"),
        salt,
        HASH_ITERATIONS,
        HASH_BYTES,
    )
    salt_b64 = base64.b64encode(salt).decode("ascii").rstrip("=")
    hash_b64 = base64.b64encode(derived_key).decode("ascii")
    return f"$7${HASH_ITERATIONS}${salt_b64}${hash_b64}"


def fetch_device_rows(supabase_url: str, service_role_key: str):
    query = urllib.parse.urlencode(
        {
            "select": "id,org_id,mqtt_username,mqtt_password_hash",
            "mqtt_username": "not.is.null",
            "mqtt_password_hash": "not.is.null",
            "order": "mqtt_username.asc",
        }
    )
    request = urllib.request.Request(
        f"{supabase_url.rstrip('/')}/rest/v1/devices?{query}",
        headers={
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Accept": "application/json",
        },
    )

    with urllib.request.urlopen(request, timeout=10) as response:
        payload = response.read().decode("utf-8")
        rows = json.loads(payload)
        return [
            row for row in rows
            if row.get("id") and row.get("org_id") and row.get("mqtt_username") and row.get("mqtt_password_hash")
        ]


def build_passwd_content(admin_username: str, admin_password: str, device_rows) -> str:
    lines = [
        f"{admin_username}:{create_mosquitto_hash(admin_password, deterministic_salt(f'admin:{admin_username}'))}"
    ]
    for row in device_rows:
        lines.append(f"{row['mqtt_username']}:{row['mqtt_password_hash']}")
    return "\n".join(lines) + "\n"


def build_acl_content(admin_username: str, device_rows) -> str:
    sections = [
        "# Managed by sync_device_credentials.py",
        f"user {admin_username}",
        "topic readwrite asculticor/#",
        "topic readwrite org/#",
        "topic read $SYS/#",
    ]

    for row in device_rows:
        sections.extend(
            [
                "",
                f"user {row['mqtt_username']}",
                f"topic readwrite org/{row['org_id']}/device/{row['id']}/#",
            ]
        )

    sections.append("")
    return "\n".join(sections)


def write_if_changed(path: Path, content: str) -> bool:
    current = path.read_text(encoding="utf-8") if path.exists() else None
    if current != content:
        path.write_text(content, encoding="utf-8")
    path.chmod(0o640)
    try:
        shutil.chown(path, user="mosquitto", group="mosquitto")
    except Exception:
        pass
    return current != content


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--status-file", default="")
    args = parser.parse_args()

    admin_username = os.environ.get("MQTT_USERNAME")
    admin_password = os.environ.get("MQTT_PASSWORD")
    supabase_url = os.environ.get("SUPABASE_URL")
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not admin_username or not admin_password:
        print("MQTT_USERNAME and MQTT_PASSWORD are required.", file=sys.stderr)
        return 1

    device_rows = []
    if supabase_url and service_role_key:
        try:
            device_rows = fetch_device_rows(supabase_url, service_role_key)
            print(f"[mqtt-sync] Loaded {len(device_rows)} device credentials from Supabase")
        except urllib.error.HTTPError as exc:
            details = exc.read().decode("utf-8", errors="ignore")
            if "mqtt_username" in details or "mqtt_password_hash" in details:
                print("[mqtt-sync] MQTT credential columns are not available yet, running admin-only config")
            else:
                print(f"[mqtt-sync] Failed to fetch device credentials, keeping admin-only config: {exc} {details}", file=sys.stderr)
        except (urllib.error.URLError, json.JSONDecodeError) as exc:
            print(f"[mqtt-sync] Failed to fetch device credentials, keeping admin-only config: {exc}", file=sys.stderr)
    else:
        print("[mqtt-sync] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing, keeping admin-only config", file=sys.stderr)

    passwd_content = build_passwd_content(admin_username, admin_password, device_rows)
    acl_content = build_acl_content(admin_username, device_rows)

    changed = False
    changed |= write_if_changed(PASSWD_PATH, passwd_content)
    changed |= write_if_changed(ACL_PATH, acl_content)

    if args.status_file:
        Path(args.status_file).write_text("changed" if changed else "unchanged", encoding="utf-8")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
