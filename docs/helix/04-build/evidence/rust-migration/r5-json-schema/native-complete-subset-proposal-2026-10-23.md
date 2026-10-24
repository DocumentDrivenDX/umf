---
ddx:
  id: R5-JSON-SCHEMA-NATIVE-COMPLETE-SUBSET-PROPOSAL
  type: evidence
  activity: build
  status: proposed
  authoring:
    home: repo
  links:
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-002
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: umf.implementation-plan
      kind: informed_by
    - id: R5-JSON-SCHEMA-DRAFT2020-V12
      kind: informed_by
---

# R5 Rust JSON Schema native-complete subset proposal — 2026-10-23

This is a review proposal for a future, opt-in `complete: true` interpretation
result from the Rust JSON Schema inspector. It records no implementation or
release claim. The inspector has no instance to validate. Therefore
`complete: true` would mean only that schema interpretation is complete for the
named admitted instance domain and schema subset. The domain is JSON null,
booleans, strings, arrays, and objects, plus numbers that meet CONTRACT-049's
lossless finite-binary64 profile (including safe-integer requirements and its
negative-zero refusal). It would not claim that assertions were checked at
inspection time. Each later validation call must apply its own numeric-domain
and evaluator-refusal guards before reporting an instance outcome; an instance
outside that domain must be refused or reported incomplete. This is not
universal Draft 2020-12 support or native equivalence outside the recorded
versions and evidence.

## Evidence state

R5 v12 executed all 1,301 vectors in the pinned upstream corpus (46 files, 384
cases) without Rust compile/runtime errors or disagreements with upstream
expected booleans. Its acceptance gate passed with 35 explicit Ajv profile
exclusions: 24 observed Ajv/upstream disagreements and 11 cases Ajv could not
serve as oracle. The separate frozen 30-case operation replay is adapter
predecessor evidence, not a validator-oracle waiver. Neither receipt
proves that every instance outcome was independently checked, nor that a runtime
subset can be called complete. Ajv is unsuitable as the sole oracle for the
excluded families. CONTRACT-002 also requires preservation and round-trip
checks beyond boolean outcomes.

The current `json_schema_inspect.rs` emits `JSON_SCHEMA_VALIDATOR_LIMIT` on
otherwise clean compilable schemas because parity with Ajv and the full profile
is unqualified. This conservative warning is the current behavior. The
proposal below would replace the blanket warning only after the evidence gates
in this document pass.

## Proposed initial admitted subset

Admission is all-or-nothing per payload. For this initial profile, the root
must use the exact standard Draft 2020-12 dialect (or have no conflicting
`$schema`), the resource map must be empty, there must be no custom
`$vocabulary` policy or custom metaschema, and the fixed standard vocabulary
policy must be in force. Every schema-position keyword must fall within this
profile:

* Boolean schemas and `type`.
* Primitive-only `const` and `enum` values (null, boolean, or string). Numeric
  constants and enum members remain excluded until numeric equality is
  independently proven.
* `required`, `properties`, and `additionalProperties`.
* Simple integer-valued count/length bounds: `minLength`, `maxLength`,
  `minItems`, `maxItems`, `minProperties`, and `maxProperties`, with tested
  domain, range, and boundary behavior.
* Basic applicators `allOf`, `anyOf`, `oneOf`, and `not`, with schema children
  recursively limited to this same profile.
* Known annotation keywords may be preserved as opaque JSON values. Their
  contents are not traversed as schemas. Unknown keywords at any schema
  position always force incomplete, regardless of whether they appear
  annotation-like or are believed to be non-asserting.

The initial profile excludes all references and resource resolution (`$ref`,
`$dynamicRef`, `$anchor`, `$id`, `$defs`), regex (`pattern`,
`patternProperties`), dynamic and unevaluated keywords, numeric comparison
(`minimum`, `maximum`, exclusives, `multipleOf`), numeric `const`/`enum`,
conditionals, object dependencies, and array item/contains applicators. It
also excludes custom metaschemas and every `$vocabulary` declaration. Do not
infer that a recognized vocabulary is inactive because an entry says `false`:
false means a metaschema implementation need not understand that vocabulary;
it does not disable its assertions.

This list is an admission boundary, not itself proof. Each admitted keyword
requires independent schema-shape and instance-behavior tests. Unsupported
constructs and unknown keywords retain their native JSON and produce an
incomplete diagnostic; they do not invalidate preservation or export.

## Mandatory incomplete conditions

The inspector must return `complete: false` if any of these occurs anywhere in
the root/resource closure:

* Unknown/mixed dialect, any custom metaschema or `$vocabulary` declaration,
  nonstandard vocabulary policy, any unknown keyword at a schema position, or
  unsupported keyword shape. This applies whether a custom vocabulary entry is
  `true` or `false`. Opaque annotation values are retained without schema
  traversal.
