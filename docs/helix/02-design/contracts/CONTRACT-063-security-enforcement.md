---
ddx:
  id: CONTRACT-063
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

# CONTRACT-063: Security binding and evidence admission

**Version:** proposed security binding 0.1.0. **Status:** draft.

## Purpose

Make semantic policy enforcement independently inspectable across raw relational
tables and Truss/Ashlar logical types. Bindings are separate from policy documents.

## Scope and Boundaries

UMF supplies interpretation/admission metadata; Weft owns logical query lowering.
Backend consumers install and execute protected native surfaces. Authentication,
trusted clocks and production administration remain host-owned.

## Normative Surface

BindingReceipt MUST include `profileId`, `profileVersion`, exact `engineVersion`,
`modelRevision`, `policyRevision`, `mappingDigest`, `sourceDigests`, `subset`,
`obligations`, `nativeInventory`, `authorityProfile`, `evidence` and `status`.
`status` is `candidate`, `qualified`, `unsupported` or `invalidated`.
Each obligation names its semantic source path, enforcement site, prerequisite,
evidence case IDs and outcome (`enforced`, `refused`, `unverified`). Only an
all-enforced, current inventory can become qualified. Refusal evidence supports
safe admission behavior, never a positive enforcement claim.

Mapping MUST state qualified logical types, instance/key carriers, each field's
physical carrier, association endpoint roles and complete authorization-fact
sources. One physical bag may hold many logical fields; native column privileges
on that bag do not imply selective property protection. Equal hashes alone are
not identity. Relational table ownership is not logical Project ownership.

AuthorityProfile MUST state original caller capture, trusted attribute issuers,
assignment/policy generation source, complete read scope, current-authority
ordering, transaction isolation, freshness limit, administrative exclusions,
cache/paging invalidation and retained ownership context. Client-asserted names
or completion flags are not evidence. Default freshness permits no stale
authorization cut; a weaker bounded-staleness profile requires explicit separate
policy semantics and owner selection.

Initial current-authority ordering is admission-linearized: an operation holds a
shared authority-generation guard through its final disclosure/write boundary;
assignment/grant/policy revocation takes an exclusive guard and acknowledges
after earlier admitted operations drain. Operations admitted after acknowledgment
must observe the new generation. This permits already admitted operations to
finish before revocation acknowledgment, not afterwards. Database role/policy
DDL and every authorization-fact writer must participate or the profile refuses.
Network delivery after response release is outside the drain guarantee.
Every direct SQL, streaming, cursor and deferred-response path MUST name an actual
admission/final-release boundary and qualified guard participant. RLS alone is
insufficient for this lifecycle profile. Uncoordinated paths MUST be denied.
A protected read admitted after a generation change MUST extract authority facts
from a compatible fresh snapshot; an old repeatable-read snapshot MUST restart
or refuse even if a separately observed generation is new. Generation advancement
covers assignments, roles, policy, subject bindings and relevant attribute changes.
Effective-date transitions require a trusted clock and either a held valid-time
lease or coordinated generation transition; unsupported temporal cuts refuse.
Historical data cuts and current authority cuts are independently identified.
Cursor/cache tokens MUST bind caller, policy/authority generation, mapping,
data/publication cut and query; any incompatible change forces restart.
Publication-lease retirement MUST exclude further admission under that lease,
including stale transaction and statement snapshots. Terminal identifier history
alone is insufficient. A selected native protocol MUST fence retirement against
retained readers and invalidate older eligibility snapshots, or establish an
equivalent independently qualified consumption protocol. Retirement cannot
acknowledge before the declared publication drain boundary.

Mapping MUST pin disposition metadata and its transport encoding, including SQL,
JSON, graph serialization and exports. Missing redaction metadata invalidates a
profile that promises canonical null/absence distinction.

NativeInventory MUST enumerate all reachable table/column/schema/routine/sequence
privileges, memberships, ownership, bypass attributes, definer transitions,
trusted resolution dependencies, direct paths, serving copies, history and feeds.
Ordinary users MUST lack every unqualified bypass path. Privileged installer and
integrity roles are explicit exclusions and cannot be reachable by ordinary
membership, SET ROLE, callable wrappers or shadowed dependencies.

