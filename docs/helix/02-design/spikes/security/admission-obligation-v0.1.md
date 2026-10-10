# Closed admission-obligation projection experiment

This is a draft implementation annex to SPIKE-010 and Weft CONTRACT-005,
tracing to US-056-AC7 and AC10. It does not extend the public 0.4 transport or
admit a compiled artifact. Original backend acceptance stays26/132.

The sibling JSON Schema captures parameter shape only. Its character bounds
do not replace owner UTF8 byte checks or prerequisite/owner checks.

The private owner interprets only original registered Obligation.parameters
objects with exactly these members:

- version: `weft.security.admission-obligation/0.1.0`.
- semanticSources: nonempty distinct string identities.
- enforcementSite: `host` for owner host; `backend` or `native` for owner backend.
- prerequisites: distinct obligation IDs from the complete selected inventory.
- evidenceCaseIds: nonempty distinct independent-case identities.

Each collection has at most4096 entries; each identity is nonempty, NUL-free
and at most4096 UTF8 bytes. The projected inventory has1..4096 obligations.
IDs and failure codes come from the immutable original declaration, not these
parameters. The original selected capability origins remain in custody. Every
selected obligation must use this profile; unknown versions, extra fields or
uninterpreted parameter content refuse the entire projection, while their
original content remains preserved. Compiler enforcement sites are unsupported
by this first profile; that is a subset restriction, not a universal owner rule.

Projection preserves the complete declared inventory. Prerequisite references
must resolve in that inventory and form a DAG. Iterative Kahn traversal examines
all components, including disconnected cycles. Parsing/copying and each graph
edge traversal charge a shared one-million-visit/sixteen-million-UTF8-byte
projection ledger. These are execution limits, not CPU/memory proofs. The ledger
is separate from the earlier custody collection; no end-to-end aggregate bound
is claimed.

This profile reconstructs the closed response members without losing unknown
parameter meaning silently. It does not establish that semanticSources name
actual selected scan/action paths, that evidenceCaseIds name sufficient required
native cases, that the capability selection is complete, or that any declared
site enforces anything. These checks remain necessary against independently
owner-derived inventories and authenticated native evidence before emission.
Public lowering stays closed.

Required executable controls: complete exact projection with shared dependency;
opaque/unknown version/extra or missing field; wrong owner/site and object enum
carrier; empty/duplicate/nonstring source/case identities; unresolved dependency;
self/two-node/disconnected cycles; admitted acyclic counterpart; exact measured
work/text limits and one-unit exhaustion; multibyte UTF8 bound. Require original
failure-code/parameter equality and all selected entries, not shape validity alone.

Formal follow-up must distinguish declaration reconstruction from source coverage
and enforcement, and prove prerequisite closure/topological termination only
under explicit finite inventory and correctly constructed graph premises. Rust,
backend and native refinement require executable evidence separately.
