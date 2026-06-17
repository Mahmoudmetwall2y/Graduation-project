#!/usr/bin/env python3
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    import serial
except Exception:
    serial = None


HOST = os.environ.get("FLASHER_HOST", "0.0.0.0")
PORT = int(os.environ.get("FLASHER_PORT", "8091"))
OUTPUT_DIR = os.environ.get("OUTPUT_DIR", "/out")
BAUD = os.environ.get("FLASH_BAUD", "460800")
FLASH_TIMEOUT_SEC = int(os.environ.get("FLASH_TIMEOUT_SEC", "240"))
PROVISION_READY_TIMEOUT_SEC = int(os.environ.get("PROVISION_READY_TIMEOUT_SEC", "35"))
VERSION = os.environ.get("VERSION", "3.0.0")


def _find_esptool_command():
    """Return the esptool command prefix.

    Priority:
    1. ESPTOOL env var (explicit path or command available on PATH)
    2. arduino-cli cached copy under /root/.arduino15  (builder image fallback)
    3. pip-installed Python module via 'python3 -m esptool'
    4. 'esptool' bare name — final fallback for legacy images
    """
    env_val = os.environ.get("ESPTOOL", "")
    if env_val and os.path.isfile(env_val):
        return [env_val]
    if env_val:
        resolved = shutil.which(env_val)
        if resolved:
            return [resolved]

    # Fallback: search the arduino15 packages directory (builder image)
    for pattern in (
        "/root/.arduino15/packages/esp32/tools/esptool_py/*/esptool",
        "/root/.arduino15/packages/esp32/tools/esptool_py/*/esptool.py",
    ):
        matches = sorted(glob.glob(pattern))
        if matches:
            print(f"[firmware-flasher] esptool found via glob: {matches[-1]}", flush=True)
            return [matches[-1]]

    try:
        import esptool  # noqa: F401
        print("[firmware-flasher] esptool found as Python module", flush=True)
        return [sys.executable, "-m", "esptool"]
    except Exception:
        pass

    print("[firmware-flasher] WARNING: esptool not found; falling back to bare 'esptool' on PATH", flush=True)
    return ["esptool"]


ESPTOOL_COMMAND = _find_esptool_command()

FLASH_LOCK = threading.Lock()


def firmware_paths():
    return {
        "bootloader": os.path.join(OUTPUT_DIR, "bootloader.bin"),
        "partitions": os.path.join(OUTPUT_DIR, "partitions.bin"),
        "app": os.path.join(OUTPUT_DIR, f"asculticor_esp32_v{VERSION}.bin"),
    }


def existing_ports():
    ports = sorted(glob.glob("/dev/ttyUSB*") + glob.glob("/dev/ttyACM*"))
    return [port for port in ports if os.path.exists(port)]


def run_command(command, timeout=30):
    started = time.time()
    result = subprocess.run(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=timeout,
    )
    return {
        "command": " ".join(command),
        "returncode": result.returncode,
        "durationSec": round(time.time() - started, 2),
        "output": result.stdout,
    }


def release_reset_lines(port):
    if serial is None:
        return None
    try:
        with serial.Serial(port, 115200, timeout=0.1) as ser:
            ser.dtr = False
            ser.rts = False
        return "released"
    except Exception as exc:
        return f"release_failed: {exc}"


def detect_chip(port):
    # Run without --no-stub: stub mode is faster, more reliable, and provides
    # accurate chip identification. --no-stub caused flash hash verification
    # to be skipped, making success detection unreliable.
    command = [
        *ESPTOOL_COMMAND,
        "--chip",
        "esp32",
        "--port",
        port,
        "--baud",
        BAUD,
        "chip_id",
    ]
    result = run_command(command, timeout=30)
    output = result["output"]
    result["mac"] = None
    match = re.search(r"MAC:\s*([0-9a-fA-F:]{17})", output)
    if match:
        result["mac"] = match.group(1).lower()
    return result


