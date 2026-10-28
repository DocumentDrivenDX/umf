---
ddx:
  id: umf.evidence.rust-migration.r8-read-json-value-ordinary-20261027
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-011
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-read-json-value-production-interface-proposal-20261027
      kind: informed_by
---

# R8 ordinary-profile `readJsonValue` acceptance packet

This frozen packet has 59 raw-source cases for the ordinary `readJsonValue`
profile. The reference and default routes matched all 59 cases on Node
26.12.1 and Bun 1.4.3. The case factories, ordered host traces, direct
comparison logic and replay command are in
[`read-json-value-ordinary-packet.mjs`](../../../../../../scripts/rust-migration/r8/read-json-value-ordinary-packet.mjs).
Raw per-case receipts are [Node](node.json) and [Bun](bun.json).

The harness calls `./reference` and the host's current default route with
independently created sources. It directly compares return values in memory,
including prototypes, own-key order and property descriptors, then compares the
captured structural shape. Error comparison records `hasThrown` separately so
`throw undefined` is distinguishable from a return. Sentinel throws are checked
by identity; public errors compare their constructor name, code, path, exact
message and own-property shape. Engine-specific stack locations are retained in
the receipt and excluded from cross-bundle parity because they identify separate
generated call sites.

The packet covers YAML and explicit JSON primitives; truthy and falsy nonstrings;
`Symbol.toPrimitive`, `toString` and `valueOf`; throwing conversions; boxed and
callable strings; non-string format fallback; first and second `length` reads,
including getter, Proxy and sentinel failures; dynamic `JSON.parse` lookup and
receiver; UTF-16 text lengths 3,999,999 / 4,000,000 / 4,000,001; astral text at
the boundary; lone-surrogate values and keys; an isolated-surrogate error path;
null-prototype records with ordered own data properties including `__proto__`;
and arrays under a temporarily installed inherited index setter. The setter
defines an own data property, counts writes, and is restored in `finally`.

Large strings are generated deterministically by the case factories and are not
embedded in the receipts. Receipts record UTF-16 length and SHA-256; parity is
checked against the actual returned string before serialization, so the hash is
not used as the equality check. The complete source is evaluated separately
for each route to keep getter state and thrown sentinels independent.

The public `readJsonValue` signature exposes no cancellation, deadline or meter
controls. The packet records that boundary rather than inventing a control
interface. The `length-control-failure-outside-json-catch` case uses a unique
control sentinel thrown by the raw length getter and confirms identity escapes
unchanged. JSON coercion exceptions remain inside the reference's syntax-error
catch. This does not prove that host `JSON.parse` work is metered or interruptible.

Catalog JSON is out of scope and remains held on its TypeScript route. This is a
TypeScript reference/default baseline only: it does not exercise the Rust binding,
WASM, Chromium, installed SDK, source selection or release behavior. The
implementation proposal's broader production gates remain open.

The separate [dedicated-entry Rust replay](package-parity.md) tests 18
primitive-string cases against this reference in Node and Bun. The rebuilt
release addon matches 17 cases in each host; inherited array-index setter call
count remains different. This replay is an opt-in binding spike, not a public
package export or a default-route qualification.

## Replay

From the repository root, run:

```sh
node scripts/rust-migration/r8/read-json-value-ordinary-packet.mjs
bun scripts/rust-migration/r8/read-json-value-ordinary-packet.mjs
```

Each run prints its receipt as JSON and exits nonzero if any reference/default
case differs. Runtime and source pins are in [SHA256SUMS](SHA256SUMS). The
Node receipt records Node v26.12.1 / V8 14.6.202.34-node.40. The Bun receipt
records Bun 1.4.3 / Node compatibility 26.3.0 / V8 14.6.202.34-node.20.
