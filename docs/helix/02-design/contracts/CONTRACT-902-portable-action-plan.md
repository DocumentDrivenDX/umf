---
ddx:
  id: CONTRACT-902
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-900
      kind: informed_by
    - id: umf.prd
      kind: informed_by
    - id: CONTRACT-900
      kind: informed_by
    - id: CONTRACT-901
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
---

# CONTRACT-902: Portable action-plan profile

**Version:** proposed `umf.actions.plan/1`, core 0.8.0 and `umf.actions` 0.1.0.
**Status:** draft normative contract; scoped portable implementation evidence is retained under `docs/helix/04-build/evidence/bulk-update/`; no native execution or release qualification.

## Purpose

Define a portable, inert plan for materializing typed invocations of an existing UMF action. CONTRACT-900 owns declaration meaning and CONTRACT-901 owns each invocation. This companion profile introduces no new core concept, action vocabulary, evaluator, store selection authority or executable code.

## Scope and Boundaries

The first executable subset is one local Record, one declared Key and one registered explicit-key `graph-write/1` set action. Single-store frozen selection and constant assignments only. SQL selection belongs to the exact separately registered Weft selection profile. Hosts supply original pinned artifacts and qualified interpreters; documents cannot fetch, load plugins or supply credentials. Plans are transferable between capable backends; materialized manifests are bound to their originating store/epoch and cannot be moved by rewriting pins.

## Normative Surface

All objects retain unknown members. Known malformed members are invalid; unknown members anywhere except `annotations` are relevant unchecked meaning and block executable assessment. `annotations` is an optional opaque object, retained but never consulted for execution/authorization. Duplicate JSON members, invalid Unicode/unpaired surrogates and nonfinite JSON numbers MUST refuse. Strings compare exactly without normalization. IDs are nonempty, at most 256 UTF-16 code units; sha256 is 64 lowercase hexadecimal characters. Numeric business values use existing CoreLiteral carriers, never new JSON-number codecs.

| Type | Exact required members | Meaning |
| --- | --- | --- |
| Profile | `id:string, version:string` | Exact identity, no ranges or fallback |
| Artifact | `mediaType:string, utf8:string, sha256:string` | Digest of actual UTF-8 bytes of utf8; source spelling retained; supplied artifacts only |
| ModelPin | `documentId:string, revision:string, umfVersion:"0.8.0", sha256:string` | Original full document bytes, including unknown content; revision is source-owner identity |
| Plan | `protocol:"umf.actions.plan/1", model:ModelPin, source:Artifact, selection:Selection, action:ActionPin, target:KeyRef, inputs:InputTemplate, execution:ExecutionPolicy, limits:Limits` | All members required; optional annotations only |
| Selection | `profile:Profile, artifact:Artifact, dependencies:FieldRef[]` | Inert typed selection program; dependencies unique and complete; each belongs to target Record |
| ActionPin | `identity:{module:string,action:string}, documentSha256:string, invocation:Profile` | Portable logical identity plus complete declaration-document digest; no executor-assigned revision; invocation is `{id:"umf.actions.tx",version:"1"}` |
| InputTemplate | `entityParameter:string, assignments:BoundAssignment[]` | Existing required entity input for target; every value input is bound exactly once |
| BoundAssignment | `input:string, field:FieldRef, value:CoreLiteral` | Resolved constant/typed parameter value; exact destination Field identity as CONTRACT-900 requires |
| ExecutionPolicy | `selection:"frozen", atomicity:"batch", conflict:"stop", partition:"manifest-order", batchSize:integer` | Required literal choices; batchSize 1–100 |
| Limits | `maxItems:integer, maxManifestBytes:integer` | maxItems 1–10000; maxManifestBytes 1–16777216; lower host limits may refuse, never truncate |

KeyRef, FieldRef and CoreLiteral are reused unchanged from CONTRACT-900/core; local refs are qualified by Plan.model, not inferred from names. One model document and action in that document are required. The action snapshot digest MUST equal model.sha256 in this subset. Materialization resolves this identity/document digest to an executor-assigned immutable revision using the trusted registry; that local RevisionRef belongs in the manifest, not the portable plan. A hash or prepared inspection artifact alone cannot register or authorize an action.

### Portable processing bounds

