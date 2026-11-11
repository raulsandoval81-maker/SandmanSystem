"""Read-only production receipt/Intake recovery inventory; never deploys or invokes callables."""
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request
import zipfile

PROJECT = 'sandmandashboard'
NUMBER = '889326401061'
SITE = 'sites/sandman-main'
SHA = '8b2c58868eaae79c9bddfdc1cd3afa9a50d72981'
MANAGEMENT_PROMOTION_SHA = '01dfea8ac9660a313a32b4a02ab210c921a2d9ef'
WORKFLOW = 'raulsandoval81-maker/SandmanSystem/.github/workflows/production-management-readonly-inventory.yml@refs/heads/main'
FUNCTIONS = {
 'sendEnrollmentIntakeEmail': (1, 'enrollment/sendEnrollmentIntakeEmail'),
 'recordManualEnrollmentIntakeDelivery': (1, 'enrollment/recordManualEnrollmentIntakeDelivery'),
 'sendProposalPrepaidCashReceipt': (2, 'billing/sendProposalPrepaidCashReceipt'),
 'approveAndActivate': (2, 'approveAndActivate'),
 'approveIntakeCall': (2, 'modules/approveIntakeCall'),
 'createAthleteFromIntakeCall': (2, 'modules/createAthleteFromIntakeCall'),
 'hydrateEnrollmentIntakePrefill': (2, 'enrollment/hydrateEnrollmentIntakePrefill'),
 'getEnrollmentPlacementActivity': (2, 'enrollment/enrollmentActivity'),
 'getAccessSetupStatus': (2, 'access/getAccessSetupStatus'),
 'recordProposalPrepaidCash': (2, 'billing/recordProposalPrepaidCash'),
}
ASSETS = ('/intake-management/management.intake.js', '/intake-management/enrollment-handoff-audience.js',
 '/intake-management/index.html', '/intake-management/review.js',
 '/intake-parent/parent.intake.js', '/intake-athlete/athlete.intake.js', '/waiver/index.html',
 '/connect/enrollment/enrollment.service.js')

# PR #632 source consumers and the PR #632/#636 Hosting surface. The older
# inventory remains available for its separately pinned release.
PROMOTION_FUNCTIONS = {
 'createProposalDraft': (2, 'proposals/createProposalDraft'),
 'updateProposalDraft': (2, 'proposals/updateProposalDraft'),
 'issueProposalClientReview': (2, 'proposals/issueProposalClientReview'),
}
PROMOTION_ASSETS = (
 '/management/pricing/pricing.js',
 '/connect/admissions/calculator/calculator.js',
 '/connect/admissions/calculator/payment-arrangement.js',
 '/connect/proposals/review/review.js',
)

def configure_inventory(profile):
 global SHA, FUNCTIONS, ASSETS
 require(profile in ('receipt-intake', 'management-promotion'), 'Unknown inventory profile')
 if profile == 'management-promotion':
  SHA = MANAGEMENT_PROMOTION_SHA
  FUNCTIONS = {**FUNCTIONS, **PROMOTION_FUNCTIONS}
  ASSETS = (*ASSETS, *PROMOTION_ASSETS)


def require(ok, message):
 if not ok: raise RuntimeError(message)

def sha(data): return hashlib.sha256(data).hexdigest()

def guard(env):
 for key, value in {'GITHUB_REPOSITORY':'raulsandoval81-maker/SandmanSystem',
  'GITHUB_REF':'refs/heads/main','GITHUB_WORKFLOW_REF':WORKFLOW,
  'CONFIRM_PROJECT':PROJECT,'CONFIRM_SOURCE_SHA':SHA}.items():
  require(env.get(key)==value, 'Unexpected '+key)

