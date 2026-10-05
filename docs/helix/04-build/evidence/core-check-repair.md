---
ddx:
  id: EVIDENCE-CORE-CHECK-REPAIR
  type: evidence
  activity: build
  status: complete
  authoring:
    home: repo
  links:
    - id: EVIDENCE-CORE-SEMANTIC-TYPES
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Semantic-reference PR check repair

The owner requested repair of the failing live and retained-evidence checks.
Source repairs are checkpointed at `a52b881e`. The original failed results and
historical qualification records remain recoverable at immutable revision
`cc1446fdf919107ec2782d6eaa85cc8bf38fffa6`; fresh records explicitly reference
that revision rather than presenting historical runs as fresh execution.

The acceptance-ledger scan uses bounded batches of 32 file reads with deterministic
ordering (`933ea54d`). Its five-second test limit is unchanged. The focused replay
passed both tests (549 assertions); the first completed in approximately 719 ms.
The first full regression attempt is retained separately from the retry.
The PostgreSQL relationship test fixture is constructed once and copied for
each test, avoiding repeated construction of the whole authored matrix for a
single case. All seven tests pass (127 assertions); the formerly near-limit
sequential-declaration test takes approximately 1.28 seconds and the getter
refusal takes approximately 6 ms. Their default five-second limits are unchanged.
Parallel browser/regression execution also caused near-limit failures; the final
regression is run after the browser refresh completes.

The parent advanced to `a81e9a9c` during this work. Merge `51b1dd93` incorporates
its reviewed numeric-range, malformed-patch and extension-context corrections.
The public build can explicitly preserve specialized bundles during a refresh;
its default clean-build behavior remains the same. The combined public bundle
passed 38 schema-property cases and API controls, plus 48 semantic-reference
checks with zero external requests. All retained browser commands are replayed
after this merge. The original native command logs remain qualified to their
recorded source checkpoint; the parent's changes govern core 0.8/0.9 validation,
outside the earlier core versions in those native binding matrices.

## Repairs

Restore 17 RDF/XML and 83 SHACL upstream files only after matching their existing
pinned SHA-256 values. Restore 164 SHACL exact-source exports and the pinned
TableSpec test-source blob. Git attributes preserve original line endings and
intentional upstream whitespace. The fixture checks pass without replacing the
recorded upstream digests.

The dbt freshness provenance now distinguishes eight retained inputs/outputs
from six ignored generated caches whose bytes were never archived. The cache
hashes remain explicitly historical and unavailable. The generator excludes
cache/log directories from future verifiable provenance.

Two relationship scripts now use the local native Python interpreter (with an
explicit override) instead of a hardcoded Linux checkout. Browser aggregators
require the explicitly pinned replay version; gates require agreement with the
fresh qualification record. Version mismatch, outside paths, missing proof,
failed controls and stale fingerprints remain errors.

`refresh-core-checks.py` executes the immutable baseline command inventory,
retains actual logs and failed attempts, supports portable vendored namespaces,
and runs counted disjoint live-test shards. `publish-core-check-refresh.py`
requires successful logged commands, verifies log hashes and checks the exact
live-test file union before publishing current fingerprints. Aggregate records
retain their previous Git revision and digest. Generated proof fingerprint names
are normalized to the current repository; native payloads are not normalized.

## Environment and replay

Use Bun 1.3.14 and Python 3.12. The native dependencies start with
`scripts/oracle-requirements.txt`; TableSpec/relationship probes additionally
require Pydantic 2.11.10, jsonschema 4.25.1, GX 1.15.1, RDFLib 7.6.0 and
linkml-runtime 1.11.0rc2. Spark is 4.0.1; this replay uses Java 21.0.12.1.
Disposable PostgreSQL 17.4 and SQL Server 2022 containers use the pinned image
digests embedded in the existing native scripts, isolated from external networks.
No native equivalence scope is widened.

Configure `JAVA_HOME`, a writable `GOCACHE`,
`UMF_EXPECTED_CHROMIUM_VERSION=153.0.8010.12`,
`UMF_TABLESPEC_PYTHON=.venv/bin/python`, and
`PYTHONPATH=native/tablespec/sources/src:.cache/tablespec-python`.
Then run:

```sh
.venv/bin/python scripts/refresh-core-checks.py --prepare-namespaces
.venv/bin/python scripts/refresh-core-checks.py
.venv/bin/python scripts/refresh-core-checks.py --auxiliary
.venv/bin/python scripts/refresh-core-checks.py --regression
bun -e "import {relationshipSourceHashes} from './scripts/core-ideals/relationship-gate-inputs'; await Bun.write('fixtures/validation/core-check-refresh/relationship-source-hashes.json', JSON.stringify(await relationshipSourceHashes(), null, 2));"
.venv/bin/python scripts/publish-core-check-refresh.py
bun test ./tests/core-ideals/*conformance.test.ts ./tests/core-ideals/*evidence.test.ts
```

A failed native replay can resume with `--resume`; unsuccessful attempts do not
count as passes. The first resume implementation replaced one failed log; its
recorded digest and explicit unretained-byte explanation remain in the manifest.
Subsequent failed logs are retained at unique paths. An early replay was interrupted
to correct the Java path. Prerequisite and old-browser rejection failures remain
recorded separately from successful final executions.
Live-test retries use `--regression --resume`, verify the retained successful
shards' log digests, and retain failed shard logs at separate paths.
On macOS, `caffeinate -i` keeps the machine awake during long replay commands.
One retry recorded three wall-clock timeout failures, including roughly 930 seconds
for a five-second test and 992 seconds for a 300-second test. This indicates a
long execution interruption; the attempt is retained and the timeout limits are
unchanged in the subsequent replay.

## Execution evidence

The 174-command native/browser replay completed successfully, and every retained
successful log matched its digest. The auxiliary relationship suite passed 408
tests across nine files (5,019 assertions); these overlap the live regression and
are not added to its counts. Final typechecks, 60/60 package audits, 352/352 schema
audits, and the 48-check semantic-reference browser replay passed.

The disjoint live regression passed 2,136 tests across 374 files with 130,804
assertions and zero failures. The full gate attempt passed 16 tests and failed
one Field metadata check: an aggregate browser summary still named 148. The
publisher refreshes that summary from the qualified 153 replay and retains its
historical values. All three affected Field tests then passed. The final union
is 17 passing gate tests across eight files. Repeated Field cases and the nested
408-test relationship replay are not added to the unique counts. The combined
union is 2,153 tests across 382 files.

The final affected API replay passed 208 tests across 33 files (5,118 assertions).
The host verifier typechecks. The independent shape oracle agrees on 14/14 cases
using Python 3.12.14 / jsonschema 4.25.1.

Fingerprint normalization retains original aliases, collapses only equal digests,
and verifies identical bytes for internal `../` aliases. Conflicts and paths
outside the repository reject; five direct path controls pass. Native payloads
remain untouched. Initial publication rejections and the stale summary failure
are distinct from successful final execution.

`bun scripts/verify-current-core-evidence.ts` verifies all six current proof
closures without repeating their unchanged, already-passing recovery matrices.
Final publication, raw logs, source qualifications and unique gate outcomes are
under `fixtures/validation/core-check-refresh/`.