Plan/source/selection artifacts are each at most 1 MiB of actual UTF-8 bytes, no more than two supplied original document/snapshot artifacts (each at most 1 MiB) and 4 MiB total retained plan-inspection input. JSON nesting depth is at most64, action assignments/parameters at most64, and selection profile owns its stricter AST bounds. Reject duplicates and enforce byte/text/array bounds before expansion/copy. Existing stricter core/action limits still apply. Diagnostic messages are at most1024 UTF-16 units and at most128 diagnostics; overflow reports PAP_LIMIT without silently returning eligible. Manifest inspection uses CONTRACT-903's16MiB artifact limit with at most2MiB separately supplied original owner artifacts. These are finite input/retention ceilings, not total process heap/CPU claims.

### Executable admission

The selected action MUST have exactly one required entity parameter using target, required scalar boolean/integer/string value parameters, one set effect on that entity with parameter-bound assignments, no other effects, no outputs and empty preconditions/postconditions/failures. Plan assignments retain compiler source order; the preparation retains effect order. Match the complete binding set by exact unique input/Field identity, without changing registered action effect order. Each plan assignment MUST match that effect's Field and input; no added or omitted input/effect is allowed. All target Key fields are immutable; every SET Field is a required, one-valued boolean/integer/string Field in this first subset. Optional inputs, explicit null assignments, decimal/binary/float/temporal/list/structured values, handlers and named business actions refuse this executable subset, while remaining valid broader action declarations may be preserved. Future subsets require a new profile, not coercion.

Every action frame MUST select the same entity input under `umf.actions.keys/1`, maxEntities=1, create/delete=false and relationships empty. Write frames permit exactly the SET Fields in union; read frames permit only target Record Fields. Complete frame/role/attribution/result/idempotency obligations of CONTRACT-900 remain enforced. At least one write frame is required. Materialization produces expected-version assertions for every read/write frame selecting this target; executor versions MUST identify the whole entity state, not just the assigned fields. The separate selection read has its own current authorization and complete dependency obligations; action permission cannot grant WHERE reads.

### Proposed portable library boundary

`inspectActionPlan(artifact:Artifact, context:PlanInspectionContext): PlanInspection`, `assessActionPlan(inspection:PlanInspection, capabilities:PlanCapabilities, context:PlanInspectionContext): PlanAssessment` and `prepareActionPlanModel(model:ModelPin, action:ActionPin, context:PlanInspectionContext): Artifact` are pure. PlanInspectionContext is explicitly supplied trusted host configuration `{registry:Registry,models:{pin:ModelPin,artifact:Artifact}[],actions:{pin:ActionPin,artifact:Artifact}[],selections:SelectionInspector[]}`. Registry is the existing UMF semantic Registry; preserve all installed callbacks and use the existing inspectActions/assessAction APIs. SelectionInspector is `{profile:Profile,inspect:(artifact:Artifact,model:Document,target:KeyRef)=>{eligible:boolean,dependencies:FieldRef[],diagnostics:PlanDiagnostic[]}}`, trusted pure code installed by the host, never loaded by a document. Exact selection interpretation checks shape, domain/operator, references and complete dependencies; missing interpreters yield PAP_PROFILE. Registration records associate portable action identity/digest with original bytes; inspection checks supplied consistency, never authenticates actual native executor registration. No default registry, implicit sidecar or caller-asserted executor authority is permitted.

PlanInspection is `{plan:Plan|null,source:Artifact,eligible:boolean,diagnostics:PlanDiagnostic[]}`. PlanAssessment is `{compatible:boolean,executionVerified:false,obligations:{id:string,status:"supported"|"unsupported"|"unknown",evidence:string[]}[],diagnostics:PlanDiagnostic[]}`. Assessment re-inspects original source with the supplied context and rejects a modified inspection/source mismatch; it does not trust a caller-set eligible flag. PlanDiagnostic is `{code:string,path:string,message:string}`. Copy data outputs and original artifacts; executable registry callbacks stay in host context and are not serialized.

