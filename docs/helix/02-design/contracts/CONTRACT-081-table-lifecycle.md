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


#### G11 selected owner, native session and backend-observation elaboration

The following rules complete the selected private owner-registration, original
store/session authority and backend-barrier record boundaries. They do not
change any portable plan/options version or waive actual native qualification.
Opaque types and structural protocols remain non-authoritative without the
actual enrolled native issuer, original external custody and endpoint controller.
The original ingress005 protocol remains governing; these exact observations
and separate original authority issuance resolve its private implementation seams.

##### Trusted bootstrap and private resolution

The concrete local custodian is constructed by trusted host bootstrap with one
explicitly enrolled native owner/supervisor adapter and its private registration
resolver. Neither is selected by a migration plan, request payload, GUC, callback
argument or an untrusted request's claimed issuer. A protocol implementation is
not sufficient enrollment. Bootstrap binds the actual adapter object identity,
qualified immutable implementation artifact/profile, host authority identity,
custodian/provider IDs, target-supervisor identity, journal ownership and endpoint
control policy. Test stubs cannot satisfy the production registration check.

An actual owner adapter prepares an OwnerEnrollmentRequest only after the host's
authenticated owner approval and native registration observations succeed. It
issues the exact existing opaque handle with kind
`umf.local-owner-target-registration/0.1`, and privately retains the immutable
closed payload below keyed by handle OBJECT identity in its own issuer registry.
The handle itself exposes neither a JSON payload nor an issuer selected by the
caller. Do not use repr, pickle or a public digest-to-capability constructor.

The custodian calls only its bootstrap-enrolled resolver's private
`resolve_owner_registration(request, *, custodian_id, provider_id)` seam.
The resolver requires the exact OwnerEnrollmentRequest type, verifies
`request._issued_by(enrolled_owner_issuer, selected_kind)` and its original
private registry entry, and validates the entire payload, authenticated approval,
qualified native origin/continuity observation and endpoint-controller authority.
Return a private nonserializable VerifiedOwnerRegistration capability, bound to
that actual resolver and custodian. Production code verifies the issuer/object
registry again before using it. A returned dictionary or user-implemented resolver
does not qualify. Python reflection/imports are not a sandbox against hostile
in-process host code; actual host bootstrap/issuer authority is the trust boundary.

The custodian does not need the issuer's construction seal. It holds a separately
enrolled resolver reference and receives verified original registration through
that reference. Never let a caller pass both a handle and a new purported resolver
or attest to its own payload. Provider and custodian IDs must match bootstrap
before any journal reservation/native work. Native attestation is independently
performed by the enrolled owner adapter, not by validating self-consistent hashes.

##### Closed local registration payload

The private payload has exactly:

```text
{profile:"umf.local-owner-target-registration/0.1",
 registrationId,custodianId,providerId,installationId,
 ownerApproval,origin,endpointControl}
```

IDs other than installationId are UUID strings. installationId uses the existing
bounded nonempty installation identity. ownerApproval is exactly
`{authorityId,approvalId,approvalDigest,scope}`; scope is exactly
`"enroll-owned-local-postgresql-target"`. These fields name the actual original
authenticated host-owner approval retained by the issuer; caller strings do not
establish it. Approval binds the full cycle-free registration intent, including
registrationId, target origin, requested installation, custodian/provider and
endpoint controller, but not its own approvalDigest. Hashing never includes a
digest of itself. Missing/wrong/changed authority or scope refuses.

Origin is exactly:

```text
{profile:"postgresql18-local-supervised-origin/0.1",
 supervisorId,clusterId,incarnationId,creationReceiptDigest,
 nativeBinary,dataDirectory,initialPostmaster,database,endpoint}
```

supervisorId/clusterId/incarnationId are host-issued UUIDs from actual supervisor
creation custody. creationReceiptDigest identifies the supervisor's original
externally retained creation observation, not a SQL-generated random marker.
nativeBinary is exactly `{path,sha256,version}`, version initially `"18.6"`;
path is a private absolute canonical path and sha256 is lowercase64hex over the
actual executable. dataDirectory is exactly `{path,device,inode,ownerUid}` with
actual private host identity observations; device/inode are canonical unsigned
decimal strings in0..18446744073709551615, ownerUid an integer in0..4294967295.
They are additional observations, never standalone anti-copy proof.
initialPostmaster is exactly `{pid,startToken,launchReceiptDigest}` from the
actual supervised child and host process-start observation. pid is positive
native PID; startToken is a bounded exact host-native start identifier. A PID,
pidfile or process-name match alone does not prove owned lineage.

Database is exactly `{name,oid,systemIdentifier}`: qualified native database
identity plus actual cluster system identifier. Oid is a positive native OID;
systemIdentifier is its exact decimal string. These database-copyable values
are cross-checks, not physical continuity authority. Endpoint is exactly
`{host,port}`; first local subset requires host `"127.0.0.1"` and the original
supervisor-owned private port in1..65535. Any admitted Unix socket/alternate
listener must be inventoried and governed by the same endpoint controller before
that extension is qualified; an uncontrolled alternate route refuses enrollment.

endpointControl is exactly
`{controllerId,profile,authorityReceiptDigest}`, profile
`"umf.local-postgresql-endpoint-controller/0.1"`. The receipt is issued from the
actual host-owned controller that controls ALL ordinary connection exposure,
startup/restart/restore admission and private maintenance access. Merely promising
to check the metadata head after ordinary connections arrive is insufficient.
First target is a dedicated isolated supervised local cluster, not an arbitrary
already-running shared service that this controller cannot gate.

Canonical payload is RFC8785 UTF8, at most65536 bytes. Paths are absolute,
canonical resolved native paths, each1..4096 UTF8 bytes. installationId is1..128
UTF8 bytes; startToken1..128 ASCII bytes; database.name1..63 UTF8 bytes. All are
NUL-free. UUID strings use lower-case canonical8-4-4-4-12 spelling. Native OIDs
are exact integers in1..4294967295; PID1..2147483647; port1..65535; ownerUid as
above; custodianSequence1..9007199254740991. systemIdentifier is canonical
unsigned decimal in0..18446744073709551615. Booleans are never integers. Every
digest is exactly64 lower-case hex characters. No nonfinite/unsafe numeric values, duplicate
JSON keys or unknown members. UUID/digest/path canonicality is rechecked by the
resolver. Paths, native observations and authority details remain private; public
TargetCustody exposes only its existing opaque host capability/approved summary.

##### Actual attestor and nonrewinding journal sequence

The enrolled supervisor adapter must actually own cluster creation/startup and
ordinary endpoint gating. It observes the specific supervised process, executable,
host data-directory identity and endpoint, and obtains native control/system/
database observations through its private authenticated maintenance channel.
It verifies their relationship to the ORIGINAL creation/launch records and actual
host controller, not caller-provided process or SQL facts. Actual authentication,
binary version and source ordering need the G11 native acceptance gates.

The fresh private observation has exactly
`{profile:"umf.local-target-registration-observation/0.1",registrationDigest,
originReceiptDigest,currentLaunchReceiptDigest,continuityChainDigest,
endpointGateReceiptDigest,nativeObservationDigest,custodianSequence}`.
Its underlying original observations remain in issuer/custodian custody. The
observer capability is bound to the exact actual issuer and target, not accepted
solely because these strings are hashes. The local custodian validates the
original supervisor's start/restart chain, nonrewinding external journal sequence
and endpoint gate before TargetCustody issuance. No external journal/native
transaction atomicity is assumed.

Registration uses the existing private host journal's exclusive lock, bounded
closed records, original intent/reservation, fsync and atomic durability rules.
Write original registration intent and authenticated authority BEFORE any native
provider enrollment effect. Observe original outcome after unknown write/commit;
do not mint a new registrationId or adopt a same-named target. Confirm TargetCustody
only after actual origin/endpoint observation and durable original registration.
The exact registration digest, provider/custodian/installation, target incarnation
and supervisor origin become part of the custody binding used by subsequent
enrollment, disabled provisioning and transition reservations.

On process restart a volatile handle is not durable authority. The enrolled owner
adapter may reissue a private handle ONLY after resolving the original durable
registration/approval and re-observing the original actual supervisor/custody
chain. Reissuing an opaque handle does not create a new registration/reservation.
After a database restore/copy or an unknown supervisor lineage, keep ordinary
endpoint exposure closed and refuse continuity. Recovery/new incarnation requires
separately approved actual controller action and external/native reconciliation.
Do not reset external journal sequences to make restored native rows agree.

Missing native owner adapter/approval/controller/journal/continuity proof refuses.
Source journal primitives and test-only attestation do not satisfy this production
precondition. A managed control-plane target uses a separately qualified immutable
resource/incarnation/controller issuer; it cannot claim this local profile.

##### Acceptance allocation

Source controls cover wrong issuer/kind/object registry, forged dict/hex digest,
swapped resolver, changed custodian/provider/installation, unknown payload keys,
cyclic approval hash, bounds, serialization and original-outcome restart lookup.
These controls never qualify an actual registration.

Native tests create one actual isolated supervised target and prove binary/
process/data-directory/endpoint/native identity, authenticated maintenance, ordinary
endpoint gating and original external sequence. Inject crashes/lost acknowledgement
at intent/observation/confirmation, legitimate restart versus copied/restored
directory/native markers, wrong process/PID reuse, changed executable/endpoint,
alternate routes, journal rewind/tamper and original approval mismatch. Prove no
TargetCustody or ordinary endpoint exposure on uncertainty. Then run the real
G11 enrollment/provision/fence/session/phase/publication matrix. A production
feature permanently missing the required adapter is unfinished, not a passing
native acceptance result.


##### Ordering and original authority

Do not require future controller/store OIDs in initial target registration.
Register actual supervised physical target custody first. Then the enrolled owner
adapter observes the existing business owner and maintenance identity, and
prepares the exact native provider controller under separate authenticated host
principal-preparation authority. If creation is needed, external original intent
precedes native role creation and the original native creation receipt follows;
no same-name role adoption or guessed future OID. Ordinary ingress remains closed.
Controller roles and all three actual role OIDs must exist BEFORE issuing store
creation authority or obtaining its final approval. Actual setup authority and
receipt are retained by the same independently enrolled owner/custodian chain.

The qualified native attestor then issues an opaque OriginalStoreCreationAuthority
bound to its original private issuer registry. Its closed private payload is:

```text
{profile:"umf.pg18.store-creation-authority/0.1",
 providerId,installationId,registrationDigest,targetCustodyDigest,
 authorityPreparationReceiptDigest,creationApprovalDigest,
 maintenance,controller,businessOwner,requiredMemberships,
 requiredSettings,nativeAuthorityObservationDigest}
```

Each principal is exactly `{oid,name,flags}`. Oid is positive native OID;
name is actual1..63 UTF8 bytes/NUL-free, not an author-selected SET ROLE token.
flags has exactly boolean `canLogin,superuser,createDatabase,createRole,
replication,bypassRls,inherit`, derived from the actual native pg_roles row and
matched to the authenticated original host authority preparation/approval.
The three native principals are distinct. Business owner retains the existing
UMF owner restrictions; trusted maintenance/controller privileges must match the
selected qualified authority profile, never arbitrary flags from a caller.
Ordinary clients cannot reach either controller or business owner. Elevated
trusted maintenance authority is disclosed and qualified separately from ordinary
client safety; a missing concrete privilege profile refuses production issuance.

requiredMemberships is exactly the ordered two direct edges maintenance→controller
then maintenance→businessOwner, each
`{memberOid,roleOid,inherit:false,set:true,admin:false}`. Verify their actual native
edges AND full effective privilege/role closure against the original enrolled
authority and client inventories. Do not treat this two-edge list as evidence
that no additional native reachability exists. Unknown/unapproved extra closure
refuses. Privilege reachability through superuser/ownership/role options is
recorded in the private native observation and selected original host profile;
it cannot be hidden by checking only membership names.

requiredSettings is exactly
`{searchPath:"pg_catalog",timeZone:"UTC",rowSecurity:"on",
sessionReplicationRole:"origin",transactionReadOnly:"off",
transactionIsolation:"read committed"}` for this first write-store profile.
Selected phase policy separately binds dynamic timeout settings. Hooks must
restore/reverify their complete outer policy/settings snapshot, not only these
six members. Additional isolation/native authority variants need their own
explicit qualification, not silent acceptance.

Digests are lowercase64hex; IDs/formats use the existing owner-registration bounds.
The payload is at most65536 canonical RFC8785 UTF8 bytes, no unknown keys,
unsafe numeric coercion or duplicate JSON keys. Creation approval binds the full
cycle-free payload without its own creationApprovalDigest and the original
external creation intent; it includes the actual controller/owner/maintenance
identities and target custody. Native authority observation and original setup
receipts must be retained and authenticated privately. Recomputed hashes alone
cannot authorize any identity or privilege.

##### Closed native context observation

The actual attestor records exactly:

```text
{profile:"umf.pg18.native-session-authority-observation/0.1",
 authorityScopeDigest,registrationDigest,targetCustodyDigest,
 nativeServerVersionNum,database,sessionUser,currentUser,roleSetting,
 settings,principalObservations,membershipObservations,privilegeClosureDigest}
```

First local profile pins nativeServerVersionNum180006 to actual PostgreSQL18.6.
Database is exactly `{oid,name,systemIdentifier}` from the real private native
channel and independently registered physical target. sessionUser/currentUser
are exactly `{oid,name}` observed natively; roleSetting is the actual exact
current_setting('role') string. Settings has the six closed normalized keys above;
principalObservations is the three actual principal records in authority order;
membershipObservations is the complete bounded native role-edge observation
underlying the verified selected closure, sorted by numeric memberOid then roleOid,
with the same exact boolean option fields. Missing visibility/overflow refuses.
Privileged full-closure observations remain privately retained, not supplied as
author summaries. The observation binds the original authority scope, actual
connection/target and exact issuer; a fabricated instance or self-consistent
record does not establish any of these facts.

For create/read/provider-DML context require sessionUser==original maintenance,
currentUser==original controller and roleSetting==controller.name. For outer
business witness/effect context require sessionUser==original maintenance,
currentUser==original businessOwner and roleSetting==businessOwner.name. Compare
BOTH native OIDs and names with original preparation/creation custody, plus the
actual target, settings and full qualified membership/authority closure.
SESSION_USER is deliberately different from CURRENT_USER in both contexts;
never require them equal. Calling SET ROLE does not change the authenticated
maintenance identity or make a caller-chosen role authoritative.

##### Store creation and hook use

Before private control-schema creation, the custodian durably reserves the
original store-creation intent bound to the verified authority/approval and exact
future schema UUID/name. The request does not claim a future schema/table OID.
Reobserve actual native context immediately before fixed DDL on the SAME private
connection/transaction; after creation, record actual original object identities
and native creation receipt in that transaction. External confirmation follows
known native COMMIT. Unknown COMMIT observes the original reservation/objects,
never creates another schema or adopts a same-named preexisting store.

Later store reads use the original externally retained creation authority and
receipt, verify exact native ownership/catalog/ACL and actual controller context.
They do not infer creation authority from current object ownership alone.
Business phase/publication enters the same-connection fixed controller hook only
after the outer business-owner context is observed, verifies controller context,
performs its finite bound provider DML, then restores/reverifies the complete
original outer business context before business SQL/COMMIT. No generic elevated
cursor/callback or extra-object waiver. Errors abort the whole transaction;
uncertain role restoration closes/quarantines the connection. Source attestation
objects cannot substitute for this actual native hook/transaction evidence.

Native acceptance verifies distinct authenticated/effective identities, exact
native principal flags/SET-only edges/extra-closure refusal, wrong target/settings,
denied SET, role/OID/name reuse, wrong actor, private read/creation and same-connection
phase hooks; crashes/lost creation acknowledgements and copied store/native
markers; and no business-only commit or elevated pooled connection. Fake/private
registry tests are source controls only. Until the real issuer, external origin
and native privileges are qualified, concrete provider execution remains unfinished.


##### Source facts and qualified inference

