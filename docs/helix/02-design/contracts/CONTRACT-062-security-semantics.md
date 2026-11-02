---
ddx:
  id: CONTRACT-062
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
    - id: CONTRACT-066
      kind: informed_by
---

# CONTRACT-062: Shared security semantics

**Version:** proposed `umf.security` 0.1.0. **Status:** draft; not core admission.
A minor revision `umf.security` 0.2.0 and a companion extension
`umf.security.protection` 0.1.0 are specified in §Field protection catalog
(2026-10-14). Wire inspection, source lookup and representation migration have
component evidence. Qualified core-domain resolution, six pure reference function
classes and a separate catalog transport profile have scoped implementations;
general0.2 interpretation, complete property/compiler admission and native
protection admission remain unfinished.

## Purpose

Define logical security independently of relational and node/edge storage.
This contract governs policy meaning; CONTRACT-063 governs enforcement receipts.

## Scope and Boundaries

UMF owns meaning, structural/semantic validation and a pure reference evaluator.
Hosts own authenticated identities, trusted context and complete fact supply.
Consumers own enforcement. Native policy archives remain independently retained.
The first interpreted subset is finite, nonrecursive and exact-typed.

## Current core 0.10 computation subset

The current catalog-program, private query-child and private native-disclosure
profiles accept only actual core `0.10.0` source documents. They validate those
sources with the core 0.10 semantic-reference validator; no older-envelope view
is supplied to extension semantics or policy evaluation. Source identity, exact
revision pins, field/key domains and complete authority/fact coverage remain
required.

For this selected profile, the document-level warning
`EXPERIMENTAL_CORE_SEMANTIC_TYPES` at `/umf` is an envelope advisory. It alone
does not make the selected scalar policy domains unresolved. The original
validator result and diagnostics remain unchanged. Every other diagnostic still
blocks the complete-source gate, including actual external `semanticTypes`
references, unknown qualifiers and unresolved extensions. This does not install
external semantic validators or claim semantic-type enforcement. UUID/128-bit
policy domains remain outside the existing five-family scalar subset.

The `umf.actions` semantic registry callback and static rule/selector compilers
used by these profiles inspect the actual 0.10 document. This scope does not
expand the separate action executor, public key-tuple receipt, schema-property
authoring or native binding APIs to 0.10. The private computation profiles still
claim neither database admission nor native enforcement authority.

## Normative Surface

### Identity and ontology

An entity type or field reference MUST contain `documentId`, `moduleId` and
`elementId`, resolved against an explicit immutable document revision. Display
labels MUST NOT resolve authority. Instance identity is `{type, key}`, where
`key` is a canonical existing UMF Key tuple, not a hash alone. Association facts
carry their own identity, declared endpoint roles and typed attributes. Flat
junction rows and graph edges bind to the same association meaning.

### Policy document

| Member | Required shape | Rules |
| --- | --- | --- |
| vocabulary/version | `umf.security` / `0.1.0` | Exact supported pair |
| id/revision | nonempty strings | Immutable policy identity and revision |
| ontology | qualified model reference + revision | Explicit resolution package |
| rules | array of Rule | Unique nonempty rule IDs; maximum 256 |
| native | opaque JSON archive | Optional; never executable authority |

Rule is `{id,effect,actions,target,condition,disclosure?}`. `effect` is
`permit`, `require` or `forbid`; actions are nonempty declared action IDs.
`target` is an explicit nonempty list of qualified logical type references.
`condition` is an Expr. Disclosure is allowed only on permit rules.
Rule scope matches by exact action/type identity, not relationship reachability.
Unknown members MUST survive round trips; unknown members/operators that might
alter security meaning block enforcement until interpreted or explicitly proved
irrelevant by a qualified profile. Preservation is still available.

### Expression algebra

Expr is exactly one tagged alternative:

- `{op:"literal",value:boolean}`.
- `{op:"eq",left:Term,right:Term}`; operands MUST have identical declared types.
- `{op:"and"|"or",args:Expr[]}`; nonempty, at most 64 arguments.
- `{op:"not",arg:Expr}`.
- `{op:"exists",association:Ref,as:string,where:Expr}`; binds one fresh
  association variable over a complete typed fact relation.

Term is a tagged `subject`, `resource`, `context`, `variable` attribute/identity
reference or a typed constant. Variable references include `name` and attribute
path or endpoint role. Paths resolve through declared fields, with no dynamic
member names. Constants use existing exact UMF literal carriers; comparison MUST
NOT coerce strings, normalize Unicode, round numerics or equate null with absence.
Authentication-to-Staff mapping is a trusted, unique instance binding; a missing
or ambiguous mapping refuses evaluation.

Maximum nesting is 16, maximum expression nodes is 4096 per document. A fact
provider declares finite bounds and complete coverage for each referenced type,
association and attribute at an admitted authority generation. Unknown fact
coverage is not an empty relation. Exceeding bounds refuses the operation.

`exists` supports nested correlated expressions (including joins through endpoint
roles) under these bounds. It does not imply automatic ownership inheritance,
unbounded paths or recursive group membership. All/any owner meaning MUST be
expressed explicitly; `all(P)` is `not exists(not P)` over complete facts and is
vacuously true for no owners unless a separate nonempty-owner requirement applies.

### Evaluation and composition

Conditions evaluate to T, F or U (indeterminate). Missing, malformed or untrusted
required inputs, incomplete fact relations, unsupported operators and resource
exhaustion produce U or pre-evaluation refusal. Boolean semantics use strong
Kleene logic; `not U = U`, `F and U = F`, `T or U = T`. These truth tables do
not authorize ignoring incomplete provider admission.

#### R8 `securityNot` default-route acceptance profile

The narrowly scoped R8 retirement profile for the scalar `securityNot` export
uses the guarded V4 package-root route and this contract's exact `T`, `F`, `U`
domain. Its frozen packet contains exactly 14 ordered cases: valid `T`, `F`,
`U`; null, number, boolean, an unknown string; array, ordinary object,
null-prototype object, accessor object; and Proxies trapping `ownKeys`,
`getPrototypeOf`, and property `get`. Valid results are respectively `F`,
`T`, and `U`. Every invalid case throws `UmfError` with code `SECURITY_TRUTH`,
message `Invalid security truth`, and empty path. No case may invoke a getter or
Proxy trap. The guarded default route dispatches each valid case to Rust exactly
once and rejects each invalid case before Rust dispatch; the TypeScript
reference route dispatches none. Node, Bun, and Chromium receipts retain each
case's outcomes, traces, and dispatch counts for both routes, bound to the
archive, package routes, and source closure under test.

This profile qualifies only that export's observed default-route behavior for
its recorded fixed-point source and installed cohorts. It says nothing about
`securityAnd`, `securityOr`, policy evaluation, security admission generally,
or release suitability. Bounded `/2` default-route evidence alone cannot
satisfy this acceptance profile or retire a default-route gap.

All scoped rules MUST be evaluated against one admitted complete authority cut.
If any scoped condition is U, the decision is `indeterminate` and MUST refuse
effects/disclosure. Otherwise, permission holds exactly when at least one permit
is T, every require is T, and every forbid is F. No scoped permits means `deny`.
An empty require set imposes no additional restriction. Denial overrides grants;
mandatory requirements cannot be bypassed by another permit or a broad native role.
Rule order MUST NOT change the result. No fallback to privileged identities.
For collection operations, incomplete dependency coverage or any scoped U decision
refuses the entire operation before output. Silently omitting uncertain rows cannot
satisfy counts, paging, aggregates or completeness. A partial-result profile would
need separately versioned semantics and is outside 0.1.0.

### Disclosure and query use

Dispositions are `original`, `withheld` or `transformed`. A transformed field
references a versioned typed deterministic transform and explicit output type.
The initial interpreted transform subset is a typed constant replacement;
other transforms are preservation-only until separately qualified. Withheld
values cannot enter public diagnostics. Disposition metadata MUST distinguish
original null, original absence and redaction; lossy SQL-null transport alone
cannot satisfy that obligation.

Only scope-matching permit rules whose conditions evaluate T contribute
disclosure obligations. False permits contribute none. Every protected output
field MUST have an explicit admitted disposition; omission refuses disclosure.
Unprotected fields default to original only when explicitly classified as such
by the model/profile. Original is the least restrictive disposition and does not
cancel a transform. Withheld dominates original/transformed;
different transforms on the same field produce `conflict` unless an explicit
versioned composition is qualified. Omitted obligations do not cancel existing
ones. For every field/action profile, predicate/order/group/join/aggregate use
MUST select `disclosed`, `original-authorized` or `prohibited`; omission means
`prohibited` for protected fields. `original-authorized` needs a separate exact
action permission. Disclosed-mode operators using withheld values refuse. Canonical data is
never overwritten by a read mask (see §Field protection catalog for the
write-side rule and the statement-level refusal distinction).

### Writes and time

Create requires proposed-state permission; delete requires original-state
permission; update requires both plus each changed field's mutation permission.
Changing ownership or policy attributes is a separate declared action, even if
ordinary field update is permitted. Authorization and write effects MUST share
the selected transaction/authority ordering from CONTRACT-063.

Current policy and current subject assignment authority apply to selected
historical data. Resource ownership comes from that data version's retained
context, not a reused key or today's owner. Historical-policy replay requires a
separate administrative action/profile. Missing retained context refuses access.
Derived collections, feeds, exports and caches MUST declare source dependencies,
policy propagation and revocation behavior; filtered feeds cannot claim complete
source replication. Private authorization/integrity observation grants no public
read permission on the observed records.

## Precedence and Compatibility

No core members or native security semantics are replaced. Exact extension,
policy, ontology and binding versions are pinned together. Unknown versions
permit preservation but block interpretation. Changes to composition, time,
unknown handling or disclosure require a versioned semantic change and explicit
migration/rollback; rollback MUST NOT broaden access. CONTRACT-063 cannot weaken
this contract, including in fidelity report mode.

## Error Semantics

| Condition | Outcome | Recovery |
| --- | --- | --- |
| Well-formed, complete policy denies | deny | Change authorized policy/facts |
| Unknown, missing, stale, untrusted or incomplete facts | indeterminate | Supply fresh admitted facts |
| Invalid references/types/shape | invalid | Correct document; retain original |
| Unsupported target obligation | unsupported | Select qualified profile |
| Incompatible masks | conflict | Explicit composition or revised policy |
| Bound exceeded | resource-exhausted | Explicit larger qualified bound |

Only `permit` with all obligations successfully admitted authorizes effects or
disclosure. Public errors are coarse; privileged evidence retains original reason
without exposing hidden assignment identities, counts or values.

## Examples

### Serialized ontology and term resolution

The representation schemas are `spec/extensions/security/schema.json` and
`ontology.schema.json`; the policy schema is also embedded in the registered
extension package. The document-scope extension payload is the policy itself.
An explicit resolution argument carries `{ontology,documents}`; documents are
`{revision,document}` entries, each an exact current core 0.10.0 document. Neither URLs
nor display names fetch or resolve a document. Duplicate document IDs, missing
pins and revision disagreement refuse interpretation. Immutable revision
provenance remains a host responsibility, not an authored string certificate.

Ontology is `{version,documentId,revision,documents,subject,entities,
associations,context,actions}`. `documents` pins `{documentId,revision}`;
`subject` is a qualified entity type; `context` lists qualified context fields;
actions are exact string IDs. Each entity is `{type,keyId,fields}`. `type`
resolves to a logical core Record and `keyId` to an explicit stable Key. Every
Record member has exactly one `{ref,protection,queryUse?}` classification,
where protection is `protected` or `unprotected`. Query use maps the five
operator names to the disposition-use modes above. Omitted protected-field
operator entries mean prohibited.

An association adds `endpoints:[{role,target,fields}]`. Roles are unique. Each
ordered field list consists of association Record members and supplies exactly
the target type's Key components, with matching declared domains. This is
logical association meaning; it does not claim foreign-key enforcement or
choose a junction-row, edge, or storage implementation. Both representations
bind to the same Record/Key/endpoint identities. It need not adopt DDD semantics.

