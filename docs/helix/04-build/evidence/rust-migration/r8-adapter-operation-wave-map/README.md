---
ddx:
  id: umf.evidence.rust-migration.r8-adapter-operation-wave-map
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-002
      kind: informed_by
    - id: CONTRACT-003
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-json-schema-operations
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-protobuf-inspect-bindings
      kind: informed_by
---

# R8 adapter operation wave map

## Scope and recommendation

This read-only map ranks candidate executable-export families for the next R8
default-root retirement wave. The leading candidate is a **17-operation native
schema-adapter wave**: eight JSON Schema operations and nine Protobuf
descriptor/source operations. It has the highest immediately countable default
root impact among the scoped families reviewed: 17 distinct logical exports,
or 34 Node/browser route declarations. Current source maps all 17 operations
to the TypeScript default. The R8 inventory still counts each logical export
as an unresolved retirement gap; no Rust owner or opt-in receipt alone closes
that gap.

This is an implementation-wave recommendation, not a claim that the two native
standards share semantics. JSON Schema stays governed by CONTRACT-002 and
Protobuf by CONTRACT-003. Each operation keeps its exact native boundary,
profile, diagnostics, unknown-content policy, and independent predecessor or
native oracle. This cohort excludes Key tuple operations, all six kind and
nullability operations, semantic-reference operations, adapter registries,
constants, and unported callback editing APIs.

## Ranked candidates

| Rank | Candidate | Export scope | Default-root impact | Readiness and reason |
| --- | --- | --- | --- | --- |
| 1 | JSON Schema + Protobuf adapter operations | 17 named operations listed below | 17 unique names × 2 default roots; all currently TypeScript-routed | Recommended for an R8 migration wave. Rust owners and operation-level evidence exist across the family. Host evidence is uneven, so the wave must be split into gated JSON Schema, descriptor/document, and compiler-callback subcohorts. |
| 2 | JSON Schema adapter operations alone | Seven operations in the frozen façade plus `editJsonSchemaNode` | 8 unique names × 2 roots | Strongest binding readiness: source-bound Node/Bun and Chromium packets cover inspect, tree access/walk, and bounded edit behavior. The Rust operation façade still lacks one complete integrated installed-package receipt for all eight exports. It falls below the requested 10–30-export wave size. |
| 3 | Protobuf descriptor/document/source operations alone | Nine named operations | 9 unique names × 2 roots | Rust owners exist, but evidence is split across a Node/WASM inspector, Python-only descriptor codec, Rust-core document operations, and callback-oriented source operations. It falls below the requested wave size and has the largest host/control integration gap. |

The 17-operation candidate combines the two subcohorts because both are native
schema adapter surfaces already exposed through the same package roots. It does
not combine their Rust dispatch, resource policy, completeness claims, or
semantic oracles. A staged execution should qualify JSON Schema independently
before broadening to Protobuf, then separately qualify the Protobuf descriptor
path and source compiler capability.

## Exact operation set and current evidence

| Adapter | Public exports | Rust owner/evidence already present | Remaining host and default-route gap |
| --- | --- | --- | --- |
| JSON Schema | `importJsonSchema`, `inspectJsonSchema`, `exportJsonSchema`, `exportJsonSchemaResources`, `exportJsonSchemaBundle`, `getJsonSchemaNode`, `walkJsonSchema`, `editJsonSchemaNode` | CONTRACT-002 Rust façade and inspection operations; frozen seven-operation predecessor; installed Node/Bun and Chromium 30-case inspection replay for the restricted validator profile; installed Node/Bun and Chromium 22-case tree-operation replay; a separate bounded edit receipt | These are opt-in receipts. The complete public-root set has no one current-source package receipt covering all eight exports, resource construction and controls together. `editJsonSchemaNode` remains profile-limited; full Draft 2020-12/Ajv equivalence, registry callbacks, resource/reference closure, and exact complete host refusal/copy behavior must remain explicit. Default Node/browser roots and packed package selection still route through TypeScript. |
| Protobuf | `importProtobufDescriptorSet`, `getProtobufDescriptorSet`, `exportProtobufDescriptorSet`, `exportProtobufBundle`, `inspectProtobuf`, `readDescriptorSet`, `writeDescriptorSet`, `importProtobufSources`, `exportProtobufSources` | CONTRACT-003 Rust descriptor codec, document import/get/export/bundle, inspector, and source prepare/finish owners; 93-operation descriptor predecessor/native packet; 41-case inspector predecessor; Node/Bun and Chromium inspector route; real `protoc 36.2` callback comparison for descriptor documents | Descriptor `read`/`write` opt-in binding evidence is CPython 3.11 Darwin arm64 only. Document import/get/export/bundle remain Rust-core-only. The inspector binding covers one operation and stays `complete:false` with `PROTOBUF_COMPILER_REQUIRED`. Source operations require an explicit trusted host compiler; source compilation remains a callback boundary, Edition 2024 is unsupported, and no Node/browser source-route evidence exists. Default Node/browser roots remain TypeScript. |

