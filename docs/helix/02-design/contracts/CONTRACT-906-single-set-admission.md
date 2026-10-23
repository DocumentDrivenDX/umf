---
ddx:
  id: CONTRACT-906
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-900
      kind: informed_by
    - id: FEAT-033
      kind: informed_by
    - id: CONTRACT-049
      kind: references
    - id: CONTRACT-079
      kind: references
    - id: CONTRACT-900
      kind: references
    - id: CONTRACT-902
      kind: references
    - id: ADR-006
      kind: references
---

# CONTRACT-906: Source-bound single-SET admission

**Type:** pure shared library and language binding.
**Version:** `umf.actions.single-set-prepared/1`, `umf.actions.single-set-invocation/1`,
`umf.actions.single-record-values/1`, and `umf.actions.generated-invocation/1`
over core 0.10.0 and `umf.actions` 0.1.0.

## Purpose

Expose canonical source, action, value and Key admission to a consumer without
requiring that consumer to interpret recipes or implement a literal or Key codec.
A complete admitted result is inert semantic input to a host-owned executor.

## Scope and Boundaries

One current0.10.0 document, one module, one Record, one stable Key with one required cardinality-one STRING Field; one required constrained cardinality-one STRING value Field. One declared umf.actions0.1.0 action, graph-write/1, exactly one SET effect; one required entity parameter and one required STRING value parameter bound to its exact destination Field. No pre/postconditions/outputs/failures; reads empty; one write frame, maxEntities1, exact entity selector under umf.actions.keys/1, no create/delete/relationships, fields exactly the assignment Field. Key immutable. Constraints supported: existing STRING allowedValues and Unicode-scalar length min/max. No trim, case/Unicode normalization, coercion, default insertion, omission or null.

Mandatory attribution person-required, atomicity single-store, idempotency caller-key-optional and result declarations are retained as host obligations. The pure engine does not prove native atomicity, actor identity, existence, grant freshness, replay or commit.

Explicit unsupported inventory: additional modules/Records, composite/multiple Keys; boolean/integer/decimal/binary/UUID/temporal/list/structured values; optional/nullable parameters/Fields; additional frames/effects; literal assignments; graph-write/2; create/delete/link/unlink; handlers/rules/conditions; arbitrary selection; full plan/manifest/bulk; cross-module/native effects. Wider TS support remains valid but outside this first installed binding. Unknown relevant meaning refuses; unrelated unknown material is retained, never interpreted by omission.

The host owns authenticated person identity, current policy, registration custody,
record existence, uniqueness, transactionality, replay, effects and commit.
UMF MUST NOT perform those operations or report them verified. The bridge MUST
return no partial result on refusal.

## Normative Surface

The public Python module is `umf.action_runtime`. `create_action_engine` returns
`umf.rust_codegen.CodegenEngine`; the other functions take that explicit engine
and one plain JSON request and return a plain JSON result. Rust owns all semantic
operations. Python owns package-resource I/O, host carrier admission and dispatch.

### Reused types and source custody

`Profile` is the closed object `{id:string,version:string}`. `Artifact` is the
closed object `{mediaType:'application/json',utf8:string,sha256:string}`.
`ModelPin` is `{documentId:string,revision:string,umfVersion:'0.10.0',sha256:string}`.
`ActionPin` is `{identity:{module:string,action:string},documentSha256:string,
invocation:{id:'umf.actions.tx',version:'1'}}`. `FieldRef` is the exact closed
`{module:string,element:string}` identity; `KeyRef` adds `key:string`.
SHA256 values are 64 lowercase hexadecimal characters. Identity strings are
nonempty, compare exactly without Unicode/case/name normalization, and have at
most 256 UTF-16 code units. Duplicate JSON source members and invalid Unicode
MUST refuse. Native literals retain CONTRACT-049 carriers unchanged.

Artifact SHA256 MUST cover the actual UTF-8 source bytes. The original full
source, including unrelated unknown content, MUST be retained. Source, model
and action digest pins MUST agree with the actual bytes. Generated schema
identity MUST match that same source digest. Parsing and validation MUST use
the explicitly trusted current resources. No input may install callbacks,
load plugins, fetch artifacts or select credentials.

`ModelPin.revision` is an opaque source-publisher identity, never a provider
revision or an ordered version. A token `sha256:` followed by the source digest
is permitted. No registration replacement or upgrade semantics are inferred.

### Policy capability and obligations

