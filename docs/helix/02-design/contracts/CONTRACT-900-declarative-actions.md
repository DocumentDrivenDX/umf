---
ddx:
  id: CONTRACT-900
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-008
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-005
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: CONTRACT-041
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
---

# CONTRACT-900: Declarative actions

**Type:** extension schema/library and executor obligations.
**Version:** proposed `umf.actions` 0.1.0 over core 0.8.0.
**Status:** draft; package and public APIs are implemented experimentally.
The [historical certificate](../../04-build/evidence/actions-certification.md)
records completed qualification for its exact sources and bounded PostgreSQL
reference consumer. Integrated-source qualification and production/downstream
executor support remain separate; see the
[documentation delivery record](../../04-build/evidence/actions-documentation-execution.md).

## Purpose

Specify discoverable authored mutation contracts independently of a transport,
store or domain-driven design (DDD) vocabulary. UMF validates declarations and
reports interpretation/capability limits. A separately qualified executor owns
invocation, state evaluation, authorization and commit under NFR-50.

## Scope and Boundaries

The extension attaches only to a module as `{actions: Action[]}`. Exact vocabulary
registration is required. Each Action is identified by `(module.id, action.id)`;
IDs are unique within the module and distinct from element/relationship IDs.
Names are presentation, not identity. An empty list declares no actions.
References resolve only within the supplied core 0.8.0 document. Core versions,
external references and native action imports outside this subset refuse public
authoring/assessment while generic envelope preservation remains available.

No schema/profile may load executable code, fetch a URI, select credentials or
choose a physical store. A store boundary is an invocation obligation, not a
binding or authority claim. This contract defines no wire invocation endpoint,
receipt encoding, authentication protocol or executor implementation.

## Normative Surface

All strings below are nonempty unless explicitly stated. IDs compare exactly,
without case/Unicode/name normalization. Unknown members MUST be retained and
reported as unchecked; unknown semantics cannot be ignored in assessment.

### Action declaration

| Member | Shape | Required | Rule |
| --- | --- | --- | --- |
| `id`, `name`, `description` | strings | yes | Stable module-local ID and presentation; name unique among local actions. |
| `parameters` | Parameter[] | yes | Unique parameter IDs; empty is allowed. |
| `preconditions` | Condition[] | yes | Unique condition IDs; empty explicitly means no declared conditions. |
| `postconditions` | Condition[] | yes | Rules over the candidate post-state and retained pre-state; empty explicitly declares none. |
| `reads`, `writes` | FrameEntry[] | yes | Complete bounded state-read dependencies and permitted business changes, not mandatory changes. |
| `binding` | RecipeBinding or HandlerBinding | yes | Exactly one implementation choice; never code loaded by UMF. |
| `outputs` | Parameter[] | yes | Typed committed business outputs; separate from executor receipts. |
| `failures` | `{code,message,retryable:boolean}[]` | yes | Action-scoped stable business failure identities; unique codes. |
| `authorization` | RoleAuthorization or PolicyAuthorization | yes | Explicit discriminated binding; missing policy is invalid, never allow-all. |
| `attribution` | `{subject:"person-required"|"actor-profile",profile?:{id,version}}` | yes | First graph profile requires a person and separately authenticated service; actor-profile requires exact kind/identity semantics and independent qualification. |
| `atomicity` | `"single-store"` | yes | One store, including handlers and durable replay record; cross-store effects refuse. |
| `idempotency` | `"caller-key-optional"` | yes | A supplied key requires durable replay/conflict semantics below; no key makes no replay guarantee. |
| `result` | `{identities:"created-and-changed",version:"store-opaque",receipt:"read-at-least"}` | yes | Executor obligations below; no universal revision ordering is inferred. |
| `dddOperation` | `{module,element,operation}` | no | Exact DDD service element and operation name; explicit association only. |

