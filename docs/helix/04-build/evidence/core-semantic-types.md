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

## Final verification

[Machine-readable acceptance and source fingerprints](../../../../fixtures/validation/core-semantic-types-acceptance.json)
identify source revision `02c8ee68` and the final runtime/schema/test inventory.
Logs are under `fixtures/validation/core-semantic-types/`.

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
pinned SHACL source fingerprint mismatches. No full-suite success is claimed.

The retained core-ideal conformance/evidence replay finished with six passes and
11 failures across eight files. Recorded Linux oracle paths are unsafe here;
`dist/avro-facet-selection.js` is absent after the full public build; source
fingerprint inventories also drifted. These historical admission gates require
fresh native/browser replay. Their retained acceptance is not rewritten as passing.
The PR remains draft with these repository-wide limitations visible; completed
status here describes the bounded semantic-reference implementation evidence.
