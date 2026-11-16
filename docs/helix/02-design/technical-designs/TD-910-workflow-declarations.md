---
ddx:
  id: TD-910
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-910
      kind: informed_by
    - id: SD-910
      kind: informed_by
    - id: ADR-007
      kind: informed_by
    - id: CONTRACT-909
      kind: informed_by
    - id: CONTRACT-910
      kind: informed_by
---

# TD-910 Workflow declaration preparation

## Technical approach

[[US-910]] and [[SD-910]]

CONTRACT-910 builds on the core 0.10 envelope, exact JSON tree and offline
Draft 2020-12 validator. The extension payload carries source text, keeping
interchange bytes independent of YAML or JSON envelope formatting.
CONTRACT-909 adds an explicit elapsed scalar for the workflow profile.
CONTRACT-065 continues to own exact instant parsing.

Validation uses the bundled closed declaration schema and a static pass
for resolved references, predicates and graph invariants. Interchange
retains unknown fields and diagnoses them. Preparation rejects them before
minting its private compiled declaration and lowerings.

## Component changes

| Design item | Component | Boundary |
| --- | --- | --- |
| TD-910-01 | `umf-core::exact_duration` | Depends on the existing exact instant profile. Owns elapsed arithmetic and canonical duration value identity. |
| TD-910-02 | `umf-core::workflow` | Reuses offline source and schema validation. Owns scope checks, lowered graph, predicate types and decisions on explicit state. Provider, clock and store APIs stay outside this module. |
| TD-910-03 | `umf-core-wire::workflow_binding` | Converts prepared results and diagnostics to wire shapes. JavaScript bindings marshal input bytes and decode results without interpreting DSL semantics. |
| TD-910-04 | `spec/extensions/workflow` | Owns the module source payload, closed compile schema and property evidence shape. Effect binding and predicate profiles use explicit version identifiers. |

CONTRACT-900 and CONTRACT-908 remain the authorities for their own action
and Saga semantics. External actions use the new companion profile because
atomic transactional action declarations have different execution promises.
The release and package version remains managed by normal UMF release flow.

## Testing

[STP-910](../../03-test/test-plans/STP-910-workflow-declarations.md) maps
US-910-AC1 through AC8 to compiled definition, transition, browser and
evidence tests. The boundary command is `cargo check --locked --target
wasm32-unknown-unknown -p umf-core-wasm`. Native bindings and the independent
reference replay verify the same declared entry profile.
