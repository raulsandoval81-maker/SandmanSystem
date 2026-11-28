#!/usr/bin/env python3
"""Protected Command Center staging release primitives; never grants IAM."""
import gzip, hashlib, importlib.util, json, os, re, shutil, subprocess, tempfile, time, urllib.error, urllib.parse, urllib.request, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROJECT, REGION = "sandman-combat-staging", "us-central1"
REPO = "raulsandoval81-maker/SandmanSystem"
WORKFLOW = REPO + "/.github/workflows/staging-exact-sha-release.yml@refs/heads/main"
SOURCE_SHA = "23b910d9c1a2d7ddf6c829be505725a4d16862b6"
FUNCTIONS = ("getCommandCenterSnapshot", "saveCommandCenterProject", "archiveCommandCenterProject")
RUNTIME = "sandman-billing-runtime@sandman-combat-staging.iam.gserviceaccount.com"
BUILDER = "sandman-practice-build@sandman-combat-staging.iam.gserviceaccount.com"
HOSTING = (
    "/admin/command-center/command-center.css", "/admin/command-center/command-center.js",
    "/admin/command-center/command-center.service.js", "/admin/command-center/index.html",
    "/admin/hub/dashboard.html", "/assets/js/admin-nav.js", "/assets/js/admin-owner-guard.js")
APPROVAL = "APPROVE_COMMAND_CENTER_STAGING_THREE_FUNCTIONS_RULES_SEVEN_HOSTING"
TRANSPORT_APPROVAL = "APPROVE_STAGING_APPLICATION_AUTH_TRANSPORT"
EVIDENCE = Path("command-center-862-release-evidence.json")

def require(ok, message):
    if not ok: raise RuntimeError(message)
def sha(data): return hashlib.sha256(data).hexdigest()
def token(): return subprocess.check_output(["gcloud","auth","print-access-token"], text=True, stderr=subprocess.DEVNULL).strip()
def request(t, url, method="GET", body=None, binary=False):
    allowed = ("https://cloudfunctions.googleapis.com/v2/projects/"+PROJECT+"/",
               "https://run.googleapis.com/v2/projects/"+PROJECT+"/",
               "https://firebaserules.googleapis.com/v1/projects/"+PROJECT+"/",
               "https://firebasehosting.googleapis.com/v1beta1/sites/"+PROJECT+"/",
               "https://upload-firebasehosting.googleapis.com/upload/sites/"+PROJECT+"/")
    require(url.startswith(allowed), "Non-staging API target")
    data = body if binary else (json.dumps(body).encode() if body is not None else None)
    headers = {"Authorization":"Bearer "+t}
    if data is not None: headers["Content-Type"] = "application/zip" if binary else "application/json"
    with urllib.request.urlopen(urllib.request.Request(url, data=data, method=method, headers=headers), timeout=90) as response:
        raw=response.read(); return {} if not raw else json.loads(raw)
def save(value): EVIDENCE.write_text(json.dumps(value, indent=2, sort_keys=True)+"\n")
def guard(action, mutate=False):
    expected={"GITHUB_REPOSITORY":REPO,"GITHUB_REF":"refs/heads/main","GITHUB_EVENT_NAME":"workflow_dispatch",
              "GITHUB_WORKFLOW_REF":WORKFLOW,"GITHUB_RUN_ATTEMPT":"1","CONFIRM_PROJECT":PROJECT,
              "COMMAND_CENTER_ACTION":action}
    for key,value in expected.items(): require(os.environ.get(key)==value,"Protected release guard mismatch: "+key)
    if mutate:
        require(os.environ.get("COMMAND_CENTER_APPROVAL")==APPROVAL,"Exact staging approval missing")
        require(os.environ.get("COMMAND_CENTER_TRANSPORT_APPROVAL")==TRANSPORT_APPROVAL,"Callable transport approval missing")
    else: require(not os.environ.get("COMMAND_CENTER_APPROVAL"),"Read-only preflight received mutation approval")
