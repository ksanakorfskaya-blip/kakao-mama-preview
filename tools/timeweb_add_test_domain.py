"""One-time, tightly scoped action: add a free Timeweb technical .tw1.ru domain.

Never deletes or overwrites an existing domain. Never touches finances.
Token is read from GitHub Actions secrets; its value is never printed.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE="https://api.timeweb.cloud"
TOKEN=os.environ.get("TIMEWEB_API_TOKEN","")
APP_ID=284851
APP_NAME="family-habits-auth-test"
OLD_DOMAIN="ksanakorfskaya-blip-kakao-mama-preview-e358.twc1.net"
DOMAIN="family-habits-auth-test.tw1.ru"

def call(method,path,body=None):
    headers={"Authorization":"Bearer "+TOKEN,"Accept":"application/json"}
    payload=None
    if body is not None:
        headers["Content-Type"]="application/json"
        payload=json.dumps(body).encode("utf-8")
    req=urllib.request.Request(BASE+path,headers=headers,data=payload,method=method)
    try:
        with urllib.request.urlopen(req,timeout=22) as response:
            raw=response.read(500000)
            data=json.loads(raw) if raw else {}
            return response.status,data
    except urllib.error.HTTPError as exc:
        print(method,path,"HTTP",exc.code)
        return exc.code,None
    except (urllib.error.URLError,TimeoutError,OSError,ValueError) as exc:
        print(method,path,"failed:",type(exc).__name__)
        return 0,None

def app_info():
    status,data=call("GET",f"/api/v1/apps/{APP_ID}")
    if status!=200 or not isinstance(data,dict) or not isinstance(data.get("app"),dict):
        raise RuntimeError("Could not verify existing application")
    a=data["app"]
    if a.get("name")!=APP_NAME:
        raise RuntimeError("Application ID/name mismatch")
    ds=[d.get("fqdn") for d in a.get("domains",[]) if isinstance(d,dict)]
    if OLD_DOMAIN not in ds:
        raise RuntimeError("Existing domain not found; refusing domain change")
    return a,ds

def main():
    if not TOKEN: raise RuntimeError("GitHub secret TIMEWEB_API_TOKEN is absent")
    print("ONE-TIME FREE DOMAIN SETUP")
    app,existing=app_info()
    print("Confirmed app:",APP_NAME,"ID",APP_ID)
    print("Existing app domains:",", ".join(existing))
    if DOMAIN in existing:
        print("New domain already linked. Nothing to change.")
        return 0
    status,check=call("GET","/api/v1/check-domain/"+DOMAIN)
    if status!=200 or not isinstance(check,dict):
        raise RuntimeError("Domain availability could not be verified")
    available=check.get("is_domain_available")
    print("Free technical domain candidate:",DOMAIN,"available:",available)
    if available is not True:
        print("Domain is not available. No changes made.")
        return 2
    status,data=call("POST","/api/v1/add-domain/"+DOMAIN)
    print("Add technical domain HTTP:",status)
    if status not in (200,201,202,204):
        raise RuntimeError("Timeweb did not accept adding the domain")
    status,domain_data=call("GET","/api/v1/domains/"+DOMAIN)
    if status!=200 or not isinstance(domain_data,dict):
        print("Domain creation submitted; owner verification pending.")
        return 3
    d=domain_data.get("domain") or domain_data
    if not isinstance(d,dict):
        raise RuntimeError("Cannot parse domain response safely")
    if d.get("fqdn")!=DOMAIN:
        raise RuntimeError("Returned domain identity differs")
    print("Created domain:",DOMAIN)
    print("Technical:",d.get("is_technical"))
    print("Linked IP:",d.get("linked_ip") or "none")
    print("Domain status:",str(d.get("domain_status"))[:50])
    app_after,domains_after=app_info()
    print("App domains after create:",", ".join(domains_after))
    print("Existing domain preserved:",OLD_DOMAIN in domains_after)
    print("New domain attached:",DOMAIN in domains_after)
    print("Next: attach to app only if domain verified technical and unlinked.")
    return 0

if __name__=="__main__":
    try:sys.exit(main())
    except Exception as exc:
        print("STOPPED WITHOUT DELETIONS:",str(exc))
        sys.exit(1)
