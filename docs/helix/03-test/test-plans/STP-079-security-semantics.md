---
ddx:
  id: STP-079
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-079
      kind: informed_by
    - id: TD-079
      kind: informed_by
    - id: SD-008
      kind: informed_by
---

# STP-079: security-semantics

## Story Reference

**User Story:** [[US-079-security-semantics]] **Technical Design:** [[TD-079-security-semantics]]
**Solution Design:** [[SD-008]] **Project Test Plan:** TP-001.

## Scope and Objective

All P0 criteria in this story must have exercising evidence. The machine-readable
case inventory is `../security/cases.json`; plans are not passing executions.
Spikes supply qualified feasibility evidence only. No deferred or missing native
case can be represented as a pass.

## Acceptance Criteria Test Mapping

| AC ID | Named tests | Asserted behavior | Citation | Primary layer |
| --- | --- | --- | --- | --- |
| US-079-AC1 | S01 | Resolve Staff/Project/Ownership/Assignment and require active Assignment to same owning Project. | `@covers US-079-AC1` required in exercising test | contract/browser |
| US-079-AC2 | S02 | Same labels in different documents never join; exact typed keys and Unicode remain distinct. | `@covers US-079-AC2` required in exercising test | contract/browser |
| US-079-AC3 | S03, S11 | Reject wrong endpoint role, undeclared action, boolean/string comparison, unknown operator and depth/node excess. | `@covers US-079-AC3` required in exercising test | contract/browser |
| US-079-AC4 | S04, S12 | Broad read permit plus false mandatory membership denies; forbid dominates all permits; rule permutation agrees. | `@covers US-079-AC4` required in exercising test | contract/browser |
| US-079-AC5 | S05 | Active same-Project allows; inactive, missing, sibling Client/Project denies; any/all and ownerless behavior explicit. | `@covers US-079-AC5` required in exercising test | contract/browser |
| US-079-AC6 | S06 | Missing/ambiguous subject, incomplete assignment inventory, stale cut or untrusted attribute refuses entire collection. | `@covers US-079-AC6` required in exercising test | contract/browser |
| US-079-AC7 | S07 | Null, absence, withheld, constant transform and output type survive encoding; false permits add no obligations; absent protected disposition refuses. | `@covers US-079-AC7` required in exercising test | contract/browser |
| US-079-AC8 | S08 | Predicate/order/group/join/aggregate uses disclosed representation or explicit original-use action; withheld use refuses. | `@covers US-079-AC8` required in exercising test | contract/browser |
| US-079-AC9 | S09 | Preserve unknown rules and native source byte content where promised; unknown security meaning blocks interpretation. | `@covers US-079-AC9` required in exercising test | contract/browser |
| US-079-AC10 | S10 | Same policy/facts/diagnostics and refusal outcomes in Bun and Chromium, no host globals or external requests. | `@covers US-079-AC10` required in exercising test | contract/browser |

### Field-protection allocation — 2026-10-15 UTC

These are required semantic cases under accepted FEAT-008 SEC-13..15 and
CONTRACT-062/063. Every case also exercises US-079-AC10 in real Chromium.
All 13 are `not-run`, without runner bindings; this allocation supplies no pass.