The trusted host supplies `authorization` separately from the generated client
request. It MUST exactly match the original PolicyAuthorization profile and
write-frame resources and contain nonempty inert evidence locators. The engine
MUST NOT hardcode a consumer's policy interpretation, fetch evidence or treat
matching metadata as a current authorization decision. Role-based declarations
and absent/mismatched host capability configuration refuse this subset.

The original opaque authorization obligation MUST retain `unchecked` status.
Its separate supported host assessment MUST identify the exact original
obligation. No other unchecked model, value, Key, action or unknown-member
obligation may be waived. Required executor duties remain explicit and every
result MUST retain `executionVerified:false`.

### Generated input conversion

For this subset, the generated input object MUST contain exactly the selected
entity parameter and STRING value parameter. Its exact shape is
`{<entityParameter>:{<declaredKeyFieldID>:STRING},<valueParameter>:STRING}`.
The entity map MUST contain exactly the original Key Field ID. Names are taken
from original declaration identities, never display names, aliases or splitting
a qualified string. Missing/extra fields, null and non-STRING values refuse.

Rust MUST convert the entity map to `{key:KeyRef,components:[{string:STRING}]}`
in declared Key Field order and the value parameter to `{string:STRING}`.
The original required Field constraints and existing canonical Key tuple rules
MUST validate these inputs before a result is returned. The consumer performs
no literal wrapping, Key ordering, tuple encoding, coercion or normalization.

### Factory resource and native availability bounds

The official resource inventory MUST be at most 65,536 bytes; each resource at
most 4,194,304 bytes; the aggregate at most 16,777,216 bytes. Fixed inventory and
resource sizes and regular-file/package containment MUST be checked before an
unbounded read or JSON expansion. Reads MUST be bounded, actual byte hashes
MUST match the pinned inventory before JSON parsing, and missing, symlinked,
oversized or tampered resources MUST refuse without a checkout/network fallback.

Package file I/O, hashing and JSON loading are bounded factory setup outside
CodegenEngine's cooperative per-operation work/cancellation accounting. Engine
construction, the native handshake and semantic dispatch retain the existing
controlled engine boundary. No broader factory cancellation or metering claim
is inferred.

The factory MUST call native operation `singleSetCapabilities` with the exact
empty request `{}` after the official resources are supplied to the existing
native CodegenEngine. Its exact response is:

```text
{profile:'umf.actions.single-set-capabilities/1',coreVersion:'0.10.0',
 operations:['prepareSingleSetAction','admitGeneratedActionInvocation','admitGeneratedRecordValues'],
 resultProfiles:['umf.actions.single-set-prepared/1','umf.actions.single-set-invocation/1','umf.actions.single-record-values/1'],
 inputDigestProfile:'umf.actions.generated-invocation/1',executionVerified:false}
```

The factory MUST verify exact members, types, ordered values and false boolean
before exposing an engine. Missing native operations, old-native/new-wrapper
mixes and malformed/incompatible responses MUST refuse; control and cancellation
errors preserve their original provenance. This handshake establishes native
API availability, never execution, complete semantic correctness or release
qualification. Python module labels/imports alone MUST NOT advertise support.

### Closed call shapes and limits

Exact request/result object members below are allowed; unknown members on these bridge envelopes refuse. Original document/source content still follows the relevant/irrelevant preservation rules above. Existing Ref/Pin/Artifact types are reused exactly. All returned business values in this first profile are STRINGs.

Public packaged factory: `create_action_engine(*, profile='cooperative', max_work=None, meter=None, is_cancelled=None, now=None, deadline_ms=None) -> CodegenEngine`. Load fixed official wheel-carried nine CodegenEngine resources using importlib.resources, then existing Rust resource validation. Package all four extension packages plus existing core authority resources with fixed inventory/hash pins. No source-checkout fallback, Arras assets, caller path selection, network or substitute registry. Missing/tampered package resources refuse. Preserve existing cooperative/hard-isolated refusal and metering semantics. Resource construction is host glue, not semantic evaluation.

```text
prepare_single_set_action(engine, request):
 request = {source:Artifact, model:ModelPin, action:ActionPin, authorization:HostPolicy}
 HostPolicy = {profile:{id:string,version:string},resources:string[],evidence:string[]}
 result = {
  profile:'umf.actions.single-set-prepared/1',
  source:Artifact,model:ModelPin,action:ActionPin,wireAction:string,
  entityParameter:string,target:KeyRef,keyFields:FieldRef[],
  assignments:{input:string,field:FieldRef}[],
  frames:{id:string,access:'write',record:FieldRef,entityParameter:string,fields:FieldRef[]}[],
  obligations:{id:string,path:string,kind:string,status:'checked'|'unchecked'}[],
  authorization:{obligation:string,profile:{id:string,version:string},resources:string[],status:'supported',evidence:string[]},
  requiredExecutorObligations:string[],executionVerified:false
 }
```