Compiled artifacts MUST retain typed policy predicates, disclosure obligations,
dependencies and refusal reasons. A query-only filter is insufficient when
direct storage access remains granted. Production admission MUST independently
verify installed inventory and source correspondence, rather than trust a
compiler's success flag. Report-mode translation MUST NOT activate a weaker
policy. Unsupported native obligation means no installed profile admission.

EvidenceCase is `{id,covers,backend,layer,command,sourceDigests,versions,
assumptions,expected,observed,status,artifacts}`. `covers` uses stable AC IDs.
`status` is `passed`, `failed`, `not-run` or `blocked`; missing/skip/timeout cannot
be `passed`. Formal cases include formula, solver/version, bounds, assumptions,
result and counterexample controls. Native cases include actual role/caller,
database build, installed inventory and independent observations. Secrets MUST
NOT enter receipts. Synthetic graph mappings cannot qualify Truss or Ashlar.

### Fresh execution gate protocol

The admitted test plan pins each case's exact argv-array `command`, `testSource`,
independent `oracleSource`, nonempty `implementationSources`, backend and finite
`timeoutMs`. Commands MUST execute the fingerprinted reviewed test source,
without shell evaluation. The runner creates a fresh `UMF_SECURITY_RUN_ID` and
`UMF_SECURITY_CASE_ID`, hashes all selected sources before/after execution and
records exit status/stdout/stderr. An old stored receipt never substitutes for
execution. Cross-repository sources use explicitly admitted roots.

The test process returns one JSON result containing `id`, `runId`, `command`,
`backend`, `covers`, `status`, nonempty `versions`, matching `sourceDigests` and
nonempty `observations`. Each observation contains `assertionId`, `expected` and
`observed`; exact normalized typed results MUST agree. Native results additionally
include `nativeInventory.digest`, `nativeInventory.ordinaryActor` and nonempty
`nativeInventory.objects`. Required assertion identities must match the admitted
plan; none may be silently omitted. Timeout/nonzero exit/stale source/missing
coverage or inventory refuses the gate.

This protocol proves execution provenance within trusted reviewed test code,
not that arbitrary code honestly reports the database. Independent native
assessor observations and review of the oracle/runner remain required by the
qualification contract. Never execute runner commands supplied by an untrusted
policy document. The gate is development tooling, not application authorization.

## Precedence and Compatibility

CONTRACT-062 governs semantics. Mapping, policy or native-inventory change
invalidates prior qualification until compatible evidence is reproduced.
Each backend/profile has independent admission; PostgreSQL does not certify
Databricks. Shared semantic support does not require a database to support every
expression. Core promotion remains under CONTRACT-040.

## Error Semantics

Unverified/bypassed/stale composition is `unsupported` or `invalidated`, with no
disclosure/effects. Failed native installation leaves the prior admitted profile
intact or closes access. Rollback preserves protection; dropping policies while
ordinary grants remain is forbidden as a rollback shortcut. Administrative
repair is explicit and must rerun admission.

## Examples

PostgreSQL raw: logical ProjectResource maps to a resource row; Assignment maps
to a junction table; an admitted RLS predicate uses an exact correlated EXISTS.
Truss: the same targets map through registered type/relationship identities and
selected current storage homes. Ashlar: they map through logical identity and
publication-pinned Delta tables; current assignment authority is independently
qualified. Identical predicate intent alone proves none of these native bindings.

## Non-Normative Notes

Databricks table-level row filters/masks cannot satisfy historical reads by
default. The documented ABAC time-travel Beta needs eligible compute, managed
tables, catalog commits and compatible column mapping; actual admission remains
an execution gate: https://docs.databricks.com/aws/en/data-governance/unity-catalog/abac/time-travel
PostgreSQL owners and BYPASSRLS roles require explicit exclusion and testing:
https://www.postgresql.org/docs/18/ddl-rowsecurity.html (PostgreSQL 18 page,
inspected 2026-10-13; the 17 page governed the accepted 17.9 fixtures and
remains historical). The 18 release notes list no RLS or column-privilege
semantic change other than `pg_dump --no-policies`; `RETURNING old/new`,
virtual generated columns and `AFTER` trigger role capture are 18 behaviors
that the PostgreSQL 18 profile must test before any positive claim.

