---
ddx:
  id: TD-043
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: US-043
      kind: informed_by
---

# TD-043: Implement core facets ideal

## Scope

Implement US-043 under CONTRACT-040. Architecture is the direct parent; no
separate solution design exists for this core slice. The current envelope only
implements scalar-family metadata. This design is planned, not executed evidence.

## Technical Approach

Implement author bounds with exact numeric tokens and explicit units. Use checked immutable TypeScript models and trusted local
bindings. A shared projection result retains copied input, provenance, residuals
and complete candidate or block; native codecs retain authority over native data.
Trade-off: consumer access improves while loss reports and native payloads remain
necessary; a core label cannot reduce the native fidelity obligation.

### Facet validation and lowering decisions

Normalize only the interpreted mathematical comparison domain, retaining original
native numeric tokens. Reuse exact-integer validation before accepting bit counts,
precision, scale or length bounds; never round through Number first. Check compatible
scalar family and cross-facet constraints before target selection. Use arbitrary
precision integer arithmetic for ranges; resource bounds block oversized operations.

Separate requested domain from target carrier and enforcement. PostgreSQL/SQL Server
integer carrier selection may require generated bounds constraints; decimal storage
acceptance does not prove exact input conversion because native coercion may round.
TableSpec bounds need the declared runtime interpretation. Avro and Parquet annotations
require native codec checks and explicit unenforced-bound residuals. Unicode scalar,
UTF-16 unit and encoded-byte length are distinct conversion paths, never name aliases.

Retain the binary64-to-binary32 loss as a mandatory precision regression even with
no float facet. Exactness policy must compare represented values, not matching float
family labels. Width/precision/domain changes cannot silently update authored facets
when recaptured from a target with weaker enforcement.

## Component Changes

- `spec/core/`: add this concept and complete result/provenance/residual schema
  branches after the semantic contract; choose and document the version/profile
  transition before reserving open members (US-043-AC1/10).
- `src/model/`, `src/validation/`: typed authoring, exact facet/reference checks,
  copied access and conflict detection (AC1/2/10); do not rewrite unrelated content.
- `src/adapters/{tablespec,postgresql,sqlserver,avro,parquet}/`: source-qualified
  classifications retaining native payloads; no derived-authority guessing (AC2/6).
- `src/projections/`: explicit strict/report native bindings, candidate atomicity
  and recoverable residuals (AC3–5).
- `tests/core/facet-ideals.test.ts` and five native fixture directories: acceptance and boundary matrix
  (AC1–10). Use Bun host tooling in `scripts/`; portable `src/` cannot import it.

## API/Interface Design

CONTRACT-040 owns the exact ideal semantics and operation/result obligations;
CONTRACT-001 owns existing envelope/copy limits. Implement complete machine-readable
operation/report schemas before exporting new APIs. Every binding declares its
version/subset and exactness obligations; unsupported native syntax blocks safely.
Consumer selection must preserve source identity and source paths, not merge names.

## Data Model Changes

Add this concept incrementally, retaining author/classification provenance and
native extension data. An absent member on an old model asserts nothing. No
schema file changes are made in this documentation evolution. No database migration
is implicit; native DDL is reviewable output, executed only by isolated test harnesses.

## Integration Points

| Binding | Integration obligation |
| --- | --- |
| TableSpec | Pin model and checked-in schema separately; contextual/runtime discrepancies remain explicit |
| PostgreSQL | Distinguish raw declared DDL from catalog-resolved observations; use pinned native engine |
| SQL Server | Retain alias, enabled/trust/filter and comparator details; use pinned catalog capture/native oracle |
| Avro | Preserve union/default/name-resolution meaning and verify with both existing independent codecs |
| Parquet | Preserve original bytes and embedded Arrow refinements; verify with existing PyArrow/native wire oracles |

The CONTRACT-040 five-system row for facets defines required mapping behavior.
Missing or unavailable native engines are evidence gaps, never inferred passes.

## Security and Performance

Treat all model inputs as untrusted; use existing copy limits, exact token checks,
cycle-safe reference traversal and no getters/artifact code/network execution.
A resource limit blocks atomically. Existing limits (depth 128, 100,000 nodes,
4M text) remain in force; this slice makes no throughput promise. Native services
are isolated test dependencies, never browser library dependencies.

## Testing

Implement tests/core/facet-ideals.test.ts for authoring, conflicts, unknowns and both recovery directions.
Run the five binding matrices with native acceptance/value counterexamples and
Chromium parity, both JSON/YAML recoveries, no external browser requests and no
Node/Bun globals. AC7 retains fixtures/sqlserver/indexes-oracle.json,
fixtures/sqlserver/index-projection-oracle.json and
fixtures/avro/tablespec-oracle.json as permanent shared regression anchors;
regenerate with their existing scripts when affected, do not equate old artifacts
with evidence that the new ideal works. Test supplementary Unicode against SQL Server UTF-16 bounds, decimal rounding, signedness and width boundaries; unknown qualifiers survive.

AC8 requires all five qualified bindings. AC9 has separate records for >=2 ideal
admission, five-system delivery and (only if pursued) native-equivalence graduation.

## Migration & Rollback

Additive does not mean collision-free: check old unknown members before reserving
names, record a version/profile transition, preserve originals and test inverse
migration. Disable new classification/projection without dropping author data.
Rollback restores the old envelope/archive plus explicit retained new assertions;
it must not fabricate those assertions in an older interpreter. Native removal
is not part of this slice and requires its own FR-28 migration/rollback decision.

## Implementation Sequence

1. Confirm CONTRACT-040 surface and document version transition; implement core
   schema/types/validators and AC1/10 before adapter changes.
2. Add five independently scoped up/down bindings with AC2–7 and retained archives.
3. Verify >=2-system admission evidence, then complete all-five AC8/9 gate before
   starting the next concept. Publish failures and residuals, not inferred support.
4. Run Bun tests/typecheck, browser build/Chromium and relevant native oracles;
   update evidence fingerprints and compatibility claims.

## Risks

Test supplementary Unicode against SQL Server UTF-16 bounds, decimal rounding, signedness and width boundaries; unknown qualifiers survive.
The mitigation is explicit bindings, exactness/refusal and native counterexamples,
not withholding the ideal. Unsupported mappings stay in scope as qualified refusals
and follow-up bindings; report mode must never imply execution enforcement.

## Review Checklist

- [x] All story ACs have implementation/test responsibilities.
- [x] Governing meaning stays in CONTRACT-040; native refinements are retained.
- [ ] Schema/version transition, five bindings and regression evidence implemented.
