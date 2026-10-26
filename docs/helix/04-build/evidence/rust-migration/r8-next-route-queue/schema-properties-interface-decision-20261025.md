---
ddx:
  id: umf.evidence.rust-migration.r8-schema-properties-interface-decision
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-post-facets-family-audit
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-schema-properties
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-field-value
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-schema-defaults
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
---

# Schema Properties default-route interface decision

This is a source/interface decision packet for the four CONTRACT-049 exports.
It does not implement a binding or qualify a package. Current Node and browser
V4 roots `export * from './index'` and do not bind these operations to Rust.
Therefore, comparing today's installed package root with `./reference` would
only compare the TypeScript implementation with itself and is not Rust evidence.

## Public operations and Rust availability

All public TypeScript functions are synchronous and take no Engine, registry,
resource, meter, cancellation, or deadline argument. The V4 root's shared Rust
model resources come from `src/access/core-model-resources.ts` and are exactly
`coreSchema`, `referenceSchema`, `packageSchema`, `constraints`, and
`domainPolicy`. CONTRACT-049 does not name a dedicated operation-result schema
for this family. Preserve the frozen direct return shapes; do not invent a
public resource/control parameter or infer a schema-resource authority from
similarly named selection schemas.

| Public operation and signature | Rust semantic owner | Existing Rust binding seam |
| --- | --- | --- |
| `inspectCoreSchemaProperties(input: Document, identity: CoreSchemaPropertyIdentity)` | `umf_core::schema_properties::inspect_core_schema_properties` | Tagged `model/inspectCoreSchemaProperties` through opt-in `createCoreModelEngine` / WASM model wrapper; no default-root host-reflection route. |
| `declareCoreSchemaProperties(input: Document, identity: CoreSchemaPropertyIdentity, patch: CoreSchemaPropertyPatch): Document` | `umf_core::schema_properties::declare_core_schema_properties` | Tagged operation plus private `declare_core_schema_properties_host_json`; `createCoreSchemaPropertiesHostInputEngine` exposes the host-input path only in Node. No matching `executeDeclareCoreSchemaPropertiesHostJson` WASM export exists. |
| `validateCoreFieldValue(input: Document, field: {module:string;element:string}, value: CoreLiteral): Validation` | `Engine::validate_core_field_value_public` (`umf_core::engine`) | Opt-in tagged `model/validateCoreFieldValue` through Node/WASM `createCoreModelEngine`; it is not a V4 public-root binding. |
| `resolveCoreDefault(input: Document, field: {module:string;element:string}, state: CoreDefaultInput)` | `Engine::resolve_core_default_public` (`umf_core::engine`) | Opt-in tagged `model/resolveCoreDefault` through Node/WASM `createCoreModelEngine`; it is not a V4 public-root binding. |

Rust predecessors are separate immutable packets because the slices landed
independently: inspect/declaration in
[`r5-schema-properties/frozen-typescript.json`](../r5-schema-properties/frozen-typescript.json)
(SHA-256 `2427c2eb140226a93ac32e25d49a1f60a91582758c620d238dcdd9aaf8506e4a`),
Field-value in
[`r5-field-value/frozen-typescript.json`](../r5-field-value/frozen-typescript.json)
(50 cases, SHA-256 `c5b0d980a561ffd751c411e9f9745f6b091d34cf337214910debfe352ef6d014`), and default resolution in
[`r5-schema-defaults/frozen-typescript.json`](../r5-schema-defaults/frozen-typescript.json)
(24 outcomes, SHA-256 `0660e22312a38875cd3f850f4c6caaf5558a4bf4d4f4bb01463cb1c80487125c`).
Their Rust Node/WASM opt-in replays do not qualify raw-object admission in the
default V4 route.

## Required host admission order

The default implementation uses `copyJson` with depth 128 and 100,000-value
limits; copy admission rejects accessors, hidden own properties, symbols,
custom prototypes, cycles, unsupported values and unsafe numbers before
semantic processing. These are synchronous host-side checks. The public
operations do not expose controls for cooperative work, cancellation or
deadlines; the opt-in engine's metering/cancellation evidence must remain a
separate qualification statement.

