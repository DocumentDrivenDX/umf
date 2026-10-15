---
ddx:
  id: TD-079
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-079
      kind: informed_by
    - id: SD-008
      kind: informed_by
---

# TD-079: Policy package, typed validation and portable evaluator

**User Story:** [[US-079]] | **Feature:** FEAT-008 | **Solution Design:** [[SD-008]]

## Scope

Story-level realization of US-079-AC1–16; CONTRACT-062/063 govern exact surfaces.

## Technical Approach

Policy package, typed validation and portable evaluator. Inherit complete-fact admission, mandatory restrictions and native
refusal from SD-008. No source policy can choose a trusted issuer or native role.

## Component Changes

Spike files under `02-design/spikes/security/` establish bounded feasibility.
Production components follow the existing portable-library/runtime separation;
new package/schema/API details must conform to CONTRACT-001 and CONTRACT-062.
Backend-specific source and receipt adoption are consumer-owned.

The production extension package and standalone policy/ontology schemas now
live in `spec/extensions/security/`, generated reproducibly by
`scripts/security-schema.py` with the existing core literal schema. Portable
types, preservation, registry integration and bounded typed inspection live in
`src/extensions/security/`. CONTRACT-062 specifies the concrete serialized
surface. Registry inspection alone does not resolve host-supplied immutable
documents; the explicit typed-closure API supplies that gate. Full fact admission
and expression execution remain subsequent implementation steps.

Input: Policy source and admitted complete facts. Output: decision/disclosure and retained source.
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

Bun contract tests, real Chromium parity and generated counterexamples. Every exercising test cites `@covers US-079-AC` with its full numeric
criterion ID. STP-079 owns per-criterion cases; declaration-only checks do not
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

## Implemented read spike boundary

`src/extensions/security/evaluate.ts` provides bounded access and collection
evaluation over immutable copies of host-attested facts. Exact qualified Core
Key tuples, relevant inventory/attribute closure, Strong Kleene expressions,
permit/require/forbid composition, disclosure conflicts and separate original-use
actions follow CONTRACT-062. Empty collections still admit all scoped
dependencies. Results disclose selected field representations without hidden
input identities. Host authentication, authority freshness, physical query use
and final-release synchronization require independently qualified consumers.
Evidence in `04-build/evidence/security/` is scoped to those components and
cannot close native backend acceptance.

`SecurityReadRegistration` now supplies immutable in-process definition selection,
with atomic content pins and bounded opaque handles. It rejects same-revision
classification changes while retaining the prior meaning. Construction is a
trusted host operation; native credential verification/current source authority
remain consumer obligations. CONTRACT-062 specifies its exact trust and resource
boundaries. All twelve named semantic runners are implemented; no native backend
criterion is closed by this registry.

Typed source dependency closure is now exported through
`securityPolicyDependencies`. It requires complete interpretation and supplies
qualified live fields, identity/endpoint components and association inventories.
This is a semantic input to native writer classification, not a physical mapping
or compiler implementation. Uninterpreted content refuses dependency analysis.


## Complete query-use dependency admission

The portable evaluator and owner Rust simulation now preflight prohibited fields
and original-action dependencies before row evaluation. Empty collections and
false primary-action branches cannot skip those selected dependencies. Original
disclosed query values require coverage/presence even when excluded from output.
All five operators retain disclosed/original-authorized/prohibited modes and
separate raw-value permission. Fifteen new real-Chromium observations exercise
empty prohibited queries, complete original-action cuts and incomplete original-
action cuts; the Rust corpus contains 75 cross-language evaluation scenarios.
These checks qualify logical admission, not native query execution or inference
resistance. Original-action request provenance is a native profile obligation
under CONTRACT-063; a request action string alone is not a credential.

### Unbounded relational existence proof

The owner asked whether formal logic is applied to the security system. It is: policy semantics use typed relationships and F/T/U interpretation, with scoped indeterminacy and mandatory composition. The initial retained proofs include bounded relational witnesses; their scope must not be described as arbitrary population correctness.

`tools/security/prove-existence-unbounded.py` adds a quantified first-order theorem over arbitrary indexed witness populations. It independently defines logical existence as the least upper bound in the disjunction order F < U < T, including the base F for an empty population. Z3 4.15.4 proves that the native CASE-priority algebra (any T, else any U, else F) refines that definition, that unknown-only negation cannot grant, and that empty populations yield F. Violations are UNSAT; positive and deliberately weakened/default controls are SAT. The integer index is an abstract witness label, not a native key carrier or identity conversion.

This proof has no two-witness population bound. It still assumes identical, complete and stable logical/native witnesses and scalar truth correspondence. It does not prove source authentication, SQL parser/compiler implementation, native collection completeness or release authority. Native implementation diagnostics and full backend acceptance remain separate obligations. The retained script, source pins and solver results are in `existence-unbounded-formal.json`.


## Protection catalog wire boundary — 2026-10-15

CONTRACT-062 owns the concrete `umf.security.protection`0.1.0 wire carrier:
qualified Field domains, named typed constants, tagged disclosure properties,
per-operator modes and opaque custody/propagation obligations. The generated
schema and package live in `spec/extensions/security-protection/`; generator
`scripts/security-protection-schema.py` reuses the existing core literal schema.
The public UMF entry point exports source read/write, package metadata,
inspection and the closed interpretation requirement. The inspector snapshots source, validates wire structure and local
identity/literal bounds, and reports unknown members without discarding them.
It does not normalize exact numeric carriers or resolve immutable core documents.

`valid` qualifies that wire subset; `complete` is false and
`requireProtectionInterpretation` refuses. Separate domain/function closure,
actual selected query dependencies, policy0.2 references, write/reverse action
binding and native enforcement remain required. Predicate/aggregate dependency
selection belongs to the existing profile-bound compiler boundary; catalog
metadata cannot designate a convenient claimed dependency for a query. No new
compiler/profile owner or competing lowering interface is introduced.