Action, input/output parameter, condition, failure, frame and recipe-effect identity
namespaces are independent. Frame IDs MUST be unique across the combined reads
and writes lists, including duplicates within either list. A reference resolves
exactly one entry; unknown or duplicate frame IDs are declaration errors, never
first/last-match lookup. Pre/postcondition IDs must be distinct across both lists.
Condition failure codes and messages must match an entry in `failures`.
`retryable:true` permits a new authorized business attempt with a fresh token
after state changes; it never permits reevaluation under a retained terminal
token or automatic retry after an indeterminate result.
Member arrays are not sets except where distinctness is stated. Missing and
explicit null differ; null is invalid unless the selected Field permits it.
No declaration validation inserts defaults or rewrites supplied literals.

### Authorization bindings

RoleAuthorization is `{kind:"roles",profile:{id,version},roles:string[]}`;
roles are nonempty/distinct, at most 64, and profile-owned identifiers.
PolicyAuthorization is `{kind:"policy",profile:{id,version},resources:string[]}`;
resources are exact frame IDs, distinct, at most 128, and may be empty for a
profile explicitly governing action-level requests. Trusted principal/service/
context types, resource interpretation and decision semantics belong to the
exact policy profile. Metadata cannot supply credentials, impersonate a subject,
load policy code or authorize its own context. Unknown policy configuration
survives but blocks qualification. Authorization details use the same relevant-
unknown and exact evidence rules as other obligations. `actor-profile` requires
its profile member; `person-required` forbids an unrelated actor profile member.
The first transactional profile still requires human attribution. Policy binding
describability is distinct from native commit-time authorization qualification.

### Parameters, references and values

A local RecordRef is `{module:string,element:string}` targeting a core Record.
A FieldRef has the same shape targeting a Field. A KeyRef is
`{module:string,element:string,key:string}` targeting that Record's stable Key ID.
A RelationshipRef is `{module:string,relationship:string}` targeting the exact
local relationship assertion. Unknown reference annotations survive but are
unchecked; external `document` members are unsupported, never silently local.

Parameter is exactly one of these known shapes, with unknown members preserved:

- `{id,kind:"value",field:FieldRef,required:boolean}`: a value admitted under
  CONTRACT-049. The initial evaluated subset is scalar one-valued boolean,
  integer, fixed-scale decimal, string and binary. Other Field shapes/types
  remain describable but yield unchecked obligations and block assessment.
- `{id,kind:"entity",target:KeyRef,required:true}`: an existing entity by the
  exact selected Key. Key components retain declaration order and use the
  current CONTRACT-040 tuple/equality rules; this introduces no new key codec.
  Composite keys are allowed in declarations, not implicitly supported by stores.
  Input entities must exist in the pre-state; entity outputs must exist in the
  committed candidate post-state and may identify newly created entities. Output
  values obey the same Field admission rules. Optional absent outputs differ
  from explicit null. Recipe graph-write/1 requires `outputs:[]`; changed-identity
  receipts are executor metadata. Typed business outputs require a qualified
  handler binding; no implicit recipe output expression is invented.

A ValueBinding is `{parameter:string}` or `{literal:CoreLiteral}` with exactly
one discriminator. Parameter bindings MUST refer to value parameters whose
Field identity equals the destination Field identity in 0.1.0. This deliberately
refuses same-shaped but differently constrained Fields; a later version may
specify compatibility. Literal bindings use CONTRACT-049 admission; unsupported
value domains are unchecked rather than numerically coerced. Optional parameters
MUST NOT bind an unconditional effect: optional execution branches are excluded from recipes; handler branching is
qualified independently against the contract.

An EntityBinding is `{parameter:string}` naming an entity parameter or
`{created:string}` naming an earlier create effect. Exactly one discriminator
is allowed. Parameter targets determine the Record/Key; created targets use the
create's Record and Key. There is no name lookup or free-form instance selector.

### Preconditions, postconditions and frames

