---
ddx:
  id: umf.evidence.rust-migration.r5-core-relationship-selection
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-041
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-core-relationships
      kind: informed_by
---

# R5 core relationship selection checkpoint

This opt-in Rust operation ports `selectCoreRelationships` from
`src/model/relationship-selection.ts` against core 0.10.0 and selection schema
2.0.0. It retains the copied source and query, preserves source relationship
order, and returns exact stable identities and JSON Pointer paths to each
relationship, endpoint Record, target Key, and optional association Record.
Forward and optional reverse navigation describe authored presentation only;
they do not model instance edges or establish native enforcement.

The immutable TypeScript packet binds the current selection module and its
validator/schema/resource/fixture closure. Sixteen cases cover all result
paths, filters and intersection/empty semantics, source-or-target endpoint
matching, target-key-insensitive filtering, association records, directed,
inverse and undirected navigation, unknown qualifier paths, early/late unknown
properties on valid Record and Key objects, a valid lone surrogate identity,
malformed query before invalid source, a legacy source,
and the output-only aggregate structural limit. The latter admits a source
with 99,742 retained unknown values, then pins the result-copy refusal at
`/source/unknownPayload/99739`; it proves output growth is bounded after the
input itself fits. Separate frozen controls establish caller source isolation
and that a TypeScript getter is refused without invocation.

Rust uses the invocation `Context` for source/query/result structural copies,
filter work, record indexing, schema validation, cooperative meter, and
cancellation. The operation validates the exact query before validating the
source, then validates its assembled result against the published selection
schema. The Rust test target compares frozen outcomes/refusals, checks exact
path mapping and source retention, and exercises host meter and cancellation:
`cargo test --offline --locked -p umf-core --test
r5_core_relationship_selection` (6 tests). The live TypeScript baseline is
`bun test tests/core/relationship-selection.test.ts` (4 tests, 149 assertions).

Independent source review found unmetered linear filter membership checks,
target-key scans and repeated navigation/diagnostic traversals. The current
implementation charges each filter comparison before matching, and charges
filter-array extraction and cloning, key/index/reference/path traversal work
to `Context`. Work probes distinguish per-item filter extraction from input
copying and use paired early-versus-late matches to prove identical selections,
higher charged work for the late match, and meter/cancellation refusal during
the long scan. The frozen packet
also varies unknown property ordering around Record and Key fields. Rust
property lookup charges each ordered object-key comparison, including unknown
qualifiers, to `Context`; the paired adversarial cases preserve selected
meaning and expose the extra work when known properties appear later.

The descriptor-based Rust API receives already materialized `Value`s, so the
frozen accessor/getter control documents the TypeScript predecessor boundary;
it does not establish behavior for a future JavaScript binding decoder. The
operation is opt-in and is not wired into the default TypeScript API or any
Node, Python, browser/WASM or core-wire route. Binding parity, installed
artifacts, browser execution, broader resource/allocation fault qualification,
and default routing remain open. CONTRACT-041's native projections and
relationship admission evidence are separate from this metadata selector.

Artifact SHA-256:

| Artifact | SHA-256 |
| --- | --- |
| Live predecessor `src/model/relationship-selection.ts` | `c6a1a570846fb507069d4a45c77722990b5e282ee7b24d48a76bdfcb22fe7f6d` |
| Frozen TypeScript packet | `e18d492425078db54e0a057e4d71fae65fe2501895a1006d9d51a6cf02326a10` |
| Rust core module | `cf6294daa38cbd8ad3c19dc24ff0869fa5a933e8085024c684f9d4f444551bc9` |
| Focused Rust differential test | `b094d1cdbb8199fa180c6d1e664ff540c9543e8352323efcd1e285399f078304` |
| TypeScript freezer | `bfce768649b760b2c8e6037b126f337bccdcd4dfc719a3f3a614ce7829d3bf6d` |

The packet embeds exact source/resource SHA-256 values for the current
predecessor closure. These pins qualify this core checkpoint only and do not
bind a generated binding artifact or installed consumer cohort.

## Independent Sol core review — 2026-10-24

The integration reviewer did not implement the Rust selection algorithm.
It verified the four artifact hashes above, regenerated the frozen packet,
and reran the pinned offline Rust target (6/6) and live Bun baseline (4 tests,
149 assertions). Source review checked the
earlier P2's filter comparisons, Record/Key property scans, endpoint and
navigation traversals, and query filter extraction. Remaining unmetered
`get` calls read the fixed schema/exact query shape or repeat an endpoint
lookup immediately after a charged full scan. No P1/P2 remains in this
bounded core operation review. The binding and installed/default-route gates
above are unchanged.