Wire tests cover malformed known shapes, duplicate parameter names, exact
4096-unit canonical literal boundaries, tagged disclosure and complete required
custody declarations in Bun and Chromium. Mutation controls must distinguish
omitted identity/bound/propagation checks. These component tests do not close
S13–S25; their concrete full-scope runners and independent behavior oracles remain
required under STP-079.


## Policy0.2 representation and legacy semantic embedding — 2026-10-15

The canonical `security-v0.2` schema retains the prior record/relationship draft
and adds exact protection catalog pins and dispositions. Representation migration
changes only version/revision, preserves unknown/native/literal content and
refuses known/unknown classification drift; it never refreshes host cuts.
Catalog source resolution returns immutable snapshot coordinates and does not
establish core domains, function meaning or authority.

The explicit single-resource legacy-body access operation retains the original
0.2 source/revision, requires a body fully admitted by the existing0.1 typed
closure, and delegates through a private version-only semantic view to the
existing evaluator. The private view is never returned or installed. All
protection pins and unknown/new meaning refuse. Existing0.1 public/native gates
continue to reject0.2 source. This is a specified semantic embedding, not a new
compiler profile or protection interpreter. Current/proposed write-state and
native admission remain separate obligations.

Source frame/guard Z3 models are conditional over immutable maps and the same
legacy outcome function. Executable tests and public-root Bun/Chromium replay
supply separate implementation observations; neither is a general0.2 or physical
refinement theorem. Retained evidence is under
`04-build/evidence/security/policy-v2-20261015/` (from the HELIX root).


## Qualified core-domain closure — 2026-10-15

The protection resolver owns an extension-level, storage-independent closure;
it does not introduce CONTRACT-045's proposed successor core envelope or resolve
native schemas by name. Caller-supplied exact pins select detached core0.8
snapshots. Core validation must be valid and complete, and every occurrence must
resolve to an explicit Field. Tuple maps preserve exact document/module/element
identity independently of closure order. All coordinates are cleared on failure.

The retained snapshots preserve distinct input/output definitions, all known
scalar families, containers and unspecified core labels. Bare reference roles
remain opaque, consistent with CONTRACT-040. The boundary does not infer authored
record-type provenance, native equivalence, value/function applicability,
ontology validity or authority from revision labels. It refuses unknown source
meaning rather than treating wire validity as semantic admission.

`protection/domains.ts` owns closure snapshots, pin/document bijection and core
Field lookup; `references.ts` continues to own exact catalog source addresses;
`catalog.ts` owns wire/local bounds, and `source.ts` JSON/YAML preservation.
Function/type compatibility, parameter literal validation, query-use dependencies
and native enforcement remain later admission gates, not extra meanings attached
to the coordinate result.

The independent S13/S14 oracle compares authored expected definitions/refusals
and JSON/YAML trees in Bun and Chromium. Conditional Z3 models cover exact
identity/revision/Field guards and atomic refusal; they assume the correctness of
core validation, map construction and snapshot/encoding operations. They do not
prove executable or native refinement. Evidence is under
`04-build/evidence/security/protection-domains-20261015/` from the HELIX root.


## Conditional typed declarations and query properties — 2026-10-15

`validateProtectionParameters` checks every authored parameter and range-bucket
literal with the original core literal semantics, after exact pinned domain
resolution. `inspectProtectionQueryProperties` compares an exact selected catalog
disposition against retained, supplied operator-property requirements. Effective
properties retain authored provenance separately from implied same-scope equality.
Join/group require equality, order requires order, omitted modes prohibit, and
random-token disclosed join/group refuse even with authored equality.

Compatibility is conditional on supplied dependencies and declared transform
facts. It never attests actual compiler derivation, original-action authorization
or native admission. Deterministic stability allows collisions; it does not
establish injectivity, canonical-value equality or query rewrite equivalence.
Parameterized range properties use original typed literal equality within the
same exact pinned Field; unsupported equality and unproven entailment refuse.

Private work and normalized-text ledgers are shared across both stages of one
query check; core closure validation precedes these ledgers. A private nested
Field index preserves qualified identity without repeated long-prefix keys.
These are bounded interpretation guards, not a theorem about total heap/CPU.
Function names/arity, parameter-domain/output compatibility, actual compiler
lineage and native enforcement remain required B-SFP-003 and later work.
Evidence: `04-build/evidence/security/protection-query-20261015/` from HELIX root.


## Pure reference functions and explicit date dependency — 2026-10-15

CONTRACT-062 now owns exact parameter signatures and present-input/output
checks; CONTRACT-066 owns the explicitly selected civil-date recipe. Core
CONTRACT-049 and the existing instant recipe remain unchanged. Security does
not infer a calendar from the scalar family. Every selected policy Field must
match the transform's exact qualified domain; arbitrary domain inclusion is
not inferred from successful lookup or equal family labels.

Module boundaries: `protection/functions.ts` owns closed selected signatures,
Field applicability, literal/domain checks and pure results. It imports only
existing security domain/parameter/budget modules, core JSON/literal/types, and
the independent `adapters/gregorian-date.ts` recipe. The adapter owns ten-byte
civil-date parsing/truncation without host Date, clock, locale or timezone APIs.
Public root exports are `inspectProtectionFunction`, `evaluateProtectionValue`,
`parseGregorianDate`, `truncateGregorianDate` and their named result/profile
types. Constructor/function/SQL text is never executed. Neither module imports
backend, tooling or test code.

`bun test tests/security tests/adapters/gregorian-date.test.ts` checks existing
semantic boundaries plus every new function. The existing source boundary guard
remains intact. Original literal budget accounting is shared through parameter,
input, arithmetic and output checks; canonical output limits are checked before
string repetition. Exact coefficient arithmetic never converts values to Number.
Function results retain source and do not prove authored property facts, actual
compiler dependencies or native authority. Full B-SFP-003 and B-SFP-004 remain
open until their complete required exits are independently qualified.


## Catalog transport implementation — design2026-10-15

CONTRACT-062 owns the distinct0.2 transport interface and original stored-carrier
rule. `protection/disclosure.ts` owns its types, exact envelope/column/cell checks
and atomic immutable result. Imports are limited to existing core JSON/literal/
types, protection domain/parameter/private budget/index modules, preservation
and the explicit Gregorian adapter. Public root exports inspection, encoding,
decoding and named transport types. The legacy disclosure module is unchanged;
no fake legacy policy, ontology or competing native admission path is created.

