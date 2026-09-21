# Design

Record architecture, decisions, contracts, and technical designs grounded
in the project's requirements.

Draft design artifacts:

- [Architecture](architecture.md): model, vocabulary, adapter, validation,
  projection, and diagnostic boundaries; proposed ecosystem sequence and repository layout.
- [ADR-001](adr/ADR-001-bootstrap-representation.md): records the owner's
  YAML-first, JSON-compatible structural-validation direction.
- [SPIKE-001](spikes/SPIKE-001-jsonschema-protobuf.md): planned native-fidelity
  investigation for JSON Schema and Protobuf, followed by explicit projection diagnostics.

TypeScript is preferred for browser JavaScript;
[ADR-002](adr/ADR-002-bun-development-runtime.md) selects Bun for development/testing.
DDD is an early semantic extension, and programmatic metadata consumers share
the metamodel. Native support scopes, exact contracts,
and existing TableSpec compatibility evidence are prerequisites for build.
The spike has not run; the architecture makes no completed compatibility claim.

[CONTRACT-040](contracts/CONTRACT-040-core-ideals.md) specifies the next core ideals;
TD-040–TD-044 implement them in order across all five priority systems. This
authoring amendment precedes any envelope/schema change.
