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
    - id: SD-007
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
limits. Unknown object members are retained and diagnosed; unknown command
inventories remain incomplete. The separately versioned CONTRACT-079 native
table-operation candidate admits known declaration shapes; execution remains
unqualified and generated lifecycle modules remain guarded.

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

An explicit association uses
`{kind:"related",record:Ref,matches:[{source:Ref,target:Ref}],rule:RowRule}`.
The target Record and every matched source/target Field must have an exact
native table/column mapping in this plugin. One through32 distinct field pairs
are conjunctive equality matches. Both Fields use the same singleton scalar
carrier; their independent refinements remain enforced on their own tables.
No string/numeric coercion, NULL-equals-NULL rule or guessed relationship mapping
is introduced. The nested rule applies to the target row. Related rows remain
subject to their native SELECT policy and privileges for the selected audience;
no SELECT grant is inferred. The rule emits correlated EXISTS and does not
create a foreign key, uniqueness constraint or extra result rows. Nested scopes
preserve aliases and cycle refusal. Unknown content stays preserved and blocks
selected execution. This source form is needed for an authored association
scope that deliberately has no integrity relationship.

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
Seeds outside the separately versioned administrative execution profile remain
inert. These refusals are remaining work,
not assertions that the complete proposed lifecycle profile is delivered.

Client description, Weft bindings/programs and deployment name the same source
and configuration digests. A compiled status alone is not deployment authority.
Installation MUST establish original-source native catalog/privilege
correspondence. Ordinary operation admission MUST verify approved bundle/module
pins, current installed generation and location, selected principal and declared
policy scope, transaction state and supported compiler obligations before effects
or disclosure. It MUST NOT repeat the installation's full native catalog proof
on each data call. Native privileges and forced row policies enforce the actual
business statement. Unknown obligations refuse. Derived SQL MUST NOT grant
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
subsequent operations check current generation/location and selected policy
scope before effects or disclosure. Full native shape/ACL proof belongs at
installation or an explicit diagnostic boundary. This is a proposed host protocol
until executable qualification;
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
CREATEROLE, CREATEDB or REPLICATION, or possess SET authority over
`session_replication_role`. Disabled membership edges are not guessed to
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
canonicalization, from/to bundle digests, phased steps, `seedExecution`,
`requiresApproval:true`, `nativeQualified:false` and a digest over every other
member. A plan exceeding24MB refuses. `verifyTableMigration` recompiles both
source bundles and the entire plan, including self-consistently rehashed edits.
Consistency verification does not authenticate a supplied predecessor; the
trusted native ledger and selected source authority remain required.

Forward plans may append ordinary transactional btree indexes on existing tables,
including source-declared uniqueness and included columns. Existing index
inventory/order remains exact. An index-only revision keeps policy, columns,
keys, checks and foreign keys exact; separately admitted additive/policy/seed
changes may share the approved plan. Only new indexes' source-recompiled steps
are selected; concurrent
index builds and index replacement/removal are outside this subset. Native errors
(including duplicates for a new unique index) roll back the approved plan.

A declared-command revision may also advance the ledger without DDL. A plan with
zero DDL steps allows changes only to the selected module's declared commands,
new immutable-prefix seed sets, or original serialization. Adding, replacing and retiring
commands requires the same approval, expected head, source recomputation,
transaction, witness and durable history as schema changes. The new source digest
invalidates old client installation references and cursor/outcome scopes; no
source revision silently adopts the prior identity. No data command is executed
while installing its declaration. Unchanged bundle digests still refuse.

The native administrative ledger uses reserved `umf_lifecycle_` relation/index
names inside the plugin's private schema. Authored native tables/indexes cannot
occupy that prefix. A fixed metadata table is owned solely by the configured
non-login install owner; person/batch/PUBLIC have no metadata read/write grant.
Its original native definition, constraints/indexes, ownership, ACL, relation
kind, trigger/rule/inheritance and policy absence must be verified before rows
are trusted. Recognizing a name alone never exempts an object from inventory.

Application requires the exact approved plan digest and expected native ledger
head (initial null), supplied by trusted host deployment code. The library does
not infer approval or expose install authority through generated data clients.
Every history entry retains the complete original plan plus a source-verified
native catalog witness. A separate entry digest binds position, preceding entry
digest, plan digest and witness. Positions/IDs are unique; all links, source
bundles and plan digests are reverified before application or replay. Native
witnesses are captured only after complete source-derived catalog/privilege/role
correspondence succeeds, not from an arbitrary first-observed schema.

Initial application requires an empty allocated private schema. Later plans
must name the exact current bundle and predecessor plan/entry. DDL, final native
verification and history insertion share the caller-owned transaction and
module advisory/exclusive table locks. A failure rolls back the library's
savepoint, including partially applied DDL. Success remains pending the caller's
commit; the library neither commits nor retries. Replay checks the full history
and current native cohort without rerunning migration steps; source verification
still creates/removes its protected scratch objects. A lost commit response
requires observing durable history, not assuming rollback.

The installed Psycopg3 administrative entry points now are
`apply_table_migration(connection,plan,approved_digest=...,expected_head=...,person_roles=...)`
and `inspect_table_history(connection,bundle,person_roles=...)`. They require a
healthy, writable caller-owned READ COMMITTED transaction, UTF8 server encoding,
pg_catalog resolution, `row_security=on` and `session_replication_role=origin`.
The bounded native profile requires persistent ordinary heap tables and
default_table_access_method=heap before reparsing scratch DDL. Native witnesses
retain the actual table access-method OID; private history explicitly uses heap.
They preserve caller row factories and timeout settings. Success is
`applied-in-transaction`, with caller commit responsibility; identical historical
replay reports `already-applied` and the verified current generation. Inspection
requires the caller's expected current bundle and returns IDs/digests, not source
or seed contents. Every outcome still reports `lifecycleAdmission:false`.

This initial ledger profile bounds history to128 entries and32MiB of native JSON
text before payload loading, refusing rather than rewriting history at capacity.
Witness hashing accepts only fixed ASCII object keys and native strings,
booleans, null, arrays and safe integers, with depth64/node200000 bounds. Both
source revalidation and exact native witnesses are required before replay. The
qualified native scope is PostgreSQL18.6 with the recorded wheel/source hashes;
managed engines, broader migration operations and ordinary data admission remain
separate gates. Authored role alias-map order cannot affect emitted native SQL or
invalidate original-plan verification after JSONB key reordering.

The native candidate additionally installs a fixed `umf_lifecycle_head` view in
the same transaction as history. It projects only generation, entry/plan/bundle/
source/configuration digests and the source-verified native witness from the
latest entry. It never projects original source plans or seed contents. The
configured install owner owns the view; only source person/batch audiences
receive SELECT, without grant options or column grants. PUBLIC receives none.
`security_barrier=true` and `security_invoker=false` retain the private history
boundary. The complete view definition, relation/column metadata, rewrite-rule
inventory/dependencies and ACLs must match a freshly reparsed fixed definition
on a protected scratch view. Its presence is not an inventory exemption based
on a name. Missing or altered metadata refuses; no implicit upgrade of earlier
unpublished ledger-only installations is performed.

After complete original-source native verification, application, replay and
administrative inspection return an `installationReference` with version
`umf.table-installation/0.1`. It binds current bundle/source/configuration,
generation/head/plan digests, actual head-view OID and proven catalog shape,
the source-proved private-history catalog shape and the installed table witness.
Its canonical consistency digest is not an
authentication token. Trusted deployment code persists the reference only
after commit, or obtains it through fresh administrative inspection after an
uncertain commit. An untrusted request cannot choose the expected reference.
Historical migration replay issues a reference for the verified current cohort.
References use the bounded native witness JSON subset and a16MiB serialized cap.

The durable-outcome runtime adds `umf.table-installation/0.2`, with the same
source/head custody plus `outcomeShape`. The fixed `umf_lifecycle_outcomes`
relation is installed atomically with new history/head metadata. Its ordinary
heap shape, exact constraints/indexes, owner, forced RLS, two source-audience
policies, table/column ACLs and absence of triggers/incoming FKs are proved
against a protected fixed-schema scratch relation. The trusted reference pins
that verified native shape. Explicit full head/correspondence observations compare
it; full correspondence includes it in the exact schema inventory. Ordinary
write/recovery calls use the bounded operation-admission path below, retaining
receipt authentication and current-principal RLS without repeating catalog-shape
proof. Privileged external catalog changes require operator quiescence and
explicit diagnostic reverification before normal service resumes.
Receipt payloads never become expected catalog shape by observation alone.

Existing outcome-free installations keep version0.1 references and read-only
head observation. No implicit outcome-table upgrade is performed by inspection
or an ordinary call. Mutation execution refuses before acquiring a lease when
the approved installation lacks outcome storage. Runtime0.2 metadata requires
its qualified library cohort; a new reference is persisted only after commit.

CONTRACT-079 defines the closed outcome wire and effect-only recovery. Native
current-role RLS confines rows to their actual principal OID; source audiences
receive SELECT/INSERT with no UPDATE/DELETE grant. Every stored effect receipt
is independently authenticated by a host-owned secret. The slot digest excludes
mutable inputs/generation and the authentication secret, so changed authority,
inputs or secret rotation cannot silently miss an occupied slot and execute a
second write. Invalid receipts refuse. Recovery never returns historical
business projections. Cancelled calls may already have committed; a fresh
authenticated observation of the caller's key establishes the durable outcome.

The explicit Psycopg3 `read_table_head(connection,bundle,reference,...)` observer
requires an active READ COMMITTED transaction, exact pg_catalog resolution,
PG18/UTF8, row_security on and session_replication_role origin. Read-only
transactions are supported. It verifies the original source and trusted
reference, obtains the module's shared transaction advisory lock and compares
the view OID/shape and private-history relation/column/constraint/index/ACL shape,
including access method and RLS/rule/trigger absence, before locking the known
view. Both shapes are rechecked after that lock. Only then may it execute
the view and compare the current digests and native witness. A modified view
must refuse before executing any newly introduced function. Recreating an
equivalent view at a different OID requires a freshly source-proved reference.
The actual database OID/name, schema OID/owner and complete server-version number
must also match the issued native witness; matching copied metadata alone cannot
establish its location in the trusted connection context. These identifiers are
cluster-local metadata; the host still selects and authenticates the connection
endpoint.

The shared lock survives the observer's savepoint release until the caller
ends the transaction, excluding compliant migrators across later work in that
transaction. Timeouts are bounded1..300000ms and restored; errors roll back the
observer savepoint and preserve a healthy outer transaction and row factory.
The method never begins an outer transaction, commits, changes identity or
retries. It returns observedPrincipal and digests with lifecycleAdmission false.
This is current-head observation, not operation admission, principal validation,
live data-table/privilege verification or a freeze of native role catalogs.
Raw-connection observation remains Psycopg3-specific. The per-call compositions
below carry separate native evidence; complete generated execution is unqualified.

The host now exposes `prepare_table_head` to produce the same fixed observation
recipe consumed by the raw Psycopg3 observer and the session integrations. It
revalidates original source and trusted reference before any lease. Its internal
query protocol is library-owned verification work, not a query-authoring surface
or data admission capability. No source-selected SQL/callback is accepted.

`observe_table_head(session,identity,bundle,reference)` and its explicit
`observe_table_head_async` counterpart acquire one existing per-call session
lease. Supported candidate compositions are Psycopg3 sync/async, Psycopg2 sync,
SQLAlchemy Core2 sync with Psycopg2/3 and async with Psycopg3. ORM Sessions and
other drivers are not selected implicitly. `SessionPolicy(catalog_only=True)`
is required; the earlier default search path remains unchanged. Registry and
schema mismatches refuse before acquiring a connection. Identity, transaction
ownership, savepoint rollback, settings restoration and pool disposal remain
owned by the existing adapters. Control cursors use tuple rows without changing
the caller's native row factory. SQLAlchemy control execution stays in Core.

Async preparation schedules the bounded synchronous embedded V8 verifier in a
worker before opening a lease: V8's synchronous timeout interface cannot run
inside an event loop. Cancelling preparation cannot later acquire a connection;
the worker may finish within its own existing resource/deadline bounds. Native
database queries remain genuinely async. Repeated cancellation during an actual
advisory-lock wait must complete transaction/lease cleanup before propagating;
healthy connections are restored, failed ones discarded. No query/write retry
is introduced.
The synchronous observer also remains callable inside an already-running host
loop: only bounded CPU verification moves to a temporary worker and is waited
synchronously. It neither runs a coroutine nor moves the caller's connection
or synchronous driver IO to that worker.

The observation still reports lifecycleAdmission false. An adapter-owned helper
ends its read-only transaction before returning metadata; it does not return a
held execution permit. Caller-owned use preserves the active outer transaction.
Live data-table/privilege/principal admission and generated methods remain
required. Business operation lowering remains Weft-owned. Fixed metadata
statements preserve quoted identifiers including literal percent: parameterized
metadata INSERTs escape only the identifier's DBAPI percent transport, unbound
queries omit parameter frames, and Core uses explicit no-parameter execution.

`prepare_table_correspondence` additionally binds an explicit trusted native
principal and `person`/`batch` audience. Its session counterparts are
`verify_table_correspondence` and `verify_table_correspondence_async`. The same
fixed query scheduling and lease/transaction ownership apply. These checks
establish current selected installation correspondence, not business-operation
authorization: results retain lifecycleAdmission false and operationAdmission
false. An adapter-owned observation ends its lease before returning metadata.

The current head must match first. The actual role must equal the trusted
registry selection and satisfy the source audience's native role boundary.
Person identities cannot be audience umbrella roles; batch identities must
inherit the separate batch audience and cannot reach person/owner authority.
Shared native role checks cover configured root/group roles and the actual
principal, including SET-then-INHERIT reachability, dangerous flags, predefined
roles, ADMIN options and session_replication_role SET authority. A stable scope
digest includes selected/current role OIDs, flags, effective closure and MEMBER
closure. MEMBER-only edges are included because declared group policies use
that native relation even when INHERIT and SET are disabled. Role-closure
capacity is4096 per checked role. A digest is an observation, not a frozen grant.

Current data-table columns/defaults, constraints, indexes, source policies,
native ownership/access methods and table/column ACLs must match the witness
issued after original-source proof. Source schema ACL and relation inventory
must agree exactly; owner/person/batch roots must retain the dedicated-schema
external-authority preconditions. Actual people may retain other plugin grants.
Live checks cannot substitute a new first-observed witness for a mismatch.

Both administrative source proof and ordinary correspondence additionally
require exactly the eight source audience/command policies, no user triggers,
no inheritance, and no incoming FK from outside the module. Internal constraint
triggers must be enabled normally, refer to known module constraints of the
qualified FK/Key kinds, and use native pg_catalog implementations. This closes
omissions that the earlier table witness alone could not detect. Known module
FK/Key semantics remain checked against their original source definitions.

Metadata verification does not demand SELECT on every declared table: denied
tables remain denied. The shared module advisory lock excludes compliant
migrations; selected native business statements acquire their own table locks.
Privileged role/ACL/DDL changes outside the protocol require operator quiescence;
observations do not freeze PostgreSQL authorization catalogs. Full correspondence
remains available through the explicit diagnostic API. Ordinary operation
admission uses a smaller path: acquire the shared lifecycle transaction lock,
check installed head/location and selected principal/audience/declared-group
scope, then execute the trusted compiler's statement with native privileges and
forced row policies. The session lease already checks the effective role and
restores settings. The lock excludes compliant migrations until the transaction
ends; external privileged changes require the stated quiescence. Repeating
full correspondence before an outcome lock, after waiting and after effects
adds no required protection under this boundary and MUST be omitted. No
`nativeTableCorrespondenceVerified:true` claim follows from the smaller path.
Its versioned policy-scope digest includes principal/audience/group native OIDs
and declared group MEMBER facts; it does not inventory unrelated role or table
metadata. This scope change deliberately invalidates prior continuation and
receipt scope hashes without changing the durable outcome slot identity.

