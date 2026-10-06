---
ddx:
  id: EVIDENCE-CORE-SEMANTIC-TYPES
  type: evidence
  activity: build
  status: complete
  authoring:
    home: repo
  links:
    - id: CONTRACT-051
      kind: informed_by
    - id: TD-051
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Experimental core semantic references

ST-01–ST-04 implement core 0.9.0 on the reviewed schema-properties parent
`6a96f6e030feae8b54fdc3c3ef98b72bb5d8c2e2`. The reference structure is core;
vocabulary releases, term definitions and explicitly installed validators are
extensible. No email, telephone or industry identifier algorithm is built into
core. Literal vocabulary/release/term identities never select a fallback release.
ST-05 publisher catalogs and TableSpec validator bindings remain open.

Published earlier schemas remain unchanged. The public browser library provides
copied inspection/declaration, separately scoped value checks, verified receipts,
explicit 0.8.0 upgrade, opt-in prototype conversion, edited rollback, JSON/YAML
serialization and element selection. Unknown reference qualifiers remain data
and prevent unqualified validation claims. Upgrade archives old field collisions;
rollback restores the exact source and retains the current edited envelope.
Other version-specific core authoring APIs retain their published version limits.

## Original implementation verification

The original acceptance at immutable revision `cc1446fdf919107ec2782d6eaa85cc8bf38fffa6`
identifies implementation source `02c8ee68`. Original logs are under
`fixtures/validation/core-semantic-types/`. The
[current acceptance](../../../../fixtures/validation/core-semantic-types-acceptance.json)
links that historical record and the subsequent check repair.

With Bun 1.3.14 after parent review integration:

- `bun test ./tests/core/*.test.ts ./tests/consumers/*.test.ts ./tests/ddd/*.test.ts ./tests/semantic-types/*.test.ts`: 180 passed, zero failed; 4,770 assertions across 32 files.
- `bun run typecheck` and `bun run build`: passed; full public ESM and declarations emitted.
- `bun run test:schemas`: 60/60 extension packages and 352/352 schemas passed.
- `bun scripts/core-semantic-types-oracle-inputs.ts`, then Python 3.9.6 / jsonschema 4.25.1 `scripts/core-semantic-types-oracle.py`: independent Draft 2020-12 reference-shape agreement for 14/14 cases. This excludes inherited semantic rules and domain algorithms.
- `bun scripts/core-semantic-types-browser.ts`: Chromium 153.0.8010.12 passed 48 checks, including 14 Bun/browser diagnostic comparisons, using the final full public bundle. Zero external requests occurred.

The core suite checks unresolved and qualified references, exact registry identity,
copied callbacks and metadata, declaration tampering/staleness, conflicting migration,
legacy opacity, forged transitions and edited rollback. The pinned TableSpec provider
source survives every explicit upgrade from 0.1.0 to 0.9.0, semantic declaration,
and JSON/YAML serialization; native export recovers its original source exactly.
That preservation probe does not establish TableSpec validator parity.

## Review and failed attempts

Manual author review covered the final parent diff, API exports, schema dispatch,
callback isolation, unknown content, receipt recomputation and test evidence.
This is not an independent agent review. Review resolved future-version test
sentinel collisions, a Bun hash input representation mismatch, a cold public-index
test exceeding the five-second default, and concurrent artifact ID allocation.
The TableSpec test uses a bounded 30-second timeout. The first browser attempt
completed assertions but failed evidence hashing; its corrected final replay passed.
Red-phase tests first failed because the proposed core API did not yet exist.

The broader exploratory suite, started before final parent integration, finished
with 2,096 passes and 11 failures across 373 files (127,933 assertions). Failures
involved a missing ignored dbt `graph.gpickle`, denied Go build-cache writes
(including blocked projection compilation), absent `.venv/bin/python`, and two
pinned SHACL source fingerprint mismatches. At that point, no full-suite success
was claimed.

The retained core-ideal conformance/evidence replay finished with six passes and
11 failures across eight files. Recorded Linux oracle paths are unsafe here;
`dist/avro-facet-selection.js` is absent after the full public build; source
fingerprint inventories also drifted. These results are historical. The subsequent
[check repair](core-check-repair.md) restores pinned bytes, prepares the native
environment and records fresh execution rather than relabeling the old attempts.

Repaired verification passes 2,136 disjoint live tests, 17 unique admission/evidence
gates, all 174 native/browser inventory commands and 91 post-parent browser refresh
commands. The final affected API replay passes 208 tests; 48 semantic-reference
browser checks and 14 independent shape cases pass. Native equivalence and
publisher validator parity remain outside this claim.