Condition is `{id,rule:{language,version,expression,references:RuleReference[]},
failure:{code,message}}`. `message` is nonempty explanatory text; `code` is a
stable action-scoped failure token. Codes MUST be unique among conditions.
`expression` is nonempty opaque text. Language/version are exact, never inferred.
RuleReference is `{parameter:string}` or `{output:string}` or `{record:RecordRef}` or
`{relationship:RelationshipRef}`. References are dependencies, not AST parsing.
The exact language profile MUST define expression/reference binding, value/null
comparison, state reads and deterministic failure semantics. The separate CONTRACT-901 rules/1 interpreter supplies bounded static checking
and explicit consumer evaluation; metadata inspection never evaluates state or
loads code. No general UMF constraint language is implied. An opaque rule is
retained with unchecked interpretation; a profile cannot infer execution safety
from expression text. A checked obligation describes understood declaration semantics,
not evaluated runtime truth or enforced policy. Preconditions run in declaration order at the executor's
consistent pre-write state; the first false condition reports its failure.
Postconditions run in declaration order against the candidate post-state and
retained pre-state before commit. A false/errored postcondition is execution
failure with full rollback, never an admitted business rejection. Rule profiles
MUST distinguish inputs/outputs, pre-state and post-state explicitly; versionless
or implicit state bindings are unsupported.
Unknown/errored evaluation fails closed, not as a false-condition success.

A FrameEntry is `{id,record:RecordRef,selector:{language,version,expression,
references:RuleReference[]},maxEntities:integer,fields:FieldRef[],
relationships:RelationshipRef[],create:boolean,delete:boolean}`. `maxEntities`
is 1–256. The exact selector profile defines finite entity identity selection
and Key equality; no implicit query or universal wildcard selector exists.
Fields must belong to the Record; relationships must name an endpoint containing
it. Read entries require create/delete false and bound all consulted business
state. Write entries permit only selected entity creation/deletion and listed
field/association changes. Identity allocation is excluded by the first graph
profile. Conditions/selectors cannot silently read outside the declared frame.
Unrecognized selector semantics retain source and block qualification. Control
state (authorization, replay outcomes, commit sequencer, outbox and projection)
is separately named by the executor profile, not disguised as business writes.
Selectors are evaluated once against inputs and consistent pre-state before any
business write. Their exact selected Key identities are frozen throughout
execution; selection may include explicit absent keys intended for creation.
Output references and post-state reads are forbidden in selectors. A selector
profile must define how to resolve such absent keys without identity allocation.
Selectors' own business reads must fit the declared read frame; the profile
must define bounded bootstrapping of selector dependencies (unresolved recursive
selection refuses). All conditions and handler business reads use that frozen
read frame. Bounds apply to selected identities, including absent keys; exceeding
them aborts atomically.

A RecipeBinding is `{kind:"recipe",profile:{id:"graph-write",version:"1"},
effects:Effect[]}` with a nonempty ordered effect list. A HandlerBinding is
`{kind:"handler",profile:{id,version},handler:{id,version}}`. These are inert
identities. A recipe defines required primitive effects, including explicitly
specified association no-ops. A handler may branch or make no business change
if its outputs/postconditions and frame hold. The frame alone never proves
required effects. No alternate binding may waive a contract obligation.

### Recipe effects

Every Effect has `id` and `kind`. An unknown kind retains those members and its
complete payload with ACTION_UNCHECKED; it gains no known-effect semantics.
Malformed recognized kinds are errors, not preservation-only future variants.
Recognized forms are:

| Kind | Other required members | Meaning and checks |
| --- | --- | --- |
| `create` | `record:RecordRef`, `key:string`, `values:Assignment[]` | Create one entity; `key` is a stable Key on that Record. All Key components and required Record members must have explicit assignments. No allocated/computed keys or inferred defaults. |
| `set` | `entity:EntityBinding`, `values:Assignment[]` | Nonempty named property changes; Field membership must match the entity Record. All Key component Fields on that Record are immutable in graph-write/1. |
| `delete` | `entity:EntityBinding` | Delete this entity only; no cascade declaration is implied. |
| `link` | `relationship:RelationshipRef`, `source:EntityBinding`, `target:EntityBinding` | Create the directed logical association in the authored source/target orientation. |
| `unlink` | same as link | Remove the specified association; no entity deletion is implied. |

Assignment is `{field:FieldRef,value:ValueBinding}`. Fields MUST appear in the
Record's explicit members and at most once in one effect. Creates can have an
empty assignment list only if their required-member/Key obligations allow it.
Later effects may use earlier creates; self/forward/unknown created bindings
are errors. A created entity MUST NOT be deleted in the same action in 0.1.0.
After deleting an entity binding, later use of that same binding is invalid.
Distinct parameter bindings, including different declared Keys, that resolve to
the same runtime entity MUST be canonicalized under the executor invariant boundary; aliases cannot evade deletion/Key/effect rules.

Link/unlink endpoint Record types MUST be among the relationship's declared
source/target sets, and the target binding's Key ID MUST equal the authored
selected target Key. Undirected and owned-lifecycle relationships are outside
this initial executable profile and are reported unchecked; no direction or
cascade approximation is made. Unspecified lifecycle imposes no cascade rule.

Known graph-write/1 effects require corresponding Record/Field/create/delete/
relationship permissions in the declared frames. Static coverage checks do not
prove selected native identities match; runtime instrumentation must enforce the
frozen canonical identities, including aliases.

For a relationship without `associationRecord`, link/unlink use set semantics:
existing link/absent unlink are successful no-ops, and one instance exists per
relationship/source/target triple. This is an explicit action profile, not a
retroactive core relationship rule. Multiplicity still counts distinct endpoints
under CONTRACT-041. For `associationRecord`, link/unlink MUST additionally carry
`association:EntityBinding` of that Record; distinct association identities may
share endpoints. Runtime checks MUST bind the association to the stated endpoints
and refuse reuse with different endpoints. No global core instance semantics are
changed. Unsupported association layouts remain explicit profile refusals.

Final state MUST satisfy affected required fields, Keys and authored relationship
constraints. Deletes that would require undeclared unlinks or cascades MUST fail.
Executors MUST refuse unexpressed native side effects rather than claim the
frame covers them. Recipe implementations must verify their required effects;
handlers must verify outputs/postconditions and frame compliance. Committed-state
comparison cannot prove absence of attempted writes or outside-frame reads; these
stronger claims require executor instrumentation and separate evidence.

### Executor obligations (semantic, not a transport API)

The first graph executor MUST authenticate the calling service and human subject;
other actor profiles must qualify their exact attribution semantics. It MUST authorize
before revealing condition details, resolve all entity keys, validate supplied
values, and check its exact accepted declaration/profile before any write.
Conditions, effects, affected constraint checks and durable idempotency record
MUST commit together against one consistent store state. Concurrent modification
MUST be detected/revalidated or abort; time-of-check/time-of-use gaps are not
permitted. No business change may commit after authorization, precondition or effect failure.
Admitted terminal business rejection/conflict outcomes are durable as specified
below; postcondition/execution failure rolls back the entire attempted transaction.

A supplied idempotency key is scoped to tenant, store, authenticated principal,
module/action identity and caller token. Exact declaration revision is NOT part
of this lookup namespace. The replay record retains the exact declaration and
semantic input identity, including expected-version inputs. Input identity
distinguishes missing/null, uses declared Key equality and CONTRACT-049 admitted
value equality, and refuses unsupported comparisons. First graph profile:

1. Authenticate/admit the stable invocation envelope structurally and apply current authorization
   before revealing protected lookup, failure or result details.