`wireAction` MUST equal exact module ID + '.' + exact action ID using the generator's original identity rule, not display names/split inference. Reject ambiguous generated action identity using the existing generator's ambiguity rule. `obligations.id` is the same absolute original pointer identity as TS inspection (Rust obligation.path supplies it); do not create synthetic IDs. `authorization.obligation` is the exact selected opaque authorization obligation ID. Preserve every other original obligation. `requiredExecutorObligations` retains original obligation IDs for authorization, attribution, atomicity, idempotency and result in inspection order; these name host work, not supported runtime claims. Frames/assignments/Key Fields retain declaration order. First subset has one write frame/one assignment/one Key Field, but arrays remain explicit and checked.

```text
admit_generated_action_invocation(engine, request):
 request = {source:Artifact,model:ModelPin,action:ActionPin,authorization:HostPolicy,invocation:GeneratedApply|GeneratedValidate}
 GeneratedApply = {contract:'umf.access/1',schema:string,kind:'apply',action:string,inputs:object,idempotency_key:null|string}
 GeneratedValidate = {contract:'umf.access/1',schema:string,kind:'validate',action:string,inputs:object}
 result = {
  profile:'umf.actions.single-set-invocation/1',preparation:PreparedResult,
  inputs:object,
  entity:{parameter:string,key:KeyRef,fields:FieldRef[],components:CoreLiteral[],profile:'umf-key-tuple-v1',tupleHex:string},
  assignments:{input:string,field:FieldRef,literal:{string:string},native:string}[],
  inputSha256Profile:'umf.actions.generated-invocation/1',inputSha256:string,
  executionVerified:false
 }
```

`inputs` is the exact TS-style admitted CoreLiteral/entity input map; no extra entries. SHA256 input bytes are literal UTF8 `umf.actions.generated-invocation/1\n` (one newline byte) followed by canonical JSON of `{model:request.model,action:request.action,inputs:result.inputs}` using the existing canonicalizer. This domain prefix is not JSON-escaped. `idempotency_key` occurs ONLY on Apply, which requires the member; Validate MUST omit it (even null refuses). On Apply it must be null or a nonempty valid Unicode string within256 UTF16 units; it is not emitted in this pure result or included in inputSha256. Hosts may impose stricter token/identity rules but must not weaken them. No automatic retries.

```text
admit_generated_record_values(engine, request):
 request = {source:Artifact,model:ModelPin,record:FieldRef,values:object}
 result = {
  profile:'umf.actions.single-record-values/1',source:Artifact,model:ModelPin,record:FieldRef,
  values:{field:FieldRef,literal:{string:string},native:string}[],
  entity:{key:KeyRef,fields:FieldRef[],components:CoreLiteral[],profile:'umf-key-tuple-v1',tupleHex:string},
  executionVerified:false
 }
```

Bootstrap `values` input contains exactly both Field-ID primitive STRING entries. Output values follow Record member order, entity.fields follow declared Key order. No generated row schema/name aliases or unregistered provenance fields are accepted. This is logical admission; native uniqueness/import permissions remain host work.

Error policy: no success object or partial plan on any refusal. Python semantic refusals raise `UmfCodegenError`; factory and host work-control refusals may raise `UmfCoreError`. The supported public imports are `from umf.rust_codegen import UmfCodegenError, UmfCoreError`; consumers must not import private `umf._rust`. Both expose a fixed `code` and optional `path`/`pointer`. Use ACTION_RUNTIME_INVALID for malformed bridge envelopes, ACTION_RUNTIME_INTEGRITY for source/pin/schema mismatch, ACTION_RUNTIME_UNSUPPORTED for valid excluded profile/unknown relevant meaning, and existing LIMIT or RESOURCE_LIMIT for bounded capacity/work refusal. Existing core/action semantic errors may propagate with their original code/path; consumer maps them to its public INVALID/UNSUPPORTED/SCHEMA_MISMATCH categories without parsing message text. Resource, cancellation, deadline and callback failures remain distinct control refusals. Do not echo protected values/credentials in diagnostics.

Preparation/source artifacts each ≤1MiB actual UTF8; depth64; parameters/assignments≤64 and total retained request≤4MiB; this narrower profile's exact cardinalities enforce one module/Record/Key/value/effect/frame. Core stricter text/value limits still apply; no larger allowance inherited from the generated-code engine relaxes these limits. Engine charges existing Context before input-derived expansion/copy and responds to cancellation. Lower configured budgets may refuse, never truncate.

