# Migration and row-scope implementation handoff

Implementation takeover completed on 2026-10-22 after the independently captured request-changes rounds. This is an implementation handoff for fresh independent review, not approval of our own port or of all R3 lanes. Earlier captures and native receipts remain unchanged.

## Source-port checklist

| Current TypeScript closure | Rust implementation and coverage |
| --- | --- |
| `table-authoring/row-scope.ts`: source copying, unknown members, owner/via bindings, command subsets, batch, group aliases, open-reference read, diagnostics, provenance | `row_scope/mod.rs`: UTF-16 member/pointer identity; present nonstring owner refusal; shared duplicate-command parser; full host field refs; occurrence paths instead of structural equality; group wrapper ordering; raw host-binding JavaScript truthiness. |
| `table-migration/index.ts`: admission, lineage, command-only, append-only, source logical meaning, policy changes, dependencies, emission, verification | `migration/mod.rs` handles admission/lineage/verification and `evolution.rs` replaces the incomplete append compiler. Emission includes nullable/tightened columns, typed defaults/backfills, native widening and reviewed casts, renamed/dropped columns, constraints/indexes/keys/FKs, grants/policies, comment removal, source-ordered deferred drops and validations. |
| `reviewed.ts`: discovery and source-bound markers | `discovery.rs` preserves physical/logical/mapping/seed old meaning, exact constraint/policy paths, stable canonical digest IDs, and UTF-16 identity. Marker parsing checks identity/digests/conversion units before matching current candidates. |
| `options.ts`, `phases-options.ts`, `phases.ts` | Reviewed-marker/validation order precedes backfills/concurrent selections; scoped-row and batch restrictions; v0.1 legacy verification; exact legacy concurrent-index-only document comparison; v0.2 inventory/validation/barrier selection and phase seed IDs. |
| Limits and aggregate artifacts | Public source admission keeps ordinary limits. Already-admitted composed bodies use admitted canonical helpers. Step count 8192, canonical body 24,000,000 bytes, phase seed ID capacity 99999, generated-ID collision handling, exact review/purge inventory are explicit. |
| Shared SQL | Native type spelling and every typed literal carrier reuse deployment's crate-private mapper; literal helper preserves terminal host failures. No replacement SQL dialect or narrower accepted literal subset. |

No intentionally omitted current migration/row-scope semantic branch is known at handoff. The implementation is based on the complete functions above, not just the frozen cases. Shared tables/deployment correctness, generation/stage-one, wire/bindings and their final integration remain separately owned and reviewed.

## Resource/control checklist

Public admission remains first. Long input-derived loops poll Context; tree copies use precharge helpers before cloning. Discovery scans borrowed data and copies only through its charged helper. Evolution propagates fallible comparisons, precharges copied values, and charges SQL formatting writes before growing String output. Aggregate canonical/hash operations use the metered admitted helpers. Row normalization charges scans, diagnostics/origin construction, policy copies, lifecycle serialization and output publication; identical group policies move the prior Value rather than cloning it. No host semantic-looking code is classified as a semantic refusal when its private control origin is set.

Controls calibrate successful admission, then inject a host `NUMBER` failure during row normalization; migration/discovery inject `LIMIT` after 75% of a successful operation's meter callbacks. Both preserve terminal origin/path. Root's separate raw API controls cover all nine APIs, duplicates/nonfinite input and semantic-looking host failures.

Review priorities remain explicit: inspect every input-derived allocation/copy and helper scan rather than treating coarse precharges as proof; inspect deeply nested generated group wrappers and recursive Value drop safety; inspect raw host-context values beyond typed TypeScript declarations. The bounded controls are evidence, not exhaustive proof of cancellation latency, stack safety, arbitrary allocation failure or hard process isolation. No final independent reviewer has yet approved this implementation.

## Retained checks

- Original release baseline: 129/129.
- Complete existing migration supplement: 26/26 (release; debug timing is not an assertion failure).
- Independent round-three controls: 11/11; new evolution branches: 8/8.
- Typed backfill/default and ordering controls: 13/13; malformed/raw Unicode precedence controls: 9/9.
- Raw API tests: 2/2; own mid-work control tests: 2/2.
- Final raw open-read binding truthiness controls: retained separately below with final rebuild receipt.

`typed-backfills/frozen.json`, `raw-refusals/frozen.json` and `raw-context/frozen.json` are additive immutable TypeScript expectations, captured before their corrections and discoverable by the root all-host gate. Existing fixtures were not refreshed. Capture programs run from repository root; they intentionally write scratch output under `/private/tmp` and must not overwrite retained expectations.

## Native qualification

`native-postgres/` retains a fresh proof from the latest migration implementation: PostgreSQL 18.6 Homebrew, Weft 0.4.48; initial 84-step plan committed, forward 10-step mixed plan committed, both fixture rows changed to `restricted`. The existing Python lifecycle driver and installed `umf_codegen` 0.1.0a4 host verify/apply the Rust-produced plans. This explicitly qualifies that existing host subset; it does not establish an R4 Rust lifecycle/host-verifier replacement. The isolated test server was stopped. Historical `r3/native-migration/` was preserved.

`implementation-source-sha256.json` binds the owned source and driver used for the replay cohort. Parent may rebuild the shared driver as other lanes finish; those later binaries need their own final cohort evidence. No source writes by this owner are planned after this handoff.
