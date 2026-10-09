---
ddx:
  id: CONTRACT-901
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-008
      kind: informed_by
    - id: SD-008
      kind: informed_by
    - id: CONTRACT-900
      kind: references
    - id: CONTRACT-040
      kind: references
    - id: CONTRACT-049
      kind: references
---

# CONTRACT-901: First transactional action profile

**Type:** consumer protocol and executable-profile contract.
**Version:** proposed `umf.actions.tx` / `1`, with `umf.actions.rules` / `1`
and `umf.actions.keys` / `1`, optional `umf.actions.roles` / `1`; core 0.8.0, actions 0.1.0.
**Status:** draft; the bounded transactional reference consumer is implemented.
The [historical certificate](../../04-build/evidence/actions-certification.md)
records its exact source, native/browser witnesses, versions and exclusions.
Earlier design experiments do not substitute for those implementation witnesses.
Qualification of changed integrated sources and production/downstream executors
remains separate; see the
[documentation delivery record](../../04-build/evidence/actions-documentation-execution.md).

## Purpose

Define the first independently implementable consumer execution subset of
CONTRACT-900. UMF stores and inspects these exact profile identities. Trusted
consumer code evaluates them; documents MUST NOT load handlers or policy code.
This profile supplies no new core scalar, entity codec or generic authority model.

## Scope and Boundaries

One action, one store transaction, explicit caller-supplied keys, scalar boolean/
integer/string rules and a human principal plus authenticated calling service.
Local Record/Field/Key/relationship references only. Core decimal/binary/other
values remain preservable but are not executable under the rule profile below.
A store adapter must qualify core equality and constraints independently.
No bulk requests, identity allocation, external calls, workflows, cancellation,
compensation, cross-store commits or warehouse freshness are covered.

## Normative Surface

### Rule language: `umf.actions.rules` / `1`

`rule.expression` is JSON text encoding one of the abstract syntax forms below;
original text MUST survive inspection. No executable JavaScript, property-path
strings, implicit coercion or name-based model lookup is allowed. RuleReference
entries MUST cover every actual input/output/Record/relationship dependency;
extra declared dependencies are allowed but remain obligations.

| Expression | Type and semantics |
| --- | --- |
| `{literal:CoreLiteral}` | Admitted boolean, integerToken, string or explicit nullable null. |
| `{input:id}` / `{output:id}` | Exact declared parameter/output ID and Field-derived type; outputs only in postconditions. |
| `{state:"pre"|"post",frame:id,field:FieldRef}` | Read one frozen selected entity's Field; exact Record membership and declared read access required. Post-state only in postconditions. |
| `{exists:{state:"pre"|"post",frame:id}}` | Boolean existence of the frozen selected identity; same phase/read restrictions. |
| `{linked:{state:"pre"|"post",relationship:RelationshipRef,sourceFrame:id,targetFrame:id}}` | Boolean exact directed set-association membership between frozen endpoints; post-state only in postconditions. |
| `{op:"present",args:[expression]}` | Boolean whether an input/output/property is present; distinguishes absent from explicit null. |
| `{op:"eq",args:[a,b]}` | Same scalar-family admitted equality under CONTRACT-049; no string/numeric coercion. Explicit null compares only with nullable same-family values or null. |
| `{op:"lt"|"le"|"gt"|"ge",args:[a,b]}` | Integer operands, boolean result. |
| `{op:"add"|"sub",args:[a,b]}` | Exact integer arithmetic; result is an admitted integerToken, not a JavaScript number. |
| `{op:"and"|"or",args:[a,b]}` / `{op:"not",args:[a]}` | Boolean operands/result; left-to-right short circuit for and/or. |

Static checking MUST validate every branch, arity, phase, type and dependency,
even a branch skipped at runtime. Conditions require boolean results. Optional
missing values can be tested with present; their use as operands otherwise errors.
Absent entities can be tested with exists; reading their fields otherwise errors.
Null arithmetic/ordering/boolean operands error. Equality treats absent as error.
Reading outside the frozen read frame or unsupported native value meaning errors.
All used fields, including post-state fields on created entities, MUST be listed
in a read entry; an absent pre-state identity can be selected for future reads.
Writes alone confer no read permission. linked requires both endpoints to be
read frames and the exact relationship to be listed in the source frame's read
relationships and rule dependencies. Endpoint orientation/Record membership must
match CONTRACT-041. A missing endpoint means no link, not a fabricated instance.
Association-Record, owned and undirected linked semantics are unsupported by this
first profile; they must not collapse to a simple endpoint pair.

