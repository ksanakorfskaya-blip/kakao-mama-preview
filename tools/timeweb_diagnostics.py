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


def check_public_pages():
    print("\\nPUBLIC WEB PAGES")
    for route in ("/", "/account.html", "/api/auth/me"):
        req = urllib.request.Request(PUBLIC + route, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=12) as response:
                content_type = response.headers.get("content-type", "").split(";")[0]
                print(route, "HTTP", response.status, "content-type:", safe_status(content_type))
                # Check that the page exists without printing user or session data.
                if route in ("/", "/account.html"):
                    body = response.read(30000).decode("utf-8", errors="replace")
                    print("  expected app text:", "yes" if "Мои полезные привычки" in body or "Личный кабинет" in body else "not found")
        except urllib.error.HTTPError as exc:
            print(route, "HTTP", exc.code)
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
            print(route, type(exc).__name__)


def distributed_http_check():
    """Check from Russian and foreign networks using public Check-Host API.

    This sends only the already-public /health URL. It cannot test residential
    Russian operators and should not be treated as universal reachability.
    """
    print("\nDISTRIBUTED HTTP CHECK")
    provider="https://check-host.net"
    try:
        def get_json(path):
            req=urllib.request.Request(provider+path,headers={"Accept":"application/json","User-Agent":"family-habits-uptime-check/1.0"})
            with urllib.request.urlopen(req,timeout=15) as response:
                return json.load(response)

        nodes_data=get_json("/nodes/hosts")
        available=nodes_data.get("nodes",{})
        russian=[name for name,details in available.items() if details.get("location",[""])[0]=="ru"]
        foreign=[name for name,details in available.items() if details.get("location",[""])[0] in ("de","nl","fi","fr")]
        chosen=russian[:4]+foreign[:2]
        if not chosen:
            print("No suitable Check-Host monitoring nodes available")
            return
        params=[("host",PUBLIC+"/health")]
        params.extend(("node",name) for name in chosen)
        response=get_json("/check-http?"+urllib.parse.urlencode(params))
        request_id=response.get("request_id")
        if not isinstance(request_id,str) or not re.fullmatch(r"[a-zA-Z0-9_-]{1,70}",request_id):
            print("Probe service did not issue a valid request ID")
            return
        print("Check-Host report:",safe_status(response.get("permanent_link")))
        print("Nodes:",len(chosen),"of which Russia:",len(russian[:4]))
        import time
        result={}
        for attempt in range(6):
            time.sleep(3)
            result=get_json("/check-result/"+request_id)
            if all(result.get(node) is not None for node in chosen):
                break
        for name in chosen:
            detail=available.get(name,{})
            loc=detail.get("location",[])
            location="/".join(str(p) for p in loc[0:3])
            out=result.get(name)
            if not out:
                print(location,safe_status(name),"pending / no response")
                continue
            first=out[0] if isinstance(out,list) and out else []
            if not isinstance(first,list):
                print(location,safe_status(name),"unexpected response")
                continue
            http_code=first[3] if len(first)>3 else None
            err=first[2] if len(first)>2 else "network error"
            elapsed=first[1] if len(first)>1 else None
            print(location,"HTTP",safe_status(http_code),"elapsed",safe_status(elapsed),"detail",safe_status(err))
    except (urllib.error.URLError, urllib.error.HTTPError, OSError, TimeoutError, ValueError, KeyError, AttributeError) as exc:
        print("External probe unavailable:",type(exc).__name__)


def globalping_russia_check():
    """Independent public Globalping HTTP checks from RU and DE probes."""
    print("\nGLOBALPING COUNTRY CHECK")
    api="https://api.globalping.io/v1/measurements"
    target=urllib.parse.urlsplit(PUBLIC).hostname
    request_body={
        "type":"http",
        "target":target,
        "locations":[{"country":"RU","limit":5},{"country":"DE","limit":2}],
        "measurementOptions":{"protocol":"HTTPS","port":443,"request":{"method":"GET","path":"/health"}},
        "timeout":20,
    }
    headers={"Accept":"application/json","Content-Type":"application/json","User-Agent":"FamilyHabitsDiagnostics/1.0 (GitHub Actions)"}
    try:
        payload=json.dumps(request_body).encode("utf-8")
        req=urllib.request.Request(api,data=payload,headers=headers,method="POST")
        with urllib.request.urlopen(req,timeout=20) as response:
            created=json.load(response)
        measurement_id=created.get("id")
        if not isinstance(measurement_id,str) or not re.fullmatch(r"[a-zA-Z0-9_-]{1,70}",measurement_id):
            print("Globalping request did not return a measurement id")
            return
        print("Measurement:",safe_status(measurement_id))
        import time
        result={}
        for attempt in range(15):
            time.sleep(2)
            req=urllib.request.Request(api+"/"+measurement_id,headers=headers)
            with urllib.request.urlopen(req,timeout=15) as response:
                result=json.load(response)
            if result.get("status")!="in-progress":
                break
        print("Status:",safe_status(result.get("status")))
        print("Probe count:",safe_status(result.get("probesCount")))
        for entry in result.get("results",[])[:12]:
            probe=entry.get("probe",{})
            status=entry.get("result",{})
            location=probe.get("country") or probe.get("location",{}).get("country") or "unknown"
            city=probe.get("city") or ""
            print("Probe",safe_status(location),safe_status(city),
                  "status",safe_status(status.get("status")),
                  "HTTP",safe_status(status.get("statusCode")),
                  "error",safe_status(status.get("error")),
                  "TLS",safe_status(status.get("tls",{}).get("authorized") if isinstance(status.get("tls"),dict) else None))
    except urllib.error.HTTPError as exc:
        # An HTTP 422 often means no probes in that region; response is not printed.
        print("Globalping request HTTP",exc.code)
    except (urllib.error.URLError,TimeoutError,OSError,ValueError,KeyError,AttributeError) as exc:
        print("Globalping unavailable:",type(exc).__name__)


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
        print("Existing domains:", ", ".join(
            safe_status(d.get("fqdn") or d.get("domain") or d.get("name"))
            for d in info.get("domains",[]) if isinstance(d,dict)
        ))
    print("\\nTECHNICAL DOMAIN AVAILABILITY")
    for candidate in ("family-habits-auth-test.tw1.ru", "family-habits-test.tw1.ru"):
        result=api_get("/api/v1/check-domain/"+candidate)
        if isinstance(result,dict):
            print(candidate,"available:",safe_status(result.get("is_domain_available")),
                  "response keys:", ",".join(sorted(result.keys())[:8]))
        else:
            print(candidate,"availability unknown")

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
    check_public_pages()
    distributed_http_check()
    globalping_russia_check()
    print("\nCompleted. No account resources were modified.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