## Review-fix revalidation

Review of the PR produced the following changes, merged with the schema-properties
parent `d64be8c8`: a `SEMANTIC_TYPE_COMPETING_MEANING` warning when core
`semanticTypes` and the prototype extension payload disagree, 0.9.0 diagnostics that
no longer describe the document as 0.8.0, validator exception messages in `unknown`
results, and a documented, tested limit that the 0.8.0 schema-properties APIs reject
0.9.0 documents. A proposed `legacySemanticTypes` target field was added and then
removed; upgrade collisions remain archived only in the receipt `residuals`.

The [current acceptance](../../../../fixtures/validation/core-semantic-types-acceptance.json)
records `reviewFixRevalidation` for source revision
`6e41b204587ceb722f6137dba39f30a1b1c825a2` and supersedes the prior record, retained at
`59c3c424`. With Bun 1.4.2, Python 3.9.6, jsonschema 4.25.1 and Chromium 153.0.8010.12:

- affected API replay: 212 passed, zero failed; 5,127 assertions across 33 files.
- `bun run typecheck`, `bun run build`: passed. Package and schema audits: 60/60 and 352/352.
- Chromium: 48 checks, 14 Bun/browser diagnostic comparisons, zero external requests.
- Independent Python Draft 2020-12 reference-shape oracle: 14/14 agreement.

Logs are under `fixtures/validation/core-semantic-types/revalidation/`.

Not re-executed: the repository-wide native/browser replay and the 17 retained
admission gates. This machine is not the pinned replay environment (Bun 1.3.14,
Python 3.12, Java 21, Spark 4.0.1, database containers). A gate attempt after building
the optional runtimes passed 4 and failed 13 because specialized per-system bundles such
as `dist/avro-facet-selection.js` are absent. A whole-suite run at `a987114a` passed
2,133 and failed 24 (native/evidence gates plus two timing-sensitive tests that pass
alone). These are diagnostics. The earlier published repair counts (2,136 live tests,
17 gates, native replay) were produced at their own source revisions and are not
re-claimed for this one; the replay in the check-repair document must be rerun in its
pinned environment before relying on them for the final tree. No native equivalence or
publisher validator parity is claimed.

## Fresh container acceptance (2026-10-06)

The [integrated replay](core-check-repair.md#integrated-container-replay-2026-10-05)
supersedes the preceding pending replay limitation. Library/native/test source
`d05d9ec8` includes parent `ac800eed`; finalization tooling is separately
fingerprinted. Bun 1.3.14 / Python 3.12.3 / jsonschema 4.25.1 / Chromium
153.0.8010.12 provide fresh execution: 174 native/browser inventory commands,
2,140 disjoint regression tests, 17 complete admission/evidence gates, all six
proof closures, and 213 affected API tests. The unique union is 2,157 tests across
382 files. Package/schema audits pass 60/60 and 352/352; the semantic browser
passes 48 checks and 14 diagnostic comparisons with zero external requests;
the independent reference-shape oracle agrees on 14/14 cases.

Failed timing attempts and the interrupted gate run remain distinct from the
successful executions. These counts establish only the qualified subsets in
CONTRACT-051 and the existing binding contracts. Publisher catalogs, TableSpec
validator bindings, domain-algorithm parity and native equivalence remain open.

## Stacked-base conflict resolution (2026-10-06)

Integrate parent `d0e1c7a0`, retaining its current-only 0.8.0 Key tuple API and
source-input replay guards. Preserve the completed Docker runner, sealing,
bounded retries and explicit retired fingerprints. Auxiliary and publication
stages now cover both schema-properties and semantic-reference probes.

Bounded revalidation passes typechecking, the browser build, 88 focused tests
across six files (877 assertions), and five Chromium 153.0.8010.12 probes for
Key tuple/public/transition, Relationship public and SQL Server tuple encoding.
Package/schema audits pass 60/60 and 353/353. Fresh browser records resolve the
conflicting generated evidence. Execution
logs and merged-worktree source fingerprints are under
`fixtures/validation/core-merge-revalidation/`. The earlier full Docker replay
and its 2,157-test union remain historical at `d05d9ec8`; they are not re-claimed
for the changed Key tuple implementation. The Key tuple API supports 0.8.0
documents; 0.9.0 support remains outside that API's version-specific scope.
