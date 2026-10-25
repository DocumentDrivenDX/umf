---
ddx:
  id: umf.evidence.rust-migration.r7-retained-codegen-handle.sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r7-retained-codegen-handle
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-079
      kind: informed_by
    - id: CONTRACT-080
      kind: informed_by
---

# Independent Sol review: retained codegen handle

Sol reviewed the opt-in `CodegenResourcesHandle` construction and invocation
boundary. It retains compiled resources only; setup and each invocation use
separate `Context` and host-control callbacks. The Node and WASM façades expose
the same declared convenience methods as the stateless codegen factory, and
both dispose idempotently and reject use after disposal. Sol found two missing
convenience methods and a misleading test-fixture import closure during review;
both were fixed before this acceptance.

Sol independently reran the Rust core-wire context suite (2/2), the complete
native Node host-admission suite (10/10), the reproducible generated Node-target
WASM replay, and the real Chromium browser-target WASM replay. The latter two
matched frozen `generatePythonClient`, `generateAccessPackage`, and
`diffAccessPackages` outputs, then refused later meter, cancellation and
deadline probes and use after disposal. The Chromium receipt reports WASM
SHA-256 `7d524dd8da6777a943c491f5d3de194807ae45b6946860f0d719f9772283fb80`;
the Node-target replay pinned WASM SHA-256
`5be893fc734f6408fa2d206fc5ba9203e8b06e7705892615d207e3e88f3aaa97`.
The source and fixture hashes and exact reproduction commands are in
[README.md](README.md).

This accepts an opt-in retained handle for the captured source and generated
WASM artifacts. It does not change the default stateless factory, demonstrate
a default-route speedup, qualify the installed SDK archive, or close the R8
retirement and release gates. The stateless wire refactor now charges resource
setup and invocation cumulatively in one request context; low-budget refusals
are an intentional security behavior correction and need current installed
regression evidence before any broad default claim.

Sol independently reran the subsequent default-promotion differential in both
Node-target WASM and real Chromium. The same frozen request charged 236,886
work units at stateless setup and 952,618,338 per stateless call, versus
937,053,874 at retained setup and 15,801,452 per retained call. With a shared
484,209,895-unit threshold, stateless calls refused meter, cancellation,
deadline and `maxWork` while the retained call succeeded. Invalid resources
also move refusal from first invocation to constructor. These are observable
changes despite matching successful outputs and isolated copies. Sol rejects a
transparent default-factory promotion; the retained handle stays opt-in unless
a separately versioned behavior and control contract is approved and tested.