| Case | Criteria | Required independent assertion |
| --- | --- | --- |
| S13 | US-079-AC11, US-079-AC12 | Resolve exact pinned catalog/transform/version and qualified input/output Field domains; foreign or missing references refuse. |
| S14 | US-079-AC11, US-079-AC3, US-079-AC9 | Preserve unknown catalog/version/kind/member and native source content through JSON/YAML; unknown meaning blocks interpretation. |
| S15 | US-079-AC12 | Additive security0.1-to0.2 migration preserves legacy constant meaning; rollback refuses any non-constant reference without changing the source. |
| S16 | US-079-AC13, US-079-AC8 | Positive and missing-property refusal controls cover predicate, join, group, order and aggregate dependencies: equality predicates/join/group require retained equality, order requires retained order, and each selected aggregate requires its declared input properties. Omitted queryUse defaults to prohibited. Deterministic transforms report implied equality even if omitted from authored properties. |
| S17 | US-079-AC13 | Random tokenization cannot admit disclosed equality join/group; a weakened validator ignoring that dependency must be distinguished. |
| S18 | US-079-AC11, US-079-AC3 | Catalogs over256 transforms, more than32 typed parameters or canonical JSON literal encodings exceeding4096 UTF-16 units refuse bounded interpretation rather than trimming. |
| S19 | US-079-AC14 | Constant, partial, fixed-length-redact, range-bucket, truncate-date and prefix-only exact outputs match independently authored Python expectations; keyed/vault operations are not executed by UMF. |
| S20 | US-079-AC14, US-079-AC7 | Canonical null, absence, withheld, transformed null, changed output domain and stored token survive disposition transport distinctly. |
| S21 | US-079-AC15, US-079-AC3 | Hash declarations require an algorithm and declared salt custody (none or keyed); unsalted hash requires retained equality and a mandatory dictionary-attack warning obligation. Tokenize/encrypt declarations require complete stored custody and propagation metadata; keyed/vault reversibility requires a distinct reverse action. Declarations remain unverified native obligations. |
| S22 | US-079-AC15 | Reverse action is distinct from read/field/original-authorized actions; ordinary/original disposition exposes stored token and never implies plaintext recovery. |
| S23 | US-079-AC15 | History, snapshots, exports, feeds and caches each have explicit propagation declarations; missing or unknown required meaning refuses and source is preserved. |
| S24 | US-079-AC16 | Field mutation without original disposition or explicit field-bound blind-write permission refuses, including a proposed value equal to the mask output. |
| S25 | US-079-AC16, US-079-AC15 | Stored-transformed field mutation additionally requires the exact declared vault-write action; unrelated read/original/reverse permissions cannot substitute. |

Implement real failing assertions and independent oracle expectations before
implementing each slice. Register exact commands, sources and assertion IDs in
`cases.json` only when those exercising runners exist. Missing APIs, partial
closure or unavailable native custody cannot be replaced by a passing placeholder.
No native US-056/057 obligation is discharged by a semantic case.

## Executable Proof

Run `bun docs/helix/02-design/spikes/security/acceptance.ts` for the release gate.
It must reject missing commands, nonpassing evidence and incomplete coverage.
Per-backend procedures in `../security/` specify original-role execution and
scenario expansions. Named cases currently without commands are implementation
obligations, explicitly not executable proof. Formal and native spike receipts
are under `../../04-build/evidence/security/` with scope limits.

## Data and Setup

Use Clients/Projects/Staff ownership/assignment fixtures; duplicate labels,
reversed endpoints, null/absence, multiple owners, private bags, historical owner
changes and complete/incomplete fact cuts. Disposable native installations and
independent expected outcomes are mandatory. Do not reuse compiler predicates
as the expected-result oracle.

## Edge Cases and Failure Modes

Unknown security meaning refuses interpretation while preserving source.
Collection uncertainty refuses before output. False permits add no masks;
protected output without disposition refuses. Native inventory/authority drift
invalidates prior evidence. Old snapshots cannot adopt new authority generations.

## Build Handoff

1. Implement declared typed contract and independent oracle tests.
2. Bind exact native profiles and execute positive/bypass controls.
3. Exercise lifecycle barriers and publish source-qualified evidence.
4. Require 100% P0 cases and stable AC citations before story acceptance.

Done requires actual assertions, matching command/source receipts and no skipped
required cases. Compiler/native profile gaps remain open rather than assumed.


### Identity transport closure controls — 2026-10-11

For US-079 AC3/AC10 prerequisites, preserve separate policy reads versus extra
instance keys; preserve original compound-key and endpoint role/component order;
exclude unused ontology records; include identity/endpoints even for literal
association conditions; refuse unknown meaning without source mutation; reach
endpoint identities for association resource targets and nested association targets.
Eight new unit controls plus three dependency/write regressions pass in the final
owner packet, with six checks replayed through the exported browser bundle. This
qualifies metadata derivation only. Native mapping/decoding, trusted completeness,
authenticated subject/current authority and final disclosure still need evidence.


## Wire component evidence (2026-10-15)

