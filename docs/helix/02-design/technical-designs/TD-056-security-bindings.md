---
ddx:
  id: TD-056
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-056
      kind: informed_by
    - id: SD-008
      kind: informed_by
---

# TD-056: Qualified binding admission and independent backend executions

## Correlated graph endpoint proof — 2026-10-09

`tools/security/prove-graph-endpoints.py` adds four conditional first-order checks for US-056-AC2 over arbitrary association witnesses and separate native object, qualified type and complete logical key domains. Exact role-specific endpoint projection and complete, sound incidence preserve correlated two-endpoint existence and its negation. Independent type-erasure, role-reversal and omitted-incidence controls produce SAT counterexamples; the corresponding safety queries are UNSAT and valid populations are SAT. All twelve pre-solve formulas replay independently.

The Truss CONTRACT-012 current key direction uses `object_key_bucket`, complete namespace/key bytes and a typed `(object_id,type_id)` join. Its legacy text `object_key` lookup is baseline-only. This theorem states the endpoint correspondence obligation; it does not implement or authenticate that key/bucket projection. Native role declarations, property/edge attributes, unknown-value semantics, exact encoding and collision processing, complete installed graph bindings, authority and final release remain separate qualification work. The retained receipt explicitly marks native implementation unqualified. No graph acceptance case is closed.

Astra ultra independently replayed all twelve formulas and checked all three source digests, finding no actionable defect in this declared Boolean slice. The eventual native object locator must retain the complete `(object_id,type_id)` identity rather than a bare bigint. The four checks share the same conditional equivalence; their distinct weakened controls expose separate binding failures, not four independent backend proofs. Current aggregate verification passes28 component groups,402 formula replays across21 receipts and108 evidence checks. Full backend acceptance remains26/132.

### Private typed graph locator implementation

Truss `packages/postgresql/src/security-graph-locator.ts` now projects native object/edge locator rows using canonical bigint/int4 TEXT carriers. It retains complete `(id,typeId)` identity, directed endpoint roles and each edge's own bigint identity. Every endpoint must resolve to one supplied typed object; duplicate object identities and duplicate edge IDs refuse. The pure projection retains distinct supplied edge identities; it does not qualify native index constraints. Inspection of the complete 0.15 owner-export DDL subsequently confirmed that UNIQUE edge_out(source_id,rel_type_id,target_id) forbids duplicate relationship/numeric-endpoint pairs. Normal allocation also relies on global shared-sequence IDs and forbids caller-supplied IDs. Equal IDs across types and supplied parallel edges remain defensive representation fixtures, not admitted native allocation populations or backend support claims. Negative and zero native IDs retain their exact spelling; no Number conversion of identities occurs.

The component captures exact top-level data properties and bounded dense array index descriptors. It refuses holes, accessors, custom iterators, extra array properties and collections over4096 entries. Astra ultra reproduced an iterator bypass in the first version; the corrected bounded snapshot refuses without invoking the caller iterator. Exactly4096 objects and edges remain admitted. Astra re-reviewed the corrected implementation and found no remaining actionable defect.

The owning Truss test file retains28 passing Bun tests; the real Chromium153 receipt retains25 unique matching observations with current source pins and no host globals or external requests. Aggregate verification passes30 groups, including strict standalone typing of the sibling component/tests/browser harness and UMF's own unchanged compilation boundary. Tests reside in Truss because importing sibling implementation source into UMF's main test tree crossed its rootDir boundary. This is a private candidate row-projection component, not actual native graph execution, business-key resolution, declared rel_endpoint validation, source/fact completeness, stable authority or authorization. Public typed-query admission remains refused and US-056-AC2 remains open. Next integrate original key/namespace verification and owner-backed property/relationship declarations into the actual graph projection before native oracle comparison.

Declared endpoint correspondence is now implemented as a separate private candidate projection in the same module. It snapshots supplied `rel_endpoint` triples, retains exact canonical int4 relationship/type carriers, refuses duplicate or malformed declarations, and checks every supplied edge against its complete ordered relationship/source-type/target-type triple before selecting the requested relationship. A selected declaration is mandatory even for an empty collection. Known foreign relationships are separately selected; undeclared relationships and reversed endpoint roles refuse. Alternative declared endpoint-type combinations remain distinct. This validates correspondence with supplied rows, not authentic or complete original catalog declarations, logical relationship allocation, native constraints or current installed authority.

The expanded corpus passes34 Bun tests and34 unique Chromium153 observations;30 aggregate component groups and109 evidence checks pass. Astra ultra independently re-reviewed this addition and found no actionable defect. Full native graph execution, business-key/namespace resolution, qualified property decoding, source/cut admission and final publication remain unfinished. No backend case or full acceptance criterion is promoted by these portable components.

### Candidate complete-key bucket lookup

`resolveSecurityGraphKeyLocator` now compares complete expected namespace/key bytes within the selected native type/key-number, and joins each bucket owner through `(object_id,type_id)`. It validates canonical TEXT bigint/int4/int2 carriers, positive unique storage row IDs and the native one-per-object/type/key-number constraint. Missing selected materialization, unresolved typed owners, duplicate owner rows or two owners matching the complete selected key refuse. Every supplied bucket is checked before returning; a match cannot bypass later ambiguity, malformed carriers or resource exhaustion. Native namespace/key byte limits are65536/1048576 bytes, with a16-MiB aggregate candidate budget including the expected pair. Hex carriers are nonempty, even-length and lowercase; no digest or storage ID substitutes for business-key equality.

The expected tuple must originate from the registered UMF producer and independently qualified namespace selection, including correspondence of its type/key number to that namespace. The component does not establish those host premises. Chromium composition now loads the actual registered owner bundle and existing stored-key verifier, then resolves its bytes against retained native namespace/key outputs combined with explicitly constructed typed owner rows. The independent large-ID expectation and changed-stored-byte refusal pass. Constructed rows are not retained native owner evidence, and fresh native execution remains false. Astra independently checked the actual producer hash, namespace/report/native pin correspondence, all seven browser source digests and the retained-byte expectation, finding no actionable defect.

The Truss corpus now passes43 Bun tests, including exact byte-limit positives and one-byte-over refusals on both expected/stored sides,4096 bucket rows and the later aggregate-bound control. The graph endpoint browser corpus retains34 observations; stored-key browser composition passes nine checks. Aggregate components pass30 groups and evidence validation passes110 checks. Actual owner-backed native graph facts, original installed source/namespace authority, qualified property decoding, general policy lowering and current-authority publication remain required. Full acceptance is unchanged26/132.

**User Story:** [[US-056]] | **Feature:** FEAT-008 | **Solution Design:** [[SD-008]]

## Scope

Story-level realization of US-056-AC1–10; CONTRACT-062/063 govern exact surfaces.

## Technical Approach

Qualified binding admission and independent backend executions. Inherit complete-fact admission, mandatory restrictions and native
refusal from SD-008. No source policy can choose a trusted issuer or native role.

## Component Changes

Spike files under `02-design/spikes/security/` establish bounded feasibility.
Production components follow the existing portable-library/runtime separation;
new package/schema/API details must conform to CONTRACT-001 and CONTRACT-062.
Backend-specific source and receipt adoption are consumer-owned.

Input: Model/policy/mapping and actual native inventory. Output: refusal or admitted native evidence.
Authoring retains unknown source; activation requires understood meaning.

## API/Interface Design

Use CONTRACT-062 policy meaning and CONTRACT-063 receipt admission. Weft-owned
lowering interfaces require pinned owner agreement before production integration;
no invented local compiler API is silently adopted.

## Security

Original caller and trusted attributes are host inputs with independently
qualified provenance. Invalid/incomplete context refuses before effects. Native
owners, BYPASSRLS and definer dependencies are explicitly inventoried/excluded.
Private observations cannot escape through read, error or progress surfaces.

## Testing

Actual-role read/write/bypass/disclosure/drift matrix for each backend. Every exercising test cites `@covers US-056-AC` with its full numeric
criterion ID. STP-056 owns per-criterion cases; declaration-only checks do not
qualify execution. Qualification requires zero skipped required cases.

## Performance

Bound semantic expressions under CONTRACT-062. Measure native policy overhead,
plans and drain at 1k/100k/1M records; resource timeout is an explicit refusal.

## Migration & Rollback

Version source and bindings separately. Preserve native/unknown source and prior
admitted installation. Failed activation closes admission or retains the prior
profile; never remove protection while broad ordinary grants remain.

## Implementation Sequence

1. Create exercising contract/native fixtures and record red or not-run states.
2. Implement the scoped component and independent expected-result comparison.
3. Reproduce formal/native/browser checks at matching source fingerprints.
4. Admit only the exact completed subset and publish criterion receipts.

## Risks

Missing native capability, incomplete authority participation or unreviewed
compiler interface blocks that profile. Continue independent semantic validation;
never substitute synthetic fixtures for actual consumer adoption.

## Inspected compiler integration boundary (2026-10-08)

The current sibling Weft source exposes `backend::Manifest`, `Capability` and
`Obligation` with explicit host/backend ownership, pinned target/language profiles
and evidence status. `crates/weft-core/src/backend.rs` is the inspected owner
surface. The inspected core/runtime source contains no security policy lowering,
masking or authorization implementation. Generic obligation parameters alone
do not establish a lowering contract for CONTRACT-062 expressions or disclosure.

A consumer integration therefore needs an explicit versioned security capability
and lowering agreement that preserves qualified references, exact key equality,
mandatory rule composition, complete private authorization facts, disclosed
query representation and atomic refusal. Its emitted obligation must be checked
by a host with authenticated authority and CONTRACT-063 lifecycle guards. No
local SQL renderer or source-content-selected executable plugin is introduced
by UMF. This is an open implementation dependency, not native acceptance.

## PostgreSQL original actor requirement

The PostgreSQL feasibility replay exposed and corrected adopted-role identity
substitution. Native helper resolution must use the originally authenticated
session actor, with its explicitly qualified subject mapping; current/adopted
roles and client-authored GUCs cannot choose another subject. Actual ordinary
connections, deliberate membership drift and a weakened-helper counterexample
exercise this requirement. A pooled service identity requires a separately
qualified trusted subject context; these direct-session observations do not
establish that context or substitute for native role/bypass inventory.

## Concrete compiler/host handoff gaps (2026-10-08)

The inspected Weft CONTRACT-003 and backend source carry typed host/backend
obligations from binding validation, capability assessment and emission, merging
conflicts atomically. That is the available transport hook; arbitrary obligation
parameters are not native verification or policy lowering. The runtime
`compile_json` returns artifacts and never executes database operations.

| Inspected owner surface | Current behavior | Required security adoption |
| --- | --- | --- |
| `backend.rs`: `Validated`, `Assessment`, `Emission` obligation vectors | Generic ID/parameter/owner/failure transport with conflict refusal | Versioned security obligation semantics and a registered native host checker |
| `backend_emission.rs`: scalar validation | Output logical type, nullability, carrier and decoder must match resolved source output | Explicit security disclosure representation/result-domain profile for original/null/absence/withheld/transformed and changed output type; no silent scalar reinterpretation |
| `model.rs`: v0.1 catalog loader | Explicit UMF 0.7.0 schema/version check | Explicit compatibility/adoption for the security extension's pinned UMF 0.8.0 documents; do not relabel/downgrade source bytes |
| `weft-runtime::compile_json` | Compilation only, host obligations retained | Host/native authenticated context, complete private facts, native inventory, guarded execution/final release and current snapshot checks |

This table scopes the inspected v0.1 loader and scalar emitter; it does not assert
that every newer application/artifact protocol has the same version subset.
Registered backend-owned field codecs still require explicit security result-domain
adoption. A generic opaque codec or host-obligation flag cannot by itself qualify
masking/query use. Public transport/result-domain changes must be explicit owner
contract revisions and tested through Rust, Python and browser bindings. Until
adopted, a protected profile must refuse compilation/activation rather than route
an ordinary canonical scalar artifact through a guessed security wrapper.

## Databricks original-actor preflight

The live `aidev-cus` and `scope-test` profiles return the same original active
native actor ID in the same configured workspace context. Zero distinct
non-installer actors are available from those profiles. `databricks-actors.py`
retains only selected native identity/context metadata and CLI/source versions;
credentials and raw auth diagnostics are not retained. Distinct profile names
cannot establish ordinary Staff identities, and configured context is not an
independent server/SQL grant inventory. The previously requested disposable
namespace and independent ordinary credentials remain required external inputs.

## Versioned disclosure transport component

The browser-compatible `src/extensions/security/disclosure.ts` implements
`umf.security.disclosure/0.1.0` for ordered selected fields and bounded rows.
Each cell retains its exact qualified field reference and one disposition:
original typed literal (including explicit null), absent, withheld, or transformed
with an explicit qualified output-domain reference and typed literal. Unknown
versions, extra members, incorrect row widths/order, invalid literal domains,
duplicate selections and invalid absence refuse the entire batch with a coarse
error. Limits are 256 fields, 4,096 rows, 16,384 cells and the underlying core
JSON structural limits. Empty collections retain the selected field declaration.

This component validates shape and types, not authorization. In particular,
a structurally valid original cell can pass even when a policy would withhold
it. Native result provenance, current authority, policy disposition enforcement,
physical row completeness and final-release guards remain the host/backend's
responsibility. The receiver supplies the admitted interpretation; this wire
format neither carries credentials nor asserts globally current source pins.
Weft must explicitly adopt this representation through its versioned scalar/result
contract before any backend support claim. No backend case is closed by this
codec. Bun corruption/round-trip tests and real Chromium S10 observations cover
the portable component; receipts remain in the security evidence directory.

## Public PostgreSQL driver feasibility

`tools/security/pg-driver.ts` executes Bun 1.4.2 SQL against the owned disposable
PostgreSQL 17.9 fixture on an ephemeral 127.0.0.1-only port. It connects as actual
ordinary Alice, Bob and outsider identities, checks exact resource IDs and native
SQLSTATE 42501 for private Assignment access. Two held-transaction schedules use
independently observed native advisory lock waits through a host-buffer release
or discard boundary, then verify a fresh ordinary count is zero. Barrier waits
and subprocesses have finite deadlines. TCP readiness distinguishes PostgreSQL's
temporary initialization server; the owned container and SQL pools are closed.

This is physical public-driver feasibility, not policy lowering, production
credential management or a complete native profile. Connection loss, pooled-role
reset, prepared artifact custody, codecs, streaming failure and complete authority
writer participation remain separate mandatory qualification work. The Weft
source inspection confirms its B-007 support inventory claims compiler-conformance
for exact qualified profiles conditional on admitted authority; its test-only host
obligation fixtures call host-supplied snapshot/query functions. Those callbacks
and generic obligation transports do not implement the shared security model.
The shared compiler remains the owner of lowering; no SQL compiler is added here.

## Executed compiler version boundary

`tools/security/weft-version-probe.py` builds the current sibling Rust owner
compiler offline with its lockfile, in an isolated temporary target directory.
For one qualified Truss request and one qualified Ashlar request, unchanged
UMF 0.7.0 inputs compile. Changing only each owning document's core version to
0.8.0 and correctly updating its exact document bytes, pin version and digest
produces WFT-INPUT at the versioned request envelope; no SQL, parameters or
partial logical plan is returned. Four fresh observations and pre/post source
hashes are retained in `weft-version.json`. This is compiler transport evidence,
not native backend or security-policy support. It does not establish compatibility
of every core property or target query.

The immediate owner integration step is explicit versioned request/schema
admission for the security model's 0.8.0 source bundle, then catalog semantic
admission and security input/result-domain lowering. Updating only model.rs would
not pass the current request envelope. Prior 0.7.0 requests and artifacts must
retain their separate versioned contract and regression corpus; never relabel
source bytes or bypass the request validator to activate a protected profile.
The actual Truss 0.12 source handoff independently still lacks installed native
routine/security binding: the security worklist names sixteen known signatures,
not complete callable/effective-right closure. The integration cannot substitute
Weft's qualified fixture registration for that unfinished installation.

## Owner security admission foundation

The owning Weft repository now frames FR-19–22 and CONTRACT-005 for the security
compiler slice. `weft-compile/0.3.0` retains the 0.2 query grammar but requires
core08 module pins and the shared security source transport. A separate Rust
Catalog::prepare_security validates core08 envelope/byte/identity custody using
the exact canonical UMF schema. Existing ordinary preparation and 0.1/0.2 request
schemas remain core07. The blocked-only 0.3 response is explicit.

Five source-qualified Rust security admission tests plus the existing frontend
and compile-envelope suites pass. They prove malformed/missing/stale transport
refusal and that a source-custody-admitted security request never invokes backend
composition. Well-formed 0.3 activation currently returns
WFT-SECURITY-UNSUPPORTED without SQL/parameters/partial plan. No public compiled
security artifact or supported core08 physical profile is claimed. Typed policy/
ontology admission, logical and physical lowering, disclosure domains and native
host obligations remain the next B-008 implementation work, followed by native
Python/actual browser and all required backend evidence.

## Rust policy/ontology source-shape stage

Weft's SecuritySourcePacket now admits bounded exact JSON, known policy/ontology
source shapes and exact ontology/core revision pins. Its strict selection overlays
are reproducibly checked against canonical UMF schemas; opaque native archives
retain bytes without authority. New refusal controls exercise duplicate JSON,
unknown nested meaning, deep expressions and missing/stale document closure.
Nineteen source-qualified owner tests pass. This intermediate stage remains
separate from complete type/domain/key/variable admission and logical/physical
lowering; protected activation is still closed before backend composition.

## Qualified ontology reference closure

The owner Rust stage now resolves qualified Records, stable Keys, every classified
member, subject/context fields and association endpoints against core08 source
custody. Duplicate or cross-document-substituted identities refuse; distinct
qualified identities with the same local labels remain distinct. Keys retain
ordered required components, and endpoints match declared target key domain
shapes. Unknown selected qualifiers/units and inapplicable facets refuse.
Twenty-five current owner tests pass, including the correlated Project fixture
and deliberate corruptions. Complete literal/facet semantics, variable/type
inference, logical security IR and physical/native lowering remain required before
activation. The source stage never authenticates a fact provider or native actor.

## Declared term types and coherent source stages

Weft now checks rule action/target/output membership, lexical variable freshness,
association roles, exact identity type/key equality and declared scalar domain
shape equality. Basic literal wrappers match their declared scalar family.
Expanded checking is bounded. Source packets retain model pins; changed or rehashed
inputs cannot replace the prepared catalog's actual definitions. The checker
constructs ontology closure internally from its own source/model snapshot.
Thirty-one current owner tests pass. Exact literal/refinement validity and semantic
truth/composition IR still precede physical lowering/native admission; this stage
cannot authorize source-content-defined roles or current fact providers.


## Query-use provenance before physical lowering

Rust now simulates all five query-use modes and separately evaluates the selected
original-value action. Native activation still requires an admitted immutable
profile binding `(target, field, operator) -> exact original action`, whose source
and physical mapping are independently qualified. The SQL client cannot select
an unrelated granted action to obtain raw values. The current simulation request
and source pins do not establish that profile provenance. Serialization/admission
of these native bindings and their lowering remain open. B08 must cover profile
tampering, unrelated-action substitution, empty selection and dependencies that
are absent only from a false main-action branch.


## Source-bound query-profile admission foundation

Weft now has the draft `weft.security.query-profile/0.1.0` source protocol and an
immutable Rust admission object. Primary action and selected targets are bound to
exact retained model inputs/module selections, policy/ontology bytes and backend
ID/version/profile/binding bytes. Original-authorized field/operator tuples require
one exact separate declared action; missing, duplicate, extra or foreign-qualified
bindings refuse. Request annotations are derived from that profile, and a caller's
unrelated granted action refuses even for empty collections. An unprofiled logical
simulation supplies a retained substitution control, not native authority.
Compile 0.3 optionally admits the profile before the unchanged unsupported gate;
neither admitted nor stale profiles invoke backend factories. SQL query-use
extraction, authenticated source ownership/current authority, physical mapping
interpretation, installed actors and release remain open.


## Actual source SQL lineage before physical lowering

The owner compiler now resolves source SQL itself and extracts qualified field
uses from predicate/keyset operands, both join sides, groups, order fields and
SUM arguments. Self-join occurrences remain distinct. Field-free COUNT retains
its scans and cannot escape profile target checks. Unique projection dependencies
coexist with the original ordered aliases/output multiplicity. A private-constructor
profiled-query artifact retains resolved source lineage and read-only derived
actions, with exact source reuse checks. Compile 0.3 profiles apply to that
actual SQL before the still-closed activation gate.
Relationship helpers explicitly refuse pending a declared typed security bridge.
Transformed-output operator typing, physical query lowering, installed authority
and release remain open. SQL witnesses use named fields and signed 64-bit integers
within the existing application-read 0.2 subset; unbounded integer selection in
that frontend remains unsupported, with its initial refusal evidence retained.


## Compiler scan obligations for physical mapping checks

The immutable profiled SQL query now carries separate obligations for every scan
occurrence and selected action. Field-free COUNT retains full ordered resource
and subject identities; self-joins do not merge their scan occurrences. All scoped
permit/require/forbid conditions are visited without truth simplification, including
separate original-value action dependencies. Correlated existence requires complete
private association inventories, all classified association fields, association
identity components and ordered endpoint target keys. Context attributes remain
separate from record attributes; literal domain references do not add live reads.
Projection and operator fields remain separate inventories from authorization facts.
One-million-work and 16-million copied identifier-text byte limits bound derivation.
The artifact's constructor remains private and exact source reuse checks apply.
This inventory is input to physical mapping qualification. It does not authenticate
private facts, prove their completeness, install native RLS/masks, reconcile
transformed query types or authorize result release. Native B/L cases remain open.


## Collection ordering evidence

The raw PostgreSQL collection witness applies native eligibility before lookup,
count/min/max/SUM, traversal and pagination. A native RLS-disabled control changes
ordinary counts, demonstrating a real eligibility-dependent result. Two additional
Z3 checks prove conditional hidden-record noninterference for three symbolic
carrier identities: unbounded nonnegative bag multiplicities/mathematical integer
COUNT/SUM, and every eligible page rank 0..2 under fixed public ordering. Each
has a satisfiable positive population, UNSAT violation, and SAT weakened control.
The page control selects raw rank before filtering and admits missing/changed
authorized pages. Stable complete eligibility, equal eligible values and ordering
are premises. Native overflow, NULL behavior, protected output domains, arbitrary
ordering/collation, cursor provenance and authority freshness are not proved by
these checks. The formal inventory grows from 18 to 20 conditional checks; native
installation correctness remains independently evidenced and incomplete.


## Native private-fact diagnostic limitation

The owned PostgreSQL 17.9 probe confirms that default catalog privileges expose
private Assignment population statistics to ordinary SCRAM actors. Adding Eve's
unrelated Project-D assignment preserves all ordinary authorized resource IDs,
but pg_class.reltuples changes 3 to 4. Revoking direct pg_class access does not
close the path: public pg_stat_all_tables and pg_stat_get_live_tuples still expose
the privileged estimate. Statistics are estimates, not exact physical counts; the
probe compares actual privileged metrics rather than assuming equality with row
population. A prototype restricting the three known families preserves authorized
reads and blocks the selected probes. It is not a complete catalog/function/view
closure or native backend qualification.

B10 remains open. Its physical design must provide an explicit, qualified diagnostic
allowlist or a closed query surface that ordinary subjects cannot bypass with raw
credentials, and must retain the complete native privilege inventory. Default
PUBLIC catalog/function grants cannot satisfy this requirement merely because
private fact tables lack direct SELECT grants. Model semantics are not weakened
to accept this disclosure. Explain/history/size/timing behavior remains an explicit
unknown requiring threat-scope and native evidence.

## Native complete-cut source correspondence

The raw PostgreSQL witness retains an independently authored complete source cut
for the declared Employee login binding, Project identity, Resource identity,
Assignment endpoints/active value and Ownership endpoints. One native statement
collects all of those exact facts. Host admission compares the native facts with
the pinned source content before every selected collection operation, including
empty and all-hidden selections. Matching population counts alone do not prove
complete endpoint/value correspondence. Missing facts, required-attribute NULLs,
changed endpoints/bindings and unavailable sources invalidate that frozen cut.

The source cut is supplied by the excluded fixture installer and independently
checked oracle. Production needs an authenticated source issuer, source revision
and complete coverage evidence; client-authored completion flags are insufficient.
Legitimate authority transitions require a new qualified cut and the lifecycle
protocol. The stable-cut witness does not implement those transitions or enforce
admission for arbitrary direct SQL. Native RLS can skip a per-row predicate on an
empty selection; a profile promising collection refusal needs an actual statement
admission boundary and must deny unqualified direct paths.

## Managed host-helper execution custody

The native witness executes its reviewed Python admission helpers from exact
in-memory source bytes whose digest matches the case's initial source pin. The
loader itself is checked and compiled the same way. Neither an import timestamp/
size check nor module-authored metadata selects code or supplies the executed
source digest. Executed managed-source bindings are retained separately from native
database descriptors. This is content custody within a trusted reviewed host,
not authentication of the host, issuer, model or policy.

A component control reproduces stale bytecode selection after an equal-size source
change with the original timestamp. The exact-byte loader executes the newly
reviewed source instead. Changed source, missing/malformed pins and excessive
source size refuse before managed body execution. Python runtime and standard
library remain trusted versioned prerequisites. This does not qualify B12's full
engine/model/policy/mapping/actual-role receipt or fabricated-receipt matrix.