* Any construct excluded from the initial subset, including references,
  resources, regex, dynamic/unevaluated keywords, numeric comparisons,
  numeric `const`/`enum`, format/content assertions, conditionals, dependencies,
  and unadmitted array applicators.
* At validation time, any instance/constraint number not proven safe under the
  exact `Value`/`f64` evaluation path, including unsafe integers,
  overflow/underflow, or precision-sensitive decimals. Retain exact native
  tokens and refuse or return incomplete for that validation call; do not
  coerce into a checked outcome. Inspection cannot certify numbers in future
  instances.
* Malformed schema representation, unknown representation fields that make
  export lossy, or resource/work/depth limit/control failure. Resource support
  itself is excluded from the initial admitted profile.

`complete: true` is a schema interpretation result for the named admitted
instance domain, not an instance-validation result. Each validation call must
independently enforce numeric and evaluator refusal guards. Excluded or unknown
schema content may receive partial diagnostics with `complete: false` while
remaining preserved.

## Evidence required before changing the inspector

1. **Corpus slice and closure:** derive a deterministic fixture manifest from
   the pinned upstream corpus that includes every admitted keyword and
   interaction. Report positive and negative cases by keyword, primitive value
   class, integer count/length boundary, and basic applicator composition.
   Unfiltered v12 counts remain context, not the subset count.
2. **Independent native oracle:** run the admitted corpus against a second
   implementation independent of Rust and Ajv (for example, a separately
   pinned Python `jsonschema` validator configured for Draft 2020-12 and the
   same explicit resources). Reconcile each disagreement to upstream expected
   values with a retained reason. The R5 v12 Ajv exclusions must remain visible;
   none may be silently reclassified as pass. Where independent engines share
   known ambiguities, add hand-authored expected outcomes grounded in the
   specification.
3. **Semantic mutation controls:** inject one error per admitted assertion
   family and prove detection; inject valid and nearby invalid boundaries for
   admitted integer count/length bounds. Include basic applicator and opaque
   annotation controls. Numeric future-instance guards require separate
   per-call positive/refusal controls.
4. **Negative controls for completeness:** each mandatory-incomplete pattern
   above must force `complete: false`, even when Ajv/Rust happen to agree.
   Controls must cover custom `$vocabulary` entries with both `true` and
   `false`, custom `$schema` metaschema, every unknown schema-position keyword,
   nested-looking opaque annotation values, each excluded keyword family,
   unsafe numbers at validation time, and work/depth refusal. A deliberately
   removed incompleteness check must make a gate fail.
5. **Native round trip and adapter replay:** preserve exact native JSON trees,
   unknown keywords, annotations, opaque annotation content, number lexemes,
   URI/resource identity, and references across import/export/edit/export.
   Replay the frozen seven-operation predecessor, including its 30-case
   validation/error corpus where applicable, as a separate regression gate;
   validator subset evidence cannot replace operation-envelope parity.
6. **Claim binding:** bind receipts to source hashes, Rust/toolchain and oracle
   versions/configuration, feature/vocabulary policy, resource set, subset
   manifest, exact test commands, and before/after source closure. A changed
   inspector/compiler/oracle invalidates the affected evidence.

## Current source hashes

Hashes captured while drafting this proposal; any later source change requires
recomputation before implementation or qualification work relies on them.

| Path | SHA-256 |
|---|---|
| `crates/umf-core/src/json_schema_inspect.rs` | `e17b4d6e742c6dd5865d6b72192983a1a813bd15e6c5cb774b9fb792e0fb3e71` |
| `crates/umf-core/src/schema.rs` | `a6957bbee794086753b751e76b0ccd62c688c1ebf622e71c2fe5a4f9e0a48d17` |
| `crates/umf-core/src/json_schema_adapter.rs` | `70d9af13d7381d2256a75a9cb4854b540bd83fc44dbbd41507effbf0c66b86b7` |
| `crates/umf-core/tests/r5_json_schema_inspect.rs` | `7b8acceb9c306cb8bd3e7eca180bf80b95e8f5885977996a2c09c06436de6e9b` |
| `scripts/rust-migration/r5/json-schema/ajv-exclusions.json` | `571cf6fe685e9ceb6d89bc0aa13a79b1b2f192dded2824bfdd88bb18bf7e2128` |

The R5 v12 receipt binds evaluator `schema.rs` hash
`a6957bbee794086753b751e76b0ccd62c688c1ebf622e71c2fe5a4f9e0a48d17`,
Rust 1.90.0, upstream revision
`ab079cc2bace029fdbb483be28a6ade526bcfbc2`, and Ajv 8.20.0 with
`strict=false`, `validateFormats=false`, `ownProperties=true`,
`addUsedSchema=false`, explicit resources, and no implicit network. It records
the current v12 evidence boundary, not the proposed future subset.