Terms use `kind`. Subject/resource terms select either `identity:true` or one
qualified `field`. Context selects a declared `field`. Variable adds `name`
and selects exactly one of `identity:true`, `field`, or `endpoint` (role ID).
Constant is `{kind:"constant",field,value}`, with `field` declaring its exact
UMF literal domain. Bound-variable shadowing is refused. An identity term's
declared type includes its exact qualified Record and stable Key; identity
equality never compares only tuple bytes. Scalar equality requires matching
declared scalar, cardinality, nullability, facets and allowed-value domain.
The first interpreted scalar domains are singleton boolean, string, integer,
explicit precision/scale decimal and binary. Float, temporal, collection and
record-valued comparison requires later qualification and is refused now.

Disclosure serializes as ordered `{field,disposition}` entries with unique
qualified fields. Constant replacement is `{kind:"transformed",
transform:"constant",version:"0.1.0",field,value}`: its field declares the
output literal type. Output type may differ explicitly from canonical type;
that distinction must survive disclosure encoding and query-use admission.

`readSecuritySource`/`writeSecuritySource` preserve arbitrary bounded JSON/YAML
content, including unfamiliar versions/operators. `inspectSecurityPolicy`
retains copied source and reports valid/complete separately. Registry inspection
without the explicit resolution package always reports incomplete closure.
`requireSecurityInterpretation` refuses any invalid/incomplete interpretation.
These APIs do not authenticate facts or authorize a native operation. Native
archives are opaque retained data and never evaluated as code.

The Staff restriction is a require rule on read of ProjectResource:
`exists Ownership o where o.resource == resource.id and exists Assignment a
where a.staff == subject.staff and a.project == o.project and a.active == true`.
This chooses any qualifying owner; deployments requiring every owner MUST state
that alternative and a nonempty-owner condition. A separate permit grants the
read action. Assignment is independently inspectable by the trusted authorization
provider without implying that the reader can list Assignment data.

## Host fact-cut execution profile

The first browser-compatible execution profile is bounded, nonrecursive read
access over host-attested facts. A fact carries a qualified type, ordered core
Key tuple, explicit field/value entries and explicit known-absent fields. Key
field values, when supplied, MUST equal their tuple components. Duplicate facts,
fields and contradictory absence declarations refuse admission. Across subject, fact
inventory and requested resource projections, all known values for the same
qualified core key identity and field MUST agree under the existing typed literal
equality. Missing fields remain unknown; explicit absence is known and differs
from null. Consistent partial projections may overlap without inventing missing
attributes. This check does not authenticate the cut or prove complete inventory.
The implementation retains input references rather than expanded numeric equality
strings; it makes no total-process memory claim.

A fact cut carries exactly one resolved subject, policy and ontology revisions,
current/expected authority generation, association/type coverage and typed
context. Complete inventory and complete relevant attribute coverage are
separate obligations. Empty associations are meaningful only with complete
inventory. Every scoped dependency is admitted before expression evaluation,
including for empty resource collections. Bounds admit at most 10,000 facts
and 1,000,000 evaluation steps; deployments may select lower bounds. Exceeding
any bound refuses the entire collection.

`evaluateSecurityAccess` returns a decision and selected disclosed fields.
`evaluateSecurityCollection` omits denied rows and atomically refuses on any
indeterminate decision or disclosure conflict. It exposes no hidden fact keys
or input ordinals. Original null, known absence, withholding and typed constant
replacement remain distinct. Protected query-use admission covers predicate,
order, group, join and aggregate; original use requires an independently granted
separate action. These APIs admit semantic query use; they do not execute SQL
or establish that a backend evaluates operators over the correct representation.

`trusted`, revision and generation strings are host attestations, never
credentials. The caller MUST independently establish authenticated principal,
immutable registered policy/ontology provenance, compatible current fact cut,
complete inventory and authority generation. Client-authored flags or a matching
pair of generation strings cannot establish any of those obligations. Native
bindings MUST enforce this boundary and CONTRACT-063 lifecycle controls. The
read evaluator does not provide native authorization, write admission, history,
cache revocation or final-release synchronization.

## Immutable in-process read registration

`SecurityReadRegistration` is a bounded trusted-host helper. It admits only
complete policy interpretation, copies the admitted definition, and pins exact
canonical content under policy ID/revision, ontology document ID/revision and
each core document ID/revision. Reusing any registered identity with different
content refuses atomically; failed registration MUST preserve prior definitions.
This includes changing classification under an unchanged ontology revision.
Opaque handles select definitions only within the owning registration instance;
forged or foreign handles refuse. Input mutation cannot modify registered meaning.
The profile bounds 32 definitions, 512 pinned identities and 16 million retained
characters. It is browser-compatible and contains no I/O or credential provider.

The host MUST control construction and registration and independently establish
native source provenance/current authority. A handle is not a native credential.
A new registration instance does not establish freshness or globally reconcile
source revisions. Fact cuts still require the independently authenticated host
provider and CONTRACT-063 guards. Source-authored issuer/native-role flags never
supply those obligations.

## Non-Normative Notes

The initial proof fixture uses one owner per resource and an exact trusted Staff
identity. It does not establish all expression, disclosure or lifecycle behavior.
General semantic implementation and backend qualification remain separate gates.

## Bounded write-admission profile

`evaluateSecurityWrite` admits create/proposed, delete/original, or update/both
states, without executing effects or returning private fields. A trusted host
binding supplies the exact target type, distinct create/update/delete action IDs,
a complete field-to-mutation-action mapping, separate ownership and policy-change
actions, policy/ownership fields and declared ownership association types. Those
special actions must differ from object and field actions. Source-native archives
cannot supply or override this binding. Every target field must have complete
coverage and a typed known value or explicitly known absence in each supplied
state. Exact literal comparison distinguishes null, absence and changed values.

Both update states must use the same subject, current policy/ontology, context
and authority generation. Changed non-ownership authorization facts refuse;
changed declared ownership association inventories require the separate ownership
action on both states. When a changed inventory belongs to the policy dependency
closure, it also requires the separate policy-change action on both states.
Create/delete bindings with such ownership inventories require both actions. Create/delete with declared ownership associations also
require it. Every selected object, field, ownership and policy action is composed
independently on the selected state(s); any unknown result refuses the write.
The profile bounds distinct field actions to 64 and divides each state's step
budget across all checks. Unknown binding members and missing field mappings
refuse rather than weakening admission.

The host MUST derive original/proposed states, classify every ownership and
policy attribute, authenticate facts and prove that the checks and actual effects
share the CONTRACT-063 transaction/authority boundary. Policy attribute writers
must advance current authority through a qualified change protocol. This API
supplies only a semantic decision; it does not prove native atomicity, mutation
custody, field enforcement, current source provenance or concurrency participation.

## Typed policy dependency closure

`securityPolicyDependencies` requires complete typed interpretation and returns
qualified live attribute and association-inventory dependencies. Attribute reads
include subject/resource/context/bound-variable fields, every key component used
by an identity operand, and association endpoint components plus their target
key components. Constant literal-domain references are metadata, not live reads.
Every exists expression contributes its exact association inventory. Closure is
conservative across all scoped rule targets and preserves qualified identity.
Unknown/incomplete meaning refuses; it cannot yield a complete-looking inventory.

A write binding MUST classify every target field in this dependency closure as
a policy attribute requiring the separate policy-change action. An association
create/delete also requires it when that association inventory is used by a
policy. Additional host-classified policy attributes remain allowed. Backend
bindings must account for external/native authority attributes and all writers;
this source analysis cannot establish native custody, complete role inventory,
clock participation or facts from an authenticated provider.


### Identity and endpoint transport dependency closure — 2026-10-11

`securityIdentityTransportDependencies` is an extension-owned pure metadata
operation over the original interpreted security0.1/core0.8 record/association
subset. Preserve policy-read dependencies separately. Select subject, rule-target
and existential-association records, then reach their declared endpoint target
types to a finite closure. Include each selected record's declared core Key and
all selected endpoint components. Preserve key component order, endpoint role
order and exact document/module/element references; source labels and native row
positions cannot reconstruct identity. Return per-record keyId/keyFields/endpoint
metadata plus a conservative field union, retaining original policy associations.
This also covers association resource targets and nested association endpoints.
Unknown/incomplete original interpretation refuses without source mutation.

The Staff/Project/Resource fixture has eight policy-read fields but ten identity
transport fields: assignmentId and ownerId are additional instance-key components.
Salary remains outside this identity/policy-read closure. Keep disclosure, query,
additional attribute validation and complete trusted fact construction separate;
this operation neither authenticates a producer nor admits a physical mapping.
Backend compilers must map the original ordered key/endpoint requirements, not
invent identities from row ordinal, hash alone or labels. Core Key meaning is
reused; no new core security admission or storage worldview is introduced.


## Typed comparison of write authority states — 2026-10-13

The selected record-ontology write evaluator compares original/proposed subject, context and authority inventories by original core typed key tuples and qualified field literal meaning. Reordering entries or using equivalent exact numeric/binary carriers does not itself change authority. Projection field sets remain exact across states: omission, explicit absence and null are distinct. Duplicate normalized identities or field declarations refuse; comparisons never fill another projection's missing fields. Actual changed ownership and policy-used inventories still require their separate actions on both states.

A separate comparison ledger bounds selected row/field operations by the minimum supplied state step budget (maximum1,000,000) and normalized/reference text by4,000,000 UTF-16 code units. Core encoders and literal validators perform their own bounded work before output is charged. This ledger is not a total heap, preallocation or CPU bound. Expanded scalar identities are not retained for complete inventories. Retained exact-source regression, discriminating payload, browser and conditional formal evidence: `../../04-build/evidence/security/write-comparison-20261013/receipt.json`. Native state derivation, physical write/effect correspondence and authenticated host binding remain separate requirements.

### Query-action profile boundary — 2026-10-13

The low-level semantic evaluator interprets `originalAction` as a trusted request assertion. It does not designate which separate action belongs to a field/operator. A caller-controlled request MUST therefore pass through an exact source-bound query profile before evaluation or execution. Weft owns the existing `weft.security.query-profile/0.1.0` binding of target, field, operator and designated original action; UMF MUST NOT introduce a competing compiler/profile designation. The profile pins original policy/ontology/model/mapping sources and rejects unrelated caller annotations. Its source-byte match is not authentication of the profile issuer or proof of native mapping.

An original-source diagnostic demonstrates that all five operators can select a separately granted unrelated action at the unprofiled UMF evaluator. The externally intended designation in that diagnostic is deliberately absent from the ontology; this is not a native bypass or a defect in the profile-bound Weft path. B08 requires the actual installed backend to consume derived query lineage and the original admitted profile, refuse substitutions/source drift before issuing SQL, and qualify actual native disclosed/original/prohibited operator behavior. Existing low-level S08 checks alone do not close B08.

## Field protection catalog and 0.2.0 disposition reference — 2026-10-14

**Status:** proposed normative text applied by owner direction on 2026-10-14
(proposal P-D of the [field-protection plan](../../04-build/security-field-protection-plan.md)).
It governs FEAT-008 SEC-13, SEC-14 and SEC-15. Catalog and transform interpretation in this section remain unimplemented.
The internal `protection/source.ts` foundation now preserves unknown source
content through the existing bounded JSON/YAML profile; it neither validates a
catalog nor grants transform interpretation. The interpreted surface remains
`umf.security` 0.1.0 with the `constant/0.1.0` transform. Planned semantic cases S13–S25 and the raw-backend
P-cases are `not-run`.

### Protection document (`umf.security.protection` 0.1.0, proposed)

A protection document is `{vocabulary:"umf.security.protection",
version:"0.1.0", id, revision, transforms:[Transform], native?}`. `id` and
`revision` are nonempty immutable identity strings; `native` is an opaque
retained archive, never executable authority. `transforms` holds at most 256
entries with unique `{id,version}` pairs. Transform MUST contain:

| Member | Shape | Rules |
| --- | --- | --- |
| `id`, `version` | nonempty strings | Unique in the document; referenced from `umf.security` 0.2.0 dispositions as `{vocabulary,transform,version}` |
| `kind` | `mask` \| `generalize` \| `hash` \| `tokenize` \| `encrypt` | Closed in 0.1.0; an unknown kind is preserved and blocks interpretation |
| `inputDomain`, `outputDomain` | qualified Field references declaring exact literal domains | Output MAY differ from the canonical type; the distinction MUST survive disclosure encoding and query-use admission |
| `determinism` | `deterministic` \| `random` \| `keyed-deterministic` | A fact about the transform, not an authored preference |
| `reversibility` | `none` \| `keyed` \| `vault` | `keyed`/`vault` require `custody` and a `reverseAction` action ID distinct from every read, field and original-authorized action |
| `disclosureProfile` | set drawn from `equality`, `order`, `prefix(n)`, `suffix(n)`, `length`, `format`, `nullity`, `range(bucket)`, `cardinality` | Authored retained properties; an absent property means not retained |
| `queryUse` | per operator (`predicate`, `order`, `group`, `join`, `aggregate`): `disclosed` \| `original-authorized` \| `prohibited` | Omission means `prohibited` |
| `parameters` | typed constants using existing exact literal carriers | At most 32; each literal at most 4,096 UTF-16 code units |
| `custody` | `{owner, vaultRef?, keyRef?, formatPreserving, storageEffect:"stored-transformed", propagation:{history,snapshots,exports,feeds,caches}}` | Required for `tokenize`/`encrypt`; every propagation member is an explicit declaration; UMF validates presence and shape only |
| `function` | for `mask`: `constant`, `partial`, `fixed-length-redact`, `regex-replace` (declared pattern), `null-out` | `null-out` is still `transformed`: it discloses a typed null that disposition metadata keeps distinct from canonical null |

`generalize` declares one of `range-bucket`, `truncate-date` or `prefix-only`
with its parameters. `hash` declares `algorithm` and salt custody (`none` or
`keyed`); an unsalted hash is admitted only with `equality` retained and a
mandatory dictionary-attack warning obligation in the receipt.

### Concrete catalog wire shapes — 2026-10-15

The proposed catalog uses the following serialized shapes. These refine the
members above; they do not add an executable transform or a native permission.
Qualified references are `{documentId,moduleId,elementId}` with exact nonempty
strings, reusing the existing security Field-reference carrier. Domain resolution
requires the original revision-pinned core documents; a reference alone is not a
validated domain.

- `parameters` is an array of `{name,field,value}`. Names are exact, nonempty
  strings and unique within a transform; `field` is a qualified Field reference
  and `value` is an existing core typed literal. At most32 parameters are allowed.
  The canonical JSON encoding of each `value` (sorted object keys, existing core
  literal carriers) is at most4096 UTF-16 code units, including wrappers and
  escaping. This bound also applies to a disclosure bucket's typed literal.
- `disclosureProfile` is an array with no duplicate serialized properties.
  Simple properties are strings: `equality`, `order`, `length`, `format`,
  `nullity`, `cardinality`. Parameterized properties are
  `{kind:"prefix",length:n}`, `{kind:"suffix",length:n}` (positive safe integers),
  and `{kind:"range",bucket:{field,value}}` (the same typed constant carrier).
  Equivalent numeric bucket spellings are not given semantic identity by this
  structural check; exact core domain validation must establish that meaning.
- `queryUse` is an object whose optional operator members have the modes already
  specified above. Missing operators mean `prohibited`. Predicate comparison and
  aggregate input dependencies belong to the actual selected query operation;
  a catalog cannot authorize an arbitrary operator by supplying its own claimed
  dependency. The profile-bound compiler/query validator must establish those
  dependencies before admitting disclosed use.
- `saltCustody` on a hash is `{kind:"none"}` or
  `{kind:"keyed",owner,keyRef}` with nonempty opaque owner/key strings;
  `algorithm` is a nonempty algorithm identifier. A known wire shape does not
  qualify an algorithm implementation or verify custody.
- `custody` has nonempty `owner`, optional nonempty `vaultRef`/`keyRef` (at least
  one is required), boolean `formatPreserving`,
  `storageEffect:"stored-transformed"`, and `propagation`. The latter contains
  all five nonempty opaque declaration strings: `history`, `snapshots`,
  `exports`, `feeds`, `caches`. These are retained unverified native obligations,
  not executable expressions or proof of protection. Optional nonempty
  `vaultWriteAction` identifies the separate write action; absence never admits
  a stored-transformed mutation. Keyed reversibility requires `keyRef`; vault
  reversibility requires `vaultRef`. Both require a nonempty `reverseAction`.

Mask/generalization `function` values are the closed names above; `function` is
not a member of hash/tokenize/encrypt, and `algorithm`/`saltCustody` belong only
to hash. The parameters'
function-specific names, types and relationships must be validated before that
function is interpreted. After the core JSON snapshot (with its own value/depth controls), wire
inspection charges cumulative object-key/string-value text up to4,000,000 UTF-16
units before schema regex validation or canonical literal encoding. Exceeding
that ledger yields `resource-exhausted` with retained source; this is not a
preallocation, total heap or total CPU bound for the preceding snapshot.

Shape inspection does not validate their domains,
function behavior, effective disclosure, action distinctness, native custody or
propagation. Unknown members remain preserved and block complete interpretation;
`native` remains an opaque top-level archive. Typed literals reuse core carriers
rather than JSON Number, including integer/decimal/binary exactness.

### Pure reference function signatures — design refinement2026-10-15

The following closed signatures refine the previously unspecified parameter
names. They are under implementation/review; wire inspection and conditional
property comparison do not admit their execution. Names are exact and the entire
parameter-name set must match; order is immaterial, and no default parameter is
inserted. Every parameter retains its original qualified Field and literal and
must satisfy that Field through the original core checker. Counts use exact
integer literals, not JSON Number or lossy floating-point conversion.

| Kind/function | Required parameters | Value rule |
| --- | --- | --- |
| mask/constant | `value` | Return the exact typed parameter, also checked against outputDomain; never coerce it to the input type |
| mask/null-out | none | Return transformed null; outputDomain must explicitly admit null |
| mask/partial | `prefix`, `suffix`, `padding`, `unit` | Nonnegative counts, exactly one Unicode scalar padding, unit=`unicode-scalar`; retain the first min(prefix,length) scalars, then at most suffix remaining tail scalars without overlap, replacing each middle scalar with padding |
| mask/fixed-length-redact | `length`, `padding`, `unit` | Nonnegative output scalar count, one scalar padding, unit=`unicode-scalar`; return exactly length repetitions |
| generalize/prefix-only | `length`, `unit` | Nonnegative count and unit=`unicode-scalar`; return at most length input scalars |
| generalize/range-bucket | `width`, `origin` | Exact integer or fixed-scale-decimal operands in the same scalar family/decimal scale as input; positive width; return origin+floor((input-origin)/width)*width, with floor toward negative infinity |
| generalize/truncate-date | `calendar`, `unit` | calendar=`umf-gregorian-date/1.0.0` explicitly selects CONTRACT-066; unit=`year`, `quarter`, `month` or `day`; use its exact Field/value rules and validate the output under that same profile |

Before any evaluation, every function must resolve explicit scalar-one input,
output and parameter Fields with known scalar family and nullability, validate
the entire closed signature and every parameter, validate the present input
against its own domain, and validate the final output against its own domain.
Neither constant/null-out nor null propagation bypasses those checks. The
ordinary reference subset uses boolean/integer/fixed-scale-decimal/string/binary
value families; temporal/float domains need a separately selected value profile,
even if a particular null could otherwise pass a structural check. Ordinary
core value semantics own non-temporal checks; only an explicitly selected
CONTRACT-066 date operation may supply its separate date-value recipe. Unknown
value semantics/refinements refuse rather than being caught and ignored.

A partial mask deliberately exposes the entire input when its scalar length is
no greater than prefix+suffix. Zero-length prefix/fixed-redaction returns an
empty string. These are explicit disclosure choices, not confidentiality claims;
no safe minimum redaction or irreversibility is inferred.

All these pure functions require `determinism: deterministic` and
`reversibility: none`; none is a cryptographic irreversibility guarantee. String
functions require explicit scalar-one/string input/output and known nullability.
Numeric buckets require scalar-one input/output in the same numeric family and
scale; declared input, parameter and output refinements remain independently
checked. Domain compatibility does not promise that every possible input yields
a valid output: an output violating its own width/range/allowedValues refuses.
The selected policy disclosure Field and disposition output Field must exactly
match the transform's qualified inputDomain and outputDomain respectively.
Separate references resolving successfully is not a proof of domain inclusion
or applicability; no cross-Field alias/subtyping evidence is admitted by this
reference surface. No field definition is rewritten to make an output fit. Integer bucket outputs use canonical base-ten integer tokens. Decimal outputs
use the exact coefficient followed by `e-` and the declared scale (scale zero
omits the exponent); no fraction passes through a JavaScript Number. Numeric
zero is rendered without a negative sign, while original source spelling remains
retained. Output scalar/domain selection never follows the input by default.

Constant and null-out do not implicitly propagate input null. Other admitted
functions propagate a present null only when both input and output explicitly
admit it. Missing input is not null, and must refuse value evaluation rather
than creating a cell. The output is a typed literal, not a canonical-field write
or authorization grant. Source input/domain identity and output/domain identity
remain distinct and retained even when values compare equal.

Counts are bounded0..4096 and string results must fit the existing4096-unit
canonical typed-literal limit. Output size must be checked before repetition or
big-integer expansion. Exact numeric arithmetic shares the private literal
ledgers and refuses resource exhaustion, never rounds or truncates a value to
fit a budget. Unicode normalization, grapheme clustering and native collation
are not inferred from scalar units.

`regex-replace` remains a declared pattern/replacement operation until a
separately versioned bounded regex engine profile is specified and qualified;
no authored JavaScript regex is executed. Hash, tokenize, encrypt and keyed/vault
operations do not execute through this pure function surface. Their complete
declaration and native-obligation checks remain required in later slices.

Function/value evaluation does not attest authored disclosure-property facts or
actual compiler dependencies. In particular, stable output equality does not
reflect canonical equality, and a displayed order is not an original-value
query rewrite. The conditional property API remains conditional until those
independent obligations and physical bindings are discharged. Full S19 retains
all six named functions and both runtimes; an implementation of only some cannot
promote that case.

### Pure reference API — design refinement2026-10-15

`inspectProtectionFunction(policy,catalog,closure,selection)` accepts exactly
`selection:{ruleIndex,disclosureIndex}` with nonnegative safe integer indices.
`evaluateProtectionValue` accepts the same inputs with exactly
`selection:{ruleIndex,disclosureIndex,value}`, where value is a present typed
literal, including explicit null. Unknown selection members refuse. Both use
the original policy/catalog sources and pinned core closure defined above.

The immutable result retains `policy`, `catalog`, `closure`, `selection`,
`input`, `value`, `inputDomain`, `outputDomain`, `valueProfile`, `diagnostics`,
`complete:false` and `authority:false`. Inspector status is `reference-ready`
or `refused`; evaluator status is `transformed` or `refused`. Refusal always
clears the output `value` to null; successful transformed null is distinguished
by status and retained explicit selection.value. Inspecting without an input
is not a claim that all possible inputs satisfy the output domain.
`valueProfile` names the exact selected Gregorian recipe for date operations
and is otherwise null. Source selection/domain coordinates may remain diagnostic
on refusal; they never activate a function, permission or query.

Literal/resource errors and malformed/unknown shapes refuse with retained
JSON-compatible source and diagnostics. The pure boundary reports
`PROTECTION_FUNCTION`, `PROTECTION_FUNCTION_VALUE` or
`PROTECTION_FUNCTION_BOUND`; original core/domain errors remain identified.
There is no fallback coercion or native-code execution. This is a reference
value operation, not row authorization, native enforcement or canonical data
mutation. `requireProtectionInterpretation` remains closed pending the full
interpreted policy/function/query/native obligations.

