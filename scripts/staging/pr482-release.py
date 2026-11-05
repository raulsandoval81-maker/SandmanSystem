#!/usr/bin/env python3
"""Pinned PR482 packaging and sequential update; no IAM mutation or broad deploy."""
import argparse
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import time
import zipfile

ROOT = Path(__file__).parent
spec = importlib.util.spec_from_file_location('capture', ROOT/'pr482-capture.py')
c = importlib.util.module_from_spec(spec); spec.loader.exec_module(c)
require, save = c.require, c.save

def manifest():
    m = json.loads((ROOT/'pr482-release.json').read_text())
    require(m['project'] == c.PROJECT and m['region'] == c.REGION and m['applicationSha'] == c.SHA, 'Wrong release boundary')
    require(m['functions'] == c.FUNCTIONS and m['assets'] == c.ASSETS, 'Scope drift')
    require(all(m[k] is False for k in ['deploymentAuthorized', 'productionAuthorized', 'automaticRollback']), 'Authorization policy drift')
    return m

def protected(deploy=False):
    m = manifest()
    expected = {'GITHUB_REPOSITORY': 'raulsandoval81-maker/SandmanSystem', 'GITHUB_REF': 'refs/heads/main',
                'GITHUB_EVENT_NAME': 'workflow_dispatch', 'CONFIRM_PROJECT': c.PROJECT,
                'GITHUB_WORKFLOW_REF': 'raulsandoval81-maker/SandmanSystem/.github/workflows/paid-in-full-v2-readonly-preflight.yml@refs/heads/main'}
    require(all(os.environ.get(k) == v for k, v in expected.items()), 'Protected staging dispatch required')
    if deploy:
        require(os.environ.get('APPROVE_RELEASE') == m['approval'], 'Separate explicit exact-scope approval required')
    return m

def baseline_fingerprints(state):
    """Public-safe field diagnostics: hashes only, never raw cloud metadata."""
    fingerprints = {}
    def walk(value, path):
        if isinstance(value, dict):
            for key in sorted(value):
                child = path + '/' + str(key).replace('~', '~0').replace('/', '~1')
                # Cloud configuration can contain secrets or identifying values.
                if any(word in key.lower() for word in ('secret', 'password', 'token', 'credential', 'environmentvariables')):
                    fingerprints[child] = '[sensitive-field-omitted]'
                else:
                    walk(value[key], child)
        elif isinstance(value, list):
            for i, child in enumerate(value):
                walk(child, path + '/' + str(i))
        else:
            fingerprints[path or '/'] = c.digest(value)
    walk(state, '')
    return fingerprints


def write_baseline_mismatch(state, expected, out):
    """Leave the pin intact and preserve a comparison fingerprint on mismatch."""
    observed = c.baseline_digest(state)
    if observed == expected:
        return False
    diagnostic = {
        'expectedBaselineSha256': expected,
        'observedBaselineSha256': observed,
        'fingerprints': baseline_fingerprints(state),
        'note': 'Compare fingerprint paths with the certified baseline locally; raw values are omitted.',
    }
    save(Path(out).parent/'baseline-mismatch.json', diagnostic)
    print('Pinned baseline mismatch: expected=' + str(expected) + ' observed=' + observed, flush=True)
    print('Safe field fingerprints: ' + str(Path(out).parent/'baseline-mismatch.json'), flush=True)
    return True


def contents(path):
    with zipfile.ZipFile(path) as z:
        require(z.testzip() is None, 'Corrupt rollback archive')
        names = z.namelist()
        require(len(names) == len(set(names)), 'Duplicate source archive entry')
        for entry in z.infolist():
            p = Path(entry.filename)
            require(not p.is_absolute() and '..' not in p.parts and '\\' not in entry.filename, 'Unsafe archive path')
            require((entry.external_attr >> 16) & 0o170000 != 0o120000, 'Source symlinks are forbidden')
        return {e.filename: z.read(e) for e in z.infolist() if not e.is_dir()}

def hashes(files):
    return {k: hashlib.sha256(v).hexdigest() for k, v in files.items()}