## Original-login subject preflight prototype

For the experimental dedicated Truss ordinary-login read profile, subject
resolution precedes application statement admission on the original checked-out
connection. A host-selected, independently qualified private routine accepts
SESSION_USER as PostgreSQL TEXT and returns exactly one ordered non-null TEXT
subject-key tuple. Original response aliases, type OIDs, text format, cardinality,
UTF-8 and carrier bounds must match the selected mapping. Configuration is copied
before acquisition. Neither a caller label nor a same-shaped result authenticates
the routine, model identity or authority source.

The current runtime prototype admits only repeatable-read/serializable read-only
transactions. While preflight is pending, application SQL and transaction controls
refuse locally. Failure quarantines original custody and closes source admission;
it must never degrade into an authorized empty collection/count. An observed
native lock barrier independently tests that concurrent calls cannot race the
successful preflight boundary. This is source/native component evidence under
US-056-AC7's completeness concern, not closure of the backend acceptance criterion.

Complete routine source/owner/grant/inventory qualification, typed key and native
carrier correspondence, guard acquisition before establishing authority snapshot,
post-acknowledgment freshness and original final-release custody remain required
for an admitted production profile. A stable old snapshot alone does not satisfy
US-057-AC3. No service-login caller adoption, write support or graph mapping is
inferred from the dedicated original-login prototype.


## Typed shared native homes

A shared table needs an explicit logical-type-to-native discriminator mapping;
table equality does not make its rows interchangeable. For a shared home, all
selected logical types must use the same discriminator column and native carrier,
with distinct canonical values. Subject and association witness scans must apply
that selection before existential truth aggregation. Root eligibility must also
bind the original row discriminator, not merely business-key component values.
Removing type filters can fabricate membership/ownership from another declared
association even where all column shapes and endpoint strings match.

The portable PostgreSQL prototype carries native discriminator values as exact
text with declared text/int4/int8 carriers; integer bounds use bigint. Its native
witness qualifies only int4 shared fact projections, not actual graph adoption.
Type tags are not logical identities: the host must prove injective correspondence
with the original complete document/module/type identity and native catalog source.
Native text equality/collation, composite (type,id) physical keys, business-key
codec and endpoint-registry correspondence require explicit profile validation.
Root parameter authority and complete collection admission remain independent of
row predicate emission. No same-shaped projection substitutes for original
Truss node/scalar/key/edge source and public consumer execution evidence.


## Ordered logical keys and declared native index order

Logical key order comes from original qualified field declarations. Native index
order comes from original native descriptors and its explicit mapping declaration.
These are separate source meanings: Truss's native type-last keys cannot be
silently converted into an assumed type-prefix index. A selected type plus all
logical key components must occupy the exact native key carrier set; explicit
native order may differ while logical component order remains unchanged. Missing,
extra, duplicated or semantically reversed field bindings refuse. Scalar predicate
column bindings must agree with key bindings, avoiding a uniqueness check over
one column followed by authorization reads from another.

The fixed prototype admits nonnull deterministic TEXT key components and nonnull
int4 type selectors on PostgreSQL 17.9. Shared type observations carry the full
logical document/module/type reference, native discriminator column/value and
complete original model source pin. Ambiguous source observations, swapped tags,
wrong source pins and domain/constraint mismatch refuse. Trusted source resolution
and native observation custody remain independent premises; metadata cannot
supply its own authenticity. An actual graph business-key codec or endpoint FK
correspondence must be proved separately before adopting this primitive into an
installed native profile. Native key index order is retained explicitly, never
used to infer or replace logical key identity.


## Encoded graph business-key transport

The current Truss key-bucket carrier is native BYTEA containing UTF-8
`umf-key-tuple-v1:hex:<tuple hex>`, separate from complete namespace bytes. Reuse
the independently registered original UMF tuple producer, never reimplement key
meaning from JSON spelling or infer meaning from a prefix. Original source/field
order/domain and owner verification determine canonical tuple bytes. Receipt
shape/source revision labels alone do not authenticate the producer. Stored full
namespace and full transport must match; digests route private enumeration only.
Equal value payloads across different namespaces remain different selected keys.

Namespace admission binds original installation/source epoch, native type/key
selection and codec identity/version/source under its selected native profile.
The portable transport verifier treats those independently admitted bytes as
opaque and immutable; it cannot turn arbitrary bytes into namespace authority.
Complete source/canonical owner value parity, typed catalog/key correspondence,
bucket collision enumeration and native uniqueness/current-authority guards remain
separate obligations. Installer-only native BYTEA round trips cannot establish
protected graph writer or read-profile acceptance. Private metadata/bytes remain
unpublished before full read admission; this component is not a post-fetch access
filter or permission to publish a matching stored payload.

### Namespace and stored-key binding spike — 2026-10-08

The portable Truss namespace verifier preserves the exact native canonical eight-string vector and validates bounded scalar text and canonical int4/smallint tokens. Profile 0.1 permits positive identifiers; profile 0.2 can represent signed and zero identifiers. This is representation compatibility, not acceptance of a key definition or installation of profile 0.2. Four Z3 checks prove conditional mathematical range/render/parse properties and detect absolute-value renumbering; they do not prove the implementation, migration, or registry authority.

A stored-key assembly binds the registered UMF tuple producer's bundle pin to the namespace codec pin, captures producer methods and selection before awaiting canonical verification, and requires exact namespace and tuple bytes. Original native output, foreign namespace refusal, changed caller selection, codec mismatch, and method replacement while verification is pending are checked. The canonical callback and producer remain trusted host inputs; equality cannot authenticate either input, a namespace installation, or the current authorization cut.

The first namespace native probe passed 23 observations. Subsequent factory changes have current Bun and Chromium replay evidence against those retained canonical observations, not fresh native execution: Docker stopped responding before the rerun could create a fixture. The historical native receipt remains retained separately. Stored-key assembly has five current Bun checks and four real Chromium checks against retained native bucket bytes. No graph backend acceptance criterion is promoted by these component observations.

### Async original-key capture correction

Race controls found that the initial stored-key assembly reread caller-owned stored key/value objects after awaiting canonical namespace verification. An initially invalid stored key or value tuple could be repaired during the await and then accepted; initially valid bytes could be changed and rejected. `stored-key-await-counterexample.json` retains the pre-fix source snapshot and three failing controls. The correction copies stored bytes and evaluates original tuple correspondence synchronously at operation entry, before namespace verification waits. Unsupported clone/producer inputs refuse. Namespace authority and the final-release authorization guard remain separate prerequisites; this capture correction is not revocation correctness or a permit.

Current assembly evidence expands to eight Bun checks and seven real Chromium checks, including those three interleavings against the original registered UMF producer and retained native bytes. No fresh native execution or complete backend criterion is inferred.

### Astra ultra review: scoped unknown composition

The owner-requested Astra ultra review found that two scoped permits were combined with OR of `IS TRUE`, allowing T to override another permit's U. CONTRACT-062 and the shared evaluator require all scoped rules to be determinate. The native pre-fix counterexample is retained with exact archived source and probe: a real-owner policy changed membership from require to permit, then deliberately removed the subject for primitive diagnostics. The emitted SQL granted RA; expected final eligibility was false. This is an invalid subject-cut diagnostic, not a claim of a valid production collection bypass.

The actual Truss lowerer now guards every permit condition against NULL when multiple permits are scoped. Single-permit, require and forbid checks already exclude U. Native owner-derived variants verify both permit orders, T+U, F+U, and irrelevant actions/targets, within 78 total observations. Three conditional Z3 checks establish scoped eligibility algebra under scalar truth and scope-correspondence premises. Source pins and these mathematical checks do not prove full native deployment or complete collection admission.

### Compiler-derived original field/operator boundary

The actual Weft owner now exports authored source/ontology/policy/profile artifacts for all five original salary query uses: predicate, order, group, join and aggregate. All bind to the separate `querySalary` action; read permission cannot substitute. Missing, duplicate, wrong-field and read-as-original bindings refuse. A deliberately authored `unrelatedOriginal` action with broad permission creates a different source-qualified profile when selected: it cannot substitute for the installed profile.

The actual portable Truss `security-query-use.ts` consumer emits a finite native application plan from the owner IR, rather than accepting caller-supplied native SQL. It consumes every extracted field/operator use, refuses protected original-value projection and unknown capabilities, and captures immutable profile/action/mapping inputs. This first consumer admits required unrefined text and signed64 integer operations, equal predicates/joins, ascending order, grouped COUNT and SUM. History/page/limit and resource-dependent original-value permissions refuse; their broader implementation remains required. Original-action conditions must be resource-independent so authorization can precede a query even with no matching rows.

The native installer replays and compares the actual original owner output before generating private source views and fixed parameterless definer routines. Each routine checks the exact original action first, then executes the emitted query with compiler-derived row membership. Ordinary users cannot select the original salary view/carrier; only separately authorized Alice obtains exact authored outputs. Bob and the outsider refuse for both populated and empty query variants. Native int64 extraction refuses wrong carrier/decimal/range rather than converting through JavaScript numbers; result scalars retain native lexical text.

Current evidence has 10 owner observations/six artifacts, 62 actual PostgreSQL 17.9 observations, and ten program/four refusal correspondences in Chrome 153.0.8010.12. Original routine owner, no-super/no-bypass, definer, STABLE, fixed search path and PUBLIC execute absence are independently observed. Complete source/issuer authentication, current-authority/final release, privacy closure, broad property projection and public compiler activation remain unqualified. This is a first actual owner-to-native query-use integration component, not full B08 or an actual Truss graph profile.

### Query-use binding and eligible source completeness — 2026-10-08

The experimental raw query home is now captured as exact original binding bytes (`truss.security.raw-query-home/0.1.0`). The portable consumer verifies binding, ontology and profile hashes, joins the profile binding to the handoff binding, checks native mapping against captured binding content, derives protection and operator/action selection from the captured ontology/profile, and captures inputs synchronously before asynchronous hashing. These establish source correspondence under the trusted original-owner premise; hashes do not establish issuer authenticity or current authority.

Before every application statement, the fixed native routine requires exactly one private original carrier with non-null required native fields for each eligible root row. Original action admission and this collection check precede application filtering, including empty results. Fresh PostgreSQL 17.9 evidence passes 74 observations: missing eligible carriers refuse all ten populated/empty routines, exact restoration recovers the result, and deleting an ineligible carrier does not alter the eligible aggregate. This does not yet qualify arbitrary domains, graph storage, concurrent authority changes or full privacy closure.

Real Chromium 153 matches ten native programs, refuses nine profile/capability/projection/action/mapping/source substitutions, and confirms that input mutation cannot change the captured result or repair an initially invalid mapping during asynchronous validation. The complete 132-case goal remains unchanged; B08 and the full backend acceptance criteria remain open.

### Conditional original-source completeness theorem — 2026-10-08

`original-source-completeness-formal.json` retains four quantified Z3 checks over arbitrary eligible resource populations. An independently stated universal specification (each eligible resource has exactly one carrier with all required fields) is equivalent to anti-existence admission. Empty application results cannot hide unavailable source; unauthorized original actions and duplicate/null carriers cannot admit. Each check has an UNSAT violation, SAT weakened control and SAT positive control. Exact native key correspondence, truthful eligible-root RLS, complete carriers, field availability, independent action authorization and a stable authority/source cut through final release are explicit premises. This proves the admission algebra, not SQL generation or backend isolation. The current 74 native observations cover missing eligible carriers and restoration, but do not establish every formal premise or all duplicate/null implementations. Full B08 and graph/native acceptance remain open.

### Hidden carrier error interference counterexample and native fix — 2026-10-09

The expanded native test found an actual privacy counterexample: changing only unreadable RB salary to JSON null made Alice's eligible predicate query fail. The vulnerable fixture source and observed failure are retained as `original-use-hidden-carrier-vulnerable.py.txt` and `original-use-hidden-carrier-counterexample.json`. Root RLS alone did not isolate malformed carrier evaluation in the native query.

The fixed spike installer enables and forces SELECT membership RLS on the private original carrier relation, using the same compiler-derived read membership predicate. PostgreSQL catalog observations independently verify enabled/forced RLS, guardian ownership and the authored SELECT policy. Fresh PostgreSQL 17.9 evidence passes 240 observations, including all five malformed hidden-carrier variants across all ten operator/empty-result programs: eligible outputs remain unchanged and client diagnostics are empty. Restoration, eligible missing/malformed/duplicate refusal and private-source access controls also pass.

Physical lowering must isolate every protected carrier before operations that can evaluate its stored values or errors; root row filtering plus a private view alone is insufficient evidence. Require either native policy on the carrier or an independently validated equivalent barrier, including hidden malformed-value regression controls. This applies to raw and graph carrier homes. The fixed authored installer is still a spike; native dependency/source sealing, concurrent authority cuts, timing/log noninterference, full backend B08/B10 and public compiler activation remain open. Full gate remains 22/132.

### Captured complete physical mapping inputs — 2026-10-09

Experimental raw-query-home binding 0.2.0 includes the subject and complete authored physical type mappings (root, subject and associations), in addition to the original carrier home and target. The portable consumer compares captured inputs to the exact original binding and the profile/handoff binding identity before lowering. The reviewed bridge reads physical mappings from these captured bytes. This closes the prior caller-substitution gap for completeness-root and policy association mappings; binding hashes establish correspondence, not issuer authenticity or native catalog equivalence.

Actual owner export passes ten checks/six artifacts; freshly replayed native programs retain 240 passing observations. Four conditional source-completeness proofs are refreshed against the consumer source. Chromium controls additionally refuse substituted root table, association field column and subject type. Native mapping admission, schema drift/epoch, authenticated source custody and final-release guards remain host duties and open backend acceptance. Full gate remains 22/132.

### Cross-source ontology/profile join — 2026-10-09

The portable original-use consumer now requires the profile's ontology digest to equal the captured handoff/ontology digest, and requires the selected subject to equal the ontology subject. Individual matching source hashes alone did not establish these joins. Chromium's new substitution control changes the ontology revision and recomputes its standalone handoff hash while retaining the original profile; the consumer refuses. This is cross-source identity checking under trusted owner provenance, not source authenticity or proof that logical IR was compiled correctly. Native programs retain 240 passing observations and the four conditional completeness checks remain scoped to their explicit premises. Full backend gate stays 22/132.

### Pinned compiler handoff snapshot — 2026-10-09

The portable original-use consumer now requires an expected SHA-256 for the canonical complete handoff snapshot, including logical plan, application plan and query-use lineage. The reviewed fixture host computes the pin only after fresh original-owner replay; later handoff mutation refuses before rendering. This closes consumer snapshot substitution under the trusted pin-provider premise. A caller-supplied pin is not authority: public activation must establish this custody independently, and that protocol remains open.

Chromium controls remove the application filter while retaining the original pin and supply a wrong handoff pin; both refuse. Existing capability/projection/action/cross-source semantic controls recompute their altered snapshot pins so their rejection still tests independent admission rules rather than only snapshot identity. Fresh native programs retain 240 passing observations and conditional completeness proof scope is unchanged. Complete compiler refinement, trusted public issuer/pin custody, native epoch admission and final release remain unqualified. Full gate stays 22/132.

### Conditional hidden-carrier error isolation theorem — 2026-10-09

`carrier-error-isolation-formal.json` records four quantified two-world Z3 checks. Worlds share eligible resources, original action authority and all eligible carrier validity/cardinality while hidden carrier content is unconstrained. Eligibility-limited evaluation preserves admission and carrier-error outcomes; no eligible resources means no carrier error; malformed eligible carriers cannot admit. Each check retains an UNSAT violation, SAT negative control and SAT positive control. The all-carrier evaluation mutant yields a concrete SAT hidden-error interference control corresponding to the observed PostgreSQL regression.

The theorem requires exact eligibility, complete source cardinality, evaluation confined behind a truthful native barrier, faithful scalar domain checks and a stable source/authority cut. It does not prove the PostgreSQL optimizer/barrier, graph/Delta mapping, arbitrary result values, timing/log/diagnostic payload noninterference or full backend refinement. The 252 native observations remain separate empirical evidence for the fixed PostgreSQL raw spike. Required B08/B10/B15 backend cases must establish these premises rather than inheriting acceptance from an abstract proof.

### Typed original-query binding readiness — 2026-10-09

Fresh original inspection-owner replay confirms that the current Truss original-query consumer refuses explicitly bound Resource root discriminators with text, int4 and exact int8 carriers (including 9007199254740993). Each replay rehashes the complete physical binding into the original query profile and obtains a new original handoff before invoking the actual portable consumer; unchanged old handoff hashes are not used to fabricate this result. truss-query-typed-readiness.json retains all three sources/handoffs/refusals. This is a support-boundary observation, not actual installed graph execution or an accepted backend case.

The current raw-query-home/0.2.0 binding cannot establish typed private-carrier identity. Before admitting typed graph original-query use, its replacement must independently bind the complete root and carrier type selectors and exact key correspondence. Every source/join alias must apply the selected carrier type; collection completeness must range over eligible roots of only the selected type and count carriers of that same bound type/key, before application filters. A sibling type with the same local key must neither satisfy completeness nor affect errors, grouping, ordering or sums. Missing/unknown/native-null selectors must refuse. Original resource-independent action admission needs an explicit selected-type contract: the row-predicate emitter currently requires a native root discriminator parameter even for such actions. Do not drop type constraints or synthesize a native parameter to bypass that requirement.

Actual current Truss node/key/scalar/edge and history homes must come from original installed catalog correspondence, not guessed table names or synthetic projected rows. The next implementation boundary is a compiler-owned qualified typed physical binding plus independently checked native carrier/root correspondence, followed by actual Truss storage installation. This requirement does not redefine the full goal around raw-table support. All 30 Truss and all 30 Ashlar backend cases remain required and open.

### Quantified typed carrier completeness — 2026-10-09

prove-typed-source-completeness.py and typed-source-completeness-formal.json retain four Z3 4.15.4 conditional checks over arbitrary uninterpreted type/key domains, arbitrary eligible populations, and nonnegative carrier counts. The selected-type universal completeness specification equals anti-existence admission; a sibling carrier cannot fill a missing selected-type carrier; arbitrary sibling count/required-field changes leave admission unchanged when selected-type facts agree; and type-plus-key matching excludes a sibling's colliding local key. Every violation query is UNSAT, every weakened negative control is SAT, and every admitted positive population is SAT. The type-erased control explicitly admits a sibling carrier while the selected type has zero carriers.

These checks establish the admission algebra required by the next typed physical binding. They assume truthful complete eligibility/cardinality/availability, injective native/logical identities, independent original-value authorization and a stable authority/source cut. They do not prove a binding API, native SQL emission, database error isolation, query result/group/order behavior, original-source authenticity or actual Truss/Ashlar storage refinement. No JavaScript number or invented native table identity participates. Current raw-query-home/0.2.0 typed-root refusal remains required until those physical obligations are implemented and qualified. Full backend acceptance stays 22/132.

### Portable typed completeness SQL builder — 2026-10-09

Implemented security-source-completeness.ts in the actual Truss PostgreSQL package and integrated it into the original-query consumer's admitted raw completeness path. The builder binds separate root/carrier selectors, exact qualified key fields and required carrier fields. It refuses one-sided typing, malformed references, duplicate logical fields or physical key/carrier columns, unsupported selector carriers and noncanonical/out-of-range integers. Integer selector transport stays lexical with exact BigInt admission and native typed SQL literals. No graph table allocation is inferred.

The owned PostgreSQL 17.9 spike now executes fifteen additional physical witness controls across text, int4 and int8 selectors, including 9007199254740993. For each selector: a malformed sibling field does not block selected-type completeness; a sibling cannot fill a missing selected carrier; sibling duplicates do not block; selected duplicates refuse; an untyped carrier binding refuses before SQL. Native receipt passes 418 observations. These authored witness tables establish SQL behavior only; they are not actual installed graph stores, compiler-owned typed binding or independently qualified eligible-root/carrier RLS.

The raw consumer's ten owner-derived programs remain equivalent in Chromium 153.0.8010.12, including fifteen refusal controls. This browser run exercises the integrated raw path; typed native SQL witnesses have no separate typed browser qualification yet. Fresh original-owner typed-root readiness still refuses all three selectors under raw-query-home/0.2.0, as required until the typed binding, query alias selection and typed original-action contract are implemented. Nine component groups and 78 evidence checks pass; traceability remains current at 470 criteria. Full acceptance remains 22/132.

### Typed completeness browser qualification — 2026-10-09

Closed the explicitly recorded browser gap for the physical typed completeness builder. truss-source-completeness-browser.ts builds the actual Truss helper as browser ES modules, executes it in Chromium 153.0.8010.12, and retains three exact host/browser SQL correspondences for text escaping, int4 and int8 selector 9007199254740993. Eight independent malformed-input variants refuse with the declared unsupported result: absent carrier selector, signed64 overflow, noncanonical integer, empty qualified reference, duplicate qualified carrier field, duplicate physical carrier column, NUL namespace and unknown selector carrier. The browser has no Bun/process/Buffer globals and makes zero external requests. Source hashes and exact inputs/SQL/refusal outcomes are retained in truss-source-completeness-browser.json.

This establishes portable SQL generation/refusal behavior for this helper, alongside separately retained native typed witness SQL execution. It does not establish compiler-owned typed binding, typed application alias selection, original-action admission, root/carrier RLS, source authenticity or actual graph storage installation. Typed original-query admission remains refused under raw-query-home/0.2.0. No additional required backend case is accepted; the full gate remains 22/132.

### Astra typed-builder review and malformed selector repair — 2026-10-09

Direct inspection first found null/absent physical metadata escaping as incidental JavaScript TypeErrors; the helper now normalizes capture/generation failures to TRUSS_SECURITY_SOURCE_COMPLETENESS_UNSUPPORTED. Astra independently identified the stronger P2 defect: falsy provided selectors (null, false, zero or empty string) were interpreted as omitted and emitted untyped TRUE predicates. The helper now treats only undefined/absence as untyped, validates every provided selector as an object, and compares selector presence explicitly.

Chromium 153.0.8010.12 passes three exact typed SQL correspondences and 24 malformed input refusals, including all twelve both/root-only/carrier-only falsy combinations. Astra's direct Bun re-review confirms those twelve refusals, preserves valid omitted raw selectors, and reports no further actionable type/key SQL or proof-scope defect. Native PostgreSQL 17.9 still passes 418 observations; original raw-path browser correspondence passes ten programs/fifteen controls; typed owner readiness still refuses three profiles. Nine component groups, 79 evidence checks and the 470-criterion traceability check pass.

Retained typed-completeness-falsy-selector-counterexample-variant.ts.txt and its focused JSON receipt reproduce twelve untyped outputs when the identified conditions are reinstated. This is explicitly a reconstructed tested variant, not a claimed original source snapshot. Original historical receipt fingerprints were refreshed before an immutable pre-fix archive could be retained, so no original-byte archive correspondence is asserted. The defect and repair do not promote any graph/backend case. Current source/issuer/installed storage and typed query admission obligations remain open; full acceptance remains 22/132.

### Original Truss graph correspondence boundary — 2026-10-09

Current-source inspection retains four original source/contract pins in truss-graph-correspondence-readiness.json. stageNewCatalogCohort returns provisional_new_catalog_staging_only; its allocated rows do not establish committed current catalog admission. The native new-catalog collector independently reconciles Record/Field storage IDs and creation revisions with original archived declarations. Default property home selection applies only to absent binding under ADR-002; explicit home interpretation remains separate. CONTRACT-007 requires business-key components distinct from opaque object storage IDs, object/type_id/props and edge/rel_type_id/props correspondence, canonical allocated property member names, and independently qualified state/node/scalar joins for row homes.

Therefore a typed security binding must retain original current catalog/layout custody and explicit native property-home correspondence, rather than reconstructing flat column maps from a provisional allocation or review-only schema export. Record type IDs, relationship type IDs and association-owner type IDs are separate identities. JSON-home scalar extraction and ordered key-component materialization must use original property catalog IDs and original native codecs; row homes must preserve complete state/presence/absence/domain guarantees. Carrier construction must retain its own type/key/source proof through eligibility, original-value use and final publication. The current flat SecurityPhysicalType.fields column subset and raw-query-home/0.2.0 do not realize those graph obligations.

Next implementation must close original admitted catalog/layout observation, property-home projection/codec correspondence and business-key materialization together with the typed compiler binding. Typed completeness SQL alone cannot qualify actual graph queries. This is source-derived readiness evidence only, not executed current graph state, source authentication or additional accepted cases. Full gate remains 22/132; all graph and Delta requirements remain intact.

### Graph storage/business-key correspondence algebra — 2026-10-09

prove-graph-key-correspondence.py retains three Z3 4.15.4 conditional checks in graph-key-correspondence-formal.json using separate uninterpreted storage-identity and logical-business-key domains. A truthful original-key projection preserves equality selection; separately qualified selected-key uniqueness excludes equal business keys on distinct storage owners; changing unrelated storage identities cannot change logical selection when original keys agree. Each safety violation is UNSAT, weakened control SAT and positive population SAT. An unqualified storage-ID cast has a counterexample selecting the wrong original key. Distinct storage IDs without the independently admitted key constraint permit equal business keys.

