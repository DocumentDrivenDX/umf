---
ddx:
  id: umf.evidence.rust-migration.r8-security-literal.sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r8-security-literal
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-062
      kind: informed_by
---

# Independent Sol review: security literal foundation

Sol inspected `Engine::check_schema_literal_public` as a first-diagnostic
operation-error projection over the retained Rust literal validator. The
current Bun predecessor packet has 11 bounded signed integer, nullability,
wrapper/facet, exact decimal, and Unicode cases. Sol independently ran its
read-only byte-for-byte `--check` and the Rust integration tests (2/2), which
compare every packet result or first code/path/message and verify separate
Rust work-meter refusal. SHA-256 values are: core Engine
`9be56c4cf742c1cbc494c3de18e838d4ebc9e8e01ea171685e343e7df6d02910`,
test `2604628e1daf4cd36713323326411193699c3ab3b6324903c43632326ccd14ae`,
capture `8712f5963d1fd73403b43a72c6887b0bd5c3f447934011711b02867563a705e9`,
and packet `313f890eafcef4f7fdb264a9544623a10d444eccd914d7c96a118056ec2adfb2`.

This accepts only literal admission after source, Field and value selection in
the 11-case subset. The Rust work meter is an extra control, not TypeScript
parity evidence. JSON/YAML codec order, raw host admission, policy/ontology
and V2 protection-source/domain/parameter resolution, bindings and default
retirement remain open.

## Opt-in literal wire review — 2026-10-25

Sol inspected the closed `umf.security-disclosure-literal/1` request, explicit
five-resource admission, caller-selected source/Field/literal, and the exact
11-case tagged differential. Sol independently ran the read-only TypeScript
packet check and the focused Rust wire module suite (3/3), including unknown
request/profile refusal and host-control refusal. The wire module SHA-256 is
`45db3d5721d72b0e3771ada649c5c3bf9c59ee9afed1ce90ce6d9d6c42790e79`;
the packet SHA-256 is
`313f890eafcef4f7fdb264a9544623a10d444eccd914d7c96a118056ec2adfb2`.
This accepts a tagged literal primitive only. Selection, policy/catalog and
domain interpretation, batch disclosure validation, JSON/YAML codec behavior,
host bindings and all six default exports remain open.
