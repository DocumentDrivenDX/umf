# Scoped original-obligation correspondence, private revision 0.2

Draft SPIKE-010 annex governed by CONTRACT-062/063, TD-056 and Weft
CONTRACT-005. Addresses US-056-AC7/AC10 without promoting a backend case.
Astra ultra's 2026-10-10 review resolves the unscoped/selected-wide ambiguity
in the earlier assignment and source-demand annexes. This is a design contract;
a private Rust matcher now checks correspondence under an explicitly supplied
independently authored trusted requirement premise. The independent profile
issuer/authentication remains unimplemented. The bounded decoder and matcher
do not themselves establish native enforcement or required-case sufficiency.

## Version and subjects

Preserve the existing private admission-obligation/0.1 projector unchanged.
A new scoped matcher interprets only
`weft.security.admission-obligation/0.2.0`; it refuses unscoped 0.1 declarations.
No implicit migration or lossy public transport conversion is allowed.

Parameters contain exactly version, subjects, enforcementSite, prerequisites
and evidenceCaseIds. Each subject is exactly one tagged variant:

- Semantic: a canonical source ID paired with its actual scope, either
  ScanAction(scan occurrence, action) or Application.
- SelectedCapability: a profileRequirementId independently issued for that
  exact capability origin. This variant has no semantic source or scope.

The subjects list is nonempty, duplicate-free and homogeneous: multiple
subjects are allowed, but every subject in an obligation uses the same variant.
The initial profile requires one variant per original obligation. Subject/case
requirements must be rectangular: expand paired subjects × evidence cases ×
every retained original capability origin. Source and scope are never separate
cross-product lists. Nonrectangular subject/case requirements need distinct
original obligations. The concrete closed JSON subject grammar is:

```json
{"kind":"semantic","source":"canonical source ID","scope":{"kind":"scan-action","scan":"s0","action":"read"}}
{"kind":"semantic","source":"canonical source ID","scope":{"kind":"application"}}
{"kind":"selected-capability","profileRequirementId":"trusted requirement ID"}
```

These are alternative object shapes; all keys are required and extra keys refuse.
Each identity is nonempty, NUL-free and at most4096 UTF-8 bytes. Subject lists,
case lists and prerequisite lists contain at most4096 distinct entries; subjects
and cases are nonempty, prerequisites may be empty. Canonical source membership,
actual scope membership and trusted requirement meaning belong to the subsequent
matcher; syntactically valid text alone cannot establish them.

Original ID, owner and failure code come exclusively
from immutable registry custody; capability origin is implicit in each retained
occurrence, never supplied by backend parameters.

## Separate owners and exact correspondence

Inputs are actual OwnerSourceDemands (retaining coverage/context/registration),
original obligation custody from its exact complete selection, and a separately
issued versioned backend requirement profile. The profile independently specifies
required kinds, subjects, cases, sites, owner, failure behavior and prerequisites.
The independent profile must explicitly account for every selected capability,
including a nonempty selected-wide requirement set for each zero-edge capability.
Missing profile entries refuse; absence cannot imply an empty requirement set.
It cannot be derived from the declarations it is supposed to validate. Its
trusted issuer and authentication remain open implementation requirements.

Custody retains selected capabilities even when they have no obligations or
coverage edges. Equal backend/version labels or equal obligation inventories
cannot substitute for exact registration and selection correspondence.

For every semantic subject require the exact source/scope demand edge and an
eligible complete original capability in that scope. Foreign sources, swapped
scans/actions, extra claims and ineligible origins refuse the whole match.
For selected-wide subjects require the exact independent profile requirement
for each original origin, with no invented Application eligibility. Missing,
copied or foreign deployment requirements refuse, including for zero-edge
selections. Compare full original contracts and exact expanded atoms against
independently required contracts and atoms. Never intersect away surplus claims
or compare only marginal source/scope/capability/case sets.

Two conditions are mandatory:

1. Every original obligation of every selected capability corresponds exactly
   to the independently required contract and atom relation.
2. For every actual semantic scope q there exists one eligible capability c
   covering all required sources and obligations for q: ∀q ∃c ∀s.

The order ∀q ∀s ∃c would admit fragment unions. A single global capability
intersection would incorrectly reject different complete alternatives for
separate scopes. Choosing an alternative never discards obligations from other
selected capabilities. A future distinction between available alternatives and
activated selection needs an explicit governing contract.

Original prerequisite edges and full owner/failure behavior are mandatory.
The initial interpretation conservatively requires every matched instance of
an original predecessor before its dependent; no scope-specific weakening.
Validate the complete DAG, including disconnected components, before publishing
any result. Bound parsing, retained copies and expanded atoms, charging every
repeated origin. Initial ceiling: 4096 atoms, 4096 UTF-8 bytes per ID,
1,000,000 visits and 16,000,000 charged text bytes per phase. Exact costs and
allocation controls need implementation evidence; this is not an aggregate
CPU/memory bound.