The source defines four distinct operand schedules. A shared host bridge must
let Rust request the next input at each semantic checkpoint rather than eagerly
snapshotting all arguments in JavaScript or serializing them as one JSON blob.

| Operation | Predecessor stage order that a host adapter must preserve |
| --- | --- |
| Inspect | Copy `source`, copy `identity`, validate source, then validate identity members/shape and locate the scope. |
| Declare | Copy and validate `patch` (including unknown and empty-patch refusal) before reflecting `source`; then copy `source`, copy `identity`, validate source and locate the scope. Frozen control `patchBeforeInvalidSource` asserts zero source reflection. |
| Field value | Copy `field`, copy `value`, validate identity members, then enter `locate`: copy `source`, copy identity again, validate source, and resolve the Field. Invalid copied JSON carriers can therefore refuse before source admission. Rust's 50-case packet separately fixes malformed string-carrier TypeErrors and exact diagnostics. |
| Resolve default | Copy `field`, copy `state`, validate state members/shape before field members, then enter `locate`: copy `source`, copy identity again, validate source, and resolve the Field. State errors precede identity errors; source-version/validation errors precede identity lookup errors. |

The staged Rust declaration function currently follows patch → source →
identity in one `Context`, matching the critical patch-before-source refusal.
That is only one operation, and its host adapter is Node-only. Its current
R5 evidence also leaves live-object traversal/browser equivalence open. The
other three operations use tagged values; by the time Rust receives them, the
host has already materialized all operands, so those adapters cannot establish
the schedules above for arbitrary accessors or Proxy traps.

## Smallest cross-host binding shape proposed for review

Reuse the private synchronous `umf.host-json/1` reflection protocol and Rust's
existing `HostJsonReflection` traversal. Add one Rust-owned operation-dispatch
entry point whose operation-specific stages call the four existing Rust
semantic owners. Implement the same invocation-local opaque-handle dispatcher
in Node and WASM, using the existing Node and WASM host-json adapters. The
endpoint must:

1. Build/use one Engine with the root's exact five trusted resources and one
   fresh Rust `Context` per public operation. Every reflection/copy, semantic
   step and result encoding for that call must share that Context; do not reset
   budgets between stages.
2. Keep host values opaque until Rust asks for them. Rust controls copy order,
   supported-value checks, paths and stage transitions; JavaScript performs
   only the protocol's captured primitive reflection and returns exact thrown
   values on callback failure. No JavaScript duplicate semantic validation.
3. Expose all four synchronous methods through one small
   `bindCoreSchemaPropertiesRust` adapter, initialized from the existing root
   Engine/resources and selected identically by `src/index-node-v4.ts` and
   `src/index-browser-v4.ts`. The WASM route must use a wasm-bindgen endpoint,
   not reuse Node-only APIs.
4. Preserve operation-specific first-error schedules above; add crossed
   Proxy/accessor controls for every operand boundary, exact name/code/message/
   path comparisons against the frozen predecessor, returned-copy isolation,
   JSON/YAML behavior where applicable, and depth/value-limit refusals.

This is the smallest architecture currently supported by source evidence,
subject to Sol review. It does not decide whether the Engine is retained or
recreated at the host-call boundary; the implementation must first measure
resource construction behavior and keep it outside per-operation input
admission. There is no public caller-supplied resource registry for these
operations, and no new operation-result schema is required by the current
contract. Any architecture that adds either changes scope and needs separate
contract review.

## Stop and review points

Before implementation, Sol should review the operand schedules, particularly
that `resolveCoreDefault` validates state before identity and `validateCoreFieldValue`
admits its literal before source. Confirm that the proposed shared host
dispatcher can retain exact callback-thrown identity and one live Context in
both Node and WASM. The existing schema-properties packet already recorded a
Rust host-input ordering defect in the earlier tagged route; preserve that
historical receipt and build new evidence against the later interface.

After review, run no installed comparison until an archive is fixed-point and
source-pinned. The replay must use package-name imports for the installed root
and explicit `@umf/core/reference` for the predecessor, then independently
compare the frozen packets. A pass in the current package before Rust routing
is implemented is a TS-to-TS control only and must not be called Rust parity.