This plan-generation subset supports initial deployment, appended tables/indexes,
nullable appended stored Fields/columns without defaults, corresponding generated
domain CHECKs and column UPDATE grants, and command-specific policy/grant changes.
Existing columns/Keys/FKs/indexes and source meaning remain exact. Policy changes
use original compiled ALTER POLICY clauses plus exact GRANT/REVOKE deltas; role,
schema and audience identities remain fixed. Source command-only revisions may
advance a generation without DDL. Removal, native type changes, required-column
backfills and other unqualified evolution refuse explicitly. No destructive or
partial plan is inferred. Every candidate requires trusted approval.

Seed plans carry either `seedExecution:"none"` or
`{version:"umf.table-seed-execution/0.1",sets:[original IDs]}`. Prior seed sets
are an immutable prefix; only newly appended sets execute, once per successful
migration. The selected source must be JSON, with at most128 selected sets and
256 UTF-8 bytes per selected ID. The existing total module bound is10000 rows.
Weft compiles the original source/binding and selected IDs directly through
`weft.table-seed/0.1`; no generated command is inserted into rewritten source.
Existing exact scalar/domain codecs validate values, omissions and primary-Key
conflict `error`/`ignore`. Authored set/row order is preserved. Adjacent rows with
the same table/omission shape may form chunks of at most1000; self-FKs or empty
assignment shapes retain row statements. Prepared table/Field definitions are
indexed once per compilation, and results are compact counts, not per-row durable
outcome objects. Native value expansion is at most8MiB.

Seeds execute only as the approved installer inside the migration transaction,
after catalog/privilege verification and the exclusive lifecycle lock. Touched
tables acquire exclusive native locks while RLS is temporarily disabled for this
administrative step. Constraints stay active. RLS is enabled/forced and the
catalog reverified before witness/history publication. Error or cancellation
rolls back seed data, DDL, RLS changes and the ledger together through the enclosing
savepoint; native sequence allocation retains PostgreSQL's normal semantics.
Normal person/batch grants are never broadened for seeds. Replaying an already
applied migration performs no seed DML. [Candidate execution evidence](../../04-build/evidence/praxis-p2/seed-migrations/receipt.json)
qualifies the local PG18 subset; publication and full Praxis acceptance remain
separate gates.

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

### Prepared source and trusted compiler boundary

Native readers/writers may reuse their library-owned verified source, reference,
binding and parsed command index while retaining the same immutable session
policy. Current subject registration and a fresh principal/audience-bound probe
remain per call. Policy replacement invalidates preparation. No native authority
observation, lease, generation result or business row is cached. New generations
require a new committed reference and binding. Process guarding must precede
cache locks inherited from a parent process.

The installed in-process Weft compiler is part of the trusted host toolchain.
Its immediate output need not be recompiled by the same engine. Runtime ABI,
result, transport and obligation compatibility checks remain mandatory before
execution. Persisted or externally received artifacts require verification at
their ingress; the declared native reader/writer API accepts source declarations
and values, not caller-supplied compiled programs. This does not remove original
source approval or live installed-generation/identity checks.

### Commands and consistency

A `related` operation predicate selects an original table in the owning module,
explicit source/target equality pairs and a nested typed predicate. It lowers to
correlated native EXISTS; NULL equality does not match. Both tables retain native
SELECT privileges/RLS and appear in command obligations. Exact native scalar
capacity is required for equality pairs; no FK or cross-module authority is
invented. Nesting shares the bounded predicate budget.

Named reads and writes MUST use the same typed operation model and Weft compiler
as directly composed methods. Commands declare stable ID, exact input/output
identities, bounds, required capability and consistency. A bare SQL string is insufficient for a named statement. A source-declared
`query` below is compiled against exact typed inputs, derived result domains
and registered owning-module tables; invocation accepts only its ID and values. Upsert declares an original nondeferrable Key,
create input, update whitelist, conflict behavior and returned key/count shape.
Native ON CONFLICT behavior and races require independent qualification.

The owner selected declared typed operations for final consumer acceptance on
2026-10-19. Existing consumer raw-SQL escape methods are migration inputs, not a
required untyped public entry point. Each required read/write becomes a declared
operation with exact inputs/results and module capability; unsupported SQL is
reported for explicit conversion rather than delegated to a consumer query layer.

### Fixed typed PostgreSQL query source

A `umf.table-operation/0.1` read may declare
`body:{kind:"query",language:"weft.pg-select/0.1",sql,outputs,maxRows}`. The
fixed `sql` is compiler input retained in the approved original module source;
it is never an invocation parameter. Existing `parameters:[{id,field}]`
provide exact core0.10 Field domains, including owning-module DTO Fields.
Every named bind must resolve to one declared parameter, with no unused
parameter. Ordered `outputs:[{name,field}]` have distinct aliases and Field
identities. Weft resolves the source expression and conservatively establishes SQL
nullability. The selected PostgreSQL backend determines native result types on
first use and checks agreement with each declared Field. An authored output type cannot
assert that a nullable aggregate or outer join is required.

Weft parses one read-only statement, resolves base relations against registered
tables in the owning module and emits the complete touched-table SELECT
obligations. Identity column mappings use the pinned physical base relation
with the original logical alias, preserving PostgreSQL primary-key functional
dependencies without a projection. Renamed columns use a simple physical-to-logical
projection; explicit column-alias lists also retain that projection so ordinal
renaming follows the declared mapping order. PostgreSQL resolves column references,
CTE and derived-table aliases, ambiguity and native expression types. Projections
introduce no materialization stage, but PostgreSQL does not infer primary-key
functional dependencies through them: queries over renamed projections must author
complete GROUP BY expressions. This profile uses
the deployment's whole-table SELECT grants and native RLS; it does not claim
compatibility with independently configured column-only SELECT grants.

CTEs, subqueries, aggregates, functions, casts and windows remain inside the
implemented closed SELECT syntax; unsupported AST nodes refuse. Physical schema
qualification, cross-module lookup and invocation-supplied SQL are unavailable.
Normal principal/lifecycle checks apply to every read. The same generated typed
method and native binding dispatch this body; embedders do not choose a second
SQL execution path.

The source bound is1MiB UTF-8 and1600 output columns; `maxRows` is1..1000.
This profile returns bounded `many` rows and has no caller-selected pagination,
row bound or write/replay behavior. The normal8MiB complete native/wire frame
bound applies; excess results refuse rather than silently clipping source
semantics. A source-authored LIMIT/OFFSET retains its PostgreSQL meaning.

`weft.pg-select/0.1` inherits the scoped PostgreSQL session's timezone and
locale. In particular, `date_trunc` on timestamptz groups in that timezone and
`to_char` retains the selected locale's formatting. Only explicitly authored
normalization can change those semantics; UTC rendering of returned instants
does not make month grouping timezone-independent. A finite PostgreSQL float8
result uses PostgreSQL `float8send` with hexadecimal binary transport
(`nativeEncoding:"ieee754-binary64-hex"`) and maps to a finite Python IEEE
binary64 `float` through core `floatToken`. This preserves native bits even
when the caller sets `extra_float_digits` to a lossy text precision;
NaN and infinities refuse. Exact integers and decimals retain separate codecs.
No mathematical exactness is claimed for binary floating-point arithmetic.

A native binding owns one immutable prepared module shared by its reader and
writer. It admits original source and builds schema/name/column indexes once;
selected operation metadata and fixed query AST/SQL are prepared lazily once per
operation. Namespace-qualified records and module-qualified relationships use
exact indexes, including when different modules reuse the same names. CTE bodies
share a name index and visibility prefix rather than copying growing sets.

Calls carry only typed inputs, batch items, paging values and the idempotency
key. They MUST NOT serialize, parse, clone or hash the whole schema, reconstruct
source proofs, or return the original request and full binding as a transcript.
The trusted compiler's compact execution program retains only metadata needed
for execution, result conversion and durable outcomes. Standalone export/check
APIs may retain self-contained source for an explicit external ingress; generated
native methods always select the prepared path automatically.

Index storage is linear in admitted elements, columns, relationship references
and command identities; it stores coordinates or shared references rather than
another full object image. Scalar Field preparation retains canonical allowed-value
membership once; checking a supplied value does not clone or rescan the authored
allowed-value list. Query parameter occurrence order, referenced identifiers,
selected table coordinates and DISTINCT projection membership use indexes rather
than repeatedly scanning parameter lists, schema inventories or rendered SQL.
Seed compilation indexes selected sets, field positions, required fields and
generated columns once. A sparse row visits its supplied cells and required-field
inventory; it does not scan every column to find each cell. Native conversion
uses values already validated by admission; seed/default ingress validates once
before conversion rather than repeating the same scalar checks.
Independent-insert eligibility builds the module's
policy dependency graph once and computes strongly connected components with
O(V + E) graph visits and O(log V) ordered-index lookups; it does not traverse
the whole graph for each table. Invocation
work depends on the selected operation's
syntax, supplied values and batch size, not unrelated schema contents. Dynamic
CRUD lowering may rebuild that operation's SQL shape for paging or batch inputs;
it reuses admitted metadata. Native query cost still follows the authored query
and PostgreSQL plan. Result conversion is linear in returned cells.

The first query invocation describes the original typed query with an outer LIMIT 0
inside its normal verified read-only native lease. The runtime compares output
names and native type OIDs, then retains only the small metadata tuple; it
retains no connection, prepared handle, authorization decision or result. The
constructor performs no native I/O. Concurrent first calls may repeat this
cold description; no Python lock is held over sync or async driver I/O. A
failed description does not warm the cache. Native OIDs do not prove expression
nullability, numeric range or precision: derived expressions require nullable,
unrefined DTO Fields unless the compiler establishes a narrower guarantee.
Normal calls check the versioned compiler output
ABI and supported obligation envelope; they do not reconstruct and compare the
trusted compiler's source proof. Native session/lease and lifecycle/principal
observations remain per call. Result conversion is linear in returned cells.

The ordinary SQL budget follows directly from the statement schedule below.
`W` is the number of native effect statements: one for a scalar write or an
eligible independent insert batch; ordered fallback operations use their
explicit number of item statements. Driver BEGIN/COMMIT and caller savepoint
commands are excluded. A first fixed query adds one metadata description;
warm calls add none. These are structural counts, not timing targets.

| Operation | Adapter-owned transaction | Caller-owned transaction |
| --- | ---: | ---: |
| Ordinary read, page or count | 8 | 10 |
| First use of a fixed typed query | 9 | 11 |
| Fresh write or batch | 9 + W | 11 + W |
| Matching durable replay | 8 | 10 |
| Explicit outcome observation | 9 | 10 |

The read budget is three lifecycle/principal statements, one business statement
and four adapter session statements. Writes omit the read-only transaction
statement and add outcome lock/read, effects and outcome insert. A caller-owned
lease saves/restores its existing settings; reads additionally check that the
outer transaction is already read-only. No row adds another schema admission,
native catalog inventory, permission-closure scan or object-image copy.

Durable replay binds module, full source/deployment authority, authenticated
principal, command identity, idempotency key and exact input digest. The write
and durable outcome are atomic. Matching replay rechecks current authorization;
a different input/principal cannot consume the receipt. Concurrent attempts
have one declared native outcome. Lost response after commit is uncertain until
that durable outcome is observed; no driver or generated client retries writes.
Counts use the caller's RLS and declare their statement/snapshot consistency.
Keyset ordering MAY mix ascending and descending required ordered scalar Fields.
Its suffix MUST contain the complete original unique Key in declared Key field
order; every ordering Field MUST be projected and carried in the cursor. Nullable
sort Fields are not admitted in this profile. Continuation compares the complete
lexicographic tuple using each declared direction, with exact scalar values.

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

## Finite PostgreSQL temporal/domain candidate

The unpublished implementation admits native `date` and `timestamptz` columns
for explicit current-core date and instant fields. It preserves source/request
lexemes and normalizes instants to UTC without rounding. The finite native profile
covers Gregorian years0001–9999 and microsecond-exact instants with explicit
numeric offset or `Z`; unknown offsets, leap seconds, UTC year overflow and
sub-microsecond rounding refuse. Date/timestamp facets and allowedValues remain
unqualified. A timezone-free native `timestamp` mapping remains refused.

Deployment emits source-derived named CHECK constraints for finite date/instant
year bounds and nonfinite numeric rejection. These constraints join the exact
expected catalog inventory and cannot be removed without invalidating admission.
The explicit `currentTimestamp` default is PostgreSQL transaction timestamp;
returned instants use fixed UTC formatting. Nullability remains independent of
CHECK's ordinary unknown-result semantics.

New sources with generated finite-domain checks issue nested native witness0.2.
Default and CHECK expression custody uses PostgreSQL native expression trees,
which retain typed constants without ambient timezone/date-format deparsing.
The native engine/location pins and full original-source scratch correspondence
still apply. Existing sources without these generated checks retain their
witness0.1 representation. No installed witness is silently upgraded or blessed
from newly observed state. Earlier cohorts and broader runtime upgrades require
explicit qualification/migration.

## Blocking scalar domains and transaction-time values

The unpublished native profile derives CHECK constraints from logical singleton
string/boolean/integer/decimal enumerations, exact numeric ranges, integer widths
and Unicode-scalar/byte length bounds. Native capacities remain independent.
Nullability is enforced separately; a null member cannot turn a false SQL IN
result into an unknown CHECK success. Unknown facet qualifiers refuse rather
than disappear. Temporal and container refinements retain their separate gates.

Integer/decimal deployment literals normalize mathematically without floats;
zero with an extreme exponent emits finite zero. Native numeric resource limits
refuse before SQL emission. Complete original source tokens remain preserved.
Generated Python retains exact literal metadata for large integers and decimals;
representable primitive enumerations also generate Literal annotations. Constructor
and pre-dispatch checks retain membership, range inclusivity, width and length.
Decimal source candidates normalize trailing zeroes without Decimal-context
rounding. Invalid Unicode refuses before transport.

`TableOperationValue` additionally admits `{kind:"currentTimestamp"}` only for
an explicit instant mapped to `timestamptz`. It may supply an assignment or typed
comparison operand; it declares PostgreSQL transaction-time semantics and emits
fixed `CURRENT_TIMESTAMP`. It adds no caller parameter, function name or SQL
escape. Fresh writes and replay observations retain the same durable-key contract;
a recovered invocation does not evaluate the write again. Source checking and
actual person/batch native authority remain mandatory.

## Atomic source snapshots

The candidate `insertFrom` body declares a target table, a same-module source
`{table,where}`, explicit target assignments, returning fields and an effect
bound. It is one INSERT-SELECT statement over natively visible source rows;
separate read/insert execution is not equivalent. Missing/hidden source rows
produce zero effects. Excess matches abort the entire mutation rather than clip.
Replay recovers the original effect receipt without reading/copying source again.

`{kind:"sourceField",field:Ref}` is available only in these assignments and
references a mapped field of the declared source table. Native capacity must
match exactly, nullability must be compatible, and source refinements must prove
the target restrictions. Finite enumerations can prove compatibility value by
value; otherwise every target facet must be present unchanged on the source.
Source-only refinements may be dropped on the wider destination. No numeric
rounding, string truncation or availability assumption is introduced.

`{kind:"currentPrincipal"}` evaluates the effective PostgreSQL current_user as
text, using the authenticated native session. It supplies no caller parameter
and requires native text/varchar storage. Native target constraints continue to
apply. Snapshot capture requires target INSERT (and SELECT for returned fields)
and source SELECT, with each table's own RLS. Targets, source rows, identity and
transaction time remain inside the same native statement/transaction boundary.


## Reviewed lifecycle completion profile — 2026-10-21

