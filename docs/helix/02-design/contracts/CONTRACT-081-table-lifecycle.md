---
ddx:
  id: CONTRACT-081
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-033
      kind: informed_by
    - id: CONTRACT-042
      kind: informed_by
    - id: CONTRACT-062
      kind: informed_by
    - id: CONTRACT-063
      kind: informed_by
    - id: CONTRACT-079
      kind: informed_by
---

# CONTRACT-081: Declared table lifecycle

**Type:** schema/library/host boundary. **Version:** proposed `umf.tables`0.1.0,
`postgresql18/0.1` native profile. **Status:** draft.

## Purpose

One current-core source declares a plugin's typed tables, native constraints,
command policies, seeds and operations. Client generation, Weft compilation,
deployment and migration MUST retain the same complete source authority.

## Scope and Boundaries

Logical Fields, Records, Keys and relationships remain core0.10.0 meanings;
a table is a physical binding of a Record, not an assertion that it is an entity
or aggregate. `umf.tables` is a registered module-scope extension. Its native
profile is explicit. UMF owns preservation, resolution, inspection and deployment
generation; Weft owns query/command lowering; the UMF host runtime owns reviewed
native program execution and migration. Hosts authenticate and configure native
principals, own connection leases and approve administrative application.

The PostgreSQL profile declares PostgreSQL row-level security (RLS), transaction
and constraint behavior. It MUST NOT claim to implement `umf.security`0.1/0.2
or qualify CONTRACT-063 merely because native RLS exists. If selected source
also requires that stronger semantic policy, enforcement MUST refuse until the
combined profile has independent admission, authority ordering, diagnostic
closure and evidence. Native behavior, including foreign-key integrity and
transaction snapshots, MUST remain explicit. No policy content is stripped to
make an existing compiler accept the source.

The native profile MUST support the direct-table lifecycle separately from
Truss/Ashlar publication and graph authority. Those hosts retain independent
capability and qualification requirements.

## Normative Surface

### Source and identifiers

A module declares `vocabularies["umf.tables"].version:"0.1.0"` through the
containing current-core document's vocabulary inventory and stores its payload
at `module.extensions["umf.tables"]`. The payload is
`{profile:"postgresql18/0.1",tables,seedSets,commands}`. All four members are
required; empty arrays mean no declarations. An unknown member/version remains
recoverable but blocks applicable interpretation. Inspector output MUST retain
copied original source and pointer-qualified diagnostics; preservation is not
execution support.

The declaration-only API is `inspectTableLifecycle(input:unknown)` and the
explicit registry factory is `tableLifecycleRegistry()`. Inspection copies JSON
input, validates the registered schema and semantic references, and returns
`{valid,complete,diagnostics,source?,modules,nativeQualified:false}`. Returned
module payloads are independent copies of retained source. Invalid JSON cannot
have a retained JSON source. Invalid declarations have no admitted module
inventory. `complete` means declaration inspection has no diagnostics; it grants
no native capability. Until deployment and operation interpretation are
qualified, Python client generation refuses selected lifecycle modules and
actions depending on their Records.

Declaration bounds are256 tables per module,1600 columns per table,4096 columns
per module,256 indexes/checks/foreign keys per table,32 key/include fields per
index,10000 seed rows per module,4096 expression/rule nodes per module and depth16.
Via paths have at most4 steps. The inspector retains at most256 ordinary
semantic diagnostics, followed by a refusal diagnostic on exhaustion. These
bounds are metadata admission ceilings, independent of stricter native/host
limits. Unknown object members are retained and diagnosed; nonempty command
inventories remain incomplete until the exact command wire is implemented.

`Ref` is the existing exact `{module,element}` core reference. `KeyRef` is
`{record:Ref,key:string}` naming an authored stable Key ID. Display names do not
resolve identity. Each Table's Record belongs to the enclosing module. Every
selected table operation MUST be admitted through that module's capability;
including dependency key/value types MUST NOT expose another module's reads or
writes. Forged wire requests MUST receive the same check as generated methods.

