#!/usr/bin/env python3
"""Read-only Git inventory; writes planning artifacts beside this script only."""
import argparse, collections, gzip, hashlib, json, subprocess
from pathlib import Path

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[3]
BASELINE = '9e93fc583f809bd738409770d46c6dba8541a07a'
RETAIN_FIXTURES = ('fixtures/core/', 'fixtures/metamodel/', 'fixtures/python/', 'fixtures/domain-packs/')
KEEP_EVIDENCE = (
 'docs/helix/04-build/evidence/metamodel-authority/history/',
 'docs/helix/04-build/evidence/metamodel-authority/current-native-qualification.json',
 'docs/helix/04-build/evidence/metamodel-authority/retired-core-acceptance.json',
 'docs/helix/04-build/evidence/actions-certification.json',
)
SITE = 'docs/helix/05-deploy/microsite/dist/'
ADAPTER_TEST_FAMILIES = frozenset('adapters arrow avro dbt delta generalized-rdf graphql iceberg json-schema jsonld linkml odcs openapi owl parquet postgresql protobuf rdf rdfxml shacl smithy spark sqlserver tablespec typespec projections relationship-native'.split())
SMALL_SAMPLE_MAX_BYTES = 65_536

def pack_asset(path, size):
 parts = path.split('/')
 return (len(parts) > 4 and parts[:2] == ['spec', 'domain-packs']
         and parts[3] in ('sources', 'data') and size > SMALL_SAMPLE_MAX_BYTES
         and Path(path).suffix.lower() in ('.pdf', '.csv', '.json', '.jsonl', '.parquet', '.zip', '.txt', '.html', '.xml', '.dcm'))


def git(*args):
 return subprocess.check_output(['git', '-C', str(ROOT), *args])

def classify(path, size):
 if path.startswith('spec/domain-packs/'):
  if path=='spec/domain-packs/legal/data/evidence_pages.csv':
   return 'keep', 'uncleared-derived-asset-retained-no-public-mirror'
  if pack_asset(path, size):
   return 'pack-assets', 'hash-verified-on-demand-pack-data-closure-review'
  return 'keep', 'pack-schema-loader-metadata-or-small-sample'
 if path.startswith(RETAIN_FIXTURES) or path == 'fixtures/actions/approve.json':
  return 'keep', 'small-pack-build-install-regression'
 if path.startswith('native/shacl/sources/'):
  return 'conformance', 'pinned-upstream-suite-with-license-and-manifest'
 if path.startswith('fixtures/'):
  return 'conformance', 'corpus-closure-and-consumer-refactor'
 if path.startswith(SITE):
  tail = path[len(SITE):]
  if '/' not in tail and Path(tail).suffix in ('.html', '.css', '.svg'):
   return 'keep', 'authored-site-host-source-preserve-before-build'
  return 'publication', 'build-verify-sign-publish-cutover'
 if path.startswith('docs/helix/04-build/evidence/'):
  if path.startswith(KEEP_EVIDENCE) or Path(path).suffix in ('.md', '.ts', '.py', '.sh'):
   return 'keep', 'policy-history-or-maintained-source'
  return 'conformance', 'immutable-receipt-with-core-index-and-resolver'
 if path.startswith('tests/') and path.split('/')[1] in ADAPTER_TEST_FAMILIES:
  return 'conformance', 'adapter-test-source-and-local-data-external-suite'
 if path.startswith('tests/security/') and path.endswith('.json') and size > 100_000:
  return 'conformance', 'bulk-security-vectors-preserve-test-source'
 return 'keep', 'conservative-retention'

