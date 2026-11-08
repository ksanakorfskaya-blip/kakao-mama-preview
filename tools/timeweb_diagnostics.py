"""Read-only Timeweb Cloud diagnostics for family-habits-auth-test.

Only sends GET requests. Never prints the token, credentials, environment
variables, complete API responses, or unfiltered application logs.
"""
import datetime
import json
import os
import re
import socket
import sys
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.timeweb.cloud"
TARGET = "family-habits-auth-test"
PUBLIC = "https://ksanakorfskaya-blip-kakao-mama-preview-e358.twc1.net"
TOKEN = os.environ.get("TIMEWEB_API_TOKEN", "")


def api_get(path):
    req = urllib.request.Request(
        API + path,
        headers={"Authorization": "Bearer " + TOKEN, "Accept": "application/json"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=18) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        print(f"API {path.split('?')[0]}: HTTP {exc.code}")
    except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
        print(f"API {path.split('?')[0]}: {type(exc).__name__}")
    return None


def safe_status(value):
    if value is None or isinstance(value, bool):
        return str(value)
    return re.sub(r"[^a-zA-Z0-9_ .:-]", "", str(value))[:90]


def check_public():
    host = urllib.parse.urlsplit(PUBLIC).hostname
    print("\nPUBLIC ACCESS")
    try:
        records = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
        ips = sorted({entry[4][0] for entry in records})
        print("DNS:", ", ".join(ips[:8]) if ips else "No addresses")
    except OSError as exc:
        print("DNS: error", type(exc).__name__)
        return
    try:
        with socket.create_connection((host, 443), timeout=9):
            print("TCP/443: reachable")
    except OSError as exc:
        print("TCP/443:", type(exc).__name__)
        return
    req = urllib.request.Request(PUBLIC + "/health", method="GET")
    try:
        with urllib.request.urlopen(req, timeout=12) as r:
            print("GET /health: HTTP", r.status)
            payload = json.loads(r.read(2048))
            if isinstance(payload, dict):
                print("health.ok:", safe_status(payload.get("ok")))
                print("health.database:", safe_status(payload.get("database")))
                print("health.email:", safe_status(payload.get("email")))
    except urllib.error.HTTPError as exc:
        print("GET /health: HTTP", exc.code)
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        print("GET /health:", type(exc).__name__)


def scan_logs(payload):
    if payload is None:
        return
    # Inspect only exact known diagnostic markers. Never print raw logs.
    raw = json.dumps(payload, ensure_ascii=False)
    markers = [
        "PostgreSQL schema ready",
        "Family Habits cloud listening at 3000",
        "SMTP verification failed:",
        "Server setup failed:",
    ]
    print("Known log markers:")
    for marker in markers:
        print(" ", marker, "FOUND" if marker in raw else "not found")


def main():
    if not TOKEN:
        print("TIMEWEB_API_TOKEN is not configured in GitHub Actions secrets.")
        return 2

    print("TIMEWEB READ-ONLY DIAGNOSTICS (GitHub Actions)")
    print("UTC:", datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"))
    apps = api_get("/api/v1/apps")
    if not isinstance(apps, dict) or not isinstance(apps.get("apps"), list):
        print("Cannot list apps with the current token.")
        check_public()
        return 1
    matches = [a for a in apps["apps"] if isinstance(a, dict) and a.get("name") == TARGET]
    print("\nAPP")
    print("Matching apps:", len(matches))
    if not matches:
        print("Target not visible; check token project and App Platform permissions.")
        check_public()
        return 1
    app = matches[0]
    app_id = str(app.get("id", ""))
    if not re.fullmatch(r"[0-9]+", app_id):
        print("Unexpected app ID format; cannot query application.")
        check_public()
        return 1
    print("Name:", TARGET)
    print("ID:", app_id)
    print("Status:", safe_status(app.get("status")))
    print("Type:", safe_status(app.get("type")))

    detail = api_get(f"/api/v1/apps/{app_id}")
    if isinstance(detail, dict) and isinstance(detail.get("app"), dict):
        info = detail["app"]
        print("Detail status:", safe_status(info.get("status")))
        print("Detail type:", safe_status(info.get("type")))

    deploy_data = api_get(f"/api/v1/apps/{app_id}/deploys?limit=3&offset=0")
    if isinstance(deploy_data, dict) and isinstance(deploy_data.get("deploys"), list):
        print("\nDEPLOYS (last 3)")
        for item in deploy_data["deploys"][:3]:
            if not isinstance(item, dict):
                continue
            print(
                " ID:", safe_status(item.get("id")),
                "status:", safe_status(item.get("status")),
                "created:", safe_status(item.get("created_at")),
            )

    print("\nAPPLICATION LOG SIGNALS")
    scan_logs(api_get(f"/api/v1/apps/{app_id}/logs"))
    check_public()
    print("\nCompleted. No account resources were modified.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