| Member | Shape | Rules |
| --- | --- | --- |
| Table | `{id,record,name,columns,indexes,checks,foreignKeys,policy}` | Stable unique `id`; exact core Record; explicit native table name; complete mappings of its stored singleton members |
| Column | `{field:Ref,name,nativeType,default?,generated?,immutable?}` | Exact member Field; explicit native column name; required/nullable comes from core; no hidden copy of logical identity |
| NativeType | tagged object, below | Explicit PostgreSQL capacity; typed inspection and client/runtime checks retain its bounds |
| Index | `{id,name,fields:Ref[],unique:boolean,include:Ref[]}` | Nonempty ordered fields, no duplicates; include cannot overlap; v1 is nonconcurrent btree unless a separately declared migration step selects concurrency |
| Check | `{id,name,expression:Expr}` | Typed, bounded predicate; PostgreSQL CHECK accepts null/unknown, independently of NOT NULL |
| ForeignKey | `{id,name,fields:Ref[],target:KeyRef,onUpdate,onDelete,deferrable,relationship?}` | Exact ordered matching domains and Key; actions `restrict`, `noAction`, `cascade`, `setNull`; `deferrable` is `false`, `immediate` or `deferred` |
| Policy | `{mode:"native-rls",person:CommandRules,batch:CommandRules}` | All four commands are explicit in each CommandRules map; omitted policy never means public access |
| CommandRules | `{select,insert,update,delete}` | Each rule is a RowRule; no inference from one command to another |
| SeedSet | `{id,rows:SeedRow[],conflict:"error"|"ignore"}` | Explicit application only; deterministic order; exact typed values; conflict target is the selected primary Key |
| SeedRow | `{table:string,values:FieldValue[]}` | Table ID in this module; no duplicate fields; required create inputs present |
| FieldValue | `{field:Ref,value:Literal}` | Existing exact core literal carrier and domain; null/absence remain distinct |

NativeType is exactly one of `{kind:"boolean"|"text"|"int2"|"int4"|"int8"|
"float4"|"float8"|"date"|"timestamp"|"timestamptz"|"uuid"|"bytea"}`,
`{kind:"varchar"|"char",length:positiveInteger}` or
`{kind:"numeric",precision:positiveInteger,scale:integer}`. Numeric precision is
at most1000 and scale is from0 through precision in this profile. Native
capacity does not widen a logical domain. A backend MUST explicitly refuse any
selected carrier or facet it cannot preserve/execute; mere enumeration here is
not a support claim. Float transport MUST preserve its declared IEEE754 width;
nonfinite, rounding and signed-zero behavior need an explicit supported codec.
Timestamp and timestamptz MUST NOT be interchanged or acquire a guessed timezone.

A default is `{kind:"literal",value:Literal}`, `{kind:"currentTimestamp"}` or
`{kind:"randomUuid"}`. Type and volatility must match the declared Column. A logical missing-only literal default MUST have an explicitly matching
native default; other logical default triggers require separate qualification.
`generated`, when present, is `{kind:"identity",generation:"always"|"byDefault"}`
on an integer column. Arbitrary SQL strings, executable plugins, function names
and network imports are not expressions in this profile. Preserved native
expressions outside the profile block positive compilation. Defaults and identity
columns are omitted from required create inputs; generated-always and immutable
columns are forbidden in patch/upsert-update inputs. All authored core Keys are immutable.

Core Keys generate named native uniqueness constraints with their exact ordered
members. Read/upsert Keys require singleton, nonnullable components and
nondeferrable native uniqueness. Additional unique indexes do not silently
become a logical Key. Native object names MUST be NUL-free, at most63 UTF-8 bytes
and collision-free in PostgreSQL's actual object namespaces. Generated names
MUST derive deterministically from stable source identities, with collision
checking, rather than truncating display names. Type/Key/relationship mismatches,
ambiguous identity, unknown applicable facets and unresolved dependencies block
compilation before SQL is emitted.

### Typed expressions and row rules

