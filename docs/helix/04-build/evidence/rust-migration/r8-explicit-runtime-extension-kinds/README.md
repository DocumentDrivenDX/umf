---
ddx:
  id: umf.evidence.rust-migration.r8-explicit-runtime-extension-kinds
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-907
      kind: implements
---

# R8 explicit-runtime disposition for extension-kind inspection

The R8 inventory classifies the package-root `inspectExtensionKinds` export
from `src/model/extension-kinds.ts` as an inherited TypeScript executable.
Its current implementation is a host facade: it requires
`registry.kindRuntime`, then delegates the full operation to that supplied
runtime with `registry.registrations()`. The Node and WASM engines already
provide `inspectExtensionKinds`, backed by Rust `Engine::inspect_extension_kinds`
in `crates/umf-core/src/kinds.rs`.

CONTRACT-907 requires callers to construct `new Registry(runtime)` explicitly.
Every kind API must throw `EXTENSION_KIND_RUNTIME_REQUIRED` when that registry
has no runtime, including an empty registry. The V4 roots' initialized model
engine therefore cannot be injected into a caller's default `Registry`, and a
wrapper cannot ignore or replace a caller-supplied `registry.kindRuntime`.
Doing either would change the contract's capability boundary. Because the
existing facade already delegates semantics to the exact supplied runtime,
adding another V4 wrapper would not create a meaningful default-route change.

This is a contract-supported caller-runtime-selected Rust operation, not a
package-root-default Rust route. It does not qualify as an accepted default
route mapping and does not retire the logical R8 gap. The R8 inventory and gap
ledger remain unchanged. No source, binding, or test files were modified for
this disposition.

The Rust implementation and existing parity tests remain available at
`crates/umf-core/src/kinds.rs`, `crates/umf-core/tests/extension_kinds.rs`,
`tests/extension-kinds/composition.test.ts`, and
`tests/extension-kinds/browser-entry.ts`. Their evidence is not expanded by
this note and is not a new installed default-route qualification.