def choose_port(requested_port=None):
    candidates = [requested_port] if requested_port else existing_ports()
    attempts = []
    for port in candidates:
        if not port or not os.path.exists(port):
            attempts.append({
                "port": port,
                "returncode": 1,
                "output": f"Serial port {port or '(empty)'} does not exist.",
            })
            continue
        result = detect_chip(port)
        result["port"] = port
        attempts.append(result)
        if result["returncode"] == 0:
            return port, result.get("mac"), attempts
    return None, None, attempts


def flash_firmware(requested_port=None):
    paths = firmware_paths()
    missing = [path for path in paths.values() if not os.path.exists(path)]
    if missing:
        return {
            "ok": False,
            "error": "Firmware binaries are missing.",
            "missing": missing,
            "ports": existing_ports(),
        }

    selected_port, mac, attempts = choose_port(requested_port)
    if not selected_port:
        return {
            "ok": False,
            "error": "No ESP32 bootloader was detected on the available serial ports.",
            "ports": existing_ports(),
            "attempts": attempts,
        }

    command = [
        *ESPTOOL_COMMAND,
        "--chip",
        "esp32",
        "--port",
        selected_port,
        "--baud",
        BAUD,
        "write_flash",
        "-z",
        "--flash_mode",
        "dio",
        "--flash_freq",
        "40m",
        "--flash_size",
        "detect",
        "0x1000",
        paths["bootloader"],
        "0x8000",
        paths["partitions"],
        "0x10000",
        paths["app"],
    ]
    flash_result = run_command(command, timeout=FLASH_TIMEOUT_SEC)
    reset_release = release_reset_lines(selected_port)

    # Success = returncode 0 from esptool.
    # In stub mode (default, no --no-stub), esptool also prints
    # "Hash of data verified" for each segment — we check it as a bonus.
    ok = flash_result["returncode"] == 0
    return {
        "ok": ok,
        "port": selected_port,
        "mac": mac,
        "baud": BAUD,
        "attempts": attempts,
        "flash": flash_result,
        "resetRelease": reset_release,
        "hashVerified": "Hash of data verified" in flash_result.get("output", ""),
        "error": None if ok else "Firmware flashing failed. Check the flash log for details.",
    }


def read_serial_lines(ser, deadline):
    lines = []
    buffer = b""
    while time.time() < deadline:
        chunk = ser.read(256)
        if not chunk:
            continue
        buffer += chunk
        while b"\n" in buffer:
            raw_line, buffer = buffer.split(b"\n", 1)
            line = raw_line.decode("utf-8", errors="replace").strip()
            if line:
                lines.append(line)
    tail = buffer.decode("utf-8", errors="replace").strip()
    if tail:
        lines.append(tail)
    return lines


def wait_for_firmware_ready(ser):
    lines = []
    deadline = time.time() + PROVISION_READY_TIMEOUT_SEC
    buffer = b""
    ready_marker = "[SETUP] OK. Entering main loop"

    while time.time() < deadline:
        chunk = ser.read(256)
        if not chunk:
            continue
        buffer += chunk
        while b"\n" in buffer:
            raw_line, buffer = buffer.split(b"\n", 1)
            line = raw_line.decode("utf-8", errors="replace").strip()
            if not line:
                continue
            lines.append(line)
            if ready_marker in line:
                # The serial command loop only runs after setup() completes.
                # Waiting for this marker avoids sending provisioning while
                # Wi-Fi/bootstrap setup is still blocking.
                time.sleep(1.0)
                lines.extend(read_serial_lines(ser, time.time() + 1.0))
                return True, lines

    tail = buffer.decode("utf-8", errors="replace").strip()
    if tail:
        lines.append(tail)
    return False, lines