`Expr` is exactly `{op:"field",field:Ref}`, `{op:"literal",value:Literal}`,
`{op:"eq"|"ne"|"lt"|"le"|"gt"|"ge",left:Expr,right:Expr}`,
`{op:"and"|"or",args:Expr[]}`, `{op:"not",arg:Expr}`,
`{op:"isNull",arg:Expr}` or `{op:"in",arg:Expr,values:Literal[]}`.
Expressions are finite: depth at most16 and at most4096 nodes per module.
Boolean argument arrays are nonempty and at most64 entries; membership arrays
are at most1000 entries. Comparison domains MUST agree without numeric/string
coercion, Unicode normalization or float conversion. SQL null logic is retained.
Checks only reference the selected table's fields. SQL rendering MUST quote
identifiers and encode exact typed literals; values cannot become SQL syntax.

`RowRule` is `{kind:"deny"}`, `{kind:"allow"}`, `{kind:"owner",field:Ref}`,
`{kind:"memberOf",field:Ref}` (per-row native group name),
`{kind:"memberOfRole",role:string}` (host-configured group alias),
`{kind:"any"|"all",rules:RowRule[]}`, or
`{kind:"via",path:RelationshipStep[],rule:RowRule}`. An owner compares a text
Field with the effective authenticated PostgreSQL role using exact C collation.
Group aliases resolve only through trusted host configuration; plugin source
cannot grant native membership. Group membership adds no permission to an
unlisted command. Batch rules are separately admitted and cannot inherit person
policy because person identity is absent. `allow` is explicit per audience and
command, never a fallback from an invalid owner/via rule.

A ForeignKey may bind `relationship:{module,id}` to an original core relationship.
Its source/target Record, target Key and direction MUST agree; multiple native
bindings of the same selected relationship refuse. Logical endpoints alone do
not identify physical Field pairs. A via path requires this explicit native
binding at every step; no name or column-order heuristic supplies it.

A RelationshipStep is `{module,id,direction:"forward"|"inverse"}` naming an
original core relationship. Paths have1 through4 steps, remain within the
plugin module and retain exact endpoint Keys, Field pairs and nullability.
A via rule is existential over related rows visible under their native SELECT
policy. It does not bypass related-table RLS or grant public read access to that
table. All native SELECT dependencies and privileges MUST be generated and
verified explicitly. A path's final rule applies to that related Record.
Nested scopes retain correlation without alias shadowing. Cyclic native policy
dependencies and unsupported/incomplete paths refuse. Native constraint checking
and PostgreSQL's implicit SELECT requirement for UPDATE/DELETE remain explicit;
a declaration that cannot deliver its command without an additional SELECT
grant/policy MUST refuse with the source path instead of silently broadening it.

SELECT/DELETE policy predicates use old rows. INSERT uses WITH CHECK on new
rows. UPDATE requires both old-row USING and new-row WITH CHECK. Owner/key
changes require a separately declared command where allowed; ordinary patch
cannot acquire that capability. The runtime MUST distinguish native denial,
constraint/conflict, precondition failure, unsupported capability, schema change
and uncertain write outcome, without returning raw database diagnostics.

### Binding, output and installed authority

Deployment configuration is trusted host input:
`{module,schema,ownerRole,personRole,batchRole,groupRoles}`. The selected module owns every generated table in the bundle. Native schema and role names
are not supplied by generated wire calls. The owner is a separate non-login
install role. Runtime roles MUST NOT own plugin tables or have superuser,
BYPASSRLS, CREATEROLE, database/schema creation or access to another plugin's
objects. Effective person/batch identities remain distinct; group memberships
and SET ROLE reachability MUST be inspected transitively. Person/batch grant
sets cannot overlap through inheritance. Installation MUST NOT alter unrelated
schemas, roles or default privileges. No module can name arbitrary grant targets.