def sanitize(value):
 if isinstance(value,list): return [sanitize(v) for v in value]
 if isinstance(value,dict):
  return {k:({'keys':sorted(v),'sha256':sha(json.dumps(v,sort_keys=True).encode())}
   if k=='environmentVariables' else {'sha256':sha(str(v).encode())} if k=='value'
   else sanitize(v)) for k,v in value.items()
   if k not in {'downloadUrl','uploadUrl','sourceUploadUrl','sourceDownloadUrl'}}
 return value

class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs): return None

def permitted(url, payload=None, signed=False):
 p=urllib.parse.urlsplit(url)
 require(p.scheme=='https' and p.port in (None,443) and not p.username, 'Unsafe URL')
 if signed:
  require(payload is None and (p.hostname=='storage.googleapis.com' or
   (p.hostname or '').endswith('.storage.googleapis.com')), 'Unsafe signed archive URL')
  return
 allowed = {
  'cloudfunctions.googleapis.com':f'/v[12](?:alpha)?/projects/{PROJECT}/locations/us-central1/functions/',
  'run.googleapis.com':f'/v2/projects/{PROJECT}/locations/us-central1/services/',
  'firebasehosting.googleapis.com':f'/v1beta1/{SITE}/',
  'firebaserules.googleapis.com':f'/v1/projects/{PROJECT}/',
  'storage.googleapis.com':f'/storage/v1/b/gcf-v2-sources-{NUMBER}-us-central1/o/',
  'cloudresourcemanager.googleapis.com':f'/v1/projects/{PROJECT}:testIamPermissions$',
 }
 require(p.hostname in allowed and re.match(allowed[p.hostname],p.path), 'Outside production inventory scope')
 if payload is not None:
  require(p.path.endswith((':generateDownloadUrl',':testIamPermissions')), 'Mutation forbidden')
  if p.path.endswith(':generateDownloadUrl'):
   name=p.path.split('/')[-1].split(':')[0]
   require(name in FUNCTIONS,'Unapproved source target')
   require(payload=={} or set(payload)=={'versionId'},'Invalid source request')
  else: require(set(payload)=={'permissions'},'Invalid permission probe')

def storage_error_detail(error):
 # Emit only fixed categories, since Google's message can include identities or policy details.
 try:
  body = json.loads(error.read(16384)).get('error', {})
 except (ValueError, OSError):
  return ''
 if not isinstance(body, dict):
  return ''
 message = str(body.get('message', '')).lower()
 errors = body.get('errors') or []
 reasons = {entry.get('reason') for entry in errors if isinstance(entry, dict)}
 if 'vpcServiceControls' in reasons or 'vpc service controls' in message or "organization's policy" in message:
  return ' (organization perimeter or policy)'
 if 'insufficientAuthenticationScopes' in reasons or 'insufficient authentication scopes' in message:
  return ' (insufficient token scope)'
 if 'userProjectMissing' in reasons or 'requester pays' in message:
  return ' (Requester Pays billing project required)'
 if 'storage.objects.get' in message:
  return ' (storage.objects.get denied for the requested resource)'
 return ''


def request(url, token, payload=None, signed=False):
 permitted(url,payload,signed)
 headers={'Authorization':'Bearer '+token} if token else {}
 if payload is not None: headers['Content-Type']='application/json'
 req=urllib.request.Request(url,headers=headers,data=None if payload is None else json.dumps(payload).encode())
 try:
  with urllib.request.build_opener(NoRedirect()).open(req,timeout=45) as r: data=r.read(32*1024*1024+1)
 except urllib.error.HTTPError as error:
  path = urllib.parse.urlsplit(url).path
  detail = storage_error_detail(error) if path.startswith('/storage/v1/b/') and not signed else ''
  raise RuntimeError(f'{path}: HTTP {error.code}{detail}') from None
 require(len(data)<=32*1024*1024,'Response too large')
 return data