The selected-key uniqueness premise applies only within the separately qualified logical type/key namespace, not globally across all graph objects. Projection truth, original catalog/property/codec correspondence and native key namespace uniqueness must be established by implementation evidence; this algebra does not prove them. No SQL, JSON/row codec, compiler projection, graph installation or backend case is accepted by this proof. The typed binding port must consume compiler-owned property decoding and original native correspondence rather than casting object storage IDs or implementing a parallel guessed decoder. Full backend gate remains 22/132.

### Private insert-counter diagnostic counterexample — 2026-10-09

Extended the actual owned PostgreSQL 17.9 private-fact probe beyond the prior three known restricted diagnostic families. pg_catalog.pg_stat_get_tuples_inserted(oid) remains executable by Alice, Bob and outsider and exposes the private Assignment insert count. A second unrelated Eve Assignment advances that count exactly once for all three ordinary identities while each independently checked authorized Resource set stays unchanged. Restricting that exact additional function blocks ordinary invocation without changing authorized reads. pg-private-diagnostics.json now retains 21 observations including both worlds and the scoped restriction.

All catalog privilege changes occur only in the disposable owned fixture. These database-wide PUBLIC restrictions are a prototype, not a selected multi-tenant production deployment or a proved per-user policy. Restricting four known families does not establish complete metadata/statistics/function/view closure. pg-raw.B10 and US-056-AC8 remain open; direct private-table SELECT denial cannot qualify them. The next backend implementation must inventory and qualify the complete ordinary diagnostic surface and deployment scope, or refuse ordinary paths that cannot meet the selected privacy guarantee. Full acceptance remains 22/132.

### Deny-first native diagnostic candidate — 2026-10-09

Extended the owned PostgreSQL 17.9 diagnostic spike with a separately scoped candidate: ordinary subjects have no direct SELECT on security_raw relations/views or pg_catalog relations/views and no explicit EXECUTE on pg_catalog routines; the excluded guardian receives the built-in execution capability required by the private fixed-search-path read routine. Ordinary callers receive only that routine's explicit EXECUTE for this read surface. Forced resource RLS and SESSION_USER-based membership still govern its original authorized rows. Existing direct-RLS profile evidence is neither silently replaced nor promoted by this candidate.

Alice, Bob and outsider retain their actual ordinary native identity and exact authored authorized rows. Each refuses six known direct-root/catalog-view/cumulative-statistics/relation-size/private-EXPLAIN probes without output. Independent assessor ACL queries confirm zero effective SELECT privileges on all selected pg_catalog and security_raw relations/views, zero effective explicit EXECUTE privileges on catalog routines, and no CREATE in pg_catalog or public for each actor. pg-private-diagnostics.json now retains 27 observations. All catalog PUBLIC ACL changes are isolated to the disposable owned database.

These native ACL and row outcomes are stronger than a growing list of individual statistics revocations, but do not establish full diagnostic closure: implicit operator/type/language/extension behavior, other command surfaces, owner/dependency/role change closure, deployment isolation, approved client compatibility, current authority and final delivery still need independent qualification. Full graph and Delta implementation remains required. pg-raw.B10/US-056-AC8 and the full gate remain open at 22/132.

### Deny-first native command and wrapper controls — 2026-10-09

The separate PostgreSQL 17.9 candidate now revokes ordinary direct EXECUTE on security_raw helpers and regrants only the admitted protected-read routine for this surface. Guardian retains its own helper authority and the separately excluded built-in execution capability. Existing direct-RLS profile behavior is unchanged outside this candidate's disposable fixture.

For Alice, Bob and outsider, COPY of private Assignment, JSON EXPLAIN of the private table, direct allowed() invocation, and a caller-owned temporary SECURITY DEFINER function forwarding to the private statistics getter all refuse with no output. The temporary wrapper runs under its ordinary owner's rights and cannot acquire the guardian capability. Separately, nonexecuting JSON EXPLAIN of the admitted definer read call remains identical after an unrelated Eve Assignment is added and analyzed; exact authorized rows also remain identical for all three identities. Native receipt now retains 33 observations.

These tests address actual native command and caller-wrapper paths and a specific observable plan boundary. They do not prove timing, executing EXPLAIN, every implicit operator/type/language/extension surface, privilege/dependency drift, public runtime activation or streaming/final-release custody. pg-raw.B10 remains open; no raw, graph or Delta case is promoted. Full acceptance stays 22/132.

### Native operator/function ACL boundary — 2026-10-09

The owned PostgreSQL 17.9 candidate now tests an installer-created unary operator in the ordinary reachable security_raw namespace, backed directly by the denied pg_stat_get_tuples_inserted(oid) function. Alice, Bob and outsider all refuse both direct function and operator invocation with no output. An explicit temporary per-role EXECUTE grant then makes the identical operator return the exact assessor-observed private count for all three identities, proving the operator/control is live rather than malformed. The grant is revoked and the operator removed before fixture cleanup. pg-private-diagnostics.json now retains 39 observations.

This establishes native behavior for that exact operator/getter/role path and the value of its explicit function privilege boundary. It does not establish every operator, cast/type, language/extension or changed dependency under a full deployment. The positive control intentionally admits the diagnostic only inside the owned disposable fixture and is retained as a negative privacy profile. pg-raw.B10 remains open; full acceptance remains 22/132.

### Native raw PostgreSQL scale and statement-budget evidence — 2026-10-09

pg-raw-scale.py executes the actual forced-RLS raw fixture at 1,000, 100,000 and 1,000,000 additional Resources, with deterministic complete A/B ownership. All three original ordinary identities match independent authorized counts and exact boundary identity/value samples at every scale. Actual total stored rows are independently checked, including the five baseline Resources. Full protected Alice and excluded-assessor EXPLAIN ANALYZE JSON plans are retained in pg-raw-scale.json; the assessor is explicitly outside ordinary protection.

The latest run records protected/assessor execution times of 5.796/0.050 ms, 592.880/2.505 ms and 6176.115/14.193 ms at the three sizes. These are distinct access paths and output populations on one owned host, not a general percentage-overhead promise or SLA. The protected function checks membership per source row. A selected native 1 ms statement timeout on the million-row aggregate refuses with SQLSTATE 57014 and no stdout/partial aggregate. Every native subprocess is bounded and only the original UUID-labeled fixture is removed after source correspondence checks.

This completes empirical scale-plan and database-statement-budget observations for the authored raw component. It does not prove portable runtime cancellation/drain, reusable connection cleanup, streaming/final-publication custody, arbitrary workload budgets, complete diagnostic closure or actual graph/Delta performance. pg-raw.B16/US-056-AC10 remain open until the admitted runtime/backend profile exercises those obligations. No required case is promoted; full acceptance stays 22/132. Nine component groups, 82 evidence checks and the 470-criterion traceability check pass.

### Actual scale runtime and bounded response window — 2026-10-09

The owned raw PostgreSQL17.9 scale fixture now executes million-row ordinary aggregates through actual Truss pg-runtime/pg8.16.3 with original memory/disk protocol correspondence. The first positive run failed into quarantine under the fixed 5000ms response window while the protected native plan measured 6201.223ms; close masked the preceding exception. scale-fixed-deadline-failure.json retains source archives and original uncertain journals. It does not assert an independently captured exact deadline event or native SQLSTATE for that failure.

CONTRACT-063 now defines the experimental originalResponseTimeoutMs option (default5000, selectedinteger1..60000). Runtime construction validates and captures it synchronously; originalQuery also validates the bounded window. Expiry remains uncertain transport custody, never native cancellation/rollback acknowledgment. The scale fixture selects30000ms to admit the known positive workload, separately from the native1ms statement budget. Invalid zero/negative/oversized/fractional/nonfinite/string/null selections refuse. Response timing remains subject to host event-loop/transport scheduling; no arbitrary-workload SLA or completed cancellation is asserted.

Fresh pg-raw-scale.json passes three scale stages (1k/100k/1M additional resources plus the authored baseline), native CLI timeout, and39 actual-runtime observations across76 original journaled queries. All ordinary actors return exact text aggregate counts. The million-row native budget returns57014 withzeroDataRows andReadyE; a following statement returns25P02, and only explicitROLLBACK restores the same nativePID and exact authorized baseline IDs. The ownerless recovery control now uses the actual RO key rather than the erroneous R0 spelling found by Astra. Selected cancellation context still refuses beforeBEGIN.

Latest paired protected/excluded-assessor plan times are5.780/0.055ms,595.005/2.316ms and6140.543/9.776ms. They are distinct access paths/output populations on one host, not a percentage-overhead guarantee. B16 remains unregistered pending an independent scale oracle, freshgate UUID/case binding, complete actual native inventory and explicit external runtime source-binding policy. Astra confirms the exact B16 assertion can be exercised at this authored stable cut without waiting for unrelated graph/Delta, diagnostic or revocation-streaming cases; those full requirements remain separately open. No case is promoted by this component receipt.

### Raw PostgreSQL B16 accepted at authored stable cut — 2026-10-09

Implemented and freshly accepted pg-raw.B16 under STP-056/US-056-AC10. The reviewed runner tests exact total resource populations1000/100000/1000000, independently authored aggregate counts and samples for three ordinary SCRAM identities, paired protected/excluded-assessor native plans and actual pg-runtime execution at every scale. The million-row native1ms budget produces57014 withzeroDataRows/ReadyE; subsequent use produces25P02 until explicitROLLBACK, after which the same original nativePID returns authorized baseline IDs. Unsupported cancellation context refuses before nativeBEGIN. The recovery candidates include the actual ownerless RO record.

pg-raw-B16.json retains133 exercising observations, native objects/RLS/policies/routines/roles/membership/grants/indexes/constraints/authentication, all three plans and54/54/76 original journaled queries. Eighty-three source pins include every adapter module, independent oracle and selected managed dependency source:14 packages/70 JS/JSON files. Actual driver resolution is observed from both the UMF probe and Truss runtime importer. Astra caught and repaired the initial importer-origin gap and oracle-budget drift risk; supported statement budget/error states are validated and consumed, recovery expectations are consumed, and exact required populations are enforced. Re-review found no remaining actionable source/evidence-binding/native-inventory defect before the fresh gate.

The gate explicitly permits shared pg-runtime and task-managed dependency sources for raw PostgreSQL, as specified by CONTRACT-063; this does not imply graph storage qualification or authenticate source issuers by hashes. The complete gate now accepts23/132 required cases and leaves109 missing/failed. All28 complete security acceptance criteria remain open; AC10 still has other required evidence/implementations. B16 establishes only this authored raw workload at a stable cut, not arbitrary workloads, timing SLAs, streaming/final delivery, complete diagnostic closure or graph/Delta behavior. The older pg-raw-scale.json component uses additional populations plus baseline and is distinct from the exact-total B16 acceptance receipt.


### Native hash collision and conditional key refinement — 2026-10-09

CONTRACT-062 requires complete typed Key identity rather than a hash alone; CONTRACT-063 requires exact native correspondence. The independently frozen PostgreSQL 17.9 corpus now includes `hash-key-13383` and `hash-key-42423`. Separate original native evaluations verify both `pg_catalog.hashtext` results as exact text `-1315717682` before the collision test proceeds. The native fixture stores generated routing hashes, retains full resource IDs in primary/foreign key constraints, and indexes candidate hashes. Forced RLS consults a private helper that compares both candidate hash and complete resource ID before accepting Project assignment. Ordinary SCRAM Alice/Bob see their respective resources; outsider sees none. Replacing that predicate with hash-only equality leaks both resources to both assigned actors; restoring exact equality restores the oracle. All three profiles independently check outsider denial.

The source-current identity receipt passes 52 native observations. This adds a fixed real native hash collision to the preceding scalar/composite resource and qualified subject witnesses. It does not qualify arbitrary hash algorithms, hash-based subject enrollment, cross-home/graph identity or public compiler admission. Full pg-raw.B13 remains required and unaccepted.

`tools/security/prove-hash-key.py` and `hash-key-formal.json` retain two conditional Z3 4.15.4 checks over an unbounded uninterpreted complete-identity domain, arbitrary authorization predicate and deterministic non-injective hash. Independently stated direct authorization equals existential lookup with hash plus exact identity. The violation is UNSAT; a colliding positive population and a hash-only false-positive control are SAT. Complete truthful identity equality, the same hash semantics on each side, complete current facts and native eligible-only evaluation remain physical/authority premises. This is a refinement of the abstract lookup expression, not a proof of the SQL implementation or complete compiler/backend.

Aggregate components pass nine groups; evidence validation now includes the new proof receipt and passes 86 checks. The full acceptance state remains 23/132, with 109 required cases missing/failed and all 28 complete security criteria open.


### Raw PostgreSQL B13 accepted at authored stable cut — 2026-10-09

The fresh complete gate accepts pg-raw.B13 under US-056-AC1 with 144 observations. The fixed PostgreSQL 17.9 raw profile uses non-null ordered TEXT identity components, explicit C collation and exact session-bound subjects. It does not hash subject identities. Scalar case, normalization-distinct and supplementary Unicode, delimiter-bearing composite keys, equal Staff labels in distinct namespaces, and a real native hashtext collision remain isolated. Genuine case-distinct quoted/unquoted table homes carry equal local resource labels with opposite Project ownership. Deliberately lossy delimiter, subject-label and hash-only policies disclose both resources to assigned actors; exact restoration recovers the independent oracle. No general compiler activation or graph/lifecycle support follows from this case.

The public actual pg-runtime decoder independently exercises scalar/composite/hash/quoted homes and unfiltered final corpus reads for three ordinary SCRAM actors. It retains 81 original queries with exact memory/disk request-frame-outcome correspondence and unique complete custody. Missing and duplicate-replacement controls refuse. Exact independent schema/table/routine privileges and effective column permissions are asserted, including no authority-table writes; all 16 installed identity/authority fact sets are independently compared. Native columns/collations, ordered constraints/FKs, generated hash expressions, routines/policies, role attributes/membership, authentication, encodings, client build and image identity are retained. Eighty-six source bindings include actual adapter modules and the selected managed pg8.16.3 closure (14 packages/70 files); actual resolution from both probe and importer matches the selected entry.

Astra ultra identified the quoted-home, decoder, full-fact, privilege-assertion and journal-bijection gaps, then found no actionable issue after the fresh 143-observation component replay. The first gate attempt refused duplicate relative/absolute source-path bindings; the second refused unordered JSONB member serialization in one private fact comparison. Both attempts and source archives are retained as b13-registration-path-failure.json / b13-registration-json-order-failure.json. The corrected runner pins one exact test-source spelling and applies the membership runner's existing unordered-object normalization to evidence, preserving arrays/scalars and original journal bytes. The third fresh full gate accepted B13.

Current full acceptance is 24/132, with 108 required cases missing/failed. All 28 complete security criteria remain open. Ten component command groups pass, including repeatable strict identity-runtime TypeScript checking; evidence validation passes 88 checks and the 470-criterion ledger is current. B13 qualifies the authored raw identity assertion at fixed stable cuts. Arbitrary cross-home/hash algorithms, authenticated enrollment/issuers, complete native/compiler refinement, live concurrent authority/final publication, full raw backend and actual graph/Delta acceptance remain independently required.


### Installed routine body source correspondence — 2026-10-09

The persistent raw probe now compares native pg_proc.prosrc against exact body bytes extracted from the three fingerprinted fixture SQL files in installation order. The reviewed parser admits only named functions with literal dollar-quoted bodies; the later revoke_alice replacement supersedes its earlier definition. The exact qualified set contains nine routines. Native enumeration covers every routine in both protected schemas, so an extra overload or routine changes the observed list and refuses correspondence. Existing independent signature/owner/definer/settings/ACL checks remain separately required.

A transactional control replaces only the retirement body with an unconditional return. It rejects the source baseline, matches an explicitly authored one-body mutation and demonstrates that a name-only assessor would miss the change. Rollback restores all bodies; each of the five final schedule cuts independently repeats complete correspondence. Eight complete expected/native body snapshots and two drift/control observations are retained. Evidence validation requires all ten assertion identities and all nine typed body records at each snapshot.

The native run passes1431 unique matching observations across five schedules, with90 current source digests. Astra ultra independently extracted all routine bodies, confirmed the later override and exact mutation/restoration/final snapshots, and found no actionable defect. This is installed-source correspondence for the reviewed PostgreSQL17.9 fixture subset, not independent semantic correctness, general SQL parsing, complete resolution/dependency inventory or public native admission. B12 and L03 remain unregistered; full backend acceptance remains26/132 and the original goal stays active. Twenty-seven component groups and107 evidence checks pass. Astra independently checked the source-coverage expression and rejected thirteen missing, duplicate or malformed evidence variants, finding no actionable defect.

### Original catalog staging and native graph locators — 2026-10-09

`truss-graph-native-stage.json` retains a fresh PostgreSQL 17.9 rollback-only spike through the actual Truss pg-runtime. The original registered UMF record preparation and catalog staging allocate Employee, Project, their properties and keys, and the directed WorksOn relationship from the original authored document. Native object and edge rows retain exact TEXT bigint/int locators and property bags. The private graph projection resolves complete `(object_id,type_id)` endpoints against the native declared relationship triple. A reversed endpoint insertion with both typed objects present and a fresh numeric route fails specifically with `23503 / edge_endpoint_types_fk`; savepoint rollback restores the complete edge inventory.

All eleven distinct observations match independently stated expectations. The bootstrap public head remains revision zero, and the operation commit barrier remains ALWAYS, deferrable and initially deferred. Explicit rollback removes the provisional catalog, objects, edges and original operation. The source inventory retains 754 current digests, selected pg dependencies and the resolved Ajv compilation closure; actual pg resolution from both probe and runtime importer matches the selected driver entry. Astra ultra independently checked the receipt, all 88 Ajv files loaded during schema compilation, endpoint refusal and restoration, and cleanup behavior, reporting no remaining actionable defect in this component.

This is owner-export layout 0.15 and original UMF record 0.7 evidence. Fixture object/edge creation uses excluded installer-supplied IDs, including equal numeric object IDs in different types. Normal allocation requires the shared sequence and prohibits caller-supplied IDs. The complete native DDL's UNIQUE `edge_out(source_id,rel_type_id,target_id)` prohibits duplicate relationship/numeric-endpoint pairs; preservation of supplied edge identities in a pure projection does not establish native parallel-edge support. No ordinary subject enforcement, committed catalog, original key-bucket materialization, property codec, policy compiler, authenticated authority/source cut or full graph backend acceptance follows.

The next physical composition must derive complete key bytes with the original registered value producer and derive the namespace from the actual allocated type/key definition and admitted namespace context. It must persist membership through `runtime_stage_object_key`, observe the resulting typed native owner, and compare complete namespace/key bytes before graph selection. `operation-generation-observer` must accompany this persistence: key mutation advances both the bucket guard and original operation generation and invalidates prior readiness/seal/application state. Evidence must capture and recheck the final generation after mutation; pre-mutation catalog observations cannot establish final readiness. The unfinished commit barrier remains a separate publication obligation and must not be bypassed to qualify this rollback-only component.

Current aggregate verification passes 31 component groups and 111 evidence checks. Full acceptance remains 26/132 required cases, with all 28 complete security criteria open.

### Original business-key/native graph composition — 2026-10-09

The next fresh `truss-graph-native-stage.json` supersedes the preceding eleven-observation source checkpoint with seventeen matching observations and 762 current source digests. It installs the original operation-generation observer, native canonical string/tree producers and original object-key staging routine alongside catalog staging. The first composition attempt correctly refused the archived 0.7 document at the current 0.8 key-tuple producer boundary. The corrected path uses the registered record producer's verified reversible transition target, retains the original 0.7 archival source, and independently asserts source correspondence, target version and an empty residual inventory. No relabelled or independently reconstructed source substitutes for this transition.

Actual staged/native key definitions agree on each owner type, original `code-key` identity and allocated key number. Native canonical namespace bytes include those type/key allocations and the original registered value-producer digest. The original current-core producer encodes Alice and Project-A; `runtime_stage_object_key` stores each complete namespace/key pair for its typed native owner. The native full bucket inventory agrees with the staged expected bytes, and private graph lookup resolves the two distinct typed locators despite equal fixture numeric IDs. The two key insertions advance the original operation generation from eleven to thirteen; each original key guard reaches generation one. The native endpoint reversal refusal, complete edge restoration, unchanged public head, retained deferred commit barrier and original rollback observations still pass.

Namespace epoch and installation selections remain explicitly excluded fixture premises. This composition does not authenticate namespace authority, qualify ordinary subject enforcement or publish the provisional catalog. It does not prove complete compiler refinement, all-key population completeness, final readiness/cut authority, collision/concurrency behavior or full native key lifecycle. Current source evidence passes 31 component groups and 111 evidence checks; full backend acceptance remains 26/132.

### Ordered-key and current observation controls — 2026-10-09

Astra ultra verified the seventeen-observation composition and identified two missing evidence obligations: ordered native key/qualified field correspondence and explicit liveness of the post-key catalog observation. The corrected fresh receipt now retains 25 unique matching observations with 763 current source bindings. `runtime_collect_new_catalog_inventory` verifies the archived fields, ordered key property IDs, owners and relationship endpoints; its complete output matches an independently constructed inventory. Substituting a sibling type's property into the Employee key refuses with `55000`; savepoint rollback restores the complete original inventory.

The original report document basis is captured before key staging. After staging, rechecking it refuses with `55000`. A freshly collected basis passes the native observation recheck before typed graph lookup and again after the duplicate-key control. Attempting Project-A's full key on Project-B refuses with `23505`; rollback restores complete bucket bytes, bucket guard routes/generations and original operation generation. Expected namespace, key bytes, type and key-number substitutions each refuse against the freshly captured native bucket/owner rows. Final transaction rollback additionally verifies zero key buckets and key guards. These are current-observation checks within the excluded installer transaction, not final readiness, public issuance or committed ordinary graph enforcement. Component and evidence gates pass 31 groups and 111 checks; full backend acceptance remains 26/132.

Astra independently inspected the original journal outcomes: the substituted field UPDATE affects one row before the collector rejects ordered-Key correspondence; the earlier generation eleven refuses while generation thirteen rechecks successfully; and the duplicate insertion reaches the intended full-byte identity conflict. The review identified incomplete before/after state capture. The refreshed runner now retains complete native bucket, guard and operation records as opaque `to_jsonb(row)::text` values, including original context bytes and all operation fields. No JSON numeric parsing participates in this equality check. The fresh native replay again passes all 25 observations; current component and evidence gates remain 31/111.

The final narrow Astra review confirms all nine bucket fields, three guard fields and sixteen operation fields are captured, with no remaining actionable defect in this declared composition. Concurrent Truss source work invalidated one captured digest, and the evidence gate correctly refused it. A fresh native run supersedes that stale receipt: all 25 observations pass with 764 current source digests. The component replay passes 31 groups and the evidence gate passes 111 checks. The increased dependency inventory does not expand the support scope.

### Native property values feed original key encoding — 2026-10-09

The fresh native graph component now retains 28 matching observations. For the original selected required singular string JSON key fields, it reads `props::text` from the exact `(object_id,type_id)` owner, selects the property ID allocated from the qualified original field declaration, requires an own string member, and validates the resulting UMF literal with the registered value producer against the original reversible transition target. Key encoding consumes this native literal and separately compares its result with encoding the independently expected original value. The complete native inventory already checks ordered key properties and qualified field ownership before this decoding.

Actual native savepoint mutations remove the member, store JSON null, a boolean, an exact large integer JSON token, or only a sibling type's property ID. Every selected-field decoding refuses, and rollback restores the complete native property inventory. Numeric JSON values are unsupported in this slice and cannot become a key token or native identity. This does not qualify general scalar/property codecs, nullable/multiple/row homes, all-key materialization, ordinary access, source completeness or property-row mutation observation. In particular the installed catalog/key generation observers do not establish complete object-property mutation tracking; the excluded installer transaction and explicit restoration are not a public stable source cut. Component and evidence verification passes 31 groups and 111 checks. Full acceptance remains 26/132.

Astra identified that the first decoder used host JSON parsing before rejecting the numeric member, rounding the native `9007199254740993` token despite failing closed. The corrected decoder obtains PostgreSQL TEXT bag/member kinds and conditionally extracts only a native JSON string. Missing, null, boolean and numeric values never enter host numeric parsing or original key encoding. The original registered field validator consumes only the selected string literal. The refreshed native replay passes all 28 observations with 764 current source bindings; component and evidence verification remains 31/111. The earlier numeric parsing path is not qualified.

Astra's corrected-source and original-journal re-review confirms the integer control returns only `["object","number",""]`; refusal precedes literal construction and original field validation. The initial complete-bag comparison parses only the independently known all-string fixture before any mutation. The review found no remaining actionable defect within this declared selected string-property component.

### Complete fixture key population and fail-closed publication — 2026-10-09

The original native graph fixture now materializes keys for all three objects: Employee Alice and both Project-A and Project-B. Each object's native string value passes original UMF field validation and encoding under its actual catalog type/key allocation. The complete native bucket inventory and all three typed owner resolutions match expectations. Three key insertions advance the operation generation from eleven to fourteen; all three guards have generation one. This is the complete selected fixture population, not a general all-key planning or source-completeness proof.