`bun test tests/security/protection/` exercises AC11 wire/local-bound subsets and
AC15 custody/reversal shape only. `bun tools/security/protection-catalog-browser.ts`
replays the public source/inspection/refusal API from the actual root browser
bundle. `python3 tools/security/protection-wire-controls.py` and
`python3 tools/security/protection-catalog-controls.py` distinguish weakened
validators by exact intended test failures, not generic import/runtime errors.
These component checks do not bind or pass S13–S25. Core domains, function
behavior, query dependencies, reverse/write permission binding and physical
obligations remain required. Receipts and independent review are retained under
`../../04-build/evidence/security/protection-wire-20261015/`.


## Policy0.2 migration and legacy embedding component plan — 2026-10-15

`tests/security/protection/policy-v2.test.ts` exercises representation frames,
new revisions, bounded sources/targets, exact catalog pins/version lookup,
unknown promotion refusals and forward legacy constant semantics. Original
attestations must refuse after migration; separately authored fixture cuts name
the new revision. Missing project assignment denies and incomplete coverage
refuses. A catalog transform named `constant` never becomes an inline constant.

`tools/security/policy-v2-browser.ts` replays the same public-root observations in
Bun and real Chromium; `policy-v2-mutations.py` requires exact named failures
under weakened classification, text bounds and omission of semantic embedding.
`policy-v2-package-smoke.ts` exercises the standard built package exports.
`prove-policy-source-migration.py` records conditional frame/guard checks and
weakened SAT controls, not executable or native refinement.

These component receipts alone do not bind S15. Its unchanged full assertion
requires a reviewed independent oracle for forward constant meaning and all
nonconstant rollback refusals, identical Bun/Chromium expectations, original
source retention and fresh governed runner evidence. S13 additionally requires
qualified immutable core Field domains; source-address lookup is insufficient.
General protection semantics, backend acceptance and the full158-case gate
remain required.


### S15 governed execution checkpoint

`protection/migration-oracle.ts` is the independently authored finite oracle;
`protection/migration-acceptance.ts S15` binds fresh case/run identity and executes
it in Bun and real Chromium through the root API. The original S15 assertion is
unchanged. All149 controls per runtime, parity, source custody and browser
boundary checks produce304 matching observations. The full158-case gate accepts
S15 and the earlier26 cases;131 bindings remain missing. Evidence:
`../../04-build/evidence/security/policy-v2-20261015/acceptance.json`.
S13/core-domain closure, S14 and all later protection/native cases remain open.


## Qualified domain and preservation runners — 2026-10-15

`tests/security/protection/domains.test.ts` covers exact pins, every declared
Field occurrence (including unused transforms/parameters/buckets), all-or-nothing
refusal, source immutability, all known core families/containers and the256-entry
positive/overflow bounds. Unknown core/source meaning, stale revisions, ambiguous
closures and foreign or non-Field references must refuse without coordinates.
These assertions do not establish literal/function applicability.

`tests/security/protection/domains-oracle.ts` is independently authored.
`bun tests/security/protection/domains-acceptance.ts S13` and the corresponding
`S14` command require fresh gate-provided case/run identity; they execute the
actual public root API in Bun and real Chromium, compare complete observations,
check selected source endpoints and browser boundaries, and emit structured
receipts. S13 has111 independent controls; S14 has54, including known-domain
success to avoid a vacuous unknown-only refusal test. The original assertions,
coverage and all other156 cases remain unchanged.

S14 preserves the JSON-compatible unknown tree and opaque native source text,
including exact literal carriers and CRLF/Unicode, through both JSON and YAML.
It does not claim unchanged YAML comment/layout text or authenticate archives.
`tools/security/protection-domain-mutations.py` requires exact intended failures
under weakened revision, Field-kind, unknown-source, partial-result and text-bound
checks. The conditional domain formal script and actual built package smoke are
separate supporting evidence; the whole158-case gate remains required.


### S13/S14 governed acceptance checkpoint

The final whole158-case gate accepts both new bindings: S13 has228 matching
observations and S14 has114. All prior27 bound cases pass;129 bindings remain
missing. This closes the B-SFP-002 slice exit only. Full protection applicability,
parameter values, query-use and backend qualification remain open. Retained
fresh receipt: `../../04-build/evidence/security/protection-domains-20261015/acceptance.json`.


## Conditional protection property runners — 2026-10-15

