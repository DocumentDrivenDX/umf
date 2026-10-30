---
ddx:
  id: umf.saga-usage
  type: guide
  activity: deploy
  status: draft
  links:
    - {id: CONTRACT-908, kind: references}
    - {id: TD-906, kind: informed_by}
    - {id: umf.saga-implementation-plan, kind: references}
---

# Author and assess sagas

Sagas are an explicit opt-in companion to actions in the UMF repository and SDK.
The sequential declaration vocabulary is `umf.actions.saga` 0.1.0, with core
0.10.0 and actions 0.1.0. The SDK candidate is 0.10.0; the Python candidate is
`umf-core` 0.10.4. Release publication is tracked separately in the implementation
plan. Do not replace an older published wheel with new bytes under its old version.

The shared Rust engine implements `inspectSagas`, `declareSaga`, `editSaga` and
`assessSaga`. It is available through the native binding, native CLI wire
operations, browser WASM and Python `SagaRuntime`. Use `createSagaResources()`
with the JavaScript codegen engine, or use the integrity-checked resources bundled
by Python:

```python
from umf import SagaRuntime

runtime = SagaRuntime()
inspection = runtime.inspect_sagas(document)
identity = {"module": "equipment", "saga": "reserve-allocate"}
assessment = runtime.assess_saga(document, identity, capabilities)
assert assessment["executionVerified"] is False
```

Inspection preserves the source and reports exact action identities, mappings,
compensation dispositions and unchecked obligations. Every forward and action
compensation has its own original-invocation-finality obligation. Capability
claims must cover the exact source, identity and obligations. Supplied support
claims can establish declaration compatibility; they cannot establish that an
executor ran, that compensation succeeded or that distributed atomicity exists.
Unknown meanings remain explicit and block unsafe dependent edits.

The public JavaScript facade requires a fresh `Registry` constructed with the
shared native/WASM core engine, followed by `registerSagas(registry, codegen)`.
It checks the exact bundled action/saga profile and refuses later registry
mutation. Arbitrary application semantic callbacks do not become shared-engine
saga support. Initialize browser WASM from the SDK's `runtime/wasm` export using
explicit resources before calling portable operations.

The first profile permits sequential steps, earlier original-output dependencies,
and one explicitly declared compensation disposition per step. It does not infer
an inverse action, retry a failed business operation automatically, execute an
action, load artifact-supplied code or fetch remote declarations. See the
[allocation example](../02-design/examples/saga/allocation.json) for declaration
shape and the [contract](../02-design/contracts/CONTRACT-908-saga-semantics.md)
for exact finite limits and diagnostics.

A consuming runtime owns credentials, authorization, leases, immutable original
results, retained control responses and whole-invocation finality. The PostgreSQL
reference coordinator under `scripts/saga-reference` is a qualification consumer,
not a production service or a portable SDK execution API. Its native observations
must be qualified separately from portable inspection and the bounded TLA+ model.