2. Serialize concurrent requests on the stable token scope; look up its outcome.
3. A known expired token refuses. A retained outcome with a different revision,
   input or expected-version conflicts without another business write.
4. An equal retained request returns its original durable outcome unchanged,
   without reevaluating business preconditions. Deployment cannot invalidate a
   retained original-revision replay while still accepting its token lookup.
A retained replay compares typed inputs under its retained original declaration
and equality profiles, never the newly deployed parameter schema. The original
executable handler need not remain installed for replay, but sufficient original
interpretation must remain to compare inputs and return the stored outcome. Lost
interpretation refuses and invalidates that qualification; it never falls back
to fresh execution.

5. Only a fresh token is checked against currently executable revisions. A new
   invocation of a retired revision refuses as unsupported.
6. For the first transactional profile, apply CONTRACT-901's ordered fresh-request
   decision procedure; expected-version checks precede business preconditions.
   A general executor profile must publish its own equally precise precedence.
   Execute against consistent state. Commit business changes, verified conditions,
   durable terminal outcome and any declared outbox fact together. An admitted
   business rejection or optimistic version conflict commits only its terminal
   outcome. Current denials and malformed/unsupported requests record no business
   outcome; profile-defined operational audit is separate.

Terminal committed/rejected/conflict outcomes remain stable across retries even
if inventory replenishes or preconditions change. Expiry/retention and durable
expired-token recognition MUST be named by the executor profile. This does not
promise arbitrary store-loss recovery. Known transient execution/evaluation
failure rolls back business/control changes and leaves no terminal outcome;
retry can reattempt. Lost acknowledgement is indeterminate even if the store
committed: reconcile using the original token, revision, input and concurrency
inputs. No-key invocation has no at-most-once retry guarantee.

An execution observation is one of `committed`, `rejected`, `conflict`, `denied`,
`unsupported`, `expired`, `failed` or `indeterminate`. Only committed has business
outputs, changed identities, opaque version and receipt. Rejected/conflict have
stable failure codes; denied/unsupported/expired expose only permitted refusal
information. Failed means known rollback; indeterminate means commit status is
unknown to the client. A transport must preserve these distinctions. A keyed
business no-op is still committed with its own outcome record and the current
version/receipt, but adds no business-change version or domain event. Replay of
that outcome is distinct from a fresh-key business no-op.

A committed result MUST identify created/changed/deleted entities and changed
associations with the exact Record/Key/relationship identities and required recipe-effect
outcomes or handler contract verification, including no-ops. Unchanged instances
are not falsely reported as changed. It MUST include an opaque store version and a receipt
bound to that store. A consuming read MUST honor at-least-that-commit freshness
or explicitly refuse/wait; the receipt is not a portable global clock or a
warehouse replication guarantee. A projection must identify its own applied
contiguous commit-prefix watermark and content semantics; seeing a high event
number alone cannot claim all earlier changes are visible. A committed outbox
fact and later delivery are separate; delivery may repeat and consumers must
qualify their own deduplication. Event sourcing is not required.
Commit success and effect verification are
separate: unverified outcomes never qualify an exact executor support claim.
Transport encoding and cryptographic receipt validation belong to its profile.

### Portable library API

These additions are experimentally exported, with source-bound Bun/Chromium
evidence in the historical certificate. That evidence does not certify subsequently
changed sources or establish executor support. Source inputs MUST remain
unchanged; returned documents/payloads/reports MUST be isolated JSON-safe copies.
Structurally malformed core/action input MUST refuse with UmfError before a
typed inspection result is returned. Structurally admitted declarations with
semantic violations remain inspectable with validation errors; authoring, editing
and assessment MUST refuse those errors. Unknown effect kinds remain structurally
admissible as the future variants above, with incomplete interpretation.
The caller explicitly supplies its Registry; action validation never discards
other installed registrations or overwrites their semantic callbacks.

