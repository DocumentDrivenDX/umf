---
ddx:
  id: STP-066
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-066
      kind: informed_by
    - id: TD-066
      kind: informed_by
    - id: CONTRACT-053
      kind: informed_by
---

# STP-066: manufacturing reference pack

## Scope and Objective

Qualify the authored first-release subset. Desired feature scope remains broader than this bounded fixture release. Exact fixture columns/rows and independent expected queries are reviewed in scripts/domain-packs/catalog.ts; pack README names its conceptual inventory.

## Acceptance Criteria Test Mapping

| AC | Exercising assertion | Test layer | Status boundary |
| --- | --- | --- | --- |
| US-066-AC1 | Every authored table/field and ontology endpoint validates; native TableSpec recovers exactly | Bun catalog; schema audit | Released conceptual subset only |
| US-066-AC2 | Reviewed positive domain queries produce independently specified identities/values | SQLite and local SQL engine | Fixture subset |
| US-066-AC3 | Reviewed counterexamples remain visible and source rows unchanged | SQLite domain queries | Fixture subset |
| US-066-AC4 | Same seed/profile/input hashes yields identical ZIP; changed seed remaps every identity consistently | TableSpec replay tests | Component replay only |
| US-066-AC5 | Small/demo/large component counts preserve referential integrity | TableSpec replay tests | Partial: independent topology/depth/time/frequency/skew/effort axes unqualified |
| US-066-AC6 | Typed values/nulls/empty text/identities read back; ZIP retains exact graph schema bytes | TableSpec archive/native engine | Declared types/engine versions only |
| US-066-AC7 | Synthetic templates and derived synthetic rows have distinct attributable source/run provenance | TableSpec archive | Partial: no third-party native corpus bundled in this release |
| US-066-AC8 | Unknown profile/version, malformed key map, escaping sources and unselected executable metadata cannot execute | Shared profile/consumer negatives | Declared execution subset |

## Domain Distinction Allocation

Every table and field in the pack inventory has canonical schema/fixture checks. `scenario_checks` names each independent domain query and counterexample; test code verifies it agrees with reviewed repository declarations before executing repository-owned SQL. Additional source-standard interpretations, realism and unexercised scientific dimensions remain unsupported rather than marked accepted. Ecology specifically exercises censoring, unresolved matches, known/unknown effort, non-detection, reach direction, matrix/fraction/rank and fishing effort. Archaeology exercises cycles, overlapping interpretations, multiple asset subjects, unavailable assets, separate specialist denominators and material lineage.

## Executable Proof

Bun domain-pack tests; TableSpec catalog/replay tests using @covers US-066-ACn citations; all-pack local engine readback; Chromium catalog navigation. Exact commands and results are recorded in build evidence after execution. Tests cite only their exercised subsets; full story completion is not inferred from catalog membership.