def main():
 ap = argparse.ArgumentParser(description=__doc__)
 ap.add_argument('--revision', default=BASELINE)
 ap.add_argument('--declared-inputs', type=Path, help='Optional JSON paths from checkBuildInputs (not exhaustive)')
 args = ap.parse_args()
 revision = git('rev-parse', args.revision + '^{commit}').decode().strip()
 inputs = set(json.loads(args.declared_inputs.read_text())['paths']) if args.declared_inputs else set()
 # Keep previously observed inputs when regenerating this pinned inventory.
 if not inputs and (OUT / 'declared-inputs.json').exists():
  stored = json.loads((OUT / 'declared-inputs.json').read_text())
  if stored['baseline'] != revision:
   raise ValueError('Refresh --declared-inputs for a different baseline revision')
  inputs = set(stored['paths'])
 rows = []
 for record in git('ls-tree', '-rz', '-l', revision).split(b'\0'):
  if not record: continue
  meta, name = record.split(b'\t', 1)
  mode, kind, oid, count = meta.decode().split()
  if kind != 'blob': raise ValueError('Non-blob requires explicit inventory: ' + name.decode())
  path, size = name.decode(), int(count)
  disposition, reason = classify(path, size)
  rows.append((path, str(size), mode, oid, disposition, reason, 'yes' if path in inputs else 'unknown'))
 rows.sort()
 header = 'path\tbytes\tgit_mode\tgit_blob_oid\tproposed_destination\tgate_reason\tdeclared_direct_input\n'
 raw = (header + ''.join('\t'.join(row) + '\n' for row in rows)).encode()
 inventory = gzip.compress(raw, mtime=0)
 (OUT / 'files.tsv.gz').write_bytes(inventory)
 groups = collections.defaultdict(lambda: {'files': 0, 'bytes': 0})
 for row in rows:
  g = groups[row[4]]; g['files'] += 1; g['bytes'] += int(row[1])
 if args.declared_inputs:
  (OUT / 'declared-inputs.json').write_text(json.dumps({'baseline': revision, 'coverage': '709 declared direct inputs; not a complete dependency closure', 'paths': sorted(inputs)}, indent=2) + '\n')
 # Independently hash proposed downloadable assets from the pinned Git revision.
 asset_rows = [row for row in rows if row[4] == 'pack-assets']
 proc = subprocess.run(['git', '-C', str(ROOT), 'cat-file', '--batch'],
                       input=''.join(row[3] + '\n' for row in asset_rows).encode(),
                       stdout=subprocess.PIPE, check=True)
 offset, assets = 0, []
 for row in asset_rows:
  end = proc.stdout.index(b'\n', offset)
  oid, kind, length = proc.stdout[offset:end].decode().split()
  assert oid == row[3] and kind == 'blob' and int(length) == int(row[1])
  content = proc.stdout[end + 1:end + 1 + int(length)]
  assert len(content) == int(length)
  offset = end + 2 + int(length)
  assets.append({'path': row[0], 'bytes': int(row[1]), 'sha256': hashlib.sha256(content).hexdigest(),
                 'gitBlobOid': row[3], 'status': 'candidate-held-for-pack-closure-review',
                 'downloadUrl': None})
 (OUT / 'pack-assets.json').write_text(json.dumps({'baseline': revision,
  'status': 'proposal-not-a-runtime-lockfile', 'smallSampleCandidateMaxBytes': SMALL_SAMPLE_MAX_BYTES,
  'assets': assets}, indent=2) + '\n')
 base = groups['keep']['bytes']
 summary = {
  'schemaVersion': 2, 'status': 'proposal-only-all-moves-held', 'baseline': revision,
  'gitObjectFormat': git('rev-parse', '--show-object-format').decode().strip(),
  'units': 'decimal bytes; tracked source content, excluding .git/dependencies/caches',
  'budgetBytesExclusive': 100_000_000, 'newResourceAllowanceBytes': 3_000_000,
  'baselineFiles': len(rows), 'baselineBytes': sum(int(r[1]) for r in rows),
  'destinations': dict(groups),
  'retainedBaselineBytes': base,
  'inventoryCompressedBytes': len(inventory),
  'inventorySha256': hashlib.sha256(inventory).hexdigest(),
  'unknowns': ['Transitive/dynamic consumer closure is not complete.', 'Core policy indexes, copied site examples and resolver overhead require a measured allowance.', 'Migration/Rust/new-main growth is outside this frozen baseline.'],
 }
 (OUT / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
 overhead = sum(p.stat().st_size for p in OUT.iterdir() if p.is_file())
 print(json.dumps({'retainedBaselineBytes': base, 'planningArtifactBytes': overhead, 'projectedBytesBeforeNewResources': base + overhead, 'destinations': dict(groups)}, indent=2))

if __name__ == '__main__': main()