Core descriptions generate deterministic table/column COMMENT statements, with
native correspondence checks. No duplicate native description field is added.
Description-bearing deployments use bundle0.2; the verifier retains exact legacy0.1 regeneration without comment emission. Description-free bundles retain their original representation. Explicit removal of an authored description clears its comment during migration.

Migration requests may explicitly select a versioned options profile. Backfills
name original zero-parameter typed UPDATE declarations, source table/column and
an explicit acknowledgement of administrative access to scoped rows. Weft alone
lowers these declarations. Required appended columns are first added nullable,
backfilled under the install owner's reviewed administrative custody and then
made NOT NULL. A selected server default is installed only after the explicit backfill; it does not silently replace that step. Backfill bounds are enforced with whole-migration rollback;
constraints remain enforced and RLS is restored before correspondence checks.
Arbitrary SQL and unreviewed scoped data effects are refused. Existing columns'
types, keys and meanings cannot be changed by this profile. Added authored
checks/FKs validate existing rows inside the migration transaction.

Policy changes produce located permission-change review notices. All plans still
require their exact digest approval; an unsupported destructive change cannot be
made executable by approval. History checks close over original plan digests,
predecessors and final source snapshots. CLI new/check are offline; apply is an
explicit host command with a caller-selected connection and trusted approval/head.

Concurrent index options select only newly appended ordinary/unique btree indexes
on existing tables, in index-only migrations without seeds, policy or column
changes. A separate autocommit administrative runner serializes with the same
lifecycle lock across phases. It verifies native source correspondence for each
completed prefix, refuses invalid indexes with a named repair requirement, and
requires explicit approval to remove/rebuild an invalid source-selected index.
A missing receipt after execution is reconciled from native index validity and
exact shape, never from IF NOT EXISTS. The immutable ledger advances only after
all phases and the complete final source verify. The head view's person/batch SELECT grants are durably revoked before the first phase, including after failure or an in-progress return; source-shape verification temporarily restores them only inside a rolled-back savepoint. Final head grants and ledger publication commit together. Transactional application refuses
nontransactional plans. No mixed-phase atomicity is claimed.

Domain qualification uses fabricated legal-pack data. Matter access follows
explicit team membership, ordinary callers cannot create membership, and service
permissions are command-specific. This is native PostgreSQL policy, not evidence
of complete ethical-wall or shared-security semantics. Original domain source and
projection decisions remain retained; no real client/person data is required.

## Revision2 U1–U3 evolution profile

The separately selected evolution profile extends the bounded completion profile
above. Legacy plans MUST regenerate byte-for-byte under their original version.
New plans use `umf.table-migration/0.2` and options use
`umf.table-migration-options/0.2`. UMF owns declaration and DDL planning, Weft owns
typed seed/backfill data SQL, and the host owns administrative connections,
authentication and approval. The 0.2 options retain explicit `backfills` and
`concurrentIndexes` and add explicit `reviewedChanges` and `validations` arrays;
empty arrays mean no selections. Exact schemas remain closed and versioned.

**U1 — mixed phases.** One approved plan MUST order nullable column addition,
explicit scoped backfill, required-column completion, concurrent index creation,
and CHECK/foreign-key ADD NOT VALID followed by VALIDATE. Each step MUST carry
its transaction mode; validation is an explicit kind. A required phase commits
its effects and progress atomically. Concurrent index creation runs outside a
transaction with durable dispatch custody and exact native shape/validity
recovery. NOT VALID does not promise lock-free DDL. Seeds remain explicit, typed
and ordered; their effects and completion receipt share one transaction.

Progress MUST bind the approved plan digest, predecessor head, original file
digest when supplied, ordered phase/step digests and verified completed prefix.
An interrupted runner MUST resume the first unfinished phase without replaying a
committed backfill or seed. Divergent progress, changed file/source or unexpected
native objects MUST refuse. A missing concurrent completion receipt MAY be
reconciled only from exact source-selected native index shape and validity;
invalid-index repair requires explicit approval and exact failed-object custody.
The same lifecycle lock spans all phases. Person/batch metadata-head access MUST
remain durably fenced from before the first committed effect through final
publication. The immutable generation ledger and restored head grants commit
together only after complete final catalog, privileges, RLS and source checks.
Uncertain commit outcomes require observation, never automatic effect replay.

Any new progress relation MUST use a fixed, versioned, owner-only metadata shape,
with exact inventory, schema and privilege verification. Its admission MUST be
selected by the mixed execution profile; a generic exception for unknown metadata
tables is forbidden. Legacy installations retain strict inventory semantics.

**U2 — reviewed existing-object changes.** The evolution profile MUST enumerate
changes before effects. Each review marker identifies an exact change ID, kind,
original source path and old/new canonical value digests; absence uses the
canonical null digest. The approved plan digest closes over every marker.
Unknown, duplicate, stale or unused markers MUST refuse. Missing review for a
destructive change MUST report `destructive_change_unreviewed` and list affected
native objects by name and original source path. Approval MUST NOT suppress
unsupported semantics, dependency analysis or native correspondence checks.

The selected surface covers column drop/rename, native type changes, NOT NULL
tightening/relaxation, Key replacement, constraint/index drop/rename/replacement
and command policy changes. Stable IDs identify objects; array position and
display name do not establish identity. Column drop explicitly discloses lost
stored values and uses dependency-aware RESTRICT behavior. Every affected Key,
FK, check, index, policy and declared operation MUST have an explicit compatible
next-source change and ordered plan or cause a located refusal. CASCADE and
unreviewed dependent deletion are forbidden. Policy changes require markers even
when a prior bounded profile emitted only a review notice.

Type changes MUST admit a finite conversion inventory, including lossless integer
widening and compatible capacity widening where logical and native domains agree.
Selected conversions MUST name their strategy; arbitrary USING SQL, truncation,
rounding, guessed timezone changes and unknown conversions refuse. NOT NULL
tightening verifies populated rows natively and rolls back on nulls; it never
invents values. Key replacement preserves ordered fields and primary/unique
meaning and refuses unresolved inbound FK/operation dependencies or invalid data.
Every supported change kind requires native positive and refusal evidence.

**U3 — lossless row_scope authoring.** A bounded normalizer MAY accept the retained
Praxis block and return canonical explicit person/batch command maps plus the
copied original block and source-to-output locations. Unknown content MUST remain
preserved and refuse interpretation. Omitted commands map to deny. Person owner
and explicit via branches combine with any; a via branch uses related with exact
supplied Field pairs and an owner predicate on its person Field. The source
Record, association table, person Field and every join pair MUST resolve through
explicit context. Matching names MUST NOT infer an FK or join. Unknown groups,
ambiguous mappings and policy dependency cycles refuse. Trusted group aliases map
to memberOfRole; an explicit open read maps to allow for that command only.
Batch is an independently authenticated audience. The supplied block MUST yield
person CRUD and batch SELECT/INSERT, with batch UPDATE/DELETE denied. Canonical
payloads retain all four commands and ordinary FORCE RLS, old-row USING and
new-row WITH CHECK semantics. Native RLS qualification does not establish
shared-security or complete ethical-wall equivalence.

### Field migration release boundary

SD-007 and US-051-AC11–16 govern the broader field lifecycle. This profile's
qualified subset MUST distinguish appended-column backfill from tightening an
existing optional column. Tightening is fail-if-null under atomic native
constraint activation or a qualified fenced phase; historical null filling of
an existing column remains explicitly unsupported until separately qualified.
A metadata-head fence alone MUST NOT be presented as protection against direct
authorized SQL; native locks/constraints or a documented writer-quiescence
precondition protect actual data through validation and activation.

DROP RESTRICT is only a native safeguard. PostgreSQL can automatically remove
local indexes and constraints when dropping a column, so the planner MUST resolve
typed dependency closure before emitting the drop. Every affected local/inbound
constraint, index, Key, policy and operation MUST have a reviewed compatible
companion change or a located refusal. SQL-name matching alone does not prove
closure. Relevant unknown or externally uninventoried dependencies refuse.
The review surface MUST name the column/Field, deleted stored values and approved
immediate irreversibility or an explicit recovery policy. Retained schema/source
history is not retained instance data and cannot establish data rollback.

Finite type conversions MUST validate logical scalar meaning, nullability,
facets, defaults, allowed values and unknown extension semantics alongside native
capacity. Physical widening cannot authorize unrelated semantic narrowing.
Combined changes need a verified dependency/name order or explicit refusal.
Committed staged effects may remain after failure while the old metadata head
is retained and all ordinary clients stay fenced. Only uncommitted atomic
effects roll back. No release claim may imply full migration support, online
rewrites, arbitrary transforms or retained-value recovery from this bounded
profile.

## Embedder completion successor

The owner-selected [completion plan](../../04-build/praxis-embedder-completion-plan.md)
extends the released U1–U3 profile without changing the meaning or regeneration
of historical 0.1/0.2 plans. U4 reuses description comments and canonical enum/range
facets. U7/U8 delivery claims MUST name actual installed platform/Python/wheel
receipts and full locked dependency closure; generated stdlib-only code does not
make administrative source verification V8-free.

### G01 existing-column fill and tightening

Use `umf.table-migration-options/0.3` and `umf.table-migration/0.3` with
`executionProfile.version: "umf.table-migration-execution/0.2"`. Options retain
exactly `version`, `backfills`, `concurrentIndexes`, `reviewedChanges` and
`validations`, with the existing array bounds and closed member schemas. Neither
0.1 nor 0.2 gains existing-column fill by reinterpretation. Retain the existing
closed backfill selection shape `{table,column:{module,element},operation,
scopedRows:true}` and reviewed `tighten-not-null` marker. All selectors and markers
MUST be consumed exactly once and bound by the plan digest. The same stable table
and Field MUST exist in both sources; the selected Field changes only from
optional to required. Physical names, logical/native type, facets, default,
collation, generated/immutable status and relevant dependency meanings remain
unchanged. Generated/immutable targets and rename/type/default/dependency
compounds refuse in this first G01 capability.

The operation MUST be an original command in the exact approved next source:
parameter-free, non-batch, bounded typed UPDATE, no returning rows, exactly one
assignment to the selected Field, and exactly its `isNull` predicate. Only admitted
non-null typed literals or existing qualified transaction-clock expressions are
allowed. A clock cannot silently become a date. Weft lowers the selected data SQL;
the host enforces its effect bound. The selection authorizes the acknowledged
administrative scope across native NULL rows; no other values or Fields change.

The compiler MUST pair the fill and reviewed NOT NULL activation in one typed
phase with `kind: "backfill-tighten"`, `transaction: "required"` and exactly the
ordered backfill and matching tightening step IDs. Pair correspondence uses typed
table/Field identities, never SQL-text matching. Execution profile 0.2 admits this
pair plus existing qualified phase kinds; execution profile 0.1 remains frozen
and MUST reject it. Host validation MUST reject a split pair or mismatched target.
The fixed owner-only progress relation may retain its storage version only if
its exact receipt meaning, schema and privilege verification remain unchanged;
no generic metadata exception is introduced.
After predecessor, source, approval and native-authority checks, the host holds
native exclusive locks across the UPDATE and actual complete-table NOT NULL
activation, restores/verifies RLS and privileges, and commits effects plus phase
receipt together. No commit/concurrent step/lock release may split that pair.
A metadata-head fence alone is insufficient for directly granted SQL writers.
Existing native Key/CHECK/FK constraints stay effective; bound/constraint failure
rolls back the uncommitted pair. Whole-table validation cannot be replaced by a
sample or a cached count.

Known aborted pairs may retry. An uncertain outcome MUST be observed from exact
source-bound progress/native witnesses before any dispatch. A committed pair
never repeats its UPDATE or transaction-clock evaluation. Later failure retains
committed data and NOT NULL with clients fenced until exact resume or separately
authorized forward repair. Existing future-default semantics do not change;
a default is not historical fill. Without selected fill, ordinary tightening
remains fail-if-any-null. Unsupported selectors return located
`TABLE_MIGRATION_OPTIONS` refusals; no partial executable plan is returned.

### U5 host-neutral applier and approval custody

The reference applier MUST check a forward-only ordered history, original file
digests, expected predecessor, complete terminal source and exact plan authority
before effects. A typed host adapter supplies exclusive migration custody,
transactional effect/progress persistence, native observation, trusted identity,
and atomic final history/head/grant publication. Its declared capabilities MUST
satisfy the selected execution profile; three unrelated callbacks for reading,
running SQL and recording a row cannot imply those guarantees. Unsupported host
atomicity, fencing or uncertain-outcome observation refuses before dispatch.

Approval is a separate immutable host-owned receipt bound to target installation,
exact plan/file digests, expected predecessor, authenticated decider and decision
time, plus the native qualification profile/evidence accepted by that decider.
The host supplies identity and time; author metadata cannot issue approval.
Compiler `nativeQualified:false` is preserved. Record approved authority durably
before effects; effects/progress and final publication remain atomic under the
existing lifecycle rules. Changed approval, target, plan, file or head refuses.
An approval can be recorded before an aborted operation; such a receipt does not
assert that effects committed. An uncertain result requires observation rather
than automatic execution replay. Native installation metadata changes require an
explicit versioned profile and exact inventory/ACL verification.

### Approval metadata transition and installation reference 0.3

An owner-only approval relation is persistent administrative metadata, not an
application table or a temporary migration object. Its existence MUST be selected
by the exact verified plan 0.3 `approvalProfile`; a relation name, observation,
caller boolean or opaque reference digest cannot establish that selection.
Historical default catalog/privilege verification retains its exact inventory.

Before publication, approval issuance and resume MAY verify the installed
predecessor through a private transition context. That context MUST contain the
current source-recompiled plan 0.3 with the exact approval profile, its exact
expected predecessor/head and an installed bundle equal to `plan.previous`.
Verify the complete history/source chain and ordinary predecessor catalog first;
then admit only the fixed approval relation under that context after its native
fixed-schema/owner/privilege proof. A changed source, predecessor/head, unknown
metadata object or unselected profile refuses. The transition does not modify the
predecessor plan, widen ordinary historical verification, create an implicit
upgrade or authorize data effects. Approval rows still require their exact
host-issued binding and current native authority before dispatch.

After committed publication, trusted administrative issuance returns
`umf.table-installation/0.3`. Its closed key set is exactly the 0.2 reference key
set plus:

- `approvalProfile`: exactly `{version:"umf.table-migration-approval/0.1",
  relation:"umf_lifecycle_approvals",ownerOnly:true}`;
- `approvalPlanDigest`: the digest of the latest verified applied plan 0.3,
  equal to the reference's existing `planDigest`;
- `approvalShape`: the exact normalized read-only native metadata snapshot,
  including relation state/OID/owner, columns, constraints, indexes and table and
  column ACLs, after fixed-schema proof against a protected scratch relation.

The canonical `referenceDigest` covers all these fields. Issuance requires the
latest verified history plan to select that exact profile and the entire final
source/catalog/privilege/approval shape to agree. The existing HEAD view and its
plan/head digests remain unchanged; no approval receipt rows are projected.
This is catalog custody, not a compiler assertion of native qualification and
not a new client-issued capability. Trusted deployment configuration supplies the
expected reference; arbitrary requests cannot choose it or gain authority by
rehashing one.

Ordinary head/full correspondence observations MUST compare approval shape using
fixed read-only PostgreSQL catalog queries, and admit exactly its one fixed
relation in the inventory only for the checked 0.3 reference. Person/batch roles
receive no approval-table SELECT, row/column grant, lock requiring table
privilege, scratch DDL or access to approver, decision, timestamp or evidence
contents. Missing/extra relation, wrong owner/ACL/structure, trigger/rule/policy,
foreign dependency or changed profile/plan binding refuses. Existing 0.1/0.2
references retain exact keys and inventory; adding a lookalike approval relation
cannot make an old reference pass.