A native savepoint removes exactly Project-A's bucket. A fresh bucket read retains Alice and Project-B, and lookup of the missing complete Project-A key refuses. Rollback restores all complete native bucket/guard/operation rows and the original generation-fourteen observation rechecks. Astra inspected the corresponding original journal and confirmed this control reaches the selected missing-materialization case. Adding Project-B's own bucket exposed an ambiguity in the prior duplicate-key control: one-per-object uniqueness could mask a missing semantic duplicate check. The corrected control first deletes exactly Project-B's bucket inside its savepoint, then requires both `23505` and `original full-byte key identity conflicts` when assigning Project-A's key. Rollback restores the complete three-bucket state.

The spike also forces the installed deferred operation barrier to fire with `SET CONSTRAINTS ... IMMEDIATE` inside a savepoint. It requires both `55000` and `complete runtime finalizer is not installed`; rollback restores complete key/guard/operation state and the original observation still rechecks. The barrier remains installed and enabled. This demonstrates the unfinished component's refusal, not a complete commit/finalizer implementation or public graph profile admission.

The fresh receipt retains 34 matching observations and 764 current source digests. Component verification passes 31 groups and evidence verification passes 111 checks. Authenticated namespace authority, complete mutation/source custody, ordinary enforcement and catalog publication remain open. Full backend acceptance remains 26/132.

Astra's final narrow review independently confirms deletion of Project-B bucket three before the exact full-byte conflict, the exact missing-finalizer refusal, complete native state restoration and successful generation-fourteen rechecks. It found no remaining actionable defect in these controls or their declared rollback-only scope.

### Correlated native membership and split-witness counterexample — 2026-10-09

The native fixture now contains two Employees and two Projects with separate WorksOn edges, Alice-to-A and Bob-to-B. All four original business keys originate in the actual required-string property bags and registered UMF producer, and complete bucket lookup resolves the typed source and target locators for each membership query. A same-edge native EXISTS query returns true only for the two authored assignments. A deliberately weakened pair of independent endpoint EXISTS queries returns true for all four combinations, including Alice-to-B and Bob-to-A. The complete native edge projection retains both original directed triples. Four key insertions now advance the operation generation to fifteen; original observation rechecks and all earlier negative/restoration/barrier controls still pass.

The graph endpoint formal receipt adds a fifth conditional check over arbitrary association witnesses: independent source/target existence admits a SAT false grant where correlated existence is false. Correlated logical/native equivalence still has an UNSAT violation and a SAT valid population under complete sound incidence and exact typed key projection premises. Fifteen retained formulas replay for this receipt; the aggregate replayer now checks 405 formulas across 21 receipts. The checks share conditional equivalence and expose distinct weakened bindings; they are not five independent proofs of the backend. The native query is an inspected membership kernel, not generated policy SQL or a compiler-refinement proof. The fresh native receipt passes 36 observations with 764 current source bindings; component/evidence checks pass 31/111. Full backend acceptance remains 26/132.

### Next compiler adapter: original graph fact sources

The next implementation must build logical entity and association sources from owner-backed allocated native metadata before feeding the existing policy expression/effect lowering. Entity identity components must come from the original ordered key fields and qualified property homes, with complete original namespace/key bucket correspondence. Association endpoints must join through both native object ID and type ID and retain the original declared relationship allocation/direction. Native object or edge IDs cannot be cast into original business keys.

The lowerer must consume an internally issued derived-source plan or one complete WITH program; a generated SQL view name cannot stand in for admitted native storage. Existing raw-table lowering remains independently qualified. Graph associations without an original logical Key must not receive an invented key from edge storage IDs; unsupported association identity uses must refuse. Complete source coverage, missing/null/wrong-kind behavior, property-domain semantics and unknown composition remain explicit admission obligations. The generated policy spike must compare active/inactive, sibling-project, other-staff and no-owner results against an independent original-source oracle. Original namespace/installation authority and a complete accepted catalog/finalizer remain separate requirements for ordinary activation; this adapter cannot bypass them.

### Original association Record to native property owner — 2026-10-09

Astra's compiler-path review identified a prerequisite: prior relationship staging left `rel_def.assoc_type_id` unset, so original ontology Assignment/Ownership Records could not become edge property owners through matching names. The private authored relationship stage now accepts the original core `associationRecord` reference, resolves its already allocated Record in the same archived document, new revision and document ordinal, checks an explicitly selected Key on that owner, and persists the resolved association type. The complete native inventory independently re-resolves the original reference and selected owner Key and compares the actual association type; absence requires NULL. This does not adopt the separately versioned relationship-intent extension or infer a mapping between unrelated ontology Records and graph relationships.

The updated original fixture explicitly authors Assignment's active boolean, code string and code Key, then binds WorksOn to that original Record/Key. UMF's source validator refused the attempted keyless association before native effects; it requires authored endpoint Keys. BareWorksOn retains absent association ownership and is staged first so WorksOn relationship ID two differs from Assignment property-owner type one. Complete original catalog inventory verifies both branches and all ordered key/qualified property definitions. Substitution of the Employee owner passes the native FK but the independent collector refuses exactly `55000 / stored original association Record owner correspondence`; rollback restores the original inventory. Both native edge property-owner declarations match the original Assignment fields.

The selected association Key remains meaning in the archived original reference, not a new native selected-key column. Future consumers must retain it and independently qualify edge business-key materialization; neither edge ID nor relationship ID establishes it. This implementation establishes provisional catalog property ownership, not edge key uniqueness/lifecycle, endpoint-to-association-field mapping, general property decoding, compiled active-membership policy, current authority or ordinary graph enforcement. The deferred finalizer barrier remains intact.

The fresh native receipt passes 41 unique observations with 764 current source digests. Astra's final review independently verified the distinct domains, NULL branch, source-selected owner Key and incorrect-owner refusal, finding no remaining actionable defect in this declared new same-document cohort. Component checks pass 31 groups and evidence checks pass 111. The source-only graph readiness inspection was refreshed after the collector change and retains its non-runtime scope. Full backend acceptance remains 26/132.

### Private candidate graph source construction — 2026-10-09

The new portable private `security-graph-source` component constructs fixed native object/edge projections from captured type/property-owner IDs and bounded property metadata. It accepts only selected required singular string/boolean JSON fields. The separate validity expression checks active nonprovisional Record ownership, exact property owner/home/scalar/requiredness/cardinality and, for an edge, the native relationship association owner. Metadata checks remain independent of whether data rows exist. Invalid or absent native values project NULL without filtering the original row; validity must succeed before a consumer uses the projection. This validity is not complete source admission or a stable cut.

Only native fixed tables, qualified pg_catalog operators/types/functions and escaped column identifiers enter the generated SQL. Canonical signed IDs are quoted TEXT casts, preserving native domains without ambient unary-minus resolution. Private WeakSet issuance distinguishes this constructor's immutable result from a copied SQL-shaped object; it confers no source/catalog/issuer authority. Caller-supplied arbitrary SQL is not an input. Exact own data metadata and bounded dense collection descriptors are captured before construction; accessors, unknown fields and custom iterators refuse.

The original native graph spike executes the actual generated edge projection and validity SQL against source-backed Assignment active/code properties. It compares complete typed physical endpoints and original values, retaining PostgreSQL's Boolean TEXT carriers `t`/`f`. A native missing-field mutation makes validity false; savepoint rollback restores the complete native edge records. The fresh receipt now retains 45 matching observations and 765 source bindings. Seven Bun tests pass 24 assertions. Chromium 153 independently constructs matching source/validity SQL from the retained native-executed input and exercises seven controls without external requests; its receipt explicitly claims no fresh native execution.

Astra reproduced an array-proxy bound bypass in the first constructor: repeated reads of `.length` admitted 257 fields despite a 256 ceiling. The corrected constructor captures the own length descriptor once and loops only that bound. Bun and Chromium regression controls verify original bounded output with zero length-getter calls. Astra also identified ambient JSON operator resolution; both `->` and `->>` are now explicitly pg_catalog-qualified. Corrected-source re-review remains separate evidence from the initial findings.

The existing policy lowerer has not yet adopted this source plan. Full typed endpoint-to-original-key joins, association Key materialization, original UMF scalar/facet validation, whole-source coverage, error isolation, current authority/cut custody and ordinary activation remain required. The constructor's validity expression cannot replace those obligations, and no policy/backend case is promoted. Aggregate component checks pass 33 groups; evidence checks pass 112. Full backend acceptance remains 26/132.

Astra's corrected-source review found no remaining actionable defect in the declared constructor subset and confirmed the seven Chromium controls and native SQL journals. A concurrent catalog-document-order source edit invalidated one native source pin; the evidence gate correctly refused that stale receipt. Native execution was refreshed successfully (45 observations), followed by dependent Chromium evidence (seven checks). The final evidence validation passes all 112 checks against the refreshed sources. These results do not establish complete compiler refinement or backend acceptance.

### Same-witness assignment attribute refinement — 2026-10-09

The graph endpoint proof now includes US-056-AC2 checks for the total Boolean `active` attribute. With complete sound incidence, exact typed endpoint/key correspondence and exact attribute correspondence, logical active membership equals native active membership when the attribute is tested on the same association witness. The violation is UNSAT and an admitted population is SAT. A weakened conjunction of matching endpoint existence with independently witnessed active-assignment existence is SAT while the logical policy denies. Omitting the active test also admits a SAT false grant. These controls identify required compiler tests: a matching inactive assignment plus an unrelated active assignment must deny, and an isolated matching inactive assignment must deny.

This extension is an abstract refinement obligation, not generated SQL correspondence. Missing/unknown attributes, source validity, UMF facets, current authority and transaction cut remain separate obligations; the proof assumes a total Boolean attribute. The endpoint receipt now contains seven checks and 21 formulas. Fresh aggregate replay passes 411 queries across 21 receipts; all 33 component groups and 112 evidence gates pass. Native backend acceptance remains 26/132. Astra independently replayed all six new formulas, confirmed matching source pins and found no actionable defect. Both weakened controls remain SAT even when every association has the fixed Staff-to-Project endpoint types. This confirms that the attribute controls expose witness/attribute mistakes independently of type erasure.

### Native same-witness attribute control — 2026-10-09

The original native graph fixture now executes the membership kernel over the actual constructed edge source after its validity query succeeds. Both endpoints are resolved through original full-byte key buckets to complete typed locators. A single SQL statement tests the source/target locators and `active IS TRUE` on the same projected row. Alice-to-A grants, Bob-to-B denies despite an existing inactive assignment, and both cross pairs deny. A weakened query retains correlated endpoints but independently witnesses any active assignment; Bob-to-B incorrectly grants using Alice's unrelated active row. The earlier endpoint-only kernel independently shows the omitted-attribute false grant.

The first run executed the added checks but the parent refused its 47 observations against an unchanged 45-observation completeness bound. The bound was corrected and the entire disposable fixture replayed, passing all 47 unique observations. Dependent Chromium construction evidence was refreshed (seven checks); component groups pass 33 and evidence gates pass 112. This inspected kernel is still not emitted by the policy lowerer, does not establish ordinary read enforcement, and does not promote backend acceptance. Original current namespace/cut/source admission and activation remain open. Astra confirmed all 47 unique observations and 765 current source pins, inspected the original native journals and refreshed Chromium receipt, and found no actionable defect in this declared kernel scope.

### Candidate endpoint business-key source — 2026-10-09

The private graph source constructor now composes an issued edge source with separately captured source/target Key selections: native type ID, key number and exact namespace bytes. Aggregate lateral joins select buckets by complete typed owner and original namespace/key number, preserve each original edge, and expose encoded key bytes only for exactly one matching bucket. Separate validity requires exactly one bucket for each endpoint, the original source validity, and active key definitions even for an empty edge population. Namespace/key selection correspondence and current authority remain host obligations; issuance alone supplies neither.

Five added native observations verify valid endpoint keys against independently retained original tuple bytes, then remove Project B's bucket: validity becomes false while Bob's original edge remains present with a null target key. Savepoint rollback restores both projections. Type comparisons use native int4 and object comparisons int8, avoiding text-collation identity. Source metadata accessors, malformed namespace bytes, key-number overflow, copied sources and object sources refuse in Bun. Nine tests pass 33 assertions; strict compilation passes. Fresh native evidence passes 52 observations, components 33 groups and evidence gates 112. Refreshed Chromium's seven checks cover the underlying source constructor, not this endpoint wrapper.

Failed attempts are retained in this qualification: reserved derived aliases were accidentally added to the native column list (42703), then the strict text decoder refused the intentional null. The aliases were removed from native projection; the missing-key control now transports only TEXT/null projection cells through native row_to_json text. Astra identified and corrected the int4 comparison requirement before the final native replay. A subsequent gate syntax error from the added observation list was corrected and component/gate evidence rerun. Multiple-bucket cardinality, empty-population metadata refusal and independent wrapper browser checks still require native/browser controls. This is not policy compiler refinement or full backend acceptance; 26/132 remains unchanged. Astra confirmed the corrected native comparisons, all 52 unique observations and 765 current source pins, including native missing-bucket NULL preservation and rollback, and found no remaining actionable defect in the declared subset. Duplicate cardinality and wrapper browser qualification remain open.

### Endpoint source empty-population and browser qualification — 2026-10-09

The native fixture now removes all edges inside a savepoint and independently checks that the original endpoint-key source remains valid, while an otherwise identical source selecting nonexistent Employee key number 32767 fails validity. Thus empty data cannot suppress this key-definition metadata obligation. Rollback restores the original endpoint key projections. Astra identified that the initial 55-observation receipt did not independently observe the empty population. The fixture now records an exact native edge count of zero and an empty generated endpoint-key projection before checking invalid metadata. Fresh native execution passes 57 unique observations.

The native receipt now retains the wrapper's actual executed SQL/validity SQL and source/target Key selections. Chromium independently constructs both the base source and wrapper, compares their programs to retained native programs, and refuses copied source issuance and malformed namespace bytes. Ten browser checks pass without external requests. This demonstrates portable construction correspondence, not new browser-native execution or namespace authentication. All 33 component groups and 112 evidence gates pass. Multiple-bucket native controls, compiler adoption, current authority/cut custody and ordinary enforcement remain open; backend acceptance stays 26/132. Astra confirmed independent empty-population isolation, all 57 native observations and ten Chromium checks with current source pins, and found no remaining actionable defect in this change. Duplicate-cardinality native coverage remains explicitly open.

### Native endpoint bucket uniqueness — 2026-10-09

The original installed qualified-property-0.15 layout declares `object_key_bucket_one_per_object UNIQUE(object_id,type_id,key_num)`. Thus more than one bucket matching a selected endpoint cannot inhabit this intact layout, even across namespaces. The fixture attempts an INSERT SELECT of Project B's complete original bucket (type/key/owner, original namespace/key/context bytes); PostgreSQL refuses with SQLSTATE 23505 and that exact constraint. Savepoint rollback restores opaque complete buckets, guard generations and operation state. No constraint is disabled or dropped.

This closes the native duplicate-prevention control for the selected layout; it does not execute the wrapper's defensive count-greater-than-one branch or qualify a differently installed layout. Fresh execution passes 59 unique native observations; dependent Chromium passes ten checks, components 33 groups, and evidence gates 112. Native mapping, compiler refinement, authenticated namespace/cut custody and ordinary activation remain separate obligations. Full backend acceptance remains 26/132. Astra confirmed all 59 unique observations and 765 current source pins against original native frames, including exact constraint refusal and restoration of four buckets, four guards and the operation record. No actionable defect was found; the defensive multiple-match branch remains explicitly unexecuted.

### Candidate graph source input to predicate lowering — 2026-10-09

The private predicate lowerer now accepts a separate SecurityPredicateType with either a raw table home or an issued candidate graph source home. SecurityPhysicalType remains raw-only for existing native-key/source-completeness consumers. Association quantifiers and scanned subject lookups use source subqueries; emitted predicates include local validity checks for scanned candidate sources. Copied source objects and source metadata accessors refuse. Two Bun tests pass seven assertions. Initial broader typechecking exposed downstream raw-home assumptions and UMF rootDir crossing; the separate predicate type and Truss-local test location correct those integration errors. Component verification has expanded to 34 groups.

Astra found no demonstrated bypass in this association-source subset. SQL validity conjunction is not an execution-order or diagnostic-containment barrier. Outer resource sources represented only by parameters, and subject sources unused by the condition, still require separate host preflight. Original issuer, namespace, complete source and stable-cut admission remain mandatory; these guards cannot replace them. Tests currently use an explicitly authored logical IR fixture, not a newly admitted original compiler graph packet. Actual original-compiler graph correspondence remains open.

The shared lowerer revision invalidates earlier source fingerprints: policy lowering, existence truth, typed selection, native-key/original-use, associated formal/browser evidence and typed readiness need refresh. The evidence gate currently fails freshness checks; earlier green counts are historical and cannot qualify this revision. Graph native/browser construction was replayed during development, but the final explanatory source comment requires another closure refresh. No backend case is promoted; full acceptance remains 26/132. Required next work is refreshing affected evidence and executing original compiler output against the constructed graph sources.

### Shared lowerer dependency refresh — 2026-10-09

Fresh disposable PostgreSQL replays now pass policy lowering (49 observations), typed selection (28), three-valued existence (78), native key correspondence (44), original query-use (418) and graph staging (59). Probe source closures now explicitly include the graph-source module imported by the lowerer; predicate/original-use browser closures include it as well. One initial native-key replay refused evidence because a prerequisite typed-selection receipt changed during capture; subsequent execution followed the completed prerequisite and passed. Refusals and successful reruns are distinguished rather than accepting stale fingerprints.

### Original graph compiler source-admission gap — 2026-10-09

`truss-graph-compiler-input.ts` invokes the retained original Rust compiler binary over the exact graph cohort, using the original UMF preparation producer's reversible 0.7-to-0.8 interpretation with no residuals. The inspection policy asks whether any Assignment has active=true. It supplies an endpoint-free Assignment ontology rather than falsely treating Assignment-code as a Staff/Project endpoint. The compiler returns WFT-SECURITY-SOURCE at model admission. The selected ontology 0.1 schema requires at least one endpoint, and CONTRACT-062 requires each endpoint's ordered fields to be association Record members. The graph's original core WorksOn Relationship carries its typed endpoints separately from its association Record. That Record contains only active/code members. The receipt retains the exact request, original transition, diagnostic, binary/schema/source pins and explicitly refuses backend qualification.

This reveals an outstanding shared semantic design obligation, not merely a SQL emitter gap. A separately versioned ontology must support both member-field-backed endpoints and core-Relationship-backed endpoints. The latter must pin the qualified Relationship, directed source/target role, selected endpoint Record and Key, and its associationRecord correspondence. A graph edge and a relational junction must lower to the same correlated logical association witness without inventing Record members or reinterpreting attributes as endpoints. Core relationship source selections lacking an explicit Key require a separately admitted ontology Key selection; target Key and association Key must retain original selections. Undirected and multi-type endpoints require explicit role/type semantics and may refuse until defined. Existing ontology 0.1 meaning and refusal behavior must remain unchanged. The prospective version number and migration API remain to be defined; no new public grammar is claimed here.

Required acceptance tests include original Relationship/association correspondence, absent association Record, wrong direction/type/Key, stale source pins, duplicate/missing endpoint carriers and native original-Key projection. Compiler derivation must carry those obligations to the physical source boundary. The existing conditional endpoint theorem supplies a refinement target but does not establish the new grammar or compiler. This gap must be addressed before the intended original compiler-to-graph membership execution can be claimed. The qualified-refusal spike is now registered with strict compilation in the component runner and separately checked by the evidence validator. Full backend acceptance remains 26/132.

Astra independently validated the retained policy and ontology against the selected schemas: the policy passes and the ontology has exactly one error, association endpoints minItems=1. Source/model/transition/request pins match with no residuals. Its next-path audit identified a second admission obligation: the current original compiler ontology interpreter accepts Key members only id/name/fields, while all three selected graph Keys preserve primary=true. That original Key meaning must be admitted or explicitly refused by a qualified compiler version; it must not be stripped to obtain a pass. The retained refusal remains correctly limited to the earlier source-shape gate. Compiler ontology source is now pinned alongside its selected schema and source-admission implementation.

Final Astra review confirms 773 current source pins, original model/transition/request correspondence, 38 passing component groups and 113 passing evidence gates, with no remaining actionable defect in the qualified refusal spike. The future endpoint form must preserve same-witness correlation and require each endpoint Key to be compatible with the selected entity identity; it cannot silently switch Keys during lowering. This establishes outstanding compiler admission work, not graph enforcement or backend acceptance.

SPIKE-009 now defines the separately versioned relationship selector direction,
including distinct Relationship/Record reference domains and bare opaque witness
restrictions. Its executable draft source-selection analysis passes fourteen
controls; Astra verified 769 current pins and found no actionable defect. The
component-result gate was strengthened after a strict-compile failure exposed
that freshness alone did not establish command success. Corrected replay passes
forty component groups and all 115 phase checks. No public ontology support or
backend case is promoted; acceptance remains 26/132.

The private portable relationship normalizer now retains original Key metadata
and association member references in frozen plans, checks endpoint Keys against
selected entity identity, and restricts bare witnesses to endpoint/existential
capabilities. SPIKE-009 records full source validation, authority/cut admission
and public typing/compiler obligations. Astra's reproduced direct-call Key bound
defect was corrected with Unicode code-point limits matching the schema. Its
corrected-source review found no remaining actionable issue. Five Bun tests pass
26 assertions; fourteen source-selector controls, sixteen real Chromium checks,
42 component groups and all 116 phase checks pass. No backend case is promoted.

Dependent Chromium replays pass three predicate programs, ten graph-source controls, five native-key checks and ten original query-use programs with fifteen refusal controls. Typed-readiness replays retain three qualified original-owner refusals. The component runner now includes the previously omitted existence-truth and type-selection formal generators, preventing stale receipts after lowerer revisions. All 36 component groups and 112 evidence gates pass against current sources. These refreshes verify retained subsets and do not establish original compiler graph adoption or ordinary enforcement. Full backend acceptance remains 26/132. Astra independently verified current native/browser receipt pins and matching observations, the executable graph-source dependency closures, all 36 component runs with 174 current pins, and 112 unique passing phase checks. Its interim audit found no actionable issue; final wording review remains pending. There is no accepted truss.* backend case in this checkpoint.

Latest SPIKE-009 review retains complete selected Relationship and association
Record snapshots in deeply frozen, caller-isolated plans. These selected-source
archives do not constitute complete semantic closure or authority. Future
admission must resolve field definitions, classifications and enforcement-relevant
extensions, or refuse unsupported meaning. Seven Bun tests pass 43 assertions;
14 selector controls, 21 Chromium checks, 42 component groups and 116 phase checks
pass. Astra independently verified archive isolation and current receipt pins,
with no actionable defect in the private subset. Public ontology/compiler
integration and ordinary native enforcement remain open. Acceptance remains
26/132, with no accepted Truss backend case.

## Conditional atomic activation model — 2026-10-09

The native routine-writer counterexample in the PostgreSQL raw test plan now
demonstrates why complete-bundle atomicity is a premise requiring implementation
evidence. A helper replacement can commit after successful comparison despite
the installer's resource-table lock; the installer can then publish a new
version whose authorization behavior differs from the compared profile. A
qualified implementation must stabilize routine, role, grant and mapping
dependencies through activation commit, with every authorized mutation path
participating or denied by the admitted privilege profile. Version-row and
selected fact-table serialization alone are insufficient. This counterexample
does not refute the conditional algebra; it refutes treating those table locks
as a physical realization of its complete-bundle atomic transition.

The next native increment enforces participation for `CREATE FUNCTION` using
a database event trigger and the same exclusive transaction advisory guard in
a private installer wrapper. The guard is acquired before predecessor/profile
comparison and retained through commit. Native observation verifies that an
otherwise uncoordinated helper replacement waits on that exact guard, resumes
after installer commit and can roll back without altering the installed
profile. This realizes one dependency-writer boundary of the premise, not
complete-bundle refinement. Other DDL tags, shared role changes, guard
administration, committed-writer generation advancement and all public or
bypassing admission paths still require explicit controls and evidence.

`tools/security/prove-policy-activation.py` makes the B09/L12 activation
obligations explicit for each of the four backend profiles. A candidate commits
only when supported, qualified and successfully installed, its captured
predecessor equals the current complete bundle, and its version strictly
advances. Report mode has no effect on this admission decision. The modeled
atomic transition replaces version, effective protection and open-access state
together; otherwise it preserves the prior bundle.

The retained `policy-activation-formal.json` has six UNSAT violation checks,
six SAT populations and six SAT explicit faulty-transition controls. They cover
unsupported report activation, complete-bundle preservation on refusal and
installation failure, stale predecessor replacement, visible unprotected access
and version reuse. The corrected controls retain nonnegative version domains
and safe prior/candidate profiles; unsupported and failed-install examples
force all other admission guards true.

These are conditional algebraic properties, not installer verification. Version
equality must bind the complete immutable policy/mapping/native dependency/grant
bundle. All installers must use serialized predecessor comparison, support and
qualification predicates must be truthful, and all externally visible
installation states must follow the atomic transition or close access. A
backend transaction spanning only part of the bundle cannot inherit this proof.
Native mid-install visibility, privilege/routine replacement, concurrent
installers, rollback and administrative repair remain required B09/L12 tests.
No backend case is promoted by the receipt.