def source(name, gen, record, token):
 ref = {'versionId':str(record.get('versionId',''))} if gen==1 else (
  record.get('buildConfig',{}).get('sourceProvenance',{}).get('resolvedStorageSource') or
  record.get('buildConfig',{}).get('source',{}).get('storageSource',{}))
 if gen==1: require(ref['versionId'].isdigit(),'Missing Gen1 version')
 else:
  require(ref.get('bucket')==f'gcf-v2-sources-{NUMBER}-us-central1' and
   ref.get('object')==f'{name}/function-source.zip' and str(ref.get('generation','')).isdigit(),
   'Missing immutable Gen2 recovery reference')
 api='v1' if gen==1 else 'v2alpha'
 url=f'https://cloudfunctions.googleapis.com/{api}/projects/{PROJECT}/locations/us-central1/functions/{name}:generateDownloadUrl'
 download=json.loads(request(url,token,ref if gen==1 else {}))['downloadUrl']
 archive=request(download,None,signed=True)
 with zipfile.ZipFile(io.BytesIO(archive)) as z:
  names=[i.filename for i in z.infolist() if not i.is_dir()]
  require(len(names)==len(set(names)),'Duplicate archive paths')
  require(all(not n.startswith('/') and '..' not in Path(n).parts for n in names),'Unsafe archive path')
  fingerprints={n:sha(z.read(n)) for n in names}
 return {'reference':ref,'archiveSha256':sha(archive),'files':fingerprints,
  'recoveryMethod':api+'.generateDownloadUrl; recheck current source reference before restore'}

def closure(root, entry):
 pending=['lib/'+entry+'.js']; result={}
 while pending:
  path=pending.pop()
  if path in result: continue
  data=(root/path).read_bytes(); result[path]=sha(data)
  for relative in re.findall(r'require\(["\'](\.[^"\']+)["\']\)',data.decode()):
   target=os.path.normpath(str(Path(path).parent/relative))
   if not target.endswith('.js'): target+='.js'
   require(target.startswith('lib/'),'Candidate closure escapes lib')
   pending.append(target)
 return result

def manifest(get, version):
 files={}; seen=set(); cursor=''
 while True:
  q=urllib.parse.urlencode({'pageSize':1000,**({'pageToken':cursor} if cursor else {})})
  page=get('https://firebasehosting.googleapis.com/v1beta1/'+version+'/files?'+q)
  require(isinstance(page.get('files'),list),'Incomplete Hosting manifest')
  for f in page['files']:
   require(f.get('status')=='ACTIVE' and f['path'].startswith('/') and f['path'] not in files and
    re.fullmatch('[a-f0-9]{64}',f.get('hash','')),'Malformed Hosting entry')
   files[f['path']]=f['hash']
  cursor=page.get('nextPageToken')
  if not cursor: return files
  require(cursor not in seen,'Repeated Hosting cursor'); seen.add(cursor)