A compiled bundle follows `spec/extensions/tables/deployment.schema.json`:
`{version:"umf.table-deployment/0.1",canonicalization:"RFC8785",source,
configuration,sourceDigest,configurationDigest,bundleDigest,module,profile,
steps,expectedCatalog,seedSets,nativeQualified:false}`. The current initial
compiler takes `{text,format?:"json"|"yaml",configuration}` through
`compileTableDeployment` and returns either `{status:"compiled",bundle,
diagnostics:[]}` or `{status:"blocked",diagnostics}` with no partial SQL.
`source:{format,utf8}` retains the complete supplied source string, including
whitespace. This cut refuses external native dependencies; it must add exact
dependency archives before interpreting them.

Digests are lowercase hexadecimal SHA-256. `sourceDigest` covers exact UTF-8
bytes of `source.utf8`; configuration and bundle identities use RFC8785 over
copied interoperable JSON, with `bundleDigest` excluding only its own member.
Lone surrogates and noninteroperable JSON values refuse. Steps have
`{id,kind,sourcePath,transaction:"required",sql}`; IDs are ordered `step-00001`
through the bounded inventory. This cut generates initial creation only, with
at most8192 steps,1MB UTF-8 per statement,4MB source and16MB canonical body.
The ordinary JSON structural admission limit also applies. No statement executes
during compilation. `verifyTableDeployment` recompiles retained source and
configuration and compares the complete bundle, so rehashing tampered SQL is
insufficient. Hosts additionally require their own trusted installed digest;
untrusted self-consistency cannot establish deployment authority.

`expectedCatalog` carries the source Table inventory and separately generated
column, Key, check, foreign-key and index expectations. A column records exact
Field identity, source path, native type schema/name/typmod, nullability,
collation, identity mode and its original `definitionSql`. Keys/checks/foreign
keys retain original constraint definition SQL; a foreign key also names the
native index of its original target Key. Index expectations retain uniqueness
and the original `USING ...` definition. These members are emitted by the same
code that emits deployment SQL; the host MUST NOT reconstruct another logical
DDL interpretation from names or observed tables. The machine schema closes
their shape, and full source recompilation closes their authority.

The installed `umf_codegen` Python API exposes the same implementation as
`compile_table_deployment(text,configuration=...,format="json")` and
`verify_table_deployment(bundle)`. The former returns the compiled/blocked
discriminated result; verification raises `GenerationError` on any difference.
Both execute the pinned original portable compiler in embedded V8 through fixed
bridge functions, with the generator's manifest/asset integrity, deadline and
memory gates. No external Bun/Node, executable discovery or network lookup is
permitted. Python object results are inert JSON; no driver operation belongs in
this package. Embedded requests additionally have a32MiB serialized JSON limit.
An administrative executor can depend on this verifier; ordinary generated
clients remain stdlib-only and do not acquire an embedded runtime dependency.

Initial DDL creates all tables before foreign keys, declares original primary
and alternate Keys, explicit indexes/checks, ENABLE/FORCE RLS, all8 audience
command policies, required table/column privileges and schema USAGE. Key
constraint names are `umf_k_` plus the first32 hex characters of SHA-256 over
canonical `[table.id,key.id]`; collisions with authored relation/constraint names
refuse. Install role/schema creation and role memberships are host preconditions,
not generated source permissions. Every statement executes as the configured
install owner in an already allocated private schema with pg_catalog-first
resolution. No guessed identity-sequence name is granted. Ordinary UPDATE grants
exclude Key, immutable and generated columns. Per-row group membership is bounded
to native groups declared in trusted configuration. Related-table SELECT denial
refuses via compilation rather than adding a broader policy.

The initial executable compiler subset refuses unqualified char padding,
float/time codecs, identity sequence privileges, semantic-type/extension
composition, unsupported logical facets and implicit logical allowedValues.
Numeric native precision/scale must equal the original logical declaration.
Seed inventories remain inert and explicit. These refusals are remaining work,
not assertions that the complete proposed lifecycle profile is delivered.