Integer admission, constraints, limits and equality reuse CONTRACT-049; no fresh
numeric normalization is specified. Expanded arithmetic coefficients must fit
those bounds. Each expression is limited to depth 32 and 512 syntax nodes as well
as CONTRACT-900 text limits. Limit, evaluation or postcondition failure rolls
back, without a terminal business outcome; a false precondition records its
named terminal business rejection. A required input violating its Field or an
unknown syntax node refuses before execution.

### Role authorization: `umf.actions.roles` / `1`

This optional exact role profile gives the existing roles binding a bounded
interpretation: the authenticated human principal must hold **at least one**
role listed in the action. Role IDs compare exactly and are limited to 256 UTF-16
units. Roles come from executor-controlled membership state in the qualified
transaction/authorization boundary; action metadata and request inputs cannot
supply memberships, principal identity or service identity. Empty roles, unknown
profile configuration, missing authentication and no matching role refuse.

Static interpretation checks the binding and records an understood authorization
obligation; it neither grants membership nor certifies commit-time enforcement.
Other role/policy profiles remain opaque. This explicit known profile also permits
safe editing of otherwise completely interpreted declarations; an opaque profile
still blocks editing. Invocation qualification requires current authorization,
revocation/concurrency and protected replay evidence independently.

### Selector language: `umf.actions.keys` / `1`

A selector expression is JSON text in exactly one form:

- `{entity:inputId}` selects the exact Key carried by an entity input; its target
  Record must equal the frame Record.
- `{key:keyId,components:[{input:valueInputId}|{literal:CoreLiteral},...]}` selects
  an explicit key on the frame Record. Components match declared Key order/count,
  Field scalar family and admission constraints. No defaults or allocation.

Selectors consult only admitted inputs/literals, never stored business state or
outputs. They produce exactly one identity, which may be absent; maxEntities
MUST equal 1 in this profile. Core tuple equality identifies aliases only within the same declared Key.
The store adapter MUST resolve every selected Key, including alternate Keys,
to a canonical native entity identity under the same invariant transaction
boundary. Permissions and delete/use tracking are unioned for that identity,
while reads and writes remain distinct. Cross-Key alias detection cannot rely
on unequal Key IDs. Ambiguous/nonunique resolution refuses. Absent identity
creation is admitted only through the adapter's qualified canonical primary Key;
absent alternate-Key creation or unknown cross-Key equivalence refuses. Creation requires an originally selected primary-Key write frame with
create:true at the exact created identity; an alternate frame cannot bootstrap
that capability. After supplied Key tuples prove alias equality, Field
grants union across matching write frames, with read grants kept separate. Alias
resolution cannot bypass immutable keys, delete/use ordering or relationship
constraints. No scans, joins, recursive selectors or expression queries are
accepted; another selector language needs separate qualification.

### Revision and deployment

`RevisionRef` is `{module:string,action:string,revision:string}`. The revision is
an immutable executor-assigned token for the full declaration Document snapshot,
including dependencies, unknown content and order. Its registry MUST reject
reusing a token for different source. It is not a semantic-version range or an
unqualified hash of serialized JSON. A handler deployment is independently
identified by `{id,version,build}` and its exact profile/environment qualification.

Revision lifecycle: `active` accepts fresh invocations; `retired` permits retained
outcome lookup/replay only; `unavailable` refuses. Retained original input/equality
interpretation and protected outcome access survive handler retirement. A handler
change requires a new deployment qualification; semantic contract change requires
a new revision. Neither automatically establishes caller compatibility.
Retirement fences new admissions; a previously admitted transaction pins its
accepted snapshot/deployment and may finish under current authorization. Immediate
cancellation of admitted work is not implied by retirement; a separate qualified
fencing/abort protocol is required for that stronger guarantee.

### Invocation envelope and results