def package(source, baseline, out, candidate=False):
    m = manifest(); source, baseline, out = map(Path, [source, baseline, out])
    require(subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip() == c.SHA, 'Source SHA drift')
    state = json.loads((baseline/'baseline.json').read_text())
    receipt = json.loads((baseline/'rollback.json').read_text())
    expected_digest = json.loads((baseline/'receipt.json').read_text())['baselineSha256'] if candidate else m['baselineSha256']
    require(isinstance(expected_digest, str) and len(expected_digest) == 64, 'Pinned baseline digest is missing')
    require(not write_baseline_mismatch(state, expected_digest, out), 'Pinned live baseline is not certified')
    require(set(receipt) == set(c.FUNCTIONS), 'Incomplete rollback set')
    out.mkdir(parents=True, exist_ok=False)
    for name in c.FUNCTIONS:
        archive = baseline/(name+'.zip')
        require(hashlib.sha256(archive.read_bytes()).hexdigest() == receipt[name]['sha256'], 'Rollback checksum mismatch')
        require(receipt[name]['source'] == state['functions'][name]['function']['buildConfig']['source']['storageSource'], 'Rollback generation mismatch')
        files = contents(archive)
        require('package.json' in files, 'Source package root is unknown')
        pkg = json.loads(files['package.json'])
        main = pkg.get('main', 'index.js')
        require(main in files and not main.startswith('/') and '..' not in Path(main).parts, 'Unknown preserved entrypoint')
        require(not any(Path(p).name == '.env' or Path(p).name.startswith('.env.') for p in files), 'Rollback source contains environment files; separate recovery review required')
        original_main = files[main]
        original = hashes(files)
        for module in m['modules']:
            target = 'lib/'+module
            files[target] = (source/'functions'/target).read_bytes()
        # Reuse the deployed entrypoint and credential isolation. Cloud Build
        # must not regenerate lib from the preserved, older TypeScript source.
        pkg.setdefault('scripts', {})['gcp-build'] = ''
        files['package.json'] = (json.dumps(pkg, indent=2)+'\n').encode()
        require(name.encode() in original_main, 'Preserved entrypoint does not explicitly export the target')
        require(files[main] == original_main, 'Entrypoint changed')
        allowed = {'package.json', *('lib/'+p for p in m['modules'])}
        changes = {p for p, h in hashes(files).items() if h != original.get(p)}
        require(changes <= allowed and set(original) <= set(files), 'Unapproved package changes')
        folder = out/name; folder.mkdir()
        for path, data in files.items():
            dest = folder/path; dest.parent.mkdir(parents=True, exist_ok=True); dest.write_bytes(data)
        # Fail closed on a missing transitive relative import before deployment.
        pending, seen = [main], set()
        while pending:
            path = pending.pop()
            if path in seen or not path.endswith(('.js', '.cjs')):
                continue
            seen.add(path)
            for target in re.findall(r'require\(["\x27](\.[^"\x27]+)["\x27]\)', files[path].decode('utf-8')):
                resolved = os.path.normpath(str(Path(path).parent/target))
                found = next((p for p in [resolved, resolved+'.js', resolved+'.json', resolved+'/index.js'] if p in files), None)
                require(not resolved.startswith('../') and found is not None, 'Missing relative dependency: '+resolved)
                pending.append(found)
        save(out/(name+'-files.json'), hashes(files))
        save(out/(name+'-changes.json'), sorted(changes))
    save(out/'prepared.json', {'sourceSha': c.SHA, 'baselineSha256': expected_digest, 'functions': c.FUNCTIONS, **({'candidateOnly': True} if candidate else {})})

def compare_after(before, after):
    require(before['functionIam'] == after['functionIam'] and before['runIam'] == after['runIam'], 'Invocation IAM changed')
    a, b = copy.deepcopy(before['function']), copy.deepcopy(after['function'])
    require(b['state'] == 'ACTIVE' and a['serviceConfig']['revision'] != b['serviceConfig']['revision'], 'Expected new ACTIVE revision missing')
    for value in [a, b]:
        value.pop('updateTime', None)
        for key in ['build', 'source', 'sourceProvenance']:
            value['buildConfig'].pop(key, None)
        value['serviceConfig'].pop('revision', None)
    require(a == b, 'Function configuration drift after deployment')
    a, b = copy.deepcopy(before['run']), copy.deepcopy(after['run'])
    for value in [a, b]:
        value['spec']['template']['metadata'].pop('name', None)
        for container in value['spec']['template']['spec']['containers']:
            container.pop('image', None)
    # Cloud Functions may add precisely these provider-owned identity labels
    # when gcloud deploys a new Gen2 revision. Run #15 demonstrated only
    # these additions; all other Cloud Run spec fields stay strict.
    function_path = before['function']['name']
    match = re.fullmatch(r'projects/' + re.escape(c.PROJECT) +
                         r'/locations/(' + re.escape(c.REGION) +
                         r')/functions/([A-Za-z0-9_]+)', function_path)
    require(match is not None, 'Unexpected Function identity')
    prior_labels = a['spec']['template']['metadata'].get('labels', {})
    deployed_labels = b['spec']['template']['metadata'].get('labels', {})
    allowed_additions = {
        'goog-drz-cloudfunctions-id': match.group(2).lower(),
        'goog-drz-cloudfunctions-location': match.group(1),
    }
    for key, expected_value in allowed_additions.items():
        if key not in prior_labels and deployed_labels.get(key) == expected_value:
            deployed_labels.pop(key)
    if not deployed_labels and 'labels' not in a['spec']['template']['metadata']:
        b['spec']['template']['metadata'].pop('labels', None)
    require(a['spec'] == b['spec'], 'Cloud Run runtime specification changed')
    for key in ['run.googleapis.com/ingress', 'run.googleapis.com/invoker-iam-disabled', 'run.googleapis.com/custom-audiences']:
        require(a['metadata']['annotations'].get(key) == b['metadata']['annotations'].get(key), 'Cloud Run invocation changed')