def try_provision_port(port, payload):
    if serial is None:
        return {
            "port": port,
            "ok": False,
            "error": "python3-serial is not available in the firmware flasher container.",
            "lines": [],
        }

    commands = [
        payload,
        {"cmd": "status"},
        {"cmd": "reboot"},
    ]
    lines = []
    saved = False
    firmware_seen = False

    try:
        with serial.Serial(port, 115200, timeout=0.15, write_timeout=3) as ser:
            ser.dtr = False
            ser.rts = False
            time.sleep(0.4)
            ser.reset_input_buffer()
            ready, boot_lines = wait_for_firmware_ready(ser)
            lines.extend(boot_lines)
            if not ready:
                return {
                    "port": port,
                    "ok": False,
                    "firmwareSeen": any("SONOCARDIA" in line or "AscultiCor" in line for line in lines),
                    "lines": lines[-120:],
                    "error": "ESP32 firmware did not become ready for provisioning before timeout.",
                }
            for command in commands:
                ser.write((json.dumps(command, separators=(",", ":")) + "\n").encode("utf-8"))
                ser.flush()
                lines.extend(read_serial_lines(ser, time.time() + (3.0 if command.get("cmd") != "reboot" else 2.5)))

        for line in lines:
            if "firmware_version" in line or "AscultiCor" in line or "SONOCARDIA" in line or "saved_to_nvs" in line:
                firmware_seen = True
            if line.startswith("{"):
                try:
                    parsed = json.loads(line)
                except Exception:
                    continue
                if parsed.get("firmware_version"):
                    firmware_seen = True
                if parsed.get("status") == "ok" and parsed.get("stage") == "saved_to_nvs":
                    saved = True

        return {
            "port": port,
            "ok": saved,
            "firmwareSeen": firmware_seen,
            "lines": lines[-120:],
            "error": None if saved else "The ESP32 did not confirm that provisioning was saved.",
        }
    except Exception as exc:
        return {
            "port": port,
            "ok": False,
            "error": str(exc),
            "lines": lines[-120:],
        }


def provision_device(payload, requested_port=None):
    if not isinstance(payload, dict):
        return {"ok": False, "error": "Provisioning payload must be a JSON object."}
    if payload.get("cmd") != "provision":
        return {"ok": False, "error": "Provisioning payload must include cmd=provision."}

    candidates = [requested_port] if requested_port else existing_ports()
    attempts = []
    for port in candidates:
        if not port or not os.path.exists(port):
            attempts.append({"port": port, "ok": False, "error": "Serial port does not exist.", "lines": []})
            continue
        result = try_provision_port(port, payload)
        attempts.append(result)
        if result["ok"]:
            return {
                "ok": True,
                "port": port,
                "attempts": attempts,
                "lines": result["lines"],
            }

    return {
        "ok": False,
        "error": "No ESP32 confirmed provisioning over USB serial.",
        "ports": existing_ports(),
        "attempts": attempts,
    }


def json_response(handler, status, body):
    payload = json.dumps(body).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(payload)))
    handler.end_headers()
    handler.wfile.write(payload)


class FlasherHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"[firmware-flasher] {self.address_string()} - {format % args}", flush=True)

    def do_GET(self):
        if self.path != "/health":
            json_response(self, 404, {"ok": False, "error": "Not found"})
            return
        paths = firmware_paths()
        json_response(self, 200, {
            "ok": True,
            "ports": existing_ports(),
            "firmware": {key: os.path.exists(path) for key, path in paths.items()},
            "busy": FLASH_LOCK.locked(),
        })

    def do_POST(self):
        if self.path not in ("/flash", "/provision"):
            json_response(self, 404, {"ok": False, "error": "Not found"})
            return

        length = int(self.headers.get("Content-Length") or "0")
        body = {}
        if length:
            try:
                body = json.loads(self.rfile.read(length).decode("utf-8"))
            except Exception:
                json_response(self, 400, {"ok": False, "error": "Invalid JSON body."})
                return

        if not FLASH_LOCK.acquire(blocking=False):
            json_response(self, 409, {"ok": False, "error": "A firmware operation is already running."})
            return

        try:
            if self.path == "/flash":
                result = flash_firmware(body.get("port"))
            else:
                result = provision_device(body.get("payload"), body.get("port"))
            json_response(self, 200 if result["ok"] else 500, result)
        except subprocess.TimeoutExpired as exc:
            json_response(self, 504, {
                "ok": False,
                "error": f"Firmware flashing timed out after {exc.timeout} seconds.",
                "output": exc.stdout,
            })
        except Exception as exc:
            json_response(self, 500, {"ok": False, "error": str(exc)})
        finally:
            FLASH_LOCK.release()


if __name__ == "__main__":
    print(f"[firmware-flasher] listening on {HOST}:{PORT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), FlasherHandler).serve_forever()