Consumer methods are `invoke(request)`, `lookup(request)`, `preview(request)` and
`readAtLeast(receipt,projection)`. These are logical operations, not HTTP endpoints.
Authenticated tenant/principal/service are supplied by the trusted session; request
fields MUST NOT override them. Unknown request members are refused, not executed.
Protocol identity/version/code/correlation strings are nonempty and at most
256 UTF-16 code units unless a different bound is stated. Core literal content
retains core limits; this bound does not truncate business strings or numeric tokens.

| Shape | Members / rule |
| --- | --- |
| InvokeRequest | `{protocol:"umf.actions.tx/1",target:RevisionRef,inputs:{[inputId]:CoreLiteral|EntityInput},key?:string,expectedVersions?:ExpectedVersion[],correlation?:string}` |
| EntityInput | `{key:KeyRef,components:CoreLiteral[]}`; target/ordered components use exact declared core Key semantics. |
| ExpectedVersion | `{frame:string,version:string}`; unique frame IDs, frozen selected resource, adapter-defined exact opaque version equality. Absence makes no caller version assertion. |
| LookupRequest | `{protocol,target,key,inputs,expectedVersions?}`; same original payload, key required; no execute-if-missing. |
| PreviewRequest | InvokeRequest without key/correlation; creates no replay record or reservation. |
| Receipt | `{store:string,epoch:string,version:string}`; opaque version under a qualified adapter, not a portable ordered integer. |
| Committed | `{status:"committed",revision:RevisionRef,outputs:{[outputId]:CoreLiteral|EntityInput},changes:Change[],version:string,receipt:Receipt,noOp:boolean,verification:Verification}` |
| Terminal rejection/conflict | `{status:"rejected"|"conflict",code:string}`; no protected state detail by default. |
| Refusal | `{status:"denied"|"unsupported"|"expired",code:string}` |
| Known rollback | `{status:"failed",code:string}` |
| Lost acknowledgement | `{status:"indeterminate"}`; client observation, never manufactured from known successful acknowledgement. |
| Lookup missing | `{status:"not-found"}`; lookup only, never authorization to reexecute an expired/indeterminate request. |

`Change` is `{kind:"created"|"updated"|"deleted",entity:EntityInput}` or
`{kind:"linked"|"unlinked",relationship:RelationshipRef,source:EntityInput,
target:EntityInput,association?:EntityInput}`. Empty changes and noOp true must
agree; unchanged entities belong in typed outputs, not falsely reported changes.
Owned/undirected/association-Record execution requires separate native evidence;
unsupported arrangements refuse. Runtime outputs must obey declared types;
recipe outputs are empty. Input maps preserve omission versus explicit null.
Entity-output verification MUST NOT grant additional business-read capability.
In the reference container profile, an existing entity output must be a surviving
exact admitted entity input or frozen READ selector identity; another Key of that
READ-selected entity is allowed only when every component Field has frozen READ
permission. Newly created candidates may return any of their verified Keys.
Arbitrary returned Keys outside these permissions refuse uniformly before any
native existence query; broader output-disclosure capabilities require separate
explicit qualification. Deleted entities cannot be returned as surviving outputs.

`Verification` is exactly one of:

- Recipe: `{kind:"recipe",effects:{effect:string,status:"verified",
  outcome:"changed"|"no-op"}[],postconditions:ConditionVerification[],
  frames:"enforced",constraints:"verified"}`. Exactly one entry per declared
  effect, in recipe order; no missing/duplicate/extra effect ID. Its outcome
  describes that primitive's immediate effect on transaction state, not the net
  final change list. An existing link/absent unlink is verified no-op.
- Handler: `{kind:"handler",deployment:{id,version,build},
  postconditions:ConditionVerification[],frames:"enforced",
  constraints:"verified",outputs:"verified"}`. Deployment must match the
  exact accepted handler qualification; no arbitrary verification locator is
  substituted for executor checks.

ConditionVerification is `{condition:string,status:"satisfied"}`; exactly one
entry for each declared postcondition in declaration order. Empty declarations
have empty arrays. The committed result may contain only successful verification;
unverified/error outcomes abort rather than return committed. Verification kind
must match binding kind, and all verification is persisted and replayed unchanged.
This is an executor assertion, not independent proof authenticated by UMF.