def load_readonly():
    path=ROOT/"scripts/staging/command-center-862-readonly.py"; spec=importlib.util.spec_from_file_location("cc_readonly_release",path)
    module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module); return module
def package(out):
    source_root=Path(os.environ.get("COMMAND_CENTER_APPLICATION_ROOT",str(ROOT))).resolve()
    require((source_root/"functions/src/admin/commandCenter.ts").is_file(),"Reviewed application source missing")
    for rel in ("functions/src/admin/commandCenter.ts","functions/src/admin/commandCenterPolicy.ts","functions/src/index.ts"):
        require(sha((source_root/rel).read_bytes())==sha(subprocess.check_output(["git","-C",str(ROOT),"show",SOURCE_SHA+":"+rel])),"Reviewed application source mismatch: "+rel)
    subprocess.run(["npm","run","build","--prefix",str(source_root/"functions")],check=True)
    if out.exists(): shutil.rmtree(out)
    (out/"lib/admin").mkdir(parents=True); (out/"lib/services").mkdir(parents=True)
    for rel in ("lib/admin/commandCenter.js","lib/admin/commandCenterPolicy.js","lib/services/staffAuthorization.js"):
        shutil.copy2(source_root/"functions"/rel,out/rel)
    package_json=json.loads((source_root/"functions/package.json").read_text())
    package_json["main"]="index.cjs"
    (out/"package.json").write_text(json.dumps(package_json,sort_keys=True)+"\n")
    shutil.copy2(source_root/"functions/package-lock.json",out/"package-lock.json")
    (out/"index.cjs").write_text(
        "const { getApps, initializeApp } = require('firebase-admin/app');\n"
        "if (getApps().length === 0) initializeApp();\n"
        "Object.assign(exports, require('./lib/admin/commandCenter.js'));\n"
    )
    subprocess.run(["npm","ci","--prefix",str(out),"--ignore-scripts","--no-audit","--no-fund"],check=True)
    validation=json.loads(subprocess.check_output([
        "node","-e",
        "const p=process.argv[1]; const m=require(p+'/index.cjs'); "
        "const {getApps}=require(require.resolve('firebase-admin/app',{paths:[p]})); "
        "console.log(JSON.stringify({exports:Object.keys(m).sort(),adminApps:getApps().length}));",
        str(out)],text=True))
    require(validation.get("exports")==sorted(FUNCTIONS),"Package exports expanded")
    require(validation.get("adminApps")==1,"Firebase Admin was not initialized exactly once")
    shutil.rmtree(out/"node_modules")
def inventory(t):
    ro=load_readonly(); rows=ro.load_snapshot().paged("https://cloudfunctions.googleapis.com/v2/projects/"+PROJECT+"/locations/-/functions","functions",t)
    return {x["name"]:{"state":x.get("state"),"updateTime":x.get("updateTime"),"revision":x.get("serviceConfig",{}).get("revision")} for x in rows}
def permission_probe(t,url,permissions):
    req=urllib.request.Request(url,method="POST",data=json.dumps({"permissions":sorted(permissions)}).encode(),headers={"Authorization":"Bearer "+t,"Content-Type":"application/json"})
    with urllib.request.urlopen(req,timeout=30) as response: return set(json.load(response).get("permissions",[]))
def preflight_create():
    guard("command-center-862-release-preflight"); t=token(); current=inventory(t)
    require(len(current)==54 and not any(name.endswith("/"+f) for name in current for f in FUNCTIONS),"Expected 54 preserved Functions and three absent targets")
    need={"cloudfunctions.functions.create","cloudfunctions.functions.sourceCodeSet"}
    have=permission_probe(t,"https://cloudresourcemanager.googleapis.com/v1/projects/"+PROJECT+":testIamPermissions",need)
    require(need<=have,"Create-only deployer permissions missing")
    for account in (RUNTIME,BUILDER):
        require("iam.serviceAccounts.actAs" in permission_probe(t,"https://iam.googleapis.com/v1/projects/-/serviceAccounts/"+account+":testIamPermissions",{"iam.serviceAccounts.actAs"}),"Scoped actAs missing: "+account)
    return current
