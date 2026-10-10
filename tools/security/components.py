"""Retain actual component commands and hashes; no native qualification inferred."""
import datetime
import hashlib
import json
from pathlib import Path
import subprocess

commands = [
    ['/private/tmp/umf-security-proof-venv/bin/python', 'tools/security/prove-source-demands.py'],
    ['python3', 'tools/security/weft-source-demands.py'],
    ['/private/tmp/umf-security-proof-venv/bin/python', 'tools/security/validate-source-demands.py'],
    ['/private/tmp/umf-security-proof-venv/bin/python', 'tools/security/prove-owner-semantic-allocation.py'],
    ['python3', 'tools/security/weft-semantic-allocation.py'],
    ['/private/tmp/umf-security-proof-venv/bin/python', 'tools/security/prove-obligation-source-correspondence.py'],
    ['/private/tmp/umf-security-proof-venv/bin/python', 'tools/security/prove-obligation-projection.py'],
    ['python3', 'tools/security/weft-obligation-projection.py'],
    ['/private/tmp/umf-security-proof-venv/bin/python', 'tools/security/prove-obligation-custody.py'],
    ['bun','node_modules/typescript/bin/tsc','--ignoreConfig','--noEmit','--strict','--target','ES2022','--module','ESNext','--moduleResolution','bundler','--types','bun','--skipLibCheck','tools/security/record-home-shape-probe.ts'],
    ['bun','test','./tools/security/truss-original-preparation.test.ts'],
    ['python3','tools/security/activation-compiler-boundary.py'],
    ['/private/tmp/umf-security-proof-venv/bin/python','tools/security/prove-policy-activation.py'],
    ['/private/tmp/umf-security-proof-venv/bin/python','tools/security/prove-candidate-disclosure-fold.py'],
    ['/private/tmp/umf-security-proof-venv/bin/python','tools/security/prove-candidate-scalar-guard.py'],
    ['python3','tools/security/candidate-numeric-rational-oracle.py'],
    ['bun','tools/security/truss-candidate-condition-check.ts'],
    ['bun','tools/security/candidate-rule-decision-proof-input.ts'],
    ['bun','node_modules/typescript/bin/tsc','--ignoreConfig','--noEmit','--strict','--target','ES2022','--module','ESNext','--moduleResolution','bundler','--types','bun','--skipLibCheck','tools/security/candidate-rule-decision-proof-input.ts'],
    ['/private/tmp/umf-security-proof-venv/bin/python','tools/security/prove-candidate-rule-decision-sql.py'],
    ['bun','test','/Users/erik/Projects/truss/tests/security-candidate-endpoint.test.ts'],
    ['bun','node_modules/typescript/bin/tsc','--ignoreConfig','--noEmit','--strict','--allowImportingTsExtensions','--resolveJsonModule','--target','ES2022','--module','ESNext','--moduleResolution','bundler','--types','bun','--skipLibCheck','/Users/erik/Projects/truss/packages/postgresql/src/security-candidate-endpoint.ts','/Users/erik/Projects/truss/tests/security-candidate-endpoint.test.ts','tools/security/truss-candidate-endpoint-browser.ts','tools/security/truss-candidate-condition-browser.ts'],
    ['bun','node_modules/typescript/bin/tsc','--ignoreConfig','--noEmit','--strict','--allowImportingTsExtensions','--target','ES2022','--module','ESNext','--moduleResolution','bundler','--types','bun','--skipLibCheck','tools/security/entity-terms-browser.ts'],
    ['bun','node_modules/typescript/bin/tsc','--ignoreConfig','--noEmit','--strict','--allowImportingTsExtensions','--target','ES2022','--module','ESNext','--moduleResolution','bundler','--types','bun','--skipLibCheck','tools/security/association-transport-proof-input.ts'],
    ['bun','node_modules/typescript/bin/tsc','--ignoreConfig','--noEmit','--strict','--allowImportingTsExtensions','--target','ES2022','--module','ESNext','--moduleResolution','bundler','--types','bun','--skipLibCheck','tools/security/association-candidate-browser.ts'],
    ['bun','test','tests/security/association-selector.test.ts'],
    ['bun','test','tests/security/relationship-candidate.test.ts'],
    ['bun','node_modules/typescript/bin/tsc','--ignoreConfig','--noEmit','--strict','--allowImportingTsExtensions','--target','ES2022','--module','ESNext','--moduleResolution','bundler','--types','bun','--skipLibCheck','tools/security/relationship-candidate-browser.ts','tests/security/relationship-candidate.test.ts'],
    ['bun','tools/security/relationship-selector-spike.ts'],
    ['bun','node_modules/typescript/bin/tsc','--ignoreConfig','--noEmit','--strict','--allowImportingTsExtensions','--target','ES2022','--module','ESNext','--moduleResolution','bundler','--types','bun','--skipLibCheck','tools/security/relationship-selector-spike.ts'],
    ['bun','tools/security/truss-graph-compiler-input.ts'],
    ['bun','tools/security/truss-graph-condition-input.ts'],
    ['bun','node_modules/typescript/bin/tsc','--ignoreConfig','--noEmit','--strict','--allowImportingTsExtensions','--target','ES2022','--module','ESNext','--moduleResolution','bundler','--types','bun','--skipLibCheck','tools/security/truss-graph-compiler-input.ts','tools/security/truss-graph-condition-input.ts','tools/security/truss-graph-condition-request.ts'],
    ['/private/tmp/umf-security-proof-venv/bin/python','tools/security/prove-existence-truth.py'],
    ['/private/tmp/umf-security-proof-venv/bin/python','tools/security/prove-type-selection.py'],
    ['/private/tmp/umf-security-proof-venv/bin/python','tools/security/prove-candidate-typed-fold.py'],
    ['bun','test','/Users/erik/Projects/truss/tests/security-graph-source-lowering.test.ts'],
    ['bun','test','/Users/erik/Projects/truss/tests/security-graph-source.test.ts'],
    ['bun','node_modules/typescript/bin/tsc','--ignoreConfig','--noEmit','--strict','--allowImportingTsExtensions','--target','ES2022','--module','ESNext','--moduleResolution','bundler','--types','bun','--skipLibCheck','/Users/erik/Projects/truss/tests/security-graph-source-lowering.test.ts','/Users/erik/Projects/truss/tests/security-graph-source.test.ts','tools/security/truss-graph-source-browser.ts'],
    ['bun', 'node_modules/typescript/bin/tsc', '-p', 'tools/security/truss-graph-native-stage-typecheck.json'],
    ['bun', 'test', '/Users/erik/Projects/truss/tests/security-graph-locator.test.ts'],
    ['bun', 'node_modules/typescript/bin/tsc', '--ignoreConfig', '--noEmit', '--strict', '--allowImportingTsExtensions', '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'bundler', '--types', 'bun', '--skipLibCheck', '/Users/erik/Projects/truss/tests/security-graph-locator.test.ts', 'tools/security/truss-graph-locator-browser.ts'],
    ['/private/tmp/umf-security-proof-venv/bin/python', 'tools/security/prove-hash-key.py'],
    ['/private/tmp/umf-security-proof-venv/bin/python', 'tools/security/prove-multipublisher-custody.py'],
    ['/private/tmp/umf-security-proof-venv/bin/python', 'tools/security/prove-publisher-state.py'],
    ['/private/tmp/umf-security-proof-venv/bin/python', 'docs/helix/02-design/spikes/security/prove.py'],
    ['/private/tmp/umf-security-proof-venv/bin/python', 'tools/security/prove-carrier-error-isolation.py'],
    ['/private/tmp/umf-security-proof-venv/bin/python', 'tools/security/prove-existence-unbounded.py'],
    ['/private/tmp/umf-security-proof-venv/bin/python', 'tools/security/prove-graph-key-correspondence.py'],
    ['/private/tmp/umf-security-proof-venv/bin/python', 'tools/security/prove-graph-endpoints.py'],
    ['/private/tmp/umf-security-proof-venv/bin/python', 'tools/security/prove-original-source-completeness.py'],
    ['/private/tmp/umf-security-proof-venv/bin/python', 'tools/security/prove-publication-drain.py'],
    ['/private/tmp/umf-security-proof-venv/bin/python', 'tools/security/prove-publication-retirement.py'],
    ['/private/tmp/umf-security-proof-venv/bin/python', 'tools/security/prove-scoped-composition.py'],
    ['/private/tmp/umf-security-proof-venv/bin/python', 'tools/security/prove-typed-source-completeness.py'],
    ['/private/tmp/umf-security-proof-venv/bin/python', 'tools/security/prove-association-transport.py'],
    ['/private/tmp/umf-security-proof-venv/bin/python', 'tools/security/prove-original-graph-ir.py'],
    ['/private/tmp/umf-security-proof-venv/bin/python', 'tools/security/replay-formal-evidence.py'],
    ['bun', 'node_modules/typescript/bin/tsc', '--ignoreConfig', '--noEmit', '--strict', '--allowImportingTsExtensions', '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'bundler', '--types', 'bun', '--skipLibCheck', 'tools/security/truss-security-predicate.ts', 'tools/security/truss-predicate-browser.ts', 'tools/security/truss-type-selection.ts', 'tools/security/truss-native-key.ts', 'tools/security/truss-native-key-browser.ts', 'tools/security/truss-key-transport.ts', 'tools/security/truss-key-transport-browser.ts', 'tools/security/truss-key-namespace.ts', 'tools/security/truss-key-namespace-browser.ts', 'tools/security/truss-stored-key-replay.ts', 'tools/security/truss-stored-key-browser.ts', 'tools/security/truss-original-use.ts', 'tools/security/truss-original-preparation.ts', 'tools/security/truss-original-preparation.test.ts', 'tools/security/truss-original-use-browser.ts', 'tools/security/truss-original-use-release.ts'],
    ['bun', 'node_modules/typescript/bin/tsc', '-p', 'tools/security/truss-principal-typecheck.json'],
    ['bun', 'node_modules/typescript/bin/tsc', '-p', 'tools/security/pg-raw-identity-typecheck.json'],
    ['bun', 'node_modules/typescript/bin/tsc', '-p', 'tools/security/pg-raw-write-typecheck.json'],
    ['bun', 'node_modules/typescript/bin/tsc', '-p', 'tools/security/pg-raw-field-write-typecheck.json'],
    ['bun', 'node_modules/typescript/bin/tsc', '-p', 'tools/security/pg-raw-drain-typecheck.json'],
    ['bun', 'node_modules/typescript/bin/tsc', '-p', 'tools/security/pg-raw-persistent-drain-typecheck.json'],
    ['bun', 'test', '/Users/erik/Projects/truss/tests/pg-principal-wire.test.ts'],
    ['python3', 'tests/security/native/reviewed-python.test.py'],
    ['bun', 'node_modules/typescript/bin/tsc', '--ignoreConfig', '--noEmit', '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'bundler', '--types', 'bun', '--skipLibCheck', 'tests/security/native/pg-raw-pool.ts', 'tests/security/native/pg-raw-disclosure.ts'],
    ['bun', 'node_modules/typescript/bin/tsc', '--ignoreConfig', '--noEmit', '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'bundler', '--types', 'bun', '--skipLibCheck', 'tools/security/pg-driver.ts'],
    ['bun', 'test', '--timeout', '15000', './tests/security', './tests/traceability/acceptance-ledger.test.ts', './tests/core/key-tuple.test.ts'],
    ['bun', 'run', 'typecheck'],
    ['bun', 'run', 'test:schemas'],
]
paths = sorted(str(p) for root in ['src/extensions/security', 'tests/security', 'tools/security', 'spec/extensions/security']
               for p in Path(root).rglob('*') if p.is_file())
paths += ['/Users/erik/Projects/truss/packages/postgresql/src/security-query-use.ts', '/Users/erik/Projects/truss/packages/postgresql/src/security-stored-key.ts', '/Users/erik/Projects/truss/packages/postgresql/src/security-key-namespace.ts', '/Users/erik/Projects/truss/packages/postgresql/src/security-key-transport.ts', '/Users/erik/Projects/truss/packages/postgresql/src/security-native-key.ts', '/Users/erik/Projects/truss/packages/pg-runtime/src/index.ts', '/Users/erik/Projects/truss/packages/postgresql/src/security-predicate.ts', 'src/index.ts', 'src/model/json.ts', 'src/model/types.ts', 'scripts/security-schema.py',
          'scripts/acceptance-traceability.ts', 'tests/traceability/acceptance-ledger.test.ts', 'bun.lock']
paths += ['docs/helix/04-build/evidence/security/truss-graph-condition-input.json','docs/helix/04-build/evidence/security/truss-graph-compiler-input.json','docs/helix/04-build/evidence/security/relationship-selector-spike.json']
paths += ['docs/helix/02-design/spikes/security/policy-v0.2.schema.json','docs/helix/02-design/spikes/security/ontology-v0.2.schema.json','docs/helix/02-design/spikes/security/association-selector.schema.json','docs/helix/02-design/spikes/security/relationship-selector.schema.json']
paths += ['/Users/erik/Projects/truss/tests/security-graph-source-lowering.test.ts','/Users/erik/Projects/truss/packages/postgresql/src/security-graph-source.ts','/Users/erik/Projects/truss/tests/security-graph-source.test.ts']
# Composed association checks invoke the real core validator and its schemas.
paths += [str(p) for directory in ['src','spec'] for p in Path(directory).rglob('*') if p.is_file()]
paths += ['/Users/erik/Projects/truss/packages/postgresql/src/security-candidate-endpoint.ts','/Users/erik/Projects/truss/tests/security-candidate-endpoint.test.ts']
paths += ['/Users/erik/Projects/truss/packages/postgresql/src/security-candidate-condition.ts','/Users/erik/Projects/truss/tests/security-candidate-condition.test.ts']
paths = sorted(set(paths))
digests = {f: hashlib.sha256(Path(f).read_bytes()).hexdigest() for f in paths}
graph_locator_path='/Users/erik/Projects/truss/packages/postgresql/src/security-graph-locator.ts'
digests['/Users/erik/Projects/truss/tests/security-graph-locator.test.ts']=hashlib.sha256(Path('/Users/erik/Projects/truss/tests/security-graph-locator.test.ts').read_bytes()).hexdigest()
digests[graph_locator_path]=hashlib.sha256(Path(graph_locator_path).read_bytes()).hexdigest()
runs = []
for command in commands:
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=60)
        runs.append({'command': command, 'exitCode': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr, 'timedOut': False})
    except subprocess.TimeoutExpired as error:
        def captured(value):
            return value.decode('utf-8', errors='replace') if isinstance(value, bytes) else (value or '')
        runs.append({'command': command, 'exitCode': 124, 'stdout': captured(error.stdout), 'stderr': captured(error.stderr), 'timedOut': True})
unchanged = all(hashlib.sha256(Path(f).read_bytes()).hexdigest() == digest for f, digest in digests.items())
receipt = {'status': 'passed' if unchanged and all(r['exitCode'] == 0 for r in runs) else 'failed',
           'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
           'scope': 'Policy inspection/preservation, bounded host-attested fact evaluation, immutable registration, single-realm authority coordination, write admission, composition and POSIX runner components; no native backend qualification',
           'sourceDigests': digests, 'sourcesUnchanged': unchanged, 'runs': runs}
Path('docs/helix/04-build/evidence/security/components.json').write_text(json.dumps(receipt, indent=2)+'\n')
print(json.dumps({'status': receipt['status'], 'checks': len(runs)}))
raise SystemExit(0 if receipt['status'] == 'passed' else 1)