### Effective disclosure and query-use admissibility

The effective retained property set is the authored `disclosureProfile` united
with the properties implied by `determinism`: `deterministic` and
`keyed-deterministic` always imply `equality` within one fixed transform,
parameter and key scope: equal canonical inputs yield equal disclosed values.
Collisions may merge distinct inputs; this is stable disclosed equivalence, not
injectivity, equality reflection or a proof of an original-value query rewrite.
Constant masks and colliding hashes are explicit counterexamples to reflection.
This conservative reported property is conditional on qualified function behavior;
a declaration alone is not a proof. `random` implies nothing. An operator MAY be `disclosed` only when
the effective set contains what that operator depends on: `join` and `group`
need `equality`; `order` needs `order`; `aggregate` needs the aggregate's input
property; `predicate` needs the property its comparison uses. A validator MUST
refuse a `disclosed` selection whose dependency is not retained, and a receipt
MUST report implied leakage (for example `equality` on a deterministic token)
even when it is not authored. `random` tokenization therefore cannot admit
`join` or `group` as `disclosed`, even if its authored profile claims `equality`.
This is an explicit stability/admission rule; random output values still have
ordinary equality. Disclosed operators consume disclosed values, not canonical
values. Original-value rewrites require separately qualified owner laws and
authority. These rules derive from the catalog; a
backend's observed behavior never widens them.

### Conditional property requirements and typed declaration checks

`validateProtectionParameters(policy,catalog,closure)` reuses qualified core
resolution and checks every typed parameter and range-bucket literal against
its exact retained Field using the existing core literal checker. It returns
`validated-parameters` or `refused`, retained snapshots, diagnostics and per-source
validation coordinates; failure clears the coordinates. It never assigns a
function's parameter names, arity, type compatibility or output behavior.
Unknown/unsupported literal semantics refuse; no JSON equality fallback exists.

`inspectProtectionQueryProperties(policy,catalog,closure,use)` checks one selected
catalog disposition. `use` is `{ruleIndex,disclosureIndex,operator,required}`;
indices select an actual transformed catalog disposition in the retained policy,
`operator` is predicate/join/group/order/aggregate, and `required` is a nonempty
array of at most32 retained-property instances. Unknown use members refuse.
The operation retains these dependency assumptions. They MUST come from the
actual profile-bound compiler when used in a query; this helper does not attest
that derivation, issue a compiler profile, or accept an original-action name.

Join/group unconditionally add an equality requirement; order adds order.
Predicate and aggregate requirements must be separately derived for the actual
selected comparison/aggregate. A caller choosing a convenient nonempty list does
not establish the real operation's dependencies. Test expectations must specify
those dependencies independently. No prefix/suffix/range entailment is invented:
parameterized properties match exact instances, with range literals checked at
the same qualified Field/revision and compared by original core literal identity.
Equivalent numeric/binary carriers match without rewriting retained source;
null/container/float/temporal equality needs a separately qualified rule.

Effective properties are authored properties united with implied equality for
deterministic/keyed-deterministic declarations. Reports retain authored source,
implied properties, effective properties, required assumptions and missing
properties separately. Missing queryUse means prohibited. Results are
`compatible-properties`, `prohibited`, `requires-original-action` or `refused`;
all carry `complete:false` and `authority:false`. Original-authorized mode never
becomes compatible merely because properties match; the existing designated
action/current-authority boundary remains required. Disclosed random-token
join/group always refuses. Matching properties does not qualify function facts,
ontology validity, raw-value access, query lineage or native execution.

Both public checks use private literal/property work and normalized identity-text
ledgers,100,000 units each per check. Query inspection shares these ledgers across
parameter and property stages. Numeric coefficient cost is charged before core
expansion; encoded key/identity text is checked before retention (encoding scratch
may precede that charge). Core document validation/domain indexing precedes these
ledgers and has its own limits; no total pipeline heap/CPU theorem is claimed.
Resource exhaustion refuses without trimming. Source literal wire bounds remain
32 parameters/4096 canonical UTF-16 units and256 transforms.

### Disposition reference in `umf.security` 0.2.0

A `transformed` disposition MAY reference a catalog transform as
`{kind:"transformed", vocabulary:"umf.security.protection", transform, version,
field}` in addition to the retained `{transform:"constant", version:"0.1.0",
field, value}` form, which is unchanged. The policy pins the exact protection
document `{id, revision}` it references. A reference to an unknown document,
transform, version or kind is preserved and blocks interpretation. Migration
0.1.0 → 0.2.0 is additive. Rollback 0.2.0 → 0.1.0 MUST refuse when any
non-constant transform is referenced, because rollback must not broaden access
(§Precedence and Compatibility). Disposition transport carries `storageEffect`
per field so a consumer can distinguish a stored token from a plaintext value.

### Protection pins and loss-aware representation migration — 2026-10-15

The canonical proposed security0.2 wire schema includes the existing draft
record/relationship-reference grammar and adds protection references. It does
not promote the prototype's typed checker or any0.2 policy to native admission.
The older spike schema remains a preserved narrower prototype subset; no
competing0.2 policy meaning or second compiler designation is introduced.

A policy has at most one optional `protection:{id,revision}` pin, with exact
nonempty strings. A catalog-reference disposition requires this pin. Its
`vocabulary` is exactly `umf.security.protection`; `transform`/`version` name the
exact catalog entry, and it has no inline `value`. The retained legacy constant
has inline `value` and no `vocabulary`. A catalog entry named `constant` is not
an inline constant. Catalog lookup compares the original id/revision and exact
transform/version pair; it never selects by name alone or normalizes labels.
Source resolution returns only coordinates into its retained immutable policy
and catalog snapshots (rule, disclosure and transform indices), not duplicated
transform payload per use. These are source locations, never logical/native
identity reconstructed from row positions. Matching source addresses does not resolve Field domains, establish function
meaning, verify custody or grant an action. The protected target Field and
output Field remain available for later core-domain comparison; their reference
labels alone do not establish domain equality.

Representation upgrade takes a security0.1 source and an explicit nonempty new
policy revision, preserves every other member (including ontology pin, rules,
exact literal carriers and native archive), and changes only version/revision.
It does not perform the separate prototype operation that explicitly rebinds an
ontology. Unknown source content is retained and reported. If an opaque0.1
member collides with newly reserved `protection` or transformed-disposition
`vocabulary`, automatic upgrade refuses with retained source and no target;
unknown metadata must not silently acquire new meaning. Any known/unknown
member-classification change in either direction also requires explicit authoring. Invalid target shape
also refuses rather than deleting content or changing selectors.

Downgrade requires an explicit new revision, a valid0.2 source, no protection
pin or catalog-reference disposition, and an unchanged body representable by
security0.1. It refuses catalog transforms even when their name/version is
`constant`/`0.1.0`, relationship-only selectors and other unrepresentable meaning.
Unused protection pins also require explicit authoring instead of automatic
removal. Unknown members that remain unknown in the destination are retained
with diagnostics; representation migration is not activation. On refusal no
activatable target is returned. Source/target are detached immutable snapshots;
no caller source is mutated. The representation reports `complete:false` and
`authority:false`; all interpretation and binding gates remain separate.

Direct-object representation operations use a private4,000,000 UTF-16 cumulative
key/string ledger after the bounded core JSON snapshot and before schema regex
checks. Target construction is checked against the same ledger. This does not
claim a preallocation, total heap or total CPU bound for the core snapshot.

### Qualified protection core-domain resolution

`resolveSecurityProtectionDomains(policy,catalog,closure)` resolves the exact
source addresses above against a storage-independent core closure. `closure`
is `{pins:[{documentId,revision}],documents:[{revision,document}]}` with at most256
entries in each array. Strings are exact/nonempty. Pins and documents MUST be
in bijection by document id and revision; duplicates, missing, extra or stale
entries refuse. Closure, pin and document-entry unknown members are retained
but refuse resolution. All inputs are detached immutable snapshots. A private
4,000,000 UTF-16 key/string ledger bounds the closure after the core snapshot
and before document/schema validation; it is not a snapshot allocation theorem.

Every document MUST validate as known core0.8 (`valid` and `complete`) using the
core validator. Every qualified reference MUST resolve to an explicit Field,
never an inferred kind, Record, Group or relationship. Resolve all catalog
input/output domains, parameter Fields and range-bucket Fields, including
unused transforms, and every catalog-disposition protected/output Field in the
policy. Unknown policy/catalog meaning refuses even when its address resolves.
A failure clears all resolved coordinates; no partial-success output is exposed.

Success reports `status:"resolved-domains"`, `complete:false`, `authority:false`,
retained `policy`, `catalog`, `closure`, diagnostics and a `domains` array. Each
occurrence is `{source:"policy"|"catalog",path,ref,definition:{documentIndex,
moduleIndex,elementIndex}}`. Paths identify source occurrences; coordinates
identify definitions only inside the retained immutable closure. Qualified refs,
not array order, determine identity. Preserve every distinct input/output Field
and its complete definition, including scalar family, containers, nullability,
facets and referenced definitions. Do not normalize labels or literal carriers.

This resolves known core definitions, not native domains or transform function
applicability. A known core Field may lack a scalar family, have unspecified
availability/cardinality, or represent a temporal/container/record domain whose
literal or function semantics need further qualification. Bare reference roles
remain opaque links; no authored record-type provenance is inferred (CONTRACT-040).
Resolution MUST NOT
invent defaults, equate different domains, check casts by name, qualify parameter
values, admit a function, validate an ontology/policy condition or grant access.
Those gates remain required under the transform and physical contracts. Caller
revision-label agreement is not source authentication or native authority.

### Explicit legacy-body semantic embedding

`evaluateSecurityPolicyV2LegacyAccess` evaluates only a security0.2 policy whose
body is fully interpretable by the security0.1 engine against its admitted
ontology0.1/core-domain subset. It refuses protection pins (including unused
pins), unknown meaning and relationship-only grammar. It constructs a private
semantic view changing only the version tag to0.1, retains the original id and
revision, then requires the existing typed closure and evaluator. The view is
never returned as an installable policy. The retained source remains0.2.

Fact cuts must attest the original0.2 policy revision and current generation;
this operation never refreshes attestations. Missing or incomplete required dependency coverage,
untrusted or stale cuts and unsupported source yield indeterminate with no
output. The result carries `authority:false`; permit is a logical decision,
not a credential, compiler designation or native installation. Existing0.1
public interpretation and native binding gates continue to reject0.2 sources.
This single-resource access operation does not implement general0.2, protection
functions, new ontology semantics, collection admission, current/proposed write-state
validation or query compiler lineage.

### Tokenization, `original` and `reversed`

For a field whose transform declares `storageEffect:"stored-transformed"`, the
canonical physical carrier holds the token or ciphertext. The `original`
disposition keeps its meaning (the stored canonical value), which for such a
field is the token. Plaintext recovery is a distinct `reversed` disposition
obtained only through the transform's `reverseAction`, evaluated as its own
exact action with its own permission. No read, `original-authorized` or field
mutation permission implies `reverseAction`. Key rotation and vault re-keying
are authority-generation changes under CONTRACT-063.

### Write-side rule (SEC-15)

Changing a field requires, for the subject on that field, an `original` read
disposition at the operation's authority cut or an explicitly declared
blind-write permission bound to that field. Comparing the proposed value to
the reader's mask output is neither necessary nor sufficient: a proposed value
equal to a mask output is still refused without that disposition. Mutating a
field declared `stored-transformed` additionally requires the declared
vault-write action. `evaluateSecurityWrite` MUST apply this rule; a binding
MUST refuse or prove impossible any path that writes a transformed or withheld
value back as canonical data. Native column-`UPDATE` denial is defense in depth
for direct SQL only.

### Statement-level refusal is not a cell disposition

A native refusal of a whole statement (for example PostgreSQL SQLSTATE 42501 on
a column privilege) is an operation outcome. It MUST be reported as a refusal
of the operation, never encoded as a per-cell `withheld` disposition, and a
profile MUST NOT claim `withheld` delivery from such refusals.