Astra ultra found and corrected two initial proof defects: arbitrary-state SAT
controls were replaced with explicit faulty transitions, and positive populations
now isolate the intended guards. The tool freezes its fixed source and governing
contract before formula construction and rechecks bytes before publishing. Astra
independently replayed all 18 corrected formulas and checked both current pins,
finding no remaining actionable defect in the conditional activation algebra.

Consolidated replay initially encountered `unknown` on existing quantified
publisher-state satisfiability examples. Three failed component checkpoints are
retained as `components-policy-activation-publisher-timeout[-second|-third]-20261009.json`
in the security evidence directory. The released-publisher enroll positive
population now supplies an explicit all-absent, zero-buffer/lock witness.
Publisher/custody solving and saved-formula replay now use separate Z3 contexts,
translating the same assertions for generation; universal safety and expected
results are unchanged. The 60-group component run passes, and retained-formula
audit passes 563 formulas across 32 receipts using Z3 4.15.4. This is parser/solver
agreement under the recorded premises, not generator/native refinement.


## Native fixed graph membership on original layout 0.16 — 2026-10-10

`tools/security/truss-native-membership-probe.py` installs the complete, unchanged
59,119-byte Truss `source-epoch-layout-0.16.owner-export.sql`, SHA256
`dd46a1f5d38efebb96c1123b78c47cd018d223cdb2192976cedb8f3eebb4d85f`,
in a disposable PostgreSQL17.9 fixture. The retained local copy is
`tests/security/native/truss-layout-source-epoch-0.16.sql`; it must equal the
original owner export before acquisition. This replaces synthetic *table layout*
in this experiment, not synthetic model allocation or accepted consumer data.
The original schema comment remains review-only and unqualified.

The fixed overlay uses native `object` and `edge` tables. Complete `(id,type_id)`
identities and relationship IDs are mandatory in the hidden membership join.
One active Staff assignment to any owning Project grants the Resource; a sibling
Project sharing the same Client and ownerless Resources grant nothing.
`SESSION_USER` binds the original authenticated actor inside fixed definer
functions. Ordinary SCRAM actors can read RLS-filtered storage identities and a
restricted ID/value projection. Column grants deny bag and retained bytes;
edge reads, mutation and transition to the excluded NOLOGIN table owner deny.
The excluded owner bypasses its own non-FORCE RLS to read hidden authorization
facts; no ordinary membership or callable owner-role transition is granted.

This mapping deliberately fixes types1–4, relationships11–15 and JSON property
IDs101/102/201/301/999. It does not use accepted UMF documents, registered property
definitions, canonical key buckets or a Weft compiler artifact. Direct fixture
insertion satisfies native definition-source tuple constraints using the
`accepted_document` enum, but the document carries an explicit unqualified
fixture and `not-admitted-synthetic-fixture` validation status. Its content hash
is actual; these rows are **not** evidence of Truss schema acceptance. Excluded
installer-inserted overlapping numeric IDs exercise defensive typed identity;
they are not admitted normal Truss allocation populations. No installation
marker, issuer, seven native semantic bodies or publication path is qualified.

The first checkpoint [native receipt](../../04-build/evidence/security/truss-native-membership/3d079a08-9485-49c2-b3f1-81f7ad503fd4/native.json)
retains110 observations and51 transcripts against the independently authored raw
membership oracle. All six input pins remain unchanged, including original DDL,
overlay, runner, oracle and original case inventory. Separate active-assignment,
ownership-relationship and assignment-relationship guard erasures expose exact
independent expected rows; each is restored for all actors. Root-type erasure
exposes other native object types, and restored direct RLS checks retain only
Resource type3. Reversed endpoint roles fail the actual native endpoint foreign
key, after proving both endpoint objects exist and the tuple cannot collide with
`edge_out`. Three invalid invocation controls refuse before Docker acquisition.

All preceding attempts retain start pins, exact executable/DDL/overlay preimages
and seed SQL. Three development failures and three superseded passing receipts
are historical. The failed FK attempt did not retain its decisive native stderr;
only the corrected final control qualifies that observation. This is native
fixed-policy evidence for US-056-AC2/AC5, not a formal SQL/Rust refinement proof
or a complete BindingReceipt under CONTRACT-063. Missing/ambiguous Staff
refusal, authenticated complete source/cut, general disclosure, current-authority
drain and arbitrary diagnostics remain open. All original132 required cases
remain binding; historical acceptance stays26/132 and truss.B01 remains not-run.

Next integration must replace synthetic field/key allocation with original
accepted model/property/key custody, feed the original Weft artifact through
Truss-owned lowering, and qualify the complete protected path. This overlay is
an experimental physical witness and cannot become a second policy compiler.

Astra ultra independently audited the final source pins, retained native outputs,
independent oracle and invocation receipts, finding no remaining blocker in this
fixed mapping scope. The [read-only audit](../../04-build/evidence/security/truss-native-membership/astra-review.json)
does not claim an independent native rerun.


### Native unique Staff binding and mandatory preflight checkpoint

CONTRACT-062 requires missing/ambiguous authenticated Staff mapping to refuse,
rather than choosing one witness or treating unknown identity as false. The
fixed graph overlay now resolves a private exact-type1 Staff binding using
`SESSION_USER`, a JSON string guard, and native `count(*)`/`min(id)`. It returns
an ID only for exactly one match, otherwise a uniform42501 principal-binding
refusal. Both eligibility and the public fixed projection call it before their
own evaluation. Projection preflight runs before Resource iteration, including
zero native Resources. The helper has no ordinary EXECUTE grant; its excluded
NOLOGIN definer owner remains the fixed experiment's private fact reader.

The synthetic fixture adds an authentication-only outsider Staff with no
Assignment facts; the independently authored oracle's authorized rows stay
unchanged. Ordinary actor `true` is a separate typing control: Boolean JSON
`true` must not bind the login, while string JSON `"true"` produces a valid empty
result. This is a source-qualified fixed property mapping, not registered core
Field decoding, authentic attribute issuance or accepted model/key allocation.

The new [native receipt](../../04-build/evidence/security/truss-native-membership/61a4b228-9f59-48a1-8ba4-b34cd82720e0/native.json)
retains217 observations at six unchanged input pins. Missing and ambiguous Staff
bindings refuse evaluated projection/count calls both with Resource rows and
with no Resources. Complete actor restores, foreign-type matching login, private
helper denial and typed-login controls pass. Removing unique cardinality admits
ambiguous Alice; removing only projection preflight converts missing binding
with zero Resources into successful empty/count-zero. Each guard is restored.
Three fresh exact-invocation controls pass against this final executable.
The earlier110/191/206 checkpoints qualify their captured earlier sources only.

PostgreSQL can avoid calling the function for outer `WHERE false` or `LIMIT 0`.
Those evaluated SQL statements yield no output but do **not** demonstrate
principal preflight or an admitted protected operation. Arbitrary caller SQL,
complete source/fact coverage, general authenticated binding, current-authority
and final-publication closure remain unqualified. Uniform tested error messages
are not arbitrary-diagnostics noninterference. No full Truss case is promoted.

[Four conditional formal laws](../../04-build/evidence/security/graph-principal-formal/c3f36651-19b6-4c93-8072-6d9b1b3171a7/proof.json)
retain12 pre-solve formulas with UNSAT safety, SAT population and SAT weakened
control for each law. The count/min selection law assumes three distinct int64
Staff IDs and complete exactly typed match/eligibility predicates; separate
refusal/preflight laws admit arbitrary nonnegative cardinalities. JSON string-tag
necessity is a conditional decoding law. All12 formulas replay with Z3 4.15.4.
The explicit model relates to native controls by human source review, not an
automatic translation or SQL/Rust refinement proof. Native source authentication,
accepted property/key decoding, completeness and current-cut ordering remain
premises awaiting backend implementation/evidence. Original132 required cases
remain binding and historical acceptance remains26/132.

The principal-binding count/preflight formulas are explicit guard-definition
sanity checks; they do not independently model publication or prove SQL ordering.
The final cardinality-erasure control retains JSON string typing. Earlier217
and formal source snapshots remain historical rather than repinned.

The [Astra ultra final read-only review](../../04-build/evidence/security/truss-native-membership/61a4b228-9f59-48a1-8ba4-b34cd82720e0/astra-review.json)
verified all current native/formal source pins and independently replayed12
formulas, finding no remaining issue in this fixed-fixture scope. It did not
execute a native rerun or promote acceptance.


## Installed role-route refusal and its source-derived laws

Direct effective table privileges and role membership are distinct physical
observations. In the selected PG16.15 Truss invoker profile, every distinct native
SET-capable or ADMIN-capable role is forbidden; INHERIT FALSE cannot hide that
route. A matching expected inventory cannot override this fixed deny rule.
Mere membership without INHERIT, SET or ADMIN may match a fresh scoped baseline.
Ordinary self-SET is not a distinct transition and does not alone cause refusal.

The [actual merged component and native evidence](../../04-build/evidence/security/truss-installed-role-paths/integration.json)
and [source-derived guard laws](../../04-build/evidence/security/truss-role-guard-formal/ddff3684-cae4-4029-bd7a-4ac7cb518b5b/proof.json)
separate the three layers: the normative route prohibition, the exact Python
predicate/fold/terminal behavior, and native PG16.15 SET/ADMIN effect witnesses.
The pure guard is extracted from the exact archived owner source, with32 complete
Boolean/identity vectors checking translation and11 SMT queries checking safety,
realizable populations and isolated guard erasures. Formula bytes are hashed and
rechecked before publication, then independently replayable.

Complete faithful immutable native role rows and their current authority are
premises, not outputs of packet shape validation or the SMT analysis. The finite
fold abstraction does not prove collection completeness, Python ingress/resource
bounds, native role graph semantics, atomic installation or temporal freshness.
Local native socket actors do not qualify production authentication. This adds
component evidence for US-056-AC5/AC9/AC10; it does not admit a graph backend or
replace the original caller/owner/authority handoff and seven operation bodies.


### Truss SCRAM authentication and session lifetime — 2026-10-10

[Direct-main integration evidence](../../04-build/evidence/security/truss-scram-authentication/integration.json) records Truss main
`bb5eb75a018e068c281c565ae49e9a50825ee400`. The separately installed combined wheel matches53 source,
owner-asset and typing files, passes328 tests and212 Python boundary imports.
The original PostgreSQL16.15 / pgserver0.1.4+truss.pg16.15 / pg8000
1.31.5 Unix-socket SCRAM fixture passes82 observations across31 inventories,
with21 frozen source/preimage pins. Native authentication log entries bind the
ordinary role and SCRAM method to its backend PID. Wrong credentials and missing
roles refuse28P01. NOLOGIN changes inventory qualification and refuses new
sessions28000, but two established authenticated sessions remain usable.
Restoring LOGIN allows a fresh connection. Thus authentication establishes a
connection identity; login permission alone cannot revoke current operation
authority or retire existing sessions. Protected admission must independently
establish current authority at its coherent cut.

Four failure controls cover receipt/stderr secret redaction, an unwritable receipt
sink, continued connection cleanup and cluster cleanup after failures. Astra ultra
feedback was applied and the captured helper bytes execute directly. The final
read-only review verifies current pins and preserves the qualification boundary.
Historical Truss development evidence retains its original source hashes.

This supplies component evidence for US-056-AC5/AC9/AC10. It does not prove
production/TLS authentication, native protected ontology mapping, complete
collection/current cuts, PA01/PA02 completion, seven semantic operation bodies
or complete backend acceptance. Historical acceptance remains26/132; every
original required case remains governed by the existing plan and the goal stays
active. No source-derived formal theorem gains native/temporal premises merely
from this fixture's success.


### Native elevation routes outside the registered namespace — 2026-10-10

[Verified direct-main integration](../../04-build/evidence/security/truss-definer-routes/integration.json) records Truss
`71ba19f8373657cca34085250819220efd5ea79c`. The fixed invoker observer now requires a twelfth census
section enumerating native EXECUTE-accessible SECURITY DEFINER routines across
all schemas. Schema USAGE is retained independently and cannot filter the census.
Any nonempty census refuses even against an identical unsafe baseline; legacy
eleven-section packets refuse. This is a conservative profile-specific rule.
Protected registered definer chains require a distinct admitted profile; UMF
logical semantics do not prohibit all definers.

The PostgreSQL16.15 / pgserver0.1.4+truss.pg16.15 / pg8000
1.31.5 SCRAM fixture passes97 observations across35 inventories with21 frozen
inputs. An ordinary session with no direct UPDATE right invokes an external
PUBLIC-executable definer owned by a distinct nonlogin role. The actual committed
row UPDATE changes xmin, independently observed, while logical revision remains
unchanged. Original and matching unsafe baselines refuse. Revoking EXECUTE removes
the route; revoking only schema USAGE retains and refuses it. Native prepared-call
revalidation in this fixed fixture returns42501 with unchanged xmin; it does not
demonstrate a surviving write or prove behavior of every retained statement.

Astra identified and verified fixes for the schema-USAGE filter and replayed
packet budgets skipping empty final-section columns. Exact80164-unit budget
passes;80163 and80076 refuse. Native final-section row overflow refuses. The
separately installed wheel matches53 source/owner/typing files and passes334
tests; Python boundary checks pass212 imports. Exact source/preimage, test,
wheel/log/native digests and the read-only Astra review are retained. Owner
historical attempts preserve earlier pins and two rejected prepared-call
predictions instead of being repinned to the final producer.

This advances US-056-AC5/AC9/AC10 and Truss PA01/PA02 component evidence.
It is not complete installed call closure: operator/type/extension routes,
trigger/default/RLS paths, indirect resolution, protected capture, current
authority cuts and seven semantic operation bodies remain unqualified. Earlier
source-derived role proofs retain their historical source scope; no fresh
whole-program, SQL or temporal refinement proof follows. No original required
case is promoted; acceptance remains26/132 and the full goal remains active.


### Operator-backed hidden definer and source-derived guard laws — 2026-10-10

[Native integration](../../04-build/evidence/security/truss-operator-routes/integration.json) records Truss main
`f48975262c74317940329c4f70bd193db81b68fa`. A native operator invokes a SECURITY DEFINER
implementation in a distinct function schema to which the ordinary caller has
no USAGE. The caller also lacks direct UPDATE, but the operator commits a row
UPDATE whose changed xmin is independently observed. The merged census retains
that hidden function and refuses an identical unsafe baseline. Revoking function
EXECUTE then returns42501 with unchanged xmin; scoped correspondence and operator
removal restore the baseline. The proposed EXECUTE-ignoring operator bypass was
not observed. No thirteenth inventory section or new permission semantics is
introduced: this validates an actual route covered by the existing conservative
function census.

The fixed PostgreSQL16.15 / pgserver0.1.4+truss.pg16.15 / pg8000
1.31.5 SCRAM fixture passes107 observations across38 inventories with21 frozen
inputs. The unchanged separately installed53-source wheel passes336 tests,
including original-native operator packet regressions. The read-only Astra review
verifies the native source/preimage and wheel pins. Library source remains the
reviewed71ba19f8 implementation; no unchanged owner build is attributed as new
implementation.

[Source-derived analysis](../../04-build/evidence/security/truss-definer-census-formal/cfa978ae-c2c9-4fef-b244-4495aab10da9/proof.json) recognizes the complete exact
census SQL subset and extracts the actual final three Python classifier
statements. Three UNSAT violation queries show the selected hidden executable
definer cannot be filtered by schema access, a nonempty census cannot match and
an earlier refusal cannot clear. Three SAT controls populate a safe empty
profile, the hidden operator witness and a namespace-filter-erasure leak. All six
SMT byte digests replay independently. Sixty-four Boolean vectors execute the
extracted actual tail;38 original native inventory tail replays preserve refusal
when the census is nonempty. The role-route fold is retained, without replacing
the full classifier with a handwritten policy implementation.

Complete faithful immutable native rows and effective privilege facts are explicit
analysis premises. This is a recognized-filter and pure-tail proof, not native SQL
semantics, full Python ingress/admission, authenticated producer, dependency
closure, temporal-cut or protected-publication refinement. Operator
support/selectivity/planner, type/extension and trigger/default/RLS paths remain
required. The actual protected capture/writer protocol and seven semantic bodies
remain open. This augments US-056-AC5/AC9/AC10 component evidence without
promoting any original requirement. Full acceptance remains26/132 and the goal
stays active.


### Protected caller capture: post-elevation information loss — 2026-10-10

[Native observability evidence](../../04-build/evidence/security/truss-capture-observability/533c90f6-3dbe-4d7d-ae83-484617149b4a/native.json) passes10
observations on PostgreSQL16.15 / pgserver0.1.4+truss.pg16.15 / pg8000
1.31.5. In one physical connection and transaction, direct and unregistered
wrapper paths enter the same privileged function. Their original effective actors
differ; the nine post-elevation fields are identical: session person, effective
writer owner, role setting, database, backend PID, xid, session-role OID, writer
role OID and entry-routine OID. The wrapper explicitly captures its actor in
PLpgSQL before entering the writer; direct host capture precedes its native call.
This avoids relying on SQL target-expression evaluation order.

[Formal equal-input analysis](../../04-build/evidence/security/truss-capture-observability-formal/4b3dbd6b-1c44-49f6-8480-0e84fd4c6a69/proof.json) retains two
UNSAT separation attempts for arbitrary deterministic decisions over that exact
tuple, including equal extra state. A SAT population shows that adding a distinct
trusted pre-entry actor can distinguish the paths. This does not authenticate an
added caller label or implement capture. The formulas do not prove all PostgreSQL
protocols impossible: unequal history/nonce/state, trusted host original-call
custody, native frame/stack evidence and additional provenance remain outside
the equal-input premise. No HMAC/signature primitive is implemented or proved.

PA02's protected realization therefore must name the independently trusted
pre-elevation provenance or qualified original-call restriction that enforces
the registered chain. Sealing only these post-elevation fields cannot recover
the missing actor; same-entry OID/xid/PID binding alone cannot classify these
paths. One-use custody must remain, but refusing a second invocation is distinct
from establishing the original caller of a first invocation. The accepted trusted
embedding host can supply original call facts under Truss ADR-008 only through
qualified exclusive physical-connection custody and protected carriers. Native
SQL arguments do not themselves authenticate Python object identity. Preserve
the existing invoker elevation guard; neither writer-owner substitution nor
caller-supplied JSON/GUC fields is an implementation shortcut.

Required protocol tests now include this collision witness, independently
authenticated pre-entry capture, a forged added actor, copied public context,
first-use submission through a different wrapper, same/different native attempt,
transaction and connection, and native plus trusted-host one-use custody across
savepoint rollback. Original PA-N01–PA-N12 and all132 required cases remain
required; this supplies US-056-AC5/AC9/AC10 design evidence only. The fixture
uses local trust actors and synthetic routine/role names, no actual Truss registry
or business effects, and no authenticated subject/production capture qualification.
PA02 and full backend acceptance remain open at26/132. Earlier cleanup failure
and preliminary SQL-expression-order run retain their original sources; the
final receipt alone qualifies the explicit capture order.


### Trusted-host protected capture candidate — 2026-10-10

The [native candidate receipt](../../04-build/evidence/security/truss-protected-capture-candidate/90e12409-3a54-466f-8184-2a54c961669d/native.json) retains23 matching observations on
PostgreSQL16.15, corrected pgserver0.1.4+truss.pg16.15 and pg8000 1.31.5.
Original source bytes, seven source pins and actual installed routine OIDs,
owners, settings and complete definitions accompany the receipt. The earlier
19-observation run and preliminary23 run remain historical; the final run
adds same-transaction absence checks, original frozen AdmissionCustody execution
and guaranteed sanitized failure reporting even if the receipt sink fails.
Two retained subprocess controls exercise secret-bearing exceptions with writable
and unwritable evidence sinks; both suppress secret text and exception chaining.

This implements an isolated physical candidate for the PA02 prerequisite:
an INVOKER query captures native person/actor OIDs, database, backend PID and
xid before elevation. A separately privileged trusted registrar inserts a
private random 32-byte capability bound to those facts, original attempt and
exact synthetic payload. The fixed host dispatch invokes an INVOKER gate and
DEFINER writer; the writer atomically consumes the matching capability before
inserting the synthetic effect. Ordinary callers cannot read capabilities,
write effects directly, create routines in the candidate schema, or inherit
writer/registrar roles. The wrapper gate refuses elevated acting identities.
The capability is never public context or included in retained evidence.

Actual native negatives refuse forged/copied public context, a different
connection (even with the private capability), another login route, attempt/input
substitution, unregistered wrapper invocation and direct private access.
The exact native positive effect is inspected in its original transaction.
For this inspection only, the fixture administrator temporarily grants effect
SELECT, immediately revokes it, and verifies the final prohibition. This is
an administrative test observation, not an adopted ordinary read surface.

Native same-transaction reuse refuses, but savepoint rollback restores the
native capability's unused state. The producer independently demonstrates
successful direct native replay after rollback and verifies its actual effect.
The existing original Truss AdmissionCustody ticket refuses that resubmission
and retains one fixed dispatch. Therefore the composed candidate requires
trusted exclusive host dispatch and private carrier custody; its native table
alone does not provide rollback-resistant one-use authorization. This is not
a qualified SQL-only route or protection from a malicious same-credential host.
A changed transaction also refuses the old capability.

The adjacent acceptance-map.json ties all23 observations to original requirement
IDs without marking a complete schedule passed. The adjacent astra-review.json
retains independent review: all three harness findings were fixed and the final
seven pins, installed definitions and failure controls were independently checked.

This advances US-056-AC5/AC10 physical component evidence and PA-N03/04/05/09
schedule development, without promoting them to complete acceptance cases.
Local trust authentication, synthetic registrar inputs and the fixed actor
profile do not establish production authenticated subject mapping, SET ROLE,
current owner authority, generation/configuration checks, complete callable
closure, resource admission or publication. PA01–PA04 and all seven Truss
semantic bodies remain unfinished; the original132-case goal remains26/132.
Next integration must replace synthetic registrar facts with the original
owner authority/artifact and coherent-cut protocol, qualify installed closure
and protect the carrier throughout the registered adapter. No public API or
ordinary registry grants are added to Truss.


### Native current-authority primitive and lock boundary — 2026-10-10

The [final native receipt](../../04-build/evidence/security/truss-protected-capture-candidate/85d31486-2f88-48e5-b492-ec15b9d730f3/native.json) extends the protected capture candidate to39
matching observations. Seven original source pins/preimages and six actual
installed routine identities, owners, settings and complete bodies are retained.
READ COMMITTED is independently observed and explicitly required by the writer.
RR/Serializable refusal is currently source-reviewed, not natively exercised.
The earlier23/33/38 schedules and their preimages remain historical evidence.

A separate non-login authority responsibility owns a private, fixed single-actor
row with permitted/generation fields. Only the writer can execute its private
check helper. The helper locks the selected row FOR SHARE, then checks complete
row presence, permission and exact captured generation before the writer inserts
its synthetic effect. Ordinary authority SELECT/UPDATE/helper execution and
revoker direct UPDATE refuse. The registered revoker routine updates the row;
it is the selected native mutation route in this fixture, not a complete policy
administration or ontology resolver interface.

Actual revocation after capture refuses without effects. A separately issued
capability matching the revoked generation independently isolates permission
false; regrant advances the generation and the earlier capability remains stale.
A fresh matching generation produces an independently inspected original effect.
An independently submitted revoker times out with native55P03 while the writer
retains the authority row lock; authority remains unchanged. After writer rollback,
the same revoker succeeds and advances the generation. This is one bounded native
row-lock schedule, not proof of complete writer participation, fair termination,
deadlock freedom or final publication. PostgreSQL16's documented FOR SHARE
conflicts and transaction/savepoint release rules govern this candidate:
https://www.postgresql.org/docs/16/explicit-locking.html.

[Formal guard analysis](../../04-build/evidence/security/truss-capture-authority-formal/19fe84d8-27c7-4bc7-b323-52ad9fe0223d/proof.json) saves eight independently replayable formulas:
four UNSAT laws and four SAT positive/weakened controls. Positive generation
integers are unbounded in the model. Exact authority-check and writer routine
bodies are recognized, but SQL execution/FOUND/atomic exception behavior and
complete faithful current authority are premises. The held-lock serialization
law explicitly assumes revoker exclusion; it is not derived PostgreSQL semantics.
The stale mutant requires captured<current; advancement requires next>current.
Originally parsed native bytes are frozen, canonical invocation is required,
and saved formula bytes are rechecked before publication. No SQL/Python/compiler
refinement, ontology resolution or publication-drain theorem is asserted.

The adjacent native acceptance-map.json links all39 observations to original
US-056-AC5/AC9/AC10 and PA-N01/03/04/05/07/08/09/11 component schedules without
claiming those complete schedules passed. The two sanitized failure controls
remain passing; new UUID receipts use exclusive creation, preserving reruns.
Astra review findings about independent permission evidence and proof source
custody/directional controls were applied before final qualification.

This supplies a current-authority physical primitive only. Production subject
mapping, original ontology/policy/artifact admission, coherent complete source
cuts, all authority mutation/callable dependencies, resource/family bindings,
protected carrier lifecycle and final release remain required. Savepoint rollback
releases the native authority lock and restores native capability reuse; the
existing host ticket remains burned. This cannot replace durable pending-buffer
custody or L03 revocation/drain. No Truss public API or supported backend profile
is promoted. PA01–PA04, seven semantic bodies and the original132 required cases
remain open at the historical26/132 checkpoint.


