---
ddx:
  id: ADR-006
  type: adr
  activity: design
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
    - id: ADR-002
      kind: references
    - id: ADR-004
      kind: references
    - id: ADR-005
      kind: references
    - id: CONTRACT-080
      kind: references
---

# ADR-006: Share UMF executable semantics through Rust

## Problem

Python generator distribution currently embeds the TypeScript implementation in
V8 through MiniRacer. Separately maintained Python kernels also duplicate shared
mechanics. The owner proposes moving UMF executable logic to Rust to remove the
Python JavaScript engine dependency while retaining a single source and supplying
a Rust CLI, Python bindings and Node/Bun bindings.

## Decision

Use Rust as the target implementation language for UMF-owned shared executable
semantics: model admission, exact values, serialization, registry mechanics,
validation, adapters, projections, generators and portable deployment/migration
planning. The authored metamodel remains rule authority under ADR-005. Rust
implements its compiler and generic execution mechanics; generated language
shapes and inert rules remain derived outputs.

Expose the same Rust operations through a native Rust command-line interface
(CLI), native Python bindings, Node/Bun bindings and browser WebAssembly (WASM).
Wrappers own host-value admission, exception/type presentation, loading and host
capabilities. Keep semantic decisions in Rust or authored model data. No Python
installation or Rust CLI operation may require V8, Node, Bun or embedded JavaScript
as a hidden fallback.

Generated Python clients remain standard-library-only under ADR-004. Their typed
expression construction and transport calls are generated boundary code. Consumer
connections, authorization, transactions and execution remain consumer-owned.
JavaScript presentation and build/test tools can remain in their host language;
UMF algorithms invoked by them move to Rust. This defines “all executable code”
as shared UMF engine logic, allowing the wrappers and generated clients requested
by the owner. New handwritten semantic implementations in wrappers are drift.

Supersede ADR-002's TypeScript engine preference and single-package restriction
for this migration; retain Bun for JavaScript development/tests and real-browser
verification. Preserve the public model/API wherever possible; explicitly version
unavoidable source, loading or behavioral changes. Migration occurs by qualified
operation families with one shipped owner per family.

## Why we chose this

### Over embedded JavaScript or a different JavaScript engine

These retain a JavaScript engine in Python and cannot supply an independently
native Rust CLI. Changing the engine relocates the dependency the owner wants
removed.

### Over separate Rust, Python and TypeScript implementations

Separate implementations multiply executable semantics. Bindings and generated
shapes preserve language ergonomics while sharing model rules and algorithms.
Cross-runtime tests remain necessary because host admission itself can lose meaning.

### Over a full rewrite before any cutover

Porting the generator's dependency closure first creates an independently useful
V8-free Python milestone. Existing TypeScript remains a temporary differential
reference until each operation family passes its semantic and native gates.
This does not reduce the final migration scope.

## Consequences

Native Python and Node packages require platform binaries and installation tests.
The Rust CLI must work without Python or JavaScript installed. Browser delivery
requires a WASM loading contract and real browser tests. A Rust implementation
of a validator or parser does not inherit the old dependency's qualification.
External native compiler integrations retain explicit version/capability boundaries.

Provisional risk: PyO3/maturin, napi-rs and wasm-bindgen are proposed binding tools.
Their suitability for exact values, callbacks, cancellation, supported platforms
and synchronous APIs requires a bounded spike before freezing interfaces. Bun
compatibility requires UMF's own blocking tests. Tool and dependency versions are
selected and locked by that spike; no compatibility promise follows from this ADR.
If a tool fails, replace the binding mechanism without changing shared ownership.
A native-only dependency cannot silently remove an existing browser capability.

## Concern impact

The project runtime concern becomes Rust shared execution plus Bun/TypeScript
host tooling. Modularity checks must enforce Cargo and language-wrapper boundaries.
Fidelity, offline use, unknown retention, bounded execution and native oracles
remain unchanged. The architecture defines the module boundaries; the
[build plan](../../04-build/rust-migration-plan.md) defines cutovers and evidence.