### Preservation and bounds

`readProtectionSource`/`writeProtectionSource` preserve arbitrary bounded
JSON/YAML content including unknown kinds and members;
`inspectProtectionCatalog` reports valid and complete separately;
`requireProtectionInterpretation` refuses incomplete closure. Pure reference
evaluators exist only for transforms whose output is fully determined by
declared parameters (`constant`, `partial`, `fixed-length-redact`,
`range-bucket`, `truncate-date`, `prefix-only`); keyed and vault transforms are
declared, not executed, by UMF (NFR-32). Catalog size, parameter sizes and
generated SQL text length carry explicit bounds with `resource-exhausted`
refusal. Public operations MUST execute in Bun and real Chromium without host
APIs.

### Unknowns recorded with this amendment

Package split (one catalog or two), `withhold` as a transform for NULL-only
backends (refused for now), salt custody for keyed hashes, detokenize as action
versus disposition (action selected here, pending Weft query-profile review)
and per-field masks inside shared property bags remain open questions Q1, Q2,
Q11, Q12 and Q14 in the plan. The Draft 2020-12 wire schema at
`spec/extensions/security-protection/` now exists. Internal inspection checks
wire shape, exact local identities, unknown-member paths and canonical literal
bounds; it always reports `complete:false`, and the interpretation requirement
always refuses. Core domain closure, function-specific parameters, query
admissibility and policy/native action binding remain unfinished. This does not
qualify S13–S25.


### Catalog disposition transport 0.2.0 — design2026-10-15

The separate `umf.security.disclosure/0.2.0` codec MUST retain distinctions between
canonical null, absence, withholding, transformed null, changed output domains
and stored token/ciphertext carriers. The existing0.1 codec is unchanged.
This catalog transport profile validates data and source correspondence only;
it MUST NOT authenticate rows, evaluate policy conditions, assert transformation
execution, infer target membership or grant read/reverse/write authority.

The exact envelope is `{version,policy,protection,domains,columns,rows}`:
`version` is `umf.security.disclosure/0.2.0`; `policy` and `protection` are exact
`{id,revision}` pins equal to the supplied policy/catalog. `domains` is an array
of exact `{documentId,revision}` pins in bijection with the supplied core closure
pins, independent of order. Duplicate/missing/stale/extra pins refuse. Source
policy0.2, protection0.1 and core0.8 closure MUST pass exact known-source/domain
resolution and original typed parameter checks. Caller pins are not provenance.

Each ordered column is `{field,storageEffect,storageTransform?,valueProfile?}`.
`field` is an exact qualified canonical Field reference; duplicates refuse.
`storageEffect` is `canonical` or `stored-transformed`. A stored column MUST
supply `storageTransform:{id,version}` selecting an exact catalog tokenize or
encrypt declaration with `custody.storageEffect:"stored-transformed"` and
`outputDomain` exactly equal to this canonical Field. Its distinct `inputDomain`
models pre-storage source data, never a replacement domain for original cells.
Canonical columns MUST omit storageTransform and MUST refuse when this catalog
already declares that Field as a stored transform output. Storage metadata is a
supplied declaration, not proof of native storage/custody. It describes the
underlying column even when a cell is a read-time presentation transform.

Rows are rectangular arrays in column order. A cell is exactly one of:

- `{disposition:"original",value}`: present typed value checked against the
  canonical column Field, including original null when that Field allows null.
  For a stored column this is the token/ciphertext, not recovered plaintext.
- `{disposition:"absent"}`: no value; the canonical Field MUST explicitly have
  `nullability:"absent-allowed"`.
- `{disposition:"withheld"}`: no value, including no disguised SQL-null value.
- `{disposition:"transformed",selection:{ruleIndex,disclosureIndex},outputDomain,
  transform:{id,version},value,valueProfile?}`: nonnegative safe indices select
  an actual catalog-reference disposition in the supplied policy. Its protected
  Field MUST equal the canonical column Field and the selected transform's
  inputDomain; outputDomain MUST equal both disposition.field and the transform's
  outputDomain. Transform id/version MUST agree exactly. The present value is
  checked independently against that output Field. No domain inclusion or
  transform execution is inferred. A transform over a stored token MUST name
  that canonical token Field as its input. `reversed` is unsupported and refuses;
  transport never implies the separately required reverseAction permission.

All qualified refs are exact closed `{documentId,moduleId,elementId}` objects.
Ref and pin string members are nonempty and at most4096 UTF-16 units.
Every column binding and optional profile MUST validate even with zero rows or
only withheld cells. Ordinary values use the original core literal checker,
including refinements and supported containers. A column or transformed-cell
`valueProfile` MAY explicitly select only `umf-gregorian-date/1.0.0` for a
scalar-one date Field with known nullability, no itemType/nonempty references,
facets/default/allowedValues. CONTRACT-066 owns date parsing; no temporal family
label implicitly selects it. Other profiles refuse. The optional column profile
applies to original cells; transformed cells select their own output profile.
No generic float/time/timestamp value semantics are added.

`inspectSecurityDisclosureV2(input,policy,catalog,closure)` returns immutable
`{status,source,batch,policy,catalog,closure,complete:false,authority:false,
diagnostics}`. Success status is `validated-disclosure` with batch equal to the
retained source snapshot; refusal status is `refused` with batch null. Any unknown
member/version/tag, invalid literal, mismatch or exhaustion refuses the whole
batch. No partial accepted rows/cells escape. Bounded JSON source remains in
source on semantic refusal; source-copy failures may return source null.
Unknown content remains preservable using readProtectionSource/writeProtectionSource.

`encodeSecurityDisclosureV2(input,policy,catalog,closure,format="json")` returns
validated JSON or YAML text. `decodeSecurityDisclosureV2(text,policy,catalog,
closure,format="json")` returns the validated immutable batch. Both throw
`SECURITY_DISCLOSURE_V2` on refusal; callers use inspection/raw source operations
to retain refused source. Neither invokes the legacy policy interpreter or a
shadow policy. There are no native calls, key material, SQL or vault operations.

Bounds are256 columns,4096 rows and16384 cells, with no trimming. Each canonical
literal encoding is at most4096 UTF-16 units. A private shared100000 work/retained
identity-text budget spans parameter and all cell checks. A separate4000000
cumulative key/string UTF-16 ledger bounds the retained batch after the original
core JSON snapshot and before semantic checks. Core snapshot depth/value and4000000-unit serialized text limits
still apply; no preallocation or total heap/CPU theorem is claimed. Exhaustion
reports `resource-exhausted` and returns no validated batch. Zero columns/rows
are permitted when all supplied metadata is valid. Array order is retained;
identity never depends on delimiter concatenation or Unicode normalization.


### Source-owned action purposes — draft ontology0.2 refinement2026-10-15

Action IDs and policy grants MUST NOT be treated as action-purpose declarations.
A rule MAY legitimately grant a reverse action. Names such as `read` or `reverse`
are exact opaque IDs; their spelling MUST NOT select purpose. Native/caller
archives and request annotations MUST NOT supply missing purpose closure.

The canonical proposed ontology0.2 schema at
`spec/extensions/security-v0.2/ontology.schema.json` MAY add
`actionPurposes:[{action,purposes}]`; the narrower historical spike schema is
retained separately, not a competing admitted meaning.
When present, the array MUST be an exhaustive bijection to that ontology's
`actions` set: one entry for every action and no duplicate/missing/extra IDs.
It contains1..256 entries; action strings are nonempty, at most4096 UTF-16 units,
exact and scoped by the ontology documentId/revision. `purposes` is a nonempty
unique array drawn only from `read`, `field`, `original-authorized`, `reverse`,
`vault-write`, `other`. A reverse or vault-write entry MUST contain exactly its
single purpose, excluding every other purpose. `other` MUST also be a singleton;
it explicitly means outside these protected operation classes, never unknown,
unspecified or a default for an omitted action. Ordinary-purpose combinations
remain subject to the owning operation profile's existing distinctness rules.
Unknown members or purpose values remain preservable source and refuse checking.

Absence retains the older draft ontology behavior; it does not establish purpose
separation. Migration MUST NOT invent purposes from names/grants/defaults. A new
purpose/obligation check MUST refuse when a complete purpose closure is absent.
Whole draft ontology checking MUST validate these rules whenever the optional
member is present; malformed purpose declarations MUST NOT be ignored.
The ontology remains a draft; this addition is not core or native admission.

`inspectSecurityActionPurposes(ontology,documents)` resolves that exact draft0.2
ontology and its original immutable model-document entries, then requires its
complete action-purpose closure. It returns immutable `{status,ontology,documents,
purposes,complete:false,authority:false,diagnostics}`. Status is
`resolved-purposes` or `refused`; refusal clears `purposes` to an empty array,
never returning a partial accepted classification. JSON-compatible source is
retained; snapshot failures may retain null sources. Core JSON value/depth limits
and a private4000000 UTF-16 cumulative key/string ledger apply before checking,
with explicit `resource-exhausted` refusal and no trimming. This is not a total
preallocation/heap/CPU theorem. The operation never evaluates policy grants,
executes reverse/vault operations or returns a credential.

Purpose closure states authored intent only. Before any0.2 operation admission,
each operation owner MUST check the actual action IDs derived from its original
source-bound profile against the declared purposes. A normal read action must
be declared read, a trusted field-action mapping field, and a Weft-derived
originalAction original-authorized; missing/unknown/incompatible purposes refuse.
CRUD/ownership/policy operations retain their existing owner contracts and may
not be relabeled as reverse/vault-write/other to skip those checks. Weft alone
continues to own target/field/operator→originalAction designation. This taxonomy
MUST NOT add a competing binding or accept a caller-provided list as proof of
all actual routes. Native current-authority/custody, profile inventory completeness,
source authentication and compiler use still require their own evidence.

A reverseAction must resolve to a reverse-only action in this exact ontology;
a declared vaultWriteAction must resolve to vault-write-only. These checks do
not reject rules that explicitly grant either action, and they do not imply
that a subject holds those grants. Ordinary/original access returns the stored
canonical token, never plaintext recovery. S21-S25 remain required until their
actual obligation/evaluation paths are independently exercised and admitted.

### Declared protection obligation report — draft2026-10-15

`inspectProtectionObligations(policy,catalog,closure,ontology)` combines the
existing exact source/domain/parameter checks with the complete draft0.2
ontology purpose closure above. The policy's ontology documentId/revision MUST
match exactly; every policy action MUST belong to that ontology. Every selected
catalog disposition's protected/output Fields MUST equal its transform domains.
Every catalog transform is checked, including unused declarations. No policy
condition is evaluated and no actual operation-owner designation is inferred.

A hash MUST declare a nonempty algorithm and known none/keyed salt custody.
Unsalted hashes MUST retain effective equality (authored equality or the existing
determinism-implied equality) and produce the mandatory dictionary warning.
Algorithm and salt custody remain unverified declarations; no hash recipe runs.
Tokenize/encrypt MUST carry the existing complete stored custody shape, including
all five explicit propagation strings. Opaque declarations are retained, not
parsed as programs or treated as proof of propagation/revocation behavior.
Unknown source members/versions/purpose meanings refuse; an opaque declaration
string is not an unknown operator. Consumer validation of its actual meaning
and enforcement remains required under CONTRACT-063.

Keyed/vault reversibility MUST name a reverse-only action in the exact ontology.
A reverseAction on reversibility none refuses as contradictory. A supplied
custody.vaultWriteAction MUST name a vault-write-only action; its absence never
permits a stored mutation. Explicit policy grants for either action remain valid
source and MUST NOT be mistaken for ordinary read/field-purpose designations.
No ordinary/original disposition implies either grant or performs reversal.

The immutable result retains `policy,catalog,closure,ontology,purposes,diagnostics`,
`complete:false`, `authority:false`, `status:"declared-obligations"|"refused"`
and `obligations`. Refusal clears all obligations, without partial accepted
reports. An obligation is exactly `{transform:{id,version},kind,status:"unverified",
declaration}`. Kinds and declarations are:

| kind | declaration |
| --- | --- |
| hash-algorithm | `{algorithm}` |
| salt-custody | Original saltCustody object |
| dictionary-attack-warning | `{code:"UNSALTED_HASH_DICTIONARY_ATTACK",warning}` with a mandatory dictionary-attack warning string |
| stored-custody | Original complete custody object |
| propagation | `{channel,declaration}` for each history/snapshots/exports/feeds/caches string |
| reverse-action | `{action,reversibility}` |
| vault-write-action | `{action}` |

Order follows catalog order, then the table's applicable hash/custody/propagation/
write/reverse sequence; propagation channel order is history, snapshots, exports,
feeds, caches. There is no enforced/qualified outcome. This is not a BindingReceipt
or a credential, and all native obligations remain unverified. Existing per-source
snapshot/text/parameter budgets and the purpose-context bound apply independently;
no total pipeline resource theorem is claimed. Errors retain their original
source codes or `PROTECTION_DECLARATIONS`. The complete crypto/function/query/
policy/native gates remain separate; requireProtectionInterpretation stays closed.


### Mandatory legacy write read-protection binding — design2026-10-15

The previously admitted0.1 writer evaluated only mutation actions with empty
outputs; it could therefore permit changes to withheld/transformed Fields.
A retained actual-evaluator counterexample includes proposed==mask output.
This violates SEC-15 and must be corrected in the existing entry point.

SecurityWriteProfile MUST additionally contain source-owner supplied
`readProtection:{version:"umf.security.write-read/0.1.0",readAction,blindWriteActions}`.
No omitted/legacy/default binding establishes permission. The profile, including
this component, is trusted owner input and MUST NOT be accepted from a client or
policy archive. No string spelling or grant list infers either designation.
Unknown members/versions, missing components, undeclared actions and malformed
bindings refuse. This version denotes only the legacy0.1 read-disposition guard,
not general catalog/ontology0.2 interpretation.

The exact readAction MUST belong to the ontology. blindWriteActions is an explicit
array of at most4096 `{field,action}` entries, with at most one entry for each
Field of this exact target type. Every action MUST be declared and MUST differ
from readAction, all CRUD/normal field/ownership/policy actions. Multiple explicitly
bound Fields MAY share one blind action; no binding is inferred for another
Field. An empty array explicitly declares no blind-write action. Ordinary field
mutation permission is still separately required and never becomes blind-write
permission. Existing owner rules govern any ordinary read/field role overlap.

For each mutated Field in each selected state, the evaluator MUST establish a
permitted exact blind action bound to that Field OR a permitted exact read action
whose composed disposition is original for that Field. Create selects proposed,
delete selects original, update selects both, at the existing same-generation
cut. This conservative all-state rule also covers null/absence transitions.
No-op update Fields do not acquire an invented mutation. Canonical absence under
a composed original read is original for this guard, even though cell transport
reports absent. Original null is likewise allowed. Withheld, transformed and
conflicting dispositions are never original, even when proposed data equals a
mask output. The original evaluator's scoped disposition composition MUST be
reused, including true-permit mask collection, withholding dominance and conflict
handling; no second mask composer or caller-supplied disposition is admissible.

A genuinely permitted alternative satisfies this OR even if the other alternative
is indeterminate; malformed/unknown source or binding still refuses preflight.
If neither alternative establishes permission, unknown/conflict never becomes
permit. Capture of original Fields is atomic: a later error discards all captured
Fields. Internal capture callbacks MUST NOT enter the public request/profile API.
The minimum selected-state step allowance is reserved across all possible
ordinary, unique blind-action and read calls in the entire operation, including
both update states; comparison retains its separate bounded ledger. No total pipeline CPU/heap theorem is claimed. This pure decision does
not authenticate a host cut or make native effects atomic.

The correction MUST NOT relax the general0.2/catalog interpretation gate or
represent declared vault actions as permission. Full catalog-aware original
disposition and exact stored-transform vault-write enforcement remain required
for B-SFP-006 and original S24/S25 acceptance; legacy correction alone does not
qualify those complete cases.


### Candidate source-domain fidelity and compact condition IR — 2026-10-15

The draft0.2 candidate typer MUST distinguish a core Field definition from live
Record membership. Typed constants, inline constant output domains and explicitly
allowlisted context Fields MAY resolve from any exact Field in the original
pinned core-document closure, including DTO/domain-only definitions. Such a
reference MUST NOT give that Field subject/resource/witness ownership, introduce
a live Record, or create fact coverage. Live attribute/disclosure inputs still
MUST belong to their exact declared target; context still requires its explicit
ontology.context allowlist and a separately trusted typed runtime value. Record,
missing, foreign and stale references do not become Field domains.

The existing five-family scalar equality profile (boolean/string/integer/decimal/
binary, scalar-one, explicit decimal facets and known semantics) MUST preserve
required versus absent-allowed nullability in its exact domain signature. Nullable
attributes and typed null constants are supported; identity and endpoint Key
components remain required and non-null. Constants still undergo original core
literal validation. A future runtime MUST distinguish known null from absent/
unknown values; this source-typing correction does not itself evaluate facts.

The private compact condition IR MUST reuse the original issued expression's
scoped encoder. Association indices name the exact supplied issued association
table; missing/extra/copied declarations and copied or residual expressions
refuse, including omitted unused declarations. Reordering that same table may
rebase indices without changing lexical occurrence/term custody. Record-member
endpoint Fields and native graph role/side endpoints remain distinct. Opaque
existential witnesses do not acquire Record identity/attributes.

A compact condition retains only its kind and expression; source archives belong
to the containing shared program rather than being duplicated per condition.
Compact handles are process-local implementation artifacts, not policy/permission
credentials or independently trusted JSON. Their JSON copies do not gain issuance. A program consumer MUST check the exact
ordered issued association table and original entity/source scope retained for
that compact handle; issuance alone does not establish index/source correspondence.
The original full-source transport remains available and MUST retain byte-meaning
and regeneration checks. This IR alone is not a full0.2 interpreter, fact supply,
compiler/native admission, or S24/S25 qualification.

The private shared-source path MUST capture a complete valid core document as a
detached deeply immutable snapshot before issuing its process-local handle. An
issued ontology root owns those sources and original association checks. Target
scopes MAY share that root and its indexes; copied handles/roots/scopes MUST NOT
gain issuance. Public source transport reads remain detached. The plain-JSON
association preview path retains its existing snapshot and explicitly scoped
qualifier behavior. Shared references reduce source duplication but establish no
aggregate heap/CPU bound, source authenticity, fact coverage or enforcement grant.

### Canonical0.2 logical source compilation — 2026-10-15

A private canonical compiler MUST consume the original0.2 policy and exact pinned
ontology/core closure. It MUST NOT rewrite it to0.1, fabricate selected rules for
unused transforms, invent graph endpoint Fields, or treat checked source as an
authority credential. Unknown required policy/catalog meaning, residual conditions,
missing source pins or invalid unused definitions MUST refuse the entire program.
No partially compiled handle may escape. The general public interpretation gate
remains closed until the full admitted runtime and enforcement contract is met.

A policy with a protection pin MUST use its exact catalog and validate all typed
parameters, all pure function definitions (including unused ones), actual selected
input/output domains, and declared non-pure/reverse/vault obligations. Definition
checking MUST reuse the selected function recipe checks and one private work/text
budget across the entire catalog. It must select an actual definition by safe
index, without inventing a disclosure. Definition applicability does not imply
that every input satisfies output refinements. Non-pure directives remain
nonexecuting and all reported custody/authority obligations stay unverified.

A genuine unpinned0.2 policy MAY compile with no catalog (explicit null). It MUST
retain actual inline constants and original source semantics; it MUST NOT acquire
an unpinned or synthetic catalog. Every disclosure input MUST be a member Field of
every actual rule target. Source-only output domains do not become live members.
Rule IDs, action/target/disclosure identities, declared action membership and
binding endpoint/type correspondence MUST be exact and unique where required.

Before any repeated rule-target normalization, the compiler MUST count the whole
source expression forest and all target expansion. The initial private profile
admits at most4096 source expression nodes,4096 rule-target pairs and65536 expanded
condition nodes. Excess work refuses explicitly before those helpers run. This is
a defined expansion bound, not an aggregate snapshot heap/CPU theorem. Source
key/string text is independently bounded to4000000 UTF-16 units after snapshot.
All selected sources must be known complete core0.8.0; ontology/core pin sets
coincide exactly. Association source indexes and canonical classification checks
may be cached only for their original issued immutable checks/sources.

The compiled process-local handle MUST resolve only by exact private issuance. It
owns one immutable core/ontology closure, the original policy/catalog, definition
and obligation tables, and compact conditions bound to the original ordered
association table and target scopes. JSON copies are not compiled programs.
Compilation alone supplies no Record or graph incidence facts, coverage, current
principal/action authority, runtime decision, original-read/blind-write grant,
vault permission or native admission. FullS24/S25 remain required.

Compilation additionally MUST precharge repeated condition text and a conservative
source-descriptor/domain text bound (including qualified DTO refs and complete Key
components) before normalization. The initial expanded text charge is limited
to64000000 UTF-16 units; literal-only conditions do not acquire operand-domain
charges. This conservative capacity check is not an exact byte/heap estimator.
Original numeric literal normalization and refinements for conditions and inline
disclosures MUST consume one compiler-owned work/text budget across every target
scope, using the existing tracked core checker. A short exponent must not bypass
that ledger. The ledger is distinct from the whole-catalog recipe budget and
does not establish a bound for core source validation or a total CPU/heap theorem.
The explicit binding input MUST remain frozen in the program's source closure.

For the first actions-bearing source subset, the private compiler accepts an
optional sixth `extensionClosure` argument. The ontology resolver accepts the
same closure as its third argument and core-source capture as its second.
`createCandidateCoreExtensionClosure([{id:'umf.actions',version:'0.1.0'}])`
issues a process-local closure using the original `registerActions` semantics
and retaining its exact package manifest. Only that explicit singleton selection
is supported in this initial profile. Missing registration keeps existing
unknown-extension refusal; forged/copied closures, unknown versions, additional
vocabularies and malformed action content cannot become complete core sources.
The original action extension and whole document MUST remain unchanged in the
retained source. The compiler retains the original issued extension closure.

This closure selects local source validation, not source authentication, native
support, action-role membership or permission. No caller-supplied hash, callback
or semantic-ready flag issues it. A fresh private registry is created for each
capture so mutation of another registry cannot widen later captures.
The original exported actions package is a detached deeply immutable snapshot
before any consumer can obtain it; later-consumer snapshots alone cannot defend
against mutation before that consumer loads. Issuance and consumption also
compare the current original package with the retained package identity.
Protection catalog/domain stages do not yet consume this additional closure and remain
fail-closed for actions-bearing sources; this increment qualifies the genuinely
unpinned/null-catalog source-compilation path only. Original native owner
bindings, compiler provenance and guarded consumer admission remain required.

### Private preparation source packet candidate (2026-10-15)

The host-only `tools/security/protection-preparation-sources.ts` compiler consumes
closed `PreparationSourceInputs`: exact JSON Artifacts for `policy`, `ontology`,
`coreClosure`, `bindings`, `owner`, `writeProfile`, `subjectMapping`,
`configuration`, `request`, `compileResponse`, `binding`, `bindingEnvelope`, and
`loweringInvocation`, plus `catalog` explicitly null in this first subset.
Each Artifact retains its original UTF-8 text and SHA256. Raw unpaired surrogates,
duplicate JSON members, unknown packet members and mismatched digests refuse.
Original core snapshot/structural limits still apply; transport ceilings of16MiB
per Artifact and64MiB per packet do not widen those original limits or establish
a whole-pipeline allocation/CPU bound.
`bindingEnvelope` additionally retains the exact original serialized binding
Artifact wrapper, not only its contained native JSON. It must decode to the
same `binding` Artifact. Native enrollment comparison uses those wrapper bytes
as well, preserving its original whitespace/order rather than reconstructing it.