## Raw ontology read-admission candidate — 2026-10-10

The retained Weft `natural-count-self-join` logical plan now drives the captured Truss PostgreSQL predicate lowerer in a private raw-table experiment. Exact original lowerer and graph-source bytes are frozen with the bridge; no fresh Rust compilation or production owner-artifact admission is asserted. Staff, Projects, resources, assignments and ownership form five private relational tables. The rule requires an active Staff assignment to the same Project that owns the resource. This is a synthetic read-admission receipt, not authorization to mutate resources.

Final native evidence is `truss-ontology-capture-candidate/a91be6ca-a0de-417d-bc51-aec34faaeb41/native.json` under `docs/helix/04-build/evidence/security/`: 76 observations, 11 source pins, eight installed routine bodies and three complete five-table fact cuts. PostgreSQL 16.15, corrected pgserver 0.1.4+truss.pg16.15, pg8000 1.31.5 and Bun 1.4.2 qualify this run. Alice can obtain RA/RAB receipts; inactive, unrelated, ownerless and unknown resources refuse. Ordinary private-fact access and predicate execution refuse. The selected membership revoker receives 55P03 while the authority lock is held, then succeeds after rollback. Only Alice/A's active flag changes. Independent current authority `[[6,true]]` precedes denial of all six resources after membership revocation, isolating ontology denial from stale-generation or permission-false denial. Two sanitized failure-boundary controls pass; earlier run receipts remain historical.

Formal evidence is `truss-ontology-capture-formal/e48c8318-302b-4b23-8fd4-f4d25c00a167/proof.json`: seven replayable formulas (three UNSAT laws, four SAT positive/weakened controls), 14 source pins and three complete finite-population replays. Typed unbounded relational semantics establish the natural-witness join law and refusal without active assignment or ownership. Erasing active status, project equality or the mandatory rule admits counterexamples. Faithful facts, native keys, subject binding and serialized current authority remain premises; exact source coupling is not a compiler, SQL or Rust refinement proof. Exact ordered cuts, unique observations and one actor/Staff mapping prevent vacuous replay.

Astra ultra independently verified final pins, formulas and seven rejected mutation controls; review receipts are adjacent. The acceptance map ties all 76 observations to original US-056 criteria and PA schedules as component evidence only. Historical acceptance remains 26/132. Actual typed graph execution (AC2), Ashlar/Delta, authenticated production subjects and owner artifacts, coherent complete current cuts, installed callable closure, four-family protected admission, seven Truss semantic bodies, field publication and final publication/drain remain open. No supported public backend profile or complete PA02/L03 qualification is promoted. Next integration must use the same owner artifact across actual typed graph storage and raw tables, with production owner admission and final release obligations.


## Original-policy graph/raw population parity — 2026-10-10

A separate installer-only spike now executes the same retained Weft `natural-count-self-join` IR through the frozen actual Truss row-predicate and graph-source modules against the exact captured `qualified-property-layout-0.15.owner-export.sql` object/edge tables. Predecessor IR and both lowerer pins must equal the raw candidate's pins before lowering. The current exported layout bytes, including property declaration modules and definition provenance constraints, are retained; synthetic catalog seeds satisfy those constraints without weakening them. These are fixture assertions, not original catalog staging or authenticated owner metadata.

Final evidence `docs/helix/04-build/evidence/security/truss-ontology-graph-parity/9b5634ec-caf8-4624-9c02-00ed637b3a94/native.json` contains 53 passing observations and nine source pins, SHA256 `e957e0d3de95338d5df53743bd9548fe4fd5ca0d17672894b9d49aed501b1f64`. PostgreSQL16.15, corrected pgserver0.1.4+truss.pg16.15, pg8000 1.31.5 and Bun1.4.2 qualify this run. Five complete native projected relation populations match the independently retained raw initial cut, and five match the raw final membership-revocation cut. Alice admits RA/RAB initially and none after her assignment is deactivated; Bob admits RB/RAB both before and after Alice's revocation. Both six-resource corpora include ownerless and unknown resources. A deliberately reused native object ID across Staff/Project verifies qualified type incidence rather than untyped ID equality.

The authored host preflight checks all five source-validity programs (including outer Resource), six unique natural-key/login groups and both native edge-incidence/logical-endpoint correspondences. Eleven malformed-source controls refuse with42501: absent or wrong-domain active properties, logical/native endpoint mismatches, duplicate Staff keys or logins, retired resource/association metadata, absent ownership/resource fields and wrong active metadata. The two endpoint controls independently observe all11 validity/uniqueness components true, Assignment incidence false and Ownership incidence true before refusal. This isolates incidence from both native and logical duplicate-key constraints. The exact installed read-receipt routine is retained. Ordinary callers have no object/edge SELECT; the fixture's PostgreSQL-owner definer returns only synthetic booleans.

Earlier failures are retained, including missing synthetic definition-provenance fields and a corruption initially blocked by native edge uniqueness. Final controls use existing ProjectD to isolate incidence. No new theorem is asserted: the prior typed relational laws apply conditionally, while native correspondence evidence does not prove automatic SQL/Rust/compiler refinement. Natural key properties remain fixture-attested and explicitly checked; canonical key-bucket codecs/namespaces, current coherent cuts, authenticated production subjects/owner artifacts, original staging, production role/callable closure, protected four-family admission, concurrent authority participation and final publication/drain remain required. The adjacent acceptance map links all53 observations to US-056-AC1/AC2/AC5/AC10 as components only. Complete typed-graph AC2 and full backend acceptance remain open at26/132; no public supported profile is promoted.

Astra ultra independently verified all53 observations, nine current/preimage pins, exact frozen lowering, complete initial/final fact parity, all13 installed preflight components and both isolated incidence controls. The adjacent review receipt records no remaining blocker within this installer-only scope.


## Composed protected graph read-admission candidate — 2026-10-10

The actual graph predicate and explicit full preflight now run behind the private original-call capture primitive. The original INVOKER entry still requires the actor/captured native tuple; the writer checks its registrar-issued capability, exact original transaction/attempt/resource bytes and READ COMMITTED, then calls its private authority helper. That helper obtains the same authority row FOR SHARE, verifies permission and captured generation, executes all13 authored graph-preflight components separately, and evaluates the original compiled owner predicate before inserting a synthetic read-admission receipt. There are no raw shadow fact tables. Exact captured Truss object/edge layout and frozen lowerer bytes are used; synthetic catalog seeding remains installer-authored, not original catalog admission.

Native evidence `docs/helix/04-build/evidence/security/truss-graph-capture-candidate/8ea0b9dd-a0c3-4ecc-b8cb-0d5fbf26998a/native.json` passes135 unique observations with14 source pins, SHA256 `108096e8eb0bace54a4ce709cd44e6ef1b995a4aeb52abd7241f3be9576de7db`. PostgreSQL16.15, corrected pgserver0.1.4+truss.pg16.15, pg8000 1.31.5 and Bun1.4.2 qualify the run. The captured graph predecessor's IR, bridge, both lowerer modules and layout pins must match before composition. Nine installed protected routine bodies, exact generated SQL and frozen fixture/lowerer code are retained. The private authority role owns the edge table and can read required catalog/object facts; actor and revoker cannot directly read/write graph tables or invoke preflight. No public graph support claim follows from those fixture grants.

Eleven deliberately committed installer corruptions now traverse genuine fresh private capabilities and the original native entry. Every malformed source independently yields preflight false,42501, an unconsumed native capability, zero effects inspected in the actual actor transaction, and restored preflight true. Both endpoint corruptions observe the exact13-component vector isolating Assignment incidence. Authority [[5,true]] is independently observed before these controls. These fault injections deliberately sit outside the admitted mutation closure; they do not prove complete participation or coherent source-cut authority.

The selected membership revoker updates the authority generation before changing the actual graph Assignment edge. An independent revoker receives55P03 while the read-admission writer holds the authority row; all five projected fact populations remain unchanged. After actor rollback the revoker succeeds, only Alice/A's active flag changes, independent authority [[6,true]] is observed, and all six resource admissions refuse. Three complete projected fact cuts are retained. Transaction rollback still restores native capability reuse; the original host custody restriction remains necessary and is independently exercised. This is synthetic read admission, not permission for canonical resource writes or a complete publication protocol.

Formal evidence `truss-graph-capture-formal/c2b4aa2a-f28e-4434-bb0a-ce96071da3a3/proof.json` under the same evidence root saves14 formulas: six UNSAT laws and eight SAT positive/weakened controls, with17 source pins and all three complete population replays. Original typed natural-witness laws are supplemented by an explicit authored conjunction of original capability, current authority, full graph preflight and ontology membership. A positive composed SAT control prevents an always-false conjunction from passing; independently erasing each admission guard yields a counterexample. These are conditional model laws, not automatic SQL/gate extraction, compiler refinement, native snapshot/lock semantics or final publication proofs. Source custody and observed native controls are separate evidence.

Two sanitized failure-boundary controls pass. The adjacent acceptance map links all135 observations to original US-056-AC1/AC2/AC5/AC9/AC10 and PA component schedules without promoting complete cases. Authenticated production subjects/owner artifacts, canonical graph key-bucket and namespace authority, original catalog staging, complete authority/callable closure, coherent source cuts, all four protected admission families, seven Truss semantic bodies, field publication and final release/drain remain required. Full graph AC2/PA02/L03 and the original132-case acceptance plan remain open at26/132. No public Truss backend profile is promoted.

Astra ultra verified all135 observations, fourteen native pins, nine installed bodies and eleven corruption groups, then independently replayed the final fourteen formulas with seventeen source/preimage pins. The always-false composition mutant fails the added positive control. Adjacent review receipts record no remaining landing blocker within the declared experimental scope.


## SCRAM-authenticated graph composition and owner-binding audit — 2026-10-10

The composed graph candidate now authenticates fresh ordinary, registrar and revoker sessions with PostgreSQL SCRAM on its owned Unix socket. Four role secrets are generated only in memory and never retained or included in receipt hashes or exception chains. The original bootstrap postgres session remains an explicitly trusted installer; the exact HBA admits local postgres trust, requires SCRAM for other local sessions and rejects both loopback host families. Reload completion, parsed rules, stored SCRAM-verifier presence (booleans only) and unchanged final rule rows are independently observed. This is an authenticated owned fixture, not a production issuer/Staff/owner mapping or general connection-authority profile.

Final native evidence `docs/helix/04-build/evidence/security/truss-graph-capture-candidate/f4186d8d-38ff-461d-9f0c-deefd7b8969f/native.json` passes147 observations with14 current/preimage pins (SHA256 `7cbb71735a60b89f622968eb5426ef6457c826f47914f8dfa0b30b8d1dbb5e4b`). Four wrong-secret attempts and an absent role yield28P01; correctly authenticated sessions independently expose the five expected original native identities, including two distinct connections using the same actor credential. NOLOGIN refuses a fresh actor session with28000 while the existing session still has its original identity. Admission revocation remains an independent current-authority obligation; NOLOGIN alone is not an existing-session revocation mechanism. All135 original graph/protected-capture/authority/corruption controls also pass on these freshly authenticated sessions. SQL, lowerer packet, nine installed protected bodies and complete fact cuts are unchanged from the reviewed135 run. Two sanitized failure controls match the updated producer.

Refreshed formal evidence `truss-graph-capture-formal/0e186858-5aca-40cf-b1a6-53b2e792bbb7/proof.json` under the same evidence root replays14 formulas (six UNSAT/eight SAT),17 source pins and three complete populations, SHA256 `f52b59906718137e426c9b959e0652159a31a872f486b3a7e036cae3e47d5aec`. This rebinds the previously qualified conditional model to the authenticated native run; no SCRAM cryptographic, SQL/compiler or publication theorem is added. Historical135 receipts retain their original source bytes and narrower trust-authentication scope.

The next catalog integration cannot silently rewrite the owner source. The actual frozen Truss declaration collector, executed on the retained original owner document, exposes five keys with unspecified primary roles, zero core relationship declarations and two ontology associations with ordered typed endpoints. Resource's complete required signed64 integer salary declaration is preserved alongside key-only read projections. Current native staging source explicitly requires a Boolean primary selection; its guard is source inspection here, not a performed native refusal. These facts require owner-issued storage key-role choices and relationship bindings with original accepted-binding provenance. Key-only graph projection cannot stand in for complete Record/property catalog staging or field publication.

[Owner-binding audit](../../04-build/evidence/security/truss-owner-binding-audit/9d296d60-1dd6-48cd-bb6e-2b63d7d4778e/audit.json) is located under `docs/helix/04-build/` and passes14 observations with five current/preimage pins, SHA256 `46a649c19af2f370518c27667e45de4177b59e0b954ba6f4a12426809d938f01`. A separately parsed frozen oracle checks the complete post-call document, exact ordered keys, complete Field/reference inventories and full ordered ontology endpoints. Composite-key reversal, integer-width deletion, unknown-extension mutation, omitted Record and omitted Field controls all refuse. The initial eight-observation audit had aliased preservation checks and provides no independent preservation qualification; its receipt remains historical. The twelve-observation correction predates the final completeness controls. No fresh owner validation, original catalog preparation/staging or binding authority is claimed by this audit.

Astra ultra independently verified147 native observations/14 pins, replayed14 formulas/17 pins and verified the final14 audit observations/five pins, including all five mutation/omission controls. Adjacent reviews are clean within their declared scopes. The acceptance map treats authentication as a PA-N01 prerequisite, without claiming SET ROLE coverage, and retains original US-056 component links. Complete owner bindings/authenticated artifact/current-cut/installed-callable and mutation closure, all four families/seven semantic bodies, canonical graph keys and final publication/drain remain required. Complete backend acceptance stays26/132; no supported production profile is promoted.

## Original owner document/native catalog staging — 2026-10-10

The unchanged `natural-count-self-join` owner document now passes genuine original UMF preparation and actual Truss provisional catalog staging on PostgreSQL16.15, pgserver0.1.4+truss.pg16.15, pg8000 1.31.5 and Bun1.4.2. Retained evidence `docs/helix/04-build/evidence/security/truss-owner-catalog-stage/75408a57-00c9-4054-bffc-ab2a918dfb73/native.json` passes31 observations/697 source pins, SHA256 `bec358feb8942d8a5bea0208f368da2bece80dc7c08c87e9a1ae3cdbf7cefa88`. Executed copied source includes the owner bundle, actual Truss preparation/stager/native SQL/layout, and declared Ajv8.20.0 dependency closure. The private bounded stdio adapter drives one installer transaction; this does not qualify the complete installed public runtime or driver.

Independent native projections verify exactly five original Records, all nine owned Fields with full scalar/nullability/cardinality/facets and accepted-document provenance, five original ordered keys as non-primary, and zero relationships/endpoints. Exact archived source retains absent primary markers, the unowned Field and unknown content. Salary retains its required signed64 facet. A native primary substitution and a composite component reversal each refuse the intended message/55000 from an isolated genuinely new-key prestate with an agreeing successful positive; exact state is restored. The head stays unpublished and rollback removes all staged catalog rows. Passing evidence is emitted only after independently attempted cleanup succeeds.

The first retained run failed in the RPC command-result adapter. Historical13/20/21-observation runs do not independently isolate key guard refusal: their existing-key prestate can also refuse55000. The corrected29 run predates complete native type/relationship checks. These remain historical receipts, not the final qualification. Refreshed post-validation collector/literal guard audit `truss-owner-binding-audit/db1509e7-7399-4d62-8322-a1663e40a614/audit.json` passes14 observations/five pins, SHA256 `cb2b47b065313e8295a0d8e4e08428245ba1f00b358c78365b5f68b9d55c36cc`; its scope remains source inspection and post-validation preservation, separate from the new native spike.

This resolves the extra host primary-marker restriction and qualifies complete original catalog projection for the captured installer-only subset. Original ontology associations still require authenticated owner-issued physical relationship bindings with exact source provenance. Synthetic operation artifacts, trusted installer identity, absent binding/default JSON homes and rollback-only provisional revision are explicit premises. Accepted owner/binding/current-cut authority, canonical key buckets, complete mutation/callable closure, protected semantic bodies and final publication/drain remain open. US-056-AC1/AC2/AC10 gain component evidence; no whole criterion or backend profile is promoted. Historical acceptance remains26/132.

Astra ultra independently audited final31 native observations and all697 current/preimage source hashes with no remaining blocker. Review was read-only, with no native execution; the qualification remains provisional installer staging with rollback.

Catalog-stage source preimages are retained as byte-exact `preimages.zip` bundles next to each receipt. The producer checks every entry against the captured bytes before execution; independent hash verification checks all entries against the receipt source inventory. This compact representation replaces duplicated dependency trees without changing original receipts or source bytes. The earlier58932dc5 run precedes only this archive representation change.

## Ontology association storage binding implementation gate — 2026-10-10

`docs/helix/02-design/contracts/security-association-binding.proposal.md` specifies original ontology/core/binding provenance, explicit binary edge roles, ordered target-key correspondence, physical compatibility, complete source coverage and acceptance-linked positive/negative tests. Current Truss accepted-binding vocabulary covers storage keys only. A new relationship interpretation must be registered and qualified before native relationship creation; absence of core direction/multiplicity/lifecycle cannot be repaired by silently rewriting the owner document. The next implementation must consume original authenticated artifacts and compiler-owned logical predicates, retain same-witness incidence/attributes, and prove complete mutation/current-authority/publication closure. The31-observation installer-only catalog result does not close these gates or promote26/132.

## Conditional association storage compatibility — 2026-10-10

Formal evidence `docs/helix/04-build/evidence/security/association-storage-compatibility/d31be4c0-393e-4209-b775-e6563ac54c83/proof.json` saves12 independently replayed formulas (four UNSAT/eight SAT), five current/preimage source pins, Z3 4.15.4, SHA256 `0c94557e3b6e55545565d04022a66bf73312f5b30e01bfd19c7470883814ce80`. Quantification over every nonnegative participation count proves that complete preservation excludes an inferred positive minimum or finite maximum, with explicit unrestricted positive and separate restrictive-bound counterexamples. Exact distinct binary role selection preserves the same-witness key/attribute predicate in either physical orientation; assuming ontology array order is native direction has a valid-population counterexample. This is an abstract conditional model. It does not extract SQL/compiler semantics, prove lifecycle compatibility, authenticate owners/cuts, establish complete facts/keys or qualify publication. The initial8-formula run had a tautological count check and is superseded by the quantified model.

Implementation must preserve native unrestricted storage compatibility or require an explicit semantic restriction before choosing bounds. Current Truss native relationship carrier requires bounds/lifecycle/direction, while the retained ontology asserts none. No existing core source is rewritten, and no new accepted-binding vocabulary or native support is claimed by this proposal. Owner-issued role choices, original accepted binding/archive custody, exact independent native definition correspondence and compiler-owned lowering remain required. US-056-AC2/AC10 gain design/component proof obligations; historical26/132 remains unchanged.

Astra identified native `edge_out` endpoint-pair uniqueness as a separate association-instance preservation gate. The final proposal requires an authored key proving endpoint-tuple uniqueness or refusal of this layout. Three additional formulas establish conditional instance injectivity, a valid distinct-endpoint positive and a parallel same-endpoint/different-key counterexample. The nine-formula predecessor lacks this gate. Semantic count laws assume realizability over all nonnegative counts; arbitrary owner domains/keys must be compared independently, and explicit operational resource refusal is separate from semantic restriction. No infinite storage capacity is promised.

Astra ultra independently replayed final12 formulas (four UNSAT/eight SAT), verified all five current/preimage pins and found no remaining blocker within the proposal scope. These remain conditional laws, not native binding admission, SQL/compiler refinement or acceptance promotion.

## Implemented private association correspondence boundary — 2026-10-10

Truss main `fe8a67051a4ecb3c6a0ff10fdd89ab71f3d9a218` implements `packages/python/src/truss/_security_association_binding.py` as a preliminary source-correspondence boundary. It captures exact bounded original core/ontology/binding bytes and returns frozen tuples/bytes, preserving unknown numeric tokens without imposing Decimal or integer ranges. It requires complete association and role mappings, explicit orientation/unrestricted independent storage choices, exact ordered association/target-key references and an authored association key contained in endpoint Fields. Separate instance IDs and attribute-dependent keys refuse the endpoint-pair edge layout. Higher arity, non-string endpoint profiles, changed source digests/revisions, missing/defaulted metadata and duplicate mappings refuse.

Truss evidence `docs/helix/04-build/evidence/security-association-binding/b332851f-fc2d-4489-b737-536aa90bfe84/tests.json` passes39 tests under Python3.11.17, six current/preimage pins, SHA256 `d81a4d95a527948dda63e3e08fa76817a8e8a762818ab2b5bcb7603c01ca44b8`. Tests retain original fixture bytes, both explicit orientations, composite-order positives and independent reversals, endpoint-key subset positives, parallel-instance loss, duplicate/omitted mappings, Unicode/depth/byte boundaries, unknown fractions and extreme exponents/5000-digit integer tokens. Python module boundaries pass245 imports. Astra ultra verified all six pins,39 names against AST/log and the boundary result; it reviewed the corrected implementation with no remaining blocker. It did not rerun the suite or execute native operations.

This checks source correspondence only. Genuine UMF/ontology owner semantic validation, authenticated original artifact/cut and archive revision/pointer authority, registered relationship interpretation, actual catalog/namespace/key/incidence observations, original Weft lowering and complete protected mutation/publication remain independent required gates. The output dataclass is not an admission capability; no database effects/public exports or installed-wheel/backend qualification follow. The mapping carrier is a private candidate, not a newly accepted native vocabulary. US-056-AC1/AC2/AC10 gain preliminary component evidence, not completed criteria; historical26/132 remains unchanged.

## Original owner interpretation and association correspondence — 2026-10-10

`tools/security/qualify-association-owners.py` now executes the pinned UMF producer's original `inspect` API, Weft's legacy `security_mapping_handoff` owner entry point and the captured Truss Python correspondence boundary against the unchanged `natural-count-self-join` core/ontology sources. Final evidence `docs/helix/04-build/evidence/security/association-owner-interpretation/0e6a5088-80fd-4279-b8ef-4da50419248c/receipt.json` passes25 observations/292 current/preimage source pins, SHA256 `c3299918ae2594ff4da0c0063fc4857e58c3317d2ccf27405e34ba65692a5eba`, using Python3.11.17, Bun1.4.2 and rustc1.90.0. Captured Weft sources from clean main checkout `6cc7bc71e47cf31da9197c964db979f9a21ecb4d` build in a fresh temporary target with locked offline dependencies; executed UMF/Python source is copied from captured bytes. Original fixture digests and complete owner handoff match. The producer checks source, executable and archive custody before retaining a passing receipt; preimages and build logs are retained. Registry dependency bytes and the complete toolchain are not archived, so this is not a hermetic-build proof.

Independent actual-owner controls reject invalid core kind (UMF validation and Weft `WFT-MODEL`), substituted ontology document revision (`WFT-SECURITY-PIN`), removal of a declared Assignment Field classification (`WFT-SECURITY-ONTOLOGY`) and removal of an endpoint required by the policy (`WFT-SECURITY-TYPE`). Every Weft refusal has exit1 and empty stdout after the agreeing successful original. The first25-observation predecessor instead added an unknown ontology member; it cannot prove missing-classification rejection. Two intervening captured-source builds failed because compiler schema dependencies were omitted; their logs/preimages remain historical. Successful `caa02791` precedes explicit Python/Bun runtime metadata; `2eefdfc1` retains those hashes but precedes Weft's merged reliability integration. The final run preserves that integration, captures its clean main commit and reproduces the same original handoff. Astra's requested control/custody corrections are applied in the final run.

US-056-AC1/AC2/AC10 gain original interpretation and source-correspondence component evidence. Weft interprets the original legacy policy/query/binding packet; it does not register, issue or authorize the new private association mapping. The private correspondence dataclass grants no native authority. Authenticated owner/issuer/current-cut and archive-pointer custody, registered native relationship interpretation, canonical keys/incidence, complete protected mutation/callable closure and final publication/drain remain required. Historical acceptance stays26/132. Next implementation work must carry these exact owner-validated source dependencies into registered binding admission and independently observed native relationship definitions before protected graph activation.

Astra ultra independently verified the final receipt SHA, all292 current/preimage pins,25 unique matching observations, clean Weft main commit, fresh build log/removed target, runtime/tool hashes and complete handoff correspondence. It found no remaining blocker within interpretation/correspondence scope. Review was read-only and did not rerun the compiler or execute native operations.

## Private provisional binding byte custody — 2026-10-10

The native `catalog_binding_archive` candidate retains the entire original binding body, vocabulary pin, artifact identity, complete original admitted input and actual writer xid. `runtime_stage_catalog_binding` checks original admitted bytes/digest, canonical base64, exact current document cohort and unchanged prior revisions/archive before inserting; the archive participates in catalog generation and has ALWAYS immutable UPDATE/DELETE/TRUNCATE guards. The actual private TypeScript stager calls it inside the existing savepoint before native definitions. Unknown binding content remains uninterpreted, including binary NUL/invalid UTF-8 and extreme numeric token text. Present-binding default homes still refuse; these fixtures explicitly select JSON homes.

