---
ddx:
  id: umf.evidence.rust-migration.r8-selection-kind-runtime-delegation
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-selection-opaque-return-carrier
      kind: continues
    - id: umf.evidence.rust-migration.r8-selection-callback-trace
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Private caller `kindRuntime.validateDocument` delegation stage

This stage adds a private Rust-directed operation for the truthy
`registry.kindRuntime` branch in `validateDocument`. It preserves the
predecessor's separately observable `kindRuntime` condition and call reads,
the `validateDocument` and `registrations` getter order, both method
receivers, the original source and registration result identities, and the
validation result or thrown-value identity. Object/function results use the
invocation-local opaque return carrier described in the
[carrier evidence](../r8-selection-opaque-return-carrier/README.md).

This is a bounded delegation primitive toward a future Selection route. It
does not run static document validation, iterate arbitrary callback results,
support primitive return values, reproduce general resource accounting, alter
either V4 default root, or retire a default-route gap. A falsy runtime is
refused by this explicit private operation rather than routed through static
validation.

## Evidence

The focused Rust event-sequence test passes. It checks the two separate
`kindRuntime` reads, subsequent method and registration reads, receiver and
argument handles, call order, and opaque result carrier. The focused Bun
binding suite passes 20/20. A same-host TypeScript comparison in Node/Bun
checks the exact getter/call trace, source and registration identity, result
identity, thrown-value identity, and falsy-runtime refusal.

A fresh WASM build was executed in real Chromium 153.0.8010.12. The same-page
TypeScript comparison matched all six getter/call trace entries; the returned
object and thrown sentinel retained identity, and the falsy-runtime case was
refused with `HOST_JSON_UNSUPPORTED`. The [Chromium receipt](chromium.json)
pins 20 current source inputs, including the same-page TypeScript reference
bundle; Sol verified zero source drift after the fresh WASM run. It is private
binding evidence, not an installed-package or release receipt.

The object/function carrier remains limited to those result types. This
evidence does not establish arbitrary `kindRuntime` result parity, iterable or
diagnostic semantics, resource-accounting parity, installed package
qualification, V4 routing, or retirement of any default-route gap.
