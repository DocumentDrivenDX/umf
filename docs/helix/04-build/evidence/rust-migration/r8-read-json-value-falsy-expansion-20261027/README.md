---
ddx:
  id: umf.evidence.rust-migration.r8-read-json-value-falsy-expansion-20261027
  type: evidence
  activity: build
  status: complete
  authoring:
    home: repo
  links:
    - umf.plan.rust-migration
    - ADR-006
    - TP-001
    - CONTRACT-001
    - CONTRACT-011
    - umf.evidence.rust-migration.r8-read-json-value-improved-raw-host-20261027
---

# R8 `readJsonValue` falsy-input expansion

This supplemental packet preserves the earlier 22-case receipt and adds 17 coercion cases, for 39 total. The matrix includes empty string, `0`, `-0`, `NaN`, `0n`, `false`, `null`, `undefined`, `Symbol`, and truthy numeric/boolean/BigInt values across YAML and explicit JSON where applicable. Receipts capture result or error class/code/path/message and observable trace; large text outputs are represented by bounded summaries/hashes.

The TypeScript reference/default and the temporary improved raw-host N-API candidate match in all 39 cases under Node v26.12.1 (V8 14.6.202.34-node.40) and Bun 1.4.3 (Node compatibility v26.3.0, V8 14.6.202.34-node.20). The candidate uses a host `Boolean(source)` callback to preserve falsy non-string input behavior. This is a scoped host-runtime result only; it makes no WASM or browser claim and does not select a default route.

## Reproduction and integrity

`probe-falsy-expansion.mjs` runs the matrix against the TypeScript reference/default and the temporary `.node` addon. `node-falsy-expansion.json` and `bun-falsy-expansion.json` are raw receipts. The addon source and build inputs are under `addon/`; the compiled addon is included for exact replay. `SHA256SUMS` binds each file in this packet. The addon source is a temporary spike artifact, not production source.

## Remaining gates

The Sol review identified unresolved fidelity and scope gates: isolated-surrogate error-path information can be lost through `to_utf8().unwrap_or_default()`; JSON-hash comparison does not validate output object shape or prototypes; exception identity for thrown `length`/coercion values is untested; host JSON preflight is not metered through the shared Context ledger; and the transitive source closure is partial. General input coverage, Context controls, production facade integration, installed SDK qualification, and actual WASM/browser behavior remain open.