The bounded normal-operation admission path retains its existing trusted
reference, shared migration lock and privileged-catalog quiescence boundary;
this amendment does not promise continuous approval-row/catalog inspection per
data statement. Explicit full correspondence is required after privileged metadata
changes before service resumes. On an installation with selected persistent
approval metadata, new effects MUST use a successor plan that selects it;
unsupported downgrade to a new profile 0.1/0.2 plan refuses. Historical replay
verifies its immutable original plan and returns a reference for the verified
current installation, including 0.3 where selected. Never delete durable approval
rows merely to satisfy an old inventory.

### U6 parsed untrusted-SQL containment

The optional containment checker accepts original SQL plus explicit target
schema, owned-object/role inventory and supported profile. It is inert and
returns a checked result or located refusal with source retained; it never grants
execution authority. A real PostgreSQL parser MUST parse every statement into a
bounded tree. Positive supported-node and object-reference closure traverses
CTEs, subqueries, expression/callable references and all DDL/DML targets. Unknown
nodes, ambiguous unqualified resolution and unsupported indirect effects refuse.

The selected profile MUST reject foreign schemas, role/schema creation, stored
functions/triggers/procedures, session settings and grants outside its owned
tables/approved role inventory. Search-path assumptions, quoted identifiers,
comments, dollar strings and multi-statement input cannot evade that closure.
Function/operator/type references require an explicit safe admitted inventory;
being inside an owned-schema statement does not make arbitrary calls safe.
Trusted runtime role/timeout/fence setup is separate host code. Passing
containment never replaces original-source regeneration, review/approval or live
native correspondence, and never introduces raw SQL into typed G01 operations.

### G02 typed same-row backfill successor

This section implements SD-007's selected finite algebra. It changes no historical
operation 0.1 or migration/options 0.1–0.3 grammar or replay meaning. All objects
below are closed; unknown members and versions refuse before a runnable plan or
native program is returned. Unsupported extensions remain retained in source.

| Surface | G02 version and rule |
| --- | --- |
| Source declaration | `umf.table-operation/0.2`; only the closed UPDATE below |
| Options / plan | `umf.table-migration-options/0.4` / `umf.table-migration/0.4` |
| Execution profile | `umf.table-migration-execution/0.3`; required atomic phases below |
| Weft compiled program | `weft.table-operation/0.2`; exact-value guard required |
| Deployment bundle / module preparation | Existing versions and signatures retained; explicit source-operation version dispatch |
| Approval / installation reference | Existing approval 0.1 and installation 0.3; latest approval plan digest may bind verified plan 0.4 |
| Progress / history storage | Existing exact schema, privileges and receipt meaning; no new relation or metadata exception |
| UMF opt-in Rust migration | Explicit refusal of options/plan 0.4 until separately implemented and qualified |

An old compiler, source interpreter or host MUST refuse a successor it cannot
verify. Retaining an unchanged wrapper or relation does not authorize accepting
unknown operations or phase kinds. Persisted original plans are verified and
replayed with their original profile; no downgrade or rehashed conversion grants
new effects. `nativeQualified:false` and trusted host approval remain mandatory.

#### Source operation and expression

Operation 0.2 has exactly the keys `version`, `id`,
`parameters`, `consistency`, `replay`, `body`. Values are respectively
`umf.table-operation/0.2`, the existing bounded identity, `[]`, `transaction`,
`caller-key-required`, and a closed body with exactly `kind`, `table`, `values`,
`where`, `returning`, `maxRows`. The body has `kind:"update"`, one assignment,
`returning:[]`, integral maxRows 1–10000 and exactly
`where:{op:"isNull",field:targetRef}`. The assignment is exactly
`{field:targetRef,value:{kind:"rowExpression",expression:RowExpression}}`.
The optional historical `batch` member is absent. This version grants no insert,
batch, read or general UPDATE expression surface.
Operation 0.2 is administrative migration intent. Ordinary generated action/method
catalogs exclude it while retaining ordinary 0.1 methods and exact original source.
Its presence does not invalidate generation for the rest of a module. Ordinary
runtime 0.1 paths MUST refuse a 0.2 program before SQL; only the verified migration
0.4 path admits this guarded administrative program in this qualification.

Each RowExpression is one closed object:

| `op` | Other required members |
| --- | --- |
| `field` | `field:TableRef` |
| `literal` | `value:CoreLiteral` |
| `coalesce`, `concat` | `args:RowExpression[2..32]` |
| `add`, `subtract`, `multiply` | `left:RowExpression`, `right:RowExpression` |
| `conditional` | `when:TableOperationPredicate`, `then:RowExpression`, `else:RowExpression` |

TableRef retains exactly `module` and `element`. The complete expression,
including every predicate node and value leaf in a conditional, has maximum
depth 16 and 256 nodes; repeated occurrences count again. Arrays have maximum
fanout 32. Root depth is zero. Cyclic in-memory inputs refuse before traversal;
serialized input remains subject to the existing source/request byte limits.
Every predicate value leaf also consumes one node; literal wrappers do not open
an uncharged expression subtree. Every literal token retains the existing
1,048,576-byte value limit. Generated literal slots derive only from these charged
leaves, never an independent unbounded list; deduplication does not reduce the
source occurrence budget. Unknown extra slots or input sources refuse.
New text literal leaves reject NUL and unpaired UTF-16 surrogates, including in
unused branches. Supplementary Unicode remains supported without normalization
or replacement-character substitution. Historical operation 0.1 is unchanged.
Compiler SQL expansion MUST stay bounded by the admitted AST and literal slots;
coalesce must not exponentially duplicate operand subtrees. The public 8 MiB
frame guard measures returned markers/outputs, not private expression values or
input memory. This profile relies on source/literal/AST/numeric/row limits,
host statement/lock timeouts and PostgreSQL datum/server resource limits; it
does not promise an 8 MiB bound on private evaluation memory.

Conditions use existing `all`, `and`, `or`, `not`, `isNull`, `in`, comparisons and
`startsWith` forms, with source-table input Fields and literal-only value
operands. `related`, parameter, sourceField, rowExpression, principal and clock
operands refuse. Predicate ordering, NULL and comparison semantics retain their
qualified meaning: only SQL true selects `then`; false or unknown selects `else`.
Equality and inequality retain the existing NULL-safe predicate meaning: two
NULL values compare equal, and exactly one NULL compares unequal. Ordering and
membership retain their existing SQL three-valued meaning. Qualified operator
closure MUST preserve these distinctions.

Every input Field MUST already exist on the same table and retain exact logical,
native, facet, collation and mapping meaning across both sources. The target,
new siblings, generated/volatile inputs and unresolved relevant semantics
refuse. No other input or schema meaning changes in this plan. There is no
callback, transform registry, raw SQL, join or ambient-state resolution.
Source bytes, operation identity and AST are covered by the existing source and
plan digests; a separate AST digest is not an authority substitute.
The selected migration profile 0.4 requires both retained sources to have
`format: "json"`, matching the qualified native binding capability. Non-JSON
predecessor or successor sources MUST refuse at portable plan admission before
approval, ingress fencing or effects. Implementations MUST NOT normalize them
silently or change historical profile 0.1–0.3 admission.

Carrier typing follows SD-007. CoreLiteral wrappers determine non-NULL literal
types without imposing final target refinements on intermediate operands. NULL
is a context-resolved nullable leaf; ambiguous incompatible carriers refuse.
Coalesce returns the first non-NULL operand, conditional selects one branch, and
concat is strict: any NULL operand yields NULL. Concat retains its text carrier
and arithmetic retains its numeric carrier even when every operand is NULL;
context resolution cannot turn either into an unrelated result type. Text/varchar requires C
collation; char/bpchar and locale conversions refuse. Boolean, UUID, date and
instant admit only identity-preserving field/literal, coalesce and conditional
forms with exact native/logical compatibility. No float, implicit parsing,
timezone conversion, division, remainder or user-defined function is admitted.

Numeric typing admits exact integer/decimal promotion. Integer targets require
a statically integral result. Decimal leaves require finite precision and
nonnegative scale no greater than precision. A node's maximum integral and
fractional digits `(I,S)` use native bounds or exact token bounds; add/subtract
infer `(max(I1,I2)+1,max(S1,S2))`, multiply `(I1+I2,S1+S2)`, and
coalesce/conditional componentwise maxima. Every node requires I+S <= 1000.
Literal budgets describe the effective exact value after exponent/fraction
cancellation. Implementations MUST bound the resulting coefficient and scale
before allocating canonical native values; a raw exponent threshold is not a
substitute for this budget. Original source tokens remain unchanged.
All arithmetic uses unconstrained numeric intermediates. Nonfinite database
values or final NULL/invalid results abort the entire phase. No invalid row is
skipped, clipped, quarantined or silently replaced by a default.

#### Guarded Weft program

Program 0.2 retains the closed ordinary compiled-program members and transport,
source/model/declaration/structural digest and recompile checks. Its `result`
additionally requires exactly this `nativeExactValueGuard` descriptor:

```json
{"profile":"pg18-row-expression-exact/0.1","sqlstate":"22012","scope":"all-direct-target-rows","nullResult":"statement-error-and-transaction-rollback","nonfiniteInput":"statement-error-and-transaction-rollback","lossyAssignment":"statement-error-and-transaction-rollback","privateResults":true}
```

The successor is a single-call mutation with `outputs:[]`, affected marker
`umf_affected`, existing effect-count/frame guards, and no parameter input other
than source-declared literal slots. The host MUST require program 0.2 and the
exact guard descriptor for a 0.4 derived backfill, and reject either a downgraded
0.1 program or a missing/altered/unknown guard. Old backfills continue to require
their original program version; adding this branch does not relax that check.

Weft alone emits SQL. UPDATE's private RETURNING expression compares the stored
target with the exact pure expression reevaluated from unchanged inputs and
requires a non-NULL valid result. Numeric comparison uses exact numeric values;
text uses text/C comparison preserving trailing spaces. The full effects
aggregate combines every row's validity with the existing count/frame guard and
raises runtime SQLSTATE 22012 on any false result. It also rejects every nonfinite
referenced numeric input, including unused conditional branches, and every
nonfinite final numeric value. Constrained numeric typmods do not exclude NaN;
equality or cancellation cannot establish finiteness. NULL inputs remain allowed
under the expression's explicit semantics. Zero effects pass. The guard
cannot use LIMIT, filtering or sampling to exclude invalid effects. Its private
values/booleans MUST NOT appear in public rows or diagnostics. Native NOT NULL,
CHECK, unique, FK, overflow and length failures retain their native SQLSTATEs
and abort the phase. Built-in functions, operators, types and C collation MUST
resolve explicitly in pg_catalog, independently of ambient search_path.

#### Plan, phases and durable admission

Options 0.4 have exactly `version`, `backfills`, `concurrentIndexes`,
`reviewedChanges`, `validations`, with predecessor-profile limits. Exactly one
backfill selects the same closed `{table,column,operation,scopedRows:true}` shape.
`concurrentIndexes` and `validations` are empty. The selected exact next-source
operation is version 0.2; no selector/marker is unused or multiply consumed.
Unrelated data/schema changes, seed phases and dependent new-field chains refuse.
The existing target requires its exact reviewed tighten-not-null marker and
unchanged meaning except optional-to-required nullability. An appended required
target requires no fabricated tightening marker for a nonexistent predecessor.
Other reviewed changes refuse. Generated/immutable targets remain unsupported.

Plan 0.4 retains the 0.3 top-level members and approval profile. Its execution
profile is exactly `{version:"umf.table-migration-execution/0.3",
progressRelation:"umf_lifecycle_progress",ownerOnly:true}`. Every selected step
has the existing exact `phaseTarget:{table,field:TableRef}` correspondence.
`phaseOperation` permits these additional role values only in this profile:
`add-column`, `target-check`, `install-default`; existing `backfill` and
`tighten-not-null` are retained. Roles describe compiler-owned source steps,
never SQL-text adjacency or executable author annotations.

| Phase kind | Closed ordered membership; all transactions `required` |
| --- | --- |
| `backfill-tighten` | Exactly matching backfill then tighten-not-null, as G01 |
| `backfill-add` | One add-column (nullable, no default), zero or more source-derived NULL-permitting target domain CHECK steps, one backfill, optional install-default, then one tighten-not-null |

The append phase owns only the new target's column-local domain CHECKs and
independently declared future default. New keys/FKs, cross-column checks or other
dependency changes require separately qualified profiles and refuse here. Existing
native constraints on unchanged tables stay effective.
Staged target CHECKs must admit the nullable intermediate state without weakening
their authored meaning. A target CHECK that explicitly rejects NULL refuses this
first append shape; it cannot be silently weakened or applied before fill.
All step IDs appear once,
in source-derived order; missing, duplicate, swapped, extra or partial members
refuse. Ordinary surrounding installation bookkeeping may remain separate phases,
but no target add/fill/default/validation/tighten step escapes its atomic phase.
Prefix reconstruction and native witnesses MUST recognize both complete shapes.

The host locks the existing table before any phase member. It holds native writer
exclusion across every member, restores/verifies RLS and authority before commit,
and commits data, DDL and authenticated progress together. Aborts leave no partial
column, fill, default, constraint or phase receipt. Unknown outcomes require exact
observation; a committed phase never repeats its UPDATE. Final publication still
atomically advances current source/history/grants and retains trusted approvals.
Existing reference 0.3 and approval storage are reusable only with explicit plan
0.4/execution 0.3 dispatch and identical metadata/ACL verification.

#### Refusals, diagnostics and example

Invalid source-operation grammar/type/reference/resource use returns a located
`TABLES_OPERATION_SHAPE`, `TABLES_OPERATION_DOMAIN`, `TABLES_OPERATION_SOURCE`
or `TABLES_OPERATION_CAPACITY` diagnostic. Unsupported selection or source-change
correspondence returns located `TABLE_MIGRATION_OPTIONS`; unsupported profile
composition returns `TABLE_MIGRATION_UNSUPPORTED`. No partial plan is returned.
Host successor/program/guard mismatch refuses before SQL as
`backfill-compilation-refused`; native guard errors abort the transaction.
Ordinary diagnostics include identifiers, bounded paths and SQLSTATE only; native
DETAIL/raw rejected rows stay outside public receipts and exception messages.

For an unchanged given-name and family-name pair, the selected assignment may be:

```json
{"field":{"module":"people","element":"full-name"},"value":{"kind":"rowExpression","expression":{"op":"concat","args":[{"op":"field","field":{"module":"people","element":"given-name"}},{"op":"literal","value":{"string":" "}},{"op":"field","field":{"module":"people","element":"family-name"}}]}}}
```

The complete approved command supplies the exact target-NULL predicate and effect
bound. Existing full names survive; a NULL input without authored coalesce or an
overlength/rounded result aborts the entire phase. A future default is separate
intent and never supplies historical row values implicitly.

### G03 existing-column future-default successor

SD-007 selects one existing stored Field's native default for future writes.
CONTRACT-049 logical value resolution remains explicit and never mutates input
through validation. PostgreSQL omission, explicit NULL and historical values
remain distinct. This successor grants no historical fill or row-expression
meaning to a default.

#### Versions and exact selection

| Surface | Selected G03 rule |
| --- | --- |
| Options / plan | `umf.table-migration-options/0.5` / `umf.table-migration/0.5` |
| Execution profile | `umf.table-migration-execution/0.4`, fixed owner-only progress relation |
| Change discovery | Explicit `{version:"umf.table-migration-discovery/0.2"}` selector; historical unselected discovery retains its exact output |
| Declaration / ordinary operations / Weft | Existing native-default declaration and ordinary operation versions; no Weft grammar expansion |
| Approval / installation | Approval 0.1 and installation 0.3 with explicit latest-plan 0.5 admission; exact storage, inventory and ACL meaning retained |
| Opt-in Rust migration | MUST refuse unsupported plan/options 0.5 before effects; no engine fallback |