The independent `query-oracle.ts` has272 expected observations per runtime:
S16=135, S17=33, S18=104. The fresh `query-acceptance.ts` wrapper executes the
actual public API in Bun and real Chromium, compares all original rows, checks
source endpoints/browser boundaries and emits the original case/run binding.
S16 exercises positive and missing properties for all five operators, mandatory
join/group/order dependencies, implied equality, default prohibition and distinct
original-action requirements. Dependencies are supplied assumptions; actual
compiler provenance remains B08 work. S17 exercises the random-token hard rule
even with authored equality. S18 includes exact256/32/4096 positive/overflow
bounds, original typed refinements and exact shared-ledger100000/100001 controls.

The original158 required assertions/coverage/layers/timeouts remain unchanged.
Only S16-S18 runner bindings and S13/S14's new private Field-index source
dependency change. Source mutation controls require the precise named failures;
conditional Z3 queries retain both UNSAT laws and SAT countermodels. Neither
supports a general interpreter, function-applicability or native-authority claim.
The full gate must execute all earlier bound cases again; a standalone oracle
receipt cannot promote a case. Evidence:
`../../04-build/evidence/security/protection-query-20261015/`.


### S16-S18 whole-gate result

The fresh whole158-case run accepts32 bound cases; all earlier29 remain passing.
S16 has276 observations, S17 has76 (including both-runtime actual mutant
discrimination and original-source correspondence), and S18 has214. Required
unbound cases remain126. The overall gate is failed/open, and B-SFP-003 remains
in progress for function applicability and actual compiler-derived dependencies.
See the retained `protection-query-20261015/acceptance.json`; the previous29/129
tally describes the preceding checkpoint.


## Pure reference function verification — design2026-10-15

S19 retains all six original named function classes; supplemental null-out and
non-pure refusal tests cannot replace any of them. Independently authored Python
fixtures must supply original Field definitions, literal inputs/parameters and
exact outputs/refusals. A mechanical adapter constructs real pinned source and
replays those expectations against the public API in Bun and Chromium. Positive
wire-valid keyed/vault/hash declarations must still refuse execution.

The Gregorian dependency must also agree with an independent Python datetime
400-year cycle digest, plus malformed, century-boundary and foreign-temporal
refusals. The cycle is finite evidence, not automatic core/native date admission.
Mutation controls must distinguish omitted original-input/output checks, closed
signatures, negative-floor correction, overlapping suffix, selected domain
binding and explicit calendar selection. Symbolic proofs retain SAT weakened
controls and qualify their parser/domain/executable-refinement premises. Source
metadata, guards and request shape remain frozen throughout a whole-gate replay.
S19 is not promoted by unit/standalone proof success; S20 disposition transport
and every other remaining backend/function criterion stay required.


### S19 whole-gate result — 2026-10-15

S19 is accepted by the fresh whole158-case run with928 matching observations.
The source-pinned runner regenerated the459 independent Python fixtures exactly
before replaying them and the146097-date digest in Bun1.4.2 and
Chromium153.0.8010.12; Python3.9.6 was observed. All32 earlier bound cases pass.
Total accepted cases are33, with125 bindings missing; no required assertion,
coverage, layer or timeout changed. Source custody and final Astra review are
retained under `../../04-build/evidence/security/protection-functions-20261015/`.
S20 and full function-property/compiler/native obligations remain open.


## S20 transport verification — design2026-10-15

S20 retains US-079-AC14/7/10 and its original assertion/layer/timeout. Independent
Python fixtures MUST distinguish original null, absent, withheld, transformed
null, changed output Field and positive original stored token/ciphertext. Replay
identical expected source trees and refusals in Bun and real Chromium through
the root codec APIs with JSON/YAML round trips. Tests cite all three AC IDs.

Adversarial controls include stale policy/catalog/core pins, duplicate/reordered
qualified identities, rectangular arity, missing values vs explicit null,
wrong original/output domains, hidden values on absent/withheld, unsupported
reverse, unknown members/tags/profiles, unknown empty-column metadata, invalid
Gregorian dates, original stored-token type checks, storage-tag downgrade and
read-time transformation over a stored canonical Field. Include accepted exact
bounds and exceeding bounds, and shared multi-cell ledger exhaustion. Refusal
MUST retain source where copy succeeds and expose no partial validated batch.

