#!/usr/bin/env python3
"""Preserve the live Firebase Hosting version and overlay only shirt inventory assets."""
import gzip, hashlib, json, os, sys, urllib.parse, urllib.request
import google.auth
from google.auth.transport.requests import Request

SITE="sandman-main"
ROOT="https://firebasehosting.googleapis.com/v1beta1/"
PATHS=(
 "/management/inventory/index.html",
 "/management/inventory/inventory.js",
 "/management/inventory/inventory.css",
 "/management/shared/management-shell-frame.js",
 "/management/logistics/index.html",
 "/management/hub/index.html",
)
NEW={"/management/inventory/index.html","/management/inventory/inventory.js","/management/inventory/inventory.css"}
creds,_=google.auth.default(scopes=["https://www.googleapis.com/auth/firebase"])
creds.refresh(Request())
def api(method,path,data=None):
    req=urllib.request.Request(ROOT+path,
        data=None if data is None else json.dumps(data).encode(),
        method=method,headers={"Authorization":"Bearer "+creds.token,"Content-Type":"application/json"})
    with urllib.request.urlopen(req,timeout=50) as res:return json.load(res)
def current():
    return api("GET",f"sites/{SITE}/releases?pageSize=1")["releases"][0]
mode=os.environ.get("MODE")
assert mode in ("preflight","deploy"),"Mode must be preflight or deploy"
baseline=current()
version=baseline["version"]
version_name=version["name"]
assert version_name.startswith(f"sites/{SITE}/versions/"),"Unexpected hosting site"
config=version.get("config")
assert isinstance(config,dict) and bool(config),"Missing live Hosting config"
old={}
page=""
while True:
    query="?pageSize=1000"+("&pageToken="+urllib.parse.quote(page) if page else "")
    response=api("GET",version_name+"/files"+query)
    for entry in response.get("files",[]):old[entry["path"]]=entry["hash"]
    page=response.get("nextPageToken","")
    if not page:break
assert len(old)>100 and all(x in old for x in PATHS if x not in NEW),"Unexpected live file inventory"
assert not any(x in old for x in NEW),"Inventory pages already exist. STOP_NO_RETRY."
new=dict(old)
payloads={}
for path in PATHS:
    body=open("public"+path,"rb").read()
    assert len(body)>100,"Overlay asset unexpectedly short: "+path
    compressed=gzip.compress(body,mtime=0)
    digest=hashlib.sha256(compressed).hexdigest()
    new[path]=digest
    payloads[digest]=compressed
changed={p for p in PATHS if new[p]!=old.get(p)}
assert NEW.issubset(changed) and changed.issubset(set(PATHS)),"Unexpected overlay changes"
assert len(new)==len(old)+len(NEW),"Unexpected Hosting file-count change"
assert all(new.get(p)==hash_ for p,hash_ in old.items() if p not in changed),"Live assets not preserved"
print(json.dumps({"mode":mode,"baseline":version_name,"filesPreserved":len(old)-len(changed-NEW),
                  "newFiles":sorted(NEW),"changed":sorted(changed),"rollback":version_name},indent=2))
if mode=="preflight":
    print("PREVIEW ONLY: no Hosting writes")
    sys.exit(0)
# The function must be healthy before releasing its client.
assert os.environ.get("INVENTORY_FUNCTION_VERIFIED")=="true","Missing callable health confirmation"
created=api("POST",f"sites/{SITE}/versions",{"config":config})
next_name=created["name"]
assert next_name.startswith(f"sites/{SITE}/versions/")
uploads={}
for i in range(0,len(new),900):
    subset=dict(list(new.items())[i:i+900])
    response=api("POST",next_name+":populateFiles",{"files":subset})
    upload_url=response["uploadUrl"]
    for digest in response.get("uploadRequiredHashes",[]):
        assert digest in payloads,"Existing live asset was unexpectedly requested. Abort."
        uploads[digest]=upload_url
for digest,url in uploads.items():
    req=urllib.request.Request(url+"/"+digest,data=payloads[digest],method="POST",
        headers={"Authorization":"Bearer "+creds.token,"Content-Type":"application/octet-stream"})
    with urllib.request.urlopen(req,timeout=50) as res: assert res.status in (200,201,204)
api("PATCH",next_name+"?updateMask=status%2Cconfig",{"status":"FINALIZED","config":config})
assert current()["version"]["name"]==version_name,"Hosting changed concurrently: STOP_NO_RETRY"
released=api("POST","sites/"+SITE+"/releases?versionName="+urllib.parse.quote(next_name,safe="/"),{})
print("PRODUCTION_HOSTING_RELEASE",released.get("name"),"ROLLBACK_VERSION",version_name)