Factory tests must prove installed-only resource availability, each missing/tampered resource refusal and absence of checkout fallback. Receipt records exact wheel, native engine, source/vector/resource manifest/tool hashes and runtime cohort. Core resource loader mutation is NOT a semantic fallback. The implementation and installed artifacts require independent qualification; the existence of this contract confers no publication or execution claim.


## Ratified consumer precision amendment — 2026-10-23

- CONTRACT906 is the proposed governing home (unused identifier confirmed by coordinator) for pure current0.10.0 single-SET bridge profiles and exact API/shapes. Owner will author from installed HELIX template and Sol will review. Keep historical CONTRACT902/plan-model1 artifacts strict; record its stale core0.8.0 discrepancy without claiming plan1 delivery. Candidate implementation is authorized in the isolated checkout; acceptance/publication claims still require actual qualification and governance review.
- ModelPin.revision is a nonempty opaque SOURCE-PUBLISHER pin, at most256 UTF16 units. It is neither semantic version nor provider-issued opaque RevisionRef, grants no ordering and is not native action registration authority. The first consumer may use `'sha256:' + sourceSHA`; source replacement is unsupported in this first profile. Do not infer upgrade or migration semantics from this token.
- Genuine generated Validate and Apply must both be frozen in vectors. Validate exactly omits idempotency_key; adding it, including null, refuses. Apply requires it. Same model/action/inputs yield the same logical inputSha256 across these two operations; neither causes native effects inside UMF. Validate remains advisory in Arras and cannot stand in for current authorization/existence checks at Apply.
- Fixture IDs are authored underscores: module catalog; Record item; Key Field item_id; scalar label; action set_label; entity parameter item; value parameter label_value; write frame write_item. No aliasing or sanitization. The generated action identity is exact catalog.set_label.

## Precedence and Compatibility

CONTRACT-049 owns literal/Field meaning; CONTRACT-900 owns authored actions;
CONTRACT-079 owns the unchanged generated transport. This contract adds one
bounded bridge and MUST NOT widen those meanings or alter their envelopes.

Existing `umf.actions.plan-model/1` remains the strict CONTRACT-902 branch.
Its current documented core 0.8.0 pin and implementation current-core mismatch
are not resolved by relabeling a previous artifact. This separately versioned
core 0.10.0 bridge does not claim plan/manifest/bulk delivery. Opaque policy
assessment here MUST NOT fabricate checked obligations or the historical
plan-model producer/schema identity. CONTRACT-903/904 native guards, sealing,
authority, batching and durability remain separate.

Unknown bridge members and versions refuse. Unknown relevant source meaning
blocks admission; unrelated unknown source content survives. Source spelling
and arrays retain order. Normalization, defaults and schema downgrades MUST NOT
be introduced. Future broader scalar/effect/profile support requires explicit
contract, artifact and vector qualification.

## Error Semantics

| Condition | Outcome | Retry or recovery |
| --- | --- | --- |
| Malformed closed bridge or generated request | `ACTION_RUNTIME_INVALID` | Correct the input; no partial semantic result |
| Original bytes, source/action pin or wire schema mismatch | `ACTION_RUNTIME_INTEGRITY` | Rebind the original source; no fallback |
| Excluded profile, role binding or relevant unknown meaning | `ACTION_RUNTIME_UNSUPPORTED` | Use a separately qualified profile |
| Literal/model/action failure | Original core/action code and path | Correct the declaration/value without coercion |
| Finite work, text or capacity limit | Original bounded-resource refusal | A larger authorized budget may be supplied; never truncate |
| Host cancellation or callback failure | Existing controlled engine error | Preserve cancellation/provenance; no successful empty result |

Errors MUST NOT echo protected values or credentials. Pure admission never
acknowledges a write. The host preserves CONTRACT-079 write uncertainty after
dispatch and MUST NOT retry a write automatically.

## Examples

The exact original neutral fixture and vectors live under
`fixtures/actions-binding/`. A host uses `create_action_engine()`, supplies the
original source and its source-publisher pins to `prepare_single_set_action`,
then passes the unchanged generated `catalog.set_label` apply or validate
request to `admit_generated_action_invocation`. Bootstrap uses
`admit_generated_record_values` and the host's real administrative import path.
The admitted STRING/native assignments map mechanically to backend SET inputs;
no recipe or Key decoding is required in the consumer.

## Non-Normative Notes

[The bounded delivery plan](../../04-build/single-set-binding-plan.md) records
implementation ownership, source/installed verification and candidate artifacts.
Portable semantic admission does not establish native execution or publication.
