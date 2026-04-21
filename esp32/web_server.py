# ============================================================
# SONOCARDIA - Captive Portal Web Server
#
# Lightweight HTTP server that serves a configuration page
# when the ESP32 is in AP mode.
#
# Form fields:
#   - Device Name
#   - Operating Mode (websocket / auto)
#   - Wi-Fi SSID & Password
#   - ECG Sample Rate (Hz)
#   - PCG Sample Rate (Hz)
#   - ECG Record Duration (seconds)
#   - PCG Record Duration (seconds)
#   - Auto-Recording Cycle Interval (seconds)
#   - Flask Server IP & Port
#
# On submit → writes config.json → machine.reset()
# ============================================================

import socket
import json
import machine
import gc
import time
import ubinascii
import network
from config import (
    DEVICE_NAME, MODE,
    WIFI_SSID, WIFI_PASSWORD,
    ECG_SAMPLE_RATE, MIC_SAMPLE_RATE,
    ECG_RECORD_DURATION, MIC_RECORD_DURATION,
    CYCLE_DELAY_SECONDS,
    SERVER_IP, SERVER_PORT,
    DEBUG,
)

# ── Load existing saved config (if any) for pre-filling form ──
_saved = {}
try:
    with open("config.json", "r") as _f:
        _saved = json.load(_f)
except Exception:
    pass

# Defaults for form fields (saved values override config.py constants)
_DEF_NAME       = _saved.get("device_name",      DEVICE_NAME)
_DEF_MODE       = _saved.get("mode",             MODE)
_DEF_SSID       = _saved.get("ssid",             WIFI_SSID)
_DEF_PASS       = _saved.get("password",         WIFI_PASSWORD)
_DEF_ECG_SR     = _saved.get("sample_rate",      ECG_SAMPLE_RATE)
_DEF_PCG_SR     = _saved.get("pcg_sample_rate",  MIC_SAMPLE_RATE)
_DEF_ECG_DUR    = _saved.get("ecg_duration",     ECG_RECORD_DURATION)
_DEF_PCG_DUR    = _saved.get("record_duration",  MIC_RECORD_DURATION)
_DEF_CYCLE      = _saved.get("cycle_delay",      CYCLE_DELAY_SECONDS)
_DEF_SRV_IP     = _saved.get("server_ip",        SERVER_IP)
_DEF_SRV_PORT   = _saved.get("server_port",      SERVER_PORT)
_DEF_AUTH_USER  = _saved.get("auth_user",        "admin")
_DEF_AUTH_PASS  = _saved.get("auth_pass",        "admin")


