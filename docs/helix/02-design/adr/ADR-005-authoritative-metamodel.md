---
ddx:
  id: ADR-005
  type: adr
  activity: design
  status: accepted
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
    - id: ADR-001
      kind: references
    - id: CONTRACT-080
      kind: references
---

# ADR-005: Generate current core definitions from an authored UMF metamodel

## Context

The owner requires one definition of UMF, including schema and validators, and
removal of duplicate definitions and legacy paths (2026-10-18). The deployed
self-model is currently generated from layered JSON Schema definitions while
semantic decisions are maintained in TypeScript and separately in Python.
That projection is useful documentation but does not remove competing authority.

## Decision

Author `spec/metamodel/umf.yaml` using an explicit metamodel extension. Its
structural and ordered semantic declarations are the single current-core rule
authority. Compile JSON Schema, TS/Python shapes, portable constraints, structural
validators and reference/ontology data from it. Generic bounded runtime mechanics
remain handwritten; core-specific rule decisions must be model data.

Current APIs accept core 0.10.0. Remove old core dispatch, transition exports,
layered schema resources and separate schema-browser hosts after migrating their
active consumers. Retain historical evidence inert, with truthful source identity.
Native dialect and extension versions remain independent and exact.

This supersedes ADR-001's permission for permanent bootstrap-schema authority;
its YAML-first, JSON-compatible interchange decision remains. JSON Schema is a
generated enforcement target. Semantic constraints remain explicit where JSON
Schema cannot express them. Unknown/native meaning must never disappear silently.

## Consequences and validation

A closed, independently parsed compiler vocabulary breaks the bootstrap cycle;
the generated result then validates the model and regenerates identically.
Compiler and generic kernel correctness become shared risks. Independent frozen
behavior vectors, mutation tests, cross-runtime parity, native preservation,
clean reproducibility and real-browser checks are mandatory before release.
The implementation and test contracts are CONTRACT-080, TD-091 and STP-091.
Historical evidence does not become current qualification merely by regeneration.