| Operation | Signature/return | Rules |
| --- | --- | --- |
| `registerActions` | `(registry:Registry):Registry` | Register exact package/semantic callback using existing duplicate-version refusal; no dynamic loading. |
| `declareAction` | `(source:Document,module:string,action:Action,registry:Registry):Document` | Add only a fresh action ID to an existing module; validate whole document and declaration; preserve unchecked rule text with warnings obtainable through inspection. |
| `inspectActions` | `(source:Document,registry:Registry):ActionInspection` | Retain full source, validation and ordered copied actions with module/path and obligations; never evaluate rules. |
| `editAction` | `(source:Document,identity:{module,action},replacement:Action,registry:Registry):Document` | Same stable ID; refuse if old/new action or required model dependencies contain unchecked relevant meaning. No partial patch or ID replacement. |
| `assessAction` | `(source:Document,identity:{module,action},profile:ExecutorProfile,registry:Registry):ActionAssessment` | Compare declarations only; no executor invocation or evidence authentication. |

ActionInspection is `{source:Document,validation:Validation,
actions:{module:string,path:string,action:Action,obligations:Obligation[]}[]}`.
Obligation is `{id:string,path:string,kind:string,status:"checked"|"unchecked"}`;
IDs are absolute document JSON Pointer paths, including the selected action
attachment path; model obligations use their absolute definition pointers. Kinds are `value`, `key`,
`condition`, `effect`, `authorization`, `attribution`, `atomicity`, `idempotency`,
`result`, `handler`, `frame`, `selector`, `output`, `failure`, `binding`, `unknown`, `model`. Every pre/postcondition, frame/selector, output/failure and binding/recipe effect
receives an entry;
value/Key/model checks include every transitive required dependency.
Dependency obligations MUST be deduplicated by exact pointer; action/model IDs
share one pointer-based namespace in the inventory. A dependency cycle terminates
at the first revisited pointer and remains reported without discarding source.

ExecutorProfile is `{id,version,actionVersion:"0.1.0",coreVersion:"0.8.0",
claims:{obligation:string,status:"supported"|"unsupported"|"unknown",
evidence:string[]}[],source:Document,identity:{module:string,action:string}}`.
The profile id/version MUST identify a bounded executor qualification profile,
including store/version, authorization (role or policy)/rule/selector/handler versions, replay retention and receipt
semantics in its cited evidence. It MUST retain the exact declaration document
and identity it claims to cover;
assessment requires JSON data equality including unknown members and array order.
This is deliberately a per-declaration snapshot, not a wildcard feature manifest.
Each supplied obligation has at most one claim; duplicates/extra IDs refuse. Missing
claims yield unknown; supported claims require nonempty evidence locator strings.
Locators are inert, not fetched or trusted as proof. `unknown` obligations cannot
be overridden by a claim, except opaque rule/selector/authorization (role or policy)/handler profiles whose exact
semantics the executor explicitly claims with evidence. Unknown members and
unsupported value/model meaning cannot be overridden in 0.1.0.

ActionAssessment is `{source:Document,profile:ExecutorProfile,
identity:{module:string,action:string},declaredCompatible:boolean,
executionVerified:false,outcomes:{obligation:string,path:string,
status:"supported"|"unsupported"|"unknown",evidence:string[]}[],
diagnostics:Diagnostic[]}`. `declaredCompatible` requires every obligation to
be checked/supported under these rules. It is never permission, proof of current
authorization/state, authenticated evidence or successful execution. There is no
report-mode waiver. Unrelated unknown extensions survive and do not by themselves
block assessment; unknown members on referenced model definitions do.

## Precedence and Compatibility

Core 0.8.0 defines Record/Field/Key/values and CONTRACT-041 relationship assertions;
this extension adds only the stated action profile. DDD metadata is independent:
`dddOperation` validates association but imports no aggregate/event obligations.
Native database/API semantics remain attached; disagreement blocks exact claims.