The codec resolves original canonical and transformed output Fields separately.
Stored original tokens use the actual canonical token Field, never a plaintext
Field with a storage-domain override. Storage declarations are checked even in
empty/withheld batches. Presentation transforms do not claim physical writes.
One private literal ledger spans all cells and parameters; failure clears the
validated batch. The existing source-boundary test plus strict typecheck/browser
build enforce portable imports. Consumer identities, raw-table/graph bindings,
row provenance, compiler lineage and current authorization remain host-owned.

STP-079 allocates independent Python expectations, Bun/Chromium root API replay,
source mutation controls and conditional formal laws. The formal abstraction
models disjoint tagged carriers, exact supplied source/domain correspondence and
atomic refusal; it assumes executable parser/checker refinement and does not
prove native authenticity, custody or policy correctness. Original S20 acceptance
must run through the unchanged158-case gate before promotion. No criterion is
removed when a transport case passes.


## Action-purpose source closure — design2026-10-15

B-SFP-005 needs a source-owned exhaustive purpose inventory: current action ID
sets, grants and selected query/write profiles do not encode all purposes.
CONTRACT-062 owns optional draft ontology0.2 actionPurposes and the separate
inspection API. No purpose is inferred during migration. The original Weft
query profile remains the sole originalAction designation.

`action-purpose-declarations.ts` owns exact purpose-set consistency over an
already copied ontology; `ontology-checks-candidate.ts` invokes it whenever the
optional source member is present. `action-purposes.ts` owns bounded source
snapshots, whole-ontology resolution, immutable outcomes and atomic refusal.
It imports only core JSON/types and these existing security modules, with no
backend, test, host or request-authority imports. Root exports only inspection
and its data/result types. The declarations helper is internal, not an authority
issuer. `bun test tests/security` plus strict types and the actual browser replay
check the portable boundary. No competing compiler/profile constructor is added.

The actual public API spike reproduces wire/domain acceptance of aliased reverse
IDs while the interpreter continues to refuse. The two-world formal counterexample
shows identical unclassified source cannot decide opposite intended purpose
assignments. Conditional separation proofs require complete known classification
AND actual owner-profile compatibility. Neither source declarations nor proofs
establish native route completeness, permission, cryptographic custody or a
TypeScript refinement theorem. Tests must include a hidden owner-route countermodel
and legitimate explicit reverse grants, so a ban on every policy action cannot
masquerade as a fix. S21-S23 and B-SFP-005 remain open until their complete exits.


The standalone canonical proposed ontology schema is now
`spec/extensions/security-v0.2/ontology.schema.json`, generated reproducibly by
`scripts/security-ontology-v2-schema.py` from the retained narrower prototype plus
optional source purposes. The prototype remains unchanged historical material,
with its distinct spike schema ID. Candidate whole checks and migration consume
the canonical proposed schema; this adds no ontology registry package or native
admission. Unknown content remains preserved and blocks complete interpretation.
`protection/obligations.ts` composes original parameter/domain checks and source
purpose inspection into an immutable unverified declaration report. It does not
consume caller action annotations or issue operation/native receipts. CONTRACT-062
owns its exact status, obligation kinds, ordering and error semantics.


## S21-S23 declared obligation verification — 2026-10-15

The fresh unchanged158-case gate accepts all37 bound cases: S01-S23 and the
previous14 raw-native cases. The121 other required bindings remain missing,
so the overall gate remains failed/open. S21/S22/S23 respectively retain150/186/152
matching observations, with71/89/72 independent Python-authored checks in each
Bun/Chromium runtime plus parity, source-custody and browser controls. All
assertions, criteria, layers, deadlines and required IDs remain unchanged.

Exhaustive authored action purposes are checked against the exact ontology pin;
reverse/vault-write purposes remain exclusive while explicit reverse policy
grants remain legal. Hash algorithm/salt, effective unsalted equality and the
mandatory dictionary warning, complete token/encrypt custody, all five propagation
channels, unused transforms, original stored token/cipher transport and atomic
source-preserving refusal are covered. Every obligation remains unverified;
complete:false and authority:false are retained. Actual operation-owner profile
compatibility, source authentication, permission and native custody/propagation
are not qualified by these tests.

All200 related tests (2932 assertions), strict types, build,392 schemas and67
packages pass. Thirteen actual-source controls reproduce exact named assertion
failures when guards are removed. Root conditional logic analysis records8UNSAT
laws/9SAT countermodels; independent design analysis records10UNSAT/6SAT, with
explicit owner-compatibility premises and no program/native refinement theorem.
Astra reviewed the complete original declaration assertions and independent
expectations; two oracle/harness corrections, the conservative source-word guard
failure, wrapper type failure and interrupted gate remain retained. See
`evidence/security/protection-obligations-20261015/` from the HELIX build root.

B-SFP-005's declared-model S21-S23 exits are met. Its full upstream B-SFP-003
compiler/property dependency, S24/S25, all remaining backend/lifecycle cases and
original current-authority/native composition remain required. No vault calls,
crypto execution, native reversal or permission are introduced. The goal remains
active. Existing raw-native qualification remains PostgreSQL17.9.


## Legacy write protection correction — design2026-10-15

Reuse the original scoped disposition resolver in evaluate.ts through an internal
original-Field capture path; public access outputs remain unchanged. Capture only
fully permitted projections and clear partial results on any failure. write.ts
requires the versioned trusted readProtection component, validates complete exact
Field/action bindings, evaluates blind grants and original read disposition for
each changed Field/state, and reserves one per-state budget across possible calls.
The write fixture must explicitly author/grant blind authority where existing
write-state tests intend mutation despite a withheld read; retain separate
negative tests with no blind grant. Omitted old profiles fail closed.

