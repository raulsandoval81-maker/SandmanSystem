import hashlib,json,os,pathlib,subprocess,sys,urllib.request,urllib.parse,urllib.error,zipfile,io
PROJECT='sandman-combat-staging'
TARGETS=['sendEnrollmentIntakeEmail','recordManualEnrollmentIntakeDelivery']
DEPENDENCIES=['sendProposalPrepaidCashReceipt','createAthleteOnboardingToken','getEnrollmentIntakeHandoffStatus','hydrateEnrollmentIntakePrefill','consumeSubmittedIntakeToken','approveAndActivate','getEnrollmentPlacementActivity','getAccessSetupStatus']
E=pathlib.Path('evidence/functions');E.mkdir(parents=True,exist_ok=True)
def run(args,check=True):
 p=subprocess.run(['gcloud',*args,'--project='+PROJECT,'--format=json'],text=True,capture_output=True)
 if p.returncode:
  if check: raise RuntimeError('Read failed: '+' '.join(args[:3])+': '+p.stderr[:1500])
  return {'error':p.stderr[:1500]}
 return json.loads(p.stdout or '{}')
def redact(v):
 if isinstance(v,dict):return {k:({'sha256':hashlib.sha256(json.dumps(x,sort_keys=True).encode()).hexdigest(),'keys':sorted(x)} if k=='environmentVariables' and isinstance(x,dict) else redact(x)) for k,x in v.items()}
 if isinstance(v,list):return [redact(x) for x in v]
 return v
def save(name,v): (E/(name+'.json')).write_text(json.dumps(redact(v),indent=2)+'\n')
def digest(v):return hashlib.sha256(json.dumps(v,sort_keys=True).encode()).hexdigest()
def inventory():
 v=run(['functions','list']);save('all-functions',v);return v
def describe(name):
 v=run(['functions','describe',name],False)
 if v.get('error') or v.get('environment')=='GEN_2' or v.get('buildConfig'):v=run(['functions','describe',name,'--gen2'],False)
 return v
def capture_source(name,version):
 token=subprocess.check_output(['gcloud','auth','print-access-token'],text=True).strip()
 endpoint='https://cloudfunctions.googleapis.com/v1/projects/'+PROJECT+'/locations/us-central1/functions/'+name+':generateDownloadUrl'
 req=urllib.request.Request(endpoint,data=json.dumps({'versionId':version}).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},method='POST')
 try:
  result=json.load(urllib.request.urlopen(req,timeout=30))
 except urllib.error.HTTPError as e:
  raise RuntimeError(name+' rollback URL generation failed: HTTP '+str(e.code)) from None
 url=result['downloadUrl'];host=urllib.parse.urlparse(url).hostname
 assert host=='storage.googleapis.com' or host.endswith('.storage.googleapis.com'),'Unexpected source download host'
 try:
  archive=urllib.request.urlopen(url,timeout=30).read(32*1024*1024+1)
 except urllib.error.HTTPError as e:
  raise RuntimeError(name+' rollback archive fetch failed: HTTP '+str(e.code)) from None
 assert len(archive)<=32*1024*1024 and zipfile.is_zipfile(io.BytesIO(archive)),'Invalid rollback source archive'
 (E/(name+'-rollback-source.zip')).write_bytes(archive)
 return {'versionId':version,'archiveSha256':hashlib.sha256(archive).hexdigest(),'bytes':len(archive)}
def baseline():
 allv=inventory();before={}
 for name in TARGETS+DEPENDENCIES:
  v=describe(name);save(name+'-before',v)
  if name in TARGETS:
   assert not v.get('error'),name+' is missing or inaccessible'
   assert v.get('status')=='ACTIVE' and v.get('runtime')=='nodejs22' and not v.get('buildConfig'),name+' is not expected ACTIVE Gen1 nodejs22'
   iam=run(['functions','get-iam-policy',name]);save(name+'-iam-before',iam)
   source=capture_source(name,v['versionId']);save(name+'-rollback-source',source)
   before[name]={'function':v,'iam':iam,'rollbackSource':source}
 pathlib.Path('/tmp/phase2c-baseline.json').write_text(json.dumps(before))
 save('baseline-fingerprints',{k:digest(v) for k,v in before.items()})
 print(json.dumps({'project':PROJECT,'targets':TARGETS,'dependencies':DEPENDENCIES,'baselineCaptured':True,'functionBaseline':digest(before)}))
 return allv,before
