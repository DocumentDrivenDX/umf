from pathlib import Path
import gzip
import hashlib
import io
import json
import tarfile

root = Path('/Users/erik/.codex/worktrees/typed-sdk-recovery/umf')
temporary = Path('/private/tmp')
out = root / 'docs/helix/04-build/evidence/typed-persistence/frontend-r25-r22-20261017'
assert not out.exists()
out.mkdir()
sha = lambda data: hashlib.sha256(data).hexdigest()

def put(name, data):
    (out / name).write_bytes(data)

def archive(name, files):
    with (out / name).open('wb') as raw:
        with gzip.GzipFile(fileobj=raw, mode='wb', mtime=0, compresslevel=1) as compressed:
            with tarfile.open(fileobj=compressed, mode='w') as tar:
                for name, data in sorted(files.items()):
                    item = tarfile.TarInfo(name)
                    item.size, item.mtime, item.mode = len(data), 0, 0o644
                    tar.addfile(item, io.BytesIO(data))

manifest = json.loads((temporary / 'sdk-r25-filter-source-before.json').read_text())
inputs = temporary / 'sdk-r25-frozen-frontend-inputs'
source = {}
for name, expected in manifest['files'].items():
    data = (inputs / name).read_bytes()
    assert sha(data) == expected, name
    assert (root / name).read_bytes() == data, name
    source[name] = data
archive('generation-and-filter-inputs.tar.gz', source)
base = temporary / 'sdk-r25-r22-installed-static'
results = json.loads((base / 'typing-results.json').read_text())
assert all(phase['passed'] for tool in results.values() for phase in tool.values())
assert all(tool['negative']['count'] == 74 for tool in results.values())
for name, directory in [('baseline-generated-and-checkers.tar.gz', base), ('filter-generated.tar.gz', temporary / 'sdk-r25-filter-generated'), ('filter-checkers-r1.tar.gz', temporary / 'sdk-r25-r22-filter-static'), ('filter-checkers-r2.tar.gz', temporary / 'sdk-r25-r22-filter-static-r2')]:
    archive(name, {str(p.relative_to(directory)): p.read_bytes() for p in directory.rglob('*') if p.is_file() and '__pycache__' not in p.parts and 'mypy-cache' not in p.parts})
for name in ['sdk-r25-static-source-before.json', 'sdk-r25-static-source-after.json', 'sdk-r25-filter-source-before.json', 'sdk-r25-r22-installed-static.log', 'sdk-r25-installed-static-r1-isolated-import-failure.log', 'sdk-r25-filter-build-r1.log', 'sdk-r25-r22-filter-build-r2.log', 'sdk-r25-r22-filter-static.log', 'sdk-r25-r22-filter-static-r2.log', 'run-sdk-filter-static-r1.py', 'run-sdk-filter-static.py', 'sdk-r25-r22-byte-correspondence.json']:
    put(name, (temporary / name).read_bytes())
archive('reviewed-exact-checker-control.tar.gz', {name: (root / name).read_bytes() for name in ['scripts/verify-access-search-filter-types.py', 'scripts/access_type_diagnostics.py', 'tests/compilation/python/static/search-filter-parameters/negative-sites.json']})
put('source-after.json', (json.dumps({'inputCommit': manifest['inputCommit'], 'fileCount': len(source), 'allFrozenAndLiveInputsUnchanged': True, 'temporal': 'HELD'}, indent=2) + '\n').encode())
put('README.md', b'''# R25/R22 installed frontend and explicit filter build — 2026-10-17

Temporal qualification remains **HELD**. This packet covers the installed SDK wheel bf9cc2fccf3085b4327c473f5eade13600cbcead269167bfa98552e3a832dfef from c042a13e88d51d52a810149f6e407da3eaef0cd2 paired with original Weft wheel f92e23d68afc6619e41e76f19e8760871eb86fe1ad1bf44de66c47c27ca48dc8 from 5605d358650468d651f69ff29c40e986a0359a5b. Forty-seven SDK and two compiler payloads match their wheel/source/install custody. No private compiler implementation or executable is republished here.

Fresh generated baseline positive clients and all 74 exact negative cases pass each pinned checker: mypy2.4.0, Pyright1.1.414 and ty0.0.88. The separate full-filter generated package passes positive clients and six further inspected misuse files at line5: wrong Boolean/String/Decimal list elements, scalar replacing a list, forbidden null list container and integer replacing nullable String. Actual mypy diagnostics are three list-item plus three call-overload; Pyright emits call and argument diagnostics for each file; ty emits one no-matching-overload per file. The separate fixture does not replace the baseline search_docs package.

The final public CLI builds all twelve original filter/raw declarations using an explicit original catalog fence. Earlier R21 compilation refused original MATCHES_ANY_TERM because the compiler inventory used the plural spelling. The failure remains retained; the corrected original compiler preserves the other eleven programs byte-for-byte. The final build-only result executes no SQL.

The 2049 generation/filter/host-helper inputs are archived at 66f982086185966a481c20f2d9e063a3da4a7eaa and checked unchanged. SDK runtime source is a separate cut. Original baseline preflight captured c042 and observed two concurrently changed filter-only inputs, which that baseline runner never consumes; its after receipt makes that limit explicit. Final baseline and frozen filter runs use the archived unchanged 66f inputs. Additional complete host-recorder support is separately required by native campaigns; this frontend archive does not claim that closure.

Setup failures are retained: an initial isolated Python launch could not import the checker helper before generation; the first separate Pyright launch ignored absolute include paths and analyzed zero files. That attempt does not qualify positive or negative coverage. The corrected relative-path run asserts nonzero actual analyzed-file counts. Reviewed exact source-site expectations independently validate all final diagnostic rules and multiplicities using the shared fail-closed parser; both executed temporary runners and the reusable repository verifier are archived.

These receipts establish generated typing and original public catalog construction only. Native search/stream concurrency, application DDL consistency, privilege closure, protected Truss providers/performance, managed backends, release and deployment remain separate gates. Installed 360-test and real 83-check schema/instance/codec campaigns on both interpreters are preserved in their own named packets.
''')
inventory = {str(p.relative_to(out)): {'sha256': sha(p.read_bytes()), 'bytes': p.stat().st_size} for p in sorted(out.iterdir()) if p.is_file()}
put('inventory.json', (json.dumps({'files': inventory, 'inputCommit': manifest['inputCommit'], 'temporal': 'HELD'}, indent=2) + '\n').encode())
print(len(inventory), sum(value['bytes'] for value in inventory.values()))