The actual baseline gap, failing tests and source preimages are retained in
`docs/helix/04-build/evidence/security/write-protection-20261015/`. Truss reports
no existing read/write profile consumer; its query originalAction designation
remains separate. Full0.2 catalog-aware disposition, owner-purpose compatibility
and vault-write admission are still required. No S24/S25 promotion follows from
this legacy correction alone.


## Actual legacy write guard correction — 2026-10-15

The admitted0.1 evaluateSecurityWrite now requires a trusted versioned
readProtection component. It checks exact Field-bound blind grants or composed
original read disposition in every selected state, preserves original null and
canonical absence, and refuses omitted legacy bindings. Mutation grants remain
independent. Capture reuses the original scoped resolver and discards partial
results atomically. Original state budgets are strictly checked before a single
operation allowance is partitioned across all possible calls in both update
states; the comparison ledger remains separately bounded.

Actual baseline counterexamples and ten failing-before regression tests were
retained before implementation. All210 related tests (2983 assertions), strict
types and browser build pass. Independent Python fixtures specify42 exact
decisions, replayed identically in Bun1.4.2 and Chromium153.0.8010.12 through the
public API; a fresh root replay retains92 matching observations. Thirteen actual
source controls reproduce exact named assertion failures. Conditional formal
analysis retains19 queries (11UNSAT/8SAT), including a weak per-state-budget
countermodel; this is not implementation/native refinement. Astra independently
reviews source, old-HEAD reproduction, exact expectations and budget algebra.

The fresh original158-case gate still accepts all37 bound cases, with121
required bindings missing. Assertions, criteria, layers, deadlines and command
bindings are unchanged; only relevant source fingerprints were added. S24/S25
remain required and unbound: this necessary admitted-legacy correction does not
substitute for full catalog-aware disposition and exact vault-write admission.
Full0.2 interpretation, actual owner-purpose compatibility, current authority and
all native/backend/lifecycle work remain required; the goal stays active.
See `evidence/security/write-protection-20261015/` from the HELIX build root.


## Full0.2 logical-program integration path — design2026-10-15

The existing candidate policy checker still consumes the historical policy
prototype and assumes every transformed directive is an inline constant. A schema
import swap cannot interpret catalog references: use one actual source/type-closed
program with exact policy/catalog/ontology/core pins, scoped typed conditions and
true-permit disposition composition. Reuse original resolvers; never silently
rewrite0.2 source into0.1 or manufacture endpoint Fields.

Prerequisite corrections now allow nullable scalar terms and closure-only
constant/output/context domains while retaining live membership and non-null
Keys. The compact condition emitter shares the original scoped encoder, retains
exact association-handle indices and avoids repeating full source archives in
each condition. General program issuance and runtime evaluation remain unfinished.

The shared program must preflight resource costs before calling helpers that copy
source closures: current whole-ontology checks copy per entity/association, and
legacy condition transport repeats the full closure per rule/target. Prefer one
issued source snapshot with shared Field/Key/association tables and compact
indices; if a phase still expands, charge every source/target/node incidence
before allocation. A source-node cap alone does not bound target expansion.
No aggregate CPU/heap theorem follows from post-copy text limits.

The runtime needs separate typed Record rows and directed Relationship incidence
rows, retaining record-key versus opaque-existential witnesses and original
lexical occurrence correlation. Complete endpoint Records do not prove complete
relationship inventory. Preflight relation/role/witness-attribute coverage even
on empty resources and constant-false branches. Unknown facts use the original
strong-Kleene and permit/require/forbid rules; known null and absence remain
distinct. Logical nonoriginal catalog directives do not execute crypto.

Full write admission additionally needs discriminated ownership association
selectors and old/proposed graph-incidence comparison. Storage classification
must cover every target Field and refuse omitted/canonical downgrade of stored
outputs. The owner selects one exact storage transform when outputs are shared;
presentation transforms do not select storage identity. Check its exact vault
write action in every selected state. For0.2 owner profiles, read requires read
purpose, normal Field actions field, blind actions field-only plus separate exact
per-Field mapping/ID and actual grant, vault writes vault-write-only. Ordinary
read+field purpose combinations remain permitted outside the blind slot. Existing
CRUD/ownership/policy owner checks remain; purpose metadata never supplies a
grant, authenticated route inventory or competing Weft originalAction mapping.

Astra's full design/dependency packet is retained with this stage's evidence.
All of these remaining program/runtime/write/native obligations remain required;
no S24/S25 case is promoted by source typing or compact IR alone.

The implemented prerequisite uses private WeakMap-issued core-source handles,
issued immutable ontology roots and cached source indexes. Association checks
share the root's exact frozen core source; target scopes share the same documents
and ontology. A normalization fast path requires the exact root-owned association
handles; independently checked sources retain the existing source-equality path.
Detached public transport is unchanged. Compact conditions remain bound to their
exact ordered table and original scope. These are source custody/type checks, not
a full catalog program, runtime authority, authentication or an aggregate memory
proof. The general0.2 interpreter gate remains closed.

### Canonical source program implementation — 2026-10-15

`catalog-program-candidate.ts` is the distinct canonical0.2 compiler. It inspects
original source, precharges source and rule-target expansion, checks exact closure
pins, and builds one issued ontology root. Target scopes are cached per exact
entity; each rule-target condition uses the existing scoped normalizer and compact
encoder with no residuals. The private program owns immutable source and tables;
it is not exported from the public root or interpreted as a native permit.

`checkProtectionFunctionDefinitions` shares the existing recipe checker through
a module-private context created from actual parameter validation. A single budget
and recipe Field index cover all pure definitions, including unused entries. It
uses actual transform indices; no source rule/disclosure is synthesized. Public
selected inspection/evaluation still requires an actual selected disclosure and
its exact input/output domains. Unsupported recipes refuse. Actual output checks
remain input-dependent. Non-pure source obligations are separately checked and
retained as unverified. Genuine no-protection policies take a real null-catalog
branch and retain inline constants, without calling a fake catalog.

Normalization caches source Field indexes/canonical model strings by original
immutable source identity and classification strings by issued check identity.
It retains mixed-source/classification conflict checks and source-equality fallback;
cache entries never replace issuance or source correspondence. Expansion and text
limits are explicit component limits, not a total execution resource theorem.
The next required stage is a Record/graph fact-cut reference runtime with separate
complete incidence coverage, followed by graph-aware write comparison and actual
owner/read/blind/vault action evaluation. NoS24/S25 promotion follows compilation.