changes is the net difference between pre-state and committed post-state, with
unique entity/association identities in first modification order. Multiple
updates of one entity yield one updated entry; changes restored to pre-state
are omitted. Creation records a created entry rather than separate updated
entries; deletion of a preexisting entity records deleted. Association endpoints
and optional association identity participate in duplicate identity. Overall
noOp is true exactly when this net difference is empty; required recipe effects
can have changed primitive outcomes even when later effects restore pre-state.
Such a net no-op produces no business-change version/event, but persists its
terminal verification/outcome. The frozen frame still applies to every attempt.

The stable token scope includes trusted tenant/store/principal/module/action/key;
service is audited but does not create another replay namespace. Token length
1–1024 UTF-16 units. Equality compares original revision, admitted typed inputs
and exact expected-version assertions; expectedVersions order is not semantic.
Retained replay/lookup validates original typed input identity without requiring
those input entities to still exist or current preconditions to hold. Fresh
invocations validate input existence under the declared pre-state rules.
Correlation is audit metadata, not payload identity or a dedupe token. Outcome
encoding has no timestamps/attempt IDs that could change retained payloads.
lookup follows current authorization, expiry and original-payload checks just as
replay does; not-found does not conceal known expired tokens by forgetting them.
An expired-key tombstone must remain for the executor's published token horizon.
Beyond that horizon keyed execution MUST refuse unless a separately qualified
new namespace is explicitly selected; clients cannot infer safe token reuse.
The PostgreSQL reference implementation publishes a namespace-lifetime horizon:
recognition survives visibility expiry for the entire lifetime of the store/token
namespace. It permits no time-based reuse or purge of expired-key tombstones.
Fresh consumer connections must recognize expired original and changed intents
without business reexecution. This concrete retention policy does not qualify a
different executor or a shorter horizon.

### Replay namespace discovery authorization

The reference consumer MUST install an executor-controlled discovery binding for
an action family within a trusted tenant/store. It uses the exact
`umf.actions.roles` / `1` semantics above, independently of any declaration
revision. The binding grants permission to distinguish token presence only within
the authenticated principal's module/action namespace; it does not grant access
to retained results or expiry details. Calling service remains outside token scope.
Caller inputs, action metadata, new revisions and revision retirement MUST NOT
implicitly grant, replace or revoke this discovery binding.

Under the store-control boundary, lookup and keyed invoke/replay MUST authorize
current discovery membership before querying terminal outcomes. Absent, disabled,
unknown or malformed discovery configuration denies uniformly with AUTHORIZATION,
without token access. Discovery configuration and membership changes share the
same native serialization and policy-version boundary as invocation admission.
The trusted administrative API explicitly installs or disables the binding; a
missing binding is not inferred from a revision's roles or from existing outcomes.

After discovery authorization, a retained token selects its original revision.
Current original-revision authorization still gates result, conflict and expiry
information. Without that original permission the result is denied, even if the
caller may discover presence. A missing token follows current requested-revision
validation/authorization before not-found; missing/unavailable requested revision
refuses unsupported/REVISION. These presence distinctions are permitted only by
explicit discovery authorization. No lookup branch executes code or allocates a
new token. Known expiry precedes token-payload comparison. A different retained
revision conflicts with TOKEN_REUSE before typed admission; an equal revision
compares inputs using original retained semantics, never the replacement schema.

### Fresh-request decision precedence

This procedure applies only after current authorization and stable-token
lookup/expiry/payload checks in CONTRACT-900. Retained equal outcomes bypass
these fresh business checks. First failing stage determines status/code and
whether a terminal outcome exists; no later stage can override it.

1. Require active revision and qualified declaration/interpreters/deployment.
   Unsupported/retired revision or unqualified profile refuses without a terminal
   outcome. Do not reinterpret an existing-key retry with this active schema.
2. Admit typed inputs and expected-version structure; validate static declaration
   semantics, rule phase/type/dependencies and frame references. Malformed input
   refuses unsupported/PARAMETER, or the relevant declared static diagnostic,
   without a terminal outcome. All static branches are checked here.
3. Admit/evaluate input-key tuples and static finite frame bounds; do not yet
   resolve native identities or freeze aliases outside the transaction boundary.
   Unsupported selector meaning refuses without a terminal outcome; runtime
   selector evaluation/limit failure is failed with known rollback and no outcome.
