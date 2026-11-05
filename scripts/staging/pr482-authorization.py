#!/usr/bin/env python3
"""Only the two outstanding read permissions, through protected staging WIF."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).parent
spec = importlib.util.spec_from_file_location('release', ROOT/'pr482-release.py')
r = importlib.util.module_from_spec(spec); spec.loader.exec_module(r)
PROJECT = r.c.PROJECT
PRINCIPAL = 'sandman-practice-deployer@'+PROJECT+'.iam.gserviceaccount.com'
PROVIDER = 'projects/991554514268/locations/global/workloadIdentityPools/sandman-github-staging/providers/sandman-hybrid-staging'
# Exact accounts in the preserved certified baseline; no discovery/list calls.
ACCOUNTS = ['991554514268-compute@developer.gserviceaccount.com',
            'sandman-billing-runtime@'+PROJECT+'.iam.gserviceaccount.com',
            'sandman-practice-build@'+PROJECT+'.iam.gserviceaccount.com',
            PRINCIPAL, 'sandman-staging-deployer@'+PROJECT+'.iam.gserviceaccount.com']

def guard():
    r.protected()
    r.require(os.environ.get('RELEASE_SCOPE') == 'payment-arrangements-authorization' and
              os.environ.get('RELEASE_ACTION') == 'validate', 'Read-only authorization scope required')
    path = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS', '')
    r.require(bool(path) and os.environ.get('CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE') == path,
              'Existing protected WIF credentials required')
    credentials = json.loads(Path(path).read_text())
    r.require(credentials.get('type') == 'external_account' and
              credentials.get('audience') == '//iam.googleapis.com/'+PROVIDER and
              credentials.get('service_account_impersonation_url') ==
              'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/'+PRINCIPAL+':generateAccessToken',
              'Wrong WIF provider or protected principal')

def verify(out):
    guard()
    out = Path(out); out.mkdir(parents=True, exist_ok=False)
    checks = [('iam.serviceAccounts.getIamPolicy', 'projects/'+PROJECT+'/serviceAccounts/'+a,
               ['iam', 'service-accounts', 'get-iam-policy', a]) for a in ACCOUNTS]
    checks.append(('iam.workloadIdentityPoolProviders.get', PROVIDER,
                   ['iam', 'workload-identity-pools', 'providers', 'describe', 'sandman-hybrid-staging',
                    '--workload-identity-pool=sandman-github-staging', '--location=global']))
    results = []
    for index, (permission, resource, args) in enumerate(checks):
        try:
            process = subprocess.run(['gcloud', *args, '--project='+PROJECT, '--format=json', '--quiet'],
                                     capture_output=True, text=True, timeout=60)
            entry = {'principal': PRINCIPAL, 'resource': resource, 'permission': permission,
                     'exitCode': process.returncode, 'error': process.stderr if process.returncode else ''}
            if process.returncode == 0:
                response = json.loads(process.stdout)
                r.require(isinstance(response, dict), 'Unexpected read response')
                if permission == 'iam.workloadIdentityPoolProviders.get':
                    r.require(response.get('name') == PROVIDER and response.get('state') == 'ACTIVE',
                              'Provider identity/state mismatch')
                r.save(out/(str(index)+'-response.json'), response)
                entry['responseSha256'] = r.c.digest(response)
        except (subprocess.TimeoutExpired, ValueError, RuntimeError) as error:
            entry = {'principal': PRINCIPAL, 'resource': resource, 'permission': permission,
                     'exitCode': -1, 'error': str(error)}
        results.append(entry)
        r.save(out/'results.json', {'applicationSha': r.c.SHA, 'project': PROJECT,
                                  'status': 'INCOMPLETE', 'checks': results})
        print(json.dumps(entry), flush=True)
    passed = len(results) == 6 and all(x['exitCode'] == 0 for x in results)
    r.save(out/'results.json', {'applicationSha': r.c.SHA, 'project': PROJECT,
                              'status': 'PASS' if passed else 'FAIL', 'checks': results})
    r.require(passed, 'Protected authorization reads failed; baseline remains unpinned')

if __name__ == '__main__':
    r.require(len(sys.argv) == 2, 'Usage: pr482-authorization.py <new-evidence-directory>')
    verify(sys.argv[1])