Client description, Weft bindings/programs and deployment name the same source
and configuration digests. A compiled status alone is not deployment authority.
Runtime admission MUST verify the installed bundle, module capability, native
catalog/privilege correspondence, role and policy generation, transaction state
and every emitted compiler obligation before effects or disclosure. Unknown
obligations or incomplete privilege closure refuse. Derived SQL MUST NOT grant
privileged executor authority by substituting another identity.

Every table has ENABLE and FORCE ROW LEVEL SECURITY and explicit command grants,
including all-denied tables. Native policies target only the configured audience
roles; ordinary identities cannot reach install authority. Migration is separate
from normal generated data methods. Seed execution is explicit and uses the
same typed command/compiler and declared conflict semantics.

Native policy correspondence MUST be derived from source, not an initial
fingerprint of an arbitrary existing table. The proposed install-time verifier
holds the module's administrative lock and exclusive native table locks,
recompiles the complete trusted bundle, and reparses each original policy into
an ephemeral verification policy on the same relation. It compares native
command, permissive mode, role OIDs, normalized USING/WITH CHECK expressions and
dependency closure against the installed original, then removes the verification
policy before commit. Different policy names do not change interpretation.
Verification SQL is generated from the original compiler output; it never
accepts an arbitrary diagnostic query or supplied expected fingerprint.
Verification policies cannot become externally visible or survive a failure.

All normal operations share the installed generation lock; migrations and
retirement acquire it exclusively. Trusted administrators must use this lifecycle
path or quiesce the plugin before privileged native changes. Runtime principals
cannot obtain install authority. Catalog evidence records exact engine build,
source/configuration/bundle identity and verified native shape/privileges;
subsequent calls recheck that authority and native drift before effects or
disclosure. This is a proposed host protocol until executable qualification;
native policy replay alone does not verify columns, grants or role containment.

The initial host implementation is
`umf_access.lifecycle.verify_native_catalog(connection,bundle)` for an installed
Psycopg3 connection in a healthy caller-owned transaction. It verifies the
original bundle using `umf_codegen`, requires the configured non-login,
non-superuser/non-BYPASSRLS install owner, owned schema, writable transaction and
exact pg_catalog resolution, then takes a transaction advisory lock and exclusive
locks on all declared tables. The advisory key is the first8 SHA-256 bytes of
UTF-8 `"umf.table-lifecycle/0.1\0"+schema`, interpreted as a signed big-endian64-bit
integer within the current database.

Within its own savepoint it recreates source column/constraint/index definitions
on fresh private-schema scratch relations. Key/index names are rebased only
through explicit definition prefixes, never through global SQL replacement.
Actual type/typmod/nullability/collation/identity and source defaults must agree;
native constraint definitions, enforcement/validation/deferral, referenced Key
and index operator classes, collation, field order/include, predicates and
validity must agree with the reparsed source. Native-generated NOT NULL names
are compared by exact Field inventory; authored constraint identities remain
exact. Extra constraints/indexes, inheritance, rewriting rules, user triggers,
unexpected replica identity and unsupported relation kinds refuse. This is
administrative verification, not a first-observed fingerprint or a data executor.

Private tuple cursors preserve the caller's row factory. Administrative statement
and lock timeouts are bounded to1..300000 milliseconds (defaults30000/5000);
the verifier restores prior local settings on success and its savepoint restores
them on failure, including a real blocked-lock timeout.

The function never commits the caller. Success drops every scratch object;
failure rolls back its savepoint and emits a fixed reason without raw database
diagnostics. It returns `{bundleDigest,catalogShapeVerified:true,
lifecycleAdmission:false}`. ACL/transitive role closure, trusted ledger authority,
normal-operation admission and migration coordination remain separate gates.
Only the lifecycle administration owner may import the public source verifier
and native exception class; those dependencies do not become available to the
portable DSL or ordinary runtime. Current native evidence covers PostgreSQL18.6;
the major18 guard does not establish managed/minor-version qualification.

