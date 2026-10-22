---
ddx:
  id: CONTRACT-058
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
    - id: CONTRACT-056
      kind: references
    - id: umf.architecture
      kind: references
---

# CONTRACT-058: Bounded core revision preservation

**Type:** browser-compatible library. **Version:** experimental 1.0.0.
**Profile:** `core-0.8-absent-string-additions/0.1`.

## Purpose and boundary

Classify whether an explicit pair of logical core 0.8.0 documents preserves
existing definitions and permits a bounded addition with absent old values.
Independent validity of the after document MUST NOT imply preservation.
This operation does not migrate data, bind catalogs, assign storage IDs, approve
native casts, publish a graph or establish source authority. Consumers retain
original wire bytes and independently supplied before/after identities.

## Public interface and custody

`inspectCoreEvolution(before, after, policy)` MUST accept original documents and
closed policy `{profile:"core-0.8-absent-string-additions/0.1"}`.
`verifyCoreEvolution(receipt, expectedBefore, expectedAfter, expectedPolicy)` MUST
receive independently retained expected inputs, check the closed receipt schema,
recompute the complete result and require exact equality before returning a copy.
No receipt-held source or caller-provided classification can replace expected inputs.

The receipt MUST retain `operation:"inspect-core-evolution"`, `version:"1.0.0"`,
`profile`, both copied sources, original document validations, classification,
ordered changes, original public presence checks, diagnostics and residuals.
The proposed closed shapes are `spec/core/evolution-policy.schema.json` and
`spec/core/evolution-operation.schema.json`; structural acceptance alone is never
a compatibility decision.
JSON object member order is not identity; ordered arrays and every scalar token,
unknown member and extension value MUST be preserved exactly by comparison.
Exact lexical source formatting remains consumer wire-byte custody.

Invalid sources, wrong versions, forged receipts, accessors, non-JSON content and
resource exhaustion MUST refuse without a partial result. No implicit envelope
migration, extension registration, network acquisition or default insertion occurs.

## Preservation profile

Both documents MUST retain the same document ID and declared `umf:"0.8.0"`.
No revision-envelope members are permitted to change in this initial profile.
Document/module metadata, module order, existing element order and definitions,
Key declarations, relationship declarations, annotations and extensions MUST remain
exact. Stable definitions use document/module/element identity, never display names.
Renames, reorderings, removals, identity changes and modified existing scalarType,
cardinality, nullability, facets or defaults do not preserve this profile.

The only allowed difference is appending new Field declarations to an existing
module and appending corresponding member references to existing Records in
that same module. Cross-module additions are retained but classify unsupported
in this initial profile. Each
new Field MUST have explicit `kind:"field"`, `scalarType:"string"`,
`cardinality:"one"`, `nullability:"absent-allowed"`; it MUST have no default,
Key/relationship participation or unknown interpreted constraints. The exact
admitted new-Field member names are `id`, optional `name`, `kind`, `scalarType`,
`cardinality`, `nullability`, and absent or empty `extensions`. New descriptions,
titles, aliases, annotations, defaults and other members are retained but classify
unsupported in this profile, even where standalone validation understands them.
Each appended
reference MUST resolve to one admitted new declaration; duplicate references and
unreferenced additions refuse preservation. Existing Record content is unchanged
except this exact member suffix. New Records/modules, relationships and Keys are
outside the profile.

The implementation MUST invoke the original public Record presence evaluator for
explicit absence of each appended Record-member occurrence, retaining the entire
original receipt and its diagnostics. Only that member's own field validation
MUST be valid and complete. Unrelated omitted required members and relationship
context may make the partial Record receipt invalid or incomplete; retain those
diagnostics without treating this call as complete Record validity. Do not
synthesize values for existing members.
It MUST NOT copy the evaluator's rules into a new semantic validator. All existing
value interpretation remains unchanged because its complete owning definitions,
references and constraints remain exact; no claim about native representations follows.

## Classification

`preserved` requires valid, completely understood sources, exact unchanged existing
meaning and all admitted additions. Exact identical sources classify `preserved`
with an empty change list only when both source validations are valid and complete. `breaking` reports a demonstrated known definition
change, including integer-to-string, removals and required additions, under this
profile; it is a refusal of preservation, not a universal incompatibility theorem.
`unsupported` reports changes or retained unknown meaning that cannot be completely
classified by this profile. Unknown extension/member content survives in sources;
unchanged unknown content MUST NOT be promoted to interpreted preservation evidence.
Both non-preserved classes have `complete:false` and explicit residuals. Known
breaking findings MUST survive alongside unsupported residuals. Classification
precedence is `breaking` when any known preservation violation is established,
even if unsupported residuals also exist; otherwise `unsupported` when any
meaning or change remains unclassified; otherwise `preserved`. Neither
non-preserved classification may be read as a complete universal compatibility verdict.

## Resource and implementation obligations

Use immutable invocation-local copies and schema snapshots. Existing JSON depth,
text and value bounds remain in force. Aggregate retained input/output MUST stay
within 100000 JSON values and 4000000 UTF-8 bytes. Charged semantic work MUST remain
within 1000000 visits, including copying, schema branches, validation, indexing,
canonical comparisons, sorting, presence evaluator calls and verifier recomputation.
Reserve or meter nonlinear comparisons before execution; no unexplained multiplier
or uncharged nested scan is acceptable. Reuse bounded source/index primitives from
CONTRACT-056 internally where appropriate; its private hooks remain unexported.

## Acceptance

Bun and real Chromium MUST agree byte-for-byte on unchanged original commerce,
absent String addition and known quantity type change. Controls MUST include required
addition, present-null versus absent, changed unknown extension, unchanged unknown
meaning, removed/reordered members, changed facets/defaults/Keys/relationships,
wrong identity/version, forged expected source/policy, schema mutation, resource
bounds and duplicate presentation names with distinct qualified identities.
Independent complete dataset validation remains a separate receipt. Ashlar's stable
numeric development registry remains consumer-owned and cannot be inferred from this
logical operation. Native publication, migration, and cross-system equivalence require
separate evidence.