Pinned PostgreSQL18.6 activity output maps native backend states to `starting`,
`idle`, `active`, `idle in transaction`, `fastpath function call`,
`idle in transaction (aborted)` and `disabled`. Undefined state maps to SQL NULL.
Some activity fields are permission-restricted; invalid database/user IDs and
zero start timestamp have explicit NULL output paths.
[pgstatfuncs.c](https://github.com/postgres/postgres/blob/REL_18_6/src/backend/utils/adt/pgstatfuncs.c)

Startup status initialization assigns process start time, initially invalid
database/user identity and the starting state.
[backend_status.c](https://github.com/postgres/postgres/blob/REL_18_6/src/backend/utils/activity/backend_status.c)
The corresponding native state enum is fixed in
[backend_status.h](https://github.com/postgres/postgres/blob/REL_18_6/src/include/utils/backend_status.h).
These facts inform the following provider contract; they do not prove a live
server's privileges, binary, startup/auth ordering or barrier completeness.

##### Stored candidate entry

An original barrier candidate has exactly
`{pid,backendStart,databaseOid,loginOid,state}`. No extra member or string coercion.

| member | Exact normal form |
| --- | --- |
| pid | Integer1..2147483647, excluding boolean. |
| backendStart | Exact finite native timestamptz normalized to UTC `YYYY-MM-DDTHH:mm:ss.ffffffZ`, AD0001..9999, six microseconds digits; no truncation or arbitrary text parser. It is a process token paired with PID, never a timestamp cutoff/order proof. |
| databaseOid | Integer1..4294967295 or JSON null representing actual SQL NULL. Zero and role/database names refuse. |
| loginOid | Integer1..4294967295 or JSON null representing actual SQL NULL. It is native authenticated session identity from the activity observation, not CURRENT_USER after SET ROLE. |
| state | Exact one of the seven source strings above, or JSON null representing actual SQL NULL. No case folding, aliases, `unknown`, inferred `starting` or empty string. |

OID/state NULLs are permitted independently in the captured pending observation;
do not require a fabricated starting label or infer that NULL proves a particular
startup stage. A starting/NULL identity remains unresolved until the actual token
exits or authenticated identity is resolved. State is an observation, not an
authorization or session-absence proof. In particular `disabled` is not exit.

A raw activity row with SQL NULL backend_start cannot supply the required
PID/start token. Preserve that actual raw observation privately and refuse fence
completion before carrier effects. Do not drop it, guess its timestamp, signal
only by PID or attach a later process to that unqualified token. First profile
requires qualified full-statistics access and an actual non-null native start
token for every captured client row. Missing field visibility is not a reason to
ignore an ordinary connection. Detecting such an unsupported native observation
keeps ingress fenced and requires actual provider investigation/requalification.

Capture every client-backend row in the fresh post-fence-commit observation,
without role, database, state or identity filters. The finite qualified profile
uses native backend classification only to select client backends and must prove
that old admitted authentication cannot establish another access-capable backend
class. Refuse if that proof/closed native role inventory is unavailable. Existing
cross-database old sessions are included; exclusive old-role ownership is required.
Sort entries by integer PID then exact backendStart for canonical storage; reject
duplicate PID/start tokens or duplicate live PID entries. Read at most4097 to
detect the4096 bound, never truncate and declare success.

The current G11 fence receipt retains the EXACT original candidate array. A
candidate's later state/identity must not overwrite that original observation.
Reobservations and resolutions are private custodian evidence bound below.

##### Closed resolution evidence

Use private record profile `umf.pg18.backend-barrier-resolution/0.1`, with exactly
`{profile,requestDigest,reservationDigest,fenceCommitReceiptDigest,
candidatesDigest,resolutions}`. Digests are lowercase64hex over the exact original
binding/receipt/array. Resolutions is ordered one-for-one with the original
candidates; no omission, extra token or cross-transition reuse. Each resolution
is exactly `{token,disposition,finalObservation,retirementReceiptDigest}`.
Token is exactly `{pid,backendStart}` copied from that original candidate.

- `pending`: finalObservation is a same-token candidate entry with loginOid null
  or otherwise still-unresolved identity; retirementReceiptDigest is null.
  Pending evidence may be persisted during fencing but forbids a complete fence.
- `exited`: finalObservation and retirementReceiptDigest are null. A fresh
  qualified native observation proves the ORIGINAL PID/start token absent;
  a reused PID with a different start token is not that original session. Do not
  signal the new process. This disposition does not claim that an unidentified
  candidate was owned or deliberately terminated.
- `resolved-other`: finalObservation is a fresh same-token entry with positive
  loginOid proven outside the exact retired authentication-role inventory;
  retirementReceiptDigest is null. Independently verified privilege closure must
  exclude ordinary alternate access to the protected installation. Do not kill
  an unrelated pending session to force resolution.
- `retired-old`: finalObservation is the last same-token native entry with
  positive loginOid matching the exact original owned old authentication role;
  retirementReceiptDigest binds its actual bounded termination/positive absence
  receipt. The last observation is not itself proof of exit. Never infer owned
  identity from a username, SET ROLE, NULL or a caller-supplied ID.

Only exited/resolved-other/retired-old are terminal. Do not classify a NULL-state
candidate as terminal merely because its state label is absent or disabled.
An actual known non-old authenticated UID can resolve identity independently of
the state label, provided privilege closure and the same native token hold.
If a previously observed identity changes incompatibly for a still-live same
token, or cannot be bound to the original snapshot, refuse rather than relabel.

Fence completion requires every original candidate terminal, zero currently
observed old authenticated sessions cluster-wide, qualified native role/ACL
closure and the actual source-informed admission ordering. A final fresh full
snapshot independently confirms no old sessions; it does not replace unresolved
original candidates or establish completion through two empty scans. Original
external custody retains the complete observations, termination results and
resolution record. Existing fence digests bind those original observations; no
new public values or generic caller-supplied observation authority.

##### Retirement receipt entries and transitions

The existing retiredSessions entry stays exactly
`{pid,backendStart,databaseOid,loginOid,outcome}`. PID/start forms match above;
loginOid is positive and proven owned old authentication. databaseOid is positive
or actual null if the known owned session had not acquired a database identity.
Outcome is exactly `terminated|already-exited`, backed by actual original-token
absence. Termination-signal acceptance alone does not satisfy either outcome.
For an unidentified initial candidate that disappears, use resolution exited;
do not fabricate a retiredSessions identity. Entries are unique and sorted by
PID/start. No currently live original old session can have a terminal receipt.

A transition may enter fencing with fenceReceipt null and no complete resolution.
The guarded `fencing -> fenced` update MUST be able to introduce the newly
verified non-null fence receipt/resolution while keeping the original request,
reservation, epochs, policy and original candidate custody unchanged. Requiring
a fence receipt already present in fencing would prevent the real transition.
Fenced/cutover/published require the verified non-null original fence receipt;
prepared cannot claim completion. Unknown COMMIT observes the original native
state and custodian reservation, not a replacement receipt. Retrying must never
reset the original candidate set or forget a pending pre-fence authentication.

Native acceptance uses real delayed SCRAM authentication with NULL/starting
observations as actually emitted, full-statistics privilege verification,
activity-disabled clients, held transactions/cursors, PID reuse, unrelated
pending clients, cross-database old sessions, failed/late termination and lost
fence commit acknowledgements. Store/source tests of these shapes are separate
from the required real PostgreSQL18.6 admission-barrier evidence.


#### G04 selected checked conversion successor

Reserve options/plan `umf.table-migration-options/0.7` and
`umf.table-migration/0.7`, execution `umf.table-migration-execution/0.6`, discovery
`umf.table-migration-discovery/0.4`. This section is the selected successor
contract, not implementation/native evidence. Historical profiles remain exact.
UMF owns intent/dependencies/DDL/correspondence; Weft owns checked scalar recipe
semantics/lowering, and hosts own actual values, authority and storage effects.

Options0.7 contain exactly `version,backfills,concurrentIndexes,reviewedChanges,
validations,conversions`. Backfills, concurrentIndexes and validations are empty.
The existing bounded reviewedChanges array uses the closed five-member marker
shape; no legacy `conversion` string qualifier is admitted. Conversions are the
closed entries below. Plan0.7 retains plan0.6's top-level members with these
explicit successor meanings. Its executionProfile is exactly
`{version:"umf.table-migration-execution/0.6",progressRelation:"umf_lifecycle_progress",
ownerOnly:true,ingressProfile:"umf.table-generation-ingress/0.1",
conversionProfile:"umf.checked-field-conversion/0.1",originalsProfile:P}`,
where P is `umf.pg-row-originals/0.1` if any selection retains originals, otherwise
null. Profile values are compiler-derived, not author capability attestations.
At least one retained Field changes type. Table/Record/Field identities,
configuration, table inventory/names/order and other source meaning remain
unchanged except selected type/facets and explicitly reviewed supported dependent
changes, including companion default and command/query changes. Unknown affected
qualifiers cannot be concealed by projecting away a selected Field. Added/dropped
Fields, nullability changes, seeds and unselected mutations refuse in this first
profile. G11 is not implicitly composed merely because it shares ingress.

The first execution is one atomic `field-conversion` phase. Typed steps declare
`phaseTarget:{table,field}` and compiler-owned phaseOperation values
`capture-originals`, `convert-field`, `validate-conversion` as applicable, plus
existing reviewed dependency/default steps. Step coverage/DAG derives from typed
identities and source/catalog dependencies, never SQL text/rank matching. Capture
precedes its conversion; every conversion precedes full target validation and
phase receipt. Only one selected recipe consumes each type-changing target.
Native catalog index0 is previous and index1 next; metadata head can still be the
predecessor while committed carriers are next. Old ingress stays retired/fenced.

##### Closed discovery, effect and irreversibility review

Discovery0.4 takes exactly `{version,conversionIntents}`. Each intent is the
closed conversion entry below, except irreversible recovery is exactly
`{mode:"irreversible"}`: omit its eventual reviewMarker reference to prevent a
hash/ID cycle. All other recovery shapes are unchanged. Compiler options0.7
normalize to this exact discovery shape by removing ONLY that reference. Intents
never include reviewedChanges, approved digests, arbitrary SQL or host policy.
Both retained sources must be exact independently valid JSON. Duplicate, stale,
unknown or unused intents refuse. Actual old/new pointers are preserved in
candidate diagnostics; authority path is the selected successor mapping pointer.

Discovery emits the existing complete `change-column-type`, dependent/default/
operation/context markers, plus exactly one `conversion-effects` marker for each
selected conversion, including mathematically exact conversions. Every marker
has exactly `id,kind,path,oldDigest,newDigest`. Existing deterministic marker ID
construction and RFC8785 SHA256 apply. For conversion-effects, oldValue/newValue
are exactly `{version:"umf.field-conversion-review/0.1",side,source,configuration,
table,field,meaning,conversionIntent,effects}`. Side is previous|next. Source is
`{format:"json",sha256}` over complete original retained bytes; configuration is
complete validated configuration; meaning is `{physical,logical,mapping}` with
complete original expectations/declaration/mapping, not a lossy field projection.
ConversionIntent is the exact cycle-free normalized intent above. Effects is the
ordered string array derived by these rules, not author prose:

- Every recipe: `original-representation-replaced`.
- numeric-exact with any decimal domain additionally: `lexical-scale-not-promised`.
- numeric-rescale additionally: `numeric-quantization`.
- text-instant additionally: `lexical-offset-and-fraction-spelling`.
- instant-date with discard additionally: `time-component`.
- date-instant additionally: `utc-midnight-assignment`.
- date-text, instant-text or uuid-text additionally: `canonical-text-spelling`.
- text-boolean or boolean-text additionally: `explicit-boolean-token-mapping`.

No other effects or order normalization is admitted. These are potential
representation/meaning dispositions, not a claim that every actual row loses a
value. The marker binds them even for an empty/currently lossless population.
Irreversible recovery.reviewMarker MUST reference this exact conversion-effects
marker ID, consumed exactly once, with its irreversible recovery intent. The
returned plan also emits a review disclosure with exact code
`IRREVERSIBLE_FIELD_CONVERSION`, path equal to that source mapping pointer and
message naming source/target domains and irrecoverable original representation.
Retained/round-trip choices still consume their conversion-effects marker; an
archive does not waive disclosed forward losses. No separate author-controlled
loss boolean or arbitrary effect text grants authority. Target validity and
native capability refusal cannot be overridden by review.

Round-trip integer-widening admission additionally installs/witnesses a native
CHECK enforcing the OLD integer bounds throughout the target-era write domain,
including direct SQL, COPY and every admitted native write path. It is not a
client-only promise. Bind the typed derived constraint to conversion/proof intent,
full native inventory, future plans and restoration. If the target source cannot
express that restricted allowed write domain or a later migration removes it,
the selected proof is unavailable until a separately approved recovery change.

The trusted policy normal form is exactly
`{version:"umf.g04.execution-policy/0.1",phasePolicy,conversionEntryLimit,
retainedLogicalBytesLimit}`. phasePolicy is the complete G11 policy record,
conversionEntryLimit default100000/range0..1000000 and retainedLogicalBytesLimit
default67108864/range0..1073741824, exact integers excluding booleans. The shared
entry count is one row per converted Field; this is additional to G11 fill
accounting (no fill is selected here). Bind this complete policy digest in the
ingress request, approval and native transition. Execution0.6 explicitly selects
this policy variant; execution0.5 retains its original policy-only contract.
No generic unknown-policy fallback. Phase timeouts and native setup match G11.
##### Closed conversion intent

The successor adds `conversions`, an ordered array of at most256 entries. Each
entry has exactly `{table,field,recipe,nulls,invalid,recovery}`. `table` is the
existing stable table binding identifier, `field` is the complete local
`{module,element}` reference to the SAME retained Field identity in both sources.
Duplicates by table/Field refuse. Nulls is exactly `preserve`; invalid is exactly
`abort`. Missing arrays normalize only under the new successor's explicit rules,
never historical plans. Both sources and all identifiers remain source-bound.

Recipe is exactly `{version:"umf.conversion-recipe/0.1",kind,parameters}` with
the kind-specific closed parameter shape below. Unknown members, implicit
coercion, booleans used as numbers, partial parsing and unsupported native/logical
domains refuse. A retained type-changing Field needs exactly one matching
conversion entry; an unchanged or removed Field cannot consume one. Unused
entries refuse. A replacement identity is G11, not a conversion inferred by name.
Source inputs resolve against the original before source/column, never a target
Field that happens to have the same name. Bind the original source format, full
byte digest and field pointer plus exact native source domain in the derived
plan. Complete original bytes remain available for replay and unknown content.

First mode changes logical/native type only. Nullability changes, old-only copies,
arbitrary edits and fills require separately selected composition; they do not
silently ride a conversion. Explicit companion default, query/command parameter,
Key/FK/CHECK/index/policy/grant changes are permitted only through reviewed typed
dependency steps with complete correspondence. Unknown meaning refuses. A default
is never silently cast: unchanged defaults must be proven valid in the target
meaning, or the author explicitly replaces/drops them under G03's closed rules.
Seed sets are never replayed. Invalidated seeds require a separately qualified
history-evolution composition and remain an explicit residual.

##### Finite recipe inventory

All recipes validate the full target logical facets, allowed values and native
capacity after conversion. Source invalidity also refuses. Every input NULL maps
to NULL and consumes no non-null parsing/rounding path. A target that disallows
that NULL fails complete activation; conversion itself never supplies a value.

| kind | parameters | Exact semantics |
| --- | --- | --- |
| `numeric-exact` | `{}` | Integer/finite-decimal to integer/finite-decimal. Preserve the mathematical rational value exactly. Reject any fractional result for an integer, nonzero discarded decimal digits, overflow, nonfinite values or target facet failure. Dropping only trailing zero digits preserves numeric value, not a promise to preserve lexical scale. No binary floating-point intermediates. |
| `numeric-rescale` | `{rounding:"half-even"}` or `{rounding:"toward-zero"}` | Finite decimal source to decimal target with explicit finite target scale. Quantize to that scale using exact decimal/integer arithmetic. Half-even chooses the nearest representable value, ties to an even retained digit, symmetrically for negative values; toward-zero discards fractional magnitude. Check carry overflow after rounding. Actual changed mathematical values require the selected loss review below. No integer target in this first rescale recipe. |
| `text-date` | `{}` | Exactly10 ASCII characters `YYYY-MM-DD`, Gregorian AD year0001..9999, real calendar/leap-day validity. Full consumption; no trim, BC, infinity, locale, guessed years or alternate separators. |
| `date-text` | `{}` | Gregorian AD0001..9999 to exactly `YYYY-MM-DD`. Source BC/infinity/out-of-range refuses. |
| `text-instant` | `{}` | ASCII `YYYY-MM-DDTHH:mm:ss` plus optional `.` and1..6 digits, then `Z` or signed `HH:MM`. Calendar year0001..9999, hours00..23, minutes/seconds00..59; no leap seconds. Offset magnitude at most14:00, with zero minutes at14. Reject `-00:00` (unknown offset). Full consumption, no whitespace. Convert exactly to UTC microseconds; reject UTC results outside AD0001..9999. No truncation or guessed zone. Original lexical offset/precision loss is disclosed. |
| `instant-text` | `{}` | Finite native microsecond instant in AD0001..9999 UTC to `YYYY-MM-DDTHH:mm:ss.ffffffZ`, always six fractional digits. Native infinity/BC/out-of-range refuses. No session timezone dependence. |
| `date-instant` | `{at:"00:00:00",offset:"Z"}` | Gregorian AD0001..9999 date to exactly midnight UTC. No named zone, local timezone or DST inference. |
| `instant-date` | `{time:"require-midnight",offset:"Z"}` or `{time:"discard",offset:"Z"}` | UTC calendar date for a finite microsecond instant in AD0001..9999. `require-midnight` rejects any nonzero time component. `discard` explicitly drops time and requires loss review. No session timezone or named zone selection. |
| `text-uuid` | `{}` | Exactly lower-case canonical ASCII `8-4-4-4-12` hexadecimal UUID spelling, no braces/whitespace/alternate layout/case folding. All128-bit values allowed subject to target facets; no inferred UUID version restriction. |
| `uuid-text` | `{}` | Canonical lower-case `8-4-4-4-12` ASCII spelling. |
| `text-boolean` | `{trueToken,falseToken}` | Two distinct nonempty exact strings, each at most128 UTF8 bytes. Full string equality, no trim, Unicode normalization, case folding or truthiness. Every other token refuses. |
| `boolean-text` | `{trueToken,falseToken}` | Exact selected token for true/false; same distinctness/bounds as parsing. Target text facets still apply. |

This inventory is finite, not a claim of all possible type pairs. Float families,
numeric/text parsing, arbitrary text reformatting, extra instant precision,
named-zone gap/fold rules, spatial/JSON/arrays/generated values and user-defined
recipes remain explicitly unsupported until independently specified and tested.
Delivering one family does not close G04's remaining families.

##### Loss and recovery are separate obligations

The existing destructive-review marker binds full old/new Field meaning and
declared conversion effects, not merely SQL type names. Add a located explicit
loss marker whenever the selected recipe permits changed mathematical values,
discarded time, changed lexical scale/spelling or lost lexical offset/precision.
The plan records potential loss even on an empty or presently lossless sample.
A boolean approval cannot suppress target validity, unknown semantics or native
capability refusal. Public receipts contain aggregate counts and located schema
diagnostics; no original/reject values or low-entropy per-value hashes.

Recovery has exactly one closed shape:

- `{mode:"irreversible",reviewMarker}`: explicit immediate loss of the original
  representation. The marker must exist, bind this exact conversion and be
  included in approval. It is required even when a narrow mathematical value
  preservation claim holds, unless an admitted round-trip proof covers recovery.
- `{mode:"retained-originals",policy:{id,revision}}`: select an authenticated
  immutable host retention policy and the actual `umf.pg-row-originals/0.1`
  provider. Policy is not an author-selected pathname, arbitrary archive SQL or
  unauthenticated window. Missing provider/policy refuses.
- `{mode:"round-trip",proofProfile}`: allowed only for a finite compiler/host
  capability whose closed source and allowed post-cutover write domain prove
  the inverse. Initially whitelist `umf.exact-integer-widening-roundtrip/0.1`,
  restricted to the old integer bounds on BOTH source values and target-era
  admitted writes. Broader target writes make the mode unavailable; a tested
  sample or an author-supplied inverse cast is not a proof.

Round-trip reversibility still needs a new approved restore plan, current-domain
validation and ingress protection. It never resets metadata history or promises
that deleted rows can be reconstructed. Retained mode and loss review may both
be required: keeping originals does not make the forward target semantics equal.

##### First native execution strategy

`postgresql18-checked-inplace/0.1` is maintenance-only. Use the adopted G11 actual
credential/session retirement provider, external target custody and private
same-connection controller hooks. Keep stable effective subjects and occupied
outcome slots. Native locks alone do not qualify protection of the gap after
carrier COMMIT and before publication. Acquire the complete affected table/FK
closure in deterministic order with exclusive carrier protection; another
migrator cannot race the selected transition. Refuse unowned inbound/native
dependencies and prohibited object kinds. Do not use CASCADE.

Use one protected business transaction for original capture, checked conversion,
full target constraint/dependency validation, post-cutover revision capture and
phase receipt. The admitted Weft recipe lowers the actual conversion expression;
the adapter may place that expression into its fixed DDL but cannot replace it
with a permissive native cast. No author `USING` SQL. Validate the entire actual
population, including target Key collisions after conversion. A prior unprotected
scan is advisory. Zero-row conversions still validate schema/default/dependencies.

Apply the trusted G11 execution policy to the whole transaction, including native
transaction_timeout before BEGIN, absolute host deadline, bounded driver waits
and positive rollback/unknown-COMMIT handling. Add a trusted protected-population
bound default100000/max1000000 rows and private retained logical-byte bound
default64MiB/max1GiB. These are trusted policy, included in approval identity, not
author wire members. Count the locked complete population once per converted
Field; converting two Fields in one row charges two entries. A finite qualified
measurement must include actual retained values and metadata; an estimated
preflight or disk-block count does not prove the logical-byte bound. Fail before
conversion on overflow, and roll back any capture/DDL already in that transaction.
No promise of a physical disk-byte ceiling follows from this logical-byte limit.

Record completed recipe/profile/policy digests, exact population/effect counts,
custody/archive identifier when selected, native prefix witness and original
approval/progress binding in the SAME transaction. Keep ingress fenced until
new source/binding/head and epoch are atomically published and externally
confirmed. Unknown COMMIT observes the original transition and native witnesses;
never apply a second conversion to values already converted. Failed uncommitted
capture/rewrite rolls back together; durable fence/progress can remain.

##### Row-originals provider contract

First provider is one exact installation-owned private schema in the same
physical PostgreSQL database. Provider inventory names each native object and
original creation identity under external custody; no prefix adoption or schema
exception for arbitrary objects. It is distinct from the G11 ingress control
store and cannot grant ordinary clients or businessOwner access to originals.

Before conversion, enroll protected hidden row-instance UUID and positive int8
revision columns, a native unique constraint and fixed owned INSERT/UPDATE
trigger/function profile. The compiler must reserve exact collision-checked
native names under the selected provider. UUIDs are assigned once for each
insert; updates preserve identity and increase revision, including no-op updates.
Overflow/collision aborts, never wraps or resets. DELETE then INSERT with a reused
business Key creates a different UUID. Neither `ctid`, `xmin`, mutable Keys nor
row order substitutes for this identity. Native generated/identity/partitioned
tables need separate admission and are not silently included.

The native expected inventory is the explicit union of the compiled business
catalog and this exact enrolled provider footprint, including physical column
order and dependency ownership. Keep their source correspondences distinct:
provider columns are not silently added to Core Fields or generated API results.
Existing blanket extra-column/trigger refusal needs a versioned exact provider
composition, not a generic allowance for extra objects or trusted name prefixes.
Migrations without this selected capability retain their original refusal rules.
PostgreSQL columns are not intrinsically hidden: ordinary `SELECT *`/implicit
full-column writes can fail under the required column privileges. Generated
queries must select explicit application columns, and this direct-SQL
compatibility boundary is part of enrollment approval and native acceptance.

Ordinary principals have only explicit application-column SELECT/INSERT/UPDATE
grants, no inherited or direct table-level grants exposing metadata. Trigger
invariants plus the actual column privilege boundary reject supplied/returned
tokens; ordinary SQL cannot reset identity/revision or disable/change the
trigger, function, replication role or relevant ALTER/parameter privileges.
No caller GUC enables a bypass. Safe search path, exact function body/owner,
memberships and every dependency are catalog-witnessed. Old implicit full-column
INSERT/direct-writer compatibility changes must be disclosed, not patched with
metadata privileges. Superuser/controller authority is outside ordinary clients
and remains trusted host authority, with its explicit private fixed operations.

Capture every original instance's native old typed value and NULL presence,
source Field/type/facets/encoding, instance UUID and capture revision. Archive
metadata binds installation/target incarnation, archive/migration UUID,
source/target/plan/approval digests, exact policy revision and selected native
object identities. After actual conversion and validation, capture each same
instance's actual post-cutover revision as its restore baseline IN THE SAME
transaction. Do not assume that capture revision equals post-cutover revision:
some native strategies may perform updates. New strategies require their own
identity-lineage qualification; first strategy is in-place only.

Archive access returns an opaque host capability, never raw values in portable
plan/receipts. Verify native typed custody, original external creation binding,
exact row set/count and private object/ACL/catalog inventory before relying on
recovery. Retention policy has a qualified time authority, authenticated current
holds and monotonic custody; expiry only permits separately approved G05 purge.
No automatic deletion or historical-source-as-data claim.

Restore is a new approved protected plan with the exact original archive. An
original instance is restorable only if still present and its current revision
equals the recorded post-cutover baseline. Any later update initially conflicts,
even to an unrelated Field. Do not infer an exception from unchanged value.
Deleted originals remain deleted. New/reinserted instances have no originals;
default is complete restore refusal until a separately selected reverse recipe
or explicit fill/repair disposition covers every such instance. Never join an
archive solely on business Key or resurrect a deleted row. Verify the complete
restored target, dependencies, defaults and client bindings before publication.
Conflicts/missing/tampered/expired custody cause full refusal, no partial schema
activation or silent overwrite. Restore itself does not purge the archive.

G05 retirement/restore/purge, G06 online capture/shadow lineage, external archives,
key management, archive compaction and relaxed unrelated-update reconciliation
remain distinct unqualified capabilities. G04 is not complete until both its
selected recipes and its selected recovery modes have actual native evidence;
irreversible-only delivery must explicitly retain the originals-mode gap.

##### Independent acceptance and release allocation

Amend all three governing documents before enabling a successor. Each recipe
gets manually specified values and refusals: signed numeric bounds, ties/carry/
negative rounding, trailing zeros, NaN/infinity; leap calendars; full-consumption
and whitespace refusal; explicit offsets/unknown offset, precision and UTC year
boundaries; midnight/discard; UUID spellings; exact boolean tokens and target
Key collisions. No runtime float, locale, DateStyle or session TimeZone changes
may alter the selected meaning. Qualify the native runtime/version explicitly.

Exercise defaults and actual generated query/command clients, affected inbound
FKs, CHECKs, indexes, RLS/grants and unknown extension preservation. Native data
must match complete independently authored expected rows under a qualified
observer, including FORCE RLS. Source/browser parity is separate evidence.

For retained recovery, execute unchanged, no-op-updated, unrelated-updated,
changed, inserted, deleted and Key-reused instances; supplied/RETURNING tokens,
COPY, ON CONFLICT and each actually admitted MERGE path; trigger/parameter/role
bypass attempts, collision and revision overflow; tampered/missing archive/ACL,
restored database/rewound custody; and current policy/hold/expiry refusal. Pause
real old prepared readers/cursors/direct writers at fence, carrier COMMIT and
publication. Inject cancellation and lost acknowledgements at capture, rewrite,
validation, phase COMMIT and publication. Prove rollback or original committed
outcome lookup and no double conversion. Native provider absence is not a
passing substitute for these effects.

Freeze complete installed Core/Weft/Codegen/Access/SDK artifacts, actual wrapper
profile propagation, native source census, browser/CI/platform matrix and fresh
public-download byte correspondence. Release notes enumerate exact delivered
recipes, source/target domains, recovery/host modes, versions/evidence and every
remaining family/composition/backend gap. Do not close the whole backlog from a
single maintenance conversion.


##### Exact first originals store and row-identity footprint

Select `umf.native-row-originals-store/0.1` only on the qualified PostgreSQL18.6
UTF8 database subset. The trusted original-creation schema is `umf_originals_`
plus the provider UUID's32 lowercase hex digits, owned by a distinct enrolled
originals-controller. It has no PUBLIC/business-owner/ordinary-client access.
The maintenance SESSION_USER has separately enrolled SET-only authority to the
business owner and originals-controller; ordinary subjects cannot reach them.
The same G11 fixed same-connection role-hook discipline applies. Provider native
registration binds external target custody and original schema/table/function/
constraint/index/trigger OIDs and names. Copied metadata/name/OID equality alone
never establishes original authority. No IF NOT EXISTS or prefix adoption.

The fixed registration table is:

```sql
CREATE TABLE <originals>.row_tables (
 table_token pg_catalog.uuid PRIMARY KEY,
 installation_id pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (installation_id <> ''),
 business_table_oid pg_catalog.oid NOT NULL UNIQUE,
 business_schema_oid pg_catalog.oid NOT NULL,
 table_binding pg_catalog.text COLLATE pg_catalog."C" NOT NULL,
 record pg_catalog.jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(record) = 'object'),
 record_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (record_digest ~ '^[a-f0-9]{64}$')
) USING heap;
CREATE TABLE <originals>.archives (
 archive_id pg_catalog.uuid PRIMARY KEY,
 table_token pg_catalog.uuid NOT NULL REFERENCES <originals>.row_tables(table_token) ON UPDATE RESTRICT ON DELETE RESTRICT,
 state pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (state IN ('capturing','complete')),
 values_relation_oid pg_catalog.oid NOT NULL UNIQUE,
 row_count pg_catalog.int8 NOT NULL CHECK (row_count BETWEEN 0 AND 1000000),
 logical_bytes pg_catalog.int8 NOT NULL CHECK (logical_bytes BETWEEN 0 AND 1073741824),
 record pg_catalog.jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(record) = 'object'),
 record_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (record_digest ~ '^[a-f0-9]{64}$')
) USING heap;
```

A row-table record has exactly `{profile:"umf.native-row-identity/0.1",providerId,
installationId,targetCustody,tableToken,tableBinding,businessRelation,
idColumn,revisionColumn,uniqueConstraint,revisionConstraint,trigger,function,
creationReservationDigest}`. businessRelation is exact `{schemaOid,schemaName,
tableOid,tableName}`; column entries are `{attnum,name,typeOid,typeMod}`;
constraint/trigger/function entries are `{oid,name,definitionDigest}`. Their
native definitions, owners, flags, ACLs/dependencies and exact provider shape
must independently match the fixed renderer; digest self-consistency is not
native proof. IDs/OIDs are typed positive native identifiers, not name inference.

An archive record has exactly `{profile:"umf.native-row-originals/0.1",providerId,
installationId,targetCustody,archiveId,tableToken,field,sourceDigest,targetDigest,
planDigest,approvalDigest,policy,sourceNativeDomain,valuesRelation,
creationReservationDigest,state,rowCount,logicalBytes}`. Field is complete
module/element, policy is authenticated id/revision, sourceNativeDomain is exact
`{schema,name,typeOid,typeMod,collationOid}` from the selected previous catalog,
valuesRelation exact schema/name/OID. All digest fields are lowercase64hex.
Native duplicate columns and recomputed record digests must agree on every read.
These records have no row originals or per-value hashes. Full original private
creation/policy/source observations remain in authenticated host custody.

Each archive owns exactly one heap `values_<archiveUUID32hex>`:

```sql
CREATE TABLE <originals>.<values> (
 instance_id pg_catalog.uuid PRIMARY KEY,
 captured_revision pg_catalog.int8 NOT NULL CHECK (captured_revision > 0),
 post_revision pg_catalog.int8 CHECK (post_revision > 0),
 old_value <qualified-old-native-type>
) USING heap;
```

The sole variable scalar type is compiler-rendered from the exact source native
domain, initially pg_catalog int2/int4/int8, finite numeric(p,s) within admitted
capacity, text COLLATE pg_catalog."C", uuid, bool, finite date AD0001..9999 or
finite timestamptz(6) whose UTC year is in that range. Unknown types/domains/
collations/generated/identity/partitioned carriers refuse. No author SQL type.
Old_value remains genuinely native typed and nullable; no JSON/float/string
substitute is its retained value. Native NULL is preserved; this does not invent
an absent-versus-NULL distinction that the original SQL carrier did not store.
There is NO FK from archive instances to live business rows: deletion must not
cascade originals or forbid ordinary deletes. Only fixed PK/check backing
indexes are admitted; no RLS, triggers, rules, partitions/inheritance or unmanaged
dependencies on any private store table. One record is at most1MiB canonical
UTF8; cap enrolled tables/archives at4096 each, refuse exhaustion, never autoerase.

For each enrolled business table choose one original trusted tableToken UUID.
Its exact metadata names are `__umf_row_id_<token32>`, `__umf_row_rev_<token32>`,
`__umf_row_key_<token32>`, `__umf_row_positive_<token32>` and
`__umf_row_guard_<token32>`. Collision with any existing object refuses. Under the
same approved protected transaction, append id UUID NOT NULL with temporary
pg_catalog.gen_random_uuid() default, and revision int8 NOT NULL with temporary1
default to populate existing rows. Install native unique(id) and CHECK(rev>0),
then drop both defaults and install the exact fixed BEFORE INSERT OR UPDATE
FOR EACH ROW guard; ENABLE ALWAYS the guard. No native table rewrite equivalence
is assumed without actual evidence.

The fixed function/trigger renderer is as follows. Angle-bracket identifiers are
only the original safely quoted provider schema/function/table/column/trigger
identities described above; they are not author SQL or template parameters:

```sql
CREATE FUNCTION <originals>.<identity>() RETURNS trigger
 LANGUAGE plpgsql VOLATILE CALLED ON NULL INPUT SECURITY DEFINER
 PARALLEL UNSAFE COST 100 SET search_path = pg_catalog
 AS $umf_identity$
BEGIN
 IF TG_OP = 'INSERT' THEN
  NEW.<id> := pg_catalog.gen_random_uuid();
  NEW.<rev> := 1;
 ELSIF TG_OP = 'UPDATE' THEN
  IF NEW.<id> IS DISTINCT FROM OLD.<id> OR NEW.<rev> IS DISTINCT FROM OLD.<rev> THEN
   RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'umf row identity mutation denied';
  END IF;
  IF OLD.<rev> = 9223372036854775807 THEN
   RAISE EXCEPTION USING ERRCODE = '22003', MESSAGE = 'umf row revision exhausted';
  END IF;
  NEW.<id> := OLD.<id>;
  NEW.<rev> := OLD.<rev> OPERATOR(pg_catalog.+) 1::pg_catalog.int8;
 ELSE
  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'umf row identity trigger event denied';
 END IF;
 RETURN NEW;
END;
$umf_identity$;
CREATE TRIGGER <guard> BEFORE INSERT OR UPDATE ON <business>.<table>
 FOR EACH ROW EXECUTE FUNCTION <originals>.<identity>();
ALTER TABLE <business>.<table> ENABLE ALWAYS TRIGGER <guard>;
```

The function name is `<originals>.identity_<token32>()`, RETURNS trigger,
LANGUAGE plpgsql, VOLATILE, SECURITY DEFINER, PARALLEL UNSAFE, CALLED ON NULL INPUT,
SET search_path=pg_catalog; owner is originals-controller. Its fixed generated
body admits TG_OP INSERT and UPDATE only. INSERT assigns NEW.id from
pg_catalog.gen_random_uuid() and NEW.rev=1. UPDATE raises SQLSTATE42501 if NEW.id
or NEW.rev differs from OLD; raises22003 if OLD.rev=9223372036854775807;
otherwise preserves id and sets rev=OLD.rev+1. Return NEW. No dynamic SQL,
caller-selected function, ambient GUC bypass or arbitrary dependency. Native
schema guards compare every pg_proc option/body/dependency and trigger
properties, not a function-name allowlist. Revoke PUBLIC EXECUTE in the same
creation transaction; create the trigger through the explicitly enrolled
maintenance authority, then remove temporary setup grants. Qualify actual native
trigger invocation and direct EXECUTE denial, not an assumption about privilege
checks. PostgreSQL's documented trigger, function and grant surfaces inform this
selected shape, not executed proof:
[CREATE TRIGGER](https://www.postgresql.org/docs/18/sql-createtrigger.html),
[CREATE FUNCTION](https://www.postgresql.org/docs/18/sql-createfunction.html),
[GRANT](https://www.postgresql.org/docs/18/sql-grant.html).

Explicit application-column privileges replace ordinary table-level SELECT,
INSERT and UPDATE grants. Allowed DELETE stays its independently selected table
privilege/RLS meaning. Revoke PUBLIC/direct/inherited whole-table privileges and
metadata column access, including REFERENCES, TRIGGER, MAINTAIN and ALTER/role/
parameter authority that could expose or bypass the guard. Preserve the actual
application-field/person/batch deny/allow semantics and FORCE RLS. No ordinary
SELECT/RETURNING/COPY may expose metadata or archives. Complete typed native
expected ACLs are the exact source-derived business grants translated to known
application columns plus the original enrolled provider footprint. Unknown extra
columns/triggers/functions/ACLs still refuse; no external-object waiver. Old
SELECT* and implicit full-column write compatibility changes require explicit
enrollment disclosure and actual client evidence.

Under actual exclusive table/dependency protection and durable ingress fencing,
the fixed private maintenance scope may disable RLS on the business table, verify
that state, collect the complete original typed rows as businessOwner on the
SAME connection, then enter the controller hook only to insert bounded native
values into the exact archive, and restore/reverify owner/settings. No archive
privilege goes to businessOwner and no general controller SELECT grant goes to
business data. Private bounded buffers and parameter adaptation remain exact;
no values enter public logs or portable receipts. Re-enable/force RLS and verify
its original/next source policy surface before the committed phase receipt.
Any error aborts that entire transaction. This narrow transactional RLS scope
must be qualified with real FORCERLS rows; owner-visible empty rows are not a
capture oracle. Source expressions cannot acquire this maintenance authority.

Logical retained bytes are exactly the canonical accountingManifest projection
(complete archive record with ONLY logicalBytes omitted, retaining actual
rowCount/state complete and all source/policy/object bindings) UTF8 byte length plus,
for each retained instance,41 bytes (UUID16, captured/post revision8 each,
NULLtag1, value-length8) plus N bytes. N is zero for NULL, otherwise the length of
that admitted native scalar's canonical text output encoded as UTF8 under pinned
ISO,YMD DateStyle/UTC settings. It measures logical custody, not heap/WAL/disk.
Only fixed pg_catalog scalar casts/I/O are used for this measurement, not author
casts. Retained old_value itself remains native typed. Native/driver tests must
prove exact values and this bounded accounting; policy count/budget failure
rolls capture and conversion back together. Check source finite/calendar domain
BEFORE adapting values to a driver that might collapse a native special value.

After conversion, same-instance post_revision observations populate every
archive row, then set post_revision NOT NULL and mark complete in the SAME
business transaction and native phase receipt. Verify complete row-set equality
and unchanged tableToken/identity before commit. Capturing archives cannot be
recovery authority; unknown COMMIT observes original archive/progress, never
creates a replacement. Restore compares CURRENT revision with that actual
post-cutover baseline, never merely captured_revision. Any changed original or
new instance without admitted reverse/fill disposition causes full restore
refusal; deleted originals are not resurrected and reused Keys do not match.
Archive purge, relaxed unrelated-update restore, online capture/shadow copies
and storage outside this exact database are separately selected G05/G06 work.


##### Plan effect variants

Source-only UMF planning does not call Weft. Add `kind:"conversion"` only for
plan0.7. Every such step has exactly the common source-bound step members plus
`operation,phaseOperation,phaseTarget,conversionBinding`; sql is exactly the empty
string and transaction exactly `required`. Operation and phaseOperation are the
SAME literal, one of `capture-originals|convert-field|validate-conversion`.
PhaseTarget is exact `{table,field}`. Common members are the existing
`id,kind,sourcePath,transaction,sql,preconditions,expectedOutcome,verification,
recovery`, preserving their existing fixed phase/source/native-witness meanings.
No phaseDependency/constraintKind/seedSets or author executable SQL on these steps.

ConversionBinding is exactly
`{profile:"umf.field-conversion-step/0.1",selectionIndex,intentDigest,
beforeDomainDigest,afterDomainDigest}`. Index is the actual normalized options
array index0..255; digests recompute from cycle-free intent and complete original
before/after `{physical,logical,mapping}`. Capture sourcePath is exactly
`/options/conversions/<index>/recovery`, conversion sourcePath exactly
`/options/conversions/<index>/recipe`, and validation sourcePath the exact
successor column mapping sourcePath. Preconditions are exactly
`{phase:"before-plan",kind:"installed-source-cohort",bundleDigest:previous.digest}`;
expectedOutcome exactly `{phase:"before-commit",kind:"complete-next-source-catalog",
bundleDigest:next.digest}`. Verification is exactly
`"native-catalog-privileges-and-role-scope"`, recovery exactly
`"rollback-transaction"`, with the concrete data/custody validation obligations
below. IDs retain the existing ordered `step-` plus five ASCII digits algorithm.
These located paths are never SQL authority.

Emit capture-originals exactly once before that conversion if and only if its
recovery selects retained-originals; otherwise emit none. Emit exactly one
convert-field and validate-conversion per selection. Validate-conversion follows
all relevant conversions and reinstalled dependencies, including cross-Field
CHECK/Key/FK closure. Step ordering is a typed DAG, not operation-name/SQL adjacency.
All three run in one atomic field-conversion phase under original approval and
actual source/native custody; generic empty-SQL fallback is forbidden. Plan
verification recompiles these exact variants from original sources/options and
rejects injected/missing/duplicate/cross-target bindings before native effects.

##### Native preparation request

The trusted host prepares the actual conversion through a newly qualified Weft
checked-recipe capability. It uses exact installed immutable Weft artifacts from
the original approved native qualification evidence/census, not an author module,
caller callback or arbitrary JSON-returning fake. Public wrapper function names
must be agreed with the Weft owner before enabling this port; profile semantics
and closed records below are the required boundary.

Request is exactly
`{version:"weft.checked-conversion-request/0.1",target:"postgresql18",binding,
beforeDomain,afterDomain,recipe,nulls:"preserve",invalid:"abort"}`.
Binding is exactly `{previousSource,nextSource,previousBundleDigest,
nextBundleDigest,configurationDigest,table,field}`. Each source is exactly
`{format:"json",sha256}` over full original retained bytes. Domain is the exact
complete source-derived `{physical,logical,mapping}`; recipe is the selected
closed recipe. Every binding/domain/digest is rederived by UMF from the verified
plan and original source, not accepted from a supplied prepared descriptor.
Weft admits its exact logical/native domains and checked recipe or refuses;
unknown qualifiers/meaning cannot be dropped to get a compilation result.

Native preparation happens before any phase dispatch, with finite resource
bounds. It does not scan/change rows or acquire a connection in Weft. The host
retains the actual qualified prepared compiler handle and verifies the complete
reply/request correspondence. It may reprepare deterministic artifacts after
known safe restart, but unknown/committed conversion effects are never replayed.

##### Checked scalar descriptor and SQL authority

A successful reply is exactly
`{version:"weft.checked-conversion/0.1",status:"compiled",target:"postgresql18",
requestDigest,binding,recipeDigest,beforeDomainDigest,afterDomainDigest,
expression,nativeExactValueGuard}`. RequestDigest is RFC8785 SHA256 of that actual
closed request; binding is exact request binding. All other digests recompute.
Host qualification separately verifies actual immutable native compiler/artifact
identity; an echoed digest or arbitrary matching dictionary is not authority.

Expression is exactly `{kind:"checked-scalar",sql,input,output}`. Input is exact
`{table,field,column}` from the original source; output is exact
`{schema,name,typeMod,collation}` from its admitted next native domain. SQL is one
finite scalar expression generated/escaped by Weft, at most65536 UTF8 bytes.
It refers only to the selected original source column, known pg_catalog
operations and recipe constants. No outer DDL/DML, multiple statement, callback,
catalog query, user-defined object, arbitrary function or connection authority.
There are no driver parameter slots in this first DDL expression profile:
Weft owns typed literal rendering/escaping for finite recipe parameters. The host
must not interpolate token strings or assume utility-DDL parameter support.

NativeExactValueGuard is exactly
`{profile:"pg18-checked-conversion-exact/0.1",sqlstate:"22012",
scope:"all-protected-source-rows",nullInput:"preserve-null",
invalidInput:"statement-error-and-transaction-rollback",
nonfiniteInput:"statement-error-and-transaction-rollback",
lossPolicy:"selected-recipe-only",privateResults:true}`. Selected rounding/time
discard is explicit recipe meaning, never generic lossy coercion. Target
constraints/Key collisions may produce their actual native SQLSTATE; all errors
abort the complete phase and public diagnostics omit values/DETAIL samples.

UMF renders only its fixed safe DDL shell:
`ALTER TABLE <verified qualified table> ALTER COLUMN <verified target column>
TYPE <compiler-owned target native type> [COLLATE <qualified admitted collation>]
USING (<verified Weft checked scalar>)`. The destination type/collation comes
from the verified next catalog. The scalar comes only from the actual qualified
Weft preparation above. Do not parse an author SQL string, replace it with a
native cast, rewrite a returned scalar, or move migration DDL into Weft. Matching
names/digests alone cannot authorize a foreign prepared handle.

Capture-originals invokes the exact private typed store/row-identity protocol;
validate-conversion invokes protected complete target/domain/catalog/dependency
validation. Neither step executes author SQL or becomes a no-op merely because
plan.sql is empty. Source-only export/check is descriptive and cannot qualify
native apply when this concrete compiler/provider is unavailable.

##### Committed runtime correspondence

For execution0.6 select private transition record variant
`umf.native-ingress-transition/0.2`; keep the exact original transition keys but
executionPolicy must have G04's closed policy profile, and phaseBudgetReceipt
must have the following G04 variant after committed phase completion. Other
execution profiles retain their original exact record variants/refusal rules.

Receipt is exactly
`{profile:"umf.g04.phase-budget-receipt/0.1",policyDigest,conversionEntries,
retainedLogicalBytes,fieldEffects,nativeTransactionTimeoutMs}`. FieldEffects is
ordered in selected conversion execution order, at most256 unique targets, each
exactly `{stepId,table,field,intentDigest,recipeDigest,beforeDomainDigest,
afterDomainDigest,programDigest,compilerArtifactDigest,sourceCount,
convertedCount,archiveId}`. SourceCount/convertedCount are exact nonnegative safe
integers from the actual complete protected population; equality is required for
this non-row-deleting/non-filtering profile. ConversionEntries is their shared
sum and must fit policy. ArchiveId is actual original custody UUID or null iff
no retained recovery was selected. ProgramDigest hashes the complete actual
verified reply; compilerArtifactDigest matches original native qualification
evidence and the actual installed native module census. RetainedLogicalBytes is
the defined complete sum across selected archives, within policy. No row values
or per-value hashes enter this receipt.

Persist the verified descriptor/custody observations privately and this exact
receipt with business cutover/phase completion/provider record on the SAME
transaction. The host checks original selected step order/target, actual compiler
identity, complete digests, counts and archive correspondence before recording.
An internally consistent invented receipt is insufficient. Unknown COMMIT
observes original progress/store receipt; never reexecutes conversion to obtain
a missing local descriptor/result. Native tests must prove this boundary and
actual scalar correctness before production admission.

##### Cycle-free retained-byte accounting

For each archive compute accountingManifest from the COMPLETE actual archive
record with exactly its `logicalBytes` member omitted. Keep every other member,
including actual rowCount, values relation/source/target/approval/policy bindings
and state `complete`. Hash/checksum columns outside that record are not part of
accountingManifest. Do not include its own counter or introduce a least-fixed-point
iteration. Canonical RFC8785 UTF8 bytes of that projection plus the specified
41+N bytes per instance define this profile's logical byte count. Sum archives
with exact integers, compare bound before conversion when all projected inputs
are known, and reverify actual complete record at phase completion before COMMIT;
overflow aborts the entire transaction. Counter/checksum bookkeeping is excluded
from this declared logical measure and separately bounded by the exact store
record/shape caps. No physical heap/WAL/disk-byte ceiling is claimed.


#### G11 selected concrete local supervisor and native authority profile

Select `postgresql18-local-supervisor/0.1` as the first actual implementation
profile beneath `postgresql18-login-epochs/0.1`. This elaborates the original
owner/session custody and native barrier rules without changing portable wire
versions. It explicitly selects trusted privileged maintenance/controller
authority and a dedicated owned PostgreSQL18.6 target. Source-only issuer objects
and permanent refusal are not implementation completion. The following fixed
profile must be implemented and independently qualified natively before enablement.

##### Exact privilege and endpoint subset

Use one dedicated isolated PostgreSQL18.6 cluster created by the actual host
supervisor, one original application database/installation and loopback IPv4.
No shared service adoption, replication, alternate listeners, extensions beyond
the qualified initialization footprint, or managed/OAuth target claim. Qualify
the exact PostgreSQL binary/toolchain, OS/native process-observer and driver.

This first local profile explicitly trusts maintenance AND controller as full
native cluster administrators. It is not a least-privilege profile. Neither
credential/role is available to ordinary clients, source declarations or GUCs.
The exact role flags are:

| Principal | canLogin | superuser | createDatabase | createRole | replication | bypassRls | inherit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| maintenance | true | true | false | false | false | false | false |
| controller | false | true | false | false | false | false | false |
| businessOwner | false | false | false | false | false | false | false |

SUPERUSER conveys effective native privileges despite the other false flags;
the native closure/authority receipt records that fact. Ordinary subjects,
audience roles and epoch logins remain non-superuser/non-bypass and cannot reach
these trusted roles. Every privilege/role membership outside the closed original
approved footprint refuses. A managed/non-superuser provider requires its own
explicit profile and actual authority qualification.

Bootstrap maintenance name is `umf_m_<supervisorUUID32hex>`, controller
`umf_c_<supervisorUUID32hex>`. BusinessOwner is the exact configured original
owner, not renamed. This first subset requires database and admitted role names
to match `[a-z][a-z0-9_]{0,62}` and quotes them in HBA fields; no special keyword
or unescaped field interpretation. Original role creation/alteration is done
under authenticated host bootstrap authority BEFORE final authority approval.
If an original business owner already exists, its actual original installation/
creation custody must establish it; a name/OID observation alone is insufficient.

Explicitly set the flags above and grant the exact maintenance→controller and
maintenance→businessOwner edges with INHERIT FALSE, SET TRUE, ADMIN FALSE.
Observe actual native OIDs/names/flags/memberships/full closure, then issue final
OriginalStoreCreationAuthority. No future OID is part of a pre-creation approval.
Native controller and businessOwner are distinct NOLOGIN identities. Changing a
preexisting isolated installation's authority flags requires explicit preparation
approval; this profile does not silently mutate arbitrary existing services.

##### Owned filesystem, initialization and process origin

The actual non-root host owner creates unpredictable dedicated directories with
mode0700. Native data directory and supervisor control/journal/credential directory
are separate; control custody is outside data-directory backup/restore scope.
Native system/binary paths are canonical and source-pinned. Refuse symlink/owner/
mode/parent substitution or a preexisting target not proven in original custody.
Files containing secrets/config/journal/private logs use0600 and exclusive safe
creation. Maintain external original supervisor/cluster/incarnation UUIDs and
durable creation intent BEFORE native initialization.

Spawn the pinned initdb executable directly, never a shell, as the actual host
owner, with explicit argv equivalent to:

```text
initdb -D <owned-datadir> -U <maintenance-name>
 --encoding=UTF8 --locale=C --auth-local=reject --auth-host=scram-sha-256
 --pwfile=<private-exclusive-0600-password-file>
```

Generate a fresh strong maintenance credential in the trusted private issuer;
never put it in argv/logs/portable JSON. Do not use trust auth, --no-sync or
group-readable initialization. Retain the credential privately for verified
maintenance sessions/restarts, remove the transient initdb password file after
known success, and record actual initdb terminal status, executable hash and
new data-directory/native control identity. Unknown initialization outcome is
observed at the original reserved target; no same-name retry/adoption.
PostgreSQL documents initialization ownership/authentication/password controls in
[initdb](https://www.postgresql.org/docs/18/app-initdb.html).

Before ANY postmaster launch, atomically replace/fsync the external supervisor
HBA file with maintenance-only rules below, fsync its parent directory and bind
its exact bytes in the launch intent. Start the pinned postgres executable as an
owned subprocess in its own process group, with no ambient PG configuration or
credential environment, stdin closed and output to private files. Explicit
command-line settings select external owned config_file/hba_file/ident_file;
the external config has no includes. Its critical fixed settings are:

```text
listen_addresses = '127.0.0.1'
port = <original supervised port>
unix_socket_directories = ''
password_encryption = 'scram-sha-256'
ssl = off
max_prepared_transactions = 0
shared_preload_libraries = ''
session_preload_libraries = ''
local_preload_libraries = ''
TimeZone = 'UTC'
DateStyle = 'ISO, YMD'
authentication_timeout = '10s'
log_statement = 'none'
log_min_error_statement = 'panic'
log_error_verbosity = 'terse'
```

Pin all remaining effective postmaster/config settings in the actual launch
receipt; unknown inherited settings/config paths refuse. There is no Unix or IPv6
listener in this first profile. The loopback SCRAM qualification is local only,
not managed TLS acceptance. Verify actual listener/socket inventory and native
effective settings, not just intended text. A bound-port probe is advisory; if
startup collides with another service, fail/clean up only the actual owned child,
never adopt or terminate the other service.

Record the real Popen child handle, PID/process group, host kernel start identity,
UID, executable identity, exact argv/config hashes, data-directory device/inode
and parent identity in original durable launch custody. Observe that same child
alive and authenticate a private maintenance session with the newly initialized
credential. Verify actual server version, native data_directory/config/hba/ident
paths and settings, cluster system identifier/database OID and postmaster start
against the original controlled target/child. Socket response, pg_isready,
postmaster.pid, a process name or SQL-generated UUID alone is not origin proof.

##### Maintenance-only HBA and actual ordinary admission

The external maintenance-only HBA is exactly the following typed renderer (safe
quoted names only), with no includes/map/certificate/trust alternatives:

```text
host all "<maintenance>" 127.0.0.1/32 scram-sha-256
local all all reject
host all all 0.0.0.0/0 reject
host all all ::0/0 reject
```

On initial launch/clean restart/restore observation this file is installed
BEFORE postgres starts, so restored native LOGIN flags cannot open ordinary
access. Database-native maintenance authentication must still be verified;
wrong/restored maintenance identity/credential keeps ordinary access closed.

After exact provider publication AND external confirmation, the controller may
insert only ordered explicit lines for the actual admitted active epoch logins:

```text
host "<application-database>" "<exact-active-login>" 127.0.0.1/32 scram-sha-256
```

Place these after maintenance and before rejects. No `all`, group-role, regex,
same-prefix or old-epoch ordinary allow rule. Supervisor accepts this action only
through the original provider/custodian-bound GenerationAdmission authority and
verified current source/head/epoch/native role inventory, never caller text.
Ordinary passwords/factories are released privately after original confirmation
and actual fresh SCRAM admission probe verifies exact authenticated/effective
identity, expected reference and source binding. Credentials never enter a
portable receipt or public log. New authenticated login must SET ROLE to its exact
stable subject; native ordinary privilege closure remains mandatory.

HBA changes require reload on this platform; file rules are not proof of the
currently loaded rules or of drained sessions.
[HBA documentation](https://www.postgresql.org/docs/18/auth-pg-hba-conf.html)
Therefore atomic file replacement/fsync, pg_reload_conf/SIGHUP acceptance and
pg_hba_file_rules parsing are NOT by themselves fence/admission completion.
Running migration fencing still uses committed NOLOGIN/old-wrapper membership
retirement and the real PostgreSQL18.6 starting-backend/session barrier. Pending
SCRAM handshakes can outlive an HBA change. Do not optimize away the original
candidate set, all-DB old-session checks or positive termination.

At the beginning of fencing, durably request maintenance-only HBA again, while
native role retirement/barrier establishes actual ordinary exclusion. An old
loaded HBA rule cannot authorize a permanently NOLOGIN old principal. At final
publication, enabling only successor allow rules cannot expose a stale database
before publication; native LOGIN/admission and external confirmation remain gated.
Probe actual new SCRAM admission before returning a ready factory. A failed/late
reload delays availability, never waives a native fence or restores old roles.

##### Real restart, process recovery and restore observation

Hold the exclusive supervisor/custodian writer lease and settle/observe original
pending operations before a controlled restart. Write/fsync maintenance-only HBA
and original restart intent first. Reverify the exact original postmaster token
and use its actual owned handle/PID, not a free-form pg_ctl path/pidfile. Request
bounded fast shutdown with SIGINT; PostgreSQL documents that mode in
[server shutdown](https://www.postgresql.org/docs/18/server-shutdown.html).
Observe actual child terminal status, original process-group/descendant absence
and no owned listener before relaunch/copy. Signal acceptance/timeouts are not
positive absence. Never signal an unverified reused PID/group or another service.

For same unchanged original data directory, record original positive stop and
next launch in the nonrewinding external chain. Launch with maintenance-only HBA
and external config overrides again. Privately authenticate/reobserve native
origin, exact control-store/role/phase/head state and original pending reservations.
Reconcile unknown native COMMIT before any replay. Old retired roles remain
NOLOGIN/sessionless/membership-inert; no metadata/epoch rewind. Only after actual
continuity and current native/source/head/epoch confirmation may the controller
reopen the SAME already-active epoch or explicitly issue the approved successor.
An unchanged current generation is not silently upgraded to another one.

If the supervising process itself restarts while postgres survives, reattach
ONLY through original external launch custody plus actual fresh kernel process
start/UID/executable/group/argv/native-target observations and exclusive original
journal ownership. On macOS use a small source-pinned native host helper built
against the actual pinned SDK's libproc headers to obtain proc_pidinfo's process
start fields/UID/PGID and proc_pidpath; check returned size/status, no guessed
ctypes layout. Bind OS build/SDK/header/helper hashes and actual boot identity in
qualification. Apple's source defines the native process-info structure:
[proc_info.h](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/proc_info.h).
Linux needs its separately qualified /proc boot-id/start-tick/executable observer;
do not claim it from Mac evidence. Keep the original actual child-birth receipt,
not just fresh observable facts. If process origin cannot be established, no
native effects/re-admission occur and no unrelated PID is terminated.

A database directory restore/copy is NOT a same-target restart. The controller
must positively stop/isolate the old owned process first and keep ordinary HBA
closed before any restored process can start. Give a copied/changed target a
new observed host incarnation and preserve the original external journal.
Observe it only through private maintenance and reject copied/rewound native
provider/epoch/source records as continuity proof. Do not reset/recreate the
external journal to fit the copy or automatically adopt its roles/markers.
First profile qualifies this negative restore/clone detection plus positive
same-target restart and original-outcome recovery. General forward recovery or
re-enrollment of restored old generations needs a separately approved concrete
new-incarnation recovery operation; it is explicitly not inferred here.

##### Required actual evidence and lifecycle

Implement the real initdb/owned-postmaster/native observer/private authentication/
HBA gate and durable issuer path, not a source object that always refuses. Native
acceptance creates an actual dedicated cluster, records bootstrap role/store
creation before final approval, and migrates real populated rows with actual
old/new SCRAM clients, stable effective principal/outcome identity and prepared
queries/cursors. Test paused authentication, reload races, all listeners, wrong
target/config/actor, extra membership, controller denial to ordinary users,
fencing/cutover/publication/unknown-COMMIT and positive restart reconciliation.

Inject supervisor/worker crashes and lost journal/native acknowledgements;
reobserve original custody, reject copied database/control files, wrong executable,
PID reuse and stale/replayed admission. Raw source simulations are not native
evidence. Bound every process/setup/fence/probe/stop stage and prove owned cleanup.
Delete only the explicitly owned isolated target after original outcome/evidence
settlement; preserve required private custody/evidence under its retention policy.
Do not stop or alter shared services. Managed/native privilege variants, general
restored-target recovery and other OS profiles remain explicit residuals until
their own implementation/acceptance passes.


#### G11 selected concrete signed owner authority and exact signing scopes

This unpublished amendment selects the real programmatic signed approval path,
all six closed scope intents, original durable consumption and immutable
production/acceptance purpose separation. It supersedes evidence-only store
signing and physical-custody-before-principal-preparation ordering in earlier
private elaborations exactly where the later scope section specifies. Portable
migration wire remains unchanged. Actual rejected UID-based autoapproval is
retained as rejected/unapplied evidence; it is never an alternative permission
path. No mandatory TTY or new human prompt is required by this contract.
Implementation and actual native/crypto/authority qualification remain mandatory.

##### Actual programmatic authority implementation

Implement `ConfiguredEd25519OwnerAuthority` as a concrete host-only verifier,
not an always-refusing Protocol and not an arbitrary callback. Trusted embedding
bootstrap supplies an immutable owner-authority configuration from its ORIGINAL
operator-managed deployment trust boundary, separate from plans/native attestors.
Pin its authorityId, policyRevision, canonical configuration digest, allowed
signer public keys/principals/scopes and target bounds in original supervisor/
custodian bootstrap custody. The native adapter cannot create/replace this
configuration or enroll a key from a submitted approval. File ownership checks
protect configured material but do not establish approval by themselves.

A configured signer can be an authenticated application/automation service acting
under the host's owner policy. The operator/service signs after its actual
authorization decision. No mandatory TTY, interactive terminal or per-operation
human prompt is part of the library contract. A caller-supplied affirmative hash
does not replace the signature or original trust enrollment.

The concrete verifier loads only its bootstrap-enrolled Ed25519 public keys,
checks the closed signed payload below, and performs actual Ed25519 verification
with a qualified standard implementation (for example cryptography's
Ed25519PublicKey.from_public_bytes(...).verify(...)). Do not implement custom
cryptography or treat a structural signer object as proof. Pin the actual crypto
implementation/wheel and wrapper artifacts in host qualification before production
admission. The external application signing service/private key stays outside
UMF's portable model and native attestor; no secret or credential is requested
in chat or accepted in a plan. Public keys are pinned original configuration,
never a trust-on-first-use field copied from the submitted envelope.

The configured authority exposes these exact logical operations:

```text
prepare_request(scope, exact_intent_bytes) -> OwnerApprovalRequest
export_signing_request(original_request) -> {payload,intent}
verify_approval(original_request, signed_envelope) -> VerifiedOwnerApproval
observe_approval(original_request) -> OriginalApprovalOutcome
```

OwnerApprovalRequest and VerifiedOwnerApproval are immutable opaque private
issuer-registry objects, not public dictionaries or serializable seals. Preparing
a request records no approval and confers no native effect authority. It fixes
one original approvalId/intent/scope/target/policy under the custodian writer
lease. Verify requires the actual original request registry entry, not an
equivalent-looking request constructed by the caller. The durable signed
envelope may be transported as data; successful verification yields the private
capability. Reissuing a volatile verified capability after restart requires
original durable signature/request/consumption lookup and current qualified
bootstrap. Do not invent a new approval ID after an uncertain outcome.

Export returns owned copies of the exact canonical payload and complete typed
intent for the separately authenticated signing service to inspect and sign.
It exports NO authority or private signing key. The original immutable bytes stay
in the issuer registry; mutating exported copies cannot change the bound request.
This is the concrete out-of-process programmatic signing route, not a missing
opaque-handle accessor. The verifier recomputes intentDigest and signed bytes
from its ORIGINAL request, never from substituted exported copies.

##### Closed signed envelope and trust configuration

Envelope is exactly `{payload,signature}`. Signature is canonical unpadded
base64url of exactly64 Ed25519 signature bytes. Payload is exactly:

```text
{profile:"umf.authenticated-host-owner-approval/0.1",
 authorityId,policyRevision,keyId,principalId,approvalId,scope,
 custodianId,supervisorId,providerId,installationId,intentDigest}
```

authorityId/approvalId/custodianId/supervisorId/providerId are canonical UUIDs.
policyRevision/keyId/principalId/installationId are nonempty NUL-free valid UTF8,
at most128 bytes each. IntentDigest is lowercase64hex SHA256 over the EXACT
original cycle-free typed intent, not repr/reserialized unknown values.
Canonical payload is RFC8785 UTF8 at most16384 bytes; reject duplicate keys,
unknown members, floats/booleans for IDs and noncanonical encodings. The signed
message is the ASCII domain prefix `umf.host-owner-approval/0.1` followed by a
single zero byte and canonical payload bytes. Signature/key decoding is strict.

Scope is exactly one of `local-target-creation`, `local-target-registration`,
`native-principal-preparation`, `native-store-creation`, `disabled-epoch-provision`
or `generation-ingress-transition`. The authority checks the selected original
intent schema for that scope and actual target; scope is not a free-form action.
Existing UMF migration plan approval remains separate and is still required;
an owner/store approval does not authorize arbitrary data/DDL or another plan.

The immutable trusted configuration is exactly
`{profile:"umf.configured-owner-authority/0.1",authorityId,policyRevision,keys}`.
Keys is1..32 unique records, each exactly
`{keyId,publicKey,principalId,scopes,supervisorIds,providerIds,installationIds}`.
PublicKey is canonical unpadded base64url of exactly32 Ed25519 public-key bytes;
scopes is a unique selected-scope array in the above order; each target bound is
a nonempty unique explicit array of at most256 exact IDs, without wildcards.
Pin actual future supervisor/provider/installation UUIDs in the original host
creation intent before native creation. PrincipalId must match the selected
enrolled key, not a caller-invented claimed approver. Empty/unknown key sets or
unconfigured production authority refuse BEFORE native effects. Signer/config
rotation is a separately authenticated original host policy revision; no silent
key replacement or accepting an embedded envelope key.

The actual configured verifier checks authority/policy/key/principal/scope and
all target bounds before signature success can issue a capability. It reserves
the original approval consumption durably BEFORE the approved native effect.
Repeated identical original approval resolves its original outcome, not a second
effect; the same approvalId on another intent/scope/target refuses. Unknown
COMMIT/journal writes reconcile original custody. Read-only original-outcome
settlement must remain possible even if new approvals are disabled by policy
rotation; rotation never authorizes reexecution of old effects.

No approvalDigest hashes itself. The native original-store intent is the exact
verified evidence payload below without its eventual approval/envelope digest.
After verification, the original authority receipt binds that intent digest,
canonical signed-envelope digest and independently authenticated issuer/policy.
Previous scope-specific creation approval digests refer to these actual original
envelopes/receipts, not fabricated caller hashes.

##### Actual native original-store evidence and registry

Implement private `NativeOriginalStoreAuthorityEvidence`, issued ONLY by the
bootstrap-enrolled concrete native supervisor/attestor after actual native
observations. It is keyed by handle OBJECT identity in that attestor's private
registry; no public JSON constructor, borrowed shared construction seal, repr,
digest lookup or caller-passed resolver. The immutable registry entry contains
the actual supervisor object, actual custodian object and opaque TargetCustody
issued/verified by THAT custodian, original birth/registration/role-preparation
receipts and the full verified native session-authority observation.

The implementation's existing name `VerifiedNativeStorePreparation` may denote
this SAME private evidence type; do not duplicate authority lanes to satisfy a
class name. Its profile, original issuer/registry/binding and actual observations,
not its spelling, govern issuance. A concrete method named
`prepare_original_store_authority(final_approval)` must resolve this already
prepared original evidence, verify the final signed approval through the enrolled
configured authority, reobserve native identity and issue the resulting capability;
it cannot skip any of those steps because final_approval is a truthy object.

Its closed private intent payload is exactly:

```text
{profile:"umf.pg18.original-store-authority-evidence/0.1",
 supervisorId,custodianId,providerId,installationId,ownerAuthorityId,
 ownerPolicyRevision,registrationDigest,targetCustodyDigest,
 authorityPreparationReceiptDigest,maintenance,controller,businessOwner,
 requiredMemberships,requiredSettings,nativeAuthorityObservationDigest}
```

Principal/settings/membership forms are the adopted actor-authority contract;
native roles/OIDs/flags must ALREADY exist and match the selected concrete local
profile. Registry custody retains the complete native observation, not only its
digest. Bootstrap/native preparation approval and original role creation receipt
remain separate from the eventual final store-creation approval. Actual
authenticated SESSION_USER is original maintenance; CURRENT_USER/role setting
must be original controller when observing/preparing store creation, and the
business owner in outer phase context. Reobserve actual target, kernel/process/
native source identity, settings and full original approved privilege closure.
The attestor is not allowed to label an arbitrary supplied observation verified.

The actual supervisor/attestor exposes private
`prepare_original_store_evidence(target_custody) -> NativeOriginalStoreAuthorityEvidence`.
The custodian/store factory is constructed with its separately bootstrap-enrolled
attestor resolver and the concrete ConfiguredEd25519OwnerAuthority. Fixed private
resolution verifies exact issuer/registry object, actual supervisor/custodian
identity, original receipts, live native observation and enrolled owner policy.
It prepares the `native-store-creation` request over those exact intent bytes.
Only after verifying the separately signed final approval may it call
`issue_original_store_authority(evidence, verified_approval)`.

That issuance rechecks original native evidence binding and target/context, and
returns opaque OriginalStoreCreationAuthority from the independently enrolled
issuer registry, with actual evidence digest and signed-approval digest. Caller
records, shared seals, self-generated non-root/UID approval or a fake attestor
cannot issue it. Store factory accepts only that original private capability,
resolves it through its original enrolled resolver, and then performs the fixed
external intent→native creation→receipt→confirmation protocol. It must not accept
a payload and a new matching purported issuer/resolver supplied together.

No single native bootstrap observation automatically approves store creation.
The signing authority's original configuration and authenticated signed decision
are independent inputs; the native attestor does not possess the production
approval private key by default. Trusted embedding service may intentionally
automate scoped approvals under its configured owner policy, but that explicit
authority is not inferred from the supervisor's UID or ability to run initdb.

##### Native-acceptance fixtures and required evidence

Provide a separate explicit `NativeAcceptanceOwnerAuthority` fixture for actual
isolated native campaigns. It uses a fresh test-only signer/key and the SAME
closed request/signature/consumption verification semantics, scoped to the
test harness's original newly created supervisor/provider/installation IDs.
The test harness and approval signer are distinct from the native attestor.
Fixture approval is labelled native-acceptance-only in private qualification
records. It cannot enroll/adopt an existing shared/production target or issue a
ConfiguredEd25519OwnerAuthority/production capability, and production factories
never fall back to it when configuration is absent. The harness's explicit test
authorization permits its isolated actual fixture; it is not evidence of an
external production customer's authenticated approval. No UID shortcut or
interactive TTY requirement is introduced for that harness.

Source tests verify real valid/invalid signatures under configured test keys,
wrong key/principal/scope/target/policy, embedded-key substitution, tampering,
unknown fields/bounds/noncanonical encoding, original replay versus duplicate
effects and uncertain consumption. Production-unconfigured path must refuse;
separately configured real verifier must actually succeed for a correct signed
request, not always refuse.

Native tests combine actual supervised SCRAM origin/OIDs/flags/SET-role/settings
observations with separately signed final approval, original durable consumption
and actual private store creation/hook. Swap evidence/issuer/custodian/target or
mutate native authority between observation and issuance; prove refusal before
effects. Test unknown native/journal COMMIT and exact original outcome lookup.
Retain the actual earlier auto-review rejection and prove that rejected UID-based
change was not applied. Native fixture success qualifies the declared native
mechanism subset; production deployment/key enrollment remains the host's real
configured authentication responsibility, not a fabricated passed test.


##### Common validation and immutable purpose

Every scope validates its EXACT shape below before preparing a request. No
arbitrary intent JSON, unknown members, caller resolver, self-signed enrollment
or dropping of an inconvenient field. Canonical RFC8785 UTF8 intent is at
most65536 bytes. Existing UUID/hex/native OID/path/identifier/role/settings forms
and bounds apply recursively. Names in this first local profile match
`[a-z][a-z0-9_]{0,62}`. ownerUid is an observed uint32, NEVER approval authority.
Paths are canonical absolute1..4096 UTF8 bytes; digests lowercase64hex; port
integer1..65535, no booleans/coercion. No secrets or business row values.

Add mandatory `purpose` to the unpublished signed owner payload AND immutable
owner authority configuration. It is exactly `production|native-acceptance`.
The native supervisor/custodian/bootstrap/evidence/approval issuer registries
also bind that immutable purpose privately. Public portable migration wire and
the public TargetCustody reference keep their existing shapes; a caller cannot
select purpose through a plan, request dictionary or an allow_fixture flag.

Configured production factory accepts only originally enrolled production
configuration and production-issued opaque approvals/evidence/target context.
The explicit acceptance harness creates a fresh isolated target and separately
scoped test signing policy; its original signed creation intent, journal and
all private capabilities remain native-acceptance. It cannot adopt an existing
target or convert that context to production. Both factories call the SAME fixed
native store/provider/supervisor implementation with an enrolled immutable
AuthorityContext; the common resolver requires exact issuer, target AND purpose.
No duplicate native effect implementation and no production fallback to fixtures.
Real signatures/actual native observations are required in either context.

The payload's authority/custodian/supervisor/provider/installation/purpose must
match the ORIGINAL configured authority context and all intent fields where
present. IDs absent from an early native intent are bound by that immutable
context and signed payload, never inferred from OS UID. ApprovalId is allocated
by durable prepare_request, not inserted into an intent to be hashed recursively.

##### 1. local-target-creation

Intent is EXACTLY the selected actual native draft form:

```text
{profile:"umf.local-postgresql-create-request/0.1",
 supervisorId,clusterId,incarnationId,installationId,ownerUid,databaseName,
 businessOwner,maintenanceName,controllerName,controlDirectory,dataDirectory,
 postgresPath,postgresSha256,initdbPath,initdbSha256,port,configDigest,hbaDigest}
```

All names/paths/UUIDs/hashes are reserved original host values. Control and data
directories must be distinct, with control outside data backup/restore scope.
Native source/binary/profile/config/HBA constraints are governing007. Approval is
verified and durably consumed BEFORE initdb/postmaster/native creation. Private
reversible request/secret-file preparation grants no native authority. The signer
does not receive a password. Effect key is `[scope,supervisorId,clusterId]`.

##### 2. native-principal-preparation

Intent is exactly:

```text
{profile:"umf.local-postgresql-principal-preparation/0.1",
 preparationId,supervisorId,custodianId,providerId,installationId,
 creationRequestDigest,creationApprovalDigest,bootstrapOriginDigest,
 bootstrapDatabase,maintenanceBefore,maintenanceAfter,controller,businessOwner,
 applicationDatabase,memberships,maximumRoles}
```

PreparationId is a UUID reserved once in original external bootstrap intent.
BootstrapDatabase is actual `{oid,name,systemIdentifier}`, name exactly postgres,
from the supervised newly initialized native cluster. maintenanceBefore is the
actual observed `{oid,name,flags}`; flags are the seven adopted native role flags.
MaintenanceAfter is `{name,operation:"alter-bootstrap",flags}`; controller and
businessOwner are each `{name,operation:"create-absent",flags}`. Desired flags are
EXACT governing007 profile flags, not a caller-selected privilege variant.
ApplicationDatabase is exactly
`{name,ownerName,encoding:"UTF8",locale:"C",operation:"create-absent"}`.
Memberships is exactly two ordered name-bound entries
`{memberName,roleName,inherit:false,set:true,admin:false}`, maintenance→controller
then maintenance→businessOwner. MaximumRoles is exactly3 (one existing principal
alteration and two new roles), plus exactly one new application database.
Controller/businessOwner/application database must be absent before this original
operation. No future OIDs or TargetCustody are claimed in this signing intent.

BootstrapOriginDigest binds the actual original supervised launch/private SCRAM
observation, native system ID and existing maintenance principal, held by the
actual issuer BEFORE preparation. It is not the final creationReceiptDigest,
which does not exist until this preparation completes. Final owner registration
cannot precede this step: it requires the actual application database identity.

Consume the signed original preparation approval BEFORE any role/database DDL.
Role alterations/creates and memberships execute in one native transaction with
original creation evidence. For unambiguous documented membership syntax, use
three fixed GRANT statements per exact edge, one WITH ADMIN FALSE, one WITH
INHERIT FALSE and one WITH SET TRUE; verify the resulting exact edge. Database
creation is a separate bounded bootstrap stage, not that same transaction:
[PostgreSQL CREATE DATABASE](https://www.postgresql.org/docs/18/sql-createdatabase.html).
Keep original stage intents/known outcomes; unknown COMMIT observes that original
controlled fresh realm/pre-absence/role creation receipt before any retry. Never
adopt a shared preexisting role/database or reexecute confirmed roles when only
database confirmation remains. These are explicit bootstrap staged effects.
Effect key is `[scope,supervisorId,preparationId]`.

##### 3. local-target-registration

Allocate registrationId BEFORE preparing this signing request. Intent is exactly
`{profile:"umf.owner-target-registration-intent/0.1",registration}`.
Registration is the adopted owner payload with EXACTLY ownerApproval omitted:

```text
{profile:"umf.local-owner-target-registration/0.1",
 registrationId,custodianId,providerId,installationId,origin,endpointControl}
```

All origin/endpoint fields retain their full adopted forms and original actual
observations, not a hand-picked digest-only projection. No other omission or
placeholder approval is permitted. Origin.creationReceiptDigest binds the final
private original supervisor creation receipt, exactly
`{profile:"umf.local-supervisor-creation-receipt/0.1",supervisorId,clusterId,
incarnationId,creationRequestDigest,creationApprovalDigest,initdbReceiptDigest,
initialLaunchReceiptDigest,principalPreparationRequestDigest,
principalPreparationApprovalDigest,principalPreparationReceiptDigest,
applicationDatabase}`. ApplicationDatabase is actual oid/name/systemIdentifier.
The receipt retains verified role/DB preparation observations privately and
links them to original native birth/authority; hashes alone are not origin proof.

After signature verification construct ownerApproval EXACTLY as
`{authorityId:payload.authorityId,approvalId:payload.approvalId,
approvalDigest:SHA256(JCS(signedEnvelope)),
scope:"enroll-owned-local-postgresql-target"}`. This is the single fixed mapping
from signed scope local-target-registration to the existing legacy owner payload
scope. Verify every projected value and original intent against the final owner
payload; no silent alias/coercion, no signature on its own approvalDigest, no
newly generated approvalId after signing. The original signed purpose remains
in the private issuer/custodian context. Effect key is
`[scope,custodianId,registrationId]`.

##### 4. native-store-creation

Intent is exactly `{profile:"umf.owner-store-create-intent/0.1",store,evidence}`.
Store is exactly `{profile,storeId,schemaName}`. StoreId equals providerId in this
first provider. Known store profiles and derived names are exactly:

- `umf.pg-generation-ingress-store/0.1`: `umf_ingress_<providerUUID32hex>`.
- `umf.native-row-originals-store/0.1`: `umf_originals_<providerUUID32hex>`.

This is not an arbitrary schema/type/profile selector. Evidence is the complete
adopted `umf.pg18.original-store-authority-evidence/0.1` payload, with actual
prepared native role OIDs/flags/settings/full closure and original setup receipts.
It contains NO final creationApprovalDigest or final envelope projection.
The actual enrolled NativeOriginalStoreAuthorityEvidence (or existing identical
VerifiedNativeStorePreparation) issuer/registry supplies it; signer data cannot
mint that native evidence. Final verified approval binds this exact store AND
evidence, then the actual private issuer reobserves and issues original store
authority. No future schema/table OID is signed before actual creation.
Effect key is `[scope,providerId,store.profile,storeId]`.

##### 5. disabled-epoch-provision

Intent is exactly `{profile:"umf.owner-epoch-provision-intent/0.1",request}`.
Request is exactly the adopted closed request:

```text
{profile:"umf.ingress-epoch-provision/0.1",providerId,enrollmentId,
 installationId,targetCustody,planDigest,fileDigest,expectedHead,
 previousSourceDigest,nextSourceDigest,nextBundleDigest,newEpoch,issuerProfile,
 principals,maximumRoles}
```

TargetCustody is its adopted exact public reference, privately verified against
the actual opaque capability. Principals are ordered exact
`{loginName,subject:{oid,name},audience}`; audience person|batch. MaximumRoles is
integer1..256 equal to actual declared count; subject OIDs/names are original
existing stable subjects, login names newly reserved absent identities. All
source/head/bundle/plan/issuer bindings and disabled-creation restrictions remain
governing005. No approval is embedded/excluded from this request. ExpectedHead
may be null only under an explicitly qualified native bootstrap profile; G11
existing-installation transitions require the original64hex head. IssuerProfile
is matched to the original enrolled native credential issuer, not arbitrary text.
The provider can export this cycle-free DATA before preparing its approved opaque
EpochProvisionRequest; separate signed approval then authorizes that issuance.
No future login OID or final transition approval. Effect key
`[scope,providerId,newEpoch]`.

##### 6. generation-ingress-transition

Intent is exactly `{profile:"umf.owner-ingress-transition-intent/0.1",request}`.
Request has exactly:

```text
{profile:"umf.table-generation-ingress/0.1",providerId,enrollmentId,
 installationId,targetIdentityDigest,planDigest,fileDigest,expectedHead,
 previousSourceDigest,nextSourceDigest,previousBundleDigest,nextBundleDigest,
 oldEpoch,newEpoch,oldPrincipalsDigest,newPrincipalsDigest,approvalDigest,
 targetCustody,executionPolicyDigest}
```

ApprovalDigest here is the ORIGINAL UMF PLAN approval, not this future owner/
ingress signature. KEEP it. No member is stripped. Native ingressApprovalDigest
lives in the separate transition/reservation record and is filled only after
signature verification; it cannot appear inside this request. Actual new login
OIDs already exist under confirmed disabled provisioning. Old/new epochs differ,
head/source/plan/file/opaque enrollment/target/policy and actual inventories must
match original native/custodian observations. Fields/digest/ID bounds are the
adopted request schema; unknown members refuse, not selectively ignored.
Effect key is `[scope,providerId,newEpoch]` (scope separates it from provisioning).

##### Durable ledger API and concurrency

The concrete signed-authority implementation uses an original host-owned ledger
before TargetCustody necessarily exists. Its logical custodian/supervisor IDs
are pre-reserved by trusted bootstrap; the later actual custodian binds that SAME
original authority/ledger history, not a new caller-supplied registry. Private
path/modes, exclusive actual flock, closed records, atomic replace/fsync/directory
durability and original uncertain-write observation are mandatory. No shared
untrusted seal or optional persistence.

The enrolled ledger exposes these private operations to the actual authority/
custodian instances, not an author API:

```text
reserve_request(context,scope,canonicalIntent) -> OriginalOwnerRequestRecord
consume_signature(originalRequest,canonicalEnvelope) -> OriginalApprovalReservation
bind_native_effect(reservation,verifiedNativeReservation) -> OriginalEffectBinding
record_native_outcome(binding,verifiedNativeOutcome) -> OriginalApprovalOutcome
observe_original_request(context,effectKey) -> OriginalApprovalOutcome
```

Reserve validates the scope intent, computes its effect key, then under one
exclusive writer lock looks up `[purpose,authorityId,custodianId,supervisorId,
providerId,installationId,effectKey]`. Identical intent/policy returns the original
approvalId/payload, INCLUDING after process restart. Same effect key with changed
intent/policy refuses; do not mint another ID. It durably records exact canonical
intent/payload/configuration enrollment digest before exporting signing data.
Both process and same-issuer concurrent prepares resolve the same original
request AND private resolvable handle; object registries cannot race issuance.

Consume verifies the actual Ed25519 signature against the original request and
enrolled key/principal/scope/target/purpose, then durably reserves that ORIGINAL
approval once before yielding VerifiedOwnerApproval. Identical replay resolves
the same original reservation/outcome; changed envelope/intent or duplicate
cross-target consumption refuses. The native consumer must bind its original
custodian native-effect reservation before dispatch; a cryptographic verify
alone is not a second effect permit. Actual issuer-verified native reservation/
outcome objects supply the last two operations, not caller dictionaries.

Every request record retains exact intent, payload, signed envelope when consumed,
their digests, original policy/key enrollment snapshot, original effect binding
and outcome. State is prepared|consumed|effect-pending|confirmed|aborted.
Prepared has no signature/effect; consumed has the verified signature/reservation;
effect-pending adds original native binding; confirmed/aborted add positively
observed native outcome. Aborted requires actual known no-committed-effect proof,
not an exception; partial bootstrap stages remain pending until original stage
reconciliation. Native retry after known abort remains bound to that original
operation and requires the actual phase/target proof, never another committed
effect or silently reset budget. Unknown native/journal COMMIT remains pending.
Observe is read-only and never retries effects.

Bound canonical complete ledger to8MiB,4096 original request records; configuration
to1MiB and its existing32-key/target-array bounds. Detect overflow before creating
or consuming another request; no truncation/deleting original replay evidence.
The custodian retains original sequence/state-digest/receipt custody outside
database restore scope. Restored/copied ledger/native metadata is not authority
to rewind history. Record framing/checkpoint implementation may use the existing
qualified custody journal, but every logical operation/state rule above must hold.

##### Policy rotation and originally rejected shortcuts

This first profile has no automatic in-process trust/key rotation. Changed
configuration/revision disables NEW approvals under the old context. A controlled
host deployment rotation requires its original independently authenticated
operator/bootstrap configuration enrollment and durable custodian revision
receipt; not a key embedded in an approval, same UID or a fresh self-generated
key. Hold the writer lease, settle existing pending/consumed effects (or explicitly
invalidate only unconsumed effect-free requests), then enroll the new revision.
Refuse rotation while an original effect is unsettled. Keep original public key/
configuration/signed-request history for read-only outcome verification; do not
delete historical approvals or reinterpret them under new keys. Pending-state
online key rotation requires a separate explicit qualified successor.

The separately scoped acceptance fixture uses the same signature, ledger and
native effect logic but immutable acceptance context/key enrollment. It cannot
issue production-purpose capability or satisfy a production factory. Native
acceptance credentials are not claimed to authenticate a real external customer.
Production-unconfigured must refuse; correctly configured signed production
verification must succeed in the actual concrete code. Preserve the rejected
UID-based attempt and verify that it never became an alternative authorization
path. No mandatory TTY or extra human prompt is introduced by this clarification.


#### G04 original instance reservations across deletion and value purge

This unpublished fixed-profile correction supersedes the earlier row_tables
shape and live-UUID-only guard exactly as specified here. The .1 profile labels
are retained only because no qualified/deployed native store exists; earlier
experimental footprints refuse. It preserves G04 strict revision matching and
provides the required identity invariant for separately selected G05 recovery.

##### Identity invariant and compatibility

Live-row UUID uniqueness alone is insufficient: a new row could collide with an
identifier retained for a deleted original. Every issued identifier is reserved
for the lifetime of its original tableToken and target incarnation, including
after ordinary deletion, archive purge and business Key reuse. Recovery joins
only this original instance identity. It never resurrects a deleted row.

This is a correction to the FIRST UNPUBLISHED fixed native profiles
`umf.native-row-originals-store/0.1` and `umf.native-row-identity/0.1`; their labels
remain unchanged because no qualified implementation or published native store
exists. Their selected exact shape now includes the ledger below. A store made
from an earlier experimental draft is incompatible and refuses: there is no
prefix adoption, guessed backfill of missing historical identifiers, or silent
upgrade. Any already deployed profile discovered during implementation requires
a separately versioned amendment before enabling this correction.

##### Exact native footprint

Add exactly one installation-owned heap in the original private originals
schema, owned by the enrolled originals-controller:

```sql
CREATE TABLE <originals>.issued_instances (
 table_token pg_catalog.uuid NOT NULL REFERENCES <originals>.row_tables(table_token) ON UPDATE RESTRICT ON DELETE RESTRICT,
 instance_id pg_catalog.uuid NOT NULL,
 PRIMARY KEY (table_token, instance_id)
) USING heap;
```

Add `issued_count pg_catalog.int8 NOT NULL CHECK (issued_count BETWEEN 0 AND
1000000)` to the fixed row_tables native shape. Add exactly
`maxIssuedInstances` to its immutable row-table record, an integer1..1000000
selected by trusted host policy before approved enrollment, default1000000.
It cannot be raised or reset by an ordinary migration. The original enrollment
request, approval and custody observations bind the selected limit and fixed
renderer version. The record digest covers the immutable limit; issued_count is
a separate mutable native scalar, not an unrefreshed JSON counter/checksum.
At every protected provider observation issued_count must equal the actual
ledger count for that tableToken and be <= maxIssuedInstances. Live metadata
IDs must be a subset of that ledger. Count mismatch or missing IDs refuses.

Register actual original relation/constraint/backing-index/column OIDs, exact
native definitions, owner/ACL and FK dependency in the original provider
inventory. This is an explicit extension of the known provider union; no extra
object or name-prefix waiver. Existing fixed store restrictions apply: no
private-table trigger/RLS/rule/partition/inheritance/unmanaged dependency, no
PUBLIC/business-owner/ordinary-client access. The guard function alone has its
fixed SECURITY DEFINER access through the controller owner. No business value,
Key, revision, timestamp, tombstoned value or per-value hash belongs in this
ledger. A UUID reservation is private metadata, still subject to custody.

##### Enrollment and guard algorithm

Within the original approved maintenance transaction, actual exclusive business
lock and native ingress fence, reserve the new tableToken and row_tables entry
with issued_count=0. Populate existing live metadata columns and unique/revision
constraints by the selected original renderer. Count the COMPLETE population
including rows hidden by FORCE RLS under the qualified maintenance protocol;
refuse if its count exceeds the selected maximum. Insert every actual UUID into
issued_instances without ON CONFLICT, then set issued_count to its exact count.
A collision or failure rolls back the complete enrollment. Install the fixed
guard, drop temporary defaults, validate the complete native inventory and
source/client privilege correspondence before any archive capture/publication.
There must be no writable gap between metadata assignment and guard activation.

The fixed guard validates actual TG_RELID and TG_TABLE_SCHEMA/TG_TABLE_NAME
against its original registered native business relation and fixed tableToken;
no caller arguments, setting or supplied metadata selects another target. It
preserves all existing UPDATE immutability/revision-overflow checks. For INSERT:

1. Atomically UPDATE the original row_tables row, incrementing issued_count by1
   only WHERE table_token matches, original business_table_oid matches TG_RELID
   and issued_count < the immutable bound. No row means a fixed sanitized error;
   never continue with an uncounted reservation.
2. Generate one pg_catalog.gen_random_uuid(), set NEW's actual metadata ID and
   revision1, then INSERT (original tableToken, generated UUID) into the ledger.
   Do not use ON CONFLICT, retry another UUID, or catch/ignore a uniqueness
   error. A collision with ANY earlier reserved UUID aborts the statement.
3. Return NEW. Its ledger reservation and counter update share the caller's
   actual business transaction. No autonomous connection or durable side effect.

This counter deliberately serializes issuing inserts for a given tableToken
through its native row lock. It is a bounded first-provider compatibility and
throughput cost, to be measured/disclosed in native acceptance, not hidden by a
non-atomic count query. Multi-table transactions may deadlock under normal
native locking; the native abort must roll back every reservation and business
effect. No automatic transaction replay is introduced here.

BEFORE INSERT can run even when ON CONFLICT later updates/skips a row. Any
reservation committed along that path remains reserved and counted, including
when it did not become a live row's ID. Therefore issued_count is the number of
committed reservations, NOT live rows, inserted rows or archived rows. UPDATE
of an existing row preserves its original ID and increments its revision under
the original fixed guard. COPY and each actually admitted MERGE/ON CONFLICT
path must prove this behavior with native execution. Unsupported paths refuse.
Aborted statement/transaction reservations roll back and need not survive as
issued instances; no committed archive can refer to such an aborted instance.

##### Bounds, accounting, retention and recovery

The existing cap4096 enrolled tables/provider remains. Each table has at most
1000000 ledger reservations, or its lower immutable policy bound. Capacity
exhaustion refuses the whole issuing statement. Normal deletes, TRUNCATE,
archive retirement/purge, failed restore and schema migrations do not clear or
reset these reservations. TRUNCATE and native identity metadata mutation remain
unavailable to ordinary principals. Retiring a source table does not authorize
reusing its tableToken or removing its private history.

Ledger native bytes/indices/WAL are NOT part of an archive's declared logical
retained-value bytes; no unchanged archive logicalBytes receipt may pretend to
bound them. Its separate finite reservation/table caps are explicit metadata
bounds, not a physical disk/WAL ceiling. Purging retained values may reclaim
only the selected value relation and its allowed archive state; it preserves
this ledger, row-table identity/counter and required custody/history. Even an
explicit value-retention override cannot authorize token reuse. Whole target
installation destruction/replacement is separate and creates a new incarnation.
Online ledger compaction, tableToken reset and cap raising are unqualified gaps.

Original enrollment/outcome lookup governs unknown COMMIT: the host observes
its original native transaction/row-table registration and actual inventory,
never repeats enrollment against a guessed name or recalculates a new tableToken.
Ordinary inserted rows and reservations commit/abort together. Unknown ordinary
client COMMIT uses that client's existing outcome semantics; this provider does
not promise retry-safe arbitrary INSERT or expose private IDs to add one.
Copied/restored provider metadata is not original custody. Counter/ledger rewind,
foreign tableToken, missing guard or mismatched native origin fails closed.

##### Independent native acceptance obligations

Force a collision with a previously deleted-and-archived instance using an
isolated qualified fixture/instrumentation, not a production author-selected RNG
or trigger bypass. Prove the actual fixed issuing path aborts, including ledger
and counter rollback, while a noncolliding reinsert with reused business Key is
a distinct instance. The public runtime has no deterministic UUID injection API.

Execute existing-row enrollment, RLS-hidden rows, concurrent INSERT, aborted
transaction, ON CONFLICT DO NOTHING/UPDATE, COPY and every claimed MERGE route;
prove committed unused reservations remain counted. Test exact capacity edge,
rollback after count increment, wrong TG_RELID/native identity, tamper/missing
ledger/counter/constraint/ACL and ordinary metadata read/write/bypass refusals.
Delete originals, purge their archive values, and demonstrate those identifiers
remain reserved. Lose enrollment COMMIT acknowledgement and settle the original
outcome without a second enrollment. Retain timings and resource behavior of
per-table issuance locking. Source tests, random UUID improbability, or a test
that replaces the production guard are not native identity proof.


#### G05 retained retirement, current-instance restore and separate purge

Select new options/plan0.8, execution0.7 and discovery0.5 for this closed
successor. Historical immediate irreversible DROP is unchanged. The following
first native profile composes the adopted exact G04 originals/issued-instance
ledger with G11 original custody and actual ingress fencing. It explicitly
preserves unrelated current application updates during a G05 restore, unlike
G04 strict post-conversion revision matching. All exact interfaces below are
proposed governing intent; actual immutable Weft/session owner agreement, host
clock/authority implementation and native/installed/browser evidence are still
enablement gates. No generic JSON/SQL substitute or subset completion claim.

##### Ownership and finite first scope

UMF owns full source intent, dependency/source correspondence, deterministic
portable plans, review and schema transition receipts. Weft owns checked typed
fill/conversion semantics and native expression lowering. The trusted host owns
actual authorization, original target custody, private originals, retention time,
current policy/holds, connections, fencing and transaction/outcome observation.
The database supplies actual typed storage, constraints, transactions and locks.
Browser planning cannot establish native completeness or purge eligibility.

First profile is PostgreSQL18.6/UTF8, original same-physical-database private
originals store, explicitly selected new fixed composition
`umf.native-row-originals-store/0.2`, bounded protected maintenance, exact G04 native scalar domains
and protected row identity with the issued-instance ledger. No copied table,
partition, generated/identity carrier, shadow lineage or external archive is
admitted by this first profile. Restoring the SAME original Field/native value domain
is first scope. Explicit nullability/default changes use their selected existing
contracts and complete validation; they are not inferred from archive values. Restore plus type conversion, table retirement and old-only Field
replacement are additional explicit compositions; unsupported cases refuse.

##### Closed portable intent and archive source closure

Options0.8 adds exactly `retirements`, `restorations`, `archiveSources`, each
required under that profile; empty arrays are explicit. Other existing options
retain their previously selected exact semantics. At most256 entries in each
effect array and no duplicate table/Field across either array or another selected
conversion/backfill/replacement. No unused selection. Every newly selected
retained DROP consumes one retirement; every archive-backed addition consumes
one restoration; other transitions do not acquire archive semantics by inference.

A retirement is exactly `{table,field,retention}`. Table is the existing stable
binding; field is complete `{module,element}` identifying the original Field in
the before source. It is removed from that table in the after source. Retention
is exactly `{policyId,policyRevision,minimumRetentionMs}`: nonempty policy IDs
<=128 UTF8 bytes, positive safe-integer revision, duration integer0..315360000000
(ten365-day years). No duration default. Host policy must authenticate and admit
this exact revision and duration before capture; author intent cannot grant
retention/purge authority. Zero still requires a separately approved purge.

A restoration is exactly `{table,field,archive,newInstances}`. Field is the SAME
complete original Field instance, absent from the current before table and
reintroduced in after with the same original logical/native value domain.
Complete original Field meaning remains source-bound; explicit after-source
nullability/default changes are separately validated through G01/G03 rather
than silently inferred. Other semantic/type changes refuse this first profile.
Archive is exactly `{profile:"umf.retired-field-archive-ref/0.1",providerId,
archiveId,tableToken,targetCustody,retirementPlanDigest,retirementSourceDigest,
fieldMeaningDigest}`. UUIDs are canonical lowercase; targetCustody uses the
exact adopted closed G11 TargetCustody shape, not a pathname/DSN or copied
assertion. Digests are lowercase64hex, recomputed from complete original source
and exact Field/domain meaning. This descriptor is portable identification, NOT
a native capability or proof the data still exists.

NewInstances has exactly one of:

- `{mode:"refuse"}`: any current live instance without an archive value refuses.
- `{mode:"null"}`: every such instance receives native NULL; after-source Field
  must be optional and the complete target constraints must permit it.
- `{mode:"fill",expression}`: one admitted G02 typed same-row expression against
  the CURRENT before source, compiled by the qualified scoped Weft capability
  below. No callback, SQL, historical instance values or implicit default input.

All surviving archived originals receive their exact native retained values,
including NULL, irrespective of the selected newInstances policy. A required
after Field with an original NULL refuses rather than silently filling it. If
there are no new instances the selected fill still type-checks; no artificial
error is caused by evaluating it against archived originals. Future defaults
are explicit source declarations handled by G03. They never populate the
restoration population implicitly. Unchanged/changed defaults, checks, Keys,
FKs, indexes, policies, grants, commands and clients must each be valid under
the after-source meaning; original historical objects are not blindly reinstalled.

ArchiveSources is an array of at most64 exact `{digest,source}` records, unique
by digest, each consumed by a restoration. Source uses the existing complete
JSON source input form, including unknown extensions; digest hashes its full
original bytes using existing source hashing, not a reconstructed projection.
Each retained source <=1MiB UTF8, aggregate <=4MiB, serialized complete option
wire <=6MiB; reject overflow/unused/missing or disagreeing sources. The complete
retirement before source must be present, not just a copied Field snippet. Its
native/source/plan custody correspondence is checked by the host against the
original private archive. No old row values or per-value hashes enter options,
source bundles, plans, exported diagnostics or receipts.

##### Dependency and phase plan

Discover retained retirement as a distinct candidate with explicit policy/window
selection, and restoration only with the exact source/identity descriptor.
Discovery is not native custody validation. New plan0.8 uses exact empty-SQL
`kind:"retirement"` steps for `capture-retired-values|retire-field|restore-field|
validate-restoration`. Each has common source-bound step members and exactly
`operation,phaseOperation,phaseTarget,retirementBinding`, transaction `required`.
Operation and phaseOperation are identical, phaseTarget is `{table,field}`.
RetirementBinding is exactly `{profile:"umf.field-retirement-step/0.1",action,
selectionIndex,intentDigest,fieldMeaningDigest}`; action is `retire|restore`,
index0..255 into the appropriate original options array. Digests recompute from
complete closed intent and complete source-derived Field/logical/native mapping.
No author SQL, seed replay or generic empty-SQL execution fallback.

Capture precedes retirement under the same protected phase; restore-field adds
its carrier, populates the exact population and validates before dependency
activation. Validation follows all selected current dependency changes. Step
source paths locate their exact options entry; fieldMeaningDigest for restoration
binds the original archived Field meaning and verified target meaning. Before
and after complete-catalog/source witnesses, original approval/step IDs and
G11 ingress retirement/publication rules remain mandatory. Recompile the full
DAG from original sources/options; refuse missing/duplicate/unconsumed/injected
steps and unknown dependency meaning. Never use CASCADE.

Retirement captures every protected instance/value into its private genuinely
old-typed values relation, checks complete identity set and count, then drops
the live application column and approved dependencies. Merely withholding a
generated accessor or using RLS does not retire direct column access. Capture,
manifest/lifecycle state, live DDL and phase completion share ONE actual native
connection/transaction. Actual source ingestion and catalog proof handle FORCE
RLS. Old readers, prepared statements, cursors, streams and writers must pass
the G11 actual fence/drain protocol. No current-generation publication until
all data/catalog/grant/client proofs succeed. Capture alone is not retirement.

##### Same-instance restore after unrelated application updates

Acquire the protected business lock/fence and original private archive lifecycle
row lock; revalidate native origin/ACL/domain and complete current source/history.
The target Field must have remained absent since the authenticated retirement:
prove the full authenticated consecutive published phase chain, not merely its
latest snapshot. Any intervening reintroduction/replacement/ambiguous history
refuses this first composition. Ordinary updates of other Fields, including Key
changes and no-op updates, are allowed: they did not write an absent target.
The issued-instance ledger makes the original UUID non-reusable, even after
value purge/deletion. Native identity/revision guard continuity is mandatory.

For live UUIDs with originals, require revision >= captured retirement revision,
not equality with G04's strict post-conversion baseline. Counter rollback,
missing continuity, forged ID, broken guard or unresolved administrative rewrite
refuses. Restore only the target's retained value and leave all current unrelated
columns/Keys unchanged. For live UUIDs without originals apply ONLY the selected
newInstances policy. Archived UUIDs absent from live rows stay absent. Never
join on mutable Keys, ctid, xmin, row order or a coincidentally reused name.

Add the temporary nullable live carrier without a future default, populate and
validate, install selected NOT NULL/default/dependencies and full after catalog
only after all rows pass. The identity guard increments revisions for actual
restoration updates; capture actual post-restore observations, never assume
unchanged revision. No partial row/schema activation. Every conflict rolls back
the entire phase and retains the archive; the durable ingress fence may remain.
Successful restore does not purge values. Mark its original archive restored
atomically; a later retirement creates a new archive identity. The restored
archive cannot be replayed to overwrite later target writes. Duplicate original
COMMIT recovery observes original outcomes instead of reapplying values.

##### Required Weft scoped-fill boundary

Existing all-target-row G02 lowering is INSUFFICIENT for newInstances fill:
evaluating against originals then overwriting them can spuriously fail or expose
wrong values. Do not rewrite returned UPDATE SQL or hand-lower the expression
in UMF. Agree/qualify an immutable Weft capability that compiles the existing
G02 expression for the exact provider-owned NEW INSTANCE population mask.

The host supplies original qualified table/ID/archive population authority;
this is not an author predicate or callback. Its fixed native scope is exactly
live instances whose protected UUID has no original in the selected archive.
The qualified compiler owns typed scalar generation, exact-value guards and
placement of that scope before expression evaluation. Prepared artifacts bind
original plan/source/target/domain and actual native archive/table identity;
matching echoed dictionaries are not compiler or custody authority. Public
wrapper/profile names and the closed request/reply must be agreed with the
actual Weft owner before enabling fill. Until that concrete port and actual
empty/new/original mixed-population tests pass, fill mode refuses; null/refuse
are distinct modes, not evidence that required-target fill is delivered.

##### Private archive lifecycle, serialization and tombstones

Retain G04 immutable archives/old native values and non-purgeable issued IDs.
Add a separately versioned fixed private `archive_lifecycle` heap, one row per
archive, with PK/FK archive_id RESTRICT, positive native revision, closed state,
immutable retirement plan/Field/target/policy/publication references and current
hold/policy/request/outcome references. Its exact columns, canonical record and
native inventory must be frozen before implementation; generic JSON state or
caller SQL is not an implementation-ready substitute. States are
`captured|retired|restore-pending|restored|purge-pending|purged|abandoned`.
A captured archive cannot age toward purge before authenticated retirement
publication. Publication and native outcomes are linked under original custody,
not claimed as distributed atomicity with an external host journal.

Every restore/purge/current-policy/hold mutation locks this same original row
FOR UPDATE and checks its original revision/custody. Restore reservations bind
one original request before effects; native data/DDL/outcome share one database
transaction. Native pending/unknown outcomes must be settled before conflicting
actions. No caller-supplied pending flag or process-local mutex establishes this.
A hold becomes effective when its authenticated native mutation commits; an
unacknowledged concurrent request is not falsely reported as installed. A purge
that obtains the lock after a committed hold must refuse.

Purging values keeps the archive identity/old relation OID as historical identity
plus a durable purge tombstone; the expected native inventory explicitly expects
that exact old value relation absent only in confirmed purged state. G04's old
complete-value relation invariant is not silently waived for arbitrary absence.
No automatic purging of source/custody/phase/identity history, issued IDs or
lifecycle row. Restored archives may be separately purged when eligible and no
pending effect/dependency needs them. Source-table retirement and destruction of
provider history remain unqualified separate compositions.

##### Retention lower bound and current holds

First time profile is an original enrolled host-custodian elapsed-time authority,
not client wall clock or database session GUC. It starts age only at authenticated
retirement publication observation; late observation conservatively extends
retention. Bind original publication outcome, observed informational wall instant,
time-source identity, actual kernel boot identity, precision/error qualification,
monotonic sample and external non-rewind custody sequence. Compute elapsed lower
bound using qualified monotonic ticks and subtract admitted uncertainty. Persist
only monotonic lower-bound progress durably under original custody.

Within one verified boot, count only proven nonnegative elapsed ticks. Across
OS reboot, unavailable clock/origin, uncertain jump or missing interval, credit
ZERO for the uncertain interval and re-anchor through the original authenticated
custodian, retaining prior proved elapsed lower bound. Clock rewind or restored
custody refuses; new deployment identity cannot reset/adopt old evidence.
Suspend/unknown downtime need not count. This conservative profile may retain
longer than calendar duration; it cannot delete earlier. Actual OS/runtime clock
and reboot/checkpoint behavior require qualification before enabling eligibility.
No actual monotonic source is presumed trustworthy merely from a function name.

Purge requires a fresh authenticated certificate bound to the original archive,
publication, policy revision, time-source/custody sequence and elapsed lower
bound >= selected minimum. The original host authority validates that certificate;
the final protected native decision rechecks current policy/holds/dependencies
and original state/revision. Earlier valid lower bound does not decrease as time
passes; a policy/hold revision mismatch refuses. A duration is a MINIMUM retention
window; eligibility does not itself invalidate retained recovery or schedule a
delete. Current policy may separately deny restore; mere eligibility is not
purged/expired data. Any maximum-age/guaranteed-deletion claim is a future profile.

##### Separate irreversible purge and precise override

Purge is a host-only operation, never migration-options JSON, a source Field
removal or schema-head reset. Its original signed intent binds exact target
custody/provider/archive/tableToken/Field/retirement incarnation, original value
relation OID, current policy/hold/lifecycle revision, eligibility certificate or
explicit override, effect bound ONE archive value relation and irreversible
acknowledgement. Signing uses an originally enrolled authenticated host data
custodian authority with explicit purge scope; schema migration approval and
G11 physical target creation signatures do not grant it. Exact signing/wire and
native renderer are readiness gates, not implied arbitrary signed JSON.

Ordinary mode requires actual lower-bound eligibility and no hold, pending
restore/unsettled retirement, or live retained-data dependency. An explicit
`minimum-window-override` may waive ONLY the minimum duration and records the
unmet window; it does not fabricate elapsed eligibility. It requires separately
enrolled override authority and exact reviewed reason/scope. It cannot bypass
holds, pending/unknown outcomes, missing native origin or live data dependency.
Hold release/restore abandonment is its own authenticated settled operation;
no purge flag silently disposes of either. Other override kinds refuse.

Under original row lock, verify actual relation/custody/ACL/dependencies and
current state, then DROP ONLY that original qualified values relation RESTRICT
and atomically record original purge outcome/tombstone and native revision in
the SAME database transaction. No CASCADE, wildcard/prefix deletion, copied
metadata adoption or unbounded effect. Unknown COMMIT observes that original
request/tombstone and actual relation inventory; it never retries deletion
against a new same-named relation. Known abort preserves values. Confirmed purge
makes restore unavailable. No claim of erasure from backups, WAL, logs, client
copies or external stores outside this exact inventory.

##### Qualification and remaining readiness work

The companion g05-native-lifecycle-runtime-003 freezes the lifecycle native
schema/closed records, signed purge/hold/time wire, proposed scoped Weft port
and execution0.7 receipt/policy. Actual Weft owner agreement/immutable artifacts,
original host clock qualification and implementation acceptance remain gates;
a proposed interface is not permission to substitute generic JSON or SQL. Adopt completed contracts
into CONTRACT-081, TD-085 and STP-085 and independently audit actual commits.

Native acceptance must cover populated/NULL/empty retirement; complete RLS
population; direct/generated archive denial and retired-column removal; exact
native dependency closure; old prepared readers/cursors/writers; unrelated and
no-op updates; Key changes/reuse, new/deleted rows; null/refuse and required
scoped fill, with an expression invalid on originals but valid on new rows;
original NULL refusal for required restore; native identity collision and
post-purge reservation; tamper/missing source/custody and intervening Field
reintroduction; full constraints/current defaults and client binding validation.
Use independent per-instance native-value oracles, not counts alone.

Inject cancellation, known abort and lost acknowledgement at capture, cutover,
publication, restore/purge reservation and COMMIT. Prove original outcome lookup,
no duplicate values/DDL and no archive replay over later writes. Test actual
clock rollback/reboot/unknown interval and no early purge; concurrent hold and
restore versus purge; explicit minimum-only override and non-bypassable hold/
unknown/dependency refusal. Qualify finite resource caps, private diagnostics,
source/browser parity, actual installed native consumers and public artifact
bytes separately. None of G04, immediate DROP, external custody or G06 online
success substitutes for these G05 effects. Keep every unimplemented family or
composition explicitly tracked in release notes.


##### Explicit originals-store composition

Select `umf.native-row-originals-store/0.2` for G05. It consists EXACTLY of the
adopted .1 row_tables/archives/issued_instances/guard footprint plus this fixed
archive_lifecycle relation and its declared constraints/index/dependencies.
The schema naming and original target/store custody discipline are unchanged;
profile .2 is separately signed in the exact native-store-creation store tuple.
G11's six scopes stay unchanged; .2 is an additional finite profile admitted by
that store intent only when G05's fixed renderer/observation is implemented.
No runtime .1 store gains permission for an extra lifecycle table. No implicit
in-place upgrade/adoption is admitted; first provider creates a new .2 store
under original ownership/approval. Reusing/migrating an existing qualified .1
archive store requires an explicit future store-upgrade contract, not attaching
new tables and weakening old inventory checks.

##### Exact lifecycle relation and canonical record

In the original private originals schema add exactly:

```sql
CREATE TABLE <originals>.archive_lifecycle (
 archive_id pg_catalog.uuid PRIMARY KEY REFERENCES <originals>.archives(archive_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 state pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (state IN ('captured','retired','restore-pending','restored','purge-pending','purged','abandoned')),
 revision pg_catalog.int8 NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
 policy_revision pg_catalog.int8 NOT NULL CHECK (policy_revision BETWEEN 1 AND 9007199254740991),
 hold_revision pg_catalog.int8 NOT NULL CHECK (hold_revision BETWEEN 1 AND 9007199254740991),
 active_request_id pg_catalog.uuid,
 record pg_catalog.jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(record) = 'object'),
 record_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK (record_digest ~ '^[a-f0-9]{64}$')
) USING heap;
```

Exactly the same private owner/ACL/no RLS/trigger/rule/partition/dependency and
native registration discipline as archives. Cap lifecycle rows4096/provider,
record1MiB RFC8785 UTF8. Native duplicated columns must equal canonical record
members on every protected observation. Record digest hashes the complete
canonical record; unknown/missing keys refuse. A row is exactly
`{profile:"umf.retired-field-lifecycle/0.1",providerId,archiveId,tableToken,
targetCustody,field,fieldMeaningDigest,retirementPlanDigest,
retirementSourceDigest,retirementOutcomeId,publication,policy,holds,state,
revision,activeRequest,lastOutcome}`.

Field and targetCustody are exact adopted source/G11 shapes. UUIDs lowercase
canonical, digests lowercase64hex. RetirementOutcomeId is the actual original
phase outcome UUID, not a caller-created success. Publication is null until
original authenticated retirement publication is observed; then exactly
`{outcomeId,bundleDigest,epochDigest,custodySequence,clockAnchorDigest}` from
that original published transition and enrolled time authority. A complete
G04 archives row may remain state complete after G05 purge as HISTORICAL
identity metadata; actual presence/absence of its old values relation is now
controlled by this exact lifecycle state, never by a generic exception.

Policy is exactly `{policyId,revision,minimumRetentionMs,restoreAllowed,
authorityConfigDigest,statementDigest}`. Revision is positive safe integer and
matches policy_revision; duration uses intent001 bounds and cannot be below
the original selected minimum except through a distinct approved purge-window
override. RestoreAllowed is a real boolean. StatementDigest binds the original
authenticated policy statement and authority context, not a submitted key.
Holds is exactly `{revision,ids}` with <=256 unique UUID hold IDs, sorted bytewise;
revision matches hold_revision and increments for each actual hold mutation.
Hold reasons/identities are private; no row values in any record. Initial hold
revision1 and empty IDs; authenticated preexisting holds must be installed before
retirement publication. Missing current policy/hold context refuses actions.

ActiveRequest is null or exactly `{requestId,kind,intentDigest,
reservationDigest}`, kind `restore|purge`. Active_request_id is null iff this is
null, otherwise its actual requestId. LastOutcome is null or exactly
`{requestId,kind,intentDigest,outcomeId,status}`, kind `retire|restore|purge|abandon`,
status `confirmed|aborted`. Every outcome is original native outcome custody,
not a caller-supplied phase index. Safe integer revision overflow refuses.

The original private effect registry retains ALL original request/outcome
history, not only lastOutcome. Reuse the enrolled durable original-custody
request ledger (bounded4096requests/8MiB) with a distinct G05 namespace and
original native reservation/outcome binding. Exhaustion refuses; never truncate
history to create room. Observe original older outcomes through that registry;
lastOutcome alone is insufficient for replay. No production in-memory-only seal.

##### State and native transaction protocol

Capture creates immutable archives and lifecycle captured, revision1, with no
publication/activeRequest. It shares the retirement phase's business DDL and
actual native completion. Actual retirement publication observation moves
captured->retired and sets publication/time anchor under original custody and
row lock; until then no age, restore or purge admission. A crash between native
phase COMMIT and publication observes the SAME original transition. Abandonment
requires settled unpublished retirement outcome and separately authenticated
cleanup authorization; it never invents rollback of committed business DDL.
First provider refuses automatic abandoned-value cleanup: it remains tracked
until an explicit qualified cleanup composition is added.

Reserve restore only from retired, reserve purge only from retired/restored.
A reservation sets activeRequest, state restore-pending/purge-pending and bumps
revision in its own original acknowledged native transaction. Before reservation
consume original signed/plan approval and bind it in original durable custody;
unknown reservation COMMIT observes the original request, never creates another.
Each business effect transaction locks that row, checks exact active request
and original native reservation, rechecks current authority/policy/holds and
inventory, then performs effects and records confirmed outcome atomically.
Restore success ->restored; purge success ->purged; clear activeRequest and
increment revision. No row/schema data effect is committed separately from its
native outcome. The external journal may be uncertain until native observation;
its uncertainty blocks new effects rather than pretending distributed atomicity.

Known aborted effect transaction does NOT mean reservation absent. It leaves
pending state until original authenticated abort settlement proves no effect
COMMIT and records aborted outcome, restores predecessor retired/restored and
clears activeRequest. Unknown COMMIT must first observe original native outcome.
No timeout or exception alone is abort proof. After restoring, a new replay of
the archive is forbidden; only duplicate original-request outcome observation
is allowed. Purged is terminal for values. All native state transitions check
current revision and original target/provider/record/ACL closure under FOR UPDATE.

Policy/hold mutations also lock the same row and increment native revision plus
their own revision. They may add a hold while a reservation is pending; the
subsequent effect must recheck it. Removal/policy change requires exact expected
revision and original enrolled data-custodian authorization. Already executing
purge owns the same lock: a later hold is not acknowledged until it commits and
must not be represented as predating that effect. Purged state cannot gain a
fictional protective hold or restore authorization.

The original native reservation descriptor is exactly
`{profile:"umf.retained-data-reservation/0.1",providerId,archiveId,targetCustody,
requestId,kind,intentDigest,priorState,priorRevision,reservedRevision,
policyRevision,holdRevision}`. Kind is restore|purge; priorState retired|restored,
with restored allowed only for purge. PriorRevision is the actual locked revision,
reservedRevision exactly priorRevision+1, all positive safe integers. Its digest
binds activeRequest.reservationDigest and original external effect registry.
The confirmed reservation record is retained in original custody, not supplied
as caller-created JSON capability. Abort settlement returns precisely priorState
from this original descriptor, never a guessed retired state. Current policy/
hold mutations may increase revision while pending; native effect dispatch must
revalidate their exact signed revisions and refuse a stale request. Original
abort settlement observes current row under lock and preserves newer policy/
holds, never overwrites them with reservation-time snapshots.

No new business retirement/restore/purge effect may start until an earlier native
outcome and its original external custody confirmation are settled. Authenticated
hold additions may still serialize and preserve lastOutcome; they cannot erase
it or fabricate an earlier effective time. This prevents a later effect from
overwriting the sole native lastOutcome before a lost acknowledgement can be
resolved. Once positively confirmed, full original outcome history remains in
the private bounded durable registry. No claim of cross-store atomicity.

##### Separate signed data authority

Use original configured Ed25519 authority, standard library dependency selected
by the project, immutable enrolled key/principal/scope/target/purpose context,
strict32-byte keys/64-byte base64url signatures, canonical JSON, private original
request registry and consume-once effect binding. G11's six-scope creation
interface does NOT become a generic signer. Implement a separate
ConfiguredRetainedDataAuthority admitting ONLY the closed scopes here. Its
native-acceptance fixture is purpose-isolated and uses the SAME effect code;
production never accepts fixture context or self-enrolled request keys.

Signing bytes are ASCII `umf.retained-data-approval/0.1` followed by NUL then
RFC8785 UTF8 of exactly `{profile:"umf.retained-data-approval/0.1",authorityId,
principalId,requestId,purpose,scope,targetCustody,intent}`. Envelope is exactly
`{payload,keyId,signature}`. Purpose is `production|native-acceptance` and must
match original immutable context. IDs <=128 UTF8 bytes; canonical request UUID;
whole envelope <=1MiB. Supplied keyId only selects an originally enrolled key.
No TTY/UID shortcut, embedded public key, arbitrary JSON scope or approvalDigest
cycle. Scope-specific intents are EXACTLY:

- `purge-retained-field`: `{archive,expectedLifecycleRevision,policyRevision,
  holdRevision,valuesRelation,effect,eligibility,irreversibleMarker}`. Archive is
  the exact portable archive ref verified against original private record.
  ValuesRelation is actual `{schemaOid,tableOid,schemaName,tableName}` of ONLY
  that original value heap. Effect is exactly `drop-one-values-relation-restrict`.
  IrreversibleMarker is a nonempty approved located marker <=256 UTF8 bytes,
  tied to complete archive/Field/target/plan identity. Eligibility is either
  `{mode:"elapsed",certificate}` or `{mode:"minimum-window-override",reasonCode,
  overriddenMinimumRetentionMs}`. ReasonCode is enrolled finite token <=128 UTF8
  bytes, not arbitrary SQL/text; override requires a distinct enrolled override
  permission in addition to purge scope. Its bound must equal actual minimum.
- `mutate-retention-hold`: `{archive,expectedLifecycleRevision,
  expectedHoldRevision,operation,holdId}`; operation exactly `add|remove` and
  holdId UUID. Removal requires the current exact hold, addition absence, no
  silently successful duplicates. Original request duplicate observes outcome.
- `update-retention-policy`: `{archive,expectedLifecycleRevision,
  expectedPolicyRevision,nextPolicy}`. NextPolicy is the exact policy shape
  above; authenticated new statement/config and explicit restore meaning must
  validate. It cannot lower the original minimum. No changing policy identity
  to evade original signed duration. A separate minimum-window override only
  authorizes that one purge, not rewriting historical retention.

Each prepared request includes original context/registry-native IDs and complete
intent for actual authenticated external signer inspection. Exports are data
copies, never signing capabilities. Verification checks exact shape, original
registry request, current original authority/scope/purpose/key and full intent;
consume/signature/effect/outcome race discipline matches adopted G11. Native
effectKey is original target/provider/archive/scope plus expected revision; all
repeated prepares reuse the same original request and resolvable capability.
No nonce can manufacture a second native effect for the same reservation.
Revocation affects new actions; original readonly settlement uses retained
original signature/key history. Time certificates use distinct enrolled clock
keys and domain below; data signer cannot fabricate elapsed time by re-signing.

Restore uses original UMF verified plan approval PLUS original enrolled data
policy permitting restoration; a schema author cannot grant themselves archive
access. It reserves under the same data-custodian private authority using the
exact source/plan/archive/current-lifecycle correspondence, not a public raw
archive reader or arbitrary per-value callback. Data policy registration and
its original keys must exist before any archive-backed capability is issued.

##### Exact elapsed-time certificate and conservative checkpoints

The enrolled host clock authority prepares payload exactly
`{profile:"umf.retention-elapsed-certificate/0.1",authorityId,purpose,providerId,archiveId,
targetCustody,publicationOutcomeId,anchorDigest,policyRevision,
custodySequence,elapsedLowerBoundMs}`. Its signed envelope is exactly
`{payload,keyId,signature}`; signing prefix ASCII profile then NUL then RFC8785
payload. Actual configured context/key/purpose and original archive/publication
anchor must match; scope cannot be supplied by caller. Integer bounds are
positive safe custody sequence and nonnegative safe elapsed milliseconds.
Certificate max65536 UTF8 bytes. Reject unknown keys/fields, source mismatch,
rewound custody, unqualified clock or invalid signature.

Original clock anchor/checkpoints privately retain actual boot identity,
monotonic tick/runtime units, precision/error, publication observation, last
proved lower bound and custody sequence. Compute integers exactly; floor any
fractional milliseconds after subtracting uncertainty. Within same verified
boot, accumulated lower bound may advance by max(0, elapsedTicks minus admitted
uncertainty). Never accumulate overlapping intervals twice: every checkpoint
atomically records original prior sample, new sample and new cumulative lower
bound under the original durable single-writer lock/fsync custody sequence.
Crash/lost acknowledgement settles that original checkpoint; a retry cannot add
its interval twice. Across uncertain interval/reboot, retain only the last
proved lower bound and re-anchor with zero added age. Negative ticks/rewind
refuse rather than re-anchor past a suspected rollback. No unqualified wall
instant, VM snapshot, shared UID or Python monotonic name is evidence of origin.

The actual local supervisor/custodian must expose this concrete native clock
profile before certificate issuance, including platform/reboot identity and
nonrewind proof. Absence refuses normal purge; only separately authenticated
minimum-window override can omit a clock certificate and it cannot evade
holds/dependencies/pending native outcomes. Certificates enter private purge
intent, not public per-row data. A delayed valid certificate conservatively
understates age; final current policy/hold/native-state checks still apply.

##### Proposed exact Weft new-instance fill port

Require an immutable qualified Weft public prepare function with request
`{version:"weft.archive-new-instance-fill-request/0.1",target:"postgresql18",
binding,domain,expression,population,nulls:"reject-for-required"}`. Binding is
exactly `{previousSource,nextSource,previousBundleDigest,nextBundleDigest,
configurationDigest,planDigest,table,field}` using existing full source refs.
Domain is complete current target physical/logical/mapping. Expression is the
existing closed G02 typed expression. Population is exactly
`{kind:"retained-archive-complement",archiveId,tableToken,businessRelation,
identityColumn,valuesRelation}`. Native relation records are exact qualified
schema/table names plus schema/table OIDs; identityColumn includes actual attnum,
name,typeOid,typeMod. All are HOST-derived from original custody, not author
supplied SQL. Weft accepts only qualified request/context and its fixed relational
predicate, never a callback or generic free-form WHERE.

Reply is exactly `{version:"weft.archive-new-instance-fill/0.1",status:"compiled",
target:"postgresql18",requestDigest,binding,populationDigest,expressionDigest,
domainDigest,program,nativeExactValueGuard}`. Program uses the existing admitted
G02 native prepared program/result format with a NEW explicit population profile;
its scalar/typed bind lowering remains Weft-owned. The actual compiler builds
`NOT EXISTS` against the original private archive IDs before evaluating fills,
under a qualified maintenance role that can read both original business and
private archive. This is host-only execution, never ordinary businessOwner
access to originals. Any role-scope expansion is explicitly enrolled and native
qualified; matching SQL text or dictionaries do not confer prepared authority.
No UMF SQL rewrite or arbitrary SECURITY DEFINER author function workaround.
The actual Weft owner must accept the exact request/program extension and freeze
public symbols/artifacts before enablement; an unsupported immutable Weft fails
closed and required-target fill remains tracked, not silently downgraded.

##### Exact execution policy and resource admission

Select trusted `umf.g05.execution-policy/0.1` exactly
`{profile,transactionTimeoutMs,maxRetiredRows,maxRestoredRows,
maxRetainedLogicalBytes,dataAuthorityConfigDigest,clockAuthorityConfigDigest}`.
The profile member is the literal above; timeout is integer1000..3600000ms,
row limits integers0..1000000 each, retained limit integer0..1073741824 bytes,
and both config digests are lowercase64hex of originally enrolled immutable
host authority contexts. Defaults are60000ms,1000000 rows each and67108864 bytes;
configuration digests have no fabricated/default context. Policy is host-selected
and original-approval-bound, not an options author privilege. Match actual native
transaction_timeout, absolute host deadline and bounded driver/cancellation waits
before BEGIN; the selected actual immutable session wrappers must agree this
policy variant before admission. No old Weft/session module gains new meaning.

Limits count the aggregate actual retirement/restoration row populations in
that phase, not each entry separately. Restored rows include all new instances,
even mode null; deleted originals do not count as restored rows. Complete
population/byte estimates are protected and rechecked before actual COMMIT;
exhaustion aborts the whole phase. Archive and row-table/provider caps still
apply. Lowered policy cannot erase pending effects or approve another cohort.
Ledger/lifecycle/host journal counts are separate finite metadata caps; these
logical limits do not bound physical heap/index/WAL or external copies.

##### Native receipt and purge result

Execution0.7 selects private native transition record0.3, retaining original
keys but using selected G05 policy and phaseBudgetReceipt exactly
`{profile:"umf.g05.phase-budget-receipt/0.1",policyDigest,retirementEffects,
restorationEffects,retainedLogicalBytes,nativeTransactionTimeoutMs}`.
RetirementEffects ordered actual effects, each exactly
`{stepId,table,field,intentDigest,archiveId,fieldMeaningDigest,sourceCount,
archivedCount}`. Counts must equal complete protected actual populations.
RestorationEffects each exactly `{stepId,table,field,intentDigest,archiveId,
fieldMeaningDigest,originalSurvivorCount,newInstanceCount,deletedOriginalCount,
restoredCount,fillProgramDigest,compilerArtifactDigest}`. All counts nonnegative
safe integers; restoredCount=originalSurvivorCount+newInstanceCount. Last two
digests null iff newInstances is not fill; otherwise actual verified immutable
Weft program/artifact digests even for empty population. Arrays <=256 each.
Counts/IDs contain no values/per-value hashes. Validate same-instance partition
by exact protected joins, not counts alone. Bind actual native reservations,
archive/receipt/catalog/source/approval and save in SAME actual phase transaction.
RetainedLogicalBytes uses G04 cycle-free per-archive measure, distinct ledger/
lifecycle metadata caps, with selected trusted policy max1GiB and row1million caps.

Purge does not mutate schema head. Public host result is exactly
`{profile:"umf.retained-field-purge-result/0.1",requestId,archiveId,targetCustody,
intentDigest,status,outcomeId}`. Status `confirmed|aborted|unknown`; outcomeId UUID
for confirmed/aborted and null for unknown. Confirmed corresponds to actual native
tombstone and absent original relation; aborted to actual original no-effect
settlement. Unknown is explicitly unresolved, never success or purge replay
permission. Host readonly original-outcome lookup uses original authority and
reveals no retained values. No new arbitrary portable execution side channel.

##### Explicit readiness status

These forms complete the proposed concrete lifecycle/data-authority/time/receipt
interfaces. Actual implementation, immutable session/compiler wrapper agreement,
crypto/clock/native acceptance, complete
source/browser/installed evidence and public bytes remain required. The proposed
Weft port is not owner-agreed or implemented merely by this document. External
custody, online restore/capture, source-table retirement, combined type-change
restore, abandoned cleanup and generalized hold/override workflows remain
separately tracked compositions. No source-only or irreversible-only subset
closes all G05 obligations.


#### G11 separate configured initial generation enrollment

The concrete existing-head enrollment below closes a missing protocol-only
authority seam. It introduces a SEPARATE original two-scope logical enrollment
authority/config/domain/context and exact native capability/receipt/barrier
resolution, preserving the six physical owner scopes unchanged. Existing-head
enrollment requires an actual non-null installed source/head; genuine headless
G10 installation remains a separately tracked authority/profile. Native source
controls or a receipt dictionary cannot establish any of these capabilities.
This unpublished elaboration retains all prior source/identity/fidelity and
actual native/recovery/installed/release gates.

##### First scope and original host authority

First native profile `postgresql18-existing-head-enrollment/0.1` enrolls an
EXISTING fully validated source installation with a genuine original non-null
64hex head, complete original source bytes/bundle/catalog/client witnesses and
original target/store custody. Its ingress store has no prior epoch/enrollment/
transition for this installation. No guessed hash creates a historical head;
no initial migration/default/seed/data DDL occurs in this operation.

Implement ConfiguredGenerationEnrollmentAuthority using originally enrolled
operator key/principal/target/source-policy context and original durable
request/effect ledger, distinct from physical owner authority. It may share the
qualified Ed25519 verification implementation and durable file primitives, but
has separate domain, closed scopes, request registry, configuration digest and
native capability type. NativeAcceptanceGenerationEnrollmentAuthority has a
separate immutable acceptance purpose and uses the SAME enrollment effects;
production rejects that context. No UID/TTY, submitted key or arbitrary JSON
capability can issue enrollment. Prepare/export/verify/observe and positive
original recovery retain the adopted signed-authority race/consumption semantics.

The actual provider requires original TargetCustody, original ingress-store
capability, actual local supervisor/native issuer and this original authority.
An exported matching dictionary/receipt is not any of those capabilities. All
native state/record helpers remain private and cannot be exposed as an alternative
public enrollment API accepting a success record. Physical target registration
and store creation establish origin, not logical generation authorization.

##### Exact signed requests and finite native inventory

Signing prefix ASCII `umf.initial-generation-enrollment-approval/0.1`, then NUL,
then RFC8785 UTF8 payload. Envelope exactly `{payload,keyId,signature}`, payload
exactly `{profile:"umf.initial-generation-enrollment-approval/0.1",authorityId,
principalId,keyId,requestId,purpose,scope,policyRevision,configurationDigest,
contextDigest,targetCustody,intent}`. Purpose is the original
production|native-acceptance context. Standard Ed25519 strict32byte keys/64byte
base64url signatures and originally configured key lookup; no embedded key.
Envelope keyId must exactly equal signed payload keyId; selection is signed and
validated against the same original configured key before signature success.
All UUIDs canonical lowercase, digests64lowerhex, native OIDs actual integers
1..4294967295 excluding booleans, native role names existing63UTF8-byte bound,
IDs<=256UTF8 bytes, complete payload<=1MiB. Registry4096requests/8MiB; no history
truncation or lock recreation during readonly recovery. Two closed scopes:

`prepare-initial-enrollment` intent is exactly
`{profile:"umf.initial-generation-enrollment-prepare/0.1",providerId,enrollmentId,
installationId,targetCustody,storeId,source,bundleDigest,expectedHead,
sourceCohortDigest,executionPolicyDigest,issuerProfile,initialEpoch,
subjects,maximumRoles}`.

ProviderId/storeId identify the original store/provider and must agree;
enrollmentId and initialEpoch are original UUIDs allocated BEFORE signing by
the original issuer/registry, not arbitrary caller selectors. Source is exact
original `{format:"json",sha256}`; the complete retained bytes and native source
census must actually match. BundleDigest and expectedHead are real installed
source/head observations, non-null. SourceCohortDigest binds the original
compiled bundle, private dependency/native privilege census and actual clients.
ExecutionPolicyDigest is the original selected bounded maintenance policy.
IssuerProfile identifies the actual qualified original credential issuer.
MaximumRoles is integer1..256 equal to subjects count. No plan/file/previous/
next-source fields or fake original plan approval are invented for enrollment.

Subjects is ordered1..256 unique actual stable-role entries exactly
`{subject,audience,observedFlags,memberships,ownershipReceiptDigest,newLoginName}`.
Subject exactly `{oid,name}`, audience person|batch, memberships the adopted
closed ordered `{roleOid,roleName,inherit,set,admin}` inventory, with real boolean
flags, unique roles and aggregate<=1024 edges. ObservedFlags has exactly the
seven adopted role booleans canLogin,superuser,createDatabase,createRole,
replication,bypassRls,inherit. EVERY legacy subject is actually LOGIN with all
privileged flags false; inherit retains original source/native meaning. The
permanent post-enrollment subject is identical except canLogin=false. Preserve
subject OID/name/groups/current_user semantics and original ownership receipt;
no changing audience/groups/privileges to get admission. Every newLoginName is
new absent native identity, distinct from every stable subject/other new login.
There are no claimed future login OIDs, credentials or activation signature.

Prove exclusive original installation control of enrolled legacy principals,
all native auth/SET/inherit/group/grant/definer access paths and original owned
realm/HBA. Shared roles, an additional unknown LOGIN route to a subject,
cross-installation use, preexisting wrapper login or unaccounted backend outside
the owned target refuses this first profile. Unknown privilege is not waived
because an operator signed names. Source fixtures must arrange actual owned
legacy subjects under authenticated bootstrap, not mint native ownership from a
Python object. Managed/shared-identity adoption needs separate qualification.

`activate-initial-enrollment` intent is exactly
`{profile:"umf.initial-generation-enrollment-activate/0.1",providerId,enrollmentId,
installationId,targetCustody,storeId,prepareRequestDigest,prepareApprovalDigest,
preparationReceiptDigest,source,bundleDigest,expectedHead,sourceCohortDigest,
executionPolicyDigest,initialEpoch,principals,principalsDigest,
fenceReceiptDigest,externalReservationDigest}`.

Every common binding equals the original preparation. Principals are the actual
adopted native ingress inventory (login/subject OIDs and names, audience,
issuerProfile,issuerReceiptDigest,ownershipReceiptDigest,memberships); all actual
new login OIDs already exist and remain NOLOGIN until activation. The complete
original protected preparation/fence observations are retained privately; hashes
and echoed JSON alone cannot issue approval/capability. No null expectedHead,
oldEpoch, oldPrincipalsDigest or table-generation-ingress request is involved.
Effect keys are `[scope,providerId,enrollmentId]`; repeated prepares/recovery
reuse original request IDs and handles. Unknown request outcomes are not new
preparations with a different initialEpoch.

##### Actual preparation, fencing and source protection

Before effects verify source/head/custody/store absence, native identities and
original configured enrollment authorization, then consume and durably bind the
original preparation approval/reservation. Close the actually owned endpoint
admission gate under original supervisor custody, retain private authenticated
maintenance/controller connections, and execute the adopted native pending-auth/
backend barrier against ALL old authentication paths. The enrollment fence
receipt is separately domain-tagged `umf.initial-enrollment-fence/0.1` and binds
original preparation/target/legacy inventory, gate and actual candidate backend
identities/resolutions; it is NOT a fake transition fence with invented epochs.
Its backend observation/starting/NULL identity and positive retirement rules are
the SAME adopted qualified native barrier rules and original evidence resolver.
No ps/PID/name list, sleep, HBA reload or quiescence boolean substitutes for it.

Legacy subjects become NOLOGIN preserving OIDs, memberships and all other
admitted meaning. Fresh wrapper logins are created disabled with exact ordinary
nonprivileged/noinherit flags and one SET-only non-inheriting non-admin edge to
their stable subject. Use the fixed qualified native renderer/issuer, no author
SQL callback or silent role adoption. Credentials are private original issuer
state, never public values/plan data. Execute the role creation/alterations and
fixed membership effects transactionally with original native preparation
receipt. Retire actual old sessions and resolve all original pending-auth
candidates under the owned gate; no wrapper admission is released.

Recheck COMPLETE actual installed source/head/catalog/client/ACL evidence under
protected maintenance. Any source/head/role drift refuses activation; no migration
or automatic recapture under a new approval. The first profile admits actual
legacy LOGIN subjects with the exact owned realm/native barrier above. More
general prior wrappers/shared subjects require their own closed adoption profile.

The role preparation transaction atomically records exactly one prepared epoch
with its role effects, BEFORE final barrier completion. Native head_digest NULL because
not active, but its SOURCE/EXPECTED HEAD binding remains non-null in the original
preparation request. Use the adopted prepared-epoch/provision-origin native
receipt shape with requestDigest/reservationDigest bound to this distinct
original preparation, actual principals and ownership/target observations.
Headless prepared-row storage is not permission for headless public enrollment.
Only the concrete original enrollment capability can write this special prepared
record. No generic insert_epoch(active) shortcut establishes authority.

##### Activation, original receipt and recovery

After actual preparation/fence/source proof, export the full activation request
for authenticated signature, verify against original registry/context, consume
and reserve before effects. In ONE actual native transaction on the original
private connection, recheck custody/policy/source/head and complete principals/
fence/store inventory, enable only actual approved new wrapper logins, and move
that one original epoch prepared->active with real head/source/bundle and
original positive enrollment receipt. The existing closed
`umf.native-ingress-enrollment/0.1` receipt keeps exactly its adopted members:
providerId,enrollmentId,installationId,targetCustody,epoch,sourceDigest,
bundleDigest,headDigest,principalsDigest,ownershipObservationDigest,
externalReservationDigest plus profile. OwnershipObservationDigest now binds
complete actual preparation and activation request/signature/fence/source/native
observations in original custody; it is not self-authenticating evidence.
Native phase/head is not reset or rewritten; only initial ingress enrollment
changes. No transition row with old=new epochs and no migration effect is faked.

Keep the gate closed and credentials unavailable until original native COMMIT
is positively observed and original external custodian confirms that real
initial head/active epoch and enrollment reservation. Release only original
subject-bound admission/factories for that exact epoch. Before confirmation,
native active state alone cannot expose credentials/gate. Late activation
failure/unknown outcome never re-enables the legacy LOGIN roles or silently
unfences old callers. Fail closed and observe original pending stage.

Preparation or activation unknown COMMIT resolves its ORIGINAL native epoch/role/
receipt and external stage reservation under original target custody, not a new
request/new OID or repeated role DDL. Known stage abort may retry only its same
original reserved intent after actual no-effect proof; already confirmed stages
are not redispatched. Durable initial intent/history and native prepared/active
record must support actual positive process-restart recovery. A missing original
ledger/gate/issuer/role origin refuses and is tracked for explicit forward repair,
not reconstructed from self-consistent native data. Source tests that only
refuse redispatch do not qualify positive recovery.

##### Acceptance and remaining G10 seam

Run real valid/invalid signatures for both scopes and purposes, malformed/unknown
fields, boolean/OID bounds, changed source/head/policy/subject/audience/groups,
future OID injection, preexisting login and cross-purpose substitution. Prove
original request/scope separation from all six physical owner scopes and normal
ingress transitions; no null-head or acceptance-purpose exception.

Actual native acceptance must execute a real installed legacy head and exclusive
subjects, prepared readers/cursors/writers and starting authentication, preserved
subject OID/current_user/group meaning, disabled fresh logins, complete native
source witnesses and atomic activation. Exercise changed source during signing,
concurrent enrollment and existing epoch refusal; cancellation/unknown COMMIT at
role prep/prepared epoch/activation/external confirmation/gate publication; actual
positive original restart recovery and no duplicate roles/epochs or credential
leak. Frozen installed/native/browser/release/public bytes remain separate gates.

TRUE fresh installation with no source/head/previous epoch is NOT admitted here.
G10 requires an explicit headless initial-install authority/profile binding
original namespace absence, approved first source/plan, exact bootstrap effects
and first publication. Until separately specified and qualified, absence of an
existing head refuses this enrollment. No fixture-only synthetic head, null
predecessor transition or physical registration approval closes that gap.


##### Exact immutable configuration and original bootstrap registry

Configuration is exactly
`{profile:"umf.configured-generation-enrollment-authority/0.1",authorityId,
policyRevision,purpose,supervisorId,custodianId,providerId,installationId,
targetCustody,storeId,sourcePolicy,keys}`. PolicyRevision is nonempty NUL-free
UTF8<=128bytes, purpose production|native-acceptance; IDs/target are the exact
original registered values and storeId=providerId. Configuration <=1MiB canonical
UTF8; digest SHA256 of its complete RFC8785 bytes, never including itself.

SourcePolicy is exactly
`{profile:"umf.existing-head-enrollment-policy/0.1",approvedCohorts,
approvedSubjects,issuerProfile,maximumSubjects,allowLegacyLoginConversion}`.
AllowLegacyLoginConversion is literal true, maximumSubjects integer1..256.
ApprovedCohorts is1..256 unique exact tuples
`{sourceDigest,bundleDigest,sourceCohortDigest,executionPolicyDigest}`; admission
must match ONE COMPLETE tuple, not the cross-product of four allowed lists.
ApprovedSubjects is1..256 ordered unique exact
`{subject,audience,ownershipReceiptDigest,membershipsDigest,flagsDigest}` with
subject {oid,name} and audience person|batch. The preparation subject list must
match the complete configured list/order, its original actual ownership, current
memberships and seven observed flags, not any subset or caller-selected actor.
All digests recompute from complete actual closed native observations. Every
legacy subject is LOGIN/nonprivileged as specified above, preserving ONLY its
original admitted inherit/groups. No first-subject-only check.

Keys is1..32 unique exact `{keyId,publicKey,principalId,scopes}`. KeyId/principalId
NUL-free UTF8<=128bytes; publicKey strict unpadded base64url32bytes. Scopes is a
unique ordered nonempty subset of prepare-initial-enrollment then
activate-initial-enrollment. Configuration binds one explicit original target;
no wildcard, submitted key or arbitrary source policy. Signed payload's
policyRevision/configurationDigest/contextDigest must match the ORIGINAL registry
entry before signature success; the public canonical configuration is not itself
a capability or authenticated trust enrollment.

Extend the actual original bootstrap issuer with the concrete private operation:

`enroll_generation_authority(originalTrustEnrollment,originalSupervisor,
 originalCustodian,originalIngressStore) -> GenerationEnrollmentAuthorityContext`.

OriginalTrustEnrollment is an opaque entry of the trusted embedding's ORIGINAL
operator-managed deployment configuration registry, not an approval/request field,
UID assertion, arbitrary callback or public context constructor. Its exact
retained statement is
`{profile:"umf.generation-authority-trust-enrollment/0.1",enrollmentId,
ownerBootstrapContextDigest,configurationDigest,supervisorId,custodianId,
providerId,installationId,targetCustodyDigest,storeCreationReceiptDigest,
custodySequence}`. It is anchored to that already enrolled trusted deployment
root and original operator policy revision BEFORE this authority is constructed.
Config/private key material is never accepted from the logical/native request.
The source profile does not prescribe reading secrets from chat or minting a
production signer. Actual production integration must supply its already
trusted configuration root; missing root refuses. Native fixture enrollment
uses its explicit acceptance root and original isolated target, never production.

The bootstrap issuer verifies its ORIGINAL trust-registry object identity and
statement, all original supervisor/custodian/store opaque objects/creation
receipts, policy/purpose/configuration digest and current target continuity, then
records the immutable context in its own durable bootstrap registry before
returning a context handle. It cannot enroll a new trust root merely because
another caller supplies a fresh key/config/receipt. The original host embedding
may perform this during authorized setup; a portable source author cannot.
Context's public projection is exactly
`{profile:"umf.generation-authority-context/0.1",contextId,
trustEnrollmentDigest,configurationDigest,supervisorId,custodianId,providerId,
installationId,targetCustodyDigest,storeCreationReceiptDigest,purpose}`.
ContextDigest hashes this full projection. The issuer retains original native
objects and statement; copying this projection cannot mint the opaque handle.

ConfiguredGenerationEnrollmentAuthority is constructed ONLY with that original
context and bootstrap-enrolled fixed resolver. The resolver is the issuer's
private `resolve_generation_authority_context(handle)`, verifies same exact
registry object, original context/configuration/root/native objects and current
custody. No resolver callback from an enrollment request. Positive restart
recovery uses `recover_generation_authority_context(contextId)` against EXISTING
bootstrap history and reobserved actual original realm; no lock/context/keys
are recreated from missing history. Its prepare/export/verify/consume/bind/
observe protocol pins full configurationDigest/contextDigest in request, signature
and durable ledger header/entries. Rotation follows authenticated original
settled-only context enrollment, preserving old readonly outcome/key history.
These are concrete configured verifier/issuer operations, not an always-refusing
interface; actual native issuer/root/crypto implementation still needs evidence.

##### Exact original prepared-epoch capability and receipt

Implement private `InitialGenerationPreparationRequest`,
`InitialGenerationReservation`, `PreparedInitialGenerationEpoch` and
`VerifiedInitialGenerationFenceEvidence` registry handles. Only the concrete
original provider/issuer may issue them; no shared construction seal or public
JSON factory. Provider logical operations are:

```text
prepare_initial_enrollment_request(context,closed_request) -> InitialGenerationPreparationRequest
export_initial_enrollment_signing_request(request) -> owned signing data
reserve_initial_enrollment(request,verified_approval) -> InitialGenerationReservation
prepare_initial_epoch(reservation) -> PreparedInitialGenerationEpoch
observe_initial_preparation(reservation) -> original outcome
prepare_initial_activation(prepared_epoch) -> owned activation signing data
activate_initial_enrollment(prepared_epoch,verified_activation_approval) -> GenerationEnrollment
recover_initial_enrollment(original_enrollment_id) -> original pending/confirmed outcome
```

All methods resolve original private registry/context/store/custodian/issuer;
exported records do not stand in for handles. Internal store entry point
`insert_initial_prepared_epoch(original_preparation_capability)` derives native
row/receipt itself and accepts NO caller epoch dictionary. Capability resolution
verifies original request/signature/reservation, complete actual native roles,
source/head and original empty ingress store (zero epochs/transitions), then
performs role effects AND prepared epoch insertion in one actual transaction.
Another provider/installation/issuer capability refuses before SQL dispatch.
The capability is scoped to this one enrollment/epoch, not generic store writes.

Keep EXACT existing `umf.native-ingress-provision-receipt/0.1` members:
`{profile,providerId,enrollmentId,epoch,requestDigest,reservationDigest,
principalsDigest,nativeOwnershipDigest,targetObservationDigest}`.
Here requestDigest is the original INITIAL preparation request, reservationDigest
is its distinct original initial-enrollment reservation, nativeOwnershipDigest
is the actual role-effect/creation observation (not the eventual final preparation
receipt), and targetObservationDigest its original live target observation.
No future fence or activation approval is hashed inside this receipt. Epoch row
uses existing exact native-ingress-epoch0.1 keys, state prepared, headDigest null,
origin provision, actual complete principals, real source/bundle and this receipt.
Only the private initial-preparation entry point admits that original domain;
ordinary disabled-epoch provisioning still requires its own six-scope request.
The generic receipt validator proves shape only, never authority.

The final private completed preparation receipt is exactly
`{profile:"umf.initial-generation-preparation/0.1",providerId,enrollmentId,
installationId,targetCustody,storeId,requestDigest,approvalDigest,
reservationDigest,epoch,sourceDigest,bundleDigest,expectedHead,
sourceCohortDigest,executionPolicyDigest,principalsDigest,nativeOwnershipDigest,
targetObservationDigest,legacySubjectsDigest,preparedEpochReceiptDigest,
fenceReceiptDigest}`. ApprovalDigest hashes original signed preparation envelope.
PreparedEpochReceiptDigest hashes the actual existing provision-origin receipt
positively observed after the role/prepared-row transaction COMMIT; actual
principals/roles/complete native source observations remain original private
registry data. Final fence completes AFTER that transaction. FenceReceiptDigest
binds the original evidence below. This ordering is acyclic; request/role receipt
cannot contain its own eventual completed-receipt/fence/activation digest.

Store activation is private `activate_initial_epoch(original_activation_capability)`;
it accepts no raw active epoch/success record. Resolve original actual prepared
handle, verified activation signature, reservation and qualified barrier evidence,
then reobserve before enabling logins and updating exactly that original epoch/
origin enrollment receipt in the SAME native transaction. Positive outcome
recovery resolves exact original prepared/active row, roles and receipts without
reissuing role DDL or making a new epoch. Missing original registry/receipt/gate
keeps effects closed. Successful activation issues GenerationEnrollment only
after actual external original confirmation, not on source validation alone.

##### Exact initial fence and original native evidence resolution

Initial fence record is exactly
`{profile:"umf.initial-enrollment-fence/0.1",providerId,enrollmentId,
targetCustody,prepareRequestDigest,reservationDigest,legacySubjectsDigest,
gateReceiptDigest,preparedEpochReceiptDigest,candidates,retiredSessions,
resolutionDigest,sourceObservationDigest}`. Record <=1MiB canonical UTF8.
Candidates and retiredSessions use EXACT adopted PostgreSQL18.6 backend-barrier
normal forms/ordering/uniqueness, at most4096 each, with no replacement of NULLs,
PID-only signaling, starting-state inference or unqualified backend_start.
The conjunction of record-byte and entry caps may refuse a worst-size snapshot;
no truncation to fit. LegacySubjectsDigest hashes the original complete subject
inventory; sourceObservationDigest binds full actually protected source/head/
cohort/policy/native recheck. No old/new epoch or transition ID is fabricated.

Original resolver retains actual supervisor gate receipt/private objects and
native kernel/process/source observations; a matching gateReceiptDigest alone
is insufficient. Capture candidates from the ACTUAL full post-role-NOLOGIN /
prepared-epoch COMMIT native observation under closed original gate, unfiltered
by user/database/state. This uses the same actual native barrier implementation
as subsequent G11 transitions, through a distinct INITIAL binding context.
No wrapper reimplements a weaker empty-scan barrier.

Reuse EXACT `umf.pg18.backend-barrier-resolution/0.1` keys
`{profile,requestDigest,reservationDigest,fenceCommitReceiptDigest,
candidatesDigest,resolutions}`. Request/reservation refer to ORIGINAL INITIAL
preparation; fenceCommitReceiptDigest equals preparedEpochReceiptDigest of that
role-NOLOGIN transaction, candidatesDigest hashes the immutable original array.
Resolutions are original one-for-one pending/exited/resolved-other/retired-old
records under the adopted rules, with actual absence/termination/privilege proof.
Any pending candidate, missing start token, unknown role path or unresolved
native observation forbids completion. Original identity snapshots/resolutions
must survive process restart; never capture a replacement candidate set to
forget pending authentication. Cross-database known owned old roles retire
cluster-wide; unrelated candidates must positively exit/resolve without being
killed as a shortcut. Exclusive installation role ownership remains mandatory.

The original concrete local issuer alone issues
VerifiedInitialGenerationFenceEvidence after those ACTUAL observations and
stores immutable full context, original request/reservation/role receipt/gate/
source/native candidate/resolution records. Its private fixed operation
`resolve_initial_enrollment_fence(handle)` checks same original issuer registry,
bootstrap enrollment context, supervisor/custodian/store, exact original barrier
objects and native receipts; no public supplied resolver/seal/data proof.
Activation must invoke it and reobserve live gate/roles/target/source. A source
test's synthetic handle is only a control, never native qualification. Complete
fence receipt/resolution digest alone cannot issue GenerationEnrollment.


#### G04 original store birth, table enrollment and protected capture capabilities

This unpublished native integration amendment closes previously unspecified
original creation/enrollment/session seams. It explicitly preserves adopted
protected transactional TABLE RLS disable, businessOwner collection, controller
archive insertion and original/final RLS/settings restoration; row_security GUC
stays on. Select exact new host policy0.2 for retained mode to signature-bind
capacity, preserving old policy0.1's closed shape. Fixed schema COMMENT receipt
changes no .1 table footprint and is data-free/non-confidential; it never replaces
original external native custody. Actual implementation/native/resource/installed
and release qualification remain required.

##### Approval-bound capacity and per-table enrollment

Keep exact G04 host policy0.1 unchanged. Retained-originals execution0.6 now
requires NEW closed policy
`{version:"umf.g04.execution-policy/0.2",phasePolicy,conversionEntryLimit,
retainedLogicalBytesLimit,maxIssuedInstances}`. Original three values retain
0.1 semantics/bounds; maxIssuedInstances exact integer1..1000000, default1000000.
Complete policy digest is the one actually signed in the G11 ingress request
and recorded in native phase/transition; do not reconstruct a different local
capacity after approval. Irreversible/roundtrip old policy variants retain their
original finite admission, not implicit extra members. Missing qualified host/
session/renderer support refuses retained execution. The new member is host
capacity, not extra Weft expression authority or author options.

The original concrete native issuer prepares a per-table request exactly
`{profile:"umf.row-table-enrollment-request/0.1",requestId,providerId,
installationId,targetCustody,store,planDigest,planApprovalDigest,
ingressRequestDigest,ingressApprovalDigest,executionPolicyDigest,
previousSourceDigest,previousBundleDigest,nextSourceDigest,nextBundleDigest,
table,record,businessRelation,tableToken,metadataNames,maxIssuedInstances}`.
Store is the original signed store tuple profile/storeId/schemaName. BusinessRelation
is actual `{schemaOid,schemaName,tableOid,tableName}`; record exact module/element.
MetadataNames is exactly `{idColumn,revisionColumn,uniqueConstraint,
revisionConstraint,trigger,function}`, derived from the adopted token32 renderer.
All IDs/OIDs/digests and source bounds use adopted exact normal forms; request
<=1MiB. There are NO future metadata OIDs or row values. Allocate tableToken and
requestId in original private registry before collision checking/export/binding.
Names must be absent in their exact native namespaces; collision refuses, not
retries a new token after approval/unknown outcome.

`prepare_row_table_enrollment(originalPhase,originalStore,verifiedPlan)` yields
an opaque RowTableEnrollmentRequest, after original source/native/catalog/role/
policy/selected retained-recovery correspondence. The fixed native resolver
requires original verified plan approval AND original G11 ingress transition
approval/reservation/phase handle plus original confirmed store. This is an
implementation-derived effect already authorized by the EXACT retained-recovery
plan/native profile, not a second human prompt or store-creation signature reused
as permission to ALTER business data. Both original approvals and original context
must actually admit that plan/table/capacity. No raw caller dict/cursor/source
selector can mint this handle; data-free export confers no authority.

Original custodian durably reserves that complete request before ALTER, yielding
opaque RowTableEnrollmentReservation and private record exactly
`{profile:"umf.row-table-enrollment-reservation/0.1",reservationId,requestDigest,
providerId,installationId,targetCustody,storeId,tableToken,custodySequence}`.
Reserve/observe/confirm/abort use original existing durable ledger and writer
lease, bounded4096requests/8MiB. Same table/original phase effect key resolves
one request/token/reservation; changed intent on occupied key refuses. No new
metadata table. Unknown journal/native outcome blocks before fresh enrollment.

The fixed `enroll_row_table(originalReservation)` alone can ALTER. Under actual
exclusive business/dependency locks, durable ingress fence, SAME actual phase
transaction and approved actor scopes, execute the adopted column/constraint/
ledger/guard/privilege enrollment. Existing row_tables record retains its EXACT
adopted keys, maxIssuedInstances and creationReservationDigest; the latter hashes
this ORIGINAL reservation. The record/record_digest, actual metadata identities,
issued IDs/count and source privilege translation commit with the ALTERs. No
extra enrollment columns/table or supplied native success dictionary. This is
the native enrollment receipt in the declared footprint. External confirmation
binds that actual record digest and original created-object inventory AFTER
positive native COMMIT. Native phase observation can validate it before COMMIT,
but cannot claim external confirmation early. Unknown outcome observes original
row/guard/inventory/phase outcome, never re-ALTER or adopt a same-named record.

##### Original store creation reservation and native receipt

Use original signed native-store-creation approval for the EXACT store tuple
and full actual native authority evidence, verified through original issuer/
context. Custodian reserves BEFORE fixed DDL exactly
`{profile:"umf.row-originals-store-reservation/0.1",reservationId,providerId,
installationId,targetCustody,store,creationRequestDigest,creationApprovalDigest,
nativeAuthorityEvidenceDigest,configurationDigest,custodySequence}`.
No future schema OID. Actual original namespace absence/exclusive privileged-DDL
coordination, source gate, native authority and original target are mandatory.
Generic IF NOT EXISTS/name/prefix adoption is forbidden.

For new store creation, persist the native receipt using EXACTLY ONE COMMENT
ON the new original private SCHEMA in the SAME transaction as its fixed objects;
no undeclared .1 metadata table. Comment text is the fixed ASCII prefix
`umf.originals-creation-receipt/0.1:` followed by RFC8785 JSON exactly
`{profile:"umf.originals-creation-receipt/0.1",providerId,installationId,
storeProfile,storeId,reservationDigest,creationRequestDigest,
creationApprovalDigest,targetCustodyDigest,schemaOid,objects,state}`.
State is exactly created: it means created in this transaction, NOT already
committed. Objects <=1024 ordered exact
`{classId,objectId,subId,kind,qualifiedName,definitionDigest}` entries,
ordered integer classId/objectId/subId. Object IDs are actual positive uint32,
subId nonnegative native attnum or0. Kind is closed schema|table|column|
constraint|index|row-type|array-type for this fixed initial store. QualifiedName
is exactly `{schema,name,member}`: schema the actual store schema; name the
actual relation/type/index name (schema name again for kind schema); member
the exact column/constraint name for those kinds and null otherwise. It is
renderer-derived metadata, not SQL. Definitions use the fixed complete native catalog shape
witness for each class, including exact owner/ACL/dependencies and implicit
row/array types/backing objects. Observe exactly the renderer's created footprint,
never a supplied arbitrary object list. Unknown extra closure refuses.

The receipt is <=1MiB UTF8, data-free. Native comments ARE NOT CONFIDENTIAL;
include NO credentials, keys, approval signatures, private source bytes, row
values, reject samples or per-value hashes. Object IDs/names and original opaque
request/approval/custody digests are metadata only. [PostgreSQL18 COMMENT documentation](https://www.postgresql.org/docs/18/sql-comment.html)
explicitly makes comment visibility public. Native/catalog metadata can
be visible to ordinary observers; this comment does not weaken value/metadata-
column/store-table ACL requirements. Full native observations/authority receipts
stay privately retained. Do not advertise the comment as authenticated proof.

Avoid self-reference: objects' definition projections exclude ONLY this schema's
creation-receipt comment text/digest, while explicitly requiring its exact tagged
form separately. No other object comment/definition/ACL/dependency is excluded.
The full receipt digest is computed AFTER actual fixed DDL observations and stored
in original external confirmation, never inside itself or precreation request.
This explicitly replaces any earlier schema marker for the unpublished originals
profile; ingress-store's separate marker remains unchanged. G04 .1 native shape
has only its declared three heaps/objects; G05 .2 separately adds lifecycle.
No previously qualified store upgrade or comment adoption is claimed.

After positive native COMMIT, original custodian's fixed confirmation reobserves
original target, exact comment and COMPLETE native created inventory and records
the original reservation/receipt/OIDs/definitions. Then issue OriginalRowOriginalsStore
capability from that SAME original private registry. Unknown COMMIT reobserves
that original reservation/target/comment/inventory before confirmation or known-
abort settlement; no new schema/token/approval or ownership-only inference.
Missing original ledger/gate/attestor context refuses. A copied comment/store
never establishes original custody. A lost response is not proof of abort.

##### Same-connection actor/transaction and full-row capture

Use existing adopted original store session authority/phase binding; no public
new raw-connection or callback interface. RowOriginalsPhaseCapability is issued
by the concrete original host/native issuer from its SAME actual private phase
connection, verified plan/step/store/table enrollment/policy, actual locks and
original durable ingress fence. Private registry retains connection object,
actual backend PID/start, database/native target identity, original transaction
identity and driver INTRANS status. Recheck actual continuity at each scope.
Idle, aborted, autocommit, replaced backend/connection or wrong transaction refuses.
Pin transactionId to actual `pg_catalog.pg_current_xact_id()::text` at initial
active phase binding and each role boundary, strict canonical decimal uint64
without floating conversion. This may allocate the transaction ID; it is a
write phase, not an allegedly side-effect-free read. The XID binds transaction
continuity, never source row identity or historical creation authority.
[PostgreSQL18 transaction information](https://www.postgresql.org/docs/18/functions-info.html#FUNCTIONS-TXID-SNAPSHOT)
defines its top-level xid8 semantics; actual PG18.6/driver behavior remains a gate.
No caller-created cursor, seal or matching connection tuple issues capability.

Finite store methods take only original phase/enrollment/archive capabilities:
`enroll_row_table`, `capture_originals`, `record_post_revisions`,
`validate_originals`, `read_native_receipt`. Their fixed internal controller hook
never accepts or returns a callback, SQL string, cursor, row iterator or elevated
connection. Internal bounded typed buffers remain private to the implementation.
It does not BEGIN/COMMIT/release a savepoint on behalf of the outer phase.

At outer phase entry observe SESSION_USER original maintenance, CURRENT_USER
original businessOwner with exact native OIDs/names/role setting. The original
controller used for store setup is a different qualified scope: if a bootstrap
entry starts in controller, fixed issuer must establish/reobserve businessOwner
outer phase BEFORE issuing this capability. Snapshot COMPLETE original immutable
qualified session-module policy and actual dynamic settings, including all its
settings plus DateStyle, client_encoding and the actual timeout/deadline values;
recompute against original selected policy/artifact. Unknown/missing policy keys
or unauthorized values refuse, not a partial six-setting snapshot. Required base
settings remain pg_catalog search path, UTC, row_security GUC on, origin replication,
read committed, read-write and UTF8. Capture pins DateStyle ISO,YMD using SET LOCAL;
role changes use fixed safely quoted original names with SET LOCAL ROLE only.
Never RESET ROLE to privileged SESSION_USER or mutate ambient session settings.

Actual adopted capture sequence is:

1. Verify original actual exclusive table+dependency locks and durable ingress
   fence on this phase, original native relation/enrollment/source and original
   ENABLE/FORCE RLS flags. No claimed boolean lock/fence is authority.
2. As original businessOwner use fixed ALTER TABLE DISABLE ROW LEVEL SECURITY
   on ONLY that actual approved table, verify relrowsecurity=false and preserve
   the original relforcerowsecurity observation. The row_security GUC stays ON.
   This is a protected maintenance scope, not an online worker read mechanism.
3. Collect complete bounded typed instance ID/revision/value rows as businessOwner
   on this SAME connection. Validate native finite/calendar/domain before a
   driver can collapse special values. Use fixed pg_catalog native scalar I/O
   under ISO,YMD/UTC for logical byte accounting; retain genuinely typed values.
   No general controller business SELECT query or SELECT grant is introduced.
4. Close each internal source cursor before SET LOCAL ROLE original controller.
   Reobserve original session/current identities/settings/store/transaction,
   insert ONLY those private typed values into the exact approved archive using
   fixed parameter adaptation, then SET LOCAL ROLE businessOwner and reverify.
   Controller row_security remains ON. No ordinary archive read/insert grants.
5. Repeat bounded private batches with complete immutable-ID/set witnesses under
   the held exclusive lock. Before COMMIT restore/reverify original or selected
   final ENABLE/FORCE RLS and complete policy/catalog surface, outer businessOwner
   role and ALL original dynamic settings. Complete native source/instance/
   archive/value/revision/budget validation precedes actual phase receipt.

One concrete bounded collector first reads at most1000 instance IDs/revisions/
native canonical byte lengths (NO row values), chooses a prefix whose declared
41+N logical cost is <=8MiB, then reads ONLY those actual typed values. Exact
held source locks make the two observations stable; verify identities/lengths
again. A single row exceeding8MiB refuses this first buffer profile before
adapting its value. Aggregate G04 limits still apply. Keyset/native set witnesses
prove completeness, not LIMIT/count alone. Buffers must be discarded after the
fixed insert; no live generator crosses role scopes. Logical8MiB is not a Python
RSS/physical-memory promise; actual representation/resource behavior requires
native/driver qualification. No author's SQL predicate chooses captured rows.

Any failure marks phase capability unusable, aborts the ENTIRE native transaction
and discards private buffers. When aborted transaction prevents role restoration,
rollback then close/quarantine the physical connection; never return it elevated
to a pool or continue business COMMIT. Do not suppress errors as zero rows.
Unknown COMMIT follows original phase/store/enrollment outcomes; no capture replay
or business-only commit. The actual outer source/RLS/settings must be restored
before successful receipt/publication, not merely in a Python finally block.

##### Independent qualification gates

Test real distinct maintenance/controller/businessOwner actors, INTRANS/backend/
transaction continuity and complete dynamic settings restoration; wrong target/
role/denied SET and exception/quarantine paths. Execute actual FORCE RLS-hidden
rows to show complete businessOwner capture ONLY inside the approved locked
RLS-off scope, controller-only archive inserts, ordinary metadata/value denial
and final source ENABLE/FORCE/policy restoration. Check ISO,YMD/UTC exact typed
values/bytes, buffer/row/aggregate bounds and no public values/driver collapse.

Exercise real original store absence/reservation/comment+DDL COMMIT, observed
object/type/constraint/index inventory, lost creation acknowledgement, positive
restart confirmation and copied-comment/foreign-store rejection. Test exact
per-table source/plan/ingress/policy/token/capacity/native-name binding, collision,
unknown enrollment COMMIT and no re-ALTER. These are native gates; eight source
controls or self-consistent receipt JSON cannot establish them. Governing three-
document amendment and exact source review precede enablement; .2 G05 upgrades,
online capture and generalized external custody remain separately tracked.


#### G04 signed-capacity and complete capture precision

The maxIssuedInstances default applies ONLY to trusted host construction of an
unsigned G04 policy0.2 BEFORE approval. Its closed wire/signature/receipt ALWAYS
contains the explicit member; missing capacity refuses without normalization.
The1000-row/8MiB limits are PER private batch, not whole-archive/population caps.
Repeat complete protected ID/set witnesses across the aggregate original signed
row/value-byte policy bounds; a single value above8MiB is an explicit first-buffer
resource refusal, never omission/NULL/truncation. This clarifies the adopted
integration without changing its original store/capture/native custody protocol.
Source elaboration integration002 SHA256: b2ff1a1b90f1ff279e65d06442adad5a4dfe45f284dc7d5e45df2c7d4db26f9c.


#### G04 finite native internal-object inventory correction

The earlier complete-custody obligation included implicit objects, but its
closed kind/name shape omitted native TOAST/FK RI objects. Correct the FIRST
UNPUBLISHED creation receipt objects to EXACT
`{classId,objectId,subId,kind,qualifiedName,definitionDigest,parent}`. Add ONLY
toast-table|toast-index|internal-ri-trigger to the prior kind enum. Parent is
required exact object-address or null as specified below. QualifiedName remains
exact schema/name/member; permit pg_toast ONLY for actual parent-bound TOAST
objects, and internal RI member names ONLY on their actual registered relation.
Private-table user/unmanaged triggers remain forbidden; declared native FK RI
triggers are required, not a general extra-trigger exception. No new app table,
source meaning, author callback, arbitrary system-object adoption or native
acceptance is implied. Original006/008 integration is preserved except this
explicit finite created-object correction. Integration003 source SHA256: d319c315a1b50c44eb1777017e1016dd2a18eb65627adf4b6ff687190e2f9786.

##### Finite PostgreSQL-created internal object closure

JSONB/text metadata can create native TOAST objects, and declared FKs create
internal RI triggers. Excluding them would contradict complete native custody.
[PostgreSQL18 TOAST](https://www.postgresql.org/docs/18/storage-toast.html) binds
the actual associated table through pg_class.reltoastrelid; its fixed native
chunk columns and unique chunk index are internal storage, not extra app tables.
[pg_trigger](https://www.postgresql.org/docs/18/catalog-pg-trigger.html) identifies
actual internal constraint triggers through tgisinternal/tgconstraint and native
function/referenced relation/index links. These are source facts, not native
acceptance or permission to admit arbitrary system-named objects.

Every creation-receipt object now has required parent, either null or EXACT
`{classId,objectId,subId}`. Null is allowed only for the store schema. Ordinary
created relations parent the store schema; user columns/constraints/indexes/
row types parent their actual created relation; array type parents its actual
created row type. TOAST table parent is its EXACT owning store relation through
that relation's nonzero reltoastrelid; TOAST index/columns parent their actual
TOAST relation. Internal-ri-trigger parent is its EXACT created FK constraint.
All parent addresses occur in the same finite created-object closure; graph is
acyclic rooted at this store schema, no external parent/adoption. Definition
projections retain all original parent/native dependency facts, not just names.

Only native TOAST relations/indexes/columns proven by that exact closure may
use schema pg_toast. Verify their actual schema/catalog relation kind/owner,
fixed storage/index/column/dependency facts against the pinned PG18.6 constructors;
do not admit pg_toast by prefix or permit arbitrary tables there. Native
reltoastrelid=0 produces NO invented TOAST relation. Auto row/array types are
included only where the actual fixed constructor creates them; relation system
attributes are validated as fixed relation-definition facts, not fabricated
negative-subId user-column entries.

For each declared FK require the COMPLETE exact native-generated RI trigger set
on its referencing/referenced registered relations, tied through actual
pg_constraint and trigger/index/relation OIDs. Verify tgisinternal, tgparentid,
event/enable/deferrability flags, function identity and every argument/condition/
relation/index link against that exact pinned native FK definition; unknown
internal triggers or missing members refuse. Ordinary private-table user triggers
remain forbidden. Builtin pg_catalog RI functions/dependencies are verified
PREEXISTING native dependencies, not falsely reported as new owned functions.
No unqualified function/trigger/class is allowed because a checksum matches.

QualifiedName for an internal RI trigger names its actual parent RELATION schema/
name and member=actual trigger name; parent ADDRESS refers to the FK constraint.
For its creation under the fixed store all participating relations are original
created store relations. Schema/default ACL/full object inventory/privacy and
original external confirmation still apply. No application data, TOAST chunks
or per-value hashes are listed in receipt/catalog objects. Max1024 objects and
1MiB receipt remain conjunctive; overflow refuses, never truncates internals.
This is an explicit correction of the unpublished original kind/name shape,
not permission for another metadata table or general extra-object exemption.


#### G11 original operator root for logical authority trust enrollment

The following acyclic integration supplies the concrete original trust issuer
missing from the separate existing-head logical authority. It adds no physical
effect scope and grants no native qualification. Old physical bootstrap0.1
retains its exact shape and cannot silently acquire logical roots.

##### Chosen acyclic setup and compatibility

Select NEW `umf.local-owner-bootstrap-enrollment/0.2` ONLY for original newly
initialized host setup. It has exactly the existing0.1 members
`{profile,enrollmentId,purpose,context,ownerConfiguration,nativeProfile}` PLUS
`generationAuthorityRoots`. All old members retain their original meanings and
bounds; ownerConfiguration remains its exact six-scope profile. Roots are
installed by the trusted embedding's ORIGINAL operator-managed deployment
configuration boundary BEFORE owner context/physical target creation. They are
public verification keys/policy, never caller plan/native-request supplied keys.
File mode/UID/hash protects custody but is not authenticated policy by itself.
Production setup reads its already operator-enrolled configuration; it cannot
self-enroll a fresh signer because a request or native attestor proposes one.

Roots require NO future database/schema/store/subject/epoch OIDs. After physical
creation, source installation/subject bootstrap and original ingress store
exist, the separately authorized operator signing service approves the COMPLETE
actual logical configuration and native binding through the exact new trust
operation below. This is deliberate sign-AFTER-observation, not inferred trust
from future names/digests. No bootstrap root or native attestor autoapproves its
own observed configuration. An authenticated automation service may sign under
its original policy; no mandatory TTY or fresh human question is imposed.

Bootstrap0.1 remains byte/shape compatible for its existing physical operations.
It has NO logical enrollment roots, so logical trust bootstrap refuses. No .1
file/context rewrite, unsigned companion-key adoption or silent config upgrade.
Enrolling a root into an ALREADY ACTIVE0.1 host requires a separately qualified
original operator trust-upgrade protocol and remains an explicit gap. This first
.2 path works for fresh isolated acceptance and newly enrolled deployments; it
does not purport to solve that older-host upgrade.

##### Exact root seed and signed trust approval

GenerationAuthorityRoots is exactly
`{profile:"umf.generation-authority-root-policy/0.1",authorityId,policyRevision,keys}`.
AuthorityId UUID, policyRevision nonempty NUL-free UTF8<=128bytes, keys1..32
unique exact `{keyId,publicKey,principalId,logicalAuthorityIds,
configurationProfiles}`. Key/principal <=128UTF8 bytes, publicKey strict32byte
canonical unpadded base64url Ed25519. LogicalAuthorityIds is1..256 explicit UUIDs,
no wildcard; allocate these logical IDs before original setup. Profiles is a
unique ordered nonempty subset of the exact literals
`umf.configured-generation-enrollment-authority/0.1` and
`umf.configured-generation-enrollment-authority/0.2`, ONLY when each exact branch
is adopted/implemented by that runtime.
Existing-head0.1 is selected now; G10 fresh0.2 is not enabled merely by allowing
its name. Root policy <=1MiB canonical UTF8. Full bootstrap record <=2MiB.
RootPolicyDigest hashes complete canonical root policy, not its own digest.
Purpose/target bounds are EXACT enclosing original purpose/context/nativeProfile;
no source-test context or acceptance root can confer production trust.

Root scope is ONLY `enroll-generation-authority`, in a NEW distinct domain,
not added to physical owner scopes or the two logical effect scopes. Signed
payload is exactly
`{profile:"umf.generation-authority-trust-approval/0.1",scope,
rootAuthorityId,rootPolicyRevision,keyId,principalId,approvalId,purpose,
bootstrapEnrollmentId,rootPolicyDigest,supervisorId,custodianId,providerId,
installationId,intentDigest}`. Scope literal above. UUID/digest/native-string
bounds follow original contracts, canonical payload <=16384UTF8 bytes. Envelope
exactly `{payload,signature}`; keyId is signed and selects ONLY original root
keys. Signature strict64byte base64url Ed25519. Signing bytes are ASCII
`umf.generation-authority-trust-approval/0.1` then NUL then RFC8785 payload.
Use actual selected standard crypto/version; no new crypto implementation.

Trust intent is exactly
`{profile:"umf.generation-authority-trust-intent/0.1",contextId,trust,
configuration,configurationDigest,nativeEvidenceDigest}`. Configuration is the
FULL adopted closed logical authority configuration, including actual target/
store/subject OIDs/policy/cohort/key restrictions. Digest matches those full
canonical bytes; the source author cannot grant authority through that data.
ContextId is original allocated UUID. Trust is EXACT existing adopted
`umf.generation-authority-trust-enrollment/0.1` statement, retaining ALL its
original members: enrollmentId,ownerBootstrapContextDigest,configurationDigest,
supervisorId,custodianId,providerId,installationId,targetCustodyDigest,
storeCreationReceiptDigest,custodySequence plus profile. No future epoch or
root signature digest occurs in this intent. Intent <=2MiB UTF8, unknown/duplicate
keys, invalid UTF8, floats/boolean IDs and noncanonical encodings refuse.

NativeEvidenceDigest hashes original complete actual native/supervisor/
custodian/store/source/subject observations held privately by the ORIGINAL
fixed native resolver, not supplied JSON data labelled observed. Root signer
receives owned copies of complete configuration/trust/typed evidence for its
authenticated decision. Export exposes no key, native connection or capability.
Signature binds exact intent; root approval cannot authorize another logical
ID/profile/policy/target/context or be used as a physical creation signature.

##### Original registry birth without a context hash cycle

Bootstrap0.2's private context uses NEW profile
`umf.local-owner-bootstrap-context/0.2`. Exact members are
`{profile,enrollmentId,enrollmentRecordDigest,authorityConfigurationDigest,
purpose,context,generationRootPolicyDigest,generationRegistryBirthDigest}`.
The physical owner config is unchanged. EnrollmentRecordDigest hashes the WHOLE
original .2 operator record including roots, not a mutable extra sidecar.
GenerationRegistryBirthDigest hashes the original confirmed birth receipt below.
No context/authority may become usable before its original required journal/
ledger births are durably confirmed. Missing confirmed files after restart
refuse, including lock files; no O_CREAT reconstruction of used history.

Use fixed original control-home paths `generation-authority-registry.json` and
`generation-authority-registry.lock`; no request selects paths. Before creation
reserve birth in the original bootstrap setup journal under its exclusive writer
lease. AnchorDigest is SHA256 of exact
`{enrollmentRecordDigest,authorityConfigurationDigest,generationRootPolicyDigest,
purpose,context}`. It excludes final context/birth digests. Initial registry
header binds this original anchor and original allocated registryId; it does NOT
hash final bootstrap context, so there is no initialization cycle.

Birth receipt exactly
`{profile:"umf.generation-authority-registry-birth/0.1",registryId,anchorDigest,
registryPath,lockPath,initialRegistryDigest,state:"confirmed"}`. Paths are those
fixed canonical original absolute paths; initialRegistryDigest hashes actual
empty registry bytes. Create with original absence/exclusive ownership/private
permissions, atomic writes/fsync and original intent/confirm protocol. Interrupted
FIRST creation may settle ONLY its original pending birth before any request/
export/signature/effect. Once confirmed, missing/rewound registry/lock/context
refuses without fresh identities, empty journal or new approval ID. This is
original bootstrap custody anchored to .2 operator record and actual controlled
realm, not trust-on-first-use from a newly discovered file.

The original bootstrap setup journal records birth intent exactly
`{profile:"umf.generation-authority-registry-birth-intent/0.1",registryId,
anchorDigest,registryPath,lockPath,state:"pending"}` before either file is
created. Its confirmed form adds `initialRegistryDigest` and changes state to
`"confirmed"`; it matches the birth receipt above field for field after excluding
the respective profile fields. The original journal itself retains its already required
operator-root custody and birth protection. A self-hashed newly supplied journal
or matching filesystem owner is never a replacement. No initial registry entry
hashes the final context or the registry's own digest.

Registry format exactly
`{profile:"umf.generation-authority-registry/0.1",registryId,anchorDigest,
sequence,requests,enrollments}`; sequence safe integer0..9007199254740991,
requests<=4096, enrollments<=256, entire canonical file<=8MiB. Every write under
original process+thread writer lock, validated monotonic original append state,
atomic replace/fsync; no truncation/automatic repair. Each request is exactly
`{requestId,enrollmentId,contextId,effectKey,intent,payload,state,
reservedSequence,confirmedSequence,approvalEnvelope}`. State is exactly
`"prepared"|"confirmed"`; prepared requires both confirmedSequence and
approvalEnvelope null; confirmed requires its actual positive sequence and full
verified original envelope. ReservedSequence is the positive sequence of
preparation; confirmedSequence is greater and at most the current registry
sequence. IDs are allocated UUIDs, effectKey is the exact six-element tuple below,
intent and payload are exact closed forms above. No floats, booleans-as-integers,
unknown keys, duplicate request/effect/enrollment/approval IDs or dangling records.
Registry requests retain original immutable intent/payload bytes and reservations;
enrollments retain the exact confirmed form below. Per-request canonical intent <=2MiB, the full entry bounded by the same 8MiB file cap, and total
cap are conjunctive. No promise all count maxima fit. Actual nonrewind custody
and original birth/recovery require native host qualification, not self-hash proof.

##### Concrete setup, confirmation and resolver API

A fixed trusted bootstrap coordinator, ABOVE the concrete native supervisor and
logical verifier, exposes:

```text
prepare_generation_authority_enrollment(original_owner_session,
 original_target_custody,original_ingress_store,configuration,*,rootKeyId)
    -> GenerationAuthorityTrustRequest
export_generation_authority_enrollment(original_request) -> owned signing data
confirm_generation_authority_enrollment(original_request,root_signed_envelope)
    -> OriginalTrustEnrollment
recover_generation_authority_enrollment(original_enrollment_id)
    -> original pending/confirmed outcome
create_generation_authority_session(original_trust_enrollment,
 original_supervisor,original_custodian,original_ingress_store)
    -> configured logical authority with original context
```

RootKeyId selects an eligible key from the ORIGINAL enrolled root policy; it
does not install a key or grant authority. The exact key/principal/root revision
are fixed in the request payload before export. Changing the selector after
preparation requires a distinct properly authorized enrollment, never mutable
request data.

Preparing is not approval. Require exact original physical facade/core/native/
bootstrap association and .2 root context, real opaque target and confirmed
original ingress store/creation receipt. Reobserve actual native target/roles/
source/cohort/settings/privilege closure and original operator policy; reject
unknown shared/external actor paths. The complete .1 logical config must match
those facts. Missing genuine prior logical head refuses existing-head context.
Missing subject/schema/source bootstrap remains an actual prerequisite, not
something this config operation creates. No arbitrary resolver, callback,
Protocol or caller constructed success record is accepted.

Under original registry writer lock allocate request/approvalId, trust enrollmentId
and contextId BEFORE export, one stable effect key
`[enroll-generation-authority,bootstrapEnrollmentId,providerId,installationId,
logicalAuthorityId,logicalPolicyRevision]`. Trust.custodySequence is this original
trust-registry RESERVED sequence, not future native epoch/COMMIT or current DB
head sequence. Repeated same effect reuses original IDs/handles; changed intent
on occupied key refuses. A submitted nonce or new path cannot bypass pending.

Confirmation resolves that exact original request, verifies FULL configured
root signature/purpose/key/principal/logical-ID/profile/root-policy/intent and
same original native objects/live observations again. Consume original approval and append the confirmed request plus its exact
enrollment record in ONE atomic registry replacement under the original writer
lease. This operation has no database mutation: no fictitious cross-store
transaction or native effect is needed. A process-local concrete context is
issued ONLY after durable confirmation. A crash after replacement but before
return reopens that same confirmed entry/context, with no second signature
consumption or new IDs. A crash before replacement leaves the same prepared
request; original observation and valid signature can settle it. An uncertain
write is resolved by reading the original complete registry, never by inferring
success from a staged file or treating missing files as empty. Enrollment
creates NO database schema/role/epoch/head effects; it authorizes the logical
configuration only. Confirmation record exactly
`{profile:"umf.original-generation-authority-enrollment/0.1",enrollmentId,
requestId,contextId,bootstrapEnrollmentId,rootPolicyDigest,rootApprovalDigest,
trust,configuration,configurationDigest,nativeEvidenceDigest,state:"confirmed",
registrySequence}`. RootApprovalDigest hashes the actual signed envelope. Actual
registrySequence is the confirmed original append; trust's earlier reserved
sequence remains unchanged. No self-reference in either digest. Store full
original root/enrollment signature and observation custody privately.

A prepared request is an exact concrete bootstrap-owned object in a private
original registry. Every operation resolves its identity and original stored
immutable request; caller mutations, copies, subclasses, projections, borrowed
constructor seals and approval-shaped data cannot change or substitute it.
Only a fixed coordinator's validated native evidence enters preparation;
bootstrap leaves cannot accept arbitrary native resolver callbacks.

Only THEN issue OriginalTrustEnrollment and original context through bootstrap-
owned exact concrete type/registry. Preserve existing public logical context
projection: trustEnrollmentDigest hashes exact existing trust statement, while
original registry privately retains the validating ROOT envelope/confirmation.
ContextDigest hashes the original adopted projection; it contains no future
native approval/signature. ConfiguredGenerationEnrollmentAuthority must resolve
that original concrete entry/registry/root/confirmed context, never accept an
entry because a supplied hash or projected context matches.

Implement actual `_resolve_generation_authority_enrollment(handle)` and
`_verify_generation_authority_trust(handle)` as FIXED original bootstrap registry
operations. They require same exact concrete issuer/handle registry, original
root record/context/birth/confirmation and signature/configuration/native object
bindings, reobserve actual target/store continuity, and refuse source-test-only
issuers for production. They are not virtual projection hooks or caller callbacks.
Source-test issuer remains permanently acceptance/source-only under separate
exact type/registry; borrowed constructor seal or subclass cannot enroll a root.

The coordinator's native-class validation/orchestration remains above the core/
bootstrap leaves per accepted acyclic boundary split. Bootstrap owns confirmed
context/type/registry; native owns actual observation/target/effect registries;
core owns real crypto/signature/ledger primitives. Private naming alone is not
authority: all public admission paths resolve original fixed registries and
actual signed root plus actual native objects before yielding usable handles.
No hidden function-local import cycle or generic class registration is permitted.

##### Rotation, recovery and qualification

No automatic .1 upgrade, root key replacement, unsigned root sidecar or purpose
conversion. Later logical policy/key revision requires a NEW actual root-signed
exact enrollment, original monotonic registry and ALL earlier effects settled;
retain old public-key/signature/config/context history for readonly settlement.
Root rotation or extension to unadopted config profiles is a distinct original
operator setup policy, not an envelope-injected key or native autoapproval.

Unknown host write/response observes original request/entry/context/BORN state;
never makes a new logical identity after uncertain confirmation. Recovery creates
no missing locks/registry/context, and no native provider effect can start from
source-test fixtures. Actual native-acceptance setup installs its own isolated
.2 root under explicit fixture authority, signs with its fixture operator key,
then executes SAME verification/native provider code; production accepts only
its originally configured production root. No credentials or real signing keys
are requested in chat or portable plans.

Independently exercise .1 unchanged physical compatibility + logical refusal,
.2 early root/no-future-OID setup, actual observed config export/root approval,
wrong key/purpose/root/logical ID/profile/target/source/subject/store receipt,
config mutation/subclass/shared-seal spoof, no always-refusing valid path, writer
races, interrupted birth and NEW-process missing-file refusal, original positive
confirmation/recovery and no duplicate IDs. Then actual native target/store/
head/subject/gate/epoch operations, installed crypto/platform CI and release/
public bytes. Old-host trust upgrade and missing role/schema bootstrap stay
explicit residuals until separately implemented/qualified; source crypto tests
alone cannot close this seam or G11.


#### G11 primary original owner-ledger birth and logical-root composition

This correction supersedes010 context0.2 setup/birth assembly with new exact
context0.3 below, preserving both original enrollment shapes and the late actual
logical-config root signature. It responds to retained actual004 rebinding and
first-birth crash failures; no old context is silently upgraded.

##### Primary record and compatibility

Use the EXISTING fixed `control_home/owner-bootstrap-context.json` as the primary
original setup state with NEW profile `umf.local-owner-bootstrap-context/0.3`.
Do not change the exact original enrollment0.1 or governing010 enrollment0.2
records. Do not silently widen context0.1/0.2 or reinterpret their bytes.

Context0.3 is EXACTLY
`{profile,enrollmentId,enrollmentRecordDigest,authorityConfigurationDigest,
purpose,context,setupId,state,ownerLedger,generationAuthority}`.
The first six fields retain their original enclosing enrollment/config/purpose/
context meanings and bounds. SetupId is a newly allocated canonical UUID fixed
before resource creation. State is exactly `pending` or `confirmed`.

OwnerLedger is EXACTLY `{ledgerId,ledgerPath,lockPath,initialHeaderDigest}`.
LedgerId is an original allocated UUID fixed before initialization. Paths are
original canonical absolute paths, NUL-free UTF8<=4096 bytes, no symlink/reparse
or alias acceptance; lockPath equals ledgerPath plus `.lock` in the same parent.
The original qualified private owned directory/file/permissions/identity rules
remain conjunctive. Configured path cannot overlap the control files, bootstrap
configuration or generation registry. No argument may change the retained path.

InitialHeaderDigest hashes the exact expected EXISTING owner-ledger0.1 canonical
header line, including its terminal LF. Header body is exactly
`{profile:"umf.configured-owner-approval-ledger/0.1",authorityId,
configurationDigest}`, and the existing `digest` hashes the canonical BODY;
canonical complete record plus LF is the expected header. No ledgerId, context
or new meaning is inserted into that historical ledger grammar. The primary
original setup binds ledgerId/path/header; matching a header alone proves no
birth or authority. The lock's admitted initial bytes remain the existing empty
bytes; its actual original custody and required existence are still verified.

For physical enrollment0.1, GenerationAuthority is literal null. Physical owner
operations need no logical root. For enrollment0.2 it is EXACTLY
`{rootPolicyDigest,registryBirth}`, where rootPolicyDigest hashes that complete
original generationAuthorityRoots policy and registryBirth is EXACTLY
`{registryId,anchorDigest,registryPath,lockPath,initialRegistryDigest}` using
010's fixed generation registry paths/header/limits and allocated identity.
The old birth receipt's `profile` and `state:"confirmed"` are derived ONLY after
this primary context is confirmed. No second independent confirmation status is
needed in this primary record. The root policy, registry header and context are
all fixed before physical target creation; no future target/store/subject OIDs.

Compute the generation registry anchor from the exact original enclosing
`{enrollmentRecordDigest,authorityConfigurationDigest,generationRootPolicyDigest,
purpose,context}` as in010. It excludes this primary state, final context digest
and registry digest; no hash cycle. Confirmed OwnerBootstrapContextDigest hashes
the complete confirmed0.3 primary bytes. Those bytes never mutate after any
usable authority is issued. There is no approval/context digest before confirmed
birth; neither header incorporates a future usable context digest.

##### Original installation and one atomic confirmation

The ORIGINAL trusted deployment configuration boundary installs the complete
canonical pending0.3 record together with its original enrollment configuration,
BEFORE any ledger/lock/generation registry or native effect. It allocates the
retained setup/ledger/registry IDs and exact selected paths and expected headers.
This is the same trusted ORIGINAL operator configuration installation boundary
that enrolls the physical public keys/purpose; no request, source/native caller,
filesystem UID, matching JSON/hash, or migration plan can enroll configuration.
Source fixtures explicitly install their own acceptance-only configuration.
Actual production/acceptance deployment-origin qualification remains mandatory.

An ordinary session/issuer/recovery factory NEVER writes a missing primary
context, treats absence as first use, discovers another path or invokes the
operator installer as fallback. Missing primary state refuses even when a caller
supplies a fresh path and all other files are absent. A separate explicit trusted
operator installation is required for FIRST configuration; it is not a reusable
repair API, cannot overwrite an original context, cannot reinstall lost custody
for an enrolled installation, and cannot silently reuse an enrollmentId after
unknown initialization. Configuration restoration/rotation/old-host upgrade
requires its separately authorized original operator protocol and remains open.
This requirement is about actual installation provenance, not a constructor seal
or a new self-hashed file being labelled original.

The original operator installation also creates fixed
`control_home/owner-bootstrap-setup.lock` with exact empty bytes/private original
custody BEFORE publishing pending primary. It is a writer lock, not an authority
record or a replacement birth marker. Runtime opens this existing lock with
NOFOLLOW and no O_CREAT, verifies actual original owned regular single-link
private identity, and takes exclusive flock plus the original per-path process
thread lock. Missing lock refuses in pending and confirmed states.

The fixed bootstrap initialization coordinator reads this original pending
record under that original exclusive setup lease. Lock order is setup lease,
owner ledger initialization lock, then generation registry initialization lock.
No ordinary request takes the setup lease while holding a ledger lock; confirmed
primary bytes are immutable and read/validated without mutating them. Two setup
processes reread primary under the same lease before acting or returning.
The lease remains held through resource verification, atomic confirmation and
its durable positive observation. It admits only its exact same setup/ledger/registry paths/IDs,
complete config/root/purpose and private original file identities. Before any
file creation, the pending primary bytes and parent directory are durable. No
usable OwnerAuthorityContext, approval request, native supervisor/session or
logical trust request is issued during this pending state.

Initialize the exact owner lock/header, and for enrollment0.2 the exact generation
registry lock/initial header. Each uses original exclusive creation, nofollow,
private permissions, bounded reads, actual write/fsync and parent fsync. Reopen
and verify ALL required exact original initial resource bytes and identities.
Then atomically replace ONLY the same primary pending record with the exact
same record except state=`confirmed`; fsync replacement and parent BEFORE
issuing usable objects. This ONE primary transition is the only birth commit.
There is no confirmed-anchor then pending-birth state in the new protocol.

The former owner-approval-ledger-birth.json and anchor.json are no longer sources
of authority for0.3. Neither their absence nor matching contents can change the
primary binding. Do not silently delete, reconstruct, upgrade from or adopt
old state through them. Exact old profile evidence remains archived. Existing
context0.1/0.2 and actual deployed ledger upgrade are explicitly unqualified;
the new native session path refuses them before effects until a separate
qualified upgrade exists. A fresh enrollment0.1 file can be paired with a new
ORIGINALLY installed0.3 state; its enrollment bytes remain exact.

##### Positive recovery and refusal

Recovery has only these original setup states:

| Original primary | Actual resources | Result |
| --- | --- | --- |
| missing, invalid or changed identity/binding | any | Refuse; never create primary/resources or choose a new path |
| pending | no resources yet | Initialize ONLY original paths/IDs and expected bytes |
| pending | lock-only, newly empty ledger, or exact expected initial-header prefix | Under original exclusive initialization custody, finish ONLY remaining expected initialization bytes; retain existing same original lock/file, no truncation or new IDs |
| pending | complete exact initial owner header and any required generation registry | Verify original bytes/custody, finish other original resources if needed, atomically confirm SAME primary |
| pending | any effect record, foreign/torn non-prefix bytes, changed identity/path/config/root or unexpected object | Refuse; no replay, truncation or adoption |
| confirmed | all exact original required resources exist | Validate original full ledgers/registry continuity; issue fixed original process-local capabilities/context |
| confirmed | any ledger/lock/context/required generation registry missing, rewound or conflicting | Refuse without O_CREAT or automatic repair |

Expected-prefix completion is ONLY for the pending original initial owner
header, before any request/effect, bounded by its exact expected bytes. It is
not general torn-history repair. Generation registry uses its original bounded
atomic initialization and exact initial bytes; a staged temp file is never a
committed registry. Any resource identity that original custody cannot establish
refuses. Do not infer original continuity from equal hashes or PID/UID alone.

Crash before pending installation is a deployment setup outcome to settle through
that ORIGINAL operator boundary, not a library first-use inference. Crash after
pending durability resumes the SAME IDs/path; crash after header fsync before
primary confirmation positively confirms the same initialized resources. Crash
after confirmed replacement but before return reopens the same confirmed state.
Unknown replacement must observe original durable primary before yielding a
capability. Final context/issuer identity and all earlier effect records remain
stable across process restart. No native role/database DDL occurs in this setup.

##### Concrete integration and qualification

The fixed deployment boundary installs the original configuration; the public
runtime entry remains `create_owner_authority_session(profile,*,ledger_path)`.
It loads/requires original0.3 setup, checks the argument equals the pinned path,
settles exact pending initialization if present, reopens confirmed bytes and
ONLY THEN issues original issuer/context/core/native pair. The supervisor's
concrete constructor independently verifies that exact confirmed setup and the
same core ledger path; bypassing the facade cannot skip original birth checks.
Pure configured crypto objects remain non-native and confer no session capability.
Native effect dispatch still needs the SAME real approval/core pending handle,
original native reservation and receipt/outcome resolver. No generic callback,
virtual origin claim or lazy import back-edge is introduced.

Governing010 logical trust setup composes with0.3, using its confirmed enclosing
record/config/root/registry birth. Its late actual-config root signature and
one-registry trust-confirmation protocol remain exact. Existing-head logical0.1
and future fresh logical0.2 selection, original six physical/two logical scopes,
original key/purpose and native source/role/store facts are unchanged.

Retain and rerun the original seven boundary controls plus BOTH actual004
failures. Add new-process and actual two-writer controls for every initial
write/fsync/replace/return boundary, missing both old sidecars, missing primary,
new path, lock-only/empty/header-prefix, wrong prefix, unexpected effect records,
confirmed missing files, original same-path positive recovery and constructor
bypass refusal. Use real crypto and original files, attributing synthetic native
observations accurately. Then independently qualify actual deployment-origin,
process/provider/native effects, installed/platform/browser and release/public
bytes. Passing source fixtures alone cannot close G11 or original root setup.


#### G11 concrete original root registry and continued context custody

This correction makes010/011 root registry birth/current validation concrete
after actual005 rejection. It preserves exact old owner-ledger and logical
context-journal protocols, full original root/native authority and existing
physical/logical scopes. No source/native qualification follows.

##### Exact registry bytes and continuity

The original fixed generation-authority-registry.json contains canonical UTF8
JSON with NO terminal LF, BOM, whitespace or duplicate/unknown members. Initial
bytes are EXACT canonical
`{profile:"umf.generation-authority-registry/0.1",registryId,anchorDigest,
sequence:0,requests:[],enrollments:[]}` using010/011's original UUID/anchor.
Primary context0.3 initialRegistryDigest hashes that complete zero-state object.
The initializer must create those exact bytes, not an empty file or JSONL. Its
existing fixed original lock contains empty bytes and retains original custody.

Later current registry bytes naturally differ. Verify profile/registryId/anchor
against original confirmed context0.3, recompute the SAME expected zero-state
object/digest, then validate the COMPLETE current closed record, original
requests/entries/signatures/sequence/history/custody. Never compare the full
current registry hash to its birth digest or accept arbitrary later bytes. The
primary context remains immutable. A matching header/hash is not deployment
origin, nonrewind proof or native observation. Actual original host/custodian
continuity remains independently qualified; backup/restore/lookalike adoption
is never inferred from these hashes.

Use EXACT010 request and confirmed enrollment shapes, signatures, intents,
key selection, IDs, scope/effect keys and caps. Sequence is a safe integer and
equals the total number of retained reservations plus confirmations. The set of
all request reservedSequence and non-null confirmedSequence values is exactly
1..sequence, with no gaps/duplicates; each confirmation is later than its own
reservation. Requests remain ordered by reservation sequence, enrollments by
confirmation sequence. Confirmed entries bijectively match confirmed requests
and their actual registrySequence, exact IDs/context/trust/config/evidence/root
approval digest; prepared requests have no enrollment entry/envelope/confirmation
sequence. Unique request, approval, enrollment and effect identities are checked
across ALL retained entries, not just the selected request.

Only these changes are legal: append one new immutable prepared request at the
next sequence; or atomically change its state/confirmedSequence/approvalEnvelope
from prepared to confirmed and append its exact enrollment at the next sequence.
All prior ID/intent/payload/config/effect/key/purpose/root/binding bytes remain
exact; no deleting, reordering, remapping or reinterpreting old entries. Same
occupied effect+same exact intent reuses original IDs/outcome; different intent
refuses. Confirmation verifies the configured original root signature and all
cross-links; readonly recovery re-verifies it, never merely its digest. No
confirmation of an unreserved request or envelope injected after denial.

Every read/append/confirm/recover verifies full shape and bounds. Existing
4096 requests/256 enrollments/8MiB file/2MiB intent limits remain conjunctive;
all capacities are preflighted BEFORE modifying the original registry. Atomic
replacement/fsync/parent fsync and positive original observation precede usable
handles. An uncertain replacement settles only its original prepared/confirmed
record. Missing confirmed registry/lock/context refuses without O_CREAT, repair,
new IDs or an alternate path. Source fixtures cannot establish production origin.

##### Concrete acyclic ownership and cryptography

Use dedicated native-free `lifecycle/generation_authority_bootstrap.py` for the
ROOT registry/parser, original root trust requests/confirmations and fixed
bootstrap trust/context issuer registry. The concrete root verifier is EXACT
`ConfiguredGenerationAuthorityRootVerifier.verify_approval` in that module.
It verifies ONLY010's original root trust approval/domain/config policy through
an original registered request, independently configured root key/purpose and
retained original0.3 context; no generic sign/verify callback or caller keys.

Authorize an additional narrowly scoped lazy ImportFrom exception ONLY at that
module-top-level class and its exact method, for cryptography.__version__,
cryptography.exceptions.InvalidSignature and Ed25519PublicKey from its exact
asymmetric.ed25519 module. Keep the actual50.0.2 version guard. The existing two
logical/physical verifier exceptions remain exact. Reject extra class/function
ancestors, eager/wrong-function/wrong-module/wrong-symbol imports and borrowed
same-name nested classes. No package/layer blanket exception or new dependency.

Place original context/trust types in the bootstrap leaf with identity-preserving
aliases from existing generation_enrollment_authority; original registries and
source-test issuer purpose rules remain actual SAME objects. Their existing
context journal and logical approval ledger must remain DISTINCT protocols from
ROOT registry0.1. A native-free generation_enrollment_ledger leaf may hold the
EXISTING logical ledger/replay/pure wire helpers needed by both bootstrap context
and ConfiguredGenerationEnrollmentAuthority; it must not import bootstrap/core/
facade/native. No importing the logical authority back into bootstrap to reach
its ledger. Freeze and independently review exact moves/aliases/dependency map
before adoption. If the code map differs, resolve it explicitly against these
acyclic/origin/identity requirements, not with a hidden lazy import or registrar.

Use fixed `lifecycle/generation_authority_session.py` above the initial authority,
bootstrap and actual native supervisor/custodian/store for public orchestration.
It implements010 prepare/export/confirm/recover/create-session using actual
original owner session, target/store/custody, source/head/subjects/cohort and
original native observations. Leaf root crypto/records prove a signed policy,
not native origin. No copied observation dictionary, resolver callback, caller
class/seal or signed receipt alone can replace original native capability checks.
Final native dispatch independently checks actual original association/target/
store/config and its existing logical approval/native reservation/outcome rules.

Acquire original native custodian/exclusion lease BEFORE root-registry writer
lock when preparation/confirmation needs native continuity. Hold that native
lease through actual observation and registry confirmation. Do not call out to
arbitrary/native callbacks under registry lock. Release root registry lock before
issuing/settling separate logical context/approval journal births. No reverse
registry-to-native-lease acquisition or registry-to-context-journal lock nesting.
Original setup initialization retains011's setup→owner→root lock order. Ordinary
readonly trust validation never mutates primary bootstrap state or restores locks.

All six physical and two existing-head logical effect scopes remain unchanged.
Future fresh logical0.2 still requires its separate G10 adoption. Root setup adds
only the already adopted enroll-generation-authority operation. Root key/policy
rotation, old active-host setup upgrade and absent subject/schema bootstrap stay
explicit separate gaps; do not weaken original history/native correspondence.

##### Independent qualification

Retain005's actual structured-initial-record refusal, full-current-equals-birth
blocker, descriptor-leak and nested-class checker failures. Close those exact
cases. Use exact registered real root key/signature and actual original request
for prepare/export/confirm/restart/session; exercise full closed prepared and
confirmed states, root key/purpose/scope/config/native-binding mismatch,
immutable request mutation, duplicate ID/effect/signature, capacities, two writers,
crash/fsync/return boundaries and positive same-request recovery. Show that a
confirmed root enrollment legitimately changes the registry and that subsequent
owner/logical sessions still validate full original state. Preserve the separate
logical context journal and its missing-file/birth/history controls.

Repair setup/resource lease descriptor cleanup for every refusal path, not only
OSError. Keep both original004 owner-only invariants and exact exception/registry
alias identity. Then actual qualified original deployment/native target/store/
head/subject/gate/epoch/provider/restart, installed/platform/browser/CI and final
public bytes are separate required gates. Full source tests do not close G11.


#### G11 ROOT confirmation establishes original logical birth before usability

This correction clarifies010/012 ordering without adding record members or
changing the six physical/two existing-head logical effect scopes. Production
ROOT confirmation independently commits prior original logical context/ledger
birth; missing subordinate history is never interpreted as fresh first use.

##### Capability and method separation

The map's acyclic move/alias ownership is accepted with the following required
implementation semantics. Bootstrap owns original signed ROOT records and
logical context/history, not actual native origin. The logical authority's
constructor may use a fixed readonly durable-context resolver; it grants no
native session/effect capability. The upper generation_authority_session must
verify exact actual supervisor/custodian/store/target/config association and
fresh observations before each production operation. Final native dispatch
independently enforces that same original association and actual reservation/
outcome. Copied observations or a pure crypto/context object cannot bypass it.

Production `_issue_original_trust_entry` may remain a fail-closed legacy helper,
but a REAL root-confirmation path must issue/register its exact original entry;
retaining only that stub is incomplete. Bootstrap accepts only an original
registered root request/verified root approval and durably confirmed record,
never an entry constructed from a supplied dictionary or generic registrar.

For actual root-backed production context, contextId is the exact signed
ROOT intent/confirmed enrollment contextId. Trust.enrollmentId remains its own
exact signed identity; do not silently equate those distinct fields as the
older source-test allocation did. Source-test-only contexts retain their exact
acceptance-only origin/identity rules and cannot enter production session paths.

##### Independent birth state and ordering

ROOT `confirmed` must imply that the original logical context journal/ledger
birth is ALREADY complete. If root confirmation preceded logical birth, loss of
all subordinate birth files could be misread as first use despite prior effects.
Therefore use this exact ordering under the SAME original native/custodian
exclusive lease, obeyed by every production context-birth writer:

1. Verify original native association/current facts, actual root signature and
   registered prepared ROOT request. Briefly lock ROOT, validate exact current
   request/slot/policy/history, then release ROOT lock. No usable context exists.
2. Initialize/settle ONLY that original logical context journal/approval-ledger
   birth under their existing locks. ROOT still says prepared. Return only a
   private original birth result, never a usable context/native capability.
3. Close context/ledger locks. Reacquire ROOT lock under the still-held original
   native/custodian lease, revalidate SAME request/signature/policy/native
   continuity and original birth result, atomically confirm ROOT, fsync and
   positively observe its original outcome. No ROOT-to-context lock nesting.
4. Release ROOT lock. Readonly resolve existing original logical birth and issue
   the process-local context/entry through fixed original registries. No second
   birth or changed IDs/path after confirmation or a lost return.

The positive birth result is an exact private registry-owned object tied to the
same original prepared ROOT request, context/config/trust, derived path/IDs and
verified durable context/ledger records. It is not a caller observation mapping,
callback or a digest-only certificate. The coordinator's retained lease excludes
all other production birth writers during this check/confirm gap. Actual host/
filesystem/native continuity must be qualified; hashes alone do not establish it.

##### Fixed paths, IDs and recovery

For newly implemented ROOT-backed production contexts ONLY, derive the logical
approval path as original control_home plus `generation-approvals-` + exact
contextId + `.jsonl`; its lock is that path plus `.lock`. Keep the existing
logical context-registry0.2 filename and per-context birth-marker derivation.
No caller selects another ledger path or adopts existing unrelated files.

Allocate stable logical enrollment and initial-epoch UUIDs with UUIDv5 under
UUID.NAMESPACE_URL. Names are respectively literal
`umf.generation-enrollment-identity/0.1` and
`umf.generation-enrollment-initial-epoch/0.1`, followed by one NUL and canonical
JSON `{registryId,contextId}` from the original ROOT request/registry. These are
public identities, not credentials. Actual initial preparation signatures bind
them later. Existing source-test or historical journal IDs are not rewritten.
The new unpublished ROOT-backed profile requires this explicit derivation; no
previously qualified root-context upgrade is claimed.

ROOT prepared may settle only its exact original pre-capability initialization.
No logical request/effect is allowed before ROOT confirmed. Root-confirmed entry
with a missing context journal, its lock, birth marker, ledger or ledger lock
REFUSES without O_CREAT, reserve_context fallback, new identity or path. Recovery
of a confirmed root entry is readonly and returns the SAME existing IDs/context.
If any ROOT enrollment was confirmed, the shared logical context journal/lock
must already exist; a new prepared request cannot recreate that shared history.
Every confirmed entry must have matching complete original subordinate birth.
Pending subordinate records may belong only to an original prepared ROOT
request. Any effect history under an unconfirmed ROOT request is inconsistent
and refuses, not a permission to erase or adopt it. Missing/uncertain original
ROOT state remains unknown/fenced; no prepared-state label grants backup restore
or general torn-history repair.

A crash after subordinate birth but before ROOT confirmation resumes the SAME
request and derived IDs, verifying the exact original files before confirmation.
A crash after ROOT confirmation but before return performs readonly recovery.
No cross-file atomic transaction is claimed: prepared root state reserves and
fences the partial filesystem work; the one ROOT confirmation makes completed
birth usable. It creates no database schema/roles/epoch/head effects.

##### Physical boundary, aliases and tests

Physical owner_bootstrap may import ONLY the fixed ROOT initial-record codec
and complete current-record validation functions from the native-free generation
bootstrap leaf when composing context0.3 resources. Those functions return bytes
or validation success, never physical/native authority. The generation leaf has
NO reverse import into physical owner/core/facade/native. Any ROOT lock is
released before subordinate context/ledger validation locks. All physical
classes/errors/registries remain distinct and identity-preserving; no generation
leaf creates physical OwnerAuthorityContext.

Preserve the map's one concrete issuer and exact object aliases across old/new
module paths. Move actual supervisor lookup/observation calls above the leaves;
new actual native hooks must be implemented and exercised, not merely named.
The source-test factory remains bootstrap-local and permanently nonproduction.

Independent controls must cover distinct root contextId/trust enrollmentId,
confirmed root plus loss of ALL subordinate birth/history files, positive
prepared-root interruption at every birth/ROOT replace/return boundary, same
IDs/path and no effects/reinstall, shared-journal loss with other confirmed root
entries, two writers, purpose/registry/alias identity and final-native freshness
refusal. Retain actual003–005 failures and source-only qualification; original
deployment, installed/native/platform/browser/release gates remain mandatory.


#### G04 explicit original store-creation custody and supervisor journals

The following exact internal protocol implements the previously adopted external
store reservation/native COMMENT receipt without inferring state from unused
supervisor booleans. It adds no physical signature scope or SQL callback. New
fresh journal0.2 profiles preserve old0.1 bytes/replay and refuse implicit upgrade.

##### Version and original custody

Use NEW `umf.local-target-custody-journal/0.2` and
`umf.local-postgresql-supervisor-journal/0.2` for ORIGINAL newly enrolled targets
that admit this store-creation capability. Keep original0.1 serialized bytes,
event meanings and readonly legacy replay exact. No implicit active0.1 upgrade,
copy/name adoption or new store effects through old unused boolean store tags.
Original journal birth/profile/path/chain is bound by the qualified original
native owner/controller realm before use; a new header/self-hash/UID is not origin.
This branch admits only originals-store profiles already separately adopted and
qualified for scope4 (originals0.1 and G05 lifecycle0.2); prospective G10 inventory
store requires its OWN explicit tuple/renderer admission. It does not reinterpret
the separate ingress-store marker or its creation receipt/authority.
The original physical enrollment/context and six owner scopes remain exact.
Old target journal upgrade remains explicitly unqualified.

Both0.2 envelopes/previousDigest/recordDigest rules retain their original fixed
journal forms and original native independent-chain verification. Add ONLY the
closed events below. Every new mutation holds the SAME original target/custodian
exclusive writer lease; old0.1 writers cannot mutate this0.2 stream. Snapshot,
fresh original native observation and append occur under that lease; acquire
actual native/custodian lease BEFORE either journal append lock and release each
append lock before another journal/native SQL operation. No two-journal atomic
commit is claimed. Existing4096-event/8MiB caps, safe integer sequence/canonical
bounds and stricter target limits remain conjunctive; preflight before effects.

Store key is exact `[targetCustody.registrationId,providerId,installationId,
store.profile,store.storeId,store.schemaName]`. Match complete tuples, including
original target incarnation/custody in every operation. Keep all store entries
and histories; no single latest-store slot or per-profile digest substitution.
At most256 distinct store keys and all original fixed descriptor/profile limits.
Any different original request/approval/target/config/purpose for an occupied
key refuses. Same original bytes reuse SAME reservation/IDs/outcome.

##### Exact external events

The existing reservation wire stays EXACTLY adopted
`{profile:"umf.row-originals-store-reservation/0.1",reservationId,providerId,
installationId,targetCustody,store,creationRequestDigest,creationApprovalDigest,
nativeAuthorityEvidenceDigest,configurationDigest,custodySequence}`.
CustodySequence equals its original reserved-event sequence, not a future confirm.
All existing typed descriptor/native evidence/UUID/digest/limit rules apply.

New event `originals-store-reserved` payload EXACTLY
`{purpose,request,approvalDigest,reservation,reservationDigest,parent}`.
Purpose original production|native-acceptance. Request is the COMPLETE canonical
signed native-store-creation INTENT, resolved from original verified scope4
request/approval/context, not a caller dictionary. ApprovalDigest is its actual
verified owner-envelope digest. Reservation exact above; reservationDigest hashes
complete reservation. Parent EXACT `{sequence,headDigest}` identifies the current
original journal before append: sequence=event.sequence-1 and
headDigest=event.previousDigest. Request/profile/store/native authority/config/
purpose/target all recompute and match original reservation. Full actual owner
request/envelope/typed native evidence remain private original custody.

New event `originals-store-observation` payload EXACTLY
`{purpose,reservationId,reservationDigest,supervisorIntentDigest,outcome,
nativeReceipt,nativeReceiptDigest,schemaOid,nativeObservationDigest,
transactionOutcomeDigest,parent}`.
Outcome EXACT committed|known-aborted|unknown. Parent exact preappend chain ref.
For committed, nativeReceipt is the COMPLETE adopted tagged creation-receipt
record observed from SAME original schema COMMENT/catalog after actual positive
COMMIT, nativeReceiptDigest its canonical digest, schemaOid its actual uint32.
For known-aborted/unknown those three fields are null. NativeObservationDigest
and transactionOutcomeDigest identify complete ACTUAL original private native
observation and commit/noncommit/unknown evidence, never JSON authority. Purpose,
reservation/intent/target/receipt/source/config facts must all correspond.
Receipt<=1MiB, no private source/keys/values in the public COMMENT. Full original
observation/evidence/connection/transaction identities remain privately retained.

New event `originals-store-confirmed` payload EXACTLY
`{purpose,reservationId,reservationDigest,supervisorIntentDigest,
observationEventDigest,nativeReceiptDigest,schemaOid}`.
It refers to the selected original committed observation EVENT digest, not its
own digest. All fields match that reserved/observed store. No confirmation can
be written from unknown/known-aborted, missing original native outcome, receipt
hash alone or namespace presence. Repeated confirmation resolves original event
and appends nothing. External confirmation data is never put into its own native
receipt/comment or original pre-DDL reservation.

Replay adds a `stores` collection to internal derived state only (not a journal
wire member). Each key retains original request/reservation and status reserved|
observed-committed|confirmed, plus original observations. Known-aborted/unknown
observations keep it reserved and original slot occupied. Once committed was
observed, no regression/changed receipt/schema identity is legal; only matching
fresh verification and confirmation. Subsequent readonly recovery validates fresh
actual native continuity without appending a new store observation/confirmation.
Existing target registration must be confirmed before reservation. Any pending/
unknown epoch/transition or another conflicting original store operation refuses
until settled. A pending store birth blocks conflicting provision/transition/
store dispatch; it cannot be overwritten by old registration/provision replay.

##### Exact supervisor events and owner-core relation

Do not reinterpret unused0.1 store-creation-intent/confirmed boolean flags.
Supervisor0.2 adds `originals-store-creation-intent` EXACT payload
`{purpose,reservation,reservationDigest,custodianReservedEventDigest,
creationRequestDigest,creationApprovalDigest,nativeAuthorityEvidenceDigest}`.
It retains the COMPLETE original reservation; hashes/tuple/actual purpose/core
request match the actual already durable external event. Immediately after this typed store intent, append/resolve the EXISTING generic
`native-effect-intent` for the SAME original signed scope4 request/approval. Its
previousDigest must equal this typed store-intent EVENT digest; no unrelated
event may interleave between them. Its existing native reservationId and full
request/approval/purpose/payload binding remain unchanged. Owner core binds the
GENERIC native-effect-intent event digest, as its existing native reservation
requires, BEFORE DDL. In all observation/confirmation payloads above/below,
supervisorIntentDigest means THAT generic native-effect-intent digest, not a
second owner binding to the typed store event. Verify its exact typed predecessor
and external reservation at every resolve/recovery. It must be the SAME core/
context/request/approval/native reservation and pending-effect handle, not an
independent store permission. Never allocate another generic reservation when
recovering an existing matching pair.

Supervisor0.2 adds `originals-store-creation-confirmed` EXACT payload
`{purpose,reservationDigest,supervisorIntentDigest,custodianConfirmationDigest,
nativeReceiptDigest,schemaOid}`. CustodianConfirmationDigest is the actual prior
external confirmed EVENT digest. Reobserve exact original committed schema/
COMMENT/catalog and original external reservation/confirmation before append.
No schema OID or native receipt is guessed before DDL; no own-event digest occurs.

Then append/resolve the EXISTING generic native-effect-confirmed event and its
actual original registered native outcome for the SAME scope4 reservation and
nativeReceiptDigest. Its original payload/receipt semantics remain exact. Only
then may the physical owner facade finish its SAME owner ledger pending effect.
Only after all original positive external/supervisor/native/core correspondence
may the fixed original store issuer register/release the provider's opaque
creation capability. No standalone typed event, COMMENT or owner signature alone
creates that capability. All intermediate confirmations are independently
reconciled, never inferred atomic across files/DB.

##### Native order, failures and recovery

Fixed flow: actual original typed authority/absence checks -> external reserve
-> typed supervisor intent -> existing generic native-effect intent/owner-core pending binding -> SAME native transaction
fixed DDL+complete creation receipt COMMENT -> positive COMMIT/fresh original
schema+full footprint observation -> external observation+confirmation -> typed
supervisor confirmation -> generic original native-effect confirmation -> SAME
owner-ledger finish -> opaque store capability. Keep original privileged-DDL
exclusion, complete role/ACL/default/dependency/TOAST/RI/session/catalog checks.
No callback, user cursor or supplied object list selects DDL or observed evidence.

Only the fixed original supervisor/facade coordinator exposes production store
creation/recovery. Its custodian reserve/observe/confirm entrypoints require
original registered target, actual scope4 core request/approval and the fixed
original native observation/outcome resolver. Do not add a caller callback,
structural success object, arbitrary adapter registrar or from-dict capability.
Freeze exact source type/registry/adapter methods and acyclic imports before
implementation adoption; custodian must not import its native consumer back.
The actual missing native resolver must be implemented, not an always-refusing
stub or a method-name check. Public data projections never mint original handles.

Known-aborted is a TRANSACTION ATTEMPT observation, not terminal cancellation of
the whole original scope4 store operation. Keep the same original reservation,
supervisor intent, core pending binding and IDs. Retry only after positive
original noncommit proof AND fresh complete actual original absence/authority,
under remaining original qualified native/host budgets; no new request/budget
or speculative rerun. Do not write a terminal native-effect-aborted/core-aborted
outcome merely to retry it. Unknown is occupied/fenced; absence alone proves
neither abort nor permission to retry. Unqualified noncommit or exhausted bounds
refuse further effects and remain an explicit original recovery outcome.

| Durable gap | Required continuation |
| --- | --- |
| External reservation, no supervisor intent | Revalidate same original bytes/authority/absence, append only matching original intent, no new reservation |
| Intent/core pending, native COMMIT unknown | Observe original transaction/schema COMMENT/full native receipt/custody; unknown stays fenced; no DDL replay |
| Native committed, external pending | Reobserve original committed exact footprint+receipt and positive COMMIT proof, append only matching observation/confirmation |
| External confirmed, typed supervisor confirm missing | Reverify same native/external outcome, append only matching typed confirmation |
| Typed supervisor confirmed, generic native/core pending | Reconstruct only same original registered native reservation/outcome and append/finish missing SAME confirmations, no DDL |
| Generic native confirmed, owner core pending | Settle SAME original owner ledger from actual matching registered outcome; do not execute store creation |
| All confirmed, response/capability lost | Readonly original state/native continuity verification and reissue only same original opaque capability, no IDs/DDL/store journal append |
| Any conflicting/missing/rewound/copied native/external/core/receipt/target state | Refuse/fence; no namespace adoption, DROP/recreate, history repair or replacement intent |

Later allowed provider objects have their OWN original archive/identity/lifecycle
births and current full closure. Initial COMMENT/receipt stays exact; reissue
checks initial original footprint plus positively registered current additions,
never requires entire current catalog to equal initial empty-store bytes or
waives unknown extras. No creation capability may be released from a partial
initial confirmation. An original committed schema later missing/drifted is not
an aborted first creation and cannot be recreated through this protocol.

##### Independent gates and retained limits

Tests must use original real owner signatures/core pending handles, exact new
journal profiles and state validation, every inter-journal/COMMIT/return crash
point, same original positive resumed outcome, known-abort vs unknown, original
native receipt/schema identity, two creators/writers and conflicting epoch/other
store operations. Prove no generic-native/core confirmation can precede actual
external commit confirmation, and no terminal owner-abort is silently reused.
Retain original legacy0.1 wire/replay negatives, forged typed records/digests/
callbacks/constructor seals, capacities and actual external/native chain restore
refusal. Qualify actual PG18.6 original actor/COMMENT/DDL/TOAST/RI/ACL/transaction/
COMMIT/restart and installed driver/provider/platform/browser/release separately.
Old target journal upgrade, provider/store migration, unknown managed/external
custody and broader data-loss/recovery compositions remain explicitly tracked.


## MIG-G10 full phase-aware inventory design adoption 001

This amendment adopts the exact reviewed successor006 inventory definition set
as REQUIRED design for CONTRACT-081/TD-085/STP-085. It does not claim implemented
support, issue authority or relax any original native/installed/release gate.
The reviewed source manifest is
`86ef804046e88edc90021a52d879f0e6bd13a8257322365bc9c9ba0611f9ffc8`;
independent design review is
`c04707129131fee777f736c68202a954c419427a7dd7af12b9dfd0bb903adcec`.
The existing artifact frontmatter, IDs and complete prior bytes are retained.

The complete exact definition set is retained under
`docs/helix/04-build/evidence/schema-migration-design-review/g10-contract-001/definitions/`
and each complete file is hash-pinned in that folder's parent manifest. These
are project design elaborations, not a copied methodology catalog. Within the
scope of this amendment their exact records/DDL/compatibility/ordering/recovery
rules are normative requirements; reviewed proposal status prose remains
historical provenance, not an implementation claim. No omission from the
excerpt below removes a definition-set requirement.

Precedence: successor006 campaign-grant-accounting closes ambiguous005 charge
prose; ordinary-decision-custody replaces004 denial-only private reservation
profiles for BOTH decisions. The004 negative native observation/outcome/return
shapes remain exact. Original approved-only ApprovalReceipt.verify remains
unchanged; genuine denied protected-row/native verification is separate.
Old protocol variants remain exact and refuse unadmitted new profiles. No later
G11 context/native interface is implicitly adopted by these006 source pins.

Full scope includes create/remove/unequal/mixed/empty inventories in initial
and installed modes; complete typed dependency/atomic phase semantics, actual
execution-aware seed lineage, exact metadata/publication/reference and signed
full component/session/provider policies, initial prospective approval ordering,
one original approved/denied decision journal and same-provider campaign grant
allocation, exact carrier retirement branch, and all88 planned acceptance rows.
Do not replace this scope with create-only implementation or safe refusals.
Immediate irreversible table removal is the explicitly disclosed first subset;
retained whole-table archive/restore/separate purge and old enrolled-store
migration remain REQUIRED backlog work, not silently completed by G05 Field
archives or by this adoption.

Concrete enablement remains gated on original schema/stable-subject bootstrap,
genuine authenticated review adapter, actually admitted durable fixed provider
records and same-store atomic CAS, native timers/original continuity/COMMIT and
positive restarted recovery, complete Weft/compiler/session/identity/retention
composition and initial/existing/mixed/empty native acceptance. Old-context/store
upgrade, retained-table recovery, installed/browser/platform/CI/release and
published-byte verification remain explicitly OPEN. Full G02–G11 goal remains
open; design controls do not replace actual implementation/native evidence.

The normative definition closure is EXACT:

- `contract-proposal.md`: SHA256 `cee0d04ee72da46062c6814efa1c0235e5c087da82593128f9d766f65c05324a`.
- `technical-design.md`: SHA256 `ebf07de7179646ab37be3c6e3f9d17525ba958263f2886e1b5804f48f0ad6879`.
- `acceptance-matrix.md`: SHA256 `cb95e725cb8b0b70309c9449c1fbc0c0e4200b15d8d59bff710fa0e9348a306c`.
- `seed-lineage.md`: SHA256 `ab3c044cf055b1ced97a388809be440ae1afab4710514edd27e4d05ecfa0c584`.
- `fresh-authority.md`: SHA256 `b69024641bf4bdf94a8e92dcc3743570aa1c9dd9ab21d09c95c4120194a88763`.
- `native-metadata.md`: SHA256 `ed069da88e3aa319b28f8b5bfb070234b6c9a35c607556a0949e772a4c86df51`.
- `native-metadata.sql`: SHA256 `5e8131eda95636d476d0d0c0d3540caff22ff117f133d91a9dd39fe111337109`.
- `metadata-definition.json`: SHA256 `e263e852cf57a160a49a66c4bcff713babbbe4af95aea3e3523f22b8a4d40e05`.
- `metadata-definition-digest.txt`: SHA256 `484dd467482c2123502a0524c67cda573b0e0cd31c980ef934ea22d8d8c041c0`.
- `step-branches.md`: SHA256 `63dabcde5a10ff3b18148211c8a24fcd80add264580542cb389fa5b52705c11e`.
- `component-policies.md`: SHA256 `a1c12960c43921644cf9ff055b7af306f25a55116c1d4ce26d5aabcbaae778f4`.
- `native-inventory-branches.md`: SHA256 `2e1b2de6f378ad8af4b101500e93576bb9ba89209c93947bccc89732cea40782`.
- `initial-approval-ordering.md`: SHA256 `166585d47845f07fe646163d300134b91bfc6cb380635e96fe27f2c652b878cd`.
- `denied-approval-recovery.md`: SHA256 `a8811dce246636fd88b65214e19d291ae4ed8a02cb1fa46106ab0396af3e9128`.
- `ordinary-decision-custody.md`: SHA256 `4efd6fe87b2b41bf0a6410c76e4ba78c9f4edbb240892d9aa90ba0505674cd4a`.
- `campaign-grant-accounting.md`: SHA256 `a4b3759604c4fb77fe3ebcf70e7fcb5a82a887af1ff4bcd9060d49fd919cee9c`.
- `carrier-retirement.md`: SHA256 `2ab552d1bd5a6881ae25fb8f50e27854eb5537a29325b5c0a713d329dfc362c4`.
- `carrier-retirement-ddl.sql`: SHA256 `63e7b41506c74ac38c3c73d1dc116f23c8b5a60d1064982b260522e01c99dc20`.
- `carrier-provider-definition.json`: SHA256 `a76c88f59106de11d5df37818f8ba3f4f439eabd7e8bbfbd00708235a1c8e56b`.
- `carrier-provider-definition-digest.txt`: SHA256 `0dae51fd040e774b2e64a527c50b9cbd2f9f9a355e801aff023d912e0d6fda0d`.
- `resolved-open-matrix.md`: SHA256 `febfb8f6d6c8cf6439e748c58e42b082f87279835e48afbcfef225926e8c1c03`.

### Exact reviewed contract-proposal.md

# Proposed CONTRACT-081 successor005: G10 inventory/prefix migration

## Status and namespace

Every MUST below is proposed contract text, pending root + external governing agreement. External design review001 selected the distinct inventory0.1 families and reserved inventory installation0.1; this proposal does not adopt them. Names are separate from the allocated `umf.table-migration/*` numeric sequence:

| Candidate family | Candidate literal | Meaning |
| --- | --- | --- |
| options | `umf.table-inventory-migration-options/0.1` | Explicit inventory and composition intent |
| plan | `umf.table-inventory-migration/0.1` | Complete original-source plan and prefix schedule |
| discovery | `umf.table-inventory-discovery/0.1` | Cycle-free closed review discovery |
| execution | `umf.table-inventory-execution/0.1` | Explicit prefix-aware host capability |
| prefix frame | `umf.table-inventory-prefix/0.1` | Compiler-owned semantic catalog projection |
| installation | `umf.table-inventory-installation/0.1` | New exact final-reference family selected by external review |

External review selected these separate families; no current accepted dispatcher is inferred. G05 plan/options0.8, execution0.7 and discovery0.5 are already reserved externally and remain untouched. No generic unknown-version fallback is permitted.

Legacy plan/options/bundle/reference versions regenerate their original bytes and behavior. Preserve G02's frozen plan digest `dfdf88b70b80a228c381fe4ddf8db9233e2c099dc4de6a7bebcdbf4307ef65ae`. Existing0.1 bootstrap/add-table code stays unchanged. A historical replay returns the verified CURRENT installation reference; it never makes fresh legacy effects legal on persistent-approval installations.

## Closed author request and options

Historical requests remain exactly their existing shapes. The NEW G10 request is exactly `{id,predecessor,previous,next,options,history}`. Previous is an exact verified original deployment bundle or null; next is an independently valid exact verified original deployment bundle. `predecessor` is exactly `{id,digest}` or null. Both null together means first installation; an installed empty application inventory still has non-null previous/predecessor and original head. No fabricated empty-source bundle substitutes for null. Initial next inventory may be empty. An installed G10 transition requires at least one table create/remove; an existing-only transition keeps its established selected profile rather than using G10 as an implicit metadata upgrade.

History is exactly `{profile:"umf.table-inventory-source-history/0.1",plans,executions}` as fully specified in seed-lineage.md. Plans are the ordered ORIGINAL source-verified applied plans from initial through exact predecessor, at most128 and proposed24MiB combined canonical bytes. Initial uses empty plans AND executions arrays. Source definition existence alone never means execution. Verify original IDs/digests/source-chain links, no repeats, terminal exact predecessor/previous bundle, all historical seed definitions and earlier G10 history bindings. This is source data, not proof of actual native application: host must match its original immutable applied history before effects. In particular previous.bundle alone cannot prove that an older retired seed ID was already used. No source omitted from history is reconstructed from a digest.

The new context-requiring verifier is proposed as `verifyTableInventoryMigration(plan, originalHistory)`; it recompiles the exact new request and whole plan. Old `verifyTableMigration(plan)` and old version dispatch remain unchanged. No hidden filesystem or native lookup in browser verification. Host/CLI/browser callers must explicitly supply the same original history context. If required history exceeds the chosen bound, refuse visibly; R1 must agree the bound or a concrete source-preserving proof/streaming successor rather than silently forgetting history.

Candidate options are EXACTLY:

```text
{version:"umf.table-inventory-migration-options/0.1",
 tableIntents,backfills,defaultChanges,conversions,concurrentIndexes,
 validations,reviewedChanges,seedSets,retiredSeedSets,
 retirements,restorations,archiveSources}
```

All arrays are explicit. No missing-array historical normalization. Each table intent is exactly one of:

```text
{kind:"create",table,record}
{kind:"remove",table,record,
 disposition:{mode:"irreversible-purge",reviewMarker}}
```

`table` is the authored binding ID; record is exact `{module,element}`. A create matches one next-only table mapping and a remove one previous-only mapping. Every and only inventory delta has one intent; duplicates, stale/unused entries and unmatched definitions refuse. Discovery remove intent has exactly `disposition:{mode:"irreversible-purge"}`; the compiler options reference its eventual exact effects marker, preventing a hash cycle. Create must be physically absent at its dispatch point, not necessarily before a same-plan explicitly reviewed old binding removal.

This proposed removal form selects immediate irreversible physical table purge. Before planning native dispatch the actual provider census must identify all private row-table enrollment, issued-instance, archive and lifecycle links. Original store0.1/0.2 enrolled carriers REFUSE this first subset; DROP may not leave active old-OID/trigger witnesses or erase ledgers/archives/holds. carrier-retirement.md gives the distinct proposed successor provider, exact native receipt, guard disposition, retired witness and original recovery; its full enablement remains OPEN until adopted and qualified. It requires its exact `table-removal-effects` marker and located `IRREVERSIBLE_TABLE_PURGE` disclosure naming full stored-row/column loss. Metadata history is not backup. Unknown or retained-table recovery mode is not accepted as if implemented. Full retained-table retirement/restore/purge must be supplied by an agreed G05 composition; this outstanding requirement remains G10/R2 and G05, not a completed removal capability. External reviewer must agree the immediate-purge first subset or replace it with a concrete retained-table contract before removal implementation.

Retirements/restorations/archiveSources use the exact adopted G05 closed shapes/bounds and distinct required effect groups listed in step-branches.md; their whole-table retention meaning is NOT inferred. Every original supplied archive source is retained and consumed; missing native/Weft/instance-custody capability refuses.

G01 existing-fill, G02 new-Field fill, G11 replacement and G04 checked conversion select ONLY their original existing-before retained carrier/domain. A create-table target has no original before population and cannot acquire an inferred backfill/conversion/replacement from an equal-looking Record. New-table data is only independently selected original creation/default/seed meaning. G05 restoration requires its original surviving carrier; Field archives never restore a removed table. Backfills reuse closed source operation selections `{table,column,operation,scopedRows:true}` and the admitted G01/G02 original-source semantics. DefaultChanges are exact `{table,field}` selectors for every and only existing-field future-default delta, with G03's exact markers/default validation. Conversions reuse G04's exact entries, recipes, null/invalid/recovery rules and cycle-free effects binding. None is arbitrary SQL, an inverse callback or a newly granted host capability. Existing operation/context/dependency markers remain closed `{id,kind,path,oldDigest,newDigest}`. No legacy `conversion` qualifier is admitted.

ConcurrentIndexes reuse exact `{table,index}` source selections and existing supported btree/validity rules, now allowing created tables only after their real creation receipt. Validations reuse exact `{table,constraint,kind}` with kind check|foreignKey; they select explicit ADD NOT VALID / later VALIDATE nodes. No inferred NOT VALID, CASCADE or deferred enforcement. SeedSets and retiredSeedSets are ordered unique original IDs under the seed rules below. Every selection must be consumed exactly once; unsupported composition refuses before emitting a plan.

Both sources retain complete JSON bytes, source digests, all modules and native/logical/extension meaning. Retained table binding IDs resolve to the SAME Record ref and physical schema/name; changing a name/Record under the same binding is not creation. Retained Record/Field stable identity cannot be inferred from equal names/counts/types. Record definition may evolve only through separately admitted typed field/dependency/default/conversion changes. A full field may be shared by mappings; deleting one carrier does not authorize deleting its shared definition. Existing tables preserve relative authored order; new tables preserve their relative authored order. Reordering otherwise is an explicit future semantic decision, not native identity authority.

Trusted configuration is identical across an installed transition: module, schema, owner/person/batch roles and group-role mapping. G10 does not provision or rotate those stable authority roles or create a database/schema from source text. Initial install requires their separately authorized original bootstrap and a dedicated existing owner-controlled empty application schema. Data-table policy/grant changes are exact reviewed source meaning and compiler-derived grants, not role authority.

## Discovery and review meanings

Discovery selector is exactly `{version:"umf.table-inventory-discovery/0.1",tableIntents,conversions,retiredSeedSets,retirements,restorations,archiveSources}`; discovery also requires the explicit original history context. it uses the cycle-free forms above. It validates all shapes/bounds, exact targets, uniqueness and consumption before returning candidates. It emits original field/dependency/operation/context markers plus `create-table`, `remove-table`, `table-removal-effects`, and `retire-seed-history` where selected. Unknown/stale/extra/missing intents refuse. Compiler normalization strips ONLY the eventual irreversible marker references before entering public discovery.

New candidate values are exactly `{profile:"umf.table-inventory-review/0.1",side,source,configuration,table,record,meaning,intent,effects}`. Side is previous|next; source is `{format:"json",sha256}` over full original bytes; meaning is the complete original physical table/catalog closure, Record/Field declarations, mapping, dependencies/policies/grants and referenced seed definitions, or null for absence. No lossy name-only projection. Effects is a compiler-derived ordered array: creation `new-physical-binding`; removal `ordinary-access-retired,stored-rows-irreversibly-purged,physical-binding-removed`; seed retirement `original-definition-and-execution-retained-in-history,no-data-replay`. Exact marker ID/hash construction follows current RFC8785 review semantics; a marker never suppresses native/semantic refusal.

## Execution-aware seed lineage (R1)

The complete closed contract in seed-lineage.md is normative proposed shared text. Entry is EXACT `{id,definitionDigest,originalSourceDigest,disposition,execution}`, with disposition retain-definition|apply-once|retire-definition and execution not-run|confirmed. Original native applied history/receipts determine execution independently of definition presence. Apply-once requires not-run plus current explicit selection; actual phase confirmation alone changes it to confirmed. Whole-set retirement of never-run definitions remains not-run; retired IDs can never be selected or reused. Unknown original selected outcome blocks new application/retirement until original settlement. Retaining confirmed/retired sets never replays them. Original whole definitions/IDs/source bytes/order and mixed-table surviving rows remain unchanged.

## Compiler-owned plan, subjects and prefix frames

Plan top-level members are EXACTLY the current plan0.7 member set, with its `version` replaced by the candidate plan literal, PLUS `inventory`, `prefixes` and `historyBinding`. The names remain `canonicalization,id,predecessor,previous,next,fromBundleDigest,toBundleDigest,steps,seedExecution,phases,executionProfile,approvalProfile,options,review,requiresApproval,nativeQualified,digest`; `requiresApproval:true`, `nativeQualified:false`. HistoryBinding is exactly `{profile:"umf.table-inventory-source-history/0.1",count,digest}` with digest over the exact canonical supplied history. The plan does not recursively embed earlier plans; recompile verification supplies history separately. Digest hashes the complete body with only digest omitted. No author-supplied SQL schedule or native OIDs. Prefix frames never contain this eventual plan digest or their own digest in the hashed projection, avoiding a new hash cycle.

Inventory is exactly `{profile:"umf.table-inventory-delta/0.1",previousTables,nextTables,changes,seedLineage}`. Each table side is ordered `{table,record,schema,name,meaningDigest}`. Each change is exactly `{kind,table,record,beforePath,afterPath,beforeMeaningDigest,afterMeaningDigest}`; absent paths are null and absent meaning hashes canonical null. Meaning closes over complete original declaration/catalog meaning, not ordinal inference.

ExecutionProfile is exactly `{version:"umf.table-inventory-execution/0.1",progressRelation:"umf_lifecycle_inventory_progress",ownerOnly:true,ingressProfile:"umf.table-inventory-generation-ingress/0.1",inventoryProfile:"umf.table-inventory-prefix/0.1",initial:BOOLEAN,conversionProfile,originalsProfile,retirementProfile,retiredStoreProfile}`. The distinct fixed progress relation avoids silently changing the historical relation schema. ConversionProfile is G04's exact profile if any conversion, otherwise null; originalsProfile is its exact selected provider profile if any retained recovery, otherwise null. RetirementProfile is umf.field-retirement-step/0.1 iff G05 selected, else null; retiredStoreProfile is umf.native-row-originals-store/0.2 iff G05 selected, else null. Mixed retained G04/G05 uses the exact adopted fresh-store0.2 composition preserving G04 semantics when no carrier removal is selected; no .1 store upgrade/adoption. A selected enrolled-carrier removal instead requires the NEW separately proposed umf.native-row-originals-inventory-store/0.1 with the exact carrier-retirement.md profile/record/DDL/custody branch. Then originalsProfile/retiredStoreProfile both name that actual successor; no old provider alias or upgrade is inferred. Unenrolled removal has null carrier-provider obligation. Missing original provider census or unqualified successor refuses before effect. These are compiler-derived obligations, not runtime capability attestations. Initial=true does NOT assert G11's existing transition request admits null predecessors.

Every step has EXACT common members `{id,kind,sourcePath,transaction,sql,operation,inventorySubject,preconditions,expectedOutcome,verification,recovery}`. Kind is table|foreignKey|index|policy|grant|comment|backfill|seed|conversion|retirement|metadata. Preconditions are exactly `{kind:"inventory-prefix",prefixDigest}` and expectedOutcome exactly `{kind:"inventory-prefix",prefixDigest}`, binding the frames before/after its indivisible phase. Verification is `native-catalog-privileges-and-role-scope`; recovery is rollback-transaction for required phases or inspect-index for forbidden index phases. These are explicit NEW variants, not accepted old-plan shapes.

InventorySubject is exactly one of `{kind:"table",table,record}`, `{kind:"field",table,field}`, `{kind:"dependency",table,dependencyKind,id,sourcePath,meaningDigest}`, `{kind:"seed",sets}`, or `{kind:"metadata",profile:"umf.table-inventory-metadata/0.1"}`. DependencyKind is check|foreignKey|index|key|policy|grant|comment. Fixed metadata effects are compiler-selected and host-owned, never author SQL or author-selectable object names.

Operation is create-table|remove-table|enable-rls|force-rls|add-column|drop-column|target-check|install-default|change-default|tighten-not-null|relax-not-null|rename-column|dependency-drop|dependency-add|apply-backfill|apply-seeds|capture-originals|convert-field|validate-conversion|capture-retired-values|retire-field|restore-field|validate-restoration|create-concurrent-index|add-not-valid|validate|set-comment|prepare-inventory-metadata|record-inventory-approval|publish-inventory. Exact admitted kind/operation/subject/SQL combinations are exhaustively listed in step-branches.md; contradictory combinations refuse. Backfill adds ONLY `dataBinding:{profile:"umf.table-inventory-backfill/0.1",selectionIndex,operationId,previousSourceDigest,nextSourceDigest}`. Seed adds ONLY `seedSets:[IDs]`. Conversion adds ONLY the exact G04 `conversionBinding` record; its target is inventorySubject and no redundant old phaseTarget/phaseOperation alias is introduced. Retirement adds ONLY the exact G05 retirementBinding in step-branches.md. All other branches have no additional members. Existing field scalar semantics are inherited, not the old plan step schema.

G02/seed/conversion/retirement/metadata SQL is exactly empty; original data descriptors are prepared by Weft and fixed metadata is executed by the host. Source paths for selections remain exact options pointers; conversion validation points to its exact next mapping. DDL comes from UMF's source-derived fixed renderers. Creation's indivisible required phase includes RLS enable/force and every available declared policy before leaving the phase; a deferred cross-table policy dependency keeps ordinary ingress fenced until its final complete validation. No generic empty-SQL fallback.

Existing required effect groups remain indivisible: G01 fill/tighten; G02 add/check/fill/default/requiredness in its admitted order; G11 replacement group; G04 capture/conversion/reinstalled-dependency/complete validation; G05 capture/retire/lifecycle/outcome and restore/population/current-dependency/complete validation. Share overlapping groups into one required transaction; do not split an original atomic obligation to fit a phase budget. A forbidden concurrent-index node cannot enter such a group. Cycles/unschedulable boundaries produce located full-plan refusal. Re-evaluate complete-target constraints after grouping.

Phases are exactly `{id,kind,transaction,steps}`; kind prepare|approval|transaction|backfill-add|backfill-tighten|field-replacement|field-conversion|field-retirement|field-restoration|concurrent-index|constraint-add|constraint-validation|seed|publication. First prepare, second approval and last publication phases are required fixed metadata phases; at least THREE phases exist, even for an empty inventory. The approval phase records/observes the actual native protected decision as initial-approval-ordering.md requires; denied-approval-recovery.md supplies its exact negative original intent/reservation/observation/outcome/progress/recovery branch, leaving phaseIndex1 without successful phase2 steps and with no business capability; setup is authorized by original logical preparation and a prospective binding, never a nonexistent future receipt. A heterogeneous merged atomic group has kind transaction with its complete component obligations retained, not broken into separate labels. A forbidden phase contains exactly its selected concurrent index. Prefixes has exactly phases.length+1 frames, including index0 before preparation and a final published frame. Each frame is exactly `{profile:"umf.table-inventory-prefix/0.1",index,completedSteps,tableStates,catalog,metadata,seedStates,digest}`. Digest omits only itself. Catalog is a compiler-owned exact expected-catalog projection using original declarations and admitted typed operations; it has no native OIDs. It is NOT a fabricated deployment source or final next bundle used early. TableState is exactly `{table,record,state,definitionDigest,creationStep,removalStep}`; state absent|present; digest is canonical-null hash when absent; step refs nullable. Intermediate column/constraint/policy/grant states are represented in catalog, including NOT VALID and index validity obligations. SeedStates entries are the exact five-key lineage entries in seed-lineage.md; projected execution becomes confirmed only for the selected phase, and actual host receipt must establish it. Metadata is exactly `{profile:"umf.table-inventory-metadata/0.1",state}` where state pristine|pending|published; compiler derives exact fixed history/head/outcome/approval/progress inventory for each state, never an unknown-object allowance. Index0 is pristine only for initial; installed index0 is the original published predecessor. Intermediate frames are pending, and final published means the successor. Index/previous/history bindings disambiguate the two published states; a state label never substitutes for actual original head/source proof.

The exact closed pending progress record/native columns/constraints/indexes/ACL/birth/witness/publication/reference contracts are in native-metadata.md and normative proposed native-metadata.sql, bound by metadata-definition.json. Progress has no row at pristine index0; setup is prepare phase1 and commits an index1 complete row. Publication has no pending progress left. History and ordinary metadata keep their exact pinned definitions; only the explicit new inventory variant admits its two additional fixed relations. FileDigest is mandatory in this first native subset. No metadata family label or hash stands in for original custody or source reparse.

The host's actual prefix witness records native schema/table/role/constraint/policy/ACL identities and original creation/removal receipt bindings. For a create, it records real post-DDL relation OID and original effect receipt; name/OID observation alone is not original creation authority. Existing bindings must remain their original native objects; a recreated same-name table is not an unchanged table. Absent state verifies the FULL relevant native namespace/object closure, not just no row in pg_tables. A drop followed by create reusing a name has two distinct stable bindings and original physical generations, never adoption by equal name/OID. No future OID is signed in portable intent.

## Bounds and refusal

Retain original bundle16MiB/plan24MiB, tables256, stored columns1600 per table, seed10000 rows/128 selected IDs/8MiB native expansion, conversion256 and source-specific tighter limits. New backfill/default/concurrent/validation selector arrays are each at most256; retiredSeedSets at most256 eligible whole definitions from the complete original chronological history. G05 retirements/restorations each<=256, original archiveSources<=64/4MiB aggregate and full selected option wire<=6MiB remain conjunctive. Proposed inventory intent limit512 (256 removes+256 creates), review markers2048, source-derived steps99999, phases1024, source history128 plans/24MiB, seed lineage32768 unique historical IDs (bounded history generations times authored seed-set bound), and ALL prefix material combined within the plan24MiB cap. These maxima are conjunctive, not a promise every maximum-size combination fits. Prefix graph expansion must use bounded indexed subjects, not duplicate an unbounded full source per step; charge each frame incrementally before growing/cloning the next projection so a final serialization check is not the only memory limit. Every count is an exact integer excluding booleans; all original ID/UTF8/SQL/default/profile bounds remain. Reviewer must agree the concrete bounds/policy and denial-of-service tests before adoption. Native records/reference/policies have additional exact caps in native-metadata.md and step-branches.md. Host time/row/byte/resource policy is the COMPLETE trusted signed component-policies.md envelope, including exact original G11/G04/G05 policies, explicit G04 .2 issued capacity, phase transaction_timeout, immutable actual session/compiler/provider selections and campaign policy; author arrays cannot enlarge it. Native timer is established BEFORE BEGIN, original receipt policyDigest hashes its complete ORIGINAL component policy, and the outer receipt separately binds the full envelope. Incompatible immutable policy/atomic groups refuse, never split or silently clamp signed policies.

Refuse unrecognized versions/modes/fields, unsupported native capability, configuration/role identity changes, external/unowned inbound dependencies, unknown affected extension meaning, unexplained source edits, incomplete final operation typing, changed command required-create obligations (`TABLES_OPERATION_REQUIRED`), stale approval/file/head/source, noncontiguous progress, metadata/ACL/object drift, unsafe namespace races, destructive effects without exact disclosure, forged creation/absence evidence and incomplete seed lineage. Return located schema/source diagnostics, never row values, credentials or low-entropy hashes of rejected values.

The NEW exact installed request, native transition/cutover, fresh native enrollment and inventory row-table enrollment branches are exhaustively specified in native-inventory-branches.md. Old profiles/resolvers remain exact. Complete embedded native records retain the original tighter ingress-store cap; exceeding it refuses visibly, never drops evidence.

Successor005 ordinary-decision-custody.md is normative proposed shared text for ONE original initial phase2 request/reservation/attempt accounting/journal/settlement and recovery across approved|denied. Native decisionBinding binds original common custody in progress/witness and original initial permanent publication. Positive native outcome maps to the actual approved row plus existing successful phase2 receipt; denied native outcome/return is exact004. Native positive COMMIT before original common confirmation cannot issue business capability. Approved-only receipt.verify is unchanged; denied uses genuine protected reader/native full correspondence. Installed pre-transition approval does not enter this fresh-only slot, and no old context/signature scope is widened.

## Successor006 exact one-grant/cumulative mapping

campaign-grant-accounting.md is normative proposed closure. Native budgetReceipt.campaignCharge.elapsedBudgetMs equals ONE dispatched original grant.reservedMs. Common priorCampaignCharge is the original cumulative outer preparation checkpoint including every aborted/resolved-unknown preparation grant, never the successful phase1 receipt alone. Current original outer cumulative time sums UNIQUE grants across every attempt/phase; native receipt/settlement replay addsZERO. Common+outer refer to ONE same-provider durable allocation under original atomic CAS, not independent budgets. Existing decisionBinding resolves phase2 to that SAME original grant. Unknown stays charged/fenced; positively proved abort permits exactly one new fully charged numbered grant if original remaining cap fits. Full native/provider/CAS/custody/Weft/old-store/carrier/table/mixed/installation gates remain OPEN; no signature scope/receipt/old-context widening.


### G11 concrete original native ROOT session and durable checkpoints014

This amendment adopts the following concrete native session/exclusion and ROOT
checkpoint design as requirements. It is not native execution evidence or a
claim that the original ingress-store and application-origin interfaces exist.
Existing010–013 ROOT/config/trust/context/ledger wires remain exact. New typed
native checkpoint events select only original supervisor-journal0.2; legacy0.1
history is never reinterpreted, upgraded or recreated. Source008339d's reviewed
pure validation/physical-context association does not supply actual native facts.

Precedence correction to native-session-interface001: the actual current ingress
store verifier's `_verify_relation` CREATES/DROPS reference tables. That method
MUST NOT run inside the effect-free ROOT observer. Implement a complete read-only
catalog/ACL/role/dependency census against original committed born descriptors
and identities. Creation-time descriptor DDL belongs only inside separately
approved physical store creation. Actual prepared head/correspondence read-only
steps are distinct from administrative verifier paths containing probe DDL;
freeze their exact dependency/source map and verify the executed SQL path.
ROLLBACK does not authorize DDL. No metadata observer runs arbitrary callbacks.

Full original SourceCohort/native evidence closed encoding, actual SQL/census/
deadline projections, concrete original committed INGRESS-store creator and
subject/schema ownership provider remain separate pre-code/enablement gates.
Ingress coordinator002 is a proposed next interface, not adopted here. It must
separately freeze its full born-object witness, dispatch/attempt/custody/COMMIT
receipt and execution-policy source definitions. No pre-DDL authority/schema OID/
marker, source-test issuer or hash of current flags substitutes for those origins.
New application bootstrap authority/profile/scope requires separate exact review;
existing physical scope2 and logical ROOT signatures do not authorize it.

All014 positive paths below require actual original native proofs. Missing
prerequisites refuse and keep full implementation/native acceptance OPEN; named
methods, unavailable stubs or pure helper tests do not qualify this design as
implemented. Active0.1 deployment upgrade, unknown restore/all-history rollback,
managed original continuity, full effect/barrier/epoch/installed/browser/platform/
CI/release qualification remain explicit backlog obligations.

#### Exact concrete native session interface001

# G11 concrete native ROOT session interface 001

Exact proposed host integration over the observed native-session seam002. This
implements013's missing exclusion/actual observation/binding, not a new physical
scope or a promise that missing store/subject origins exist. No source/native
qualification or resource GO is implied.

## One original target exclusion, no authority from a lock

Add fixed `LocalPostgresSupervisor.acquire_original_target_lease(custodian,
target_custody,*,timeout_ms=5000)` returning a context manager for an opaque
`_OriginalNativeTargetLease` registered by that SAME actual supervisor. Exact
LocalTargetCustodian and original target handle must match supervisor's retained
custodian/handle and original registered target. No Protocol, caller mutex,
connection, callback or path is accepted. Lease alone grants NO SQL/effect scope.

Use the ALREADY original existing owner-bootstrap-setup.lock as the underlying
control mutex, with qualified bounded acquisition, not its current helper alone.
Check original confirmed0.3 issuer/config/purpose/control path and actual private
regular single-link lock identity; open without O_CREAT/nofollow. Use the same
original per-path thread lock plus cross-process exclusive flock, LOCK_NB and
monotonic bounded wait1..30000ms. No new optional lock or first-use fallback.
Registry binds actual descriptor/inode, supervisor/target/custodian, process/
thread, purpose and active interval. Foreign, copied, expired, closed or nested
incompatible lease refuses. Descriptor/lock cleanup covers EVERY exception path.

All fixed supervisor physical mutators, custody mutations, store creation,
provision/transition and production ROOT/context-birth mutators for this owned
target must honor the SAME underlying control exclusion. Pre-registration
physical operations use the fixed private original-config exclusion internally;
they do not pretend an unregistered target handle exists. One-append journal
flocks do not implement this outer lease. Reentry is allowed only for the SAME
original operation/supervisor/thread through a retained internal handle, never a
new flock opened recursively. A different supervisor instance/process contends.

Create/reattach the original OwnerAuthoritySession BEFORE acquiring this lease.
Do not call the owner-session factory or setup settlement while holding it;
readonly validation of immutable original files is permitted. Acquire original
control exclusion BEFORE any journal/root/context/ledger lock; preserve013
release-before-other-lock ordering. Actual privileged-DDL/role actors must be
covered by the qualified controlled-host policy. This lock does not stop an
uncooperative superuser or establish an application ingress barrier. Unknown
external privileged writers make this profile unavailable, not silently safe.

## Fixed native observation and durable snapshot

Add fixed supervisor method:

```text
observe_generation_authority(lease,*,configuration,source_cohort)
    -> _OriginalGenerationAuthorityObservation
```

Configuration is proposed closed existing-head logical0.1 DATA. SourceCohort is
original host-owned reviewed source/bundle/install-reference, actual qualified
immutable artifact/module/session/approved execution-policy inputs. Data is not
authority: verify complete bytes, original artifact registry/qualification and
ONE complete approved tuple; never arbitrary import/connection/plugin lookup.
Reject fresh/null-head0.2 here until its separate G10 branch is adopted.

Inside the lease, use actual `_verify_live_process`, original launch/origin/
continuity, sockets/gate/HBA/path/settings and original custodian registration
resolution. `_observe_native` is supplemental actual physical observation; its
fresh connection is NOT the held scope. Attach one ORIGINAL private maintenance
connection, fixed controller SET ROLE and full qualified session settings to the
lease; expose neither cursor nor commit/SQL callback. Before BEGIN establish
transaction_timeout/statement_timeout/lock_timeout and finite host deadline,
then use actual READ COMMITTED and transaction_read_only=off as existing ingress
and head validators require. Do not claim READ ONLY/REPEATABLE READ equivalence.
This fixed observer executes only bounded metadata reads/locks and always
ROLLBACKs/closes its connection, including exceptions; it never commits DDL/data.

Native observer operation deadline is at most30000ms, tightened by original
configured limits. Clamp statement/lock/driver waits to positive remaining
bounds, checking before dispatch and result/capability issue. Keep actual private
connection/backend PID/start/database/XID identity. Use `read_table_head` and the
FULL catalog/role correspondence probe on this SAME transaction; retain its
actual lifecycle SHARE lock through ROOT confirmation/readonly context issue.
Do not use the short operation_steps as full catalog proof. No cached head,
sample, unverified source/reference or fabricated native witness suffices.

Verify actual original ingress-store schema/OIDs/full fixed shape/ACL/roles on
that SAME connection using its original authority/created-store identity; require
its REAL original positive creation receipt and actual current correspondence.
Pre-DDL `_OriginalStoreCreationAuthority`, `_schema_oid`, marker/name/current
shape or authority hash is NOT that receipt. The currently missing committed
creator/resolver is a prerequisite to implement, with no fallback manufacture.
Ingress marker/footprint stays its original branch, distinct from G04 COMMENT.

Observe EVERY configured stable subject's actual OID/name/seven flags, complete
memberships/effective privilege/SET/INHERIT/ADMIN reach, actual source/schema/grant
context and original ownership receipt. Never invent a role owner column or
ownership receipt from a current-name/flags hash. Initial enrollment requires
originally authorized legacy LOGIN/nonprivileged subjects. After a qualified
original preparation/activation, readonly recovery permits ONLY changes proven
by SAME original logical/native epoch/reservation/outcome history; do not force
original LOGIN flags after the approved operation disabled them. Preserve original
OID/groups/inherit. Subject/schema bootstrap remains a real separate prerequisite;
an acceptance fixture must create/capture genuine originally authorized births,
not pass source-test issuers or redefine an owner scope to authorize them.

Return only a native-supervisor-owned observation type/registry entry bound to
this active lease, exact original native objects/config/source/current facts and
owned full evidence bytes. Full native evidence includes actual kernel/target/
settings/custody/store/source/subject/privilege/connection observations, with no
credentials/private keys/business row values. Freeze its exact private encoding/
fixed SQL/census projection in the source packet and independently verify actual
coverage; a caller dictionary cannot supply a section or a successful observation.
NativeEvidenceDigest hashes those exact original owned bytes, not the expected
configuration projected back as observed facts.

Supervisor journal0.2 adds `generation-authority-observed` EXACT payload
`{purpose,observationId,configurationDigest,nativeEvidenceDigest,nativeEvidence}`.
NativeEvidence EXACT `{encoding:"base64",data}` preserves the complete owned
snapshot bytes in canonical padded RFC4648 base64. Decoded bytes<=4MiB, original
journal8MiB/4096 events and all source/whole-export limits conjunctive; unknown,
noncanonical/partial bytes refuse before ROOT request export. Actual native
observer alone appends/recovers this original event; digests/serialization cannot
mint an observation capability. No own event digest appears inside the snapshot.
On restart locate the SAME original event by its exact digest/ID and revalidate
current actual original continuity before reissuing an observation. Missing or
rewound original snapshot/history refuses; never synthesize it from current data.

## Confirmation, native association and resolver

External root signing wait occurs OUTSIDE the lease/transaction. Confirmation
reacquires a fresh original lease and reobserves actual facts against SAME
registered ROOT request/snapshot/signature. Retain the original signed evidence
digest; do not replace it with a later observation hash. Benign process/time
changes require positive original same-target restart/continuity; changed source/
subject/store/config facts refuse unless SAME original authorized lifecycle
history explicitly accounts for them. No comparison that permanently breaks
valid original prepared/active recovery or accepts arbitrary later changes.

Perform013 exact subordinate birth→ROOT confirmation→readonly context sequence.
Then fixed native method:

```text
bind_confirmed_generation_authority(lease,*,root_enrollment,context,
 logical_authority,observation) -> _OriginalGenerationAuthorityBinding
```

It verifies actual original confirmed ROOT registry/signature/config/0.3 owner
context, same signed contextId/trust identities and existing subordinate birth,
exact logical authority/context association, source tuple, target/custodian/store
and fresh original observation. It registers one immutable binding in the SAME
supervisor's private registry. It is never built from an entry ID, JSON, caller
constructor/seal or pure crypto/context object. Repeated binding reuses original
identities; context aliases/registries stay the SAME bootstrap-owned objects.

Implement the formerly missing fixed native methods, without dynamic callback:

```text
_resolve_generation_authority_enrollment(entry_id,supervisor,custodian,store,
 *,lease) -> SAME registered original ROOT trust entry
_verify_generation_authority_trust(entry,custodian,store,*,lease)
    -> _OriginalGenerationAuthorityObservation
```

Require actual class/object/registry equality, active original lease, original
ROOT entry/config/target/store and full current native checks. Resolve returns
only an already registered confirmed entry; it does not create it from the ID.
Bootstrap ROOT confirmation issues the original entry; native binding validates
and registers it. The upper session uses these actual methods, not getattr/name
or caller-bound functions. Its copied data projection may retain exact old
native-trust-observation0.1 keys, but only AFTER resolving the actual opaque native
observation. Compact custodySequence is original ROOT reservation sequence as010
requires, NOT the external physical journal sequence; retain that actual physical
sequence/head separately in full native evidence. No self-echoed projection is
proof of the native observation.

`generation_authority_session.py` owns the fixed public prepare/export/confirm/
recover/create-session orchestration. Returned session joins exact logical core/
context/root enrollment with this native binding; it exposes no user callback or
raw maintenance connection. Each production operation acquires fresh original
exclusion and revalidates native binding/current facts. Final native preparation/
activation separately requires original logical approval/reservation/native
outcome and actual ingress/barrier/transaction protocol; the ROOT observation
lease alone cannot authorize those effects or replace their phase policy.
Pure ConfiguredGenerationEnrollmentAuthority remains crypto/durable state only.

Native APIs may import bootstrap/logical leaves; those leaves never import the
native/session consumer back. Keep actual one-time original entry registration
and types concrete, no generic issuer/class registrar. Implement every positive
path above; a named fail-closed hook is not completion. Original committed ingress
store and subject/schema ownership birth, actual deployment origin and all native/
process/barrier/installed/platform/browser/CI/release gates remain mandatory.

#### Exact durable mutation/checkpoint protocol001

# G11 native ROOT mutation checkpoints 001

Proposed supplement to [native interface001](g11-concrete-native-root-session-001.md),
for governing014 review. Governing010–013 ROOT and logical wires stay exact. This
is a design, not an implemented capability or native acceptance receipt. The
original target lease in interface001 stays held through013 context issue. The
individual ROOT, subordinate-context and native-journal locks never nest.

## Original durable state and replay

Fresh original supervisor-journal0.2 birth is selected during original physical
setup, before any target authority is exposed. Existing0.1 journals remain0.1;
there is no reinterpretation, automatic upgrade or auxiliary first-use journal.
The original confirmed owner-context0.3 pins the ROOT zero state. All production
ROOT reservations AND confirmations must pass this native protocol. Pure
transition helpers accept data and compute data; they cannot write, checkpoint,
prove origin/nonrewind or confer native authority.

The original supervisor journal retains the following closed events. All IDs,
digests, purposes and underlying records use the existing canonical validators;
integers require exact integer types, excluding booleans/floats. Digests hash
complete bounded canonical bytes. Unknown keys refuse.

`generation-authority-root-mutation-intent` payload is EXACT:

```text
{purpose,mutationId,operation,registryId,rootRequestId,rootIntentDigest,
 configurationDigest,ownerBootstrapContextDigest,nativeEvidenceDigest,
 validationObservationEventDigest,prior,next,delta,subordinateBirth}
```

Operation is `reserve` or `confirm`. Prior and next each have EXACT
`{sequence,digest}` and name complete canonical ROOT JSON bytes, without LF.
MutationId is allocated once by the original upper session and retained before
any dispatch; it is not an authorization token. NativeEvidenceDigest names the
original signed snapshot. ValidationObservationEventDigest identifies a genuine
fresh native-owned observation event, possibly later than that signed snapshot.
Its association and legitimate same-target continuity are checked, not inferred
from matching caller-provided hashes.

Reserve delta is EXACT `{request}` with the COMPLETE existing prepared ROOT
request012, its already allocated immutable IDs/payload, and next reservation
sequence. SubordinateBirth is null. Confirm delta is EXACT
`{requestId,approvalEnvelope,enrollment}` with the COMPLETE existing valid signed
envelope and derived confirmed enrollment012. SubordinateBirth is the complete
original birth receipt below. No existing ROOT record acquires new fields.
Recompute the exact next state by applying precisely one legal012 transition to
the complete prior state, including full original configured signature validation.
Reject nonmatching IDs, conflicting occupied keys, altered retained histories,
sequence gaps, unbounded work or extra mutations. Identical replay returns the
same bytes; it does not append a second sequence or allocate replacement IDs.

`generation-authority-root-mutation-confirmed` payload is EXACT:

```text
{purpose,mutationId,intentEventDigest,operation,registryId,rootRequestId,
 rootSequence,rootStateDigest,rootEnrollmentId,contextId,subordinateBirthDigest}
```

The last three values are null for reserve. Confirm has the actual original
confirmed enrollment/context IDs and digest of the complete subordinate receipt.
RootSequence/RootStateDigest equal the intent's next projection. Replaying every
intent/confirmation from the original zero state derives the authoritative
expected CURRENT ROOT bytes. An older legitimate signed ROOT prefix is not the
current state. A historical binding's old whole-file hash is not compared to the
current file after legitimate subsequent enrollments.

`generation-authority-bound` payload is EXACT:

```text
{purpose,registryId,rootEnrollmentId,contextId,rootEntryDigest,
 configurationDigest,confirmEventDigest,subordinateBirthDigest,
 targetCustodyDigest,storeCreationReceiptDigest,nativeEvidenceDigest,
 observationEventDigest}
```

This is appended once after actual ROOT mutation confirmation and fresh native
association, before a usable production context/session escapes. It grants no
new UUID. Its key is the original registry/enrollment/context tuple. Reissue
checks inclusion of the SAME historical confirmation/binding in the fully
validated original native history plus exact latest ROOT replay and current
native facts. It does not append another binding or observation on every status
read. A new confirmation attempt can record its fresh validation observation;
the signed evidence digest remains the original one.

The full native snapshot excludes mutable ROOT/context/approval-ledger contents,
the future mutation checkpoint and its own journal event digest. This avoids a
hash cycle. No future checkpoint digest appears inside ROOT bytes.

## Fixed dispatch and recovery

1. Hold the original target lease. Revalidate original issuer/config/physical
   association, complete native history and current ROOT replay; no pending
   mutation may be bypassed by another ROOT/control writer.
2. Under ROOT lock, compute/validate exact prior, next and full delta. For
   confirmation first finish013 original subordinate birth while ROOT lock is
   released, then reacquire/revalidate the same prior. Close subordinate locks.
3. Release ROOT lock. Append the native mutation intent before ROOT replacement.
   Preflight sufficient capacity for all required intent/confirmation/binding
   records, every8MiB/4096 bound, and whole export/snapshot limits. No truncation.
4. Reacquire ROOT lock, require EXACT prior and replace atomically with EXACT next;
   fsync/rename/parent durability follows original qualified file protocol. Close
   ROOT lock. No generic caller CAS, callback or raw path is exposed.
5. Recheck exact next and original subordinate/native association. Append the
   native mutation-confirmed event. For reserve only now export the original
   prepared request. For confirm append/resolve original bound event, then013
   readonly context issue. Outer target lease stays held until issue completes.

Every original physical/native/custody/store/ROOT/context writer checks unresolved
mutation intent before effects; recovery alone may settle that SAME intent. This
includes a second supervisor/process and boot/reattach, not just one session's
Python map. No additional mutation can rebase the saved prior/next pair.

| Durable cut | Required next action |
|---|---|
| No native intent, ROOT still prior | No ROOT mutation/export occurred; a new qualified attempt may plan it |
| Native intent, ROOT exactly prior | Resume only the same original mutation after full native validation; do not allocate replacement IDs |
| Native intent, ROOT exactly next | Verify same native/subordinate facts and append the missing confirmation; never rewrite ROOT |
| Intent but ROOT neither prior nor next, or native history missing/rewound | Refuse; no prefix adoption, reconstruction or best-effort repair |
| Native mutation-confirmed, binding missing | Verify original confirm/subordinate/current facts and finish only the missing bound event |
| Bound, response lost | Resolve the same original IDs/context/session association; no ROOT/context rebirth |

An unresolved confirm intent pins complete subordinate birth even if ROOT is
still the prepared prior. Missing a pinned subordinate file refuses; that prepared
label is not permission to recreate a confirmed birth. Corruption after ROOT
confirmation always refuses. Unknown native continuity leaves the intent fenced.

This detects ROOT-only rollback against retained original native checkpoints.
Restoring the ROOT AND entire native/custodian history together still requires
independently qualified original external continuity. Hash chains or file
permissions alone do not prove that such a backup is current. Full independent
anti-rollback acceptance remains an explicit native qualification gate.

## Complete subordinate birth receipt

The native-owned private DATA receipt has EXACT:

```text
{profile,rootRegistryId,contextJournalRegistryId,contextId,rootRequestId,
 trustEnrollmentId,configurationDigest,contextProjectionDigest,
 logicalEnrollmentId,initialEpoch,contextJournalPath,contextJournalEntryDigest,
 contextBirthMarkerPath,contextBirthMarkerDigest,approvalLedgerPath,
 approvalLedgerLockPath,approvalLedgerBirthDigest}
```

Profile is `umf.generation-authority-logical-birth/0.1`. ContextJournalRegistryId
is the actual existing supervisor-context journal identity, distinct from ROOT
registryId. Paths/IDs follow013's original fixed mapping and deterministic
identities. ApprovalLedgerBirthDigest hashes the complete original first
`identity-allocated` record including its canonical LF, not an invented owner
header or the whole later ledger. Validate that exact original birth prefix plus
full current history after legitimate appends. Context projection/entry/marker
and lock are actual013 original objects. A caller dictionary, copied receipt or
matching hash cannot register a birth capability. The bootstrap-owned issuer
produces the original receipt; native association verifies actual files and
registry identity under the same outer lease.

## Required interfaces before014 source adoption

The following gates are explicit and separate from pure ROOT transition review:

- Native-owned SourceCohort registry, complete closed private snapshot encoding,
  actual fixed SQL/census and driver deadline projection must have frozen exact
  source/test preimages and a complete source-map before code adoption. Interface001
  enumerates required observed sections; matching expected configuration is not
  an observation. No opaque caller-supplied evidence dictionary is admitted.
- The original committed INGRESS-store creator/resolver is currently missing.
  A fixed upper OwnerAuthoritySession coordinator must own the SAME active native
  transaction, genuine pending effect binding, native reservation, COMMIT outcome,
  fresh full born-object verification and durable custody confirmation. It must
  return a registered committed creation receipt before ROOT observation. Existing
  pre-DDL `_OriginalStoreCreationAuthority`, caller `create_original_store()` and
  schema OID/marker are insufficient. G04's COMMENT receipt is a different branch.
  Exact ingress receipt/journal/dispatch types and method/source map must be
  separately frozen and reviewed; this supplement does not invent them as existing.
- Original application-subject/schema ownership is also a separate interface
  gate. Existing physical scope2 provisions its three system roles, not arbitrary
  application subjects/schemas. The actual owner/provider must expose genuine
  originally authorized birth/continuity receipts. Until that exact interface and
  source map are reviewed, no positive production existing-head enrollment is
  qualified. A native fixture must capture real authorized births, not a source
  fixture issuer or a hash of current role flags.
- Actual original-journal0.2 birth selection and all control-mutator exclusion
  coverage must be demonstrated on frozen source. Original0.1 active deployment
  migration, unknown restore, managed-host continuity, full native effects,
  installed artifacts and release qualification remain tracked independently.

Thus014 may freeze the closed mutation protocol after design review, but its
implementation/native acceptance cannot close on names of missing methods or
passing pure transition tests. The two missing birth-provider interfaces above
require concrete reviewable designs before their respective code is adopted.