Mutation controls must remove exact selected-field checks, storage binding,
null/absent/withheld shape constraints, pins, unknown rejection and atomicity;
the exercising tests must fail for the intended cause. Conditional symbolic
UNSAT laws retain SAT countermodels for weakened guards. The independent fixture
source, fresh generation receipt, both-runtime observations, source fingerprints
and final review are retained together. A standalone test/proof is not whole-gate
admission. Native row authorization and custody remain independently unverified.


### S20 whole-gate result — 2026-10-15

The fresh whole158-case gate accepts S20 with358 matching observations and all33
previously bound cases. There are34 accepted/124 required unbound cases; the
release gate remains failed/open. Independent160-fixture Python expectations
(38 positive/122 refusal) and175 observations per Bun/Chromium runtime retain
JSON/YAML/source/null/token/domain distinctions and explicit runtime/serialization
controls. The first gate's native B11 timeout is retained, as are its unchanged
isolated passing replay and the final full replay. No criterion or timeout changed.
Evidence: `../../04-build/evidence/security/protection-disclosure-20261015/`.
Neither finite transport acceptance nor conditional formal laws grant native,
compiler, source-authentication, storage-custody or row-policy authority.


## Action-purpose prerequisite for S21-S23 — design2026-10-15

US-079-AC3/10/15 need exhaustive ontology purpose closure and actual owner
compatibility before reversal admission. The foundation tests must exercise
all six categories, permissible ordinary combinations, singleton-exclusive
reverse/vault-write/other, duplicate/missing/foreign IDs, unknown values/members,
absent closure, empty declarations, exact ontology revision/source identity,
caller mutation, resource limits and preserved atomic refusal. Reuse both raw
member-association and graph-witness whole ontology resolution. Bun/Chromium
expectations must agree through the real public API, with no host globals or
external requests. A supplied purpose list is not a credential or an owner
mapping. Independent symbolic controls expose omitted classification, incomplete
inventories and missing actual owner compatibility. No S21/S22/S23 case is
promoted by this prerequisite alone; crypto warning/propagation obligations and
real read/query/write owner integration remain required.


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


## Legacy write guard regression plan — 2026-10-15

Before implementation, reproduce withheld, transformed and proposed==mask writes
permitted by the existing entry point. Exercise mandatory source-owned binding,
original/null/absence, exact field-bound blind permission, ordinary-action alias
refusal, original/proposed state requirements, create/delete/no-op updates, both
OR alternatives with unknown opposite branches, atomic original-Field capture,
unknown source, stale cuts and bounded work. Independently replay Bun/Chromium
expectations, remove actual source guards with named-failure controls and retain
conditional logic countermodels. Re-run every existing bound original gate case.
Full original S24/S25 remain unbound until catalog-aware disposition and exact
vault-write action admission also meet the original assertions.


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


## Candidate closure and compact-IR prerequisites — 2026-10-15

Test nullable scalar attribute/null constant agreement; reject null for required
Keys. Resolve constants, inline outputs and explicit context from closure-only
Fields while rejecting inferred live ownership, non-Fields, missing/foreign refs
and undeclared context. Preserve original source cuts and exact domains.
Compare compact IR with the original complete source transport for nested
record-member, native graph record-key and opaque witnesses; rebase only the
same issued association table, reject copies, residuals and omitted unused
declarations without invoking accessors. Add actual source mutation controls and
independent Bun/Chromium expectations. These prerequisites do not replace the
full catalog-aware action/fact/disposition/vault-write tests for original S24/S25.

Shared-source controls must check detached immutable capture, rejection of invalid
or accessor-bearing input, exact source reference sharing across associations and
scopes, copied-root/scope refusal, and detached public transport. Compact controls
must reject reordered tables at consumption and fresh source scopes even when
JSON is equal. Run strict types, browser build, security/date regression and the
original158-case gate without changing required assertions or deadlines. Boolean
judgment proofs remain conditional and do not replace implementation/native tests.

### Canonical source compiler controls — 2026-10-15