def deploy_function(name, baseline, packages, out):
    m = protected(True)
    require(name in c.FUNCTIONS, 'Function is outside release scope')
    state = json.loads((Path(baseline)/'baseline.json').read_text())
    require(c.baseline_digest(state) == m['baselineSha256'], 'Pinned baseline required')
    require(json.loads((Path(packages)/'prepared.json').read_text()) == {'sourceSha': c.SHA, 'baselineSha256': m['baselineSha256'], 'functions': c.FUNCTIONS}, 'Unverified packages')
    before = state['functions'][name]
    require(c.function_state(name) == before, 'Function drift immediately before deployment')
    require(c.authorization_state(state['functions']) == state['authorization'], 'Authorization drift')
    folder = Path(packages)/name
    actual = hashes({str(p.relative_to(folder)): p.read_bytes() for p in folder.rglob('*') if p.is_file()})
    require(actual == json.loads((Path(packages)/(name+'-files.json')).read_text()), 'Package changed')
    f = before['function']; s, b = f['serviceConfig'], f['buildConfig']
    args = ['gcloud', 'functions', 'deploy', name, '--gen2', '--project='+c.PROJECT, '--region='+c.REGION,
            '--runtime=nodejs22', '--entry-point='+name, '--source='+str(folder.resolve()),
            '--run-service-account='+s['serviceAccountEmail'], '--build-service-account='+b['serviceAccount'],
            '--cpu='+s['availableCpu'], '--memory='+s['availableMemory'], '--timeout='+str(s['timeoutSeconds'])+'s',
            '--max-instances='+str(s['maxInstanceCount']), '--concurrency='+str(s['maxInstanceRequestConcurrency']), '--quiet']
    require(s['ingressSettings'] == 'ALLOW_ALL', 'Unreviewed ingress')
    args.append('--ingress-settings=all')
    Path(out).mkdir(parents=True, exist_ok=True); save(Path(out)/(name+'-command.json'), args)
    subprocess.run(args, check=True)
    after = c.function_state(name); save(Path(out)/(name+'-after.json'), after)
    compare_after(before, after)
    src = after['function']['buildConfig']['source']['storageSource']
    require(bool(src.get('generation')), 'New source is not immutable')
    deployed = Path(out)/(name+'-deployed.zip')
    subprocess.run(['gcloud', 'storage', 'cp', f"gs://{src['bucket']}/{src['object']}#{src['generation']}", str(deployed)], check=True)
    uploaded = hashes(contents(deployed))
    # The CLI may supply its source-ignore metadata, never application code.
    require({k:v for k,v in uploaded.items() if k != '.gcloudignore'} == {k:v for k,v in actual.items() if k != '.gcloudignore'}, 'Deployed package differs from verified candidate')
    revision = after['function']['serviceConfig']['revision']
    logs = []
    for attempt in range(4):
        logs = c.gc(['logging', 'read', 'resource.type="cloud_run_revision" AND resource.labels.revision_name="'+revision+'"', '--limit=50'])
        if any('STARTUP TCP probe succeeded' in x.get('textPayload', '') for x in logs):
            break
        if attempt < 3:
            time.sleep(5)
    save(Path(out)/(name+'-logs.json'), logs)
    require(any('STARTUP TCP probe succeeded' in x.get('textPayload', '') for x in logs), 'Startup readiness not verified; stop')
    require(not any(x.get('severity') in ['ERROR', 'CRITICAL', 'ALERT', 'EMERGENCY'] for x in logs), 'Startup errors; stop')
    save(Path(out)/(name+'-verified.json'), {'revision': revision, 'sourceSha': c.SHA})

def aggregate(baseline, packages, out):
    m = protected(True)
    state = json.loads((Path(baseline)/'baseline.json').read_text())
    require(c.baseline_digest(state) == m['baselineSha256'], 'Pinned baseline required')
    require(c.authorization_state(state['functions']) == state['authorization'], 'Authorization drift')
    for name in c.FUNCTIONS:
        receipt = json.loads((Path(out)/(name+'-verified.json')).read_text())
        after = json.loads((Path(out)/(name+'-after.json')).read_text())
        require(receipt['sourceSha'] == c.SHA and c.function_state(name) == after, 'Missing verification or post-update drift')
    save(Path(out)/'all-functions-verified.json', {'sourceSha': c.SHA, 'baselineSha256': m['baselineSha256'], 'functions': c.FUNCTIONS})

if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('mode', choices=['package', 'function', 'aggregate'])
    p.add_argument('--source'); p.add_argument('--baseline', required=True); p.add_argument('--out', required=True)
    p.add_argument('--packages'); p.add_argument('--name'); args = p.parse_args()
    protected(args.mode != 'package')
    if args.mode == 'package':
        package(args.source, args.baseline, args.out)
    elif args.mode == 'aggregate':
        aggregate(args.baseline, args.packages, args.out)
    else:
        deploy_function(args.name, args.baseline, args.packages, args.out)
