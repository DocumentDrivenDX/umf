---
ddx:
  id: CONTRACT-903
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-902
      kind: informed_by
    - id: CONTRACT-901
      kind: informed_by
    - id: FEAT-900
      kind: informed_by
---

# CONTRACT-903: Frozen action-manifest profile

**Version:** proposed `umf.actions.manifest/1`; companion to CONTRACT-902, not an extension of tx/1.

## Purpose

Define complete immutable work selected at one coherent read basis, with typed invocations and mandatory identity/version guards. A sealed manifest reserves no data, action revision or authorization.

## Scope and Boundaries

One Plan, one store/epoch, up to 10000 unique targets, constant set inputs. The first carrier is one JSON Artifact at most 16 MiB of actual UTF-8 bytes. No chunking, fetchable references, partial sealing, resumable selection or cross-store execution. Manifest framing admits at most1,000,000 JSON nodes and depth64; each independently typed item/input and separately supplied original core document retains core JSON admission limits. The manifest is not a core Document: its aggregate node budget must permit the specified10,000-item carrier without relaxing any business literal or model semantics. Selection must complete inside one host-qualified read transaction; paging/cursors across transactions cannot establish this basis.

## Normative Surface

Types and unknown-content/byte rules are CONTRACT-902's. Manifest JSON is preserved byte-for-byte; member order/whitespace affect its digest but never change typed core equality. `ManifestRef` is `{protocol:"umf.actions.manifest/1",sha256:string}`; the digest names the exact full Manifest Artifact, excluding any external reference wrapper. Avoid a self-referential hash: the Manifest has no manifestSha256 member. Host control rows retain ManifestRef and original bytes together.

| Type | Exact required members | Rule |
| --- | --- | --- |
| Manifest | `protocol:"umf.actions.manifest/1", plan:Artifact, action:ResolvedAction, basis:Basis, items:Item[], batches:Batch[]` | plan is the exact JSON Plan Artifact; optional annotations only |
| ResolvedAction | `target:RevisionRef,documentSha256:string,invocation:Profile` | Executor-local revision resolved from plan.action identity/digest; immutable original source and exact invocation profile must agree |
| Basis | `profile:Profile, store:string, epoch:string, cut:string, selectionSha256:string` | cut is an opaque issued read-cut identity under the exact snapshot profile; it is not a tx/1 commit/freshness Receipt |
| Item | `ordinal:integer, entity:EntityInput, guard:Guard, inputs:object, expectedVersions:ExpectedVersion[]` | Zero-based consecutive ordinal; entity/inputs/ExpectedVersion reuse tx/1 types; inputs is the complete instantiated action input map |
| Guard | `profile:Profile, store:string, epoch:string, identity:string, version:string` | Executor-issued immutable identity, opaque whole-entity version; stores/epochs match basis; equality is exact opaque equality under a qualified guard profile |
| Batch | `ordinal:integer, start:integer, count:integer` | For N items and B=plan.execution.batchSize: number of batches=ceil(N/B), start=ordinal*B, count=min(B,N-start); N=0 means no batches. Any alternative underfilled partition refuses |

The input entity equals Item.entity under existing core Key/tuple semantics; its target equals plan.target. Other inputs equal the admitted plan constants under core semantic equality without losing original spelling. Every frame receives an expectedVersions entry exactly once, in declaration order (reads then writes), with version=guard.version. No compiler-generated version or caller assertion supplies native guard issuance.

### Materialization and sealing

A qualified materializer establishes the original actor's authorized selection read, verifies catalog/action/model/profile pins and executes the exact selection program with complete dependency enforcement under one stable coherent snapshot. It enumerates matching entities in canonical immutable identity order specified by the selected guard profile. It obtains Key, canonical identity and version from that same cut. Duplicate canonical targets, nonunique Keys, missing guard correspondence or hidden/incomplete selection refuse the whole materialization; a WHERE result is relative to the declared authorized read view, never proof of global unseen rows.

The first subset's predicate fields are required one-valued boolean/integer/string; cutoff/string/numeric values retain exact selected domain semantics. Assignment values are constants in the plan, not recomputed per target. Sealing independently verifies plan/artifact integrity, complete enumeration, identity uniqueness, exact input/frame coverage, deterministic partition and both byte/item limits. Capacity/time exhaustion produces no runnable manifest. Digest-valid client work without admitted selection/guard custody cannot be sealed.

Store the full sealed artifact durably before scheduling, with original issuer, authenticated initiating human, store/epoch, model/action/mapping pins, read-cut identity, complete selection/guard custody and exact manifest bytes. Submit MUST match that executor-retained seal and submitting human/store/epoch; an arbitrary client Artifact with recomputed hashes is not a seal. For zero items, batches MUST be empty; job completion produces no business-change commit receipt. Additional rows satisfying the predicate after sealing are excluded. Predicate truth is not re-evaluated by execution; any intervening whole-entity version change nevertheless conflicts, including an unrelated field edit or a Key moved away and back. Guard identity prevents the same logical Key being reassigned to another object. No version reset/reuse within the epoch is allowed; restore fences execution until a qualified recovery/new-epoch procedure.

