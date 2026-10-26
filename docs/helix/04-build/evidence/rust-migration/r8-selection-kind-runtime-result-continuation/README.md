---
ddx:
  id: umf.evidence.rust-migration.r8-selection-kind-runtime-result-continuation
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-selection-kind-runtime-delegation
      kind: continues
    - id: CONTRACT-001
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Private Selection `kindRuntime` result continuation

This stage continues the private `Registry.kindRuntime.validateDocument`
delegation through its return boundary without reading result properties. It
returns JSON primitives as values, preserves `undefined` with a private marker,
and preserves symbol, bigint, object, and function results through the
invocation-local handle table. Number results use IEEE-754 bit carriers so
negative zero, NaN, and infinities do not pass through the core JSON-number
profile. Strings are read only when their declared UTF-16 length fits the
ordinary 4,000,000-unit host-return bound. The existing opaque-object probe
remains fail-closed for non-carrier results.

The same-host packet compares `undefined`, `null`, boolean, negative zero, NaN,
both infinities, string, object, function, symbol, and bigint results. It verifies `Object.is`
value parity, object identity, exact getter/call traces, thrown callback-value
identity, the two dynamic `kindRuntime` reads, method receivers, original input,
and registration result identity. A null second `kindRuntime` read throws a
`TypeError` in both paths with the same property-access trace; the host-generated
message wording differs from the TypeScript expression's wording. A throwing
second-runtime `validateDocument` getter retains its error class and message.

## Evidence and limits

Five focused Rust tests pass, including special-number carrier bits, symbol and
bigint identity handles, unchanged opaque-probe primitive refusal, malformed
reply refusal, and the delegation event order. The focused Bun binding suite
passes 22 tests with 199 assertions against a freshly built Node addon. The
same-host Node 26.12.1 replay and exact source/addon pins are recorded in
`node.json`. A fresh WASM build in Chromium 153 passed all 12 result cases and
both dynamic second-read cases. The [browser receipt](chromium.json) records
those outcomes and 20 source pins with zero drift after capture. The null
second-read TypeError text matched in Chromium but differs in Node; the common
claim is the error class and access trace.

This remains a private callback result boundary. It does not run static
validation, iterate arbitrary returned diagnostics, materialize arbitrary
objects, qualify string-limit accounting beyond the stated bound, or qualify
installed packages. It does not change either V4 default root or retire any
default-route gap. Generated native TypeError wording for the null second-read
case remains an explicit host-runtime difference.