Unity Catalog limitations (AWS documentation copies inspected 2026-10-13;
the Azure/GCP copies differ, so the executing workspace's copy must be
re-read and hashed at execution):
[Row filters and column masks](https://docs.databricks.com/aws/en/tables/row-and-column-filters)
(no filters/masks on views; one filter and one mask per column resolve per
user; no time travel, deep/shallow clone or Delta Sharing on filtered/masked
tables; no path, Delta Lake API, Iceberg REST or Unity REST access; DBR and
dedicated-compute version floors for writes and MERGE restrictions),
[ABAC overview](https://docs.databricks.com/aws/en/data-governance/unity-catalog/abac/),
[ABAC requirements and limitations](https://docs.databricks.com/aws/en/data-governance/unity-catalog/abac/requirements)
(policy quotas; `EXCEPT` principals see unfiltered, unmasked data; conflicting
resolutions block access; release status of row-filter/column-mask policies
not stated on the inspected AWS pages) and
[Dynamic views](https://docs.databricks.com/aws/en/views/dynamic)
(`is_account_group_member()` recommended; `is_member()` is Hive-compatibility).
No write-side predicate equivalent to `WITH CHECK` is documented.

## Portable single-realm authority guard

`SecurityAuthorityGuard` provides FIFO shared/read and exclusive/change
coordination within one host realm. Earlier shared operations must settle before
an exclusive producer starts; later reads wait for the completed change and use
its fresh generation. A generation cannot be reused. A queued aborted operation
never invokes its producer. Aborting an active operation does not release its
shared guard; its callback must finish final release/cleanup before settling.

The host MUST make callback settlement include the last application output
release or cleanup on success, error and cancellation. Merely finishing a SQL
transaction is insufficient while application buffers can still disclose data.
The change callback MUST resolve only after its complete authority transaction
commits. A thrown change producer may have committed: the guard permanently
closes admission and refuses acknowledgment. Recovery requires independent
native outcome reconciliation and fencing before a fresh host guard is created.

The profile bounds 256 active/queued operations, 1,024 unique generations and
4,096 characters per generation. Closing refuses queued/new operations without
forcibly releasing live callbacks. These are host coordination semantics, not
an authenticated credential, distributed lock, native RLS installer, lease or
proof of writer participation. Every backend must independently qualify its
complete native authority writers and final-release boundaries. Nested exclusive
changes inside a held read callback are unsupported and can deadlock; hosts must
keep those phases separate. Native crash/rollback/stream schedules remain required.


### Query-use request provenance

A native consumer MUST derive every field/operator/original-action request from
its admitted query and immutable, source-qualified profile. The profile MUST bind
the exact target, field, operator and separate action; a caller-supplied alternative
action label is not authority. A broad grant for an unrelated action cannot
substitute for the bound original-value permission. Missing or changed bindings
refuse before native query execution, including empty collections. Logical
simulation accepts explicit requests as conditional inputs and does not establish
this native profile provenance. B08 qualification must retain both successful
exact bindings and tampered/unrelated-action refusal controls.


### Original-value source correspondence

For original-authorized query use, native admission MUST establish that every
selected field value has the interpretation specified by its qualified logical
field and physical binding at the operation's data/authority cut. Exact native
column domains and two-way key/population correspondence are necessary but do
not establish value correspondence. A same-key source expression may fabricate
or suppress a predicate match while preserving both checks.

The installed-source inventory MUST bind the selected relation/view definition,
field expressions and transitive relations, functions, operators and casts on
which that interpretation depends, with their actual authority and relevant
configuration. Source definition or dependency changes MUST invalidate admission
before application SQL, including empty-result queries. Definition hashes alone
do not authenticate the installer or establish complete dependencies. A source
replacement carrying the same keys, column types and non-NULL values MUST NOT
inherit qualification solely from those descriptors. Whole native callable/DDL
closure and the held source/authority cut remain separately required.

Native inventory references MUST preserve the actual engine-local identity
alongside any display name. For PostgreSQL OID aliases such as regproc, a rendered
routine name or ordinary catalog JSON does not uniquely identify an overloaded
routine. Exact numeric OID references MUST remain bound to the same database,
installation and qualified cut; they are not portable logical identities or
installer credentials. Matching names cannot conceal changed aggregate,
operator, conversion, type-support or language-transform references.
The complete source census and its expected snapshot MUST remain in the trusted
administrative/provider boundary. Opaque routine bodies and configuration values
may contain sensitive source or facts; excluding native password columns does not
make the inventory an ordinary-user disclosure surface. Provider authority,
snapshot provenance and observer privilege closure require separate qualification.

A qualified data update under the same faithful binding is a new data cut, not
necessarily source-definition drift. Its query result MUST match the independent
oracle at that cut. The consumer MUST distinguish authorized data changes from
changes to the interpretation or authority of the source. This obligation applies
to flat relational columns and graph property/edge carriers equally; native
view-definition inspection alone does not qualify arbitrary graph storage.


## Private-fact diagnostic closure

Private-fact protection MUST include derived diagnostic counts/estimates, not
only table SELECT grants. The native inventory MUST enumerate applicable catalog
tables, statistics views, callable statistics/size functions, explain/query-history
surfaces and their privilege paths. Revoking one direct catalog table is not
sufficient when an owner view or public function exposes the same information.
Default unrestricted diagnostic access that reveals a private-fact change outside
the actor's authorized data surface MUST refuse qualification for US-056-AC8.
Coarse schema/role metadata is not automatically authorization to observe private
fact population estimates. Any deliberate metadata declassification requires
explicit supported policy semantics and evidence; it cannot be silently inferred.

A PostgreSQL 17.9 witness changes an unrelated private Assignment while ordinary
authorized resource IDs remain unchanged. Default pg_class.reltuples exposes the
3-to-4 population estimate. Direct-table restriction still leaves public statistics
views/functions exposing the changed native live-tuple estimate. A three-family
restriction blocks those known probes and preserves authorized reads, but complete
allowlisted diagnostic closure and performance/timing exclusions remain unproved.
Neither that prototype nor the default profile qualifies B10.


### Experimental Truss private principal observation

The host-only createPgConnectionSource options MAY select ordinaryPrincipalObserver with schema and routine identifiers, only alongside a pinned ordinaryPrincipal. Construction MUST copy and validate identifiers before native acquisition. This is an experimental consumer surface; selecting names does not authenticate a deployment. The host MUST independently qualify the zero-argument routine, owner, dependencies, fixed search path, ACLs and current installation/change custody.

The selected routine returns one ordered TEXT tuple named native_superuser, native_bypass, native_encoding for actual SESSION_USER. The runtime MUST select SESSION_USER and CURRENT_USER outside the definer as original_actor and effective_actor. The complete response MUST be exactly one row with ordered native OIDs [19,19,25,25,25], all text format 0 and non-null valid UTF8 bytes. Original caller pin, effective caller after reset, false superuser/bypass flags and UTF8 encoding checks remain mandatory. Missing or malformed observations MUST close admission and retain quarantine custody; no fallback to catalog observation is permitted. The unselected direct principal path retains five TEXT fields. Neither option alone qualifies a protected backend.


Combined private principal and subject observation MUST preserve subject key output as ordered TEXT OID25, irrespective of principal caller carriers. The experimental consumer OrdinarySubjectPreflight MAY specify actorCarrier as text (default) or name. This selects only the actual SESSION_USER argument carrier: the name option omits the ordinary name-to-text function call. The independently qualified subject helper MUST enforce actual session-caller binding and return the declared ordered TEXT keys; choosing name never changes key-output semantics. Unknown carrier selections MUST refuse at construction.


### Experimental original-response deadline

The host-only Truss createPgConnectionSource MAY select originalResponseTimeoutMs as an integer coordination deadline from 1 through 60000 milliseconds; default 5000. It MUST validate and capture this option synchronously before native acquisition and use it for each original response. This changes only the bounded transport observation window. Expiry MUST retain uncertain custody and quarantine, never manufacture a native SQLSTATE, completed cancellation, rollback or released publication. Native statement budgets and original protocol confirmation remain separate. Unsupported/nonfinite/noninteger selections MUST refuse before acquisition.


### Shared raw PostgreSQL runtime evidence sources

Raw PostgreSQL cases MAY reuse the host-only Truss PostgreSQL protocol adapter without implying graph storage qualification. Their EvidenceCase MUST pin each executed adapter module and the selected managed pg JavaScript dependency closure, retain actual driver resolution, and independently observe the native raw layout, roles and results. The reviewed gate permits raw-case source bindings under the exact Truss pg-runtime package and the task-managed /private/tmp/ashlar-truss-runtime/node_modules source tree in addition to the UMF workspace. This is a source inventory allowance, not authority to read credentials, adopt foreign installations or claim authentication from matching hashes. Alternate native pg drivers or changed package/source inventories require separate qualification. B16's authored profile uses exact total resource populations and a fixed stable authority/data cut; graph, Delta, streaming and revocation cases remain independently required.

## Source publication and first-snapshot ordering — 2026-10-11

A qualified source/authority cut MUST exclude relevant writer publication/commit through final disclosure, including writes already applied but uncommitted when reader admission begins. Conflict with a future DDL statement or an observed catalog ShareLock is insufficient. The admitted writer protocol must cover every participating source, grant/membership, policy, mapping and authorization-fact producer, acquire its barrier before a relevant change and retain it through commit/abort. The reader must drain already participating writers before establishing the observation used for execution, and retain its barrier through the operation's final protected release. Unknown writer coverage refuses positive admission.

The observation MUST use a fresh snapshot after that barrier is established. Adopting a repeatable-read transaction with an earlier snapshot is insufficient even if all relevant locks are subsequently held. A lock-acquiring SELECT may itself establish an earlier snapshot while waiting; ordering must be qualified at the original native producer, not asserted by caller booleans or inferred from an empty operation-local call ledger. A fresh post-barrier READ COMMITTED statement is a feasibility option only when the complete relevant source/data/authority state is protected for the operation. It is not general permission to weaken transaction semantics. Exact database/installation/generation, barrier ownership/key mapping, participating producers, native transaction lifetime, cancellation/deadline, final release and recovery remain binding obligations. Hash equality, two reads from the same inherited snapshot and matching endpoint images do not substitute.

Truss PostgreSQL16.15 administrative spike obtains43 catalog ShareLocks for the40-section census, blocks seven later DDL writes and permits ordinary facts DML. Nevertheless, an earlier routine replacement in an active uncommitted writer has no retained pg_proc RowExclusiveLock: after the reader acquires every catalog lock before its first census, that writer commits. The reader's repeatable-read census remains333 while native routine execution returns444 with all43 locks still held. This is actual native evidence against catalog-lock-only admission, not an admitted profile. A cooperative transaction advisory barrier separately drains an observed waiting reader after writer commit, gives a fresh READ COMMITTED source/execution555, blocks new participating writers and permits them after release. A writer that omits the barrier can bypass it; complete participation is a required premise, not established by the prototype.

The conditional ordering proof has six queries (two UNSAT/four SAT): complete commit-time exclusion plus a fresh snapshot prevents modeled source drift; independent protected fact publication is also needed for authority. Old snapshots, pending catalog writers, early release and independent authority changes retain SAT witnesses. This models one source and one fact transition, not arbitrary ABA, concrete PostgreSQL/driver/lock refinement or issuer authentication. No new backend test is admitted and the132-case acceptance scope is unchanged.

Database-local advisory participation does not establish closure for PostgreSQL shared catalogs: a second database can acquire the same key and change shared role membership while the original reader holds its barrier. The actual writer domain must cover all relevant database and cluster scopes, not merely key equality. The final native spike exercises this shared-role bypass. Original callable/plan/invalidation correspondence also remains required: an immediate repeated call after666 DDL returned555 in historical f8005795, whereas a fresh census followed by different query text returned666. The different sequences do not identify a cache mechanism or prove every current call follows the current catalog source. A qualified compiler/executor must supply its actual callable/compiled-plan correspondence rather than infer it from hashes or these finite probes.

## Private facts and native diagnostic observation — 2026-10-11

US-056-AC8's hidden-fact requirement covers every untrusted observation channel,
not merely SELECT/count on the private relation. A backend profile MUST account
for system catalogs, table/index statistics, plans/errors and alternate endpoints
that can reveal fact presence or cardinality. Table ACL/RLS/column-mask refusal
MUST NOT stand in for complete observation isolation. Unknown diagnostic/channel
coverage refuses positive admission. Original trusted producer and receiver/
credential custody MUST be independently qualified; client/configuration flags
such as sqlExposure=false or a matching role name are not evidence.

A mediated backend may keep authorization facts and SQL executor credentials in
the trusted service and expose only qualified policy/result operations. Its
profile MUST prove all untrusted routes use that boundary and that no alternate
SQL credential or diagnostic path remains available. A native SQL profile instead
must independently qualify its complete catalog/callable/diagnostic restrictions.
These are backend qualification choices under shared semantics, not a change to
UMF core or an assumption that any current backend already provides isolation.
The same obligation applies to raw association tables and graph node/edge stores.
Aggregate physical statistics need not equal a logical graph association count;
each selected representation requires its own observation controls.

Truss's PostgreSQL18.6 / pgserver-pg18 18.6.1 / psycopg3.3.6 binary owned flat
fixture supplies a concrete counterexample: an ordinary role receives42501 for
private Assignment SELECT/count yet observes pg_class.reltuples1 then2 after
controlled population changes and ANALYZE. This is finite analyzed-table evidence,
not an exact general row-count oracle, graph proof or general timing guarantee.
No backend acceptance binding is promoted by that counterexample. The original
132-case plan and hidden-fact acceptance criteria remain unchanged.

Retained native counterexample and integrated composition: [Truss main3bce4c77 evidence](https://github.com/DocumentDrivenDX/truss/blob/3bce4c777d5c9b631482084bd792337e18e2f27a/docs/helix/04-build/evidence/python-psycopg-epoch-cut/ed2ea7b9-ad94-40ed-b12d-84e346e20a7e/receipt.json). Its184-method component pass does not establish hidden-fact observation isolation.

## Field protection receipt members — 2026-10-14

**Status:** proposed normative text applied by owner direction on 2026-10-14
(proposal P-E of the [field-protection plan](../../04-build/security-field-protection-plan.md)).
No receipt carrying these members exists yet; the binding profiles named here
(`postgresql-raw/0.2.0`, `unity-delta-raw/0.1.0`) are proposed and `not-run`.

A BindingReceipt for a profile that binds CONTRACT-062 §Field protection
catalog MUST additionally carry:

- `protectionRevision`: the exact `{id, revision}` of the referenced protection
  document, pinned together with `policyRevision` and `modelRevision`.
- Per bound field, in `mapping`: the logical transform identity
  `{vocabulary, transform, version}`, the physical carrier of the transformed
  value (view/routine/UDF path with engine-local identity per §Original-value
  source correspondence), `storageEffect` (`disclosed-only` or
  `stored-transformed`), the effective retained property set (authored
  `disclosureProfile` united with determinism-implied properties) and the
  admitted per-operator query use. Implied leakage MUST be reported even when
  not authored.
- For `stored-transformed` fields: `custody.owner`, `custody.vaultRef`,
  `custody.keyRef` (opaque references; never secrets), `formatPreserving`, the
  `reverseAction` ID, and one explicit propagation declaration for each of
  `history`, `snapshots`, `exports`, `feeds` and `caches` stating whether
  tokens propagate, who revokes reverse authority there and how revocation is
  acknowledged. A missing declaration refuses admission.
- Obligation outcomes: every tokenize/encrypt enforcement obligation is
  `unverified` until a consumer vault/key profile supplies evidence; the
  receipt text for such a field is "declared and preserved; enforcement
  unqualified". `unverified` obligations block `qualified` status.
- A per-profile capability subset listing each logical obligation as
  `enforced`, `refused` or `unverified` with its prerequisite. A backend that
  offers read-side mechanisms only MUST list write obligations as `refused`
  (reported as `unsupported` at the native SQL surface) unless a separately
  receipted consumer-owned write path is bound; that path carries its own
  receipt, actor and evidence case IDs.
- Native archive entries for native masking/filter rules outside the admitted
  profile (PostgreSQL Anonymizer `SECURITY LABEL` rows, Unity Catalog ABAC
  policy DDL), marked preserved and uninterpreted, with their `EXCEPT` or
  bypass principals enumerated in `nativeInventory` as privileged exclusions.
- Statement-level refusals (for example 42501 on a column privilege) recorded
  as operation outcomes in `evidence`, never as `withheld` cell dispositions.
- Engine pins: PostgreSQL 18.x exact `server_version`, image digest and client
  build; Unity Catalog workspace, cloud, DBR/warehouse versions, compute tuple
  and the SHA-256 of the cloud documentation copy read at execution.

Key rotation, vault re-keying, protection-document revision changes and
changes to a transform carrier's definition or dependency closure are
authority-generation or source-definition changes that invalidate prior
admission under §Precedence and Compatibility. A protection document is
`invalidated` for a profile when any referenced transform becomes unknown.