def preflight_publish():
    guard("command-center-862-release-preflight"); t=token()
    needed={"run.services.update","run.services.setIamPolicy","firebaserules.rulesets.create","firebaserules.releases.update","firebasehosting.sites.get","firebasehosting.sites.update"}
    have=permission_probe(t,"https://cloudresourcemanager.googleapis.com/v1/projects/"+PROJECT+":testIamPermissions",needed)
    require(needed<=have,"Publisher permissions missing: "+", ".join(sorted(needed-have)))
    return sorted(have)
def zip_source(source):
    with tempfile.NamedTemporaryFile(suffix=".zip",delete=False) as f: target=Path(f.name)
    with zipfile.ZipFile(target,"w",zipfile.ZIP_DEFLATED) as z:
        for p in sorted(source.rglob("*")):
            if p.is_file(): z.write(p,p.relative_to(source))
    return target.read_bytes()
def upload_gen2_source(upload, payload):
    """Match the successful Athlete Gen 2 signed URL upload; never attach credentials."""
    url, storage = upload.get("uploadUrl"), upload.get("storageSource")
    parsed = urllib.parse.urlparse(url) if isinstance(url, str) else None
    require(parsed is not None and parsed.scheme == "https" and
            parsed.netloc == "storage.googleapis.com" and
            isinstance(storage, dict) and storage.get("bucket") and storage.get("object"),
            "Generated Cloud Functions source URL not trusted")
    require(0 < len(payload) <= 104857600, "Source archive size outside reviewed limit")
    req = urllib.request.Request(url, data=payload, method="PUT",
                                 headers={"Content-Type": "application/zip"})
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            require(response.status in (200, 201, 204), "Source upload rejected")
    except urllib.error.HTTPError as error:
        # Do not log the signed URL or its credentials. No retry.
        raise RuntimeError(f"Gen 2 signed source upload failed (HTTP {error.code}); STOP_NO_RETRY") from None
    return storage

def wait_operation(t,name):
    for _ in range(120):
        op=request(t,"https://cloudfunctions.googleapis.com/v2/"+name)
        if op.get("done"):
            require("error" not in op,"Function creation operation failed"); return
        time.sleep(5)
    raise RuntimeError("Function creation timed out")
def create_functions(source):
    guard("command-center-862-staging-deploy",True); approved=approved_evidence(); t=token(); before=inventory(t)
    require(len(before)==54 and not any(name.endswith("/"+f) for name in before for f in FUNCTIONS),"Create-only baseline drift")
    status={"status":"STOP_NO_RETRY","project":PROJECT,"sourceSha":SOURCE_SHA,"approvedEvidenceSourceSha":approved["sourceMergeSha"],"before":before,"created":[],"lastOperation":"verified-evidence-and-54-function-baseline"}; save(status)
    payload=zip_source(source); parent=f"projects/{PROJECT}/locations/{REGION}"
    for name in FUNCTIONS:
        status["lastOperation"]="create-only-"+name; save(status)
        upload=request(t,"https://cloudfunctions.googleapis.com/v2/"+parent+"/functions:generateUploadUrl","POST",{"environment":"GEN_2"})
        status["lastOperation"]="upload-source-"+name; save(status)
        storage=upload_gen2_source(upload,payload)
        status["lastOperation"]="create-only-"+name; save(status)
        body={"name":parent+"/functions/"+name,"environment":"GEN_2","buildConfig":{"runtime":"nodejs22","entryPoint":name,"source":{"storageSource":storage},"serviceAccount":"projects/"+PROJECT+"/serviceAccounts/"+BUILDER},"serviceConfig":{"serviceAccountEmail":RUNTIME,"availableMemory":"256M","timeoutSeconds":60,"maxInstanceCount":20,"maxInstanceRequestConcurrency":80,"ingressSettings":"ALLOW_ALL"},"labels":{"sandman-command-center":"v1","sandman-source-sha":SOURCE_SHA}}
        op=request(t,"https://cloudfunctions.googleapis.com/v2/"+parent+"/functions?"+urllib.parse.urlencode({"functionId":name}),"POST",body); wait_operation(t,op["name"])
        status["created"].append(name); save(status)
    after=inventory(t); require(len(after)==57 and all(after.get(k)==v for k,v in before.items()),"Existing Function changed or final count is not 57")
    status.update(status="PASS_THREE_CREATE_ONLY_FUNCTIONS",after=after,lastOperation="verified-57-functions"); save(status)

