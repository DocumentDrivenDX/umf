# Praxis adoption handoff prompt

Run this in the consumer owner's chat. This UMF workstream changes upstream
capabilities and fixtures; it does not edit the Praxis codebase. Package selection
must follow the published qualification packet, not a version constant on main.

```text
Adopt the released UMF table capabilities in Praxis, preserving the
UMF/Weft/host boundaries.

Authoring decision: convert table declarations to UMF 0.10 and replace
appropriate named SQL calls with generated typed clients. Keep identity,
connection pools, role/schema provisioning, approval decisions, execution and
migration history in the Praxis host.

Inventory the actual example plugin: ten table declarations plus a module file,
and four SQL/snapshot migration pairs. Reconcile the older eleven-table claim.
Preserve every applied migration's original bytes and digest. Do not fabricate
UMF-generated history or rerun bootstrap DDL against an existing installation.

Select published, hash-pinned packages and their qualified support inventory.
For SDK 0.5.5, use its final release cohort only after publication, including
the exact access/codegen/core/Weft wheels and complete offline dependencies.
Keep optional SQL containment and its parser/license cohort separate.

Map descriptions, defaults, lengths, enum/range constraints, keys, indexes and
relationships without losing meaning. Convert owner, group, via, parent-through,
batch and reviewed-unscoped policies explicitly. Use exact host bindings and
canonical policy declarations; reject unsupported source forms instead of
approximating them. Retain source-to-output traceability.

Design the transition from the existing host ledger to upstream plans without
rewriting applied history or weakening native correspondence checks. Report any
missing upstream adoption capability to the UMF owner. Persistent-approval
metadata cannot be downgraded to an older profile to bypass inventory limits.

Verify generated plugin and scheduled-batch calls on isolated PostgreSQL with
distinct people, group and batch identities, including NULL/default behavior,
bounds, policy enforcement, replay and recovery. Managed Lakebase qualification
requires an explicitly authorized isolated target; local evidence cannot replace
it. Keep credentials and private input sources out of upstream artifacts.

Remove the replaced local emitter/planner/policy code only after acceptance
passes. Retain host responsibilities. Deliver the reviewed consumer change,
pinned dependency receipts, migration/adoption instructions and explicit
remaining upstream gaps. General transforms, online reconciliation, multi-store
migration and other MIG-G02–G11 limits are not implied by bounded G01 support.
```

Upstream references: [candidate support inventory](../../05-deploy/sdk-release-notes-0.5.5.md),
[lifecycle profiles](legal-table-lifecycle.md),
[offline distribution](python-wheel-mirror.md), and
[independent G01 signoff](../evidence/schema-migration-design-review/g01-review.json).