The administrative `verify_native_role_scope(connection,bundle,person_roles=...)`
shares that source verification, install transaction, advisory lock and timeout
boundary. The trusted host supplies an exact tuple of at most1024 selected person
roles; an empty tuple qualifies configured roles for a batch-only installation.
This is not a census of every member of the audience roles. A trusted pool issuer
may intentionally switch to both audiences and MUST NOT be substituted for a
person identity. Successful output binds the exact selected role inventory.

Configured owner/person/batch/group roles must exist and be non-login roles.
Selected people must inherit the person audience with native `USAGE`, so a
SET-only membership cannot replace the individual identity. Native closure
includes every role reachable by a SET chain followed by an INHERIT chain;
MEMBER alone does not imply effective privileges. The owner can reach only itself.
Person/group roles cannot reach batch or owner; batch cannot reach person or
owner. No selected principal or effective role can be superuser, BYPASSRLS,
CREATEROLE, CREATEDB or REPLICATION. Disabled membership edges are not guessed to
confer privileges. Native predefined roles and membership ADMIN authority also
refuse: ADMIN can regrant an otherwise disabled INHERIT/SET edge. A person may
legitimately have other plugin memberships;
schema/object ACL containment remains a separate mandatory check.

The role checker never changes memberships or commits. It returns
`{bundleDigest,roleScopeVerified:true,verifiedPersonRoles:[...],lifecycleAdmission:false}`.
Native role membership can change outside the module advisory lock; this bounded
administrative observation does not freeze role catalogs or admit a later call.
Trusted operators must quiesce lifecycle access for changes, and final normal
operation admission must recheck the actual selected principal and privileges.

The installed administrative `verify_native_privileges` combines selected native
role scope with source-derived table/column ACL correspondence and dedicated
schema preconditions. It takes the same transaction/advisory/deadline boundary,
then exclusive table locks. Fresh scratch relations reparse original column
definitions; only the exact single native table target in original grant steps
is rebound to the scratch relation. Native table and column ACLs, including
grantor, grantee and grant options, must agree exactly with the reparsed source.
This does not build a second command/grant emitter or repair observed privileges.

The selected schema has exactly its native owner default ACL plus source person
and batch USAGE. Owner default table/sequence privileges may not grant anything
to another role or introduce grant options. Schema relation inventory must equal
declared tables and their separately checked indexes. Identity-sequence privileges
remain unqualified. Extra objects refuse; the future trusted ledger requires its
own explicitly qualified ownership/inventory rule.

Owner/person/batch root roles cannot CREATE databases or other user schemas,
access tables/columns/sequences outside this schema, execute user-defined
routines, use foreign servers/wrappers or access large objects. Native checks
include inherited and PUBLIC privileges; routine execution checks conservatively
include user routines even when schema resolution would currently deny them.
This dedicated-schema profile requires the operator to arrange those global
preconditions; the installer never revokes unrelated/PUBLIC privileges to force
qualification. Actual people may have other plugin grants; exact target ACLs and
the role boundary govern their access to this module. Native system functions
and session-local temporary objects retain the declared PostgreSQL trust boundary.

The return is `{bundleDigest,nativePrivilegesVerified:true,verifiedPersonRoles:[...],
lifecycleAdmission:false}`. It does not replace source catalog shape verification,
freeze native privilege catalogs, establish installed-generation authority or
admit normal data execution. Native `CASE` guards object-specific privilege
functions by relation kind; predicate evaluation order is not assumed.

### Forward migrations and retirement

A migration carries `{version:"umf.table-migration/0.1",id,predecessor,
fromBundleDigest,toBundleDigest,steps,digest,requiresApproval}`. IDs are unique
within the plugin lineage; predecessor is explicit, including initial null.
`digest` covers the exact source pins and ordered steps, excluding itself.
An installed ledger serializes migrators and records immutable ID, predecessor,
digest, bundle digests, ordered step outcomes and final admission status. Replay
of an applied migration verifies every recorded digest; edits, reordering,
missing predecessors, divergent histories and live schema drift refuse.