4. Establish the qualified native invariant/transaction boundary; resolve native
   identities and freeze aliases there, then recheck current authorization before
   any protected disclosure. Ambiguous/nonunique canonical resolution refuses
   without an outcome. Denial records no business terminal outcome. Check
   existing entity inputs in parameter declaration order; first absent input
   records rejected/ENTITY_MISSING. Explicit absent create targets are allowed.
5. Check expected resource versions in combined frame declaration order (reads,
   then writes), irrespective of request assertion order. First mismatch records
   conflict/EXPECTED_VERSION. An absent selected resource cannot satisfy a
   supplied opaque version assertion and therefore conflicts; absent resources
   without such an assertion impose no implicit version check.
6. Evaluate preconditions in declaration order. First false condition records
   its declared rejection. First evaluation error aborts failed/RULE_EVALUATION
   without an outcome. Earlier expected-version conflict prevents evaluation,
   including errors in branches that would otherwise be evaluated at runtime.
7. Execute recipe/handler, validate outputs, then final native constraints, then
   ordered postconditions. A final constraint failure takes precedence over any
   postcondition false/error; no postcondition runs after that failure. Then commit net changes, verification, terminal outcome/audit
   and any outbox fact atomically. Access/output/constraint/postcondition failure
   aborts failed with no terminal outcome. Later authorization loss within the
   qualified boundary cannot escape its serialization guarantee.

ENTITY_MISSING is a profile-reserved business failure code. Other profile error
codes below are reserved too; action failures must not reuse them. Precondition
rejection/conflict durably records the chosen outcome, with no business changes;
retry returns it even after competing failure conditions disappear. Preview
uses stages 1–6 in this order but persists nothing and executes no stage 7.

### Concurrency, authorization and handlers

Qualified execution MUST serialize or otherwise detect all conflicts affecting
selected records, field predicates and relationship constraints, including
phantom links and absent-key creates. A profile must list its invariant boundary
and native triggers/cascades. Executor-owned schema-invariant validation (Key
uniqueness, referential integrity and relationship multiplicity) may inspect
additional business rows/edges, but its exact dependency/predicate lock boundary
MUST be declared and qualified separately from action read permissions. Those
reads must not be exposed to handlers or appear as hidden rule reads. Arbitrary
handler reads cannot masquerade as invariant validation. Disjoint action write
frames do not imply independence when they share an invariant dependency. Per-row locks alone do not establish this guarantee.
The reference design may use a tenant-wide sequencer, explicitly sacrificing
concurrency; narrower locking needs new native proof for identical guarantees.

Authorization is checked before disclosure and again within its declared commit
consistency boundary. The first profile requires authoritative policy/role state
participating in the same transaction/lock boundary; revocation and commit have
a defined serialization order. External policy checks without that coupling do
not qualify this commit-time guarantee. Roles and general policy bindings are
both describable; their exact trusted implementations require separate evidence.

A registered handler receives only a transaction capability with read(frame,field),
exists(frame), linked(relationship,sourceFrame,targetFrame), create(frame,values), set(frame,values), delete(frame), and
link/unlink(relationship,sourceFrame,targetFrame). Inputs use isolated copies.
No raw database connection, arbitrary query or implicit credentials is supplied.
The capability must resolve aliases, track every attempted operation and refuse
undeclared read/write/relationship access before forwarding it to storage.
Control-state maintenance is executor-owned, never a handler permission.
Handlers must be sandboxed against ambient network/process/database access or
qualified through another independently demonstrated isolation mechanism.
Trusted registration alone is insufficient to claim enforced effects. Recipe
execution uses the same capability. Final constraints/output/postconditions are
checked before business changes and terminal outcome commit together.

Known deadlock/serialization aborts may retry internally with the same token,
maximum 3 total attempts, then failed/TRANSIENT_ABORT. An attempt with unknown
commit status MUST reconcile by original token; it cannot be treated as a known
abort. No-key execution cannot retry after an ambiguous commit. Timeout does not
imply cancellation or rollback; cancellation is outside this profile.

### Preview, audit and visibility

