# Saga diagnostic isolation — 2026-11-02

[CONTRACT-908](../../../02-design/contracts/CONTRACT-908-saga-semantics.md)
requires dedicated Saga structure and limit diagnostics. Exact-source
hosted run [41515038235](https://github.com/DocumentDrivenDX/umf/actions/runs/41515038235)
at `4bfb6d4eb14d92ef594a8b635e69b7c961cd7296` passed 17 of 19 portable vectors.
Malformed Saga payloads also poisoned valid Action selector binding through the
private Action-inspection registry. Both `missing-compensation` and
`over-32-steps` therefore emitted extra extension and Action errors.

The correction gives only this private registry an unconstrained Saga payload
schema. Its namespace, version and attachment scopes remain registered. The
original full schema is compiled and used by dedicated Saga inspection; the
original manifest remains the public registry profile, and generic public
validation continues to enforce the full schema. No diagnostics are filtered
from the result to manufacture parity.

The regression suite checks all 19 independent vectors before expensive SDK
packaging, complete code/path/severity inventories, public schema/profile custody,
wrong-scope rejection and source preservation. Existing independent mutation
controls remain. Cross-host input custody now includes the changed resource
constructor, so its exact bytes must agree across the qualified cohort.
The multi-operation authoring vector has a 60-second aggregate
harness budget; other vectors retain 30 seconds and product operation/cleanup
budgets are unchanged. The total hosted job permits the existing SDK, repaired
wheel and independent no-JavaScript source rebuild to finish within 90 minutes.

Qualification results and exact source/artifact/log hashes are recorded in the
accompanying receipt when complete. Local native results do not establish WASM,
Python wheel/source-rebuild or public release acceptance. Failed and timed-out
attempts remain distinct from passing evidence.