The initial portable `compileTableMigration` implementation produces inert plans
only. Its exact request is `{id,predecessor,previous,next}`: previous is the full
verified deployment bundle or initial null; next is the full verified target
bundle. A predecessor is exact `{id,digest}` or initial null. Both bundles retain
their original source/configuration. IDs are nonempty, NUL-free and at most256
UTF-8 bytes; predecessor SHA-256 values are lower-case64-character hex. Initial
and predecessor-null states must agree. The result adds version, RFC8785
canonicalization, from/to bundle digests, phased steps, `seedExecution:"none"`,
`requiresApproval:true`, `nativeQualified:false` and a digest over every other
member. A plan exceeding24MB refuses. `verifyTableMigration` recompiles both
source bundles and the entire plan, including self-consistently rehashed edits.
Consistency verification does not authenticate a supplied predecessor; the
trusted native ledger and selected source authority remain required.

This plan-generation subset supports initial deployment and appended tables.
Root/module metadata, existing elements/relationships and native tables,
columns/Keys/checks/FKs/indexes/policies must remain exact. New tables retain the
target deployment compiler's original step ordering; existing steps are never
re-executed. Namespace/role changes, table removal, edits to existing logical or
native definitions, metadata-only/no-op revisions and seed execution refuse with
diagnostics. Refusal is not a partial migration or a generated destructive plan.
Every compiled candidate requires approval; compilation cannot grant it.

Each phased step retains its original deployment identity/kind/source path/SQL
and required transaction. Its before-plan precondition is either an empty private
schema or the exact installed source cohort. Its before-commit expected outcome
is the complete next source catalog, verified with native catalog, privileges and
role scope; recovery is full transaction rollback. This captures atomic final
verification without claiming each intermediate DDL statement alone matches the
complete target. Browser/Bun plan parity does not qualify native execution,
durable history, concurrency or recovery.

The installed Python toolchain exposes the same compiler via
`compile_table_migration(migration_id=...,predecessor=...,previous_bundle=...,next_bundle=...)`
and `verify_table_migration(plan)`. These fixed embedded V8 bridge operations
retain the generator's manifest/asset checks, deadline/memory bounds and32MiB
serialized request limit. They do not discover or launch Bun/Node or use a
network. Compiled/blocked diagnostics and complete verified plans match the
portable implementation; this entry point supplies source consistency for a
future native ledger, not predecessor authentication or execution admission.

Each step states `kind`, source paths, transaction behavior, preconditions,
expected native outcome, verification and recovery. Transactional failure rolls
back its effects. A nontransactional concurrent-index step MUST track native
validity and incomplete progress; interruption cannot become an applied step.
Resume requires the identical digest and a verified known state. Destructive
changes, ownership/policy widening, type reinterpretation and unresolved data
backfills require concrete plan approval by the host administrator; an author
annotation or compiler success is not approval. Approval MUST bind the plan
digest. Unknown/destructive changes cannot be silently dropped to make a plan.

Supported automatic changes MUST be enumerated with native evidence; others
produce a reviewable blocked plan. Runtime admission drains/blocks during
incompatible installation and refuses partially applied cohorts. Retirement
revokes runtime entry points/grants before archival or removal; retained
migration/source history cannot be rewritten as a rollback. Production effects
require host authorization separate from generating or inspecting a plan.

### Commands and consistency

Named reads and writes MUST use the same typed operation model and Weft compiler
as directly composed methods. Commands declare stable ID, exact input/output
identities, bounds, required capability and consistency. No raw SQL string is a
named statement in this profile. Upsert declares an original nondeferrable Key,
create input, update whitelist, conflict behavior and returned key/count shape.
Native ON CONFLICT behavior and races require independent qualification.

The owner selected declared typed operations for final consumer acceptance on
2026-10-19. Existing consumer raw-SQL escape methods are migration inputs, not a
required untyped public entry point. Each required read/write becomes a declared
operation with exact inputs/results and module capability; unsupported SQL is
reported for explicit conversion rather than delegated to a consumer query layer.

