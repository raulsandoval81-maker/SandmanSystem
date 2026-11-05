#!/usr/bin/env python3
"""Exact seven-path overlay preserving the complete live Hosting manifest."""
import argparse
import gzip
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).parent
spec = importlib.util.spec_from_file_location('release', ROOT/'pr482-release.py')
r = importlib.util.module_from_spec(spec); spec.loader.exec_module(r)
c, require, save = r.c, r.require, r.save

def request(token, method, path, payload=None):
    req = Request('https://firebasehosting.googleapis.com/v1beta1/'+path,
                  data=None if payload is None else json.dumps(payload).encode(), method=method,
                  headers={'Authorization': 'Bearer '+token, 'Content-Type': 'application/json'})
    with urlopen(req, timeout=90) as response:
        return json.load(response)

def overlay(source, files):
    updated, blobs, changed = dict(files), {}, []
    for dest in c.ASSETS:
        require(dest in files or dest == '/connect/admissions/calculator/payment-arrangement.js', 'Approved existing path is missing')
        body = (Path(source)/('public'+dest)).read_bytes()
        blob = gzip.compress(body, mtime=0); h = hashlib.sha256(blob).hexdigest()
        updated[dest] = h; blobs[h] = blob
        if files.get(dest) != h:
            changed.append(dest)
    require(set(changed) == set(c.ASSETS), 'Expected exact seven-asset change set')
    require(all(updated[p] == h for p, h in files.items() if p not in c.ASSETS), 'Unrelated asset changed')
    return updated, blobs

def run(mode, source, baseline, out, verified):
    m = r.protected(mode == 'deploy')
    require(subprocess.check_output(['git', '-C', source, 'rev-parse', 'HEAD'], text=True).strip() == c.SHA, 'Source drift')
    state = json.loads((Path(baseline)/'baseline.json').read_text())
    require(c.digest(state) == m['baselineSha256'], 'Baseline pin missing or mismatched')
    token = os.environ.get('STAGING_HOSTING_TOKEN', '')
    require(bool(token), 'Existing staging Hosting credential required')
    live = c.hosting_state(token)
    require(live == state['hosting'], 'Live Hosting baseline drift')
    dependency = (Path(source)/'public/management/billing/prepaid-terms.js').read_bytes()
    require(hashlib.sha256(gzip.compress(dependency, mtime=0)).hexdigest() == live['files']['/management/billing/prepaid-terms.js'], 'Unchanged V2 dependency is incompatible')
    updated, blobs = overlay(source, live['files'])
    out = Path(out); out.mkdir(parents=True, exist_ok=True)
    save(out/'hosting-before.json', live); save(out/'hosting-candidate-files.json', updated)
    if mode == 'verify':
        return
    require(verified is not None, 'Function evidence required')
    aggregate = json.loads((Path(verified)/'all-functions-verified.json').read_text())
    require(aggregate == {'sourceSha': c.SHA, 'baselineSha256': m['baselineSha256'], 'functions': c.FUNCTIONS}, 'Seven-function authorization/configuration verification is incomplete')
    for name in c.FUNCTIONS:
        receipt = json.loads((Path(verified)/(name+'-verified.json')).read_text())
        require(receipt['sourceSha'] == c.SHA, 'Missing Function verification')
    version = request(token, 'POST', f'sites/{c.PROJECT}/versions', {'config': live['version']['config']})
    files = list(updated.items())
    for i in range(0, len(files), 900):
        response = request(token, 'POST', version['name']+':populateFiles', {'files': dict(files[i:i+900])})
        for h in response.get('uploadRequiredHashes', []):
            require(h in blobs, 'Unrelated file upload requested')
            req = Request(response['uploadUrl']+'/'+h, data=blobs[h], method='POST',
                          headers={'Authorization': 'Bearer '+token, 'Content-Type': 'application/octet-stream'})
            with urlopen(req, timeout=90):
                pass
    request(token, 'PATCH', version['name']+'?updateMask=status', {'status': 'FINALIZED'})
    require(c.hosting_state(token) == live, 'Hosting drift before publication')
    release = request(token, 'POST', f'sites/{c.PROJECT}/releases?versionName='+quote(version['name'], safe='/'), {})
    save(out/'hosting-published.json', {'release': release, 'rollbackVersion': live['version']['name']})
    after = c.hosting_state(token); save(out/'hosting-after.json', after)
    require(after['files'] == updated and after['version']['config'] == live['version']['config'], 'Published manifest/config mismatch')
    for dest in c.ASSETS:
        with urlopen(f'https://{c.PROJECT}.web.app'+dest+'?release='+version['name'].rsplit('/', 1)[-1], timeout=60) as response:
            body = response.read()
        require(body == (Path(source)/('public'+dest)).read_bytes(), 'Published asset byte mismatch')
    save(out/'release-verified.json', {'release': release['name'], 'version': version['name'], 'sourceSha': c.SHA,
                                    'rollbackVersion': live['version']['name'], 'functions': c.FUNCTIONS, 'assets': c.ASSETS})

if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('mode', choices=['verify', 'deploy'])
    p.add_argument('--source', required=True); p.add_argument('--baseline', required=True); p.add_argument('--out', required=True)
    p.add_argument('--verified-functions'); a = p.parse_args()
    run(a.mode, a.source, a.baseline, a.out, a.verified_functions)
