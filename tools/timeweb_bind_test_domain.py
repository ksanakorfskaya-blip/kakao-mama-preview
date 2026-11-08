"""One-time explicit authorization: link existing free .tw1.ru technical domain.

Action: create only the app-linked A record. No deletion, no payment,
no modification of existing .twc1.net or other domains.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request

BASE="https://api.timeweb.cloud"
TOKEN=os.environ.get("TIMEWEB_API_TOKEN","")
APP_ID=284851
APP_NAME="family-habits-auth-test"
OLD="ksanakorfskaya-blip-kakao-mama-preview-e358.twc1.net"
NEW="family-habits-auth-test.tw1.ru"

def request(method,path,body=None):
    headers={"Authorization":"Bearer "+TOKEN,"Accept":"application/json"}
    content=json.dumps(body).encode("utf-8") if body is not None else None
    if body is not None:headers["Content-Type"]="application/json"
    req=urllib.request.Request(BASE+path,method=method,headers=headers,data=content)
    try:
        with urllib.request.urlopen(req,timeout=25) as res:
            raw=res.read(500000)
            return res.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        # Never print response bodies; they might include sensitive configuration.
        print(method,path,"HTTP",exc.code)
        return exc.code,None
    except (urllib.error.URLError,TimeoutError,OSError,ValueError) as exc:
        print(method,path,"failed:",type(exc).__name__)
        return 0,None

def get_app():
    status,payload=request("GET",f"/api/v1/apps/{APP_ID}")
    if status!=200 or not isinstance(payload,dict):
        raise RuntimeError("Cannot verify app")
    a=payload.get("app")
    if not isinstance(a,dict) or a.get("name")!=APP_NAME:
        raise RuntimeError("App identity mismatch")
    domains=[d.get("fqdn") for d in a.get("domains",[]) if isinstance(d,dict)]
    if OLD not in domains:raise RuntimeError("Old domain absent; no changes permitted")
    ip=a.get("ip")
    if not isinstance(ip,str) or not re.fullmatch(r"(?:\d{1,3}\.){3}\d{1,3}",ip):
        raise RuntimeError("App IP address is unexpected")
    return ip,domains

def get_new_domain():
    status,payload=request("GET","/api/v1/domains/"+NEW)
    if status!=200 or not isinstance(payload,dict):
        raise RuntimeError("New domain not found under account")
    d=payload.get("domain",payload)
    if not isinstance(d,dict) or d.get("fqdn")!=NEW or d.get("is_technical") is not True:
        raise RuntimeError("New domain identity/type mismatch")
    return d

def main():
    if not TOKEN:raise RuntimeError("Missing TIMEWEB_API_TOKEN GitHub Secret")
    print("ONE-TIME FREE DOMAIN BINDING")
    ip,before=get_app()
    print("App verified:",APP_NAME,"ID",APP_ID,"IP",ip)
    print("Existing domain preserved:",OLD in before)
    d=get_new_domain()
    print("Domain verified as free technical:",NEW)
    if NEW in before:
        print("Already linked. No write needed.")
        return 0
    if d.get("linked_ip") not in (None,"",ip):
        raise RuntimeError("New domain already linked to a different IP")
    # Documented API v2: app_id attaches the domain to existing App Platform.
    body={"type":"A","value":ip,"app_id":APP_ID}
    status,response=request("POST","/api/v2/domains/"+NEW+"/dns-records",body)
    print("Bind domain request HTTP:",status)
    if status not in (200,201,202,204):
        print("No destructive fallback is attempted.")
        return 2
    print("New app-linked A record accepted.")
    # Check both references. A re-deploy may run asynchronously.
    new_details=get_new_domain()
    print("New domain linked IP:",new_details.get("linked_ip") or "not yet reflected")
    _,after=get_app()
    print("Old app domain preserved:",OLD in after)
    print("New app domain listed:",NEW in after)
    print("If not immediately listed, inspect the next App Platform deploy.")
    return 0

if __name__=="__main__":
    try:sys.exit(main())
    except Exception as exc:
        print("Safe stop:",type(exc).__name__,str(exc))
        sys.exit(1)
