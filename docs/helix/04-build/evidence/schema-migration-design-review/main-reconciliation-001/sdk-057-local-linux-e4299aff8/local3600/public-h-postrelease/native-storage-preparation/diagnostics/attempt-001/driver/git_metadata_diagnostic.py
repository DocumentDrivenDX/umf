import hashlib
import json
import os
import pathlib
import subprocess
import sys
import time
import urllib.parse

sources = [('/host-producer', 'host-producer-clone'), ('/volume-producer', 'qualified-P-volume')]
expected = json.loads(pathlib.Path('/diagnostic/expected.json').read_text())
env = dict(os.environ)
env.update({'GIT_OPTIONAL_LOCKS': '0', 'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': '/dev/null', 'HOME': '/tmp/home'})
pathlib.Path('/tmp/home').mkdir(exist_ok=True)

def digest(data): return hashlib.sha256(data).hexdigest()

def origin_shape(raw):
    value = raw.strip()
    if value.startswith('git@') and ':' in value:
        authority, path = value.split(':', 1)
        host = authority.rsplit('@', 1)[1]
        scheme = 'ssh'
        username = True
        password = False
    else:
        parsed = urllib.parse.urlsplit(value)
        scheme = parsed.scheme
        host = parsed.hostname or ''
        path = parsed.path.lstrip('/')
        username = parsed.username is not None
        password = parsed.password is not None
    return {'scheme': scheme, 'host': host, 'path': path.removesuffix('.git'),
            'hasUserInfo': username or password, 'rawUrlSha256': digest(value.encode())}

def run_git(root, label, args, timeout):
    argv = ['git', '-C', str(root), *args]
    start = time.monotonic()
    try:
        result = subprocess.run(argv, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                timeout=timeout, check=False)
        duration = time.monotonic() - start
        row = {'name': label, 'argv': argv, 'timeoutSeconds': timeout,
               'durationSeconds': round(duration, 6), 'exitCode': result.returncode,
               'timedOut': False, 'stdoutBytes': len(result.stdout), 'stdoutSha256': digest(result.stdout),
               'stderrBytes': len(result.stderr), 'stderrSha256': digest(result.stderr)}
        return row, result.stdout, result.stderr
    except subprocess.TimeoutExpired as exc:
        duration = time.monotonic() - start
        out = exc.stdout or b''; err = exc.stderr or b''
        if isinstance(out, str): out = out.encode()
        if isinstance(err, str): err = err.encode()
        return {'name': label, 'argv': argv, 'timeoutSeconds': timeout,
                'durationSeconds': round(duration, 6), 'exitCode': None, 'timedOut': True,
                'stdoutBytes': len(out), 'stdoutSha256': digest(out),
                'stderrBytes': len(err), 'stderrSha256': digest(err)}, out, err

results=[]
for root_text, source_name in sources:
    root = pathlib.Path(root_text)
    source = {'name': source_name, 'path': root_text, 'commands': [], 'summary': {}}
    commands = [
        ('root', ['rev-parse', '--show-toplevel'], 15),
        ('HEAD', ['rev-parse', 'HEAD'], 15),
        ('HEAD-tree', ['rev-parse', 'HEAD^{tree}'], 15),
        ('status', ['status', '--porcelain'], 30),
        ('remote-names', ['remote'], 15),
        ('origin-url-sanitized', ['remote', 'get-url', 'origin'], 15),
        ('release-M-object', ['cat-file', '-e', expected['M']+'^{commit}'], 15),
        ('HEAD-ancestor-of-M', ['merge-base', '--is-ancestor', expected['P'], expected['M']], 15),
        ('release-tag-commit', ['rev-parse', 'refs/tags/'+expected['tag']+'^{commit}'], 15),
    ]
    values={}
    for label, argv, timeout in commands:
        row, out, err = run_git(root, label, argv, timeout)
        source['commands'].append(row)
        if label=='status':
            status_text=out.decode('utf-8','replace')
            values[label]={'clean':len(out)==0,'lineCount':len([x for x in status_text.splitlines() if x]),'bytes':len(out),'sha256':digest(out)}
        elif label=='remote-names':
            values[label]=out.decode('utf-8','replace').splitlines()
        elif label=='origin-url-sanitized' and row['exitCode']==0 and not row['timedOut']:
            values[label]=origin_shape(out.decode('utf-8','replace'))
        elif label in ('root','HEAD','HEAD-tree','release-tag-commit') and row['exitCode']==0 and not row['timedOut']:
            values[label]=out.decode('utf-8','replace').strip()
        else:
            values[label]={'exitCode':row['exitCode'],'timedOut':row['timedOut']}
    source['summary']=values
    source['matchesExpected']={
       'HEAD':values.get('HEAD')==expected['P'],
       'tree':values.get('HEAD-tree')==expected['tree'],
       'cleanTrackedAndUntrackedStatus':values.get('status',{}).get('clean') is True,
       'tagResolvesToM':values.get('release-tag-commit')==expected['M'],
       'MObjectPresent':next((x['exitCode']==0 and not x['timedOut'] for x in source['commands'] if x['name']=='release-M-object'),False),
       'HEADAncestorOfM':next((x['exitCode']==0 and not x['timedOut'] for x in source['commands'] if x['name']=='HEAD-ancestor-of-M'),False),
    }
    results.append(source)
print(json.dumps({'profile':'umf.public-h-readonly-git-metadata-diagnostic/1','network':'none',
                  'expected':expected,'sources':results},sort_keys=True,separators=(',',':')))
