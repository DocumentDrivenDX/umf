# Obligation assignment relation experiment

Draft annex to SPIKE-010 and Weft CONTRACT-005. Traces to US-056-AC7 and
AC10. Original132-case backend plan remains binding. This design does not
qualify native enforcement or authorize public lowering.

The later [source-demand design](source-demand-binding-v0.1.md) supersedes this
annex's unscoped five-coordinate assignment proposal before implementation.
The future matcher retains required scope as a sixth coordinate and chooses a
complete capability per scope for all required sources. This does not reinterpret
an existing 0.1 transport or qualify the proposed matcher.

## Separate issuers and evidence

The compiler owns actual source dependencies and source identity. The backend
qualification authority owns a reviewed profile that maps those dependencies
and deployment-wide requirements to evidence cases and permitted enforcement
sites. The runtime admission authority verifies current native execution,
installed-source correspondence and authority/release guards. These are three
independent inputs; none is reconstructed from the declaration being checked.

An owner context alone cannot determine whether an installation closes ordinary
roles, historical access, alternate endpoints or publication races. The backend
profile must cover these deployment-wide requirements even for COUNT, an empty
query or a policy branch that evaluates false. Case IDs from the test plan are
qualification requirements, not proof that a current installation satisfies them.
A passing scoped fixture cannot replace a required full backend case.

The first matching experiment accepts an independently issued required relation
as an explicit trusted premise. Its constructor and matcher remain private to
the owner crate. This is conditional declaration checking; complete issuer
implementation, selected-profile authentication, scope binding and evidence
execution remain separate gates. Do not wire the experiment into public lowering
until those gates are implemented and independently qualified.

## Preserve the relation

A requirement atom is `(original obligation ID, capability origin, semantic
source, enforcement site, evidence case)`. Required atoms bind exact immutable selected registration
origins, canonical owner-issued source identities and independently selected
profile/case identities. Sites distinguish host, backend and native. Compiler
sites remain outside the closed admission parameter0.1 subset.

Each original obligation currently declares source and case arrays plus one
site. Interpret this as a rectangle: for every original selected capability
origin, every listed source and every listed case, issue one declared atom at
that site. Shared obligation IDs retain every original capability origin.
The independently required obligation contracts additionally retain exact failure
codes and prerequisite sets. Compare these contracts as well as the complete
declared and required relations, not their separate
projections or global source/case unions. Missing atoms, extra atoms, source/case
swaps between capabilities and correct cases at the wrong site refuse.

A nonrectangular requirement must use separate original obligations. For
example `(mask-obligation,A,salary,native,mask)` and
`(membership-obligation,A,project,native,membership)` cannot be
satisfied by a single obligation listing both sources and both cases: that
would also claim crossed salary/membership and project/mask assignments.
If a future vocabulary supports sparse assignments, it needs its own version
and explicit migration; do not reinterpret0.1 arrays silently.

Source correspondence and prerequisite DAG validation must precede relation
matching. Each required atom references an actually selected capability and an
owner-issued source. Every selected capability and every issued source needs
at least one required atom in the first subset, including selected capabilities
with no original obligations: those must refuse. Expected duplicate atoms,
empty inventories, unknown sites and invalid identity carriers refuse rather
than being normalized into success. Every original obligation remains in the
returned inventory with its original ID, failure code and prerequisites.

## Bounds and outcome

Limit each relation to4096 distinct atoms, each identity to4096 UTF8 bytes,
and charge visits and all copied string bytes before atom allocation and
Cartesian expansion. Bound expected and declared traversal together by one
million visits/sixteen million UTF8 bytes. A duplicate original atom does not
create a second obligation, but its traversal must still be charged. Refusal
returns no matched inventory. These ledgers do not prove total CPU/memory bounds
or an aggregate bound across custody, projection, source and relation phases.

Exact matching issues a declaration-correspondence result only. It does not
mark any case executed, interpret case assertions, approve a site, authenticate
a profile/issuer, prove Permit, admit SQL or authorize installation/release.
Required native evidence is a further independent conjunction, not a property
of a matching atom or a backend success flag.

## Executable and formal qualification

Use original registered manifests and actual owner contexts for complete
matching, each-atom omission, extra/substituted source/case/site, two capability
assignment swaps with identical marginal sets, shared-ID origin retention,
nonrectangular positive decompositions and rectangular overclaim refusal.
Include a selected capability with no obligations, duplicate/empty/foreign
required atoms, invalid identities, size and exact measured ledger exhaustion.
Native evidence must still refuse when relation matching succeeds.

Formal laws must use an unbounded five-place required/declared relation and
construct populated SAT counterexamples to marginal-union matching. Preserve
original obligation identity, capability, source, site and case separately. Prove exact matching cannot omit
or add an atom under the explicitly supplied required relation. Prove source
and case coverage do not establish cross-product correspondence or native
execution. These are conditional relation laws, not proofs that the issuer
has derived a complete requirement set or that Rust/native execution refines
those laws.

Open: independently implemented reviewed backend-profile requirement issuer;
precise deployment/source/capability binding; complete obligation-kind mapping;
required-case assertion interpretation; source-current native execution and
issuer authentication; authority/activation/release composition; full graph
and remaining original backend case qualification.
