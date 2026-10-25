---
ddx:
  id: umf.evidence.rust-migration.r8-package-reference-variable-analysis
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
    - id: ADR-006
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
---

# R8 package-reference variable initializer analysis

This analysis examines all 167 `VariableDeclaration` rows reachable from the
`./reference` package route. The analysis resolves each declaration through the
TypeScript compiler AST and checker; initializer classes and authorities are
not inferred from export names or regular expressions. Its generated detail is
in [package-reference-variable-analysis.json](package-reference-variable-analysis.json),
and [the test](../../../../../../tests/rust-inventory/r8-package-reference-variable-analysis.test.mjs)
asserts the declaration census, resolved-source classes, generator manifest
closure and stale-output check.

The AST classes are 13 function-valued expressions, 79 literal/static/frozen
forms, 69 aliases or property reads, and 4 dynamic executable initializers.
Checker-resolved authority classes refine those forms into 64 authored package
descriptor aliases, 2 aliases to authored JSON schemas, 78 authored static
data initializers, 1 frozen authored data expression, 4 dynamic executable
initializers, 13 functions, and 5 generated-backed model-data declarations or
aliases. Four rows are the previously reviewed vocabulary arrays from
`src/model/types.ts`; the fifth is `CURRENT_CORE_VERSION` from
`src/generated/core-model.ts`. The separate `scalarTypesForVersion` export is a
function-valued authored gate over the generated version and scalar list, not
one of the five data rows; it remains executable semantic behavior.

The only additional generated-source variable declaration is
`CURRENT_CORE_VERSION` in `src/generated/core-model.ts`. The generated file is
an output of `scripts/metamodel/build.ts` from the authored
`spec/metamodel/umf.yaml`; the checked manifest binds both source and output
hashes. `CURRENT_CORE_VERSION` participates in document version admission,
access generation and multiple adapter/projection checks. It is generated
static data with runtime semantic consumers, not an inert alias. The AST pass
therefore proposes no additional inert generated-data row for promotion. A
separate semantic/default-route disposition would be required before any
retirement treatment.

The source pins at this capture are:

| Input | SHA-256 |
| --- | --- |
| `docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/inventory.json` | `dacc99e18fdc5a7297a76e5fa358fb96062c0125f97f8dcbcc84fcc8d4f51017` |
| `spec/metamodel/umf.yaml` | `42144576e3b15da4945ca744623a31967e3b29efa54da8ba3961e446b1c0e34b` |
| `scripts/metamodel/build.ts` | `f2a0b2f18c09b8bcff2099d4cadd20a7d91017b53ccfa2596226818189f054c3` |
| `src/generated/core-model.ts` | `6536e081663c2662866e2805c0db981807ca658fb10e195d4732034691b9761e` |
| `spec/metamodel/generated/manifest.json` | `91ba17abc0ceb61d9725aa76e31faad235de8a79379ecf355bc771e154819a6d` |

The captured manifest has 460 source files and its stored model output matches
the checked-in `core-model.ts`. A current-source isolated generation to
`/private/tmp/umf-package-reference-model` had 467 source files and compiler
source-set hash
`f40536586001517f4b3bce4c8a78c6ea2667c86de4c55e18ea0bef13c71de6f7`; its
generated model output hash was
`63870626823008291478214d824f6bd8addab0161fc9ec216f901e4054aba353`. Compared
with the checked-in file, the only textual difference was the generated
compiler-hash header. The full current `bun scripts/metamodel/build.ts --check`
failed at `METAMODEL_STALE_OUTPUT spec/core/schema.json`. This moving-source
check means the generated semantic constant's provenance is clear, while a
full generated-source fixed point is still open.

At final capture, the analysis JSON SHA-256 is recorded in its generator
output. `node scripts/rust-migration/r8/package-reference-variable-analysis.mjs --check`
and its focused test pass. The isolated generator probe did not write to the
repository. This is descriptive inventory evidence only: it does not alter the
resource ledger, the 922 logical executable retirement gaps, default-route
claims, or installed-release qualification.