def paged(t,url,key):
    rows=[]; cursor=""
    while True:
        page=request(t,url+("&" if "?" in url else "?")+urllib.parse.urlencode({"pageSize":1000,**({"pageToken":cursor} if cursor else {})}))
        rows.extend(page.get(key,[])); cursor=page.get("nextPageToken") or ""
        if not cursor:return rows
def manifest(t,version): return {x["path"]:x["hash"] for x in paged(t,"https://firebasehosting.googleapis.com/v1beta1/"+version+"/files","files")}
def rules_text(live,reviewed):
    start="    /* --------------------------------------\n       Owner Command Center (server-only)\n"; anchor="    /* --------------------------------------\n       DEFAULT CLOSED\n"
    require(reviewed.count(start)==1 and live.count(anchor)==1 and "match /adminCommandCenterProjects/{projectId}" not in live,"Rules baseline drift")
    part=reviewed[reviewed.index(start):reviewed.index(anchor,reviewed.index(start))]
    require(part.count("allow read, write: if false;")==2 and "allow read, write: if true;" not in part,"Command Center rule is not server-only")
    return live.replace(anchor,part+anchor,1)
def approved_evidence():
    record=json.loads(Path(os.environ["COMMAND_CENTER_PREFLIGHT_JSON"]).read_text())
    require(record.get("status")=="PASS_READ_ONLY_PENDING_SEPARATE_RELEASE_APPROVAL" and record.get("sourceMergeSha")==SOURCE_SHA,"Approved preflight evidence mismatch")
    return record
