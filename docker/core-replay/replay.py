"""Run the retained acceptance inventory in a disposable, committed checkout."""
import argparse, hashlib, importlib.metadata, json, os, platform, subprocess
from pathlib import Path

out = Path('fixtures/validation/core-check-refresh')

def run(command, name=None):
    print(json.dumps({'stage': name, 'command': command}), flush=True)
    if name:
        log = out / (name + '.log')
        if log.exists():
            index = 1
            while (out / f'{name}-attempt-{index}.log').exists(): index += 1
            log.rename(out / f'{name}-attempt-{index}.log')
        with log.open('wb') as stream:
            result = subprocess.run(command, stdout=stream, stderr=subprocess.STDOUT)
        record = {'command': command, 'exitCode': result.returncode, 'log': str(log),
                  'logSha256': hashlib.sha256(log.read_bytes()).hexdigest()}
        (out / (name + '.json')).write_text(json.dumps(record, indent=2) + '\n')
        if result.returncode:
            print(log.read_text()[-6000:], flush=True)
            raise SystemExit(result.returncode)
    else:
        subprocess.run(command, check=True)

parser = argparse.ArgumentParser()
parser.add_argument('stage', choices=['prepare', 'native', 'auxiliary', 'regression', 'publish', 'gates', 'all'])
parser.add_argument('--resume', action='store_true')
args = parser.parse_args()
out.mkdir(parents=True, exist_ok=True)
python = '.venv/bin/python'
stages = ['prepare', 'native', 'auxiliary', 'regression', 'publish', 'gates'] if args.stage == 'all' else [args.stage]
for stage in stages:
    if stage == 'prepare':
        if not Path('.venv').exists(): Path('.venv').symlink_to('/opt/venv', target_is_directory=True)
        revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
        runtime = {'sourceRevision': revision, 'imageId': os.environ.get('UMF_REPLAY_IMAGE_ID'),
                   'platform': platform.platform(), 'python': platform.python_version(),
                   'jsonschema': importlib.metadata.version('jsonschema'),
                   'bun': subprocess.check_output(['bun', '--version'], text=True).strip(),
                   'protoc': subprocess.check_output(['protoc', '--version'], text=True).strip(),
                   'go': subprocess.check_output(['go', 'version'], text=True).strip()}
        (out / 'container-runtime.json').write_text(json.dumps(runtime, indent=2) + '\n')
        run(['bun', 'install', '--frozen-lockfile'], 'container-install')
        run([python, 'scripts/refresh-core-checks.py', '--prepare-namespaces'])
        run(['bun', 'run', 'build:protobuf'], 'container-protobuf')
    elif stage in ['native', 'auxiliary', 'regression']:
        command = [python, 'scripts/refresh-core-checks.py']
        if stage != 'native': command.append('--' + stage)
        if args.resume and stage in ['native', 'regression']: command.append('--resume')
        run(command)
    elif stage == 'publish':
        run(['bun', 'scripts/core-semantic-types-oracle-inputs.ts'], 'container-semantic-inputs')
        run([python, 'scripts/core-semantic-types-oracle.py'], 'container-semantic-oracle')
        run(['bun', '-e', "import {relationshipSourceHashes} from './scripts/core-ideals/relationship-gate-inputs'; await Bun.write('fixtures/validation/core-check-refresh/relationship-source-hashes.json', JSON.stringify(await relationshipSourceHashes(), null, 2));"])
        run([python, 'scripts/publish-core-check-refresh.py'], 'container-publication')
    elif stage == 'gates':
        gates = sorted(str(p) for p in Path('tests/core-ideals').glob('*.test.ts') if p.name.endswith(('conformance.test.ts', 'evidence.test.ts')))
        run(['bun', 'test', *gates], 'container-gates')
        run(['bun', 'scripts/verify-current-core-evidence.ts'], 'container-integrity')
