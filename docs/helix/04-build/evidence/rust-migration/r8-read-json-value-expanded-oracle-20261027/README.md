---
ddx:
  id: umf.evidence.rust-migration.r8-read-json-value-expanded-oracle-20261027
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
    - id: umf.evidence.rust-migration.r8-read-json-value-raw-host-prototype
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-read-json-value-raw-host-probe
      kind: informed_by
---

# R8 expanded raw-host `readJsonValue` oracle

This frozen 22-case packet expands the earlier raw-host prototype cohort with explicit-JSON non-string coercion, throwing conversions, falsy primitives, stateful `length` reads, JSON/YAML lone-surrogate results, and exact/over-limit text at the 4,000,000 UTF-16-code-unit boundary. The raw result receipts are [Node](node.json) and [Bun](bun.json); the exact harness is [probe.mjs](probe.mjs). The harness compares the TypeScript `./reference` route, the current default Node route, and the compiled N-API raw-host prototype followed by the Rust engine. Return values are summarized and large strings are represented by UTF-16 length and SHA-256; each error retains name, code, path, message, and sentinel identity, along with observable traces.

The TypeScript reference and default route matched all 22 cases on Node 26.12.1 and Bun 1.4.3. The compiled N-API prototype differed on 16/22 Node cases and 18/22 Bun cases. Differences include skipped `Symbol.toPrimitive`/`toString`/`valueOf` coercion, a missing `toString` observation between the two stateful `length` reads, and early 100,000-unit refusal of exact-limit inputs with a different error envelope. The two routes preserved the tested lone-surrogate JSON string, JSON object key, and YAML scalar cases. Raw per-case outcomes and traces are in the receipts.

This run executed only the N-API prototype. It makes no WASM-bindgen, browser, installed-SDK, source-selection, TypeScript-retirement, or release claim. Node and Bun also produce different native null/undefined-source TypeError text; the receipts retain the exact engine messages.

## Captured inputs

`probe.mjs` records absolute paths used in the execution environment. The compiled prototype addon and the exact temporary Cargo crate inputs are retained alongside it: [N-API binary](umf_json_value_host_admission_prototype.node), [Cargo manifest](addon/Cargo.toml), [lockfile](addon/Cargo.lock), [build script](addon/build.rs), and [Rust source](addon/src/lib.rs). Runtime versions were Node v26.12.1 (V8 14.6.202.34-node.40), Bun 1.4.3 (Node compatibility version 26.3.0; V8 14.6.202.34-node.20), and Rust 1.90.0 (1159e78c4 2025-09-14). The N-API addon was built offline in release mode from a copy of the prototype crate using Rust 1.90.0.

| Input | SHA-256 |
| --- | --- |
| `src/model/serialization.ts` | `027360ffd8bf77905f7d14a3d4d933035fe11d9f52ae28d54691cc607cb43586` |
| `dist/umf.js` | `165c94d2986dc183091b73678d5c27f9439cea13901eb111a95eaddd5fb3febe` |
| `dist/umf-node.js` | `52d70ba45a3361857877f0f6b3ff61073b87c37e002f3ae1e1a7a67068267ef8` |
| `scripts/rust-migration/r8/read-json-value-raw-host-prototype/src/lib.rs` | `1f1841d92e6d5ac556d71a6a4969f9579ed34630b3a5a397f82e185bd0045a16` |
| Temporary harness `probe.mjs` | `f5d4a80526a8407fba672f068144efd5465a03c5c49e8f634646fedccfad09b1` |
| Node receipt | `82ccb013db8402488b80b5408b38afc43df4c9f973464fd968a3987d95e5dcee` |
| Bun receipt | `a23ac692f70f06229ab500d260ee4958847c232ee0661d980bf39ea1a3ca9371` |
| N-API addon | `ae5abbb24c196a651f50b352df852c996525fa0acf8babba960488f53e627e2f` |

The complete SHA-256 inventory for retained files is [SHA256SUMS](SHA256SUMS). Source pins above identify the compared inputs; they are not a transitive SDK source closure.
