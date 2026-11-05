#!/usr/bin/env python3
"""Read-only staging inventory and immutable rollback capture. No mutation APIs."""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import subprocess
import urllib.parse
import urllib.request
import zipfile

PROJECT = 'sandman-combat-staging'
REGION = 'us-central1'
SHA = 'f402c04ee27a5ca9309a422221c3556f6523588a'
FUNCTIONS = ['createProposalDraft', 'updateProposalDraft', 'issueProposalClientReview',
             'acceptProposalClientReview', 'createProposalCheckout', 'recordProposalPrepaidCash', 'stripeBillingWebhook']
ASSETS = ['/connect/admissions/calculator/index.html', '/connect/admissions/calculator/calculator.js',
          '/connect/admissions/calculator/payment-arrangement.js', '/connect/proposals/review/review.js',
          '/connect/enrollment/enrollment.js', '/management/billing/billing.js', '/management/billing/paid-in-full-state.js']

def require(ok, message):
    if not ok:
        raise RuntimeError(message)

def save(path, value):
    Path(path).write_text(json.dumps(value, sort_keys=True, indent=2) + '\n')

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()

def gc(args):
    return json.loads(subprocess.check_output(['gcloud', *args, '--project='+PROJECT, '--format=json'], text=True))

def function_state(name):
    require(name in FUNCTIONS, 'Unapproved function')
    f = gc(['functions', 'describe', name, '--gen2', '--region='+REGION])
    require(f['name'] == f'projects/{PROJECT}/locations/{REGION}/functions/{name}', 'Wrong project/region')
    require(f['state'] == 'ACTIVE' and f['environment'] == 'GEN_2', 'Existing Gen2 function must be ACTIVE')
    require(f['buildConfig']['runtime'] == 'nodejs22' and f['buildConfig']['entryPoint'] == name, 'Runtime/entrypoint drift')
    config = f['serviceConfig']
    require(config.get('environmentVariables', {}).get('SANDMAN_STAGING_ACK') == PROJECT and
            config.get('environmentVariables', {}).get('SANDMAN_STAGING_PROJECT_ID') == PROJECT, 'Missing staging isolation guards')
    account = config['serviceAccountEmail']
    require(account.endswith('@'+PROJECT+'.iam.gserviceaccount.com') or account == '991554514268-compute@developer.gserviceaccount.com', 'Runtime identity is outside staging')
    require(f['buildConfig']['serviceAccount'].startswith('projects/'+PROJECT+'/serviceAccounts/'), 'Build identity is outside staging')
    s = f['serviceConfig']['service'].rsplit('/', 1)[-1]
    require(s == name.lower(), 'Unexpected underlying service')
    return {'function': f,
            'functionIam': gc(['functions', 'get-iam-policy', name, '--gen2', '--region='+REGION]),
            'run': gc(['run', 'services', 'describe', s, '--region='+REGION]),
            'runIam': gc(['run', 'services', 'get-iam-policy', s, '--region='+REGION])}

def hosting_state(token):
    def get(path):
        request = urllib.request.Request('https://firebasehosting.googleapis.com/v1beta1/'+path,
                                         headers={'Authorization': 'Bearer '+token})
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.load(response)
    release = get(f'sites/{PROJECT}/releases?pageSize=1')['releases'][0]
    version = get(release['version']['name'])
    require(version['name'].startswith(f'sites/{PROJECT}/versions/') and version['status'] == 'FINALIZED', 'Wrong Hosting baseline')
    files, page = {}, ''
    while True:
        response = get(version['name']+'/files?pageSize=1000'+('&pageToken='+urllib.parse.quote(page, safe='') if page else ''))
        for entry in response.get('files', []):
            require(entry['path'] not in files, 'Duplicate manifest entry')
            files[entry['path']] = entry['hash']
        page = response.get('nextPageToken', '')
        if not page:
            break
    require(len(files) == int(version['fileCount']) and len(files) > 100, 'Incomplete Hosting manifest')
    for path in ['/assets/js/runtime-environment.js', '/staging-environment.json', '/assets/js/firebase-init.js', '/management/billing/prepaid-terms.js']:
        require(path in files, 'Missing staging dependency: '+path)
    return {'release': release, 'version': version, 'files': files}

