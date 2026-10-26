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

## Consumer-stage boundary decision

The next predecessor behavior is owned by `selectCoreElements`, not by
`validateDocument`: Selection reads `sourceValidation.valid`; if falsy, it
reads and stringifies `sourceValidation.diagnostics` while constructing the
refusal; if truthy, the returned validation object is retained in the
Selection candidate and reached by the final `copyJson`. Therefore draining or
materializing a returned diagnostic iterable in this continuation would move
observable getter, iterator, and serialization effects ahead of the
predecessor's `.valid` decision. The callback result must remain an opaque
identity-bearing handle until the consumer stage chooses the applicable path.

The private Selection route now carries this boundary through the `.valid`
decision only. After it copies source and query and accepts the query, it
checks the caller runtime, invokes `validateDocument` with the copied
null-prototype source and registrations result, then reads `result.valid` at
the Selection branch. A true result stops before successful
`sourceValidation` materialization; a false result stops before reading or
stringifying diagnostics. A throwing `.valid` getter propagates the original
thrown value. The no-runtime branch continues through the existing Rust-owned
validation path. No public V4 route changes.

The focused Rust branch test passes. The Bun 1.4.3 Node-addon suite passes
24 tests and 215 assertions, including exact TypeScript observable-prefix
comparison and `.valid` thrown-value identity. The same-host Node 26.12.1
runner reports the same five-event prefix through `validation.valid:get` and
preserves a thrown getter value. The real-browser replay passed in Chromium
153.0.8010.12. The runner writes its raw branch outcome to
`/private/tmp/umf-selection-kind-runtime-branch-browser-debug.json` before
assertions so a mismatch remains diagnosable.

The focused result receipts are [Node/Bun](selection-validity-node.json) and
[Chromium 153](selection-validity-chromium.json). Both pin the Rust Selection
sources and runner inputs. Chromium records prefix parity through `.valid`; its
expected TypeScript call proceeds to final copy and raises `NON_JSON` for the
non-enumerable accessor, while the scoped Rust route returns
`HOST_JSON_UNSUPPORTED` at the deliberate boundary.

The consumer-stage resource boundary is also explicit: core `Context` can
charge host reflection events, copied primitive text, and bounded traversal,
but cannot meter arbitrary user code run by result getters, iterators,
`toJSON`, or `JSON.stringify`. A consumer-stage slice must preserve the
predecessor's order and thrown-value identity, and fail closed when the bridge
cannot reproduce the host's native protocol outcome; it must not claim total
resource equivalence. Static validation is a separate branch and is not a
substitute for this `kindRuntime` continuation. Arbitrary diagnostics
iteration, refusal formatting, and successful callback-result copying remain
unimplemented; this is not full Selection parity or installed-package
qualification.