The compiler also precharges condition-source text times target count and a
conservative maximum source Field/Key descriptor cost times actual equality
operands. A private64000000-unit limit refuses before normalizing conditions.
The scope-set factory privately creates one ProtectionLiteralBudget shared across
all target scopes; original condition and inline constant checks use it. Callers
cannot supply an alternate checker/context. This addresses an independently
reproduced short-exponent normalization gap without changing core value semantics.
Source validation and all aggregate runtime heap/CPU behavior remain outside that
component bound. Explicit bindings are retained alongside their typed effects.


### Canonical fact/action kernel increment

The private runtime now executes the actual compact catalog program over typed
Record facts and independent graph incidences. Owner/fact-cut/request packets use
`umf.security.logical-owner/0.1` and `umf.security.logical-facts/0.1`; exact wire
examples are in `tests/security/catalog-runtime-fixture.ts`. Fact generations,
policy/catalog/ontology/core revisions and owner revisions must match. These are
host attestations and do not authenticate a native session.

One original core Key encoder indexes inventory and all endpoint selectors.
Coverage distinguishes complete type inventories, Field projections, graph
incidences, roles and witness attributes. Source preflight precedes evaluation
even on empty requests. The implementation returns effective source dispositions,
not rendered Cells. Future rendering must use one fresh operation ledger and
compiler-issued transform context, and withhold publication of incomplete batches.
Calling a public per-cell evaluator that resets budgets is insufficient.

Opaque non-record reference metadata is accepted consistently in flat endpoint
domain correspondence and graph scalar/Key paths, without inferring foreign-key
or inherited-domain semantics. The retained before/after regression demonstrates
the prior flat-only refusal. Astra's disposition multiplication witness motivates
explicit accounting before each repeated traversal. See execution evidence under
`docs/helix/04-build/evidence/security/catalog-runtime-20261015/`.

Logical decisions, pure rendering, read/blind-write/vault permissions and native
installation remain separate obligations. This increment does not qualify full
S24/S25 or any backend security profile.


### Atomic pure collection execution

The canonical action runtime now has a collection entry point that reuses its
snapshot and ledgers. It filters deny rows and publishes Cells only after all
selected rows pass action composition, output dependency preflight and recipe
evaluation. Late unknown/conflict/output failure or exhaustion discards the whole
result. Original/null/absent, withheld, and transformed Cells retain their existing
meanings. Source-independent inline constants and present-input catalog recipes
remain distinct.

The compiler retains its original private issued definition result; a WeakMap
holds only immutable parameters/Field lookup, not the compile ledger. Collection
execution supplies one new budget that also covers the action stage. Recipe
selection follows the effective source disposition. Cached operation-local recipe
lookups are metered; no whole policy/catalog/core validation occurs per Cell.
The owner supplies an exact read action with source purpose compatibility and
still needs an actual policy grant. Gregorian results carry exact output-profile
metadata. Output capacity and retained framing/reference/value text are charged.

Empty targets use conservative source-scoped output preflight with guaranteed
withheld/transform priority and inline independence. Actual nonempty targets use
effective row dispositions so withholding does not invent plaintext dependence.
See `tests/security/catalog-collection.test.ts` and the independently reviewed
packet under `docs/helix/04-build/evidence/security/catalog-collection-20261015/`.
No public vocabulary interpretation, native query admission, source authentication,
write permission or full S24/S25 qualification follows from rendered status.


### Catalog-aware multi-target transaction guard

The private write guard composes the issued action kernel with complete original
and proposed fact cuts. Its fixed owner profile covers every live Field and every
original association. It first validates both cuts, compares original typed Keys
and normalized projections, enforces complete mutation listing, then derives
ordinary, policy, ownership, original-or-explicit-blind and exact vault actions.
The same operation budget is passed through every action call; fresh per-call
limits cannot multiply the transaction allowance. Subject/context/profile changes
and incomplete inventories refuse before permission composition.

Raw association Records and graph Record witnesses receive their own CRUD/Field
guards in addition to ownership anchors. Opaque graph incidences use role-labelled
endpoint multisets, preserving parallel counts while excluding cross-cut opaque
IDs from identity. This deliberately leaves physical replacement/trigger intent
to native effect closure. Empty declared owned inventories retain conservative
create/delete ownership checks. Unchanged normalized Fields do not gain fictional
Field deltas, but listed no-op updates retain mandatory object permission.

The exact wire requirements and limits are governed by CONTRACT-062. Independent
Python-authored expected outcomes execute the actual guard in Bun and Chromium
for S24/S25. Conditional quantified laws model complete mutation listing, required
states, original-or-blind admission, declared/granted vault actions, retargeted
anchors, null/absence, multiset counts and monotone budgets. These assume faithful
executable comparison and delayed effects; they do not establish TS/SQL refinement,
crypto execution, authenticated source ownership or native current authority.


### Durable native preparation D claim — 2026-10-15

The private native lifecycle bridge in
`tests/security/native/pg18-preparation-data-claim.sql` binds an immutable,
independently committed E claim to exact original Truss anchor/program/store
bytes and physical D fullxid/incarnation, plus the original C transaction. E is
the excluded control issuer; C is the ordinary fresh RC coordinator; D retains
its original RR snapshot. Only C reads the later committed row. Unique anchor,
NOWAIT issuer serialization and immutable storage prohibit successor reassignment.
E-to-C commit uncertainty refuses; D ending before E commit burns that claim.
Same-D retry is identity idempotence, not one execution or permission.

Actual original Weft/Truss products enrollment and PG18.6 fixture evidence passes
32 observations, including the old RR visibility boundary, rollback/successor
and concurrent issuer controls. The original identity-only program resolver
still accepts a same-PID successor D, while claim reuse refuses. Conditional
transition analysis retains7 UNSAT/2 SAT, not SQL refinement. Exact private ABI,
selected source/runtime pins, scope and initial failed concurrency oracle are
retained under `evidence/security/preparation-data-claim-20261015/`.