0.1.0 reserves only the new extension namespace, not core members. Unknown content
already using `umf.actions` MUST NOT be adopted automatically: explicit registration
at the declared version and full validation are required. New meanings require a
new extension version, independently versioned diagnostics and explicit migration
with retained original payload and rollback. Existing documents lacking actions
remain unchanged. Removal retains action payloads as unknown; executors MUST stop
accepting contracts whose supported package/profile has been removed.

## Error Semantics

Validation uses existing `{code,path,message,severity}` with escaped document JSON
Pointers. Known failures are errors; unchecked meaning is a warning and sets
interpretation completeness false. Diagnostic identity is code/path/severity;
message text is informative. Ordering is source traversal order, then code.
Public mutation errors throw UmfError and leave source unchanged.

| Code | Condition/outcome | Recovery |
| --- | --- | --- |
| `ACTION_STRUCTURE` | Invalid known declaration/profile shape or scope | Correct input; never coerce. |
| `ACTION_IDENTITY` | Duplicate action/name/parameter/condition/effect or conflicting edit ID | Use unique stable identities. |
| `ACTION_REFERENCE` | Missing/wrong-kind Field/Record/Key/relationship/DDD operation | Supply exact declared target. |
| `ACTION_EFFECT` | Invalid membership, immutable Key edit, ordering or endpoint binding | Correct explicit effect. |
| `ACTION_UNCHECKED` | Unknown member/kind, rule/profile/handler or unsupported value/model meaning | Retain; no safe-edit/capability success until interpreted. |
| `ACTION_PROFILE` | Mismatched source/version, duplicate/extra claims, empty supported evidence | Supply exact valid profile. |
| `ACTION_CAPABILITY` | Unsupported/missing claim | Incompatible assessment, never execution fallback. |
| `LIMIT` | Core or action limits exceeded | No partial output; narrow input. |

Existing core/registry diagnostic codes also propagate. Each action is bounded
to 128 parameters, 128 pre/postconditions combined, 128 frames per list, 128 outputs, 128 failures,
256 recipe effects, 256 assignments per effect and
64 roles; each expression is at most 65536 UTF-16 code units. Core document/value
limits also apply. Profile claims may not exceed the computed obligation count.
Limits are semantic profile constants, not a throughput claim.

## Executable profiles and evolution

[CONTRACT-901](CONTRACT-901-transactional-action-profile.md) defines the proposed
bounded rules/selectors, trusted-handler access, invocation/lookup/preview,
revision lifecycle, authorization/concurrency and audit/receipt obligations.
It is a consumer protocol, not a new core or dynamically loaded UMF service.
A profile can be described before any executor is qualified. No new evaluator,
general authority vocabulary or workflow extension is implied by registration.

New declaration revisions do not imply caller compatibility. Differences must
be reviewable across signature, reads/writes, conditions, policy and result
obligations. No automatic proof of condition implication or handler substitution
is claimed. Optional display-only edits still change an exact retained snapshot;
replay uses its original identity. Cross-document references, bulk atomicity,
computed/allocated identities, recipe business outputs, events and external
workflow composition need separate profiles/versioned extensions with evidence.

## Examples and fixture status

[Candidate comparison](../actions-candidate-comparison.md) records equivalent
requests and the recipe/handler decision. CONTRACT-901 supplies a concrete
invocation example. The initial ordered-recipe fragment was superseded by frames,
postconditions and binding; it must not be used as a current payload fixture.
Full core-conformant action/profile fixtures are the first implementation step;
none of the simplified feasibility representations establishes schema acceptance.

## Validation Checklist

Resolve exact references and Key/Field membership; verify effect order and known
value admission; retain unknowns with warnings; allocate every obligation;
compare exact profile/source; refuse unsupported/unknown claims; check copy
isolation and resource limits; exercise both serializations and real Chromium.
Executor qualification additionally requires the separate witnesses in STP-078.
