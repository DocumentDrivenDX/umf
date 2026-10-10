# Owner source-to-scope demand binding design

Draft implementation follow-up to SPIKE-010, the owner semantic allocation annex
and Weft CONTRACT-005. US-056-AC7/AC10. A private Rust issuer now implements the
bounded source-demand subset below; native admission remains unqualified.
Original132-case backend scope stays binding.

This corrects the assignment identity proposed in
[obligation assignment](obligation-assignment-v0.1.md) before its implementation:
retain `(original obligation ID, capability origin, canonical source ID,
required scope, enforcement site, evidence case)`. A five-part atom without
scope can collapse Application/read/original-authorized demands for the same
capability/source/case. Required owner/failure/prerequisite contracts remain
separate mandatory checks. No new public transport is authorized by this design.
The six-coordinate relation is a new private design revision, superseding the
earlier five-coordinate draft and its unscoped rectangular expansion. It must
not silently reinterpret an existing 0.1 transport or receipt.

The subsequent [private scoped-obligation revision 0.2](scoped-obligation-matching-v0.2.md)
resolves selected-wide subjects separately from semantic source/scope pairs.
Its versioned interpretation supersedes the ambiguous expansion proposal below;
existing 0.1 declaration projection remains unchanged.

## Conjunction and alternatives

Derive from the exact context retained by OwnerCoverage, borrowing that exact
coverage object. Keep the relation:

`source -> required scopes (AND) -> eligible complete capabilities (alternatives)`.

Every required scope must be discharged. One independently eligible complete
capability may satisfy an individual scope; fragments cannot union to cover it.
The eventual choice is per complete scope: `exists capability, forall required
sources`, never `forall sources, exists capability`. The correspondence index
does not itself authorize choosing a different capability for each source in
one scope. A governed compatible composite would require its own explicit
contract; the initial subset supports whole capabilities only.
Different compatible capabilities may satisfy different scopes only under the
already checked exact semantic profile and later trusted evidence assignment.
Neither the union of candidate IDs nor the intersection across all scopes can
replace this relation. Intersection would unnecessarily require one capability
to cover every distinct scope; union would omit mandatory scopes.

The exact selected capability inventory remains separate. Zero-edge selected
capabilities still require independently issued deployment/profile obligations;
do not recover selection from edges or original obligation origins.

## Initial source demands

Derive edges beside canonical source issuance from the actual compiler context
retained by OwnerCoverage. Do not parse caller-supplied source strings to infer
their scope or accept scopes from backend packets. Assert that demand-map keys
equal the entire canonical source inventory and every demanded scope exists in
OwnerCoverage. Unknown or inconsistent mappings refuse atomically.

| Issued source prefix | Mandatory scope demands |
| --- | --- |
| action, rule, key, key-field, field, context, association | Exact owning ScanAction(scan, action) from traversal |
| projection | Its occurrence's primary ScanAction and Application |
| query-field | Primary ScanAction, every OriginalAuthorized action used by an actual operator on that exact occurrence and qualified field, and Application |
| operator, Disclosed | Exact occurrence's primary ScanAction and Application |
| operator, OriginalAuthorized(action) | Primary ScanAction, exact original ScanAction, and Application |
| scan | Every actual action for that occurrence and Application |
| output | Admitted direct Expression::Field.scan primary ScanAction and Application; retain output position and name |
| primary-action | Every actual primary ScanAction and Application |
| policy, ontology, query, model, module | All actual scopes under the conservative shared-custody rule |

Embedded Staff or association targets never redirect a dependency to a different
query scan. Merge demands when a canonical source deduplicates; repeated uses
must not overwrite earlier actions. Preserve operator position/mode and output
position/name. Another self-join occurrence of the same field cannot substitute
for an output's actual expression scan. Original-action demands remain mandatory
even with no permitting rules or no returned rows.