This is a native guarded-issuance prerequisite only. No public/core admission,
current Subject/action/owner authority, source/DDL closure, permit, selector,
finalizer, seal or required backend case is qualified. Production guard-home
inventory and lifecycle stages remain separate obligations; the full security
goal stays active and the gate remains40 accepted/118 unbound.


### Disclosed query observations and existing compiler ownership — 2026-10-15

The observation-only PostgreSQL 18.6 component under
`tests/security/native/pg18-query-observations.py` executes predicate, order,
group, join and Field-dependent aggregate probes on unchanged P02 generalize/hash
carriers and the original P08 stored-token carrier. Its independent oracle covers
per-actor duplicate equality classes, nulls, an empty actor and stable ordering.
The 305 native observations are not an acceptance receipt; P03 stays unbound.

The query admission implementation belongs to the existing Weft profile-bound
lineage producer. The probe's authored equality/order dependencies are test
assumptions, not compiler credentials. Actual selected predicates and aggregates
must supply their dependencies through that owner; UMF must not add a competing
query compiler or designation interface. Deterministic output equality is not
injectivity, canonical equality reflection or permission to rewrite a disclosed
join against raw inputs. P03 additionally requires authored equality acknowledgment
for deterministic hash/token joins; implied leakage alone cannot satisfy it.

Two interface gaps remain unresolved. The existing query helper selects transformed
read dispositions, whereas P08's token is an ORIGINAL canonical Field selected by
owner.storage and its exact storageTransform. The owner must resolve that real
Field and token output domain without synthesizing a plaintext read transform.
Also, P02 projection profile0.1 requires every queryUse mode explicitly disclosed.
Mixed-mode integration needs an explicitly governed source-preserving owner/profile
change; stripping modes or compiling an all-disclosed replacement is invalid.
Neither interface change is implemented or approved by this observation component.

See `../../04-build/evidence/security/pg18-query-observations-20261015/` for
source-pinned design review, native evidence and qualification limits.


### Exact stored-Field source selection — 2026-10-15

The private `inspectCandidateStoredQueryProperties` resolves an actual issued
catalog program plus a detached complete logical-owner map and exact live
(type, Field) selection. It invokes the existing property-comparison kernel on
the selected storage transform directly. It does not construct a read transform
or replace the policy/catalog. The stored output Field is the canonical query
domain; the pre-storage input domain is separately retained for diagnosis.

The action kernel and this inspector now share one owner storage validator,
including complete unrelated members, duplicates, exact output transforms and
canonical downgrade refusals. The existing public transformed-disposition helper
retains its API and behavior. Source resolution may succeed when an actual read
would withhold or transform the Field: no action, facts or current read permission
are supplied to this source-only operation. All reports remain conditional and
non-authoritative, including authored/implied property distinctions and default
prohibition. The exact private contract is in CONTRACT-062.

This closes the pure stored-source resolution gap identified above. Existing
Weft-owned query lineage must still consume the result under actual ORIGINAL-read
permission, source/key/domain correspondence, mixed-mode physical integration,
current authority and dispatch refusal before the P03/B08 boundary can qualify.
No new compiler/profile owner or public root API is introduced.


### Current source profile for query-lineage integration — 2026-10-15

The new `tests/security/protection/current-query-source.json` is an explicitly
authored source profile, not a migration of historical unnamed fixtures. It
retains current core0.8, policy0.2, ontology0.2, protection0.1 and logical-owner0.1
semantics while declaring queryable element names and int64 facets under new
revision pins. Existing current UMF owners validate the complete source packet;
no legacy policy or synthetic plaintext transform is substituted.

Five queries exercise stored-token equality, self-join/group occurrences, an
unselected token ordering dependency, numeric SUM and field-free COUNT. The
fixture's expected uses are authored test expectations. Weft's actual Application
parser/resolver must independently derive occurrence-sensitive source lineage,
without interpreting the opaque current policy/catalog or inventing mode/action
claims. UMF then matches the original revisions and exact live (type,Field) to
the complete storage owner. Numeric SUM remains unsupported; COUNT supplies no
invented Field dependency but retains its scan.

The portable source-owner corpus rejects stale core/document/ontology/catalog
pins, legacy policy substitution, missing live members, storage-transform drift,
missing unrelated storage and canonical downgrade. Random-token join refuses;
original-authorized mode still requires action. Nineteen Bun/Chromium observations
pass at the retained selected source pins. These are correspondence controls,
not a new solver/refinement proof, query attestation, current ORIGINAL-read permit,
mixed-mode physical integration or native qualification. P03/B08 and the original
158-case requirements stay unchanged.


#### Actual compiler correspondence and separate logical read controls

The host-only `tools/security/current-query-lineage.ts` invokes the frozen actual
Weft Application parser/resolver on independently encoded exact current sources.
Seventy-five checks match original request/SQL/model/plan hashes, uninterpreted
opaque source custody, full scan/use populations and distinct occurrence paths
to the existing current storage owner. Self-join/group, unselected token ordering,
unsupported numeric SUM and field-free COUNT remain distinct. Caller property,
mode or authority overrides and source digest substitutions refuse without a
partial report. Selected source pins are retained, without a hermeticity claim.

The original r1 policy discloses salary but not the protected token. Its actual
logical token read is indeterminate, even when query properties are compatible.
The separately authored `current-query-read-scenarios.json` pins the r1 fixture
SHA and explicitly revises policy to named-query-token-read-r2, adding ORIGINAL
stored-token disclosure. Complete supplied logical facts permit active project
staff, deny inactive or different-project staff, and refuse missing coverage or
stale policy pins. This reads the opaque stored token, not its pre-storage input.
Five focused/current resolver tests pass107 expectations. Current native fact
custody, actual query read-mode lowering, key scope, mixed-mode physical execution
and P03/B08 acceptance remain unfinished. Existing conditional formal models are
not extended or promoted to compiler/native refinement by these tests.


### Selected availability must remain explicit in query lineage — 2026-10-15

