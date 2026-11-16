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

The Rust compiler validates references, predicates, typed run state and
graph constraints against the bundled schema and semantic rules. The
compiled definition prepares guarded state updates, effect intents and
wait registrations from caller-supplied snapshots. The host commits a
state update and its successor together.

## Component changes

| Design item | Component | Boundary |
| --- | --- | --- |
| TD-910-01 | `umf-core::exact_duration` | Depends on the existing exact instant profile. Owns elapsed arithmetic and canonical duration value identity. |
| TD-910-02 | `umf-core::workflow` | Reuses offline source and schema validation. Owns scope checks, lowered graph, predicate types and decisions on explicit state. Provider, clock and store APIs stay outside this module. |
| TD-910-03 | `umf-core-wire::workflow_binding` | Converts prepared results and diagnostics to wire shapes. JavaScript bindings marshal input bytes and decode results without interpreting DSL semantics. |
| TD-910-04 | `spec/extensions/workflow` | Owns the module source payload, closed compile schema and property evidence shape. Effect binding and predicate profiles use explicit version identifiers. |

CONTRACT-910 owns the external-effect profile. CONTRACT-900 and CONTRACT-908
own transactional actions and sagas.

## Testing

[STP-910](../../03-test/test-plans/STP-910-workflow-declarations.md) maps
US-910-AC1 through AC8 to compiled definition, transition, browser and
evidence tests. The boundary command is `cargo check --locked --target
wasm32-unknown-unknown -p umf-core-wasm`. Native bindings and the independent
reference replay verify the same declared entry profile.
