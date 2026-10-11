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
https://www.postgresql.org/docs/17/ddl-rowsecurity.html

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
