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
