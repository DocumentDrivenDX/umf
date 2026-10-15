# Multi-target transactions and opaque witness comparison — design addendum

This supersedes the initial review's cross-cut opaque-ID comparison sentence. Opaque witness IDs are per-cut deduplication handles, not logical Record identity. Comparing them as stable cross-cut identity would invent unsupported meaning. The original review and receipt are retained as dated design evidence.

The parent's revised request contains complete before/after cuts plus explicit create/update/delete mutations, each with exact type/Key and its type's complete write profile. Every actual Record delta must be listed and receive the ordinary CRUD, changed-Field, original-read-or-blind, and stored-transform vault checks. This closes the auxiliary association Field bypass. A no-op update can serve as an explicit anchor for relationship-only changes, but still needs its normal update grant.

## Opaque graph semantics

Use an explicitly logical endpoint multiset comparison. Within each cut, the existing opaque IDs remain exact, nonempty, unique within a relationship, and supply only deduplication. Across cuts, the comparison key is the exact qualified relationship and complete role-labelled endpoint selectors, each encoded under its original typed Record Key. Count every parallel incidence; do not collapse to a set or a Boolean exists result.

Cancel the minimum before/after count for each key. Each remaining removed or added incidence is a logical delta and must satisfy the fixed owner binding in the relevant side. Opaque ID renaming with equal endpoint multiplicities is no logical delta. No algorithm can infer whether such equal observations came from no physical change or physical delete/reinsert. The guard must retain this observational limit: it proves no physical-effect trace, trigger effects, historical witness identity, or native no-write property. Native effects need original host intent/effect correspondence. A later separately selected stable-token/intent profile could retain operation-local physical pairing, but existing per-cut opaque IDs must never acquire that meaning by inference.

This preserves opaque relationship support for the logical guard and does not weaken Field write guards: opaque incidences have no Record attributes. Record-key witnesses remain separate, using their true typed Record identity and independently checked full Record projections. Changing an attribute on a Record witness can change an association's logical source even when endpoints and witness Key remain unchanged.

## Exhaustive global association binding

The trusted immutable owner bundle must contain exactly one binding for every original issued association, including unused sources, with a tagged identity distinguishing Record-member and graph-relationship namespaces. Each binding is either immutable or owned. No per-request choice or omitted default is allowed.

An owned binding resolves one exact source-checked endpoint role and owner type, or an actual Record-witness anchor. An opaque witness cannot be a witness anchor. Flat endpoint Fields are typed through the original association plan; graph endpoint Keys use that plan's roles and target types. A Record-member witness can anchor to its own selected Record identity only where explicitly declared.

Each logical delta must resolve its old and/or new anchor to an explicitly listed mutation target. Retargeting requires both sides, including separate no-op update anchors when owners differ. Special ownership and, where source-dependent, policy actions are checked in every required state of each relevant target. A changed Record-witness attribute also triggers these association checks, in addition to its own Field checks. An unrelated listed target or an aliasing type/relationship ID cannot discharge an anchor obligation.

Whole transaction comparison requires exact mutation/delta correspondence: create absent-before/present-after; delete present-before/absent-after; update present-both with stable normalized Key. Duplicate selectors and conflicting mutation operations refuse. Unlisted Record deltas and immutable association deltas refuse. Pure no-op updates are permitted only as explicitly checked operations; they do not acquire changed-Field or vault obligations absent a logical change.

## Independent counterexample controls to preserve

- Same opaque IDs, changed endpoints: must detect logical delta.
- Renamed opaque IDs, same endpoint multiset: no logical delta; neither stable physical identity nor physical replacement admission is inferred.
- Two parallel incidences reduced to one: must detect removal, despite unchanged existential truth.
- Before A→B,C→D versus after A→D,C→B: retain role-pair correlations; independent per-role endpoint bags are insufficient.
- Same opaque ID under different relationships: distinct namespaces.
- One Record witness, same endpoints, changed stored-token attribute: its own vault/read-or-blind/ordinary checks and relevant association special actions all apply.
- Retarget old owner P1 to P2 with only P1 listed/granted: refuse.
- Extra masked association Record change not in mutations: refuse before permission conclusions.
- Equivalent normalized numeric endpoint Keys and order-only array changes: no invented delta.
- Missing complete role/witness coverage: refuse, even if the visible before/after bags are equal.

The source-owned purpose table in the initial review remains the proposed explicit interpretation. This addendum is a design recommendation, not code/native proof or S24/S25 acceptance. The unchanged full assertions remain the implementation and independent-oracle target.