Selected discovery 0.2 MUST require JSON for both retained sources. A non-JSON
predecessor or successor MUST refuse with `TABLE_MIGRATION_OPTIONS` at
`/previous/source/format` or `/next/source/format`, respectively. Historical
unselected discovery, including YAML inputs, MUST retain its exact behavior.

The Python discovery API defines `options=None` as an unselected call and MUST
omit the selector member from its wire request. A raw bridge request containing
`options:null` is an explicit invalid selector and MUST refuse; these are
separate API observations.

Options 0.5 MUST contain exactly `version`, `backfills`, `concurrentIndexes`,
`reviewedChanges`, `validations`. All arrays except `reviewedChanges` MUST be
empty. That array MUST contain one marker with exactly `id`, `kind`, `path`,
`oldDigest`, `newDigest`; `kind` MUST be `change-default`. Conversion and unknown
members MUST refuse. Existing bounded identities and 64-digit lowercase
hexadecimal digests apply.

The marker MUST bind the complete source-derived old/new physical expectation,
logical Field and native mapping, retaining the presence and exact value of both
default declarations. Its path MUST identify the selected successor column
mapping. The existing deterministic marker-ID/digest algorithm applies to these
full values. Absence MUST NOT be replaced by a literal-NULL declaration. Catalog
expression equality and normalized numeric value equality MUST NOT suppress a
source change candidate. An unselected, duplicate, missing or forged marker MUST
refuse before returning an executable plan.

The public TypeScript discovery API MAY take the closed version selector as its
third argument. Python discovery MUST expose the same selector as keyword
`options`; the embedded request then has exactly `previous`, `next`, `options`.
Without that selector the existing two-member request and historical discovery
behavior MUST remain unchanged. Unknown selectors MUST refuse. Discovery only
identifies review candidates; it cannot grant approval or compiler support.

#### Whole-source correspondence and default admission

Both retained sources MUST be JSON and compile independently. There MUST be one
selected existing table and one selected existing stored Field. Their identity,
order, name, logical/native type, nullability, facets, generation, immutability,
collation, constraints and policies MUST remain unchanged. Other tables,
dependencies, commands, seeds, unknown
content and configuration MUST remain unchanged. No initial publication,
append/drop, rename, type or nullability composition is admitted.

Only the selected native mapping's `default` property may change. The selected
logical Field's `default` may change with it, provided both complete sources
satisfy the existing matching missing-only literal rule. Whole-source comparison
MUST exempt exactly those two located properties, then require equality of all
remaining parsed content and order. At least the authored native declaration
MUST differ in presence or canonical JSON; logical-default-only changes refuse.
Exact retained source bytes remain part of the plan identity. Selected native
and logical default objects MUST contain only their known members; unknown
selected default qualifiers remain retained and MUST block interpretation, even
when normalization would otherwise remove that complete property.

Native defaults remain exactly `{kind:"literal",value:CoreLiteral}`,
`{kind:"currentTimestamp"}` for timestamptz, or `{kind:"randomUuid"}` for UUID.
Removing the native property selects DROP DEFAULT. Literal NULL is admitted only
for a nullable Field and remains an explicit declaration. Identity/generated
columns cannot acquire a default. Arbitrary SQL/functions, casts, sequences,
callbacks, session principals and row expressions MUST refuse. A literal MUST
satisfy the logical domain, known facets and lossless native capacity before DDL
emission. Volatile defaults on enumerated/ranged logical targets MUST refuse in
this first subset; unchanged native CHECK/unique/FK constraints still apply to
future writes and may reject generated values.

Native temporal literals use the existing table-specific interpretation: a
`date` Field with native `date` storage accepts an exact Gregorian date carrier;
a `timestamp` Field with native `timestamptz` storage accepts an exact UTC instant
carrier. Temporal facets and nonempty `allowedValues` MUST refuse until separately
qualified. Carrier/nullability checks and the existing native date/instant
validators apply; this does not enable core temporal refinement or logical
`Field.default` semantics. For example, a native date default may be
`{kind:"literal",value:{date:"2000-02-29"}}` with no logical Field default.
Both complete sources MUST still pass unchanged core and table admission.
Non-temporal literal refinement checks MUST remain fully enforced.

G03 literal admission MUST reject NUL and unpaired UTF-16 surrogates before UTF-8
encoding, including nested string-bearing carriers. Supplementary Unicode MUST
survive unchanged. Each decoded literal payload is limited to 1,048,576 UTF-8
bytes, measured as the sum of UTF-8 bytes of its decoded string-bearing carrier
values, excluding wrapper keys and JSON escaping. Numeric tokens, dates,
timestamps and UUIDs count their authored carrier text; binaryHex and bits128Hex
count authored hexadecimal text, not decoded binary bytes. Boolean and NULL
carriers contribute zero string bytes. Every literal occurrence is measured
independently after surrogate rejection. The rendered default expression is
independently limited to 1,048,576
UTF-8 bytes; the complete ALTER statement is limited to 1,049,600 UTF-8 bytes.
Escaping expansion counts. Exact numeric admission MUST bound coefficient/scale
before allocation and prove the declared native integer or numeric(p,s) capacity.
These new limits MUST NOT alter historical profile admission or rendered bytes.

#### DDL, phase and source publication

Deployment and G03 migration MUST share one authoritative typed default renderer
for literal, transaction timestamp and qualified UUID expressions. Native
expectations MUST derive from that same declaration. No implementation may strip
or replace fragments of an opaque column-definition string to recover meaning.
The extraction MUST retain byte-identical historical deployment/migration output.
Functions, types and collations MUST remain explicitly qualified where applicable;
`CURRENT_TIMESTAMP` retains PostgreSQL transaction-start semantics.

Plan 0.5 retains the closed 0.4 plan members with the new versions. The execution
profile MUST be exactly `{version:"umf.table-migration-execution/0.4",
progressRelation:"umf_lifecycle_progress",ownerOnly:true}`. It MUST contain one
`default-change` phase with `transaction:"required"` and exactly one target DDL
step. That step has `kind:"table"`, `phaseOperation:"change-default"`, exact
`phaseTarget:{table,field:TableRef}`, and `operation:"set-default"` or
`operation:"drop-default"` as derived from the selected successor declaration.
SET covers both first installation and replacement. No UPDATE, backfill, seed,
concurrent operation or separate target phase is permitted.

Even an absent-default to literal-NULL transition or equivalent numeric spelling
MUST emit its finite DDL and required journal phase. An equal native before/after
witness MUST NOT authorize skipping, completing or publishing that transition.
Before effects, the host MUST verify the exact source-recompiled plan, approved
predecessor and selected target under native writer exclusion. DDL, native prefix
verification and authenticated phase progress MUST commit in one transaction.
Progress MUST bind the approved source/plan identity, ordered step and phase,
including when before/after catalog expressions coincide.

Known abort permits retry after revalidation. An uncertain COMMIT requires
observation of exact authenticated progress and its native postcondition before
any redispatch. Native state alone is insufficient. A committed phase MUST NOT
be dispatched again. Final source/history/reference/grant publication remains
atomic and ingress stays fenced until native and source correspondence agree.
Existing rows and existing NULLs MUST remain unchanged. Reversing a committed
default affects later omitted writes only and cannot undo intervening row values.

A generated parameter remains explicit when declared. A native default does not
make it implicitly omittable. Both sources' complete command admission applies;
removing a required target's default while a retained create omits that target
MUST refuse. G03 MUST NOT repair command declarations implicitly.

Unsupported composition/normalization returns located
`TABLE_MIGRATION_OPTIONS` or `TABLE_MIGRATION_UNSUPPORTED`; invalid literal/domain
or capacity retains the existing located table diagnostic. No partial plan is
returned. Host profile/phase/target/approval/progress mismatch refuses before
SQL. Native errors retain bounded SQLSTATE/identifiers without row DETAIL.

For example, an optional integer column may change from absent native default to
`{kind:"literal",value:{integerToken:"5"}}`. Historical NULLs remain NULL;
a command omitting the column receives 5, explicit NULL remains NULL, and an
explicit 9 remains 9. Replacing that declaration with a literal NULL still
requires the reviewed, committed phase even if its catalog matches no default.


#### G03 ordinary-operation source admission and trusted selection

This amendment supersedes only the G03 version-table Weft cell: ordinary UMF
operation declarations retain their existing versions and AST. The explicitly
selected Weft envelope is `weft.table-operation-module/0.2`; its `/0.1`
predecessor retains its exact admission and behavior. This is source admission,
not an additional default expression or migration phase. The existing G03
options/plan 0.5, execution 0.4, discovery 0.2, approval 0.1 and installation 0.3
rules remain unchanged. No installation-reference or author/request wire
selector is added by this amendment.

The trusted, frozen Python `SessionPolicy` gains
`table_operation_module_profile`, whose exact string values are
`weft.table-operation-module/0.1` (default) and
`weft.table-operation-module/0.2` (explicit host opt-in). Other values or types
MUST refuse policy construction. Source contents, installed dependency version,
request JSON and a failed engine call MUST NOT select or change this profile.
`settings()` MUST continue to contain only its existing native settings; the
profile is not a PostgreSQL GUC. Unsupported selected Weft versions MUST refuse
before ordinary database effects, with no engine/profile fallback.

The selected module profile MUST propagate coherently through sync and async
ordinary reads, queries, writes and write-outcome observation/recovery. Prepared
module and operation handles, shared source-owner caches and source/binding
custody MUST bind that profile; cross-profile handle reuse MUST refuse even if
the lowered SQL happens to match. Separate direct Weft query/raw-read 0.1 APIs
and administrative seed/backfill routes retain their existing dispatch unless a
separately reviewed explicit contract selects their successor.

For selected module 0.2, the known logical Field default admitted by this slice
has exactly `{on:"missing",value:CoreLiteral}`. It MUST satisfy existing Core
literal/domain/facet validation and the UMF tables adapter's matching logical
and native default rule in the retained source mapping. Unknown selected
qualifiers and unsupported carriers MUST refuse. Native-only defaults retain
their existing admission. Logical temporal defaults remain unsupported in this
slice; admitting native date defaults does not admit them. The actual qualified
literal/carrier subset MUST be enumerated by fixtures and release evidence.
No invented default property on the raw native binding substitutes for checking
the retained mapping. Source defaults remain preserved as authored; preparing
an operation MUST NOT fill omitted inputs or rewrite stored rows. Existing
ordinary operation validation and native omission/NULL/value distinctions apply.

Default profile 0.1 MUST retain byte-identical cursor key derivation and scope.
For profile 0.2, cursor key derivation MUST be HMAC-SHA256 over the UTF-8 bytes of
Python `json.dumps(["umf.session-table-operation-profile/0.1",
"weft.table-operation-module/0.2",identity.kind,identity.subject,
policy.settings(identity)],sort_keys=True)` using the existing cursor root
secret. Do not reuse the old scope's serialization-profile member for the
selected module profile. Ordinary authority scope gains exactly
`tableOperationModuleProfile:"weft.table-operation-module/0.2"` only for the
opt-in profile. Its authenticated cursor and outcome scope/invocation digests
MUST include that member. Existing outcome payload shapes and storage versions
remain unchanged: the existing scope/invocation digests authenticate this scope.

The outcome slot MUST remain independent of selected module profile, inputs,
secret rotation and deployment generation. The same principal/module/schema/
operation/idempotency-key lookup MUST find an occupied predecessor slot and
refuse an incompatible authenticated scope or invocation; it MUST NOT create a
different slot and execute again. This applies to write and recovery paths.
Legacy 0.1 outputs and receipt authentication remain unchanged. A selected
profile changes authorization identity, not native subject authentication.

No G03 release claim is admitted until a new immutable Weft artifact implements
the selected module, its Python wrapper propagates the selector without loss,
and the exact installed cohort passes both profile compatibility and G03 native
acceptance. Published Weft 0.4.53 bytes MUST NOT be replaced to add this support.

### G11 combined stored-Field removal/addition successor (proposed)

This section reserves options/plan `umf.table-migration-options/0.6` and
`umf.table-migration/0.6`, execution `umf.table-migration-execution/0.5`, and
explicit discovery selector `{version:"umf.table-migration-discovery/0.3"}`.
Older selectors and profiles retain their exact behavior. This proposal does
not establish implementation or native support. Both sources must be exact
retained JSON and independently valid. The same installed table inventory and
stable Record/table identities must remain; G10 owns table-inventory changes.
At least one stored Field must be removed and at least one added, by full
`{module,element}` identity, irrespective of column count/name/type equality.

#### Whole-source correspondence and seed boundary

The complete validated TableDeploymentConfiguration MUST be identical on both
sides, including schema, owner/person/batch roles and group-role mappings. This
profile does not migrate configuration or role identity. The source-context
normal form can describe a configuration difference, but selecting a context
marker MUST NOT override this refusal.

Preserve document/module/table/Record identities, retained table names and table
inventory/order. Preserve every retained Field's logical/native type, facets,
nullability, default, generation, immutability, collation, mapping and unknown
qualifiers. No retained-column rename or nullability/type/default mutation is
implicitly authorized. Remove and add only the selected stable Field definitions,
their exact Record memberships and native column mappings. Retained memberships,
columns and unrelated elements keep their relative authored order; new entries
keep their authored order rather than being sorted by native names. A shared
Field still referenced elsewhere cannot be deleted from the document merely
because one table drops its carrier; complete source validity and dependency
analysis distinguish dropping that mapping from deleting the definition.

The only other source exemptions are explicit supported dependent Key, FK,
CHECK, index, policy and operation changes selected by their exact markers and
the complete resulting source binding. Existing ordinary read/return declarations
may be byte-unchanged while their context needs review. Grant changes are derived
only from those admitted declarations, column mutability and unchanged trusted
configuration; an operation-context marker is never grant authority. Every
exemption must identify exact before/after source locations and typed identities.
Unknown content on selected objects is retained and blocks interpretation where
unsupported; deleting the containing property for comparison must not conceal
an unknown qualifier. After consuming all allowed exemptions, require equality
of all remaining parsed content and authored array order. Exact original source
bytes still bind the plan and approval. Discovery cannot turn an unsupported
unrelated edit into an executable migration.

This first atomic successor keeps the complete authored `seedSets` array
unchanged and has `seedExecution:"none"`. Existing previously applied seed values
are not instructions to replay, fill a new target or repopulate a dropped Field.
If unchanged seeds make the successor invalid (for example a retained seed row
references a removed Field or omits a newly required target), refuse with the
original seed/table/Field location before plan emission. A caller may not evade
that refusal by deleting or editing the seed declarations: seed addition,
removal, value change and seed-history disposition are unsupported companions
and remain an explicit G11 residual until a separate exact reviewed source and
execution/custody contract is qualified. Do not classify a seed declaration as
an ordinary command-context exemption. Retained before-source seed values remain
part of source/marker custody even when stored business values are purged.


Options 0.6 contain exactly `version`, `backfills`, `concurrentIndexes`,
`reviewedChanges`, `validations`. Existing array limits apply. Concurrent indexes
and deferred validations must be empty. Backfills contain zero or more existing
exact `{table,column,operation,scopedRows:true}` G02 selections, bounded by the
existing 256-entry limit and at most one selection per added target. Every
selection must be consumed exactly once. Typed inputs must refer only to
unchanged retained Fields;
no old-only Field, added-field chain, callback or author SQL is admitted. An
optional addition may remain NULL; a required addition needs an admitted
explicit fill before tightening. A future default alone does not populate old
rows. The no-fill transition must dispatch no UPDATE.

Every removed stored Field needs an exact `drop-column` marker and the existing
`IRREVERSIBLE_COLUMN_PURGE` review disclosure bound by plan approval. This
profile performs immediate physical deletion, not G05 retained retirement.
Retention selection, type conversion of retained Fields, initial deployment,
seeds, changed unrelated defaults and unknown change kinds refuse. Selected
new-field future defaults use existing qualified typed admission and renderer;
G03 default mutation of a retained Field is not implicitly composed.

