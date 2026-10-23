---
ddx:
  id: umf.evidence.rust-migration.r7-metamodel-bootstrap
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-005
      kind: informed_by
    - id: CONTRACT-080
      kind: informed_by
---

# Clean Rust metamodel compiler bootstrap

The source-bound metamodel bridge builds `umf-cli` without its optional
`codegen` feature. This removes the generated codegen resources from the clean
compiler's bootstrap dependency while the normal CLI retains codegen by default.
The shared source closure explicitly includes the six authored R5
cardinality/kind/nullability operation schemas and the authored tables operation
schema; generated outputs are not compiler inputs. The executable fingerprint
includes the selected feature set and those authored resource hashes.

After regenerating the current source-bound outputs, `bun run check:metamodel`
passed its no-write fixed point. `bun test --timeout 30000 tests/metamodel`
passed 59 tests and 424 assertions, including a fixture with no generated
outputs and a private empty compiler cache. The fixture checks source/output
disjointness, the seven authored resource hashes, unchanged output mtimes on
check mode, and rejection of an unexpected generated file. `bun run typecheck`
and `git diff --check` passed. The default CLI codegen integration target passed
9/9 tests after updating its expected resource-manifest digest from the actual
regenerated CLI capabilities result:
`7f7dc9982ff89e7b2dee4dc24955e038bf8daef45d02b7586f583884da5d696a`.
`cargo tree --locked -p umf-cli --no-default-features -i umf-codegen` confirms
that no codegen package remains in the clean compiler's dependency graph.

An independent Sol review reproduced the clean-generation test and verified the
Cargo feature/resource closure, with no remaining bootstrap P1/P2. It identified
the two stale CLI digest assertions after regeneration; those are corrected and
the focused CLI target now passes. This checkpoint proves a clean compiler
bootstrap for the current worktree source, not completion of R7 metamodel,
reference and pack computation retirement or the release-cohort host matrix.