An independent source-only probe of committed Weft main05b68633 and producer
8d2ff86173efe81aafd17cb14cad06d880c55802fc39fc361802d520307487a1
changes the actual selected token Field to absent-allowed under a new exact
core revision/digest. Projection, predicate, hidden ordering and self-join
currently succeed while the property use reports ideal nullable:false without
separate availability. Retaining original core bytes is necessary but does not
justify interpreting that ideal type as an actual required/nonnullable value.

UMF allows explicit null only for absent-allowed Fields and distinguishes null
from absence. No alternate nullable facet is invented. Until Weft explicitly
represents and qualifies both meanings, selected absent-allowed values must
refuse on this lineage subset. The required-nonnull original predicate remains
supported; field-free COUNT preserves its scan without inventing a dependency
on an unrelated optional Field. The independent six-request regression is
`tools/security/current-query-absence.py`; the original producer passes2 and
fails4 intended controls. Exact requests/results are retained under
`evidence/security/current-query-availability-20261015/`.

The Weft owner is repairing this source boundary, preserving all required-field
reports. This finding is source-reporting evidence, not native execution or a
backend leak. Existing current named required-field qualification remains scoped
to its exact domains; no P03/B08 or native acceptance follows.


#### Repaired selected availability boundary

The fixed Weft producer6069d58a2009ca2d5f5d65557e5a7d71900c1343ad3ef792f4e3f375e6a3fc65
resolves each actual selected Field through its original scan owner and catalog
member descriptor before issuing either lineage0.1 or legacy property reports.
Selected availability must be explicitly required; projected values and hidden
predicate/order/group/join/aggregate dependencies are checked. Unselected optional
fields do not force a fake dependency into field-free COUNT. This is an explicit
subset refusal until both actual null and absence semantics can be represented.

The independent regression expanded chronologically from6 to8 to12 requests,
preserving every earlier expectation and witness. The original producer passes2
and fails10 final cases; the repaired producer passes12, including right-hand
operands and later output/order positions. Refusals require the intended
WFT-APPLICATION-LINEAGE-AVAILABILITY diagnostic and zero partial stdout. All75
current required-field correspondence controls still pass, and all five original
reports are byte-identical. Native query admission and P03/B08 remain unqualified.

The existing abstract fact-consistency proof replays2UNSAT/2SAT and keeps absence
and null distinct. Its premise of exact source-kind classification is precisely
what the observed old source-report boundary failed to establish; that proof is
not promoted to Rust/compiler or native refinement by these regression results.


### Complete typed scan reference for query read admission — 2026-10-15

CONTRACT-062's private complete logical scan operation closes the gap between
caller-selected collection resources and a full typed scan. Implement it inside
the existing current collection runtime, deriving selectors only after the
complete supplied fact inventory has validated. Reuse exactly the issued program,
owner read action, coverage/action/disposition preflight and output ledger; charge
the derived selector population before allocation and preserve aggregate fact
limits. Existing action/collection entry points retain their subset semantics.

Verify flat and graph-witness counterparts, active/inactive/different-project
authority, original/withheld/transformed/absent/null cells, field-free row reads,
source-scoped empty-population checks, caller selection/action substitution,
malformed unselected facts, late unknown/conflict atomic refusal and operation
limits. Compare the explicit new scan against independently authored expected
rows; a legal old subset collection is not a full-scan credential. Browser parity
and all affected current kernel/native acceptance source closures must replay.

Source-only compiler readsets and native permission/dispatch remain separate
requirements; no SQL/query compiler or backend authority is introduced in UMF.


### Atomic scan composition and native issuer boundary — 2026-10-15

Use the existing catalog runtime module and shared CandidateSecurityOperationBudget
for ordered multi-scan logical preparation. Snapshot owner/cut/requests once at
entry, validate unique bounded compiler occurrence labels, precharge aggregate
fact visits and invoke the original complete-scan kernel with one shared ledger.
Keep all rendered scans local until every occurrence succeeds; discard the entire
result on any refusal. Do not expose a second policy parser/compiler or reset a
work/literal budget per scan. Existing single-scan APIs and semantics remain.

Truss main652a3f5e has no registered protected multi-scan read consumer. Its private
OriginalPreparationProgram/PendingPreparationProgram, retained preparation SQL
and resolve_preparation_program_binding are original mutation0.1 custody and
identity resolution only. Do not reinterpret them as read permissions.

Proposed native read-program source packet for owner review (not a frozen public
protocol): `{version,compiler,security,binding}`. Version is a separately named
read-program candidate. `compiler` retains the original exact Weft request/report
Artifacts plus selected compiler source/binary/schema pins; `security` retains
original policy/catalog-or-null/ontology/core-closure/owner/bindings Artifacts;
`binding` retains original native runtime manifest/mapping Artifacts under their
existing owners. An Artifact is original mediaType/utf8/sha256, not regenerated
JSON. Explicit source pin correspondence and immutable original bytes precede any
backend admission. Runtime facts, caller assertions and trusted:true cuts do not
belong in the stored program as authority. Truss must independently register and
authenticate the actual issuer, caller, complete fact sources/current context,
mode/property capabilities and final publication ordering. A source packet/hash
or diagnostic JSON boolean never supplies those guarantees.

Open: exact native registered issuer/consumer ABI, supported relationship
observation admission, physical capability/action binding and native lease
protocol. Review this proposed packet with Truss and Weft before implementation;
keep the pure scan-batch reference separately usable as the logical oracle.

Native-owner review of this proposal identifies existing transport-only types
`ExactArtifact(identity,bytes_base64,sha256)` and `ProfilePin(identity,version,sha256)`
in Truss contracts.py, while private preparation custody already retains original
mediaType/utf8/sha256 Artifact and outer bytes. Preserve this original Artifact
shape for the separate read cohort rather than normalizing it into another
protocol. Registration must invoke/capture the producer through owner-private
custody and retain original packet/report/source bytes, installed mapping/runtime
and authenticated control enrollment. Consumption takes a committed registration
identity and original live same-store transaction context, never claimed source
flags/actions. These are design constraints; native ABI approval and execution
evidence remain open. Exact selected Weft source/schema/fixture closure is already
retained in the prior current-logical-scan final-weft-provenance packet.