The tool invokes the actual canonical source compiler with original actions0.1
registration. It selects only unprotected, unrefined required String Fields,
literal-true permits, original disclosure, equality/conjunction selection and
one bounded set-action frame. Catalog, graph, context, blind-write, policy-change,
ownership-change and other condition/recipe requirements refuse. Predicate-use
prohibited or original-authorized modes refuse; unprotected omitted/disclosed
predicate mode is supported. Unknown original lowering obligations refuse.

The original `umf.security.logical-owner/0.1` and
`umf.security.catalog-write/0.1` declarations supply read, distinct CRUD, policy,
ownership and complete Field-action designations. No action name is inferred
from a rule or role. The selected update requires its separate object-update
and Field-write permits, plus original-read permission in both states; ordinary
Field permission cannot stand in for blind permission. The compiler derives
the read union from actual selection dependencies, ordered Key and assigned
Fields, checks selected ontology/core/native Key correspondence, and retains
native type/property IDs from the original binding. It verifies original
interface/core versions, plan/source/action/recipe/frame/provenance and exact
registration/lowering request/result/parameter/column/order/bound correspondence.
Opaque SQL text is retained, never executed or authenticated by this tool.

The explicit `truss.preparation-subject/0.1-candidate` owner mapping relates the
original ontology Subject's selected single unrefined String Key to
`truss.action_subject_binding.principal_identity` under canonical JSON-string
UTF-8 reference identity and `truss.local-scram/0.1` human classification.
`derivePreparationSubjectKey` checks actual principal bytes and invokes original
`encode-core-key-tuple/3.0.0`, `umf-key-tuple-v1`; it does not reinterpret arbitrary
opaque identity bytes as a Key or infer a Staff Record. BOM, noncanonical bytes,
invalid UTF-8, NUL, unpaired surrogates, refined domains and identity over4096
bytes refuse. This proposal does not qualify the native mapping implementation
or the authenticity/current human status of its input.

Output `truss.preparation-source-obligations/0.1-candidate` retains every source,
selected compiler profile, explicit Subject mapping, native Fields, separate
read/write/action-role requirements and unresolved native obligations. It always
has `complete:false, authority:false`. The original native consumer MUST
authenticate the authored owner/policy/ontology/closure sources and compare ALL
compiler configuration/request/response/binding/lowering bytes with the original
enrolled invocation before use. A supplied digest, copied output, local compiler
success or declared source/module pin cannot issue that provenance or permission.
Current human/action/owner authority, store/program/anchor/nonce/fullxid one-shot
claim, source/DDL/legacy-facade/serving-copy custody, complete preflights and
protected selector/finalizer/effects remain independent native requirements.
The authored products fixture supplies a real logical-write positive and source
refusals; it does not install or activate a Truss guard or qualify whole-system
enforcement. The CLI accepts one bounded packet file and emits this inert JSON
output; Bun/Node APIs remain outside the browser library.


### Private canonical action kernel (2026-10-15)

`evaluateCandidateCatalogAction` consumes only an originally issued catalog-program
handle and snapshots a logical owner, a pinned fact cut, and an action request.
Its `complete:false, authority:false` result is an action/disposition vector, not
a collection publication permit or a native credential. Structural, source,
coverage or operation-budget failure MUST return `refused` with no rows. An
`evaluated` vector can contain deny, indeterminate or conflict rows; consumers
MUST NOT interpret that status as permission to publish data.

The owner declares every live type/Field storage binding. A stored-transformed
Field MUST equal the exact selected storage transform's output domain. Its input
domain is not the stored carrier domain. A declared reverse/vault-write action
provides no permission. Opaque core reference metadata with exact role/module/element
shape is preserved without changing primitive equality domains; record-type
semantics remain unsupported by this scalar/Key profile.

Subjects and resources are selectors into one inventory indexed by original typed
Key encodings. Duplicate normalized identities and contradictory Key projections
refuse. Null is known; explicit absence reads unknown; missing required projections
refuse. Graph incidences have independent completeness and role/attribute coverage.
Record witnesses resolve actual Record facts; opaque witnesses cannot supply Record
attributes or identity comparisons. Distinct parallel witnesses remain distinct.
A complete endpoint inventory does not imply a complete incidence inventory.

All scoped condition dependencies MUST preflight, including false branches and
empty resource requests. Conditions preserve Kleene F/T/U, with existential T
preferred over U over F; a scoped unknown rule makes the action indeterminate.
Effective dispositions preserve withheld priority and exact transform identity
conflicts. Original dispositions require known original Field projections.

The operation admits at most 10000 inventory/request selector entries, a declared
step limit of at most 1000000, and 4000000 key/string UTF-16 units after snapshot.
One runtime literal/comparison ledger spans all rows and nested quantifiers. Each
selected Field, rule and disclosure traversal is step-charged before disposition
composition, including withheld paths. These are explicit operation ledgers, not
a proof of total snapshot/core-validation CPU or heap cost. Dates require the
exact CONTRACT-066 Gregorian value profile. Pure transform Cell rendering, query
use admission, graph-aware write comparison and native authority remain required.


### Private atomic pure collection rendering (2026-10-15)

`evaluateCandidateCatalogCollection` uses the same originally issued catalog
program, single snapshotted owner/cut/request and operation ledgers as the action
kernel. Its owner MUST supply `disclosure:{readAction}`. The exact request action
MUST equal that owner action and its original ontology declaration MUST include
read purpose. Missing purpose closure, incompatible purpose or malformed supplied
disclosure profile refuses even on empty requests. Classification does not supply
a policy grant or authenticate the owner. The action kernel validates the optional
disclosure profile whenever supplied, but does not require one for other actions.

The renderer retains collection semantics: deny rows are filtered in source order;
any indeterminate, conflict, structural, coverage, recipe, output-refinement or
budget failure clears the entire output. It never streams a valid prefix. A
`rendered` result remains `complete:false, authority:false`; it is not a native
query credential. Rows use the existing original/transformed/withheld/absent Cell
forms. Original null remains a present null. Original absence emits absent.
Legacy inline constants remain typed, source-independent output, including when
the original Field is null, known absent or unavailable. Catalog recipes require
a present validated input, including constant/null-out; known absence refuses
rather than inventing a Cell. Present null follows the exact recipe/domain rules.

Only exact compiler-issued pure definition contexts may execute. They retain the
original immutable validated parameters and Field index, never the compiler's
exhausted budget. The runtime derives a recipe from the actual effective catalog
disposition identity, never a caller substitution, and shares one fresh operation
ledger across conditions, rows, recipe input/output validation and retained Cells.
No per-Cell public value evaluator, repeated whole-source validation, crypto,
vault or native function is invoked. Stored original tokens remain stored tokens,
with no input-domain override, reverse operation or implicit vault grant.

All effective per-row rendering inputs preflight before any Cell is retained.
Each requested target with no selected resource rows additionally preflights its
source-scoped potential output dependencies. A literal-true withholding permit
suppresses competing dependencies; a literal-true transform suppresses original
or default-original dependencies. Conditional withholding cannot prove that no
unknown future row needs original data. Potential catalog recipes and profiles
remain checked; legacy inline constants never acquire source-input dependence.
This is a conservative source preflight for empty targets, not an assertion that
all possible source condition combinations were symbolically simplified.

Row/Field output capacity is step-charged before Cell allocation. Retained output
framing, qualified reference strings, escaped string text and profile metadata
consume the same 100000-unit runtime work/text ledgers as fact/value processing.
These explicit ledgers do not establish total snapshot, source preparation, CPU
or heap bounds. Every actual rendered Gregorian value retains its exact output
Field/profile in `valueProfiles`; absent/withheld Cells assert no date value.
Failure clears both rows and valueProfiles. Full S24/S25 write/read/blind/vault
behavior, query-use lineage, native owner/current-authority profiles and all
remaining backend acceptance cases remain required.


### Private catalog-aware logical transaction admission (2026-10-15)

`evaluateCandidateCatalogWrite` accepts only an original issued catalog program,
its exact owner, an owner-bound `umf.security.catalog-write/0.1` profile and a
`umf.security.catalog-transaction/0.1` request. Results are logical decisions with
`complete:false, authority:false`; they are never native credentials or effects
receipts. The profile fixes per-type create/update/delete, exhaustive Field
mutation actions, policy/ownership actions and Field sets, original-read action
and explicit Field-to-blind-action bindings. Ordinary roles require compatible
original source purposes. Blind actions require exactly field purpose and MUST
be distinct from all ordinary/read roles across every type profile. Purpose
classification never substitutes for an actual policy grant.

The profile binds every original association source (record-members or core
relationship), including unused sources, to immutable or owned mode. Owned mode
fixes an owner type and exact endpoint role or Record witness anchor. Every
changed Record, including raw m2m/graph witness Records, MUST have its own listed
mutation and complete guard. No unchecked auxiliary ownership Record exception
exists. Removed and added incidences each require the corresponding listed
owner anchor in the appropriate state, ownership permission and policy permission
when the original conditions depend on that association. Create/delete retains
the conservative ownership check even when the relevant inventory is empty.

Both cuts MUST provide complete typed inventories and all Fields as present or
known absent, and complete independent graph role/witness-attribute coverage.
Original nominal Keys and normalized scalar values determine Record identity and
changes; null and absence remain distinct. The complete selected Subject fact,
context, generation and Gregorian profile selections MUST remain comparable.
Create requires absence/presence, delete presence/absence and update presence in
both cuts; all actual Record deltas MUST be listed. A no-op update still needs
its object action but invents no changed Field.

Record associations compare witness Keys, projections and role-labelled endpoint
Keys. Opaque graph associations compare endpoint multisets, retaining parallel
counts; opaque IDs are deduplication handles within a cut, never cross-cut
identity. An equal multiset proves only equal logical incidence population. It
does not prove absence of physical delete/reinsert, statement intent, triggers
or hidden effects; native implementations MUST establish their own effect closure.

Every mutation requires its object action and every changed Field action, plus
policy/ownership actions where applicable. For each changed Field and required
state, an effective original disposition under an actually permitted read OR its
explicitly bound and actually permitted blind action is mandatory. Mask-output
value equality never supplies original authority. Create checks proposed, delete
original and update both states. Every changed stored-transformed carrier also
requires its selected transform to declare an exact vault-write-only action and
that action to be granted in every required state. Reverse, original-read and
unrelated vault actions cannot substitute; missing declaration refuses.

One monotone operation ledger spans snapshot text, both cuts, typed comparisons,
all action evaluations and original/blind/vault alternatives. It cannot reset or
increase its limit. Exhaustion/structural failure is indeterminate with no effects.
The request allows 1..256 unique mutations, 1..10000 total facts/graphs/mutations,
1..1000000 steps and 4000000 snapshot key/string UTF-16 units; shared literal
limits also apply. These are explicit operation ledgers, not a total CPU/heap
bound. Finite independent S24/S25 evidence qualifies this private semantic guard;
source authentication, query/compiler lineage, native enforcement and physical
statement/effect custody remain separate required obligations.


### Private stored-Field query source inspection — 2026-10-15

`inspectCandidateStoredQueryProperties(program,owner,use)` resolves conditional
query properties for an ORIGINAL canonical stored Field without constructing a
transformed read disposition. `program` MUST be the exact originally issued
catalog-program handle; copied handles refuse. This private operation is not
exported by the public root and is not a compiler or query admission interface.

`owner` retains the existing `umf.security.logical-owner/0.1` shape and complete
live type/Field storage map. Every designation MUST name an actual ontology
member, be unique and preserve canonical/stored-transform distinctions. Unknown
members, incomplete maps, canonical downgrades and mismatched transform outputs
refuse. The optional existing disclosure read action is checked against the
original ontology purpose, but does not grant read permission.

`use` is exactly `{type,field,operator,required}`. The Field MUST belong to that
live type and its selected owner storage designation MUST be stored-transformed,
with exact tokenize/encrypt transform id/version and output domain. The transform's
input domain is not the canonical query domain. Operator/required property bounds
and comparison follow the existing conditional query helper, using the same
literal budget for parameter validation and property comparison. No invented
transformed policy, plaintext override, original-action substitution, custody
verification or reverse permission is introduced.