## Result and acceptance tests

Return only a private correspondence object retaining original declarations
and all origins, exact contracts/atoms, complete alternatives per scope,
mandatory selected-wide requirements and pending prerequisite/evidence demands.
It cannot establish enforced/admitted status or open lowering. Current response
0.4 cannot express selected-wide subjects; preserve the private result rather
than flatten it into semanticSources. Native case sufficiency, authenticated
profiles, evidence, current authority and activation remain separate gates.

Required tests: unchanged 0.1 projection plus scoped refusal; source/scope
swaps with identical marginals; fragment-union refusal; different complete
capabilities across scopes; mandatory unchosen obligations; valid zero-edge
selected-wide correspondence and missing/copied/foreign refusals; shared IDs
with every origin; extra atoms/changed failures/removed prerequisites;
exact/minus-one expansion budgets including repeated origins; native evidence
still pending after successful correspondence; public lowering still closed.

The existing finite source-demand formulas establish only their stated Boolean
laws. They do not prove this new parser, profile issuer, correspondence matcher,
unbounded semantics or backend execution. New formal receipts must identify the
paired subject relation and explicit independent-profile premise.

## Implemented conditional matcher checkpoint

Private `security_obligation_matching.rs` retains actual OwnerSourceDemands,
original custody, the trusted required premise, borrowed original declarations
and complete qualifying alternatives. It checks exact registry bytes/target and
complete selection; the private immutable registry-reference handle is now
Copy/Clone without exposing a constructor. This conveys custody, not authority.

The experimental RequiredPremise0.1 contains version/profile identity, exact
registration/target/selection, an explicit selected-wide requirement set for
every selected capability, full original-ID contracts and expanded typed atoms.
Contract matching retains owner/failure/prerequisites/site and subject variant.
Requirement IDs and cases are interpreted only as the independently supplied
fixture premise; no production issuer, ontology obligation-kind completeness,
profile authentication or native assertion interpretation is supplied.

Matching preserves every selected original and compares exact full contracts
and atom sets. Every semantic atom must reference an actual source/scope edge
and eligible original capability; selected-wide atoms must match the explicit
origin's requirement set. Zero-edge selections require nonempty deployment
requirements even when selection cannot be recovered from declaration origins.
The final alternative relation requires one eligible origin to cover every
actual demanded source for a scope. No aggregate source union or global
capability intersection substitutes for this choice. Pending original DAG
edges and native requirements remain retained, not discharged.

Actual-owner/registry tests exercise every-atom omission, surplus claims, changed
full contracts, missing zero-edge requirements, wrong selection/custody, exact
and minus-one matcher ledgers, and subject swaps preserving marginal sets.
Additional agreeing declaration/profile populations reject fragments and foreign
source/scope claims while passing different complete capabilities across read
and Application. Full core passes124 tests. Evidence pins are deliberately
selected inputs, not complete build custody or integrated refresh. The bounded
matcher and typed quantified relation formulas are not a Rust refinement proof.
Original132-case backend scope and26 passing backend cases remain unchanged.

## Additional kind/occurrence qualification boundary

The [independent issuer annex](backend-requirement-issuer-v0.2.md) identifies
that the current RequiredPremise0.1 alternatives are source-complete. They are
not proof that one capability discharges every independent kind for one source.
A new versioned demand-instance inventory and whole-instance matcher are required
before production profile issuance; source-only atom presence must not substitute
for codec/privacy or other multiple-kind completeness. All selected original
contracts/atoms remain mandatory independently of this future choice.


## Private instance matcher execution checkpoint

A separate `InstancePremise` envelope, version
`weft.security.required-instances/0.2.0`, now retains the unchanged nested
source-level premise and explicit (source, scope, kind, occurrence) instances.
`match_instances` first validates full original contracts and atoms, then
requires an exact partition of semantic atoms across instances and one eligible
origin covering every instance in its scope. Shared original IDs must retain
one kind/occurrence identity across origins. All complete alternatives survive.
The trusted independently complete instance premise remains an assumption;
production typed-owner issuance and authenticated profile construction are open.

Actual full core execution passes125 tests with zero failures. Controls include
codec/privacy fragmentation, same-kind distinct-occurrence fragmentation,
colocated positives, different complete origins per scope, shared-origin identity
mutation preserving a complete alternative, and omission of one case from a
nonempty multi-case expansion. Exact/minus-one instance visit/text budgets and
each-instance omissions are checked. Limits are4096 instances and4096 expanded
atom links, with phase-local1m visits/16m text; no aggregate resource claim.
Evidence is `kind-instance-matching.json` under build evidence. No original
backend acceptance case is promoted, and no Rust/native refinement is claimed.