Preview uses the same parameter/rule/selector checks and current authorization,
but no handler execution, business/control writes, replay allocation or external
calls. Result: `{status:"preview",revision:RevisionRef,profile:{id,version},
stateBasis:Receipt,preconditions:"satisfied"|"rejected"|"unchecked",
changes:"not-computed",commitGuaranteed:false}`. Error/refusal variants apply.
It is validation-only: predicted handler edits need a new sandbox preview profile.
Commit rechecks everything; the stateBasis receipt reserves nothing.

Each attempt has executor-assigned attemptId and records trusted actor/service,
RevisionRef, handler build, policy snapshot/version, profile/version, decision,
correlation if supplied, and references to changes/outcome where authorized.
These audit fields are not caller-controlled replay identity. Terminal audit,
outcome, business changes and any outbox fact commit together; rollback/denial
attempt telemetry has its own durability policy and cannot be called a business
commit. Raw inputs/policy data are not logged by default. Audit readers and
failure detail access have separately enforced authorization/retention.

readAtLeast binds receipts to store/epoch and a named qualified projection;
returns visible, pending or unsupported. visible requires the projection's
contiguous applied commit prefix to include that receipt AND its content model
to expose the relevant changes. Restore/epoch change invalidates old receipts;
never compare opaque versions lexically or substitute a maximum seen event ID.
A restore with uncertain outcome/business-state consistency must fence invocation
and require a separately qualified recovery/new-namespace procedure. Receipt
epoch change alone does not reset the replay namespace or authorize old tokens.
Typed domain-event schemas, causation and consumer dedupe remain a separate
integration contract; an outbox fact alone supplies none of those meanings.

## Precedence and Compatibility

CONTRACT-900 owns action declaration semantics; this profile adds a bounded
executable interpretation. Core contracts retain identity/value authority.
Unknown declaration meaning remains preserved and blocks exact qualification;
unknown protocol meaning refuses. No profile may weaken base replay/atomicity.

A new revision is not a compatible revision by default. Strengthened preconditions,
weakened postconditions, expanded writes, changed reads/policy/selector/key/value
semantics, mandatory input changes or output removal must be flagged for explicit
caller review. Unchanged text is not a proof across changed profiles. Automatic
logical implication/subtyping is not provided. Kept replay outcomes always use
original revision rules, even when a replacement is approved for fresh requests.

## Error Semantics

Stable codes: PARAMETER (admission), RULE_TYPE, RULE_PHASE, RULE_DEPENDENCY,
RULE_EVALUATION, SELECTOR, FRAME_ACCESS, LIMIT, REVISION, AUTHORIZATION,
TOKEN_REUSE, TOKEN_EXPIRED, EXPECTED_VERSION, POSTCONDITION, TRANSIENT_ABORT,
RECEIPT_SCOPE, ENTITY_MISSING, CONSTRAINT. CONSTRAINT identifies a known rolled-back
native/refinement invariant failure; it creates no business terminal outcome. Admission/unsupported version refuses, false precondition is its
named rejection, expected-version mismatch is terminal conflict; runtime access/
evaluation/postcondition failure rolls back and returns failed. Protected details
are withheld without authorization. None authorizes automatic fresh-token retry
after indeterminate acknowledgement. CONTRACT-900 governs terminal token replay.

## Examples

```json
{"protocol":"umf.actions.tx/1","target":{"module":"sales","action":"reserve","revision":"r1"},"inputs":{"orderId":{"string":"o1"},"quantity":{"integerToken":"1"},"product":{"key":{"module":"sales","element":"product","key":"pk"},"components":[{"string":"p1"}]}},"key":"reservation-17","expectedVersions":[{"frame":"product-read","version":"v0"}]}
```

Reservation postcondition AST: `eq(post.product-read.stock,
sub(pre.product-read.stock,input.quantity))`, encoded with the table's exact
objects/FieldRefs. A complete normative core fixture is required before public
implementation acceptance; this request example is not an executable fixture.

## Validation Checklist

Derive EX-01–EX-05 in STP-078: static branch checking and numeric bounds; frozen
explicit-key selection and aliases; current auth/revision/replay/lookup;
phantom/create conflicts and denied handler access; preview/audit/receipt epochs.
Execution status, actual test mappings and source/runtime fingerprints are recorded
in STP-056 and the current action certification evidence. Earlier prototype probes
alone qualify only their recorded synthetic subsets. Certification requires the
corresponding current native witnesses and complete core regression gates.
