from pathlib import Path
import gzip, hashlib, io, json, tarfile

root = Path('/Users/erik/.codex/worktrees/typed-sdk-recovery/umf')
tmp = Path('/private/tmp')
out = root / 'docs/helix/04-build/evidence/typed-persistence/frontend-r26-r22-20261017'
out.mkdir(exist_ok=False)
sha = lambda b: hashlib.sha256(b).hexdigest()

def archive(name, files):
    with (out / name).open('wb') as raw:
        with gzip.GzipFile(fileobj=raw, mode='wb', mtime=0) as gz:
            with tarfile.open(fileobj=gz, mode='w') as tar:
                for path, data in sorted(files.items()):
                    item = tarfile.TarInfo(path)
                    item.size, item.mtime, item.mode = len(data), 0, 0o644
                    tar.addfile(item, io.BytesIO(data))

before = json.loads((tmp / 'sdk-r26-frontend-inputs-before.json').read_text())
after = json.loads((tmp / 'sdk-r26-frontend-inputs-after.json').read_text())
assert after['gitBlobMismatches'] == []
assert after['capturedInputsUnchangedAfterRuns']
for name, expected in before['files'].items():
    assert sha((root / name).read_bytes()) == expected, name
predecessor = root / 'docs/helix/04-build/evidence/typed-persistence/frontend-r25-r22-20261017/generation-and-filter-inputs.tar.gz'
with tarfile.open(predecessor, 'r:gz') as tar:
    previous = {m.name: tar.extractfile(m).read() for m in tar if m.isfile()}
assert set(previous) == set(before['files'])
delta = {n: (root / n).read_bytes() for n in before['files'] if sha(previous[n]) != before['files'][n]}
archive('input-delta-from-retained-r25.tar.gz', delta)
assert all(sha(delta.get(n, previous[n])) == h for n, h in before['files'].items())
baseline = json.loads((tmp / 'sdk-r26-r22-installed-static/typing-results.json').read_text())
assert all(p['passed'] for t in baseline.values() for p in t.values())
assert all(t['negative']['count'] == 74 for t in baseline.values())
filters = json.loads((tmp / 'sdk-r26-r22-filter-static/results.json').read_text())
assert all(t['positive']['exitCode'] == 0 and t['negative']['exitCode'] == 1 for t in filters.values())
for name, directory in [('baseline-generated-and-checkers.tar.gz', 'sdk-r26-r22-installed-static'), ('filter-generated.tar.gz', 'sdk-r26-filter-generated'), ('filter-checkers.tar.gz', 'sdk-r26-r22-filter-static'), ('filter-public-build.tar.gz', 'sdk-r26-filter-build')]:
    source = tmp / directory
    archive(name, {str(p.relative_to(source)): p.read_bytes() for p in source.rglob('*') if p.is_file() and '__pycache__' not in p.parts and 'mypy-cache' not in p.parts})
archive('exact-checker-verifier.tar.gz', {n: (root / n).read_bytes() for n in ['scripts/verify-access-search-filter-types.py', 'scripts/access_type_diagnostics.py', 'tests/compilation/python/static/search-filter-parameters/negative-sites.json']})
for name in ['sdk-r26-frontend-inputs-before.json', 'sdk-r26-frontend-inputs-after.json', 'sdk-r26-r22-installed-static.log', 'sdk-r26-r22-filter-static.log', 'sdk-r26-filter-generate.log', 'sdk-r26-filter-build.log', 'sdk-r26-r22-byte-correspondence.json']:
    (out / name).write_bytes((tmp / name).read_bytes())
(out / 'source-reconstruction.json').write_text(json.dumps({'baseArchive': str(predecessor.relative_to(root)), 'baseArchiveSha256': sha(predecessor.read_bytes()), 'deltaArchive': 'input-delta-from-retained-r25.tar.gz', 'deltaFiles': sorted(delta), 'resolvedInputCommit': after['resolvedInputCommit'], 'all2049ReconstructedSha256Match': True, 'temporal': 'HELD'}, indent=2) + '\n')
(out / 'README.md').write_text('''# R26/R22 installed frontend — 2026-10-17

Temporal qualification remains **HELD**. Fresh installed R26 SDK wheel `069e6423e4bc09ce66fe43f56987a497e06d411cd01582258226e8f64b538ab7` from `fcb8cc2f2c9e715364e3332635e84f56be052edd` is paired with unchanged private R22 compiler wheel `f92e23d68afc6619e41e76f19e8760871eb86fe1ad1bf44de66c47c27ca48dc8`. All 47 SDK and two compiler payloads match source, wheels and both interpreter installations in the retained correspondence receipt.

The actual installed-runtime baseline verifier passes positive clients and all 74 exact negative files under each pinned checker: mypy 2.4.0, Pyright 1.1.414 and ty 0.0.88. The separate repository filter verifier passes positive clients and independently validates all six exact misuse sites, including Pyright's twelve call/argument diagnostics. Both positive and negative Pyright runs assert nonzero analyzed files. The original public CLI builds all twelve filter/raw declarations; this build-only run executes no SQL.

The input hash capture followed baseline launch, while the current Git head still named fcb8. Its head field is not a claim of a clean cut. All 2049 captured bytes independently match tracked Git blobs at `34c95068f7a5b453a8de4503a898a932fef626ca` and are unchanged after all three frontend runs. Full input reconstruction uses the existing retained R25 archive plus the five-file delta here; every reconstructed SHA-256 is checked. The exact new six-site verifier is separately archived. Runtime source is the separate fcb8 wheel cut. Native concurrency, grant closure, Truss correctness/performance, managed backends and deployment remain separate gates.
''')
(out / 'retain-sdk-r26-frontend.py').write_bytes(Path(__file__).read_bytes())
files = {str(p.relative_to(out)): {'sha256': sha(p.read_bytes()), 'bytes': p.stat().st_size} for p in out.iterdir() if p.is_file()}
(out / 'inventory.json').write_text(json.dumps({'files': files, 'temporal': 'HELD'}, indent=2) + '\n')
print(len(files), 'payloads retained; reconstructed inputs', len(before['files']))