PlanCapabilities is `{plan:Capability,selection:Capability,manifest:Capability,bulk:Capability,guard:Capability,snapshot:Capability,action:ActionExecutorProfile}`. Capability is `{profile:Profile,claims:{id:string,status:"supported"|"unsupported"|"unknown",evidence:string[]}[]}`. Stable companion obligation IDs are `plan.integrity`, `plan.actionBinding`, `selection.interpretation`, `selection.completeRead`, `manifest.partition`, `manifest.sealCustody`, `guard.identityVersion`, `snapshot.coherentCut`, `bulk.atomicBatch`, `bulk.replay`, `bulk.principal`, `bulk.recovery`, `bulk.cancel`, `bulk.retention`. Each has one claim in its matching prefix capability (snapshot is basis support); missing/duplicate/unknown claim or mismatched profile is incompatible. supported requires nonempty evidence references but does not authenticate them. Existing action obligation IDs/assessment remain owned by CONTRACT-900 and ActionExecutorProfile. The bulk principal companion claim covers trusted delegated human context; it does not change action attribution.

The owner-produced preparation artifact uses protocol `umf.actions.plan-model/1` with `{protocol,model:ModelPin,action:ActionPin,entityParameter:string,target:KeyRef,assignments:{input:string,field:FieldRef}[],frames:string[],producer:{id:"umf.actions.plan-model",version:"1",build:string},schema:{id:"urn:umf:actions:plan-model:1",sha256:string},obligations:{id:string,status:"checked"}[]}`. It is produced only after original actions/core/selection-independent declaration inspection establishes this first subset. Field bindings, assignments (effect order) and frames (reads then writes) are exact inspected source identities; no warning about relevant unknown meaning may be omitted. preparation refuses ineligible declarations. Host registration supplies the original preparation Artifact and its original model/action input bytes, exact producer/build/schema pins and complete original inspected action/model obligation IDs. Every relevant obligation must be checked; omitted, duplicate, unknown or falsely marked obligations refuse at owner preparation/host installation. Foreign consumers cannot authenticate the producer from artifact labels; installation of the actual original owner output is a separate trusted host responsibility. Foreign consumers check byte/digest/identity correspondence and match SQL destinations to these bindings; they do not reimplement arbitrary UMF action interpretation. This artifact is semantic build input, never authority, schema registration or native qualification. Weft US-008 owns consuming it in Rust without a JavaScript runtime; UMF US-902 owns its generation, schema and language-neutral positive/negative corpus. The original core Field/schema/corpus still governs literal admission; execution reuses the original full declaration and current registry.

Use the existing action inspection/assessment and core Field/Key validators for action semantics. Plan construction MUST NOT silently insert defaults, normalize values or strip unknown content. Inspection performs no business-state lookup and provides no receipt/reservation.

## Precedence and Compatibility

Core literal/Key semantics and CONTRACT-900/901 take precedence. This profile does not widen tx/1 selectors or provide batch execution. Unknown versions refuse executable admission. Preserve original bytes for integrity; semantic equality is delegated to existing core/action owners. Different plan bytes produce a different integrity pin even when semantics are equivalent; retries compare the original retained intent, not recompiled text. Limits are maxima, not throughput promises.

## Error Semantics

Codes: PAP_INVALID (known malformed shape/reference/duplicate member), PAP_INTEGRITY (actual bytes/digest mismatch), PAP_UNKNOWN (relevant uninterpreted content), PAP_PROFILE (missing/mismatched capability or version), PAP_ACTION (unsupported/mismatched declaration), PAP_LIMIT (finite bound exceeded). Inspection may return multiple diagnostics in document traversal order; execution MUST refuse if any required obligation is unchecked or unsupported. Diagnostics reveal no protected state and do not authorize a new attempt after uncertainty.

## Examples

For `UPDATE Customer SET active = false WHERE last_seen < :cutoff`, a selected registered set-active action supplies the entity/value input identities. Compilation binds the active input to existing `{boolean:false}`; selection retains cutoff under the selected Field's CoreLiteral. The action is already registered independently of compilation. CONTRACT-006 in Weft specifies source and selection encodings. The manifest is materialized later under CONTRACT-903; the compiler produces no target identities or execution receipt.

### Explicit browser-local profile branch — 2026-10-15

CONTRACT-905 adds exact local-owner actor/policy/invocation interpretation and conditional reuse of plan-model/1, plan/1 and manifest/1 carriers. Previous human/tx1 restrictions remain mandatory whenever invocation is umf.actions.tx/1; local invocation uses its separately defined local-owner custody and bulk companion, never a fabricated human or bulk.principal. Unknown/mixed profiles refuse. Existing native producer/enrollment bytes are not relabeled or requalified. Metadata success never issues a store capability or seal.