### Inspection and assessment

`inspectActionManifest(artifact:Artifact, context:PlanInspectionContext): ManifestInspection` is pure and returns `{manifest:Manifest|null,source:Artifact,plan:PlanInspection,eligible:boolean,diagnostics:PlanDiagnostic[]}`. It reuses CONTRACT-902 plan inspection and core/action input validators. It validates bounds, ordinals, partition, constant/frame consistency and retained unknowns. `assessActionManifest(inspection:ManifestInspection, capabilities:PlanCapabilities, context:PlanInspectionContext): PlanAssessment` re-inspects the retained original source/context and assesses all CONTRACT-902 companion/action obligations, including snapshot and seal custody. Manifest inspection validates ResolvedAction identity/digest/profile against the portable pin; a context inspection cannot authenticate its executor revision. It cannot attest actual selection completeness, snapshot, guard issuance or current authorization; these are named executor/host admission obligations. No model content loads an interpreter.

## Precedence and Compatibility

Action invocation meaning remains CONTRACT-900/901; plan is CONTRACT-902. Basis and guard profiles require independent native evidence. Frozen work is tied to this basis; replacing store, epoch, inputs, versions, partition or any byte creates new intent and requires materialization/sealing again. A portable plan may materialize a distinct manifest on another capable backend, but native guards cannot be transplanted. No automatic migration or silent truncation.

## Error Semantics

PAP_INVALID, PAP_INTEGRITY, PAP_UNKNOWN, PAP_PROFILE, PAP_ACTION and PAP_LIMIT retain CONTRACT-902 meaning. PAP_SELECTION denotes incomplete/nonunique/native-unattested selection or incoherent cut; PAP_GUARD denotes missing/invalid identity/version custody. Materialization failure has no runnable job; opaque protected reasons are withheld. At execution, target drift is a terminal batch conflict under CONTRACT-904, never a re-materialization instruction.

## Examples

For three items and batchSize2, the sole partition is counts [2,1]; [1,2] refuses despite covering every item. A manifest containing two customers with guards v4 and v9 and batchSize=1 has items 0/1 and batches `{ordinal:0,start:0,count:1}` and `{ordinal:1,start:1,count:1}`. A third customer that later matches is excluded. Reassigning customer 0's Key to another native identity conflicts even if that replacement also has version v4. An empty matching set seals items=[] and batches=[].

### Pure constructor API — 2026-10-15

`constructActionManifest(request:ActionManifestConstruction, context:ActionPlanInspectionContext):ConstructedActionManifest`
consumes a closed request `{plan:Artifact,action:ResolvedAction,basis:Basis,rows:SelectedActionRow[]}`.
Each closed row is `{entity:EntityInput,guard:Guard,keyReceipt:CoreKeyTupleReceipt}`.
The receipt is the original `encode-core-key-tuple/3.0.0`, `umf-key-tuple-v1`
receipt including its full source, not a replacement digest or codec. The
constructor calls the original verifier against the plan's exact model,
requires receipt identity and typed tuple equality with the selected entity,
and retains each unchanged receipt in order in the result's `keyReceipts`.
These receipts prove portable tuple correspondence only, never native issuance.

The result is `{artifact:Artifact,keyReceipts:CoreKeyTupleReceipt[],sealed:false,
complete:false,authority:false}`. The Artifact contains exactly the existing
`umf.actions.manifest/1` body above; receipt sidecars do not change that protocol.
It retains the plan Artifact byte-for-byte, derives each complete invocation
input from the original entity and plan constants, derives every original
read/write frame version, and builds the sole full-first contiguous partition.
It performs original manifest inspection before returning. Failure throws a
source-qualified `UmfError`; there is no partial result or eligible prefix.

Input framing is bounded to 1,000,000 nodes, depth64 and64MiB serialized JSON;
rows are at most10,000 and may be refused earlier by these independent bounds
or original per-receipt core limits. Output remains bounded by the plan's
maxItems/maxManifestBytes and original manifest/core limits. This is not a
promise that every10,000-row full-source receipt transport fits those bounds.
Unknown request/row members refuse; relevant unknown plan/manifest meaning
continues to refuse under the original inspectors.

Rows remain in supplied order; this pure function cannot establish native
canonical identity order, completeness, snapshot/guard authenticity, current
authorization or durable custody. Truss must establish those with the original
selected-row path and independently seal the exact returned Artifact. Returning
an unsealed artifact never grants submission or execution permission.

### Explicit browser-local profile branch — 2026-10-15

CONTRACT-905 adds exact local-owner actor/policy/invocation interpretation and conditional reuse of plan-model/1, plan/1 and manifest/1 carriers. Previous human/tx1 restrictions remain mandatory whenever invocation is umf.actions.tx/1; local invocation uses its separately defined local-owner custody and bulk companion, never a fabricated human or bulk.principal. Unknown/mixed profiles refuse. Existing native producer/enrollment bytes are not relabeled or requalified. Metadata success never issues a store capability or seal.