def publish_rules_hosting():
    guard("command-center-862-staging-deploy",True); t=token(); approved=approved_evidence()
    function_receipt=json.loads(EVIDENCE.read_text())
    require(function_receipt.get("status")=="PASS_THREE_CREATE_ONLY_FUNCTIONS" and len(function_receipt.get("before",{}))==54 and len(function_receipt.get("after",{}))==57,"Same-job Function receipt missing")
    status={"status":"STOP_NO_RETRY","project":PROJECT,"sourceSha":SOURCE_SHA,"createdFunctions":function_receipt["created"],"lastOperation":"verify-57-function-and-live-baselines"}; save(status)
    funcs=inventory(t); require(len(funcs)==57 and all(any(n.endswith("/"+f) for n in funcs) for f in FUNCTIONS),"Exactly 57 Functions required before publish")
    require(funcs==function_receipt["after"],"Function inventory changed after create-only gate")
    for name in FUNCTIONS:
        subprocess.run(["gcloud","run","services","update",name.lower(),"--project="+PROJECT,"--region="+REGION,"--no-invoker-iam-check","--quiet"],check=True)
    ro=load_readonly(); release=request(t,"https://firebaserules.googleapis.com/v1/projects/"+PROJECT+"/releases/cloud.firestore")
    require(release["rulesetName"]==approved["staging"]["firestoreRuleset"],"Firestore baseline changed")
    stored=request(t,"https://firebaserules.googleapis.com/v1/"+release["rulesetName"]); files=stored.get("source",{}).get("files",[]); require(len(files)==1,"Unexpected rules files")
    candidate=rules_text(files[0]["content"],(ROOT/"firestore.rules").read_text())
    latest=request(t,"https://firebasehosting.googleapis.com/v1beta1/sites/"+PROJECT+"/releases?pageSize=1")["releases"][0]
    require(latest["name"]==approved["staging"]["hostingRelease"] and latest["version"]["name"]==approved["staging"]["hostingVersion"],"Hosting baseline changed")
    old_version=latest["version"]["name"]; old=request(t,"https://firebasehosting.googleapis.com/v1beta1/"+old_version); old_manifest=manifest(t,old_version)
    require(ro.sha(json.dumps(sorted(old_manifest.items()),separators=(",",":")).encode())==approved["staging"]["hostingManifestSha256"],"Hosting manifest drift")
    bodies={}; proposed=dict(old_manifest)
    for path in HOSTING:
        raw=(ROOT/("public"+path)).read_bytes(); require(sha(raw)==approved["staging"]["reviewedHostingAllowlist"][path]["reviewedSha256"],"Hosting source mismatch: "+path)
        zipped=gzip.compress(raw,mtime=0); digest=sha(zipped); bodies[digest]=zipped; proposed[path]=digest
    status["lastOperation"]="create-ruleset"; save(status)
    ruleset=request(t,"https://firebaserules.googleapis.com/v1/projects/"+PROJECT+"/rulesets","POST",{"source":{"files":[{"name":"firestore.rules","content":candidate}]}})["name"]
    status.update(preparedRuleset=ruleset,lastOperation="create-hosting-version"); save(status)
    version=request(t,"https://firebasehosting.googleapis.com/v1beta1/sites/"+PROJECT+"/versions","POST",{"config":old.get("config",{})})["name"]
    upload="https://upload-firebasehosting.googleapis.com/upload/"+version+"/files"
    populated=request(t,"https://firebasehosting.googleapis.com/v1beta1/"+version+":populateFiles","POST",{"files":proposed})
    for digest in populated.get("uploadRequiredHashes",[]): require(digest in bodies,"Unapproved Hosting upload requested"); request(t,upload+"/"+digest,"POST",bodies[digest],True)
    request(t,"https://firebasehosting.googleapis.com/v1beta1/"+version+"?update_mask=status","PATCH",{"status":"FINALIZED"})
    status.update(preparedHostingVersion=version,lastOperation="activate-rules"); save(status)
    request(t,"https://firebaserules.googleapis.com/v1/projects/"+PROJECT+"/releases/cloud.firestore","PATCH",{"release":{"name":"projects/"+PROJECT+"/releases/cloud.firestore","rulesetName":ruleset},"updateMask":"rulesetName"})
    status["lastOperation"]="publish-hosting"; save(status)
    hosting_release=request(t,"https://firebasehosting.googleapis.com/v1beta1/sites/"+PROJECT+"/releases?"+urllib.parse.urlencode({"versionName":version}),"POST",{})["name"]
    after=inventory(t); require(len(after)==57,"Function count changed during publish")
    status.update(status="PASS_STAGING_RELEASE",ruleset=ruleset,hostingVersion=version,hostingRelease=hosting_release,rollback={"ruleset":approved["staging"]["firestoreRuleset"],"hostingVersion":old_version,"hostingRelease":approved["staging"]["hostingRelease"]},lastOperation="verified-release"); save(status)

if __name__=="__main__":
    import argparse
    p=argparse.ArgumentParser(); p.add_argument("mode",choices=("package","preflight-create","preflight-publish","create-functions","publish")); p.add_argument("--source",type=Path); p.add_argument("--out",type=Path); a=p.parse_args()
    if a.mode=="package": require(a.out is not None,"--out required"); package(a.out)
    elif a.mode=="preflight-create": print(json.dumps({"status":"PASS_CREATE_ONLY_PREFLIGHT","count":len(preflight_create()),"deploymentAuthorized":False}))
    elif a.mode=="preflight-publish": print(json.dumps({"status":"PASS_PUBLISH_PREFLIGHT","permissions":preflight_publish(),"deploymentAuthorized":False}))
    elif a.mode=="create-functions": require(a.source is not None,"--source required"); create_functions(a.source)
    else: publish_rules_hosting()
