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
