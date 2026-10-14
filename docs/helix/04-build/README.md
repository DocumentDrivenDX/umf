# Build

Keep project implementation guidance here. Track execution work in the
chosen runtime's work tracker, with references to governing artifacts.

The [implementation plan](implementation-plan.md) sequences core JSON Schema,
versioned extensions, native fidelity, early DDD, and metadata consumer examples.
It uses Bun for development/testing and requires real-browser validation.

The [security field-protection plan](security-field-protection-plan.md) (draft,
2026-10-13; owner directed the build-out on 2026-10-14) sequences row/attribute
security, masking and tokenization as a shared extension for PostgreSQL 18 and
Unity Catalog, with Truss/Ashlar forward-compatibility constraints. Its upstream
amendments P-A..P-G were applied to FEAT-008, CONTRACT-062/063, SD-008,
STP-056/057 and the security case inventory on 2026-10-14; the gate is 145
required cases with 26 accepted and 13 new `not-run` field-protection cases.
No protection semantics are implemented or natively evidenced yet.

Status: core-envelope implementation and tests exist; scoped execution evidence
is in the plan. Native adapters and the broader extension inventory remain to
implement. No work tracker has been configured.