# ──────────────────────────────────────────────────────────────
# HTML template (minimal, fits in ESP32 RAM)
# ──────────────────────────────────────────────────────────────
_HTML_PAGE = """\
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SONOCARDIA Setup</title>
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;
     display:flex;justify-content:center;padding:24px}}
.card{{background:#1e293b;border-radius:16px;padding:32px;width:100%%;
      max-width:460px;box-shadow:0 8px 32px rgba(0,0,0,.4)}}
h1{{text-align:center;font-size:1.5rem;margin-bottom:4px;color:#38bdf8}}
.sub{{text-align:center;font-size:.85rem;color:#94a3b8;margin-bottom:24px}}
label{{display:block;font-size:.8rem;color:#94a3b8;margin:12px 0 4px;
      text-transform:uppercase;letter-spacing:.5px}}
input,select{{width:100%%;padding:10px 12px;border:1px solid #334155;
      border-radius:8px;background:#0f172a;color:#f1f5f9;font-size:1rem}}
input:focus,select:focus{{outline:none;border-color:#38bdf8}}
select option{{background:#0f172a;color:#f1f5f9}}
.row{{display:flex;gap:12px}}
.row>div{{flex:1}}
button{{width:100%%;padding:12px;margin-top:24px;border:none;
       border-radius:8px;background:#0ea5e9;color:#fff;font-size:1rem;
       font-weight:600;cursor:pointer}}
button:hover{{background:#0284c7}}
.note{{text-align:center;font-size:.75rem;color:#64748b;margin-top:16px}}
hr{{border:none;border-top:1px solid #334155;margin:16px 0}}
.section{{font-size:.7rem;color:#38bdf8;text-transform:uppercase;
         letter-spacing:1px;margin:20px 0 4px}}
</style>
</head>
<body>
<div class="card">
  <h1>&#x1F49B; SONOCARDIA</h1>
  <p class="sub">Device Configuration</p>
  <form method="POST" action="/save">

    <p class="section">&#x2699; General</p>
    <label>Device Name</label>
    <input name="device_name" value="{device_name}" maxlength="20" required>
    <label>Operating Mode</label>
    <select name="mode">
      <option value="websocket" {sel_ws}>WebSocket (Flutter App)</option>
      <option value="auto" {sel_auto}>Auto (Flask AI Pipeline)</option>
    </select>

    <hr>
    <p class="section">&#x1F4F6; Wi-Fi</p>
    <label>Wi-Fi SSID</label>
    <input name="ssid" value="{ssid}" required>
    <label>Wi-Fi Password</label>
    <input name="password" type="password" value="{password}" required>

    <hr>
    <p class="section">&#x1F4C8; Sampling</p>
        <label>ECG Rate (Hz)</label>
        <input name="sample_rate" type="number" value="{ecg_sr}" max="1000">
        <label>PCG Rate (Hz)</label>
        <input name="pcg_sample_rate" type="number" value="{pcg_sr}" max="8000">

    <hr>
    <p class="section">&#x23F1; Recording</p>
    <div class="row">
      <div>
        <label>ECG Duration (s)</label>
        <input name="ecg_duration" type="number" value="{ecg_dur}" min="1" max="60">
      </div>
      <div>
        <label>PCG Duration (s)</label>
        <input name="record_duration" type="number" value="{pcg_dur}" min="1" max="60">
      </div>
    </div>
    <label>Auto-Cycle Interval (seconds)</label>
    <input name="cycle_delay" type="number" value="{cycle_delay}" min="5" max="600">

    <hr>
    <p class="section">&#x1F5A5; Flask Server (Auto mode)</p>
    <div class="row">
      <div style="flex:2">
        <label>Server IP</label>
        <input name="server_ip" value="{server_ip}">
      </div>
      <div>
        <label>Port</label>
        <input name="server_port" type="number" value="{server_port}" min="1" max="65535">
      </div>
    </div>

    <hr>
    <p class="section">&#x1F512; Portal Login Credentials</p>
    <label>Username</label>
    <input name="auth_user" value="{auth_user}" maxlength="20" required>
    <label>Password</label>
    <input name="auth_pass" type="password" value="{auth_pass}" maxlength="20" required>
    <hr>

    <p style="text-align:center;margin-top:24px">
      <button type="submit" style="width:auto;padding:12px 40px;display:inline-block">Save &amp; Reboot</button>
    </p>
  </form>
  <p class="note">The device will reboot after saving.<br>
  Reconnect to your Wi-Fi network afterwards.</p>
</div>
</body>
</html>
"""

_HTML_SUCCESS = """\
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Saved!</title>
<style>
body{{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;
     display:flex;justify-content:center;align-items:center;height:100vh}}
.card{{background:#1e293b;border-radius:16px;padding:40px;text-align:center;
      max-width:360px;box-shadow:0 8px 32px rgba(0,0,0,.4)}}
h1{{color:#22c55e;margin-bottom:12px}}
p{{color:#94a3b8;font-size:.9rem}}
</style>
</head>
<body>
<div class="card">
  <h1>&#x2705; Saved!</h1>
  <p>Configuration saved successfully.<br>
  The device is rebooting now&hellip;<br><br>
  Connect to your Wi-Fi network and open the app.</p>
</div>
</body>
</html>
"""


# ──────────────────────────────────────────────────────────────
# URL-decode helper (MicroPython has no urllib)
# ──────────────────────────────────────────────────────────────
def _url_decode(s):
    """Decode a percent-encoded & plus-encoded form string."""
    s = s.replace("+", " ")
    parts = s.split("%")
    decoded = [parts[0]]
    for p in parts[1:]:
        try:
            decoded.append(chr(int(p[:2], 16)) + p[2:])
        except ValueError:
            decoded.append("%" + p)
    return "".join(decoded)


def _parse_form(body):
    """Parse application/x-www-form-urlencoded body → dict."""
    params = {}
    for pair in body.split("&"):
        if "=" in pair:
            k, v = pair.split("=", 1)
            params[_url_decode(k)] = _url_decode(v)
    return params