runtime_keys=['runtime','serviceAccountEmail','buildServiceAccount','availableMemoryMb','timeout','maxInstances','minInstances','ingressSettings','vpcConnector','vpcConnectorEgressSettings','environmentVariables','secretEnvironmentVariables','secretVolumes','httpsTrigger']
mode=sys.argv[1]
assert os.environ.get('GITHUB_WORKFLOW_REF')=='raulsandoval81-maker/SandmanSystem/.github/workflows/staging-exact-sha-release.yml@refs/heads/main'
assert os.environ.get('GITHUB_REF')=='refs/heads/main'
assert mode in ['preflight','deploy']
# Read-only server errors. No Firestore data queries, secret payloads, or IAM writes.
for name in ['getenrollmentplacementactivity','getaccesssetupstatus']:
 logs=run(['logging','read','resource.type="cloud_run_revision" AND resource.labels.service_name="'+name+'" AND severity>=ERROR','--limit=8','--freshness=2d'],False)
 # Only diagnostic messages, never request headers or authenticated payloads.
 summary=[{'timestamp':x.get('timestamp'),'severity':x.get('severity'),'message':x.get('textPayload') or x.get('jsonPayload',{}).get('message')} for x in logs] if isinstance(logs,list) else logs
 save(name+'-errors',summary);print(json.dumps({'diagnostic':name,'errors':summary}))
allv,before=baseline()
if mode=='preflight':sys.exit(0)
assert os.environ.get('DEPLOY_APPROVAL')=='APPROVE_PHASE2C_STAGING_TWO_FUNCTIONS_TWO_ASSETS'
assert os.environ.get('EXPECTED_FUNCTION_BASELINE')==digest(before),'Function baseline changed after preflight'
for name in TARGETS:
 v=before[name]['function']
 security_level=(v.get('httpsTrigger') or {}).get('securityLevel')
 assert security_level in ('SECURE_ALWAYS','SECURE_OPTIONAL'),name+' has unknown HTTPS security level; refusing deployment'
 security_flag={'SECURE_ALWAYS':'secure-always','SECURE_OPTIONAL':'secure-optional'}[security_level]
 cmd=['gcloud','functions','deploy',name,'--no-gen2','--project='+PROJECT,'--region=us-central1','--runtime='+v['runtime'],'--entry-point='+name,'--source=/tmp/phase2c-package','--trigger-http','--security-level='+security_flag,'--quiet']
 # Existing deployment retains all unspecified configuration and secret bindings.
 p=subprocess.run(cmd,text=True,capture_output=True)
 if p.returncode:raise RuntimeError('Deploy failed for '+name+': '+p.stderr[:1500])
 after=describe(name);iam=run(['functions','get-iam-policy',name]);save(name+'-after',after);save(name+'-iam-after',iam)
 assert after.get('status')=='ACTIVE',name+' is not ACTIVE'
 for key in runtime_keys:assert v.get(key)==after.get(key),name+' configuration changed: '+key
 assert before[name]['iam'].get('bindings',[])==iam.get('bindings',[]),name+' IAM changed'
 assert v.get('versionId')!=after.get('versionId'),name+' version did not change'
 print(json.dumps({'deployed':name,'beforeVersion':v.get('versionId'),'afterVersion':after.get('versionId'),'configurationPreserved':True,'iamPreserved':True}))
afterall=run(['functions','list']);save('all-functions-after',afterall)
def untouched(values):
 # Cloud Functions may reorder Firestore event filters when listing unchanged
 # functions. Compare them as a multiset, but retain every filter value and
 # strictly compare all other inventory fields.
 result={}
 for item in values:
  name=item['name']
  if name.split('/')[-1] in TARGETS:continue
  normalized=json.loads(json.dumps(item))
  trigger=normalized.get('eventTrigger')
  if isinstance(trigger,dict) and isinstance(trigger.get('eventFilters'),list):
   trigger['eventFilters']=sorted(trigger['eventFilters'],key=lambda v:json.dumps(v,sort_keys=True,separators=(',',':')))
  result[name]=normalized
 return result
assert untouched(allv)==untouched(afterall),'Unrelated function inventory changed'