The export list deliberately omits `proposeProtobufDescriptorEdit`: it has no
Rust owner. It also omits `jsonSchemaRegistry` and `protobufRegistry`, whose
caller-supplied callback semantics are not equivalent to the bounded
operation façades; and omits package objects/constants, which need separate
data/authority disposition rather than executable Rust routing.

## Routing gaps

The source package's `.` condition resolves separate Node and browser bundles;
the explicit `./reference` condition remains TypeScript. The current R8
symbol inventory reports 29 source-selected Rust exports per default root, but
none of these adapter operations is among those routes. The ledger's `bindingRoutesProven`
count is zero for its captured cohort, and all 17 selected names remain
retirement gaps until exact current-source package routing and review close.

The wave therefore needs an operation-by-operation routing table that binds:

1. each root export to one stable Rust operation identifier and the correct
   Node or WASM host wrapper;
2. each operation to its evidence packet, exact predecessor/native vectors,
   Rust owner/test source hashes, and runtime artifact hashes;
3. each resource or callback argument to its owner and its control/accounting
   boundary; and
4. each default route to an installed package artifact, while retaining
   `./reference` as the explicit TypeScript route.

Do not use source export-count changes as retirement evidence. Recapture the
condition-aware inventory and gap ledger after route edits; test the built
package's Node and browser conditions, and keep previous cohort receipts
qualified only for their captured source and artifacts.

## Exact control and parity gaps

For JSON Schema, reuse the frozen source packet without rewriting it. Add a
complete envelope replay that composes import/inspect/export/resources/bundle,
copied get/walk, and the qualified edit subset. Pin admission order for invalid
base/resource URI, duplicate resource IDs, extension payloads, unresolved and
colliding references, malformed native JSON, unsafe integer/negative-zero
lexemes, and unknown tagged representation fields. Compare diagnostic code,
message, path, and order; exact exported number lexemes; resource order; and
copy isolation. Add Node/Bun and fresh Chromium controls for maxWork, meter
failure before and inside the Rust hook, cancellation/deadline, zero-touch
resource/accessor refusal, UTF-16/lone-surrogate paths, and prototype-like
`__proto__` keys. Preserve the bounded validator/edit profile; do not silently
claim general Draft 2020-12 or callback registry parity.

For Protobuf, compose descriptor read/write, import/get/export/bundle and inspect
over one source-frozen packet while keeping CONTRACT-003 corrections distinct
from predecessor defects. Include the 4 MB bound, unknown wire fields and exact
raw bytes, malformed eleven-byte varints, overlong known/unknown varints,
presence/ordering, missing or duplicate files, incomplete compiler warning,
source archive preservation, and exact compiler callback identity/results.
Controls must pin malformed binary and descriptor-tree precedence, copy
isolation, size/work meter, cancellation/deadline, and callback exception
provenance. Node/Bun and real Chromium installed-package receipts are missing
for the descriptor codec/document and source operations. Browser source
compilation is not assumed: the callback must be a supported explicit host
capability or those exports stay on TypeScript in that route.

For both adapters, measure the host envelope's resource snapshot, request
admission, Rust operation, response admission, and encoding under the same
documented per-call control model. Prove callback/meter order and that no
source-owned callback or accessor is invoked before its predecessor-equivalent
refusal point. Test the actual package root, not only a helper factory, fake
WASM object, or reduced wire harness. Freeze Node/Bun and browser artifacts from
one integrated source cohort before claiming route parity.

## Selection limits

This map does not select a wave for implementation, change package routing,
reclassify inventory rows, or mark any export retired. The selected wave remains
subject to operation-level Sol review, exact host parity, current package
artifact replay, and the R8 retirement disposition. The R8 inventory and ledger
are intentionally unchanged by this proposal.