Durable replay binds module, full source/deployment authority, authenticated
principal, command identity, idempotency key and exact input digest. The write
and durable outcome are atomic. Matching replay rechecks current authorization;
a different input/principal cannot consume the receipt. Concurrent attempts
have one declared native outcome. Lost response after commit is uncertain until
that durable outcome is observed; no driver or generated client retries writes.
Counts use the caller's RLS and declare their statement/snapshot consistency.
Live keyset paging is explicitly distinct from a held snapshot; cursors bind
query, source, deployment, principal and policy generation. Incompatible changes
refuse continuation. Exact command wire shapes extend CONTRACT-079 before their
implementation; this section does not substitute unspecified operations for them.

## Precedence and Compatibility

This native table declaration does not replace core, `umf.binding`,
`umf.postgresql` archives or `umf.security`. Cross-profile conversion retains
sources and an explicit fidelity report; opaque native predicates never become
validated typed expressions by copying their text. Exact vocabulary/native/core
versions and native engine builds are recorded together. Unknown content stays
preserved and blocks applicable execution. No source version is relabeled to
satisfy an older consumer. Older generated read/action clients retain their
published wire contract; lifecycle capabilities require a new recorded cohort.

## Error Semantics

| Condition | Outcome | Retry / recovery |
| --- | --- | --- |
| Missing/unknown/unsupported selected meaning | unsupported with source path | Correct source or select a qualified profile; no fallback |
| Invalid refs, exact carriers or duplicate/colliding identity | invalid | Correct declaration without discarding its original bytes |
| Source/deployment/policy mismatch or native drift | schema-mismatch / invalidated | Install and requalify the exact cohort |
| Native row/grant denial | denied | Host-authorized policy change; no privileged retry |
| Unique/check/FK or declared precondition failure | conflict / precondition-failed | Preserve atomicity and typed reason; sanitize native diagnostics |
| Edited migration/replay history | digest-conflict | Retain history and explicitly resolve divergent source |
| Required destructive-plan approval missing | approval-required | Present and approve the exact digest before application |
| Dispatched write has unobserved outcome | write-outcome-unknown | Observe the durable receipt; never assume rollback or retry |

## Examples

A current module can attach this payload to a Record with stable ID `Note` and
member Fields `id` and `owner` (both required text), plus primary Key `primary`:

```json
{
  "profile": "postgresql18/0.1",
  "tables": [{
    "id": "notes", "record": {"module":"demo","element":"Note"},
    "name": "notes",
    "columns": [
      {"field":{"module":"demo","element":"id"},"name":"id","nativeType":{"kind":"text"}},
      {"field":{"module":"demo","element":"owner"},"name":"owner","nativeType":{"kind":"text"}}
    ],
    "indexes": [], "checks": [], "foreignKeys": [],
    "policy": {
      "mode":"native-rls",
      "person": {
        "select":{"kind":"owner","field":{"module":"demo","element":"owner"}},
        "insert":{"kind":"owner","field":{"module":"demo","element":"owner"}},
        "update":{"kind":"owner","field":{"module":"demo","element":"owner"}},
        "delete":{"kind":"owner","field":{"module":"demo","element":"owner"}}
      },
      "batch": {
        "select":{"kind":"allow"},"insert":{"kind":"deny"},
        "update":{"kind":"deny"},"delete":{"kind":"deny"}
      }
    }
  }],
  "seedSets": [], "commands": []
}
```

A concrete test MUST show each person's rows, independent batch SELECT,
old/new owner UPDATE rejection, a rejected foreign-module request, native direct
SQL denial, exact native catalog correspondence and migration digest conflict.
The same test MUST fail if its RLS policy, command grant, source digest, native
type/Key, role containment or installed-generation check is changed.

## Non-Normative Notes

The profile and wire/schema details remain proposals until implementation and
native/consumer gates pass. The initial bundle schema is implemented; production
catalog/privilege admission, command wire, nontransactional recovery and
stronger security composition remain separate implementation gates. No date or
released feature support follows from this contract. Existing P1 native evidence
qualifies sessions/transport, not this deployment or mutation surface.