The complete native prestate capture has a distinct `truss-native-catalog-prestate/0.2-binding-custody` profile including prior archive rows. The 0.1 producer refuses when the archive relation exists. This is fresh isolated candidate DDL, not adoption/migration of the exported storage layout or populated deployments. **The 0.2 parity/finalizer is unimplemented**: existing `runtime_verify_new_catalog_prestate` does not admit this profile. No accepted report, readiness, publication or registered relationship authority is established. Native JSON aggregation is size-checked after aggregation; it is not a general CPU/allocation bound.

Captured-source native receipts (PostgreSQL16.15, pgserver0.1.4+truss.pg16.15, pg80001.31.5, Python3.11.17, Bun1.4.2):

`truss-binding-catalog-stage/4c7f2a37-f6bc-4582-a282-696b6b7374bf/native.json`: 84 observations/700 current/preimage pins; SHA256 `c183c2eed9a290fec6d1ebed4e3b553d35be0761663373bbeea526efc1f6a208`.

`truss-binding-catalog-stage/e8e65e86-4af3-4840-88ad-5e85f2a7da26/native.json`: 79 observations/700 current/preimage pins; SHA256 `0216dc8b7ee69c26fe9b4c195aba856cf6388aa56ecd0fab1d8d2741d6958bf2`.

`truss-owner-catalog-stage/af76cacd-6eb8-48a4-937e-c7e6fd7b8f4e/native.json`: 31 observations/697 current/preimage pins; SHA256 `f2839fa8c5c52e37a16408ad0fc7eddf34ab0f0b08f09ea22f9651d4d987115c`.

Occupied coverage uses an explicitly excluded installer seed on revision0 with inert original bytes, not an accepted historical cohort. All guards are restored ALWAYS before genuine capture/staging. Successful current staging and whole rollback preserve that prior row; an isolated prior identity-byte drift after original capture refuses with the intended55000 message and zero effects, following an agreeing positive. Independent byte substitution, prior revision, document revision/digest refusals, generation, immutable guards, ordinary-role privilege denial and full catalog/archive projections also pass. Ordinary-role controls use SET LOCAL ROLE in the excluded installer session, not login/SCRAM qualification. All required cleanup completes before passing receipts. Bun catalog-input preparation regression:16 tests/55 assertions.

Astra ultra reviewed source/controls, verified the earlier75-observation/700-pin receipt, and requested occupied-prestate coverage and fresh execution; both are now retained above. Historical75/77 predecessors precede current harness, and two failed attempts (including misrouted `truss-owner-catalog-stage/8bccc16f-9255-4ec0-b786-5de3cb0c9c9e`) retain failure/preimages without claiming support.

US-056-AC1/AC2/AC10 receive component evidence only. Historical acceptance remains26/132. Authenticated owner/issuer/current-cut and report custody, registered vocabulary/relationship interpretation, canonical keys/incidence, complete protected mutation/callable closure, 0.2 finalizer/publication/drain and remaining backends stay open. The archive is byte custody, not a policy engine or a semantic authority.

Astra ultra independently verified the final occupied receipt SHA, all700 current/preimage pins and84 unique matching observations, including isolated prior-byte drift, restored ALWAYS guards, before-admission old-profile refusal and exact positive/rollback preservation. It found no blocker for this narrowly scoped landing; review did not execute native probes.

## Binding-aware retained new-only parity — 2026-10-10

`runtime_verify_new_catalog_prestate` now reconstructs the complete retained catalog for exact profiles0.1 and0.2-binding-custody. The binding-aware branch includes every prior binding archive row, excluding only the selected new revision; exact JSONB parity detects prior-byte drift and missing/extra members. The verifier refuses0.1 with an installed archive or0.2 without it, using55000 `original prestate archive profile correspondence required`. A constant parameterized query keeps the optional relation out of the legacy absent-archive branch. This supersedes the earlier statement that0.2 retained parity is unimplemented; **finalization/publication remains unimplemented for this profile**.

`truss-binding-catalog-stage/ad0315c2-eb86-41ea-a50e-8d3ad3ff6ebf/native.json`: 94 matching observations/700 current/preimage pins; SHA256 `bcc3a44518a1472f6457d1486e6251e15f05d4e8f43bdd5fdb3a1f8131462a26`.

`truss-owner-catalog-stage/4e88698c-cb91-469f-af43-87ddc8b20070/native.json`: 32 matching observations/697 current/preimage pins; SHA256 `87b54f11f5071001c762bd535e4c2e637c2ce40d0b26f7f5d11501e6903fd148`.

Actual native positive verification passes before and after full original cohort staging. The occupied fixture's isolated prior identity-byte drift refuses retained parity with the intended55000 and no further effects; rollback restores prior fixture bytes exactly. Both profile/relation mismatch controls call the verifier itself after an agreeing positive, then restore the original snapshot. Profile substitution is explicitly excluded-installer fault injection: the original-operation guard function is temporarily replaced to permit substitution, then restored from exact captured original DDL before verification. Attempts to mutate without that exclusion and to ALTER the trigger with pending deferred events failed before reaching the verifier; their evidence is retained without claiming branch coverage. A separate native startup timeout is also retained. Legacy absent-archive positive coverage now directly executes the verifier, rather than inferring support from staging. Native versions and installer/SET LOCAL ROLE limitations remain those of the preceding binding-custody evidence.

This is retained new-only parity only. It does not authenticate the prestate producer, validate the excluded current cohort, authorize accepted-report provenance, register semantic vocabulary, prove native relationship/key/incidence correctness, or finalize/publish revisions. These gates, protected mutation/callable closure and remaining backends remain open. US-056-AC1/AC2/AC10 gain component evidence; acceptance remains26/132.

Astra requested a valid legacy-shaped prestate for the installed-archive mismatch: the final94-observation run changes only the profile and removes the0.2-only `bindings` member, leaving every other native catalog component unchanged. Its intended55000 demonstrates refusal of otherwise silently omitted archive state. The earlier02038994 packet retained that member and remains weaker historical evidence.

Astra ultra independently verified final94/700 and32/697 receipts/pins, corrected legacy shape, exact mismatch errors and restoration. No remaining blocker for retained-prestate parity scope. Review was read-only and did not execute native probes.

## Original full native inventory and key-default correspondence — 2026-10-10

Executing `runtime_collect_new_catalog_inventory` on the unchanged owner-validated natural-count cohort exposed a real staging/verification disagreement: `runtime_stage_new_key` already interpreted omitted `primary` as false, while the inventory compared stored false against SQL NULL. The inventory now applies the same explicit false default. It preserves authored true and false; no primary key is inferred from a key name. The original failed collector execution is retained at `truss-binding-catalog-stage/e50fdd37-6b9b-4a51-89df-33f452f632f1/failure.json`.

`truss-binding-catalog-stage/ea488fcf-d9c1-4417-b9d2-7a39153af847/native.json`: 99 matching observations/700 current/preimage pins; SHA256 `4c3a5d6efeddd78dcc8e9349e7988758a35d77f0e6ece582572dcf78260bccca`.

`truss-owner-catalog-stage/a54de9b1-c3e0-4959-a215-e8a6bc34c531/native.json`: 33 matching observations/697 current/preimage pins; SHA256 `802b9c97d036f53b3acfa8a344b4be4205586e917a86375db47718065fbe6b79`.

The actual binding-aware full inventory now returns5 original Records,9 owned Fields and5 keys; the actual count collector returns5/9/5/0/0/0. It invokes complete core declaration/definition/source and retained-prestate checks. An agreeing positive precedes isolated native substitution of one nonprimary key to primary; the collector refuses with55000 `stored original ordered Key definition correspondence`. Full key_def rows now participate in native before/after refusal and savepoint rollback snapshots, so restoration is directly checked. The final99-observation receipt supersedes951e83ac, whose snapshots omitted key rows. The absent-archive path independently invokes the full count collector and retained verifier, passing33 observations. Versions, captured source custody, cleanup and installer limitations remain as recorded above.

This does not prove present-binding current-cohort authority: the collector still interprets authored core definitions only; byte archive presence does not register ontology relationship semantics. The ingress report basis still refuses present bindings pending registered binding effect interpretation. Authenticated owner/issuer/current-cut/report custody, native relationship/key/incidence interpretation, complete protected mutation/callable closure and final publication remain open. US-056-AC1/AC2/AC10 gain component evidence only; historical acceptance remains26/132.

Astra ultra independently verified final99/700 and33/697 receipts, hashes and current/preimage pins; the isolated exactly-one-key false-to-true fault, intended refusal and full key restoration; actual inventory/counts in both profiles. It found no blocker within authored-core correspondence scope. Review did not execute native probes.

## Complete-inventory binding exclusion — 2026-10-10

The original ontology does not issue the bounds/lifecycle/direction asserted by the authored-core native relationship stager. The source-correspondence candidate cannot synthesize those assertions or use accepted-document provenance for an ontology-derived relationship. Registered physical interpretation remains required before native association effects.

A complete-inventory gap is now closed: the existing original-core implementation is explicitly `runtime_collect_new_core_catalog_inventory`; its body and source checks are unchanged. The `runtime_collect_new_catalog_inventory` wrapper reads the actual retained operation's original input bytes and admits only version0.1 with exact absent binding carrier. A present or unsupported carrier refuses with0A000 `registered binding effect inventory required` before delegation. `runtime_collect_new_catalog_counts` still calls that wrapper, so it cannot silently report zero binding-derived relationships as a complete inventory. Both functions are invoker routines with PUBLIC execution revoked. This is a binding-specific exclusion, not a general complete-effects theorem; transforms, accepted report authority and other obligations remain separately guarded/open.

`truss-binding-catalog-stage/67d0fa7d-c649-43a6-8eae-8ddb31cba4cd/native.json`: 102 matching observations/700 current/preimage pins; SHA256 `20ca5221ee8c136739d506aa7fd69f32aaa6b3b7cc8b0d450196be4166659e9a`.

`truss-owner-catalog-stage/9a26a93f-39cc-4ad7-af83-dfbfd7d4971f/native.json`: 33 matching observations/697 current/preimage pins; SHA256 `110fbc0e47f28c2e28b05833d6e9cfb470f535bce6ff1162423c6993fa675fff`.

The binding run labels its19-definition success `original-core-only-native-inventory`, preserves key mutation/refusal tests, and independently refuses complete inventory and counts with exact intended errors and unchanged native snapshots. The original absent-binding cohort independently passes actual complete inventory/counts and retained parity. Earlier18dec7b8 passed the same gate but used the misleading complete-inventory label; it remains historical. Versions, copied source/ZIP custody, cleanup and excluded installer limitations remain recorded above.

Prior99-observation results remain evidence of authored-core correspondence only; they cannot authorize complete present-binding effects. No criterion is promoted: historical acceptance stays26/132. Next implementation requires original owner-selected physical profile obligations, retained ontology/core/binding extraction provenance and registered native effect interpretation, followed by protected key/incidence/mutation closure and authenticated final publication.

Astra ultra independently verified final102/700 and33/697 observations/pins/hashes, original retained binding gating, exact0A000 refusals and unchanged native state, and found no blocker for this binding-specific exclusion. Review did not execute native probes.

## Explicit physical storage basis carry-through — 2026-10-10

The private association binding already requires eight explicit storage choices. Its immutable parsed result previously omitted them, leaving a downstream compiler to revisit bytes or reconstruct defaults. `AssociationStorageBasis` now carries source/target minimum and maximum, directed, lifecycle, composition and inverse verbatim from the validated candidate, plus the exact zero-based original `/mappings/n/storage` pointer. `AssociationBasis.storage` retains only immutable primitives. Mapping order determines the source pointer; explicit role orientation remains separate. No field is inferred from the ontology, key name or endpoint order, and missing storage continues to refuse. Original binding bytes remain retained.

This does not register the candidate or authenticate its issuer. The selected independent, unrestricted binary subset remains unchanged; alternate storage behavior still refuses. The constructible dataclass is correspondence data, not a native admission capability. A later registered interpreter must resolve this pointer against the original retained artifact and independently establish ownership, interpretation profile and current-cut authority before effects.

Captured-source qualification `association-owner-interpretation/8da2bb4f-6362-4ff1-9b29-fd86e498084e/receipt.json` passes31 observations/292 current/preimage pins, SHA256 `79bc868540dad12081332ca1b9088b246379e9f1989526b15bbe6561e1d9a763`. It executes43 captured association tests and retains their log; additional checks verify both source pointers and every declared storage value. Fresh captured Weft build and pinned UMF owner inspection preserve the complete original legacy handoff and four independent owner refusals. Versions, executable custody and nonhermetic dependency/toolchain exclusions remain in the receipt. Python module boundary check passes268 imports.

The native harness now pins that refreshed interpretation receipt instead of the stale predecessor. `truss-binding-catalog-stage/39a1513e-a668-4619-921e-5bd6573472e2/native.json` passes102 observations/700 current/preimage pins, SHA256 `8dc7ddd6469cd40181d4a4b5e0564937fb45d8e3270b6227fa5c0dc8c6067b0a`: original byte archive, occupied prestate, core-only inventory and complete binding-effect refusals remain intact. The old owner interpretation receipt remains historical with its captured preimages; its source pins are no longer current after this deliberate change.

US-056-AC1/AC2/AC10 gain preliminary source correspondence evidence only; acceptance remains26/132. Registered native association definitions/provenance, canonical key/incidence and protected mutation closure, authenticated report/issuer/current-cut and publication remain required.

Astra ultra independently verified the31-observation/292-pin receipt, exact source archives, fresh owner build and43 test names/results against captured source. It found no blocker for the frozen storage-basis carry-through; review was read-only and did not execute tests or native probes.

## Public installed preparation of the original security cohort — 2026-10-10

The newly merged public Python `prepare_acceptance` API is exercised against the unchanged original natural-count core and exact association binding candidate. Source/core bytes and caller-selected binding carrier survive exactly; owner declarations contain5 Records,9 owned Fields and5 keys, with no invented core relationships. The public provenance explicitly keeps `installation_profiles_verified=false` and scope `original_umf_preparation_only`. Unknown binding vocabulary is preserved without registration/endorsement. Invalid core kind must refuse as `invalid_document` with original owner `CORE_SCHEMA_PROPERTIES` error at `/modules/0/elements/0/kind`; the isolated valid-format binding SHA substitution must refuse as `invalid_input`, preventing a generic runtime/producer failure from satisfying either control.

`tools/security/qualify-public-security-preparation.py` captures83 source/test/configuration/asset preimages, builds a fresh wheel offline without fetching build dependencies, installs it into an isolated temporary target, verifies the imported `truss` path lies within that target, and executes the copied5-test suite. Every shipped source/asset is compared byte-for-byte with its captured original; copied execution inputs and current source pins are rechecked. Python/Bun executable hashes are checked before/after. Build/install/test logs, original wheel and ZIP source preimages are retained. Temporary build/install state is removed before the passing receipt is written. This is not a hermetic build-toolchain proof or full installed-wheel/backend qualification.

Final `public-security-preparation/4edd0e6e-ea75-47ec-8d0f-e8ae84eeb9d0/receipt.json` passes5 tests/83 current-preimage pins, SHA256 `1f0e91dc542867fc47a1095484527096e8238229d074adea10b1b5deae0e11c4`; retained wheel SHA256 `fb23c4ab910f3678776e545f49906b933b5fe31ff4fe1a103a637a706a3a6f19`. Python3.11.17 and release-pinned Bun1.4.2 execute the actual public preparation. Predecessorsd0154fef andddb37985 lack final runtime/copy or exact refusal/path controls and remain historical. An initial development assertion expected flat Field/key arrays; inspection showed the actual owner declarations nest them perRecord, and the final test checks complete sums across all five owners.

This replaces custom-bridge-only evidence at the public preparation boundary; it does not replace ontology owner interpretation, register the binding vocabulary, open a database or issue accepted identities/reports. Authenticated owner/issuer/current-cut, native physical association/provenance/key/incidence and protected mutation closure, final publication and other backends remain required. US-056-AC1/AC2/AC10 gain component evidence only; acceptance remains26/132.

Astra ultra independently verified the final receipt SHA,83 current/preimage pins,77 exact shipped sources/assets,5 installed-wheel tests and precise diagnostics, import-path isolation, runtime hashes and cleanup. No blocker for this public preparation coverage. Review was read-only and did not execute tests.

## Independent current-operation native binding source observation — 2026-10-10

`runtime_collect_original_catalog_binding` independently reads the immutable native binding archive under the actual current writer/ordinal and admitted catalog operation, with the original exclusive head admission. It invokes the established complete original-core inventory, original document carrier and retained-prestate gates, then compares full archive input/writer and original artifact body/SHA/identity/vocabulary against the retained operation's original input. It returns exact binding/input hex bytes and digest, plus the actual writer xid, operation ordinal and effect generation. It preserves opaque binary content and does not decode its semantics. The invoker routine has PUBLIC execution revoked.

This is fresh isolated candidate DDL and a source observation, not an accepted-binding source envelope, authentication or registration. Native `accepted_binding` provenance remains rooted in an immutable accepted report; provisional operation data cannot be relabeled into that category. The returned row is not a transport/reuse capability; future compiler/host custody must recheck original operation/generation and independently qualify semantic owner/current-cut authority before effects. General native CPU/allocation/aggregate transport budgets and complete runtime/driver qualification are not established by these finite fixtures.

`truss-binding-catalog-stage/c9857f9c-d1af-4198-984a-60cc3340628f/native.json`: 129 matching observations/702 current/preimage pins; SHA256 `77d37a6714279ff06614ad23a92509c128456ff407e79c0926902fec022ac346`.

`truss-binding-catalog-stage/643295c1-98b7-4e29-bd7f-30cab1b0cca4/native.json`: 121 matching observations/702 current/preimage pins; SHA256 `5522c6d07dc1db0ecc116a8ac3a73885cc1a6a4001dcb01590e67f1573d004b1`.

Each archive body, complete input, writer xid, artifact identity and vocabulary fault changes one field on the current revision following an agreeing positive. Excluded installer injection temporarily disables archive immutability solely for the fault, restoring ALWAYS guards before observation; the intended55000 refuses with unchanged fault-state and exact rollback restoration. An independent document revision fault refuses through the existing original-document carrier gate. Ordinary SET LOCAL ROLE cannot execute the routine (42501). Full native key/document/archive/operation snapshots and required cleanup remain retained. Opaque binding input includes NUL, invalid UTF-8 and extreme numeric token text; byte custody and complete-inventory refusal remain intact.

The initial125-observation predecessor included redundant document matching in the observer. A later control failed only because the existing core carrier refused earlier with its original error; that retained failureffdb4452 is not a passing new branch test. The final implementation reuses that established carrier and removes the redundant loop. The final129/121 runs use the intended existing error and unchanged source pins.

US-056-AC1/AC2/AC10 gain component evidence only; acceptance remains26/132. Registered native association definitions/extraction/provenance, complete canonical key/incidence and protected mutation closure, authenticated original issuer/current-cut/report custody and final publication remain required.

Astra ultra independently verified both final receipt hashes,702 current/preimage pins per run,129/121 unique matching observations, exact binary source observation, six isolated intended55000 refusals, ordinary42501, unchanged fault-state and restoration, and continuing0A000 complete-binding gates. No blocker for current-operation byte observation. Review was read-only; native execution was not rerun by the reviewer.

## Exact original association mapping extraction — 2026-10-10

The private association basis now retains each whole authored mapping value as immutable `definition_bytes`, its exact logical `/mappings/n` source pointer, and candidate extraction identifier `truss-original-association-json-candidate/0.1.0`. Extraction occurs after the existing complete JSON duplicate-member, Unicode and resource validation; returning a basis still requires every original shape and semantic correspondence check. Decoded root member names locate the original mappings array; JSON decoder boundaries select original value slices. UTF-8 encoding those original slices preserves authored member order, internal whitespace, escapes and multibyte text without reserialization. Whitespace outside the selected value remains in the full original binding archive. Mapping order determines the pointer; endpoint orientation remains explicitly authored.

This addresses the exact-source requirement for a future registered compiler without inventing accepted provenance. The extraction identifier is not a registered vocabulary, signature or transport capability. The result remains constructible correspondence data; a consuming admitted operation must independently resolve its pointer/bytes against the original current binding archive and qualify ontology/core owners, complete dependencies, semantic interpretation, issuer/current cut and accepted report authority. No relationship is staged and the complete binding inventory gate remains closed. Existing1MiB source,32-depth,16384-node and4096-array limits remain; retained mapping slices total no more than the original binding bytes. This is not a whole-runtime heap, native transport budget or formal decoder proof.

Captured owner qualification `association-owner-interpretation/f316ca00-80f1-4da5-8b97-686e6c278733/receipt.json` passes36 observations/292 current-preimage pins, SHA256 `7e84130a8293cf25ebb2fe40b233d9d08bc5becd6bd755926da85020c51e8088`. It executes50 captured tests, checks both exact mapping fragments/pointers and the candidate extraction identifier, and retains fresh Weft owner build, UMF owner validation and four original-owner refusals. Added controls cover authored formatting, escaped root member/value spellings, reordered/root-first mappings, multibyte UTF-8, delimiters inside strings, escaped duplicate-member refusal and immutability. Python module boundaries pass281 imports. Toolchain/dependency exclusions remain explicit; this is not a hermetic build.

The native harness now pins that refreshed owner receipt. Fresh original-candidate catalog `truss-binding-catalog-stage/c6f72f92-9c1c-49bb-836c-2cba600fdeee/native.json` passes121 observations/702 current-preimage pins, SHA256 `82b3719d24e77d564587e9af3af56ee1f4b353384b0a24359246ce49a21f2c49`. Occupied original-candidate prestate `truss-binding-catalog-stage/aac9ca11-a9bc-4cff-8a76-217bc4ee2928/native.json` passes129 observations/702 pins, SHA256 `9662ff875ee2988d5bbc76b50d3e0ba84f868c7fb2e4c3c3e98c6b0500872566`. Original byte observation, six correspondence faults, complete-binding inventory/count refusal and exact rollback/cleanup remain intact. These installer-only native runs do not execute the Python extraction on a protected native transport or authenticate a normal caller; that composition still requires qualification. Earlier owner/native runs remain historical with their preimages after the deliberate source update.

US-056-AC1/AC2/AC10 gain component evidence only; acceptance remains26/132. Registered association interpretation/provenance, complete canonical key/incidence and protected mutation closure, authenticated original issuer/current-cut/report custody, final publication and other backend implementations remain required. Astra ultra independently verified the owner receipt's292 current/preimage pins,36 observations and50 captured test names/results with no blocking findings; review did not execute tests or native probes.

Astra ultra also verified both final native receipts:702 current/preimage pins each,121/129 unique matching observations, unchanged31 native SQL inputs, intended correspondence/privilege/complete-inventory refusals and completed cleanup. No blockers for this scoped landing; review was read-only.

## Pending binding provenance and report ordering — 2026-10-10

The native source observer and exact original mapping extraction expose an ordering obligation, not a reason to weaken `accepted_binding`. CONTRACT-001 roots that category in an immutable accepted report; current report preparation instead requires complete native inventory. Requiring an already accepted report before every binding-derived native definition, while requiring those definitions before producing that same report, creates a strict dependency cycle. The current implementation refuses present-binding report preparation and complete inventory; it does not implement this proposed protocol.

Select an explicit operation-local pending binding source state for the next layout/producer spike. A pending relationship is a real native definition with reserved native identity, endpoints and association property owner, but its source kind is an internal candidate `operation_binding`, never `accepted_binding` or `accepted_document`. Its provenance retains the actual writer/ordinal, unpublished revision, full original binding/input bytes and exact mapping pointer/fragment, with independent original association/target Record dependencies. It may be constructed only after registered vocabulary/owner interpretation and original authenticated operation admission. This state is not a new shared UMF semantic kind, ontology assertion or published catalog-view source category. Its native columns/checks, registered decoder and migration are unadopted layout work; the existing source union must not be silently reinterpreted.

The protected transaction sequence is: (1) archive original input/documents/binding and stage the exact pending physical association effects; (2) independently enumerate complete native definitions/endpoints/keys/property homes and all original dependencies at one generation; (3) produce and retain the complete immutable report describing those observed effects, original sources and registered interpretations; (4) resolve the actual report's acceptedInput.binding against the complete original archive, promote only matching pending source tuples to `accepted_binding`, and retain the same definition identities/endpoints/property homes; (5) freshly verify the complete final physical inventory, provenance closure and report correspondence at the resulting generation; (6) atomically publish the head and finalized operation. No ordinary catalog/read/mutation path may observe or execute a pending definition; neither publication nor transaction finalization may retain pending sources. Errors roll back the whole acceptance. A constructible preparation, returned mapping, report bytes or matching count cannot bypass these gates.

Report insertion and source promotion are real effects and may advance the operation generation. Final recheck must therefore acquire its own current cut after both; it cannot reuse the pre-report inventory cut. The immutable report describes semantic physical effects and exact original sources, not a claim that its own insertion or later source promotion did not occur. Final comparison must explicitly account for the sole permitted provenance promotion, verify every other definition/effect remains exact, and independently verify the report/input/binding bytes and registered profile. A hash/count-only comparison, normalized omission of unknown effects or fabricated zero inventory is forbidden. Any further catalog, authority or relevant data mutation invalidates the final cut until a complete fresh recheck; the host and native publication owner must enforce the same original operation/generation and required wait/drain protocol.