Exercise actual canonical catalog and genuine null-catalog paths. Require exact
policy/ontology/catalog/core pins; refuse missing/extra/stale sources, unknown
required members, copied handles and residual conditions. Test every actual
rule-target pair, unused invalid recipes, nullable/DTO output domains, live input
membership, non-permit disclosures, duplicate identities and binding correspondence.
Confirm original source version/bytes, lexical occurrence/ordered association
indices, shared immutable closure and atomic refusal without a partial handle.

Direct definition tests must use empty rules and actual unused transform indices,
retain an unchanged policy, and preserve public selected-disclosure refusal. Check
shared catalog work exhaustion, unsupported/date/decimal/output recipe conditions,
nonexecuting non-pure obligation declarations, and caller inability to inject a
validated context. Mutation controls must distinguish removing unused-definition
checks, exact pin/domain checks, issuance, live membership and expansion precharge.
Test repeated/mixed-source normalization to detect cache poisoning or cross-scope
reuse. Independent Bun/Chromium parity and conditional formal analysis remain
separate from native admission and fullS24/S25 qualification.


### Canonical action kernel component checks

`tests/security/catalog-runtime.test.ts` exercises US-079-AC3/4/5/6/10 at the
private logical component boundary: actual Staff/project membership in flat and
graph sources, parallel/opaque/Record witnesses, independent completeness,
false-branch and empty-request preflight, typed null/absence, duplicate normalized
Keys, explicit Gregorian profiles, exact pins and exhaustive stored-carrier
bindings, original/withheld/transform-conflict composition and atomic refusals.
Opaque reference metadata compatibility has paired flat/graph positives and
record-type/malformed negatives. Independent Astra controls must execute the real
module in Bun and Chromium, retain mutations and source hashes, and verify the
whole-operation disposition accounting witness. Finite oracle parity and
conditional formal laws do not establish executable/native refinement.

These component checks supplement the unchanged 158 required acceptance cases.
No S24/S25 assertion is retired, weakened, or promoted: full rendered Cells,
original-read/blind-write comparison, vault permission and native enforcement
still require their original case evidence.


### Atomic collection component checks

`tests/security/catalog-collection.test.ts` extends the private logical AC3/4/5/6/10
checks to actual output Cells: flat/graph original/null/absence/withheld; every
admitted pure recipe with exact numeric/Unicode/date output; source-independent
inline null/absence/unavailable compatibility; catalog present-input requirements;
exact owner read role plus real grants; denial filtering; late U/conflict/output
refinement failure and repeated-resource output budget exhaustion. Empty targets
exercise input coverage and unconditional withholding/transform suppression.

Independent Bun/Chromium controls and source weakenings must exercise actual
collection output, definition-context custody, one shared action/render ledger,
output framing/refs/profile text, typed input/output refinements and atomic
publication. Arbitrary-row conditional laws assume faithful failure accounting
and delayed publication; finite parity does not prove native or TS refinement.
The original 158 cases, assertions, timeouts and commands remain unchanged.
Component evidence cannot replace full S24/S25 or native backend evidence.


### Catalog-aware write acceptance increment

S24 and S25 retain their original assertions, criteria and timeouts. Their semantic
contract/browser implementations must exercise the actual private catalog write
guard against independently authored Python expected outcomes, regenerate fixture
bytes freshly, pin the full source closure before/after execution and replay exact
row parity in Bun and real Chromium without host globals or external requests.
S24 includes changed Field mask-equality, original/null/absence, explicit per-Field
blind bindings and actual grants, create/update/delete required states, no-op
object grants, flat association Records, graph Record/opaque incidence changes,
complete listing/coverage and fixed owner roles. S25 additionally covers missing,
unrelated and exact declared vault-write actions, grants in all required states,
and original stored carrier/output-domain semantics.

Focused actual-source weakenings must detect loss of vault declaration/grant,
original-or-bound-blind checks, state conjunction, complete mutation listing,
Subject stability, association ownership or shared operation accounting. Preserve
failed source preimages and development logs. Conditional formal proofs and finite
browser parity qualify logical admission only: native statement/effect closure,
opaque replacement intent, authentication/current authority, query/compiler lineage
and remaining physical/backend acceptance cases retain their separate obligations.
An accepted S24/S25 semantic receipt does not qualify any native backend profile.
