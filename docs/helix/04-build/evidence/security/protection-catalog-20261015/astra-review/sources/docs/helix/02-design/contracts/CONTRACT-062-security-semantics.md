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
---

# CONTRACT-062: Shared security semantics

**Version:** proposed `umf.security` 0.1.0. **Status:** draft; not core admission.
A minor revision `umf.security` 0.2.0 and a companion extension
`umf.security.protection` 0.1.0 are specified in §Field protection catalog
(2026-10-14) as proposed text; neither is implemented or evidenced.

## Purpose

Define logical security independently of relational and node/edge storage.
This contract governs policy meaning; CONTRACT-063 governs enforcement receipts.

## Scope and Boundaries

UMF owns meaning, structural/semantic validation and a pure reference evaluator.
Hosts own authenticated identities, trusted context and complete fact supply.
Consumers own enforcement. Native policy archives remain independently retained.
The first interpreted subset is finite, nonrecursive and exact-typed.

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
action permission. Operators using withheld fields refuse. Canonical data is
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
`{revision,document}` entries, each an exact core 0.8.0 document. Neither URLs
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

### Effective disclosure and query-use admissibility

The effective retained property set is the authored `disclosureProfile` united
with the properties implied by `determinism`: `deterministic` and
`keyed-deterministic` always imply `equality` (equality classes survive the
transform); `random` implies nothing. An operator MAY be `disclosed` only when
the effective set contains what that operator depends on: `join` and `group`
need `equality`; `order` needs `order`; `aggregate` needs the aggregate's input
property; `predicate` needs the property its comparison uses. A validator MUST
refuse a `disclosed` selection whose dependency is not retained, and a receipt
MUST report implied leakage (for example `equality` on a deterministic token)
even when it is not authored. `random` tokenization therefore cannot admit
`join` or `group` as `disclosed`. These rules derive from the catalog; a
backend's observed behavior never widens them.

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
Q11, Q12 and Q14 in the plan. The Draft 2020-12 envelope/identity scaffold at
`spec/extensions/security-protection/` now exists; full transform/domain schema
text and catalog interpretation remain unfinished. Internal inspection validates
only envelope/identity structure, always reports `complete:false`, and the
interpretation requirement always refuses. This does not qualify S13–S25.
