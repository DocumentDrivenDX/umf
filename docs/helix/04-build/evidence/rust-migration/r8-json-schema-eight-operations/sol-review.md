---
ddx:
  id: umf.evidence.r8-json-schema-eight-operations.sol-review
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.r8-json-schema-eight-operations
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-002
      kind: informed_by
---

# Independent Sol review: JSON Schema default-route decision

Sol independently reran the current TypeScript boundary capture in check mode
and verified all 24 case IDs, including one representative call for each of
the eight proposed exports. The packet SHA-256 is
`afe87bd0cb2ea9b48cbf04c6888a620ac746c133a00b98f08356615776557a38`
and the runner SHA-256 is
`6f1f17d9daf28ab14efa6a7b5f527395b0364065dae8313c3754f746d5d4b654`.
The revised accessor and proxy cases record the actual predecessor trace;
there are no conflicting input-side expected traces.

The route decision is correct: keep all eight exports on the TypeScript default
route. The accepted opt-in Rust packet remains a tagged/profile subset. The
predecessor reports `additionalProperties: true` as complete while the Rust
profile reports it incomplete; direct source calls also invoke getters/proxy
traps and ignore an extra control argument, unlike the safe Rust wrapper
boundary. Raw wrong-type errors and import refusal order require explicit
compatibility decisions before any root override. This review does not grant
default-route parity or installed-cohort qualification.
