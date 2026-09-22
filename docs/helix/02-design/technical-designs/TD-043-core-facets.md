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
separate solution design exists for this core slice. Field, Nullability and Cardinality
have passed their qualified five-system gates. Implementation starts from experimental
core 0.4.0 with explicit item/value Field references. Experimental 0.5.0 facet
validation, authoring, migration and metadata selection now pass core-task
acceptance. Native facet bindings and admission remain separate tasks.

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

Reserve `Element.facets` only in experimental core 0.5.0. Keep the 0.1–0.4
schemas and receipts immutable. The normative representation and transition are
specified in CONTRACT-040's facet decision below. Existing unknown facet-shaped
content is never reinterpreted by changing a schema registry entry. Native DDL
remains reviewable output executed only by isolated test harnesses.

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


### Facet representation and implementation decision

Use `spec/core/facet-document.schema.json` with `$id: urn:umf:core:0.5.0`.
Reuse the 0.4.0 Field, availability, cardinality and item/value reference semantics.
Only scalar value Fields may carry facets; known array/map containers and direct
record-valued Fields cannot. Missing/one/unspecified cardinality does not invent
additional shape or availability. Unknown cardinality blocks facet interpretation.

Numeric bounds use JSON integers in [0, 9007199254740991], with positive precision
and bit count. This is the existing core interoperable JSON numeric profile,
not a restriction on represented integer/decimal *values*: integerWidth describes
mathematical powers of two and decimal precision/scale describes coefficients.
Do not allocate those powers while validating metadata. Raw JSON/YAML goes through
`readJsonValue` before numeric conversion; unsafe or rounded numeric tokens reject.
A caller-supplied JavaScript number has already lost its lexical history, which
UMF cannot reconstruct. Native adapters must retain their original exact token
before conversion and report bounds that cannot fit this core metadata profile.

JSON Schema checks local domains, required pairs, scalar family and container
compatibility. `scale <= precision` is a semantic validation rule described in the
schema; do not introduce a nonstandard `$data` dependency. Missing facets assert
nothing; an empty object asserts no bounds. Unknown facet members and nested
qualifiers remain copied and diagnosed. Unknown nonempty length-unit labels remain
uninterpreted and block exact projection. Known length units require their matching
string/binary family; a length facet with an unknown unit still requires a string
or binary Field. Unknown qualifiers never certify an exact native mapping.

`upgradeFacetEnvelope` explicitly accepts 0.4.0, archives every element's existing
`facets` member (including null, false and apparently valid bounds), removes that
member from the 0.5.0 target, and retains the full source. Rollback verifies the
receipt by recomputation, restores the original 0.4.0 document and separately
retains the entire current 0.5.0 document. It must not apply later assertions to
an old opaque member. Unknown content elsewhere is copied without interpretation.

`inspectCoreFacets` returns copied interpreted members and explicit unknown paths,
or missing/legacy/inapplicable meaning. It does not infer author provenance.
`declareCoreFacets` receives an explicit Field identity and a patch of known facet
groups. Precision and scale must be supplied together. Omitted groups are retained;
updates preserve unknown nested members and archive prior assertions. An unknown
unit cannot be overwritten by this operation. Removing groups or unknown content
is not an implicit consequence of authoring another facet. Every declaration has
a copied source/target, authored provenance and a recomputable receipt; stale or
forged receipts refuse use by projections.

Extend versioned Field, record-type, Nullability and Cardinality authoring and
selection for 0.5.0, retaining every existing receipt verifier. Selection follows
item/value links and preserves facets rather than inferring constraints from native
payloads. Direct record-type assignment to a faceted Field must conflict atomically.
Update the complete operation/transition/selection schemas before public exports.
Native bindings remain explicitly versioned; old bindings must not silently accept
0.5.0 input using a 0.4.0 receipt schema.

Implement and check the candidate facet schema and internal semantic validator
first, then integrate the version transition, public authoring and consumers.
A candidate schema or internal validator is not full 0.5.0 runtime support. Core
acceptance requires positive/negative exact-token fixtures, all nine scalar families,
Unicode versus byte units, paired decimals, signed/unsigned widths, recursive item
Fields, legacy collisions, unknown qualifiers and both JSON/YAML recoveries in Bun
and Chromium. Refresh the priority regression excluding all three existing concept
gates, then revalidate their evidence and run Field, Nullability and Cardinality
gates in order. Complete this core task before native facet binding acceptance;
finish the five-system facet gate before starting key implementation.


### Facet candidate validation checkpoint

The candidate 0.5.0 JSON Schema and internal `validateFacetElement` validator now
have Bun and [Chromium 148 evidence](../../../../fixtures/validation/core-facet-candidate-browser.json). Three focused tests pass with
887 assertions. The 99-case matrix covers nine scalar families, roles/container
conflicts, length units, decimal pairing/order, signed/unsigned integer widths,
maximum safe counts and retained unknown members/units. Browser checks recover
198 JSON/YAML values and check 18 numeric-token cases without host globals or
external requests. Accessors are refused without execution. Structural JSON Schema
and the additional scale/precision semantic check are distinguished explicitly.