Discovery 0.3 emits existing marker candidates plus `change-operation` for every
added, removed or changed ordinary operation, and `change-operation-context`
when an unchanged authored operation's complete source/configuration context
changes. This is conservative source review, not inferred query result typing. Markers contain exactly `id,kind,path,oldDigest,newDigest`; `conversion`
and unknown members refuse. Candidate values are source-derived:
`change-operation` hashes the complete original declaration or canonical null
for absence; `change-operation-context` hashes the closed value
`{version:"umf.table-operation-source-context/0.1",
source:{format,sha256},configuration,module,operation}`. `source.sha256` is
recomputed over the exact complete retained document bytes; `format` is `json`.
`configuration` is the complete validated TableDeploymentConfiguration, `module`
the exact owning module ID and `operation` the exact unchanged authored
declaration. All source/configuration context changes are conservatively
reviewed, including cross-module Fields, metadata-only and unrelated changes;
do not claim that a marker proves an operation's result type changed. Only
unchanged declarations receive context markers. Changed declarations use their
complete `change-operation` marker and the already source-bound plan approval.
Hash using RFC8785 with the existing SHA256 primitive. Memoize source hashing
and shared context once per side; avoid reparsing/serializing the full document
per operation. Actual generated parameters/projections and Weft typed query
results must separately validate and qualify; no prepared handle or new SQL
parser supplies portable marker authority. Operation
paths use the actual successor declaration pointer when present, otherwise the
actual predecessor pointer. A candidate includes both original pointers as
diagnostic location metadata, not marker authority. Operation identity is the full module/element tuple. Pointer reuse by a different
operation identity does not merge or consume its markers; each original identity
and change kind has its own complete correspondence. Existing deterministic
`review-` plus first24 hex of RFC8785 hash `[kind,path,oldDigest,newDigest]` applies.
Duplicate, forged, stale, missing or unused markers refuse before plan emission.
Discovery is not permission to execute unsupported changes.

Every affected Key, FK, check, index, generated expression, policy, grant and
operation must be preserved with valid dependencies, explicitly changed under
its supported source correspondence, or cause a located refusal. Existing
constraint/index/key/policy markers bind complete physical and logical meaning.
Unknown native views, triggers, rules, grants or other dependants block execution;
CASCADE and generic inventory exceptions are forbidden. Preserving the table
set does not permit ignoring inbound dependencies from another retained table.

Allowed companion operations use existing declaration/expression versions:
unchanged declarations with reviewed binding changes; new/removed declarations;
and same-ID changes confined to selected Field-related parameters, assignments
and projections. Same-ID table, identity, audience, predicate, effect, call kind
and unrelated returning meaning must be unchanged. A new required create
parameter and assignment are explicit authored API evolution. Removed parameters
must have no retained uses. Complete before/after parameter and implicit whole
Record dependencies must validate. No ignored old argument, synthesized default,
implicit assignment or repair is admitted. Changed ordinary policy predicates
require their existing exact review markers and complete typed dependency checks.

Plan 0.6 retains the closed plan 0.5 members and fixes `seedExecution:"none"`.
Its execution profile is exactly
`{version:"umf.table-migration-execution/0.5",
progressRelation:"umf_lifecycle_progress",ownerOnly:true,
ingressProfile:"umf.table-generation-ingress/0.1"}` and approval profile
remains 0.1. There is exactly one phase with `kind:"field-replacement"`,
`transaction:"required"` and all emitted migration-effect step IDs exactly once.
Surrounding publication/bookkeeping follows the existing lifecycle contract;
no target/dependency effect escapes the atomic phase. Step IDs/digests derive
from the final source-bound ordered steps, never SQL parsing or adjacency.

Column steps retain exact `phaseTarget:{table,field:TableRef}`. Allowed role
values are `drop-column`, `add-column`, `target-check`, `backfill`,
`install-default`, `tighten-not-null`. Dependency steps instead carry exactly
`phaseDependency:{table,kind,id,sourcePath,meaningDigest}` with role
`dependency-drop` or `dependency-add`; kind is `check|foreignKey|index|key|policy|grant`,
and digest binds the complete predecessor or successor typed native expectation
respectively. A step must carry exactly one target form, correct kind/operation,
and required transaction. Subject identity cannot be supplied as author SQL.

For policies and grants, `id` is compiler-owned `dependency-` followed by the
complete 64-hex RFC8785/SHA256 subject digest, and `meaningDigest` is that digest;
no authored stable ID is invented. Their common closed subject prefix is
`{version:"umf.table-native-subject/0.1",kind,relation,meaning}` where `relation`
is exactly `{table,record,schema,name}` from that side's table/configuration.
The policy `meaning` has exactly `{audience,command,name,role,permissive,rule,
usingSql,withCheckSql}`. Audience is `person|batch`, command one of
`select|insert|update|delete`, name the existing `umf_<audience>_<command>`, role
the selected configured role, permissive `true`, and rule the complete original
TableRowRule. SQL expressions come only from the existing authoritative typed
policy renderer: INSERT has `usingSql:null`; UPDATE has both expressions; SELECT
and DELETE have `withCheckSql:null`. These are generated expressions retained
for exact source rerender, never author-supplied executable SQL or SQL inference.

The grant `meaning` has exactly `{audience,command,role,columns,grantOption}`.
Role and audience/command are as above; `grantOption` is `false`. SELECT, INSERT
and DELETE table grants have `columns:null`. UPDATE has the ordered nonempty
array of exact `{field,name}` for ordinary mutable columns, derived with the
existing exclusion of immutable/generated/Key Fields. A deny rule produces no
grant subject; a disappearing prior grant has its prior source-derived subject.
PUBLIC revocation and schema/head privileges remain separate mandatory fixed
installation/fence invariants, never dependants that can be dropped to permit a
Field change. Unknown privilege variants or extra subjects refuse.

The host verifies these subject normal forms by exact source recompilation and
independently verifies physical relation/role/policy/ACL witnesses under native
locks. Source content ID and native incarnation are separate: a role name or OID
alone is not enduring identity across drop/recreation, restore or another
installation. Native inventory must detect extra/inherited/PUBLIC capabilities;
matching generated GRANT text alone is insufficient. Complete source/plan
authority still binds policy-related tables, configuration and original meaning.

The adapter builds a deterministic dependency DAG: remove approved obsolete
dependants before their old carriers; drop an old carrier before adding a new
one reusing its SQL name; add nullable new carriers before fills; install each admitted future default
after its fill; verify all required values before NOT NULL; add/validate
dependent constraints, policies and grants only when all referenced carriers
and data are ready. A NULL-permitting column-local domain CHECK may precede its
fill only if its complete semantics admit every intermediate state. A
NULL-rejecting or cross-Field CHECK is installed and validated after all of its
required populations; no NOT VALID/deferred-validation shortcut is admitted
by this first atomic profile. Stable source order breaks
ties, not display names. Unsupported cycles refuse. New global Keys/FKs validate
the complete native population, never only rows visible to ordinary RLS. A
CHECK is never silently weakened for an intermediate state. A column-local
`target-check` step carries the one exact Field target and complete source-derived
domain meaning. Every cross-Field or separately identified native CHECK carries
a `dependency-add` subject with `kind:"check"`, never a guessed single Field
target. The source rerender must prove this disjoint classification. Generated-column changes need separately qualified scheduling and remain
an explicit unsupported composition until delivered.

Before any carrier effect, the host must establish native exclusion/quiescence
for both old readers and writers over the full affected dependency closure.
Drain active old transactions, prepared queries, streams and admitted direct
clients; metadata-head revocation alone is insufficient. Lock affected physical
relations in deterministic native identity order, then reverify exact source,
strict inventory, effective native authority and approval. Direct inherited/
PUBLIC/owner-role authority must be accounted for. The read/write fence remains
durable through carrier cutover and final source/client publication; the
rollback-transaction interval and committed-prefix interval must be distinguished.

All admitted fills run in deterministic dependency/source order in the same
atomic phase. Each retains its own G02 typed authority and effect bound. The
host enforces a finite aggregate phase effect budget and absolute deadline over
all fills/DDL/validation; a per-fill reset cannot evade them. Exceeding a bound
or failing a later fill aborts every earlier fill and DDL in that transaction.
DDL, admitted fills, complete native validation and authenticated progress commit
in the same database transaction. A known abort leaves old data/catalog and no
phase completion; it does not erase the durable ingress fence. Unknown COMMIT
requires exact plan/source/phase progress and native postcondition observation
before any redispatch. A committed phase never repeats fill or drop. Native
final shape/name/count equality alone cannot prove completion. Final head,
history, generated client generation and grant restoration publish atomically
only after complete successor verification. Old clients/cursors are generation
fenced; retained metadata is not a backup of deleted values.

Unsupported source/dependency/schedule returns a located
`TABLE_MIGRATION_UNSUPPORTED`; malformed selectors/markers return
`TABLE_MIGRATION_OPTIONS`; missing destructive review retains
`destructive_change_unreviewed`. No partial executable plan is returned. Host
profile/target/phase/approval/progress mismatch refuses before effects and native
errors retain bounded SQLSTATE/identifiers without row DETAIL. Opt-in Rust must
explicitly refuse unsupported successor 0.6, without engine fallback.


#### G11 selected generation ingress protocol amendment

This section supersedes the earlier G11 execution0.5 three-member shape. All
other G11 source, multiple-fill, dependency and irreversible-loss rules remain.
The following selected protocol is normative for this unreleased successor;
implementation and independent native/release qualification remain separate.

##### Selected mechanism and identity

Select `umf.table-generation-ingress/0.1`, first provider
`postgresql18-login-epochs/0.1`. Use native credential epochs and actual session
retirement, not a quiescence boolean, a metadata-head check or an ACL restore
for the same live login. Preserve stable effective subject roles (`alice`,
`bob`, batch subject), their role OIDs, configured audience/group roles and
CURRENT_USER meaning. They are NOLOGIN roles. Rotate **authentication LOGIN
roles**, not effective subject roles. This preserves owner values and stable
idempotency outcome slots while retiring old authenticated connections.

Each epoch gets fresh, disjoint provider-owned login roles and credentials. A
login has SET-only, non-inheriting, non-admin membership to its exact stable
subject role. It is not an owner, superuser, BYPASSRLS, CREATEROLE, CREATEDB or
replication role and cannot reach another subject or the controller owner.
Unintended inherited/SET paths, PUBLIC/native object access, definer views or
other unknown access paths block enrollment/effects. Configured native policy
and grant meaning is unchanged. No new GUC grants authority.

An existing LOGIN subject role may be explicitly enrolled and permanently
converted to NOLOGIN, preserving its name/OID and subject/group meaning. All
its original authenticated sessions must then be retired. A fresh wrapper login
is granted access to that stable role. This is a reviewed enrollment operation,
not implicit adoption of a shared role. Roles shared with another installation
need a separate identity migration before this provider can claim exclusivity.
New epoch login IDs never overlap old logins or stable role IDs. Retired logins
are never re-enabled, renamed/reused or granted successor membership.