def main():
 guard(os.environ)
 root=Path('application'); out=Path('evidence/receipt-intake'); out.mkdir(parents=True,exist_ok=True)
 require(subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()==SHA,'Wrong candidate')
 token=subprocess.check_output(['gcloud','auth','print-access-token'],text=True).strip()
 get=lambda url:json.loads(request(url,token))
 result={'project':PROJECT,'candidate':SHA,'mode':'READ_ONLY','functions':{},'errors':[]}
 def capture(label, fn):
  try: return fn()
  except Exception as e:
   result['errors'].append({'check':label,'error':str(e) if isinstance(e,RuntimeError) else type(e).__name__})
 def function(name, gen, entry):
  url=f'https://cloudfunctions.googleapis.com/v{gen}/projects/{PROJECT}/locations/us-central1/functions/{name}'
  record=get(url); require(record.get('status' if gen==1 else 'state')=='ACTIVE',name+' not ACTIVE')
  state={'function':record,'iam':get(url+':getIamPolicy')}
  if gen==2:
   service=record['serviceConfig']['service']
   require(service==f'projects/{PROJECT}/locations/us-central1/services/{name.lower()}','Unexpected Run service')
   state['run']=get('https://run.googleapis.com/v2/'+service)
   state['runIam']=get('https://run.googleapis.com/v2/'+service+':getIamPolicy')
  item={'configuration':sanitize(state)}; result['functions'][name]=item
  recovery=source(name,gen,record,token); require(get(url)==record,name+' drifted during capture')
  expected=closure(root/'functions',entry)
  changes=[p for p,h in expected.items() if recovery['files'].get(p)!=h]
  item.update(recovery=recovery,candidateClosure=expected,changedClosure=changes,
   candidateMatches=not changes)
 for name,(gen,entry) in FUNCTIONS.items(): capture(name,lambda n=name,g=gen,e=entry:function(n,g,e))
 def hosting():
  base='https://firebasehosting.googleapis.com/v1beta1/'+SITE
  active=get(base+'/releases?pageSize=1')['releases']; require(len(active)==1,'No unique active Hosting release')
  release=active[0]; version=release['version']['name']; require(version.startswith(SITE+'/versions/'),'Wrong site')
  config=get('https://firebasehosting.googleapis.com/v1beta1/'+version)
  require(config['status']=='FINALIZED','Unfinalized active version')
  files=manifest(get,version); proposed=dict(files); assets={}
  for path in ASSETS:
   data=(root/('public'+path)).read_bytes()
   compressed=subprocess.run(['node','-e',"process.stdout.write(require('zlib').gzipSync(require('fs').readFileSync(0)))"],input=data,capture_output=True,check=True).stdout
   digest=sha(compressed); proposed[path]=digest
   assets[path]={'candidateSha256':sha(data),'hostingHash':digest,'baselineHash':files.get(path)}
  require(get(base+'/releases?pageSize=1')['releases']==active,'Hosting baseline drift')
  result['hosting']={'release':release['name'],'version':version,'rollbackVersion':version,
   'config':config['config'],'manifest':files,'proposedManifest':proposed,'assets':assets,
   'changedPaths':[p for p,h in proposed.items() if files.get(p)!=h]}
 capture('Hosting',hosting)
 def rules():
  base=f'https://firebaserules.googleapis.com/v1/projects/{PROJECT}'
  release=get(base+'/releases/cloud.firestore'); ruleset=get('https://firebaserules.googleapis.com/v1/'+release['rulesetName'])
  require(get(base+'/releases/cloud.firestore')==release,'Rules drift during capture')
  result['rules']={'release':release,'rollback':ruleset,
   'candidateSha256':sha((root/'firestore.rules').read_bytes())}
 capture('Rules',rules)
 required=['cloudfunctions.functions.get','cloudfunctions.functions.update','cloudfunctions.functions.sourceCodeGet',
  'cloudfunctions.functions.sourceCodeSet','run.services.get','run.services.getIamPolicy',
  'firebasehosting.sites.get','firebasehosting.sites.update','firebaserules.releases.get',
  'firebaserules.rulesets.get']
 def permissions():
  response=json.loads(request(f'https://cloudresourcemanager.googleapis.com/v1/projects/{PROJECT}:testIamPermissions',token,{'permissions':required}))
  result['permissions']={'required':required,'granted':response.get('permissions',[]),
   'missing':sorted(set(required)-set(response.get('permissions',[])))}
 capture('Permissions',permissions)
 result['status']='BLOCKED' if result['errors'] else 'INVENTORY_CAPTURED_NOT_DEPLOYMENT_APPROVAL'
 (out/'inventory.json').write_text(json.dumps(result,sort_keys=True,indent=2)+'\n')
 print(json.dumps({'status':result['status'],'errors':result['errors'],'deploymentEnabled':False}))
 return bool(result['errors'])

if __name__=='__main__':
 configure_inventory(os.environ.get('INVENTORY_PROFILE', 'receipt-intake'))
 raise SystemExit(main())