Typechecking, the standard build and audits of 254 schemas / 42 packages pass.
The public browser bundle remains byte-identical to the accepted 0.4.0 build.
Reproduce with `bun test ./tests/core/facet-ideals.test.ts`,
`bun scripts/core-facet-schema.ts` and `bun scripts/core-facet-browser.ts`
(with the configured Chromium executable).

This is a candidate schema/internal-validator checkpoint. The public document API
still refuses 0.5.0. Explicit migration/rollback, facet authoring/inspection,
versioned existing operations and selection remain required before core-task
acceptance; all five native facet bindings and facet admission remain pending.
No new native enforcement or equivalence is claimed. Existing 0.4.0 gate evidence
is retained with documentation-only revalidation; it does not qualify facets.


### Facet core-task acceptance

The [core acceptance record](../../../../fixtures/validation/facet-core-acceptance-evidence.json) supersedes the candidate-only checkpoint's
public-runtime limitations. Core 0.5.0 now validates declared facets, explicitly
migrates/rolls back 0.4.0 collisions, authors/inspects known and partial bounds,
verifies source-bound receipts and follows faceted item/value metadata in selection.
Kind/record-type v4, Nullability v3 and Cardinality v2 operations retain prior
receipt versions. Existing Cardinality native bindings explicitly refuse 0.5.0
rather than apply their 0.4.0 representation rules to facet declarations.

All 78 refresh steps pass: 420 priority tests / 39,482
assertions across 135 files, typechecking, 261 schemas, 42 extension
packages, browser build and qualified native/browser checks for existing Field,
Nullability and Cardinality bindings. Their three separate gates subsequently pass.
The scope is core plus the five priority systems, not a new full-repository baseline.

Chromium 148 checks 99 public validation cases, 62 valid-document recoveries,
18 migration/rollback recoveries, eight facet-author receipts, eight versioned
prior-operation receipts, four selection receipts and 15 refusals, with no host
globals or external requests. The separate facet-local matrix retains 198 metadata
recoveries and 18 exact-token checks. Reproduce with `bun scripts/core-facet-operations-browser.ts`
and `bun scripts/core-facet-browser.ts` using the configured Chromium executable.

This closes only the facet core task. All five native facet bindings, useful ideal
admission, the facet delivery gate and key remain required. No native facet
enforcement, general row conversion or native equivalence is claimed. The next
binding is TableSpec under the declared schema/runtime profiles; native refinements
and unknown numeric tokens must stay attached to any classification/projection.

### TableSpec facet binding decisions

The native discovery supplement at
[TableSpec facet discovery](../../04-build/evidence/tablespec-facet-discovery.md)
requires explicit consumer profiles. The classifier accepts `declared-metadata`,
`json-schema`, `pyspark-schema`, `gx-spark`, `ingest-cast` or `unresolved`, plus
`raw` or `model-normalized` input and `value-domain` or `exact-input` obligation.
These describe the interpretation requested of the retained native source;
classification does not run a model validator, pipeline, or caller-supplied code.

Only uncoerced safe integer facet tokens can enter core. Model coercion, oversized
counts, invalid native combinations and unknown qualifiers remain residuals.
Raw and normalized inputs never share an implicit normalization step: normalized
profiles account for the demonstrated removal of `max_length`, while originals
remain in the archive. General native validation outside the selected member and
facet subset is not claimed. Both profiles retain the original source text/bytes.

Explicit valid decimal pairs may describe declared bounds under the metadata
profile. General PySpark generation ignores those pairs; its default decimal(10,0)
stays an observation/residual, not a replacement core assertion. Ingest casts can
classify explicit pairs only within the proven Spark domain (precision <= 38),
with rounding/ANSI behavior retained. Missing decimal facets never become authored
bounds merely because a consumer supplies a default. An explicit INTEGER type
can supply inferred signed-32-bit domain evidence under the PySpark/ingest profile;
it does not prove identity or an authored width. Unknown native `integerWidth`
content never supplies that evidence.

Length requires the selected consumer's proven Unicode-scalar interpretation:
raw JSON Schema uses `max_length`; GX uses raw `max_length` or `length`, and
normalized input retains only `length`. General PySpark and ingest casts do not
establish that bound. Conflicting, ignored and malformed declarations remain
visible. Other scalar families and byte-length requests require their own mapping
or an explicit residual. Neither a native count nor a successful import implies
Unicode normalization, grapheme, padding or collation behavior.

`exact-input` additionally requires evidence about conversion, not just output
domains. Decimal rounding, float narrowing, coercing casts and unqualified input
validation block strict classification of that obligation; report mode retains
an explicit residual. Unknown core facet qualifiers remain attached, even when
known bounds match. Existing author facets require a verified source-bound receipt;
conflicting known bounds block both modes. No unverified label is author provenance.

The classifier needs a complete operation schema and a versioned element-scoped
extension package. Results retain copied source, native fragments/paths, interpreted
facets, per-concept provenance, loss diagnostics and residuals. Verification
recomputes the complete receipt and checks the current target before recovery.
A blocked result has no partial target. Report mode may retain a valid UMF candidate
without asserting unclassified facets. Native source recovery must remain exact,
including split-file archives, unknown fields and unsafe numeric tokens.

Down-projection and the combined binding acceptance remain separate work within
`umf-97221618-1c44db4c`. A classification checkpoint does not refresh the existing
core/concept gates, complete both binding directions, or admit native equivalence.