PostgreSQL treats authentication and SET ROLE as separate mechanisms: LOGIN
controls initial connection identity, while SET and INHERIT memberships control
effective authority. These facts justify preserving subject roles and retiring
authentication roles; they do not replace native tests. See [role attributes](https://www.postgresql.org/docs/18/role-attributes.html),
[SET ROLE](https://www.postgresql.org/docs/18/sql-set-role.html) and
[memberships](https://www.postgresql.org/docs/18/role-membership.html).

##### Trusted API and mandatory execution selection

This amendment selects unpublished G11 execution 0.5 as exactly
`{version:"umf.table-migration-execution/0.5",
progressRelation:"umf_lifecycle_progress",ownerOnly:true,
ingressProfile:"umf.table-generation-ingress/0.1"}`. Older profiles remain
unchanged. The portable plan states a required protocol; it cannot name login
roles, issue credentials, terminate sessions or approve enrollment.

Add an explicit trusted `ingress_provider` argument to PsycopgMigrationHost and
a host-neutral qualified-provider protocol. A provider-less host refuses G11
before acquisition/effects. HostCapabilities booleans cannot substitute for it.
The concrete provider must execute/observe the native protocol below. Its
capability receipt binds provider implementation/census, native/authentication
profile and actual installation enrollment/evidence, not a caller claim.

Selected Python host surface (frozen values, private connections/credentials):

```text
provider.enroll_installation(enrollment_request, enrollment_approval)
    -> GenerationEnrollment
provider.provision_disabled_epoch(enrollment, provision_request, provisioning_approval)
    -> PreparedGenerationEpoch
provider.transition_request(plan_request, enrollment, prepared_epoch, plan_approval)
    -> GenerationIngressRequest
provider.prepare_transition(request, enrollment, ingress_approval)
    -> GenerationTransition
provider.acquire(transition) -> context manager[GenerationIngressLease]
lease.observe() -> GenerationIngressObservation
lease.fence_and_retire(deadline) -> GenerationFenceReceipt
lease.require_fenced(native_phase_connection, catalog_side)
lease.record_phase(native_phase_connection, verified_phase_receipt)
lease.record_publication(native_final_connection, verified_reference)
provider.admit(authenticated_subject, expected_reference, purpose)
    -> GenerationAdmission
```

`native_*_connection` is the adapter's same private physical connection and
transaction, not a caller callback or author SQL interface. The lease must
authenticate this connection/target. `catalog_side` is an internal closed enum
`previous|next` derived from authenticated progress, never caller-selected.
No credential is returned through plans, migration reports or these receipts.
GenerationAdmission is an opaque host credential/connection-factory capability,
not a serializable author/request selector. Admission validates the actual
committed head, active epoch and authenticated subject before releasing a fresh
credential/factory. Old factories, source references and admission handles
cannot be refreshed implicitly to a successor generation.

The transition's closed authority binding has exactly `profile,providerId,
enrollmentId,installationId,targetIdentityDigest,planDigest,fileDigest,
expectedHead,previousSourceDigest,nextSourceDigest,previousBundleDigest,
nextBundleDigest,oldEpoch,newEpoch,oldPrincipalsDigest,newPrincipalsDigest,
approvalDigest`. Profile is the exact ingress version; IDs are original provider
UUIDs/installation identity; digests are lowercase SHA256 over exact original
values. A native principal inventory binds role OID AND name, effective subject
OID/name, membership edges/options, ownership marker, credential issuer/profile
and epoch. Native continuity/installation custody is required in addition to
names/OIDs; restore, drop/recreation and wrong target refuse. No passwords/tokens
or business values enter this binding. Existing plan approval stays intact;
separate ingress approval authorizes exact owned credential/session retirement
and new admission, tied to the same plan/file/head and enrollment.

##### External physical custody, restore and exposure

An external trusted target custodian is mandatory; a copied database marker,
schema/role OID or self-consistent control-store hash is not physical continuity.
Add `custodian.register_target(owner_enrollment)` returning an opaque
`TargetCustody` capability and require that capability when constructing the
provider. Its exact public reference is
`{profile:"umf.native-target-custody/0.1",custodianId,registrationId,
resourceId,incarnation,registrationDigest}`. The issuer retains authoritative
registration, monotonically increasing external sequence, original pending
transition and last committed epoch/head outside the database backup/restore
scope. No author JSON, boolean or caller-created dictionary mints this capability.
Bind its canonical reference and external reservation digest into the transition
approval/record; extending the previous binding shape is explicit.

For the first local provider, implement a private host custodian journal with
exclusive locking, atomically replaced/fsynced records and retained append-chain
sequence, plus the actual owner-operated native server/endpoint/data-directory
registration. Bind physical directory/process/start custody, cluster identity,
database registration and controlled restart chain; a socket path, PID, name,
cluster system identifier or OID alone is insufficient. Provider-owned controller
credentials remain separate. A future managed custodian binds the actual
immutable control-plane resource UID/incarnation and its restore/exposure
protocol; it does not inherit a filesystem custodian's evidence.

`custodian.reserve_transition(binding)` persists the exact original intent and
new external sequence BEFORE native effects. Store that reservation in native
transition custody. `custodian.observe(target)` verifies actual connection/
resource continuity and compares native state to the authoritative last state
or its ONE pending original transition. It refuses unexplained rewind, another
resource, copied control schema or contradictory incarnation. Completing a
native phase/publication writes its receipt in the same native transaction;
`custodian.confirm_transition(original_reservation,native_receipt)` then advances
the external journal. This is an explicit intent/observe/complete protocol,
not distributed atomicity. Crash after native COMMIT but before external confirm
reconciles that original reservation with exact native progress/head; it does
not execute effects again. Credentials stay unreleased until confirmation.

Authorized restore/restart is custodian-owned and fail-closed to ordinary
connections until this comparison passes. The local server/HBA exposure profile
must start in controller-only admission and open its ordinary route only after
native/external continuity verification. A restore cannot expose copied old
LOGIN state first and hope that a later API read catches it. A mismatched restore
needs explicit new incarnation/re-enrollment/recovery approval and fresh auth
epochs, never automatic same-name adoption. Out-of-band host-root/database
superuser rewrites of both authorities remain outside the trusted-host model;
this profile claims no hostile whole-host anti-rollback attestation. Native
qualification must actually restore/copy the DB while retaining the external
journal and prove refusal before ordinary credential exposure.

##### Disabled epoch provisioning before actual-principal approval

Actual new role OIDs do not exist before provisioning; do not guess them or
retroactively rewrite an approved request. Add a separate enrollment-authorized
disabled-epoch provisioning operation before the transition request/approval.
Its closed request is exactly
`{profile:"umf.ingress-epoch-provision/0.1",providerId,enrollmentId,
installationId,targetCustody,planDigest,fileDigest,expectedHead,
previousSourceDigest,nextSourceDigest,nextBundleDigest,newEpoch,issuerProfile,
principals,maximumRoles}`. Each ordered principal entry has exactly
`{loginName,subject:{oid,name},audience}`. Subject identities already exist;
login names derive from the newly reserved UUID and ordinal and must be absent.
maximumRoles is a positive integer at most256 and equals the declared count.
This is authority for a finite set of NEW disabled identities, not permission
to retire an old login, enable LOGIN, change business data or release credentials.

The external custodian reserves the original provision request/digest and its
separate provisioning approval before native work. The concrete controller then
creates exactly those NOLOGIN/NOSUPERUSER/NOBYPASSRLS/NOCREATEROLE/NOCREATEDB/
NOREPLICATION/NOINHERIT roles, their final SET-only/noninherit/noADMIN memberships
to the exact stable subjects and native ownership receipts, in the same native
transaction as the prepared epoch record. Credentials remain issuer-private.
Any unexpected preexisting role refuses; names or guessed OIDs cannot supply
missing original creation custody. Unknown provisioning COMMIT is observed from
its original native epoch/ownership receipt and external pending intent before
replay; no second epoch or blind CREATE/IF NOT EXISTS adoption.

After native/external confirmation, observe the real role OIDs/names/flags and
membership options and freeze PreparedGenerationEpoch. Its original provisioning
receipt binds these actual identities and exact source/plan/enrollment/target.
Only NOW construct GenerationIngressRequest.newPrincipalsDigest over that actual
inventory, obtain ingress-retirement/admission approval and reserve the final
transition. The prepared identities remain disabled while the old generation
continues. Changing OIDs/memberships or source/target invalidates the request;
no post-approval rewrite is allowed.

Provision failure never retires old credentials or implies rollback of an
unknown role creation. Keep its original external/native outcome pending.
Abandonment/deletion of confirmed owned disabled identities requires a separate
bounded cleanup approval and original ownership/no-dependant proof; migration
rollback never authorizes deleting an uncertain or different role. Their
disabled state and provision journal remain durable on controller crash.

##### Binding order without recursive receipt hashes

Freeze the earlier authority binding as `GenerationIngressRequest`: its existing
exact fields plus exactly `targetCustody`, the canonical external reference.
Here `approvalDigest` refers to the already issued ordinary plan approval,
not to this request's own future ingress approval. Hash this request once as
`requestDigest`. A separate trusted ingress approval receipt binds that digest
and the enrolled exact retirement/admission authority. It is not included in
the value it authenticates.

Reserve external custody using that request and ingress approval. The closed
reservation is exactly `{profile:"umf.native-target-reservation/0.1",id,
custodianId,registrationId,incarnation,sequence,requestDigest,
ingressApprovalDigest,parentStateDigest}`. The external sequence is a positive
safe integer in its qualified range; exhaustion refuses. Hash the reservation
as `reservationDigest`. The frozen transition handle has exactly `request,
requestDigest,ingressApprovalDigest,reservation,reservationDigest`. Native
transition records retain these original values. No hash incorporates itself,
a future confirmation or a credential. External confirmation appends a native
receipt digest to the original reservation's outcome; it never rewrites the
reservation or creates a replacement after uncertainty.

##### Same physical transaction, separate controller role

The business owner must receive NO provider-schema privileges or external
object ownership. A separate trusted controller role owns the private provider
schema/store and exact role/session-management authority. The actual
authenticated maintenance actor has explicitly enrolled SET-only authority to
both business owner and provider controller. It stays outside ordinary-client
authentication; stable subject and epoch-login roles cannot reach either owner
or controller. Verify native membership options/closures, not only role names.
Do not add provider access to business-owner external inventory exceptions.

The concrete Psycopg lease implements a private scoped role hook on its SAME
physical connection and native transaction for `record_phase` and
`record_publication`. Immediately before entry, verify expected target and
SESSION_USER, current business-owner role/OID and exact required local settings.
Issue only the fixed internal SET LOCAL ROLE to the enrolled provider controller,
verify native current role and unchanged SESSION_USER/target/settings, execute
the finite source-bound provider store statement, then SET LOCAL ROLE back to
the exact business owner and reverify native role/settings. Keep search_path
pg_catalog and fully qualify provider objects. No author-supplied role, SQL,
callable or generic elevated cursor crosses this boundary.

Missing SET permission, wrong actor/controller/owner, changed settings or hook
failure aborts the entire surrounding phase/final-publication transaction.
Never catch that error and commit business effects without the provider row.
If the transaction is already failed, do not try to continue business SQL: roll
it back, then verify restored owner/idle connection authority. Repeated
cancellation or failed restoration closes/quarantines the connection and leaves
the original outcome/fence unresolved until native settlement is observed.
Do not return a controller-role connection to a pool. Existing uncertain-COMMIT
observation still applies if COMMIT was dispatched; no local exception proves
rollback of an unknown commit.

Native tests must prove businessOwner cannot read/write the provider schema,
provider hooks use exactly one transaction/connection, controller-role entry is
visible only inside the fixed hook, and exact owner authority is restored before
any business witness/effect. Inject denied SET, SQL error, timeout/cancellation
inside the hook and lost final COMMIT acknowledgement. Prove no business-only
commit, leaked controller role, extra provider object allowance or old-principal
admission. Verify actual previous catalog at index0 and next catalog at index1;
pending metadata head and committed business carrier may be on different sides.

##### PostgreSQL18.6 starting-backend admission barrier

This selected mechanism requires native qualification; source reasoning is not executed proof.
The immutable PostgreSQL18.6 source initializes a visible backend status entry
before authentication; user/database identity is filled later. Initialization
also flushes role invalidations before its role lookup/login check. Therefore
a role-filtered scan can miss a pending old authentication, while an unfiltered
starting-backend set can bound it. Sources:
[postinit.c](https://github.com/postgres/postgres/blob/REL_18_6/src/backend/utils/init/postinit.c),
[miscinit.c](https://github.com/postgres/postgres/blob/REL_18_6/src/backend/utils/init/miscinit.c),
[backend_status.c](https://github.com/postgres/postgres/blob/REL_18_6/src/backend/utils/activity/backend_status.c),
[pgstatfuncs.c](https://github.com/postgres/postgres/blob/REL_18_6/src/backend/utils/adt/pgstatfuncs.c).

After fencing COMMIT is positively observed, take a fresh full client-backend
status snapshot using the qualified controller's actual full-statistics access.
Clear/discard cached activity snapshots; use bounded short observation
transactions. Include rows with starting state, unknown user OR unknown database;
do not filter them out by role/database. Capture every candidate's actual
`pid,backend_start` plus native status identity and the observation receipt.
Record original barrier candidates durably, not a wall-clock cutoff comparison.

Track each captured token until it exits or its authenticated identity becomes
known. An enrolled old identity is retired using exact owned signaling and
positive absence proof. Another identified principal is not killed. Unknown
starting principals are waited/observed until resolved or the bounded deadline.
The complete barrier sample is capped at4096 candidates, including unknown and
unrelated starts; read up to4097 to detect overflow and refuse/preserve fencing,
never truncate the candidate set and continue. Qualify the native server's
finite max_connections/statistics resource profile. They cannot be guessed to belong to this installation or ignored. Newly
appearing known old principals are also retired and trigger consistency checks.
An unexplained old admission after the barrier refuses cutover and preserves
fencing. The proof relies on qualified startup/status ordering: a backend able
to use pre-fence cached role state had already registered a starting entry;
a backend registering only after the barrier must encounter closed admission.
Do not equate two empty snapshots, timestamp comparison or a fixed sleep with
this proof. Native PID reuse, concurrent status entry changes and snapshot
freshness must be independently exercised.

Test a paused actual SCRAM handshake begun before fencing, including one with
role authentication information already fetched, then release it after the
barrier. Also test a session already past authentication and SET ROLE with old
prepared SQL/held cursor. The provider must track/retire both categories before
the carrier phase, without terminating unrelated pending handshakes. Pin the
actual native server version/build and source ordering; this source inference
does not qualify other PostgreSQL releases, vendor authentication hooks or a
managed OAuth issuer. If their native startup primitive cannot establish this
ordering, implement a qualified concrete gateway/issuer pending-handshake barrier
for that target instead. This is an implementation obligation, not a permanent
refusal substitute for complete G11 execution.

##### Native control store and ownership

Implement a protected provider control schema in the SAME physical PostgreSQL
database, outside the UMF business schema. The provider owns its creation,
original UUID marker, exact object inventory, schema/OID continuity and ACLs;
do not silently use IF NOT EXISTS or exempt unknown business-schema objects.
It has fixed `epochs` and `transitions` tables, native primary keys, a unique
transition binding digest and a unique active epoch per installation. Typed
SQL DDL, exact columns/constraints/indexes and closed JSON record validators
must be frozen with the provider implementation before native qualification.
This is a finite provider store, not a generic arbitrary-metadata allowance.

Epoch records retain original enrollment, target, source/bundle/head, principal
inventory/issuer custody and `prepared|active|retired` state. Transition records
retain the closed binding, its canonical digest and `prepared|fencing|fenced|
cutover|published` state, with original fence/phase/publication receipts and
their native witnesses. Writes require the private controller owner. No
ordinary role gets schema USAGE, SELECT/mutation or definer-function access.
Validate complete exact records on read; self-consistent rewritten hashes do
not authorize a changed plan/identity. Never delete retirement/transition
evidence as ordinary phase cleanup.

Credential creation/storage/distribution belongs to the trusted host issuer.
The first native qualification uses fresh per-epoch SCRAM-authenticated logins
and actual independent TCP connections; it does not infer authentication from
administrative SET ROLE or a trust-authenticated connection. Verify the selected
HBA/authentication path and credential issuer custody. Keep credentials out of
argv, environment, public receipts, SQL diagnostic traces and artifacts. The
host must qualify redaction of its native credential-provisioning path. See
[PostgreSQL password authentication](https://www.postgresql.org/docs/18/auth-password.html).
Managed OAuth/SCIM issuers require a distinct qualified implementation; they
cannot inherit the local SCRAM evidence.

##### Lifecycle and exact native enforcement

Lock order is lifecycle/installation custody, provider transition custody, then
affected native relation locks in deterministic native identity order. Preserve
original attempt/transition on timeout; no replacement transition is created
merely because an acknowledgement or process disappeared.

1. **Prepare transition.** Complete the separately approved disabled-epoch
   provisioning above first. Verify its actual immutable principal inventory,
   complete source/target, ordinary plan approval, ingress approval, enrollment,
   ownership and bounded access closure. Reserve the exact final transition
   externally. No role creation is deferred until after approval of guessed
   principal OIDs. Credentials remain private and stable effective role identities
   and source configuration are unchanged.
2. **Commit fencing.** In one native control transaction, set every enrolled
   old authentication role NOLOGIN, remove old wrapper memberships/access
   paths, revoke affected data SELECT/write and column grants and head ingress,
   and write `fencing` plus exact native role/ACL witness. Preserve stable
   subject/audience memberships needed by successor identities; do not confuse
   them with retired wrapper memberships. Previously LOGIN subject roles stay
   permanently NOLOGIN. Native direct login is now closed durably. No carrier
   effect has occurred. An unknown fence COMMIT is observed from original
   control receipt AND role/ACL state before continuing; it is not assumed.
3. **Retire sessions.** Close registered old factories/pools, then terminate
   every native backend whose authenticated role belongs to the old inventory.
   Bound identity by role OID, database, PID and backend_start; recheck before
   signaling, including PID reuse/race controls. All provider-owned logins are
   exclusive to this installation; unexpected shared usage refuses rather than
   broadening a kill. Handle another database explicitly under approved owned
   scope, or refuse before signaling it. Require positive termination and fresh
   zero-session observations; signal-sent, cancellation, timeout, empty
   permission-filtered statistics or client process exit are insufficient.
   Native prepared transactions must be absent/settled and cannot outlive this
   proof. The first profile may require max_prepared_transactions=0; verify it
   natively. Use the starting-backend barrier specified below as well as
   identified old-session retirement. Only then record `fenced` with full native
   quiescence witness. Empty role-filtered activity alone never closes admission.
4. **Atomic carrier phase.** Reverify old logins remain NOLOGIN/unreachable,
   successor logins disabled, native session set empty, effective access closure
   and strict business inventory under actual ACCESS EXCLUSIVE locks. At phase
   index0 verify the PREVIOUS native catalog. Run all G11 effects/validation.
   Verify NEXT native catalog only after effects. Commit verified phase progress
   and provider `cutover` receipt in the SAME transaction. On abort those phase
   effects roll back; durable credential retirement/fencing remains. Unknown
   phase COMMIT requires matching provider receipt, lifecycle progress and native
   postcondition. No provider receipt alone permits replay or publication.
5. **Atomic publication.** With committed index1, NEXT is the business catalog
   even while metadata head is still predecessor. Verify that distinction;
   never call next-shape verification before phase0 effects. In the same final
   transaction publish source/history/reference, restore exact successor native
   data/head grants, verify unchanged prepared successor SET memberships,
   activate only the new epoch's login roles and write provider `published`/active epoch with exact
   reference. Retired old logins remain NOLOGIN, membership-inert and sessionless.
   There is no restore of the old credential principal. Credentials/factories
   are released only after independent committed-head/epoch observation.
6. **Explicit admission.** Authenticate the real subject through the issuer,
   require the exact successor reference/source and active native epoch, and
   issue a fresh generation-bound connection factory or direct credential.
   Verify actual SESSION_USER login and stable CURRENT_USER subject on every
   factory checkout. Stable subject role OIDs retain old owner/outcome identity.
   A newly authorized human can intentionally issue SQL, but prior authenticated
   sessions/prepared statements/credentials receive no automatic successor
   authority. Already delivered old data cannot be retracted; it never becomes
   a new-generation decoding claim. Materialized/held server cursors are retired
   with their original sessions before the carrier phase.

PostgreSQL's zero-timeout terminate result may mean signal dispatch only; the
provider must use bounded positive native termination/wait and independently
observe absence. Relevant authority and timeout semantics are in
[server signaling](https://www.postgresql.org/docs/18/functions-admin.html#FUNCTIONS-ADMIN-SIGNAL).
NOLOGIN does not by itself prove existing sessions ended. Nor does membership
revocation substitute for retiring a session that already changed effective role.
These are explicit negative/native controls for this provider.

##### Crash, recovery and bounds

Every observation binds original provider/enrollment/transition, exact
source/plan/file/target/epoch and progress-side witness. `fencing` resumes native
retirement; `fenced` may execute an uncommitted phase; `cutover` finalizes only;
`published` observes active generation and admits it without repeating effects.
Contradictory/missing native and control facts keep ingress closed and require
repair. Unknown COMMIT cannot re-enable old logins or release new credentials.
Provider loss/process death does not remove the durable fence. Signal permission
or topology failure keeps retirement pending, without carrier effects.

A known pre-phase abort may later use a separately approved reopen-original-
source procedure, with exact old catalog/head proof and a FRESH credential epoch;
retired login credentials never return. That recovery lane needs its own tests
before support is claimed. No automatic abort cleanup restores old access.
After committed destructive cutover, only exact forward resume or separately
qualified repair is available; metadata is not a data archive.

Initial provider bounds: at most256 retiring and256 successor logins,1024 owned
membership edges,256 concurrent enrolled backend sessions, at most4096 TOTAL
observed barrier candidates including unrelated/unknown starting backends, one installation
transition, native retirement deadline at most300s and the separately selected
finite whole-phase budget/deadline. Exceeding a bound refuses/keeps pending
fence; it never broadens scope, skips a principal or resets elapsed budget.
Superuser/BYPASS/owner/control credentials are outside the ordinary-client
domain and must never be distributed as direct generation credentials. Their
trusted maintenance use cannot be presented as fenced ordinary authority.

##### Required implementation and independent native evidence

Amend CONTRACT-081/TD-085/STP-085 before enabling native G11 apply. Add the
concrete provider and enrollment/issuer APIs, fixed control-store verifier,
native ACL/login/session retirement, same-transaction phase/publication hooks
and actual source-side witnesses. A fake provider or unattested capability
boolean remains source-test-only. Both host-neutral and Psycopg routes must
use the selected protocol; no legacy helper may bypass it.

Native tests must retain old SCRAM connections with SET ROLE already active,
prepared SQL and held cursor, plus idle/active reader and writer transactions.
Race old reconnects and late pool checkout with fencing. Prove old credentials
cannot reconnect after fence or after successor publication, native old sessions
terminate, wrappers cannot SET another subject/owner or access provider store,
and only newly admitted successor credentials can read the replaced SQL name.
Verify original CURRENT_USER/owner values and principal OIDs are unchanged;
existing outcome slots do not become misses when login credentials rotate.

Inject failure and lost acknowledgement at fence commit, each termination,
phase commit and final publication, then crash/restart the provider and host.
Independently observe actual native role flags/memberships/session absence,
private transition receipt, correct previous/next catalog and source head.
Include wrong role/OID/marker, extra inherited/PUBLIC/definer access, PID reuse,
permission-filtered stats, termination failure, exhausted bounds and prepared
transaction refusal. Reproduce the exact crash gap between committed carrier
phase and finalization: old prepared/direct SQL must remain unable to execute.
Finish the existing multiple-fill/default/dependency/client native matrix and
fresh artifact/release verification. Managed issuers stay explicitly open until
their actual native implementation and real principal evidence pass.


##### Fixed native store profile

The selected provider store is `umf.pg-generation-ingress-store/0.1`. The trusted
control schema name is exactly `umf_ingress_` plus the provider UUID's32 lowercase
hex digits. It is created exclusively with the provider-controller owner and
native original-creation receipt. `<control>` below denotes that one safely
quoted schema identifier, never arbitrary author input. The owner executes the
following fixed typed schema, with no IF NOT EXISTS reuse:

```sql
CREATE TABLE <control>.epochs (
  provider_id pg_catalog.uuid NOT NULL,
  installation_id pg_catalog.text COLLATE pg_catalog."C" NOT NULL,
  epoch pg_catalog.uuid NOT NULL,
  state pg_catalog.text COLLATE pg_catalog."C" NOT NULL,
  source_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL,
  bundle_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL,
  head_digest pg_catalog.text COLLATE pg_catalog."C",
  principals_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL,
  custody_sequence pg_catalog.int8 NOT NULL,
  record pg_catalog.jsonb NOT NULL,
  record_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL,
  CONSTRAINT ingress_epochs_pk PRIMARY KEY (provider_id, installation_id, epoch),
  CONSTRAINT ingress_epochs_installation CHECK (installation_id <> ''),
  CONSTRAINT ingress_epochs_state CHECK (state IN ('prepared','active','retired')),
  CONSTRAINT ingress_epochs_head CHECK ((state = 'prepared' AND head_digest IS NULL)
    OR (state IN ('active','retired') AND head_digest IS NOT NULL
      AND head_digest ~ '^[a-f0-9]{64}$')),
  CONSTRAINT ingress_epochs_digests CHECK (source_digest ~ '^[a-f0-9]{64}$'
    AND bundle_digest ~ '^[a-f0-9]{64}$'
    AND principals_digest ~ '^[a-f0-9]{64}$'
    AND record_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT ingress_epochs_sequence CHECK (custody_sequence BETWEEN 1 AND 9007199254740991),
  CONSTRAINT ingress_epochs_record CHECK (pg_catalog.jsonb_typeof(record) = 'object')
) USING heap;
CREATE UNIQUE INDEX ingress_epochs_one_active
  ON <control>.epochs (provider_id, installation_id) WHERE state = 'active';
CREATE TABLE <control>.transitions (
  transition_id pg_catalog.uuid NOT NULL,
  provider_id pg_catalog.uuid NOT NULL,
  installation_id pg_catalog.text COLLATE pg_catalog."C" NOT NULL,
  old_epoch pg_catalog.uuid NOT NULL,
  new_epoch pg_catalog.uuid NOT NULL,
  request_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL,
  reservation_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL,
  state pg_catalog.text COLLATE pg_catalog."C" NOT NULL,
  phase_index pg_catalog.int2 NOT NULL,
  record pg_catalog.jsonb NOT NULL,
  record_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL,
  CONSTRAINT ingress_transitions_pk PRIMARY KEY (transition_id),
  CONSTRAINT ingress_transitions_request UNIQUE (request_digest),
  CONSTRAINT ingress_transitions_reservation UNIQUE (reservation_digest),
  CONSTRAINT ingress_transitions_epochs CHECK (old_epoch <> new_epoch),
  CONSTRAINT ingress_transitions_state CHECK (state IN ('prepared','fencing','fenced','cutover','published')),
  CONSTRAINT ingress_transitions_phase CHECK
    ((state IN ('prepared','fencing','fenced') AND phase_index = 0)
      OR (state IN ('cutover','published') AND phase_index = 1)),
  CONSTRAINT ingress_transitions_digests CHECK (request_digest ~ '^[a-f0-9]{64}$'
    AND reservation_digest ~ '^[a-f0-9]{64}$'
    AND record_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT ingress_transitions_record CHECK (pg_catalog.jsonb_typeof(record) = 'object'),
  CONSTRAINT ingress_transitions_old_fk FOREIGN KEY (provider_id,installation_id,old_epoch)
    REFERENCES <control>.epochs (provider_id,installation_id,epoch) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT ingress_transitions_new_fk FOREIGN KEY (provider_id,installation_id,new_epoch)
    REFERENCES <control>.epochs (provider_id,installation_id,epoch) ON UPDATE RESTRICT ON DELETE RESTRICT
) USING heap;
```

All objects have exact controller ownership and persistent heap/ordinary index
shape, no RLS, triggers, rules, partitions, inheritance, extra columns or unmanaged
dependants. Revoke PUBLIC and every ordinary/business-owner schema/table access;
default ACLs and inherited privileges are independently verified. Native primary/
unique/FK indexes are the only admitted indexes. Schema marker and controller
OID/name must match original external enrollment. A temporary typed scratch
comparison may normalize PostgreSQL's native constraint text; it cannot replace
original creation/target custody. No app-facing SECURITY DEFINER functions are
part of this first store. Unknown objects/refinements refuse.

The provider validates each complete JSON record before writing AND after
reading, compares all duplicated native columns, and recomputes RFC8785 SHA256
record_digest. JSONB is only for provider metadata: original user source bytes
remain in the existing source/plan custody and are never replaced by JSONB.
No scalar counter exceeds9007199254740991, no nonfinite number or unknown member
is admitted. An epoch record has exactly `profile,providerId,enrollmentId,
installationId,targetCustody,epoch,state,sourceDigest,bundleDigest,headDigest,
principals,principalsDigest,custodySequence,origin,originReceipt`. Profile is
`umf.native-ingress-epoch/0.1`. The closed ordered principal entries are exactly
`{login:{oid,name},subject:{oid,name},audience,issuerProfile,
issuerReceiptDigest,ownershipReceiptDigest,memberships}`. Audience is person|batch; memberships are
ordered exact `{roleOid,roleName,inherit,set,admin}` records with boolean options.
The native envelope must satisfy the selected identity/privilege closure;
constructing these values does not establish enrollment authority. Origin is
`enrollment|provision`. The provision receipt has exactly
`{profile:"umf.native-ingress-provision-receipt/0.1",providerId,enrollmentId,
epoch,requestDigest,reservationDigest,principalsDigest,nativeOwnershipDigest,
targetObservationDigest}`. Its original external provision reservation has
profile `umf.native-epoch-provision-reservation/0.1` and exactly the final
reservation's other fields, except `provisioningApprovalDigest` replaces
`ingressApprovalDigest`. The custodian retains original request/approval and
native creation observations; the receipt does not authorize guessed OIDs.
Enrollment receipts have exactly
`{profile:"umf.native-ingress-enrollment/0.1",providerId,enrollmentId,
installationId,targetCustody,epoch,sourceDigest,bundleDigest,headDigest,
principalsDigest,ownershipObservationDigest,externalReservationDigest}` and
bind the original explicitly approved existing-role/target enrollment. These
receipts are host-issued authority objects, not caller-minted JSON. Separate
disabled provisioning creates actual native identities before a later transition
approval hashes their inventory. No recursive or future-identity approval.

A transition record has exactly `profile,transitionId,request,requestDigest,
ingressApprovalDigest,reservation,reservationDigest,state,phaseIndex,
executionPolicy,fenceReceipt,phaseReceipt,phaseBudgetReceipt,publicationReceipt`. Profile is
`umf.native-ingress-transition/0.1`; absent receipts are explicit null. Request
and reservation have the closed shapes above. PhaseReceipt reuses the existing
verified phase index/digest/completed-step/prefix-witness/state representation;
publicationReceipt is the exact verified installation reference0.3. They must
match original source/plan/native state, not just internally consistent hashes.

The fence receipt has exactly `profile,requestDigest,reservationDigest,
targetObservationDigest,oldRolesDigest,oldMembershipsDigest,affectedAclsDigest,
barrierCandidates,retiredSessions,catalogSide`. Profile is
`umf.native-ingress-fence/0.1`, catalogSide previous|next. Barrier entries have
exactly `{pid,backendStart,databaseOid,loginOid,state}`, permitting null OIDs only
while starting; session retirement entries have exactly
`{pid,backendStart,databaseOid,loginOid,outcome}`, outcome terminated|already-exited.
Original observations needed by these digests are retained privately by the
custodian under the same transition; a public digest alone cannot prove their
population or absence. Fence completion requires all candidates resolved, zero
old sessions and qualified source/native binding, irrespective of a supplied
record's state string. Bound one record to1MiB UTF8 canonical form, one native
observation to4096 backend rows, and retained provider history to4096 epochs and
4096 transitions. Exhaustion refuses further issuance; it never silently deletes
retirement evidence. Broader retention/compaction needs a separate qualified
provider-store profile.

These store/API rules plus the protocol's actual native enforcement are the
implementation contract. A fake/structural-only provider must never satisfy
native apply. Install/issuer/custodian qualification and actual source/platform
census remain release gates; the closed design permits reference implementation
to proceed without claiming that those gates already passed.


##### Trusted phase budget and derived admin identity

The immutable trusted host `FieldReplacementExecutionPolicy` has exact integer
members (booleans refuse): `phase_timeout_ms` default30000, range1..300000;
`aggregate_affected_rows` default100000, range0..1000000;
`statement_timeout_ms` default30000, range1..phase_timeout_ms; and
`lock_timeout_ms` default5000, range1..statement_timeout_ms. There are no author
plan/options members selecting these values. Before ingress approval the host
canonicalizes exactly `{version:"umf.g11.execution-policy/0.1",phaseTimeoutMs,
aggregateAffectedRows,statementTimeoutMs,lockTimeoutMs,
derivedModuleProfile:"weft.table-operation-module/0.2"}`. Add its RFC8785 SHA256
`executionPolicyDigest` to GenerationIngressRequest and its approval binding;
the native transition retains the complete policy and verifies that digest.
A resumed transition cannot silently change policy or obtain a fresh budget.

For options/plan0.6 only, derived backfill program AST0.2 uses explicitly trusted
`weft.table-operation-module/0.2`, under a dedicated admin authorization identity
bound to that profile. Legacy plan0.4 keeps module0.1. Neither author wire data,
presence inference, fallback nor SQL rewriting may select a different profile.
Retain full source/default meaning, native `pg18-row-expression-exact/0.1`
guard semantics and private result markers. Future missing-only defaults do not
populate historical rows without an explicit selected backfill. Ordinary client
access to default-bearing sources separately selects the G03 trusted SessionPolicy
module0.2; derived admin selection does not silently upgrade ordinary clients.

Validate each actual private result marker and the fill's own maxRows first.
Then charge the count of validated result rows against one shared whole-phase
aggregate counter. A business row affected by two fills counts twice. Do not use
cursor.rowcount, declared maxima, operation count or a preflight estimate as the
actual charge. Overflow in a later fill aborts all earlier fills and carrier DDL.
Internal count-return/budget plumbing may change while preserving legacy public
return behavior. A no-fill phase dispatches no Weft backfill. DDL and validation
scans are bounded by time and existing step caps; their scanned rows are not
represented as affected backfill rows.

For this PostgreSQL18 profile, acquire an idle private maintenance connection,
set and verify session transaction_timeout BEFORE BEGIN, then enter the phase
transaction. The native transaction timer runs across every statement in that
one transaction. Also maintain a host monotonic absolute deadline; before each
dispatch and COMMIT, refuse expiry and clamp statement_timeout and lock_timeout
to the positive remaining budget and their configured caps. Driver waits and
cancellation are bounded. Per-statement resets or checks only between statements
do not implement the phase deadline. Restore previous session timeouts after
known healthy COMMIT/ROLLBACK; discard terminated or unverified connections.
Unknown COMMIT reconciles the original progress/provider reservation, never
redispatches. A known fully aborted attempt may explicitly retry with a fresh
budget only after positive rollback proof. Fence and publication have separate
bounded stages; phase_timeout_ms is not an end-to-end migration promise.

The closed phase budget receipt is exactly
`{profile:"umf.g11.phase-budget-receipt/0.1",policyDigest,affectedRows,
fillEffects:[{stepId,operation,rows}],nativeTransactionTimeoutMs}`. Entries use
actual validated counts in execution order; sum(rows) equals affectedRows and
must fit the policy. Record it with phase completion and provider cutover in the
SAME native transaction. Null means no committed phase-budget receipt; it is
neither proof of zero effects nor permission to replay an unknown commit.
