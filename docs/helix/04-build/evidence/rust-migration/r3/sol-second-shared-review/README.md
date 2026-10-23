# Independent second shared review

This review is disjoint from the reviewer's action implementation. It covers
shared table inspection, deployment, row-scope and the root host/control
changes. The shared implementer is still repairing source; this packet is
**request changes**, not final approval or final source-cohort qualification.

Fresh independent controls identify:

1. Related-match signatures used lossy UTF-8 conversion and delimiter joins.
   Distinct exact Field pairs collide when IDs contain `|demo/`. The immutable
   `frozen.json` public deployment control compiles in the predecessor but
   originally blocked in Rust with `TABLES_DUPLICATE`. The owner is repairing
   this signature; final replay must identify its fixed source hash.
2. Deployment `groupRoles` raw object insertion order differs from the source
   language's numeric own-key enumeration. Raw pairs `[("2", ""), ("1", "")]`
   must first diagnose `/configuration/groupRoles/1`; the original Rust
   implementation diagnosed `/2`. The separate
   `sol-second-numeric-keys-review/frozen.json` preserves that pair insertion
   order and predecessor result. This is a compiler-local interpretation rule,
   not permission to reorder the core wire or all raw UMF objects.
3. The new table schema-hop depth adapter creates a new `Context`, forwarding
   work and controls but resetting cumulative constraint instruction accounting.
   An exhausted caller `max_constraint_steps` must still refuse. The original
   adapter instead returned a valid/complete inspection. The independent raw
   test checks this remaining budget explicitly.

`crates/umf-codegen/tests/sol_second_shared_review.rs` constructs the raw numeric
pairs explicitly and checks the cumulative instruction budget. Both controls
failed at initial capture. Their expected outcomes are independent contract/source
requirements and must not be changed to match the implementation.

Review continues across source semantics, UTF-16 identity, phase/diagnostic order,
unknown content, allocation/loop controls, verified original-source recompile and
host conversion. Final approval requires a frozen implementer handoff, repaired
independent controls and exact source/resource hashes. Passing existing fixture
comparisons alone does not establish source completeness.