# ──────────────────────────────────────────────────────────────
# Captive Portal Server
# ──────────────────────────────────────────────────────────────
class CaptivePortalServer:
    """
    Minimal HTTP server for the SONOCARDIA captive portal.

    • GET  /          → serve config form
    • POST /save      → parse form, write config.json, reboot
    • GET  (anything) → redirect to /   (Android/iOS captive portal)
    """

    def __init__(self, port=80):
        self._port = port
        self._sock = None
        self._dns_sock = None
        self._portal_ip = "192.168.4.1"
        self._gc_counter = 0

    def run(self):
        """Serve forever (blocks). Ends with machine.reset() on save."""
        # Try to use the AP interface IP if available.
        try:
            ap = network.WLAN(network.AP_IF)
            if ap.active():
                self._portal_ip = ap.ifconfig()[0]
        except Exception:
            pass

        # DNS catch-all: resolve every hostname to portal IP.
        try:
            self._dns_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            self._dns_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self._dns_sock.bind(("0.0.0.0", 53))
            self._dns_sock.settimeout(0)
        except Exception as e:
            self._dns_sock = None
            if DEBUG:
                print(f"[Portal] DNS bind failed: {e}")

        # HTTP on port 80 — the main portal server.
        addr = socket.getaddrinfo("0.0.0.0", self._port)[0][-1]
        self._sock = socket.socket()
        self._sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._sock.bind(addr)
        self._sock.listen(5)
        self._sock.settimeout(0)          # non-blocking accept

        # Do NOT listen on port 443.  With nothing bound on 443 the
        # lwIP stack inside ESP32 sends an immediate TCP RST.  Android /
        # MIUI sees "connection refused" on HTTPS and (eventually) falls
        # back to the HTTP probe on port 80.

        print(f"[Portal] HTTP server on port {self._port}")
        if self._dns_sock:
            print(f"[Portal] DNS catch-all active on {self._portal_ip}:53")
        else:
            print("[Portal] DNS catch-all disabled")
        print(f"[Portal] Port 443 intentionally unbound (RST on HTTPS)")
        print(f"[Portal] Connect to AP 'SONOCARDIA_SETUP' and open http://{self._portal_ip}")

        loop_count = 0
        while True:
            # ── 1. Drain ALL pending DNS queries (non-blocking) ──
            if self._dns_sock:
                for _ in range(10):
                    if not self._serve_dns_one():
                        break

            # ── 2. Try to accept ONE HTTP client (non-blocking) ──
            cl = None
            try:
                cl, remote = self._sock.accept()
            except OSError:
                # No pending client — normal for non-blocking socket
                cl = None

            if cl:
                try:
                    cl.settimeout(5)
                    request = cl.recv(2048).decode("utf-8")

                    if request:
                        method, raw_path = self._parse_request_line(request)
                        path = self._normalize_path(raw_path)

                        if DEBUG:
                            host = ""
                            for ln in request.split("\r\n"):
                                if ln.lower().startswith("host:"):
                                    host = ln.split(":", 1)[1].strip()
                                    break
                            print(f"[Portal][HTTP] {method} {raw_path} Host={host}")

                        if method == "GET":
                            if self._is_form_path(path):
                                if not self._check_auth(request):
                                    self._send_401(cl)
                                else:
                                    self._serve_form(cl)
                            elif self._is_captive_probe_path(path):
                                self._handle_captive_probe(cl, path)
                            else:
                                self._send_redirect(cl)
                        elif method == "HEAD":
                            self._send_redirect(cl)
                        elif method == "POST" and path.startswith("/save"):
                            if not self._check_auth(request):
                                self._send_401(cl)
                            else:
                                body = self._extract_body(request)
                                self._handle_save(cl, body)
                        else:
                            self._send_redirect(cl)
                except Exception as e:
                    if DEBUG:
                        print(f"[Portal] HTTP error: {e}")
                finally:
                    try:
                        cl.close()
                    except Exception:
                        pass

            # ── 3. Housekeeping ──
            loop_count += 1
            if loop_count >= 50:
                gc.collect()
                loop_count = 0

            # Small sleep to prevent a 100 % CPU tight-loop
            time.sleep_ms(5)

    # ── HTTP Basic Auth ──────────────────────────────────────

    @staticmethod
    def _check_auth(request):
        """Return True if the request has a valid Basic Auth header."""
        expected = ubinascii.b2a_base64(
            f"{_DEF_AUTH_USER}:{_DEF_AUTH_PASS}".encode()
        ).decode().strip()
        for ln in request.split("\r\n"):
            if ln.lower().startswith("authorization:"):
                value = ln.split(":", 1)[1].strip()
                # "Basic dXNlcjpwYXNz"
                if value.startswith("Basic "):
                    token = value[6:].strip()
                    return token == expected
        return False

    @staticmethod
    def _send_401(cl):
        """Send 401 Unauthorized with WWW-Authenticate header."""
        body = (
            "<!doctype html><html><head><meta charset='utf-8'>"
            "<title>Login Required</title></head>"
            "<body style='font-family:sans-serif;text-align:center;padding:40px'>"
            "<h2>Authentication Required</h2>"
            "<p>Enter the portal username and password.</p>"
            "</body></html>"
        )
        resp = (
            "HTTP/1.1 401 Unauthorized\r\n"
            "WWW-Authenticate: Basic realm=\"SONOCARDIA Setup\"\r\n"
            "Content-Type: text/html; charset=utf-8\r\n"
            f"Content-Length: {len(body)}\r\n"
            "Cache-Control: no-store\r\n"
            "Connection: close\r\n\r\n"
            + body
        )
        cl.send(resp)

    def _serve_dns_one(self):
        """Handle one UDP DNS query. Returns True if a query was handled."""
        try:
            data, addr = self._dns_sock.recvfrom(512)
        except OSError:
            return False

        # Minimal DNS parser for one-question query.
        if len(data) < 12:
            return False
        qdcount = data[4:6]
        if qdcount == b"\x00\x00":
            return False

        idx = 12
        while idx < len(data) and data[idx] != 0:
            idx += data[idx] + 1
        if idx + 5 > len(data):
            return False

        # Extract requested host for debug logging.
        labels = []
        qidx = 12
        while qidx < len(data):
            ln = data[qidx]
            if ln == 0:
                break
            qidx += 1
            if qidx + ln > len(data):
                break
            try:
                labels.append(data[qidx:qidx + ln].decode("utf-8"))
            except Exception:
                labels.append("?")
            qidx += ln
        qname = ".".join(labels) if labels else "<unknown>"

        question_end = idx + 5  # 0x00 + qtype(2) + qclass(2)
        question = data[12:question_end]

        try:
            ip_bytes = bytes(int(p) & 0xFF for p in self._portal_ip.split("."))
            if len(ip_bytes) != 4:
                ip_bytes = b"\xc0\xa8\x04\x01"  # 192.168.4.1 fallback
        except Exception:
            ip_bytes = b"\xc0\xa8\x04\x01"

        # Standard authoritative response.
        response = (
            data[0:2] +              # Transaction ID
            b"\x85\x80" +          # Flags: response, AA=1, RD, RA
            qdcount +                # QDCOUNT
            b"\x00\x01" +          # ANCOUNT
            b"\x00\x00" +          # NSCOUNT
            b"\x00\x00" +          # ARCOUNT
            question +               # Original question
            b"\xc0\x0c" +          # Name pointer to offset 12
            b"\x00\x01" +          # TYPE A
            b"\x00\x01" +          # CLASS IN
            b"\x00\x00\x00\x04" +  # TTL 4s (force re-probe)
            b"\x00\x04" +          # RDLENGTH
            ip_bytes
        )

        try:
            self._dns_sock.sendto(response, addr)
            if DEBUG:
                src_ip = addr[0] if addr else "?"
                src_port = addr[1] if addr and len(addr) > 1 else "?"
                print(f"[Portal][DNS] {src_ip}:{src_port} q={qname} -> {self._portal_ip}")
        except Exception:
            pass
        return True

    # ── request parsing ──────────────────────────────────────
    @staticmethod
    def _is_form_path(path):
        return path == "/" or path.startswith("/index")

    @staticmethod
    def _normalize_path(path):
        # Some captive probes send absolute-URI in request line.
        # Convert "http://host/path?x" to "/path" for matching.
        p = path.strip()
        if p.startswith("http://") or p.startswith("https://"):
            slash = p.find("/", p.find("://") + 3)
            p = p[slash:] if slash >= 0 else "/"
        q = p.find("?")
        if q >= 0:
            p = p[:q]
        h = p.find("#")
        if h >= 0:
            p = p[:h]
        return p if p else "/"

    @staticmethod
    def _is_captive_probe_path(path):
        # Common captive portal probe URLs used by Android/iOS/Windows.
        probes = (
            "/generate_204",
            "/gen_204",
            "/hotspot-detect.html",
            "/library/test/success.html",
            "/ncsi.txt",
            "/connecttest.txt",
            "/redirect",
            "/canonical.html",
            "/success.txt",
            "/fwlink",
        )
        return any(path.startswith(p) for p in probes)

    def _handle_captive_probe(self, cl, path, head_only=False):
        # All probes: return 302 redirect to portal root.
        # 302 is the most universally recognised captive-portal signal
        # across Android, iOS, and Windows.
        self._send_redirect(cl)

    @staticmethod
    def _parse_request_line(raw):
        lines = raw.split("\r\n")
        if lines:
            parts = lines[0].split(" ")
            if len(parts) >= 2:
                return parts[0].upper(), parts[1]
        return "GET", "/"

    @staticmethod
    def _extract_body(raw):
        """Return portion after \\r\\n\\r\\n (POST body)."""
        idx = raw.find("\r\n\r\n")
        if idx >= 0:
            return raw[idx + 4:]
        return ""

    # ── response helpers ─────────────────────────────────────
    def _serve_form(self, cl):
        page = _HTML_PAGE.format(
            device_name=_DEF_NAME,
            sel_ws='selected' if _DEF_MODE == 'websocket' else '',
            sel_auto='selected' if _DEF_MODE == 'auto' else '',
            ssid=_DEF_SSID,
            password=_DEF_PASS,
            ecg_sr=_DEF_ECG_SR,
            pcg_sr=_DEF_PCG_SR,
            ecg_dur=_DEF_ECG_DUR,
            pcg_dur=_DEF_PCG_DUR,
            cycle_delay=_DEF_CYCLE,
            server_ip=_DEF_SRV_IP,
            server_port=_DEF_SRV_PORT,
            auth_user=_DEF_AUTH_USER,
            auth_pass=_DEF_AUTH_PASS,
        )
        self._send_html(cl, page)

    def _handle_save(self, cl, body):
        params = _parse_form(body)

        cfg = {
            "device_name":     params.get("device_name", _DEF_NAME),
            "mode":            params.get("mode", _DEF_MODE),
            "ssid":            params.get("ssid", _DEF_SSID),
            "password":        params.get("password", _DEF_PASS),
            "sample_rate":     int(params.get("sample_rate", _DEF_ECG_SR)),
            "pcg_sample_rate": int(params.get("pcg_sample_rate", _DEF_PCG_SR)),
            "ecg_duration":    int(params.get("ecg_duration", _DEF_ECG_DUR)),
            "record_duration": int(params.get("record_duration", _DEF_PCG_DUR)),
            "cycle_delay":     int(params.get("cycle_delay", _DEF_CYCLE)),
            "server_ip":       params.get("server_ip", _DEF_SRV_IP),
            "server_port":     int(params.get("server_port", _DEF_SRV_PORT)),
            "auth_user":       params.get("auth_user", _DEF_AUTH_USER),
            "auth_pass":       params.get("auth_pass", _DEF_AUTH_PASS),
        }

        # Persist to flash
        try:
            with open("config.json", "w") as f:
                json.dump(cfg, f)
            print(f"[Portal] Config saved: {cfg}")
        except Exception as e:
            print(f"[Portal] Failed to save config: {e}")

        # Send success page
        self._send_html(cl, _HTML_SUCCESS)
        cl.close()

        # Reboot after short delay (so the browser receives the page)
        print("[Portal] Rebooting in 2 seconds...")
        time.sleep(2)
        machine.reset()

    @staticmethod
    def _send_html(cl, html):
        resp = (
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: text/html; charset=utf-8\r\n"
            "Cache-Control: no-store\r\n"
            f"Content-Length: {len(html)}\r\n"
            "Connection: close\r\n\r\n"
            + html
        )
        cl.send(resp)

    def _send_redirect(self, cl):
        body = (
            "<html><body>"
            f"<a href='http://{self._portal_ip}/'>Sign in</a>"
            "</body></html>"
        )
        resp = (
            "HTTP/1.1 302 Found\r\n"
            f"Location: http://{self._portal_ip}/\r\n"
            "Cache-Control: no-store\r\n"
            "Content-Type: text/html\r\n"
            f"Content-Length: {len(body)}\r\n"
            "Connection: close\r\n\r\n"
            + body
        )
        cl.send(resp)

    def _send_captive_probe_page(self, cl):
        html = (
            "<!doctype html><html><head><meta charset='utf-8'>"
            "<meta http-equiv='refresh' content='0;url=/'></head>"
            "<body>Captive portal detected. Redirecting...</body></html>"
        )
        self._send_html(cl, html)

    def _send_portal_login_page(self, cl):
        """Respond with 200+HTML on /generate_204 so Android detects captive portal."""
        html = (
            "<!doctype html><html><head><meta charset='utf-8'>"
            f"<meta http-equiv='refresh' content='0;url=http://{self._portal_ip}/'>"
            "</head><body>"
            f"<a href='http://{self._portal_ip}/'>Log in to network</a>"
            "</body></html>"
        )
        self._send_html(cl, html)

    @staticmethod
    def _send_head_captive(cl):
        resp = (
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: text/html; charset=utf-8\r\n"
            "Cache-Control: no-store\r\n"
            "Content-Length: 0\r\n"
            "Connection: close\r\n\r\n"
        )
        cl.send(resp)