The detached immutable result retains owner/use, original policy/catalog/closure
and ontology plus a conditional property report on successful source resolution.
A source-resolution refusal has no selection or property report. The result
always carries `complete:false, authority:false`; a successful source selection
may still report prohibited, missing properties or requires-original-action.
Dependency requirements remain supplied assumptions until the existing compiler
owner derives them from actual queries. Owner provenance, actual ORIGINAL read
permission, fixed runtime/key scope, mixed-mode physical integration and native
current-authority/dispatch enforcement remain separate obligations. No P03/B08
case is promoted by this pure source inspector.


### Private complete logical scan candidate (2026-10-15)

`evaluateCandidateCatalogScan(handle, owner, cut, selection)` is a private
reference operation over an originally issued current catalog program. Selection
has exactly `{type, fields}`; caller-provided action, resource selectors, query
predicates, limits, modes and native bindings are not admitted here. The operation
uses the owner's explicitly declared read action and the existing current
collection kernel. It selects every validated fact of the exact target type from
the supplied complete cut, once in original fact order. The caller cannot omit
an inconvenient row or repeat a selector through this operation.

The original complete owner, typed facts, Key identity, coverage, graph witnesses,
source pins and all action dependencies must pass before output. Every candidate
row receives the same current read/disposition evaluation as the collection
operation. Denials filter; indeterminate/conflict, missing coverage, invalid
literals, stale pins, unsupported rendering or exhausted original operation
budgets refuse the whole result. Selection retains original Field order. Empty
Field selection yields one empty tuple per permitted row, making row-read duties
explicit for a field-free aggregate. Empty populations still preflight the full
source-scoped operation and output dependencies.

The result uses the existing collection result shape and always has
complete:false/authority:false. The cut's trusted/completeness assertions remain
external premises, not authenticated native credentials. Selection is not a
compiler-issued readset: Weft must derive exact occurrence-sensitive scan/Field
dependencies from its original AST, and the native consumer must bind those
requirements and actual current authority before execution. This operation does
not parse queries, choose query-use modes, grant original-value actions, perform
aggregates, register a backend, or qualify P03/B08. It is not a public root API.


### Atomic complete logical scan batches — 2026-10-15

The private `evaluateCandidateCatalogScanBatch(handle,owner,cut,requests)` accepts
one original compiled program and one detached supplied logical cut. `requests`
is a nonempty ordered array of at most256 exact `{scan,type,fields}` objects.
`scan` is a unique Weft occurrence label matching `[st][0-9]+`; type/fields are
existing qualified references. Each occurrence remains separate, including self
joins and field-free scans. Requests cannot designate actions, resource subsets,
completion flags or native permissions. The trusted adapter remains responsible
for supplying the whole original compiler-issued population; arbitrary supplied
JSON cannot establish compiler completeness or issuance.

All scans MUST share one operation work, snapshot-text and literal ledger. The
aggregate fact limit charges the original facts/graph witnesses once plus every
target fact visit across occurrences, before rendering. Source, limit or scan
refusal at any occurrence MUST return `status:refused,scans:[]` for the entire
batch, including failures after an earlier positive scan. A rendered result
retains ordered `{scan,rows,valueProfiles}` entries with existing Cell tags and
`complete:false,authority:false`. No result prefix may escape on refusal. Empty
row populations retain preflight/read-purpose obligations.

This is logical read preparation, not query evaluation. Relationship-observation
duties, operator property/mode checks, aggregate semantics and exact compiler
source/AST completeness remain mandatory separate whole-query obligations. A
rendered scan batch alone MUST NOT become executable query admission. Native
source/caller authentication, current-authority guards and final-release custody
remain CONTRACT-063 obligations; no historical mutation cohort is widened.


### Query value origin and domain fidelity — 2026-10-15

A source-bound query program MUST retain the original live Field identity and
core descriptor separately from the effective operator-value descriptor and its
provenance. A read-time transform may change the value domain/nullability. That
output domain MUST NOT overwrite the original core Field or original resolved
query expression. Actual operand compatibility must be checked against the
selected query value; absent evidence or an incompatible comparison refuses.
No implicit retyping, literal coercion, DTO-to-member promotion or raw fallback
may manufacture a matching program.
Value bindings MUST retain scan/source path and operand role/operator occurrence.
One Field can project its read mask while a hidden operand uses a separately
authorized original; a global Field remap MUST NOT expose that original in output. Original null, absence, transformed null
and withholding remain distinct even when a SQL carrier uses NULL.

Disclosed use selects the actual composed read value. Withheld has no disclosed
operator value. Original-authorized use requires the exact Weft-owned designated
separate action, its required source dependencies and current permission; it
selects the original live Field value independently of presentation masking. It
does not acquire reverse/vault permission. For a stored-transformed Field, that
live original is the stored outputDomain/carrier, never its pre-storage
inputDomain. Equal bytes or equal descriptors do not merge these authority paths.
Compiler Field dependency intents are not uniformly public-read requests. The
query adapter must retain every occurrence but route it through row-read,
disclosed-value or exact original-action admission as required. Every scan still
needs row-read eligibility. The existing read-only scan batch must neither force
hidden original operands through the read renderer nor replace public projection
values with the hidden originals.
The preceding withheld-operator wording refers to the disclosed path, consistent
with the existing separately authorized original-value path.

Ontology/operator modes and every applicable catalog/profile constraint remain
independent obligations. Property compatibility cannot override prohibition,
select a different source mode or issue an original-value action. Unknown or
conflicting value-origin obligations refuse until an exact separately versioned
composition is qualified. Missing applicable catalog queryUse means prohibited;
no-applicable-catalog is a distinct source-derived fact, never an omitted member.
All selected gaps and prohibited operators require preflight even for FALSE,
empty populations or LIMIT0. Logical read-batch success alone is insufficient.

A binary operation needs actual paired operand provenance and a qualified common
comparison scope, including relevant transform version/parameters/key/runtime
scope. Per-Field retained equality does not prove that different key scopes are
comparable, nor that a deterministic transform is injective. Equality/grouping
on generalized/hash/token values describes the disclosed value classes; it MUST
NOT be relabeled equality of original values without additional evidence.

Lowering MUST preserve the complete ordered operation metadata issued by Weft,
including per-expression ASC/DESC directions, original aliases, parameters and
limits. A retained expression list or global capability set is insufficient to
reconstruct direction positions. Preserve the original request/report/context
bytes; do not reconstruct absent semantic metadata from convenient defaults.
These are requirements on the next native lowering cohort, not a new public
UMF query compiler, wire profile, native credential or admission claim.

A permission to observe known absence does not define a native scalar operator
encoding. Keep known absence separate from NULL; unqualified scalar conversion
refuses until the operator/presence profile is established. Conversely, a pure
constant mask may produce its valid typed DTO without inventing a live input
where the renderer is qualified to do so. Whole-query value admission must not
confuse read-value availability with original-input presence. Existing permission
helpers and current selected-optional compiler refusals keep their scoped meaning.

### Operator-free conditional read-projection metadata — 2026-10-15

A source-only projection inspector MUST accept the original issued policy
program, validated owner and qualified Type/Field selection without inventing
scan identifiers, query operators, paths or original-use actions. It MUST retain
all applicable read conditions and every permit-source occurrence, including
explicit disposition and original/default/missing/withheld distinctions. Output
Field metadata retains original identity, revision and complete definition.
Stored transformed values refer to their current live Field, never an implicit
pre-storage clear value. Query-use prohibition does not prohibit read metadata.

These alternatives do not select an active rule, prove scalar availability,
compute a uniform output domain or grant permission. Empty-output typing requires
a nonempty set of compatible output projections plus original descriptor
correspondence; actual policy/disclosure folding, eligibility, native authority
and guarded release remain independent. Unknown/conflicting/withheld/missing
output cases cannot become guessed scalar domains. Metadata refusal is atomic.
The initial private helper bounds serialized output including framing to4,000,000
UTF-16 code units; that is not a UTF-8 frame limit or aggregate heap/work theorem.

### Separately versioned private projection transport — 2026-10-15

The optional `umf.security.private-query-child/0.2-candidate` transport carries
operator-free qualified Type/Field projections alongside genuine query routes.
Each closed request and response declares that exact protocol. One actual local
program is compiled from original source input; imported handles refuse. The
sequence initialize → inspect-inputs → evaluate binds the canonical owner, ordered
routes and ordered projections and the full framed initialization receipt.
That receipt correlates bytes; it is not source admission, runtime authority or
a permit. Projection identifiers are distinct from all route identifiers.

Both inspection and evaluation return unchanged original projection metadata.
A completed batch remains separate from permission and a projection alternative
remains separate from an active, uniform scalar domain. Query-use prohibition
does not invent an operator for a plain projection. Missing/withheld/conflicting
outputs and empty populations preserve original source semantics.

The v2 transport has independent artifact/source/consumer custody. Frozen r3
source579675bd and its bundle/registrations remain unchanged. Its protocol cannot
be inferred from compatible framing. Native adoption requires an explicit new
consumer/source cohort, including the changed full initializer bytes/receipt;
no old registration migrates automatically. Requests are bounded to4MiB, replies
to16MiB UTF-8, projections256, routes4096, operations256, scans16 and facts10000.
These transport bounds do not prove aggregate heap/time or native noninterference.


### Private atomic provenance-bearing disclosure batch (2026-10-16)

`evaluateCandidateCatalogReadDisclosureBatch(handle,owner,cut,selection)` and its
`WithinOperation` variant with a final original shared operation ledger MUST use
the original issued program and canonical fold/render path. Selection is the
existing exact `{type,fields}` scan selection. This catalog-only profile requires
an actual protection catalog; existing action, scan, render and selection-only
APIs MUST retain their previous results. No package-root export is added.

The immutable result is `{version,status,complete:false,authority:false,sources,
decisions,resources,batch}` with version
`umf.security.logical-disclosure-batch/0.1-candidate`. Success status is `rendered`.
`sources` and the full ordered `decisions` census retain the selection-only
producer's original metadata, resource keys, rule truths and winning occurrences.
`resources` names only permitted rows in exactly the same order as `batch.rows`.
`batch` MUST be an original `umf.security.disclosure/0.2.0` envelope: canonical
column storage declarations come from the selected owner/type, values come from
the same render operation, and transformed Cells carry the actual first selected
policy occurrence, exact transform/version and output Field/profile. Equal
transform contributors remain in decisions; no caller-authored occurrence is
accepted. Original null, absence, withholding and transformed null remain distinct.

All original rendering preflight and shared work/text/retention charges apply.
The0.2 transport's column/row/cell/literal and source-string limits additionally
apply, including empty populations and withheld-only columns. Catalog recipes
execute only through the original issued pure definition context. Effective
legacy inline transforms cannot be represented by0.2 and MUST refuse atomically;
legacy API behavior remains unchanged. No second policy interpreter or per-Cell
public transformation evaluator may supply the result. Any unresolved row, late
recipe/refinement failure, invalid metadata or exhaustion returns exactly
`{version,status:"refused",complete:false,authority:false,sources:null,decisions:[],
resources:[],batch:null}`, with no accepted prefix.

This is a supplied-cut logical computation and transport producer. It MUST NOT
claim native/caller/source/current-cut authentication, compiler .4 admission,
query operator permission or guarded release. Existing conditional occurrence
and carrier algebra remain separate from implementation refinement evidence.

The full census, source correlations and rule truths are private host/owner
composition material. They MUST NOT be exposed directly to ordinary query
readers or public diagnostics. The separately qualified native release boundary
owns any permitted result disclosure; this private result is not that boundary.
Catalog parameter literals MUST consume the same per-operation literal budget
as rendered values, including unused transforms and empty/withheld batches.
A single original parameter-validation pass per atomic operation is permitted;
per-Cell whole-source revalidation remains prohibited.