The global-source rule binds exact-context custody to every actual scope. It
does not assert semantic support for every unused field/rule in those bytes,
policy truth, source authentication or deployment-wide protection. Selected but
unused module pins remain retained. This is an owner profile rule, never an
inference from a manifest's capability claim.

The private issuer derives this prefix mapping beside canonical source issuance
and borrows the actual OwnerCoverage. Its source-to-scope map holds references
to that coverage's keys; candidate lookup borrows its complete candidate sets.
No backend transport or public constructor is added. COUNT continues to have
source requirements but its unsupported computed-result profile refuses
allocation issuance.

## Evidence and bounds

Bind issued demand inventory to original registration/context/selection custody.
Expand original obligation rectangles only against independently issued scoped
requirements; backend source/case arrays do not select the required scopes.
A trusted profile must explicitly certify each scope it covers. Do not mint a
native success from a matching scoped atom, metadata status or passing fixture.
Required kinds, sites, cases, prerequisite edges and their scope meaning must
come from that independent profile; exact scope strings and atom equality do
not prove those requirements or execution.

Charge source/demand/candidate traversal and copies before retaining output;
retain explicit finite scope/edge/byte limits and exact exhaustion controls.
The issuer keeps the existing4096-source limit and caps retained source/scope
edges at65,536. Its separate ledger admits at most1,000,000 charged visits and
16,000,000 UTF8 bytes. Canonical source construction and the extra inventory/map
key copy are charged before allocation; scope references are borrowed. This
does not bound every BTree comparison or total aggregate CPU/memory. The old
source-only derivation skips demand-only operator comparisons.
Borrow eligible candidate sets by scope key instead of materializing the full
source-by-scope-by-capability product. Bound any later assignment expansion
separately before allocation.
Prove no prefix is issued on failure. Existing phase-local budgets cannot be
reported as an aggregate memory/CPU theorem.

Required controls: same source with distinct read/original/Application demands;
multiple operators on the same scan/field; different self-join occurrences;
complete alternatives versus partial union; compatible distributed coverage
versus invalid intersection-only refusal; wrong context/registration/selection;
zero-edge capability custody; dropped scope preserving source/capability/case
unions; explicit source vocabulary consistency and exact bounded traversal.
An independent expected complete source-to-scope map is mandatory. Omit each
primary/original/Application demand in turn and require refusal; accumulate two
different original actions on the same query field. Preserve false-branch
dependencies on their owning action. Swap scopes while keeping the same marginal
source/capability unions and require refusal. Disjoint valid complete candidate
alternatives across primary/original/Application scopes must remain admissible.
Check exact and one-unit-short edge, work and UTF8 budgets.

## Private execution and formal scope

The complete Rust core suite passes118 tests, including five new controls:
an independently authored complete source/scope map and exact source-only/new
ledgers; two distinct original actions accumulated on one query field with each
required scope omitted in turn; actual self-join output occurrence and false-branch
ownership; disjoint primary/Application candidate sets, separate original
candidates and exact zero-edge selection custody; and local edge retention
guards plus an actual256-source-by256-scope65,536-edge population. The boundary
population is a private retention primitive, not a full compiler-context/native
population. Matching backend assignment atoms and swapped-scope refusal remain
future matcher controls, rather than claims about this issuer.

[Rust execution receipt](../../../04-build/evidence/security/weft-source-demands.json)
retains raw commands/output and source/build digests. Failed development attempts
and preceding successful receipts are archived; they are not silently repinned.
[Formal receipt](../../../04-build/evidence/security/source-demands-formal.json)
retains fifteen independently replayed formulas for five conditional finite
composition laws, including fragment union, distinct-scope alternatives,
original-use conjunction, scoped edges versus marginals and the separate native
conjunct. These are finite Boolean models, not a Rust refinement proof or a
theorem over arbitrary source/capability populations or authenticated evidence.

Open: scoped original obligation matcher,
independently selected backend-profile requirements, authenticated current native
evidence and physical/result/authority/activation/release composition. No original
backend case is promoted by this design correction.