### Query value-source algebra and lowering prerequisites — 2026-10-15

Separate three coordinates: original Field/core type; selected value source and
descriptor; authorization route. Disclosed ORIGINAL selects the live Field,
disclosed TRANSFORMED selects its actual output descriptor, and disclosed
WITHHELD has no scalar value. Explicit absence is not a scalar NULL. An exact
original-authorized route can select a present live value despite presentation
withholding, but always needs its separate source-bound action. Stored originals
remain token/ciphertext Fields; storage input DTOs are not live canonical data.

Candidate initial-cohort composition: each applicable mode is a constraint on
the route. Disclosed requires the disclosed route; original-authorized requires
the original route; prohibited permits none. Their intersection must be nonempty.
Do not silently pick a source winner or infer a privilege ordering from equal
values. This conservative conjunction is a proposed Weft-cohort rule for peer
review; no existing conditional helper is reclassified as whole-query admission.
Multiple-stage function facts, current native scope and descriptor compatibility
remain explicit prerequisites, not caller boolean credentials.

Use a formal finite mode/source selection model and unbounded deterministic
function counterexamples. Prove conditional source/domain fidelity, prohibition
independent of row count, exact separate-action gating, no original-to-reverse
promotion, pair-scope requirements and full direction-vector retention. Retain
positive witnesses plus weakened-domain/action/mode/pair/direction controls.
A primitive PG18 VALUES probe observes changed DTO types/nullability, incompatible
operator refusal before LIMIT0, generalized value classes, key-scope differences,
and ASC/DESC position effects. It uses an isolated owner context and proves no
public actor, row-level policy, native registration or protected execution.

Actual Weft source reports now distinguish hidden ASC/DESC and mixed direction
positions. The older ApplicationPlan expression list omits those positions;
report.orderDirections and the new retained typed context carry them. Two mixed
direction queries can have identical whole ApplicationPlan bytes/global
capabilities but opposite direction vectors. Keep this actual witness alongside
the formal model; do not infer a producer loss, since the original report retains
the information. Weft reports there is still no committed native0.2 SQL lowerer
or canonical policy/catalog0.2 originalAction designation; those are next cohort
implementation requirements, distinct from legacy relationship profile0.2.


### Atomic mixed logical operations — 2026-10-15

The private supplied-operation boundary composes typed population read rendering and explicit canonical action checks using one detached owner/cut snapshot and one cumulative work/text/literal ledger. Charge inventory once plus every scan population visit and explicit action target across the entire bounded ordered list. A late structural/preflight/render/budget refusal releases an empty operation list. Preserve caller operation IDs and typed outcomes; do not flatten read Cells into action dispositions or infer original operator values from action success.

A completed batch means the requested diagnostic evaluations completed. Each action can still deny, be indeterminate or conflict; those decisions must remain explicit and a consumer must enforce the actual action duty. It is not whole-query admission or an original-action designation. The compiler still owns exact occurrence/role/purpose selection and the native consumer still owns authentication, registration/current-cut custody and final release. No supplied batch is a native credential. Public projection rendering remains independent of separately authorized hidden-use actions.


### Per-use source routes and guarded read alternatives — 2026-10-15

The private source inspector takes the original compiled catalog program, exhaustive owner storage map, and a supplied scan/path/Record/Field/operator/operation/property requirement. It does not accept a mode, original action, branch truth or permission override. Occurrence labels/properties must still be joined to Weft’s original preparation; inspection itself does not authenticate them. Original Field descriptors/full identities and exact selected catalog declarations are retained, including storage input/output and declared transform/key metadata. Actual paired runtime/key compatibility is unresolved and cannot be inferred from retained equality or determinism.

Always retain ontology and applicable storage mode constraints, even without a read-disclosure branch. Group potential read directives by the original runtime’s recipe identity; legacy constants use original checked typed literal identity, including checked null. Preserve every original directive/token spelling. The representative directive is not the chosen runtime value. Retain all scoped read-rule conditions and explicit context bindings.

A candidate branch requires actual read eligibility, an active contributor group, and no active excluded groups. Withholding excludes no groups; transforms exclude withholding and other distinct transform groups; original fallback excludes withholding/transforms. A protected missing-disclosure alternative excludes every actual directive. It leaves public projection unresolved but can retain a separately designated original-use route over the live Field. It must never force a hidden original operand through the public renderer or unmask a projected Field.

For this conditional plan, a read-catalog mode constraint belongs to the effective selected recipe branch. Suppressed/unselected recipes remain guarded alternatives, not globally asserted current constraints. A native profile must qualify actual policy/disclosure fold and this applicability before use; the diagnostic plan selects nothing. Ontology/storage/effective-recipe constraints conjunct; prohibition/conflicting modes cannot be overridden. Original mode requires the exact Weft-issued designation, present live Field and separate current permission. Disclosed output properties remain conditional; native operand/presence/order/pair scope and guarded release remain mandatory. No public root API, source credential or native query permit is introduced.


### Actual logical read-rule evidence and route activation — 2026-10-15

Evaluate the original compiled scoped read conditions over every row of the supplied complete typed population. Retain original rule indices and three-valued truth, canonical resource selectors and the actual field-free read decision. Validate dependencies and coverage even on empty populations; any source/cut/preflight/budget failure erases the entire result. This private evidence path does not render or require public projection and does not evaluate a separately designated original-use action. Its retention shares the original condition operation budget.

Route activation must reconstruct its plan from the original program and supplied owner, never accept caller guards, rule truth, modes or actions. Select alternatives only when actual row read decision is permit, a contributor is true and all excluded groups are inactive. Distinguish read denial/indeterminacy from effective disclosure conflict and the chosen route's unresolved/prohibited/property/original-action duties. No scalar value, branch permission, compiler occurrence credential or native authority follows from selection. Source-plan inspection and logical-cut evaluation retain their separate bounded preparation/evaluation costs; no whole-query cumulative budget or complete native refinement is claimed.