def authorization_state(functions):
    accounts = set()
    for state in functions.values():
        f = state['function']
        accounts.add(f['serviceConfig']['serviceAccountEmail'])
        accounts.add(f['buildConfig']['serviceAccount'].rsplit('/', 1)[-1])
    policy = gc(['projects', 'get-iam-policy', PROJECT])
    deployers = {'serviceAccount:sandman-practice-deployer@'+PROJECT+'.iam.gserviceaccount.com',
                 'serviceAccount:sandman-staging-deployer@'+PROJECT+'.iam.gserviceaccount.com'}
    roles = sorted({b['role'] for b in policy.get('bindings', []) if deployers.intersection(b.get('members', []))})
    return {'projectIam': policy,
            'roles': {role: gc(['iam', 'roles', 'describe', role] if role.startswith('roles/') else ['iam', 'roles', 'describe', role.rsplit('/', 1)[-1]]) for role in roles},
            'provider': gc(['iam', 'workload-identity-pools', 'providers', 'describe', 'sandman-hybrid-staging', '--workload-identity-pool=sandman-github-staging', '--location=global']),
            'accounts': {a: gc(['iam', 'service-accounts', 'get-iam-policy', a]) for a in sorted(accounts)}}

def capture(out, token):
    out = Path(out); out.mkdir(parents=True, exist_ok=False)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        functions = dict(zip(FUNCTIONS, pool.map(function_state, FUNCTIONS)))
    state = {'project': PROJECT, 'applicationSha': SHA, 'functions': functions,
             'hosting': None if os.environ.get('PR482_DEFER_HOSTING') == '1' else hosting_state(token), 'authorization': authorization_state(functions)}
    save(out/'baseline.json', state)
    rollbacks = {}
    for name, config in functions.items():
        src = config['function']['buildConfig']['source']['storageSource']
        require(bool(src.get('generation')), 'Missing immutable source generation')
        path = out/(name+'.zip')
        subprocess.run(['gcloud', 'storage', 'cp', f"gs://{src['bucket']}/{src['object']}#{src['generation']}", str(path)], check=True, stdout=subprocess.DEVNULL)
        with zipfile.ZipFile(path) as archive:
            require(archive.testzip() is None, 'Corrupt rollback archive')
            require(not any(Path(p).name.startswith('.env') or 'gha-creds-' in p for p in archive.namelist()), 'Rollback contains credential/environment files; do not upload artifacts')
        data = path.read_bytes()
        require(bool(data), 'Empty rollback source')
        rollbacks[name] = {'source': src, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}
    save(out/'rollback.json', rollbacks)
    receipt = {'baselineSha256': digest(state), 'rollback': rollbacks,
               'hostingRelease': state['hosting']['release']['name'] if state['hosting'] else None,
               'hostingVersion': state['hosting']['version']['name'] if state['hosting'] else None,
               'fileCount': len(state['hosting']['files']) if state['hosting'] else None,
               'revisions': {n: s['function']['serviceConfig']['revision'] for n, s in functions.items()}}
    save(out/'receipt.json', receipt)
    return receipt

if __name__ == '__main__':
    import sys
    require(len(sys.argv) in [2,3], 'Usage: pr482-capture.py <evidence-directory> [--hosting]')
    access_token = subprocess.check_output(['gcloud', 'auth', 'print-access-token'], text=True).strip()
    if len(sys.argv) == 3:
        require(sys.argv[2] == '--hosting', 'Unexpected capture mode')
        folder = Path(sys.argv[1]); state = json.loads((folder/'baseline.json').read_text())
        require(state['hosting'] is None and state['project'] == PROJECT and state['applicationSha'] == SHA, 'Wrong pending capture')
        state['hosting'] = hosting_state(access_token); save(folder/'baseline.json', state)
        receipt = json.loads((folder/'receipt.json').read_text())
        receipt.update({'baselineSha256': digest(state), 'hostingRelease': state['hosting']['release']['name'],
                        'hostingVersion': state['hosting']['version']['name'], 'fileCount': len(state['hosting']['files'])})
        save(folder/'receipt.json', receipt)
    else:
        receipt = capture(sys.argv[1], access_token)
    print(json.dumps(receipt, sort_keys=True))