Implementation exits, in order: issue the exact pending native source tuple/layout through the owner-controlled schema/exporter and a closed language-neutral contract; implement registered original-source association interpretation and independently qualified native definition staging; implement a complete pending-aware physical inventory and report producer; implement immutable report correspondence and exact source promotion; qualify fresh final inventory/authority publication and ordinary-role closure. Every exit retains source/definition/cut evidence. This proposal selects the ordering, not owner registration, layout adoption or a functioning backend.

US-056-AC1/AC2/AC10 tests must cover the full positive transaction and exact native binding source/history projection, plus: stage accepted provenance before report; fabricated document provenance; omit/extra pending mapping or dependency; change key/role/attribute/home/endpoint under equal counts; substitute report/input/binding/profile; promote another writer/ordinal/revision; mutate after recheck; keep a pending source at head publication or commit; ordinary reads/writes of pending definitions; failure at each phase with complete rollback and source/history preservation. Original caller/issuer/current-cut and complete writer/privilege/cleanup/drain evidence remain required. Conditional solver results cannot close these native cases or promote the26/132 acceptance total.

## Conditional binding publication ordering proof — 2026-10-10

`tools/security/prove-binding-publication-order.py` retains14 original SMT-LIB formulas and independently parses/replays every formula with Z3 4.15.4. `binding-publication-order/fb3ebd52-120f-40e3-9d3c-7b47c1cf73e6/proof.json` passes8 UNSAT safety/incompatibility checks and6 SAT feasibility/weakened controls, with8 current source/preimage pins; SHA256 `619ddae6df8bf6faf7557c85bdfebadbde67774ce997d4786cf13e5627b24477`.

The incompatible strict order stage→inventory→report→stage is UNSAT; this is an excluded proposed ordering, not a claim that current code runs cyclically. The selected pending-source sequence has a SAT execution. Conditional publication excludes report/promotion/recheck order violations, reuse of the earlier report-generation cut, a later effect at publication and remaining pending binding sources. Full quantified native physical identity/value parity forbids extra, omitted or substituted effects; a weakened equal-identity inventory admits a changed value. Independent weakened generation, pending-source and ordering gates admit bad schedules. Original byte custody alone is compatible with absent authority/registration. The initial12-checkac7a9204 predecessor omitted the explicit pending-source law and used a weaker substitution premise; it remains historical with preimages, not current final qualification.

The model has fixed selected event families over unbounded integer order/generation and abstract full physical values. Original owner/issuer authentication, registered semantics, exact original/report-source correspondence, complete closure, monotone native generation correspondence and full physical inventory equality are explicit premises. It is not a native SQL refinement, concurrency/liveness theorem, formal JSON decoder proof or implemented report/promotion/finalizer. A native report insertion and provenance promotion may both advance generation; final publication must bind a fresh post-promotion cut. All unknown effects/profiles remain refusals. Native installation must independently verify the proposed internal source category/checks and exact permitted source promotion before any accepted-view admission.

This ordering is a backend compilation/acceptance obligation for both relational and graph mappings. The proposed internal `operation_binding` source tuple is a Truss layout candidate; it does not add a shared UMF semantic kind or impose Truss columns on Ashlar or other implementations. Their own pending effect/provenance mechanism must prove the same original-source, complete-effect, report, final-cut and publication requirements under their qualified physical controls. AC1/AC2/AC10 remain open; historical acceptance remains26/132.

### Exact head transition and post-head finalization obligation

The existing `runtime_observe_catalog_generation` observes the actual `schema_head` row update: it increments effect_generation and resets phase/readiness/sealed/application state. The proposed protected finalizer must retain this observer. The pre-head recheck only authorizes the exact original head transition; it does not authorize commit. Under the same original exclusive head/caller/operation custody, write exactly the selected old-head→new-revision transition, independently observe the actual generation increment and reset state, then run a distinct complete post-head verifier. That verifier checks the exact new head, immutable report/input/binding, fully promoted definition/source inventory, journal/feed/non-row effects, complete authority and zero pending sources, and establishes readiness/sealing/application evidence at the actual resulting generation. Commit/public disclosure requires that generation to remain current. A further relevant effect invalidates it; arbitrary late mutations receive no exemption.

For the formal selected single-head-row event, the head generation is the pre-head generation plus one. This correspondence is a declared native refinement obligation, not a universal assumption about a larger finalizer transaction: every additional observed journal/feed/catalog event must be completed and included before the post-head cut, with exact registered inventory/generation correspondence. The current `runtime_collect_new_core_catalog_inventory` rejects a head that has reached the candidate revision, so it cannot serve as this post-head verifier. The new finalization verifier and complete commit barrier must be implemented and qualified separately; the existing unconditional fail-closed barrier remains installed until that full replacement is ready. A phase flag or a report hash cannot substitute for it. Add native tests for the head-trigger reset, pre-head evidence reuse, an extra post-head effect, wrong old/new head, incomplete post-head journal/feed closure and failure after head update with full rollback.

## Reviewed final head-aware publication proof — 2026-10-10

Astra review identified two defects in the initial protocol qualification: the actual head observer increments generation and clears readiness, and the feasible SAT witness allowed an empty physical inventory. The final design requires a distinct post-head finalizer/verifier and preserves the unconditional current commit refusal until a complete replacement is qualified. The final model requires a present definition in its feasible execution, models the selected actual head event and post-head/commit generation cuts, and uses named guards so every weakened control erases exactly its intended guard while retaining the others.

Final `binding-publication-order/903fcd60-6635-4cda-8651-6879dac95dd2/proof.json` passes18 retained/replayed formulas:11 UNSAT and7 SAT, with10 current/preimage pins including the actual native catalog-generation observer and commit barrier. SHA256 `4183dd15fc92d980acedcab6d307684c01e5e0f5f41c01153af74dd59208a5e5`. Added laws reject a post-head check preceding the head event, reuse of pre-head readiness and an effect after post-head verification; the corresponding omitted commit-cut guard admits a later effect. The prior12/14-check receipts remain historical and cannot establish the corrected head-aware protocol. Existing registered/authority/source/full-parity/closure and native event-generation correspondence premises remain explicit. No native pending layout, report producer, promotion, post-head verifier, complete finalizer or backend acceptance is claimed;26/132 remains unchanged.

Astra ultra independently replayed all18 final formulas (11 UNSAT/7 SAT), verified10 current source/preimage pins and exact formula hashes, and confirmed the head-generation and populated/isolation findings are resolved. No remaining blocker for this qualified design/formal checkpoint; native refinement and implemented publication remain open.

## Native pending relationship-source tuple candidate — 2026-10-10

The fresh-layout adjunct `catalog-pending-binding-source-v0.1.proposal.sql` implements the selected internal `operation_binding` shape on generic `rel_def`, with no per-ontology tables/indexes. Five columns retain native writer xid8, operation ordinal bigint, binding revision int, C-collated original mapping pointer and exact mapping bytea. Native composite FK requires the referenced original operation row; the binding FK requires the original archive revision. The pending branch requires every field and association property owner, the same positive binding/creation revision, a nonnegative ordinal,1–4096 pointer bytes and1–1048576 mapping bytes. Accepted-document and accepted-binding branches preserve their prior predicates and require all pending columns NULL. The existing source-home legacy ordinal/FK interpretation is not replaced by this adjunct.

`tools/security/capture-pending-binding-layout.ts` uses the actual UMF PostgreSQL owner importer, retains the full native-source model, saves/reloads it and exports the SQL used by the native test. Native source, saved model and owner-export SHA256 are respectively `5242d6cc5c77ac0f88184e74fc7af5369254a4aa9f1c057292b048e641c23d76`, `667cb771d1a56c0b464527e88f26d590d59008b3e7a75d6ee5ded3d7f5157cff` and `183abbb3884210ca18c967351ea3352399468970fde9f5a447234ac8a4f9ee45`. The retained capture receipt pins five owner entry sources and Bun1.4.2; it is original-source/saved-export correspondence, not complete dependency/toolchain custody or portable semantic extraction. Preserve its raw native extension/unknown content. This is not adopted installation or populated conversion SQL.

`tools/security/truss-binding-catalog-stage.py --pending-layout` installs the exact owner-exported adjunct in isolated PostgreSQL16.15. Excluded installer tests insert a structurally complete pending row using actual operation/type IDs and the original fragment from the qualified source-extraction receipt; they independently read native column types/C collation, exact tuple bytes and the generation observer increment. Named23514 CHECK controls reject each missing field/property owner, NULL/unknown/premature source kind, mixed document/binding tuples, empty/oversized pointer/fragment, nonpositive revision and negative ordinal. Named23503 FK controls separately reject absent operation ordinal/writer and original archive. Each previously valid accepted-source branch independently rejects each single added pending field. A separate excluded installer document fixture makes the legacy since_rev/doc_ord FK valid at revision zero, isolating positive pending archive revision versus a different valid creation revision; the exact source-completeness CHECK rejects it. All injections and attempted rows roll back to complete document/key/relationship/endpoint/archive/operation snapshots; the archive immutability guard is ALWAYS before its missing-archive probe and after restoration.

The archive FK refuses plain truncate with0A000 before the immutability trigger; a separate cascading attempt reaches that trigger and receives its intended55000 with zero effects. Ordinary SET LOCAL ROLE cannot read/insert pending rows (42501); this is not authenticated login or complete callable/privilege closure. Complete binding inventory remains0A000 and the schema-qualified existing deferred commit barrier remains55000 `complete runtime finalizer is not installed`. That unconditional barrier is not a pending-specific finalizer proof. Original accepted-branch positive fixtures prove shape preservation only, not accepted report provenance.

Final occupied-prestate `truss-binding-catalog-stage/15e512a9-2eab-4cd7-9951-09772ce37125/native.json` passes214 observations/711 current-preimage pins, SHA256 `784a2506fb4c1847eec206fb6e380cfbcf08799f465660dfb6c3e44146c3186a`. Fresh pending layout `dfcb2f45-8e57-48f3-bc8e-2c3791c668a0/native.json` passes206/711, SHA256 `2f9db9808d3d9b4aa492d382943d430ed7a5c0f012d28989f1631ad76bb807b7`. Unchanged original layout `2b0fd119-80c6-44a0-a527-510b53d104f2/native.json` passes121/702, SHA256 `c582c9f06dcfba6bd8be0237cbbe958fb9a0312c245ab8104210cf197378d6e7`. Exact source ZIPs, observations and required cleanup are retained. Development failures7bd1f91a (new FK refuses truncate before trigger) and9bcdbfaa (unqualified constraint name resolves nowhere) are retained failures, not passes; ba237cd9/1ff1b251/95ef117c/f4382068 predecessors lack final native readback or isolated controls and remain historical with captured preimages.

FK/shape evidence proves referenced row existence and completeness, not that the operation is the authenticated current writer/cut, its kind/phase is admitted, the archive writer/input agrees, or the pointer/fragment represents registered semantics. Existing admitted helpers do not stage or interpret this pending source. The source observer's authored-core inventory cannot be reused unchanged once a binding-derived relationship is staged; the registered pending-aware inventory/source verifier must independently account for it without fabricating an authored relationship or weakening completeness. Whole pending artifact/operation aggregate resource budgets, full lifecycle/history/promotion, protected ordinary API, native key/incidence/attribute closure and post-head publication remain required. US-056-AC1/AC2/AC10 gain component evidence only;26/132 remains unchanged.

Astra ultra independently verified214/711,206/711 and121/702 matching observations/current-preimage pins, exact ZIPs, original accepted predicates, NULL-safe pending separation, isolated revision equality, full restoration and required cleanup. Both requested control refinements are resolved; no blocker for tuple/FK shape only. Review was read-only and did not execute native probes.


## Original ontology closure before pending staging — 2026-10-10

The private Truss0.1.0 binary association carrier supplies only an ontology digest/revision, leaving its original ontology outside the native archived input. Select a distinct private0.2.0 carrier embedding a closed ExactArtifact ontology (`identity`, canonical `bytesBase64`, `sha256`) alongside existing original source digests/revisions/mappings. Exact original core is already in AcceptanceInput documents. No legacy source is silently upgraded; archive-only recovery refuses0.1.0. This is Truss correspondence metadata, not new UMF core meaning, registered semantics or authority. The recovered ontology still needs genuine owner validation, original revision/model correspondence and full mapping coverage.

Private source tests cover exact original formatting, missing/extra artifact members, malformed/noncanonical encoding including nonzero pad bits, original substitution, corruption, identity/size bounds, legacy archive refusal and unchanged semantic mapping checks. Whole original binding remains1MiB, limiting embedded ontology capacity; a matching digest does not admit a resource or operation. Retained local Truss evidence records62 passing Python3.11.17 tests (50 legacy,12 new) and288-import boundary checks with exact changed-source ZIP readback/logs. These are entry-source checks, not installed-wheel/native custody. Owner qualification and native archive composition must be refreshed against the changed module before pending staging. US-056-AC2/AC10 gain no completed backend criterion;26/132 remains unchanged.


### Refreshed original-owner and native carrier evidence

`association-owner-interpretation/8ed0ba2a-6fb7-407a-a6db-c9fa4e487551/receipt.json` passes38 observations/301 current-source pins, SHA256 `dc3100cde30534c65e8d16687e3c3f97429dacca1ff8f0bf5cfa89b5d1c2be36`. It executes captured source with a fresh locked offline Weft build, the original UMF owner bundle and both private test classes62tests; recovered ontology bytes equal the unchanged original owner input exactly. Its original core/ontology digests, explicit0.2 binding and exact mapping fragments are retained. Artifact identity remains a label; whole owner registry dependencies/toolchain are not archived, so this is not hermetic or authenticated owner admission.

Fresh isolated PostgreSQL16.15 pending-layout carrier run `truss-binding-catalog-stage/710573f9-9a1c-46da-8c43-7b383238ec51/native.json` passes206 observations/711 pins, SHA256 `f404271f85480eb5fd4f183f4b3b0b8ac365dc52629e8ffc75d38867d9456647`. Occupied-prestate `d29befac-1e58-4132-893d-729ce1ab2fb3/native.json` passes214/711, SHA256 `67422da3fd07a51095b1945948b8ddb53f328e7330ea0cf4a9594e22a86b558e`. Both retain exact source preimages/native readback/control restoration and completed required cleanup. Native SQL is unchanged: it preserves original full carrier bytes and tuple/FK shape but does not decode/register ontology semantics. Complete present-binding inventory remains0A000 and the unconditional commit barrier remains55000. Previous receipts retain their original captured qualification and are not current-source evidence for this changed Python module/harness. Pending registered staging, semantic native key/incidence/property closure, complete reporting/promotion and post-head publication remain next; no acceptance promotion.


## Native exact original mapping extraction — 2026-10-10

The ontology-dependency carrier alone does not prove a native pending row retained the original mapping selected by its pointer. The private `catalog-binding-mapping.sql` component now supplies an exact UTF-8 byte slicer and a separate operation-linked collector. The pure extractor accepts bounded unique-member JSON objects, canonical `/mappings/n` pointers with index0–4095, and a selected object value; it returns the original byte slice without JSON/JSONB reserialization. Escaped root member names are decoded for lookup. Multibyte values, escaped quotes/delimiters, whitespace, member order and extreme uninterpreted numeric spelling survive unchanged. It validates original syntax and duplicate member names including nested/escaped aliases. It does not validate the binding vocabulary, every mapping object, ontology semantics, keys, authority or an accepted report.

An explicit1MiB/null admission check precedes one whole-input lexical scan and PostgreSQL JSON parsing. At most32 nested containers are permitted, counting the root object as one and the mappings array as another; strings/escaped braces do not count. This native lexical-container bound is separately qualified, not a claim of identical Python node/depth accounting. Byte offsets use bytea/get_byte, preserving exact UTF-8 source bytes. Allocation/work/deadline and operation aggregate accounting remain separate. The private value-end helper is meaningful for already validated JSON boundaries; the full extractor establishes syntax/uniqueness independently before returning a fragment.

`runtime_collect_original_association_mapping` first calls the unchanged original binding observer, retaining actual operation/archive/input/document/core inventory checks. Both original owner-qualified mapping fragments match native outputs before pending effects. A real excluded installer pending-row insertion makes this collector refuse55000 `unique original declaration required`; it cannot be reused after pending effects, because the current collector expects authored-core relationships. Pending-aware registered interpretation/inventory remains required. Every new routine is INVOKER, has a fixed search path and is revoked from PUBLIC; ordinary helper/collector denial is qualified through SET LOCAL ROLE only, not an authenticated installed callable closure.

Final PostgreSQL16.15 fresh pending-layout `truss-binding-catalog-stage/408708d1-92ee-43f1-bcf0-c2c83c3b6275/native.json` passes254 observations/712 source pins, SHA256 `ccde4637af80524535d3ab88680cf8e5c4e8fa6196c2bf2bdb04e983436345ec`. Occupied-prestate `78218f40-ab78-4329-a729-c7fe7d6434d7/native.json` passes262/712, SHA256 `6954187077546876184e310c09cc98d7cfd5c98c717afdaf519a39733ab16540`. Both retain original source ZIPs, exact results, refusal/zero-effect/restoration controls and completed required cleanup. Positive boundaries include1MiB, index4095 of4096 entries and exact whole depth32 before/after the selected mapping and in a later mapping. Negative controls cover duplicate names, malformed/missing/wrong arrays, absent/non-object selections, canonical pointer/index violations,1MiB+1 and whole depth33. Matching syntax/source checks do not prove formal native refinement of the scanner or native graph policy behavior.

Astra found that the initial selected-prefix scanner left deep suffixes unbounded. The correction scans the whole root before parsing or selecting; all exact boundary/suffix controls above execute. Earlier eafc7f59 (239),f91f9d0d (246) and90c4a3d6 (252) retain their captured passes only: they predate the final whole-input correction or exact suffix positives and are not current qualification. No installed profile, registered pending producer, report/promotion/publication or acceptance criterion is promoted. US-056-AC1/AC2/AC10 gain source-component evidence only;26/132 remains unchanged. Next implement native dependency correspondence and the registered pending batch producer with original authority and a pending-aware inventory, then compose complete reporting/promotion and post-head verification.

## Original-source private association staging candidate — 2026-10-11

The private PostgreSQL16.15 candidate stages two original binary associations as generic pending rel_def/rel_endpoint metadata, deriving Record owners, ordered fields/keys, role orientation, all storage values and exact mapping fragments from the archived original input. It retains association properties without fabricating authored lineage. Whole-source validation runs once before the ordered exact-byte batch extraction; 4096 mappings pass and 4097 or a later non-object refuse atomically. Original ontology parsing keeps unknown huge numeric content as JSON/original bytes. Typed role/key guards and complete entity/association reference inventories reject aliases, duplicates and malformed unused dependencies.

Final merged-main native receipts under `truss-binding-catalog-stage/`: `0c0f6dba-26cc-4117-8132-9afae1196a41/native.json`: 316 passing observations/713 captured source pins, SHA256 `cda618d1108c041604f9839d08a6d6028b13b229f6c32bf97b1ea73018fc238f`; `7b354d91-ad12-417c-97e6-01ba815e3f40/native.json`: 324 passing observations/713 captured source pins, SHA256 `ab7ef2da6640a685baa0ee18f6e5f42b50c558ec46db548c358624baf35b6ac6`. Fresh and occupied runs retain source ZIPs, exact native readback, eight-component restoration snapshots including lineage, ordinary-role denial and required cleanup. Paired source controls restore the exact operation guard before probing and are excluded installer mutations, not newly owner-issued meanings. Development failures365880f5 (pending-trigger ALTER refusal) and04eec4d9 (native escaped-NUL parser mismatch) remain retained failures; earlier passing receipts are captured predecessor evidence.

This is an unregistered installer candidate, not an adopted layout or protected producer. Native field arrays are limited to256; ontology escaped NUL receives explicit0A000 unsupported-parser refusal while original bytes remain intact. Complete binding inventory still refuses0A000; repeated staging refuses55000; the unchanged unconditional commit barrier refuses55000. Accepted association lineage/history, registered semantic authority, authenticated callable closure, data key/incidence/attribute enforcement, shared aggregate resource accounting, complete reports/promotion and post-head finalization remain open. No whole private0.2/native equivalence or native refinement proof is claimed. US-056-AC1/AC2/AC10 receive component evidence only; acceptance remains26/132.

## Post-stage original source custody candidate — 2026-10-11

`runtime_collect_pending_association_source_candidate` observes pending source custody after actual staging without invoking the authored-only relationship inventory. It requires the current admitted operation, held head exclusion, an existing unpublished revision, exact original input/archive writer/vocabulary/artifact/digest correspondence, original document carrier correspondence and native document integrity. One whole-source mapping batch establishes a complete one-to-one pointer/fragment cohort; every matching pending row retains the current writer/ordinal/revision and exact bytes. Returned mapping digests and the observed generation are component observations, not durable readiness or finalization certificates. Missing/duplicate pointers, byte substitution, an independently valid extra pending row, changed original document metadata and another revision refuse with zero observer effects; ordinary invocation is denied. Eight-component restoration includes lineage.

Final PostgreSQL16.15 receipts under `truss-binding-catalog-stage/`: `428d4fae-c838-4ebd-904b-d12448d47564/native.json` passes338 observations/713 source pins, SHA256 `8fb832c6258f4be67eba63cb5a8e313d35dab56a6b90b04e0f91be587b9d9e45`; `fb8dd6bc-3dab-4ec4-9439-5ec9d4911c04/native.json` passes346 observations/713 source pins, SHA256 `cd136ccd8f79f35ceca8809cd85c1fdd2ba813ddbe5637f82d331a71b798141d`. Source ZIPs, native executions and required cleanup are retained. Predecessors7baac25f/95bfe724 (334/342 observations) lack the independent extra-row control. Predecessor3d7bab6d (331 observations) preceded the original document carrier recheck and is historical only. The observer does not validate relationship storage/endpoints/property/key semantics, original operation issuer/cut, accepted lineage, full core/effect inventory, native data constraints or publication. Full binding inventory and commit barriers remain closed. US-056-AC1/AC2/AC10 receive custody component evidence;26/132 acceptance remains unchanged. Next compose registered source/semantic interpretation and pending-aware complete effect verification; this observer must never substitute for those gates.

## Original pending metadata effect verification candidate — 2026-10-11

The native source resolver now derives original association metadata without insertion; the allocator consumes that result and retains original source provenance. The private effect collector composes the independent exact source cohort with the original Record/Field/Key and authored-core correspondence checks, then compares each full native relationship row against the source-derived row, excluding only the allocated ID and separately verified pending source members. Accepted-source columns, retirement, namespace, owner, name and all storage fields must match; each relation has exactly one correctly oriented endpoint and no fabricated lineage. Existing pre-stage core inventory remains pending-refusing; its new internal core-only mode is not a registered complete effect inventory. Ordinary effect invocation is denied. Full registered inventory still refuses0A000 and finalization55000.

Final retained PostgreSQL16.15 evidence: `truss-binding-catalog-stage/460762fd-b4d0-462e-9be1-545ebc09a813/native.json`: 371 passing observations/717 source pins, SHA256 `69dc7d64afe943b2e818e7047a2f9dd9c04ae91a684c8e7466f3fede62b43308`; `truss-binding-catalog-stage/18458931-eb83-48d4-a847-c1502f96056a/native.json`: 379 passing observations/717 source pins, SHA256 `6c73d00a899ffc8c66376b4091c138b94063ac8b72bf4d76df8ab80c53259d3b`; `truss-owner-catalog-stage/748beedb-0438-4d55-a1ab-deb7c2873ebe/native.json`: 34 passing observations/702 source pins, SHA256 `324a7fc2f22fb93ccc9c561d584219f0164594838ff7b81bbbd20f63a3a5df87`. The absent-binding regression has5 Records/9 Fields/5 Keys and0 relationships/endpoints; it does not supply positive authored-relationship coverage. Candidate controls independently mutate storage, association owner/name, orientation, endpoint absence, an extra valid endpoint, a valid fabricated lineage row and original core field metadata. The latter two structural injections preserve source-custody success while effect verification refuses. Ten-component restoration includes actual types/properties and lineage. Original late mapping/type/inventory/custody controls remain.

The combined verified inventory is assembled in deterministic order and source-inspected code checks16384 rows/1MiB before emitting it. Exact combined row/byte threshold execution is still required; the current cohort does not prove those boundaries. CPU/deadline/allocation/shared operation budgets remain open. Both harnesses use a single-handle pgserver subclass with private mutex/socket directories and unchanged installed startup/cleanup methods. Three captured pgserver implementation files are observed runtime-source premises, not a hermetic frozen-module/toolchain proof. Failed predecessor091fa928 completed362 observations but failed current-source pins after concurrent edits; cleanup was interrupted waiting on the shared pgserver mutex, then its exclusively owned postmaster, temporary/socket directories and execution copy were cleaned separately. Failure and exact preimages remain failures, not promoted evidence.

Astra ultra independently audited final observations/current pins/exact ZIPs/cleanup and resolved extra-endpoint, fabricated-lineage and property-restoration coverage gaps. This is private new metadata-effect correspondence, not registered ontology/policy authority, admitted lineage/history, native key/incidence/attribute data enforcement, complete report/promotion/post-head verification or installed ordinary closure. Positive authored-relationship and composite ordered-key controls, exact combined boundaries and full backend execution remain open. US-056-AC1/AC2/AC10 receive component evidence only; acceptance remains26/132.
