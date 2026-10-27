---
ddx:
  id: umf.evidence.rust-migration.r8-read-json-value-improved-raw-host-20261027
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
    - id: umf.evidence.rust-migration.r8-read-json-value-expanded-oracle-20261027
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-read-json-value-raw-host-prototype
      kind: informed_by
---

# R8 improved raw-host `readJsonValue` N-API prototype

This temporary N-API spike improves on the [expanded 22-case oracle](../r8-read-json-value-expanded-oracle-20261027/README.md). It executes the Rust core `read_typescript_json_value` parser for string sources and uses narrow host callbacks for the raw JavaScript operations: the first `text.length > 4_000_000`, explicit-JSON `JSON.parse(text)` inside the predecessor's syntax catch, and the parser's second `text.length` read. Rust returns structured error outcomes that the harness maps to public `UmfError` and parser-admission `TypeError` classes; exceptions thrown by the host callbacks propagate through N-API. Rust reconstructs values with `napi_create_string_utf16` and uses host `Object.create(null)` for object results.

The exact 22-case matrix passes in Node 26.12.1 and Bun 1.4.3: reference/default routes have zero mismatches, and the improved prototype has zero mismatches in each runtime. Receipts preserve per-case return/error class, code, path, message, sentinel identity, UTF-16 hashes, and traces: [Node](node.json) and [Bun](bun.json). The cases include coercible and throwing explicit-JSON source objects, falsy primitives, stateful `length`, lone-surrogate JSON/YAML values and keys, and exact/over-limit 4,000,000-unit text, including astral content.

This result is limited to the tested N-API matrix. General YAML and truthy non-string inputs, broader parser diagnostic parity, deep/value-count bounds, cancellation, deadlines, meter failures, production facade integration, and installed SDK behavior remain open. No WASM or browser run was performed; no default route was selected.

## Retained inputs and source hashes

The exact [harness](probe-improved.mjs), [Cargo crate](addon/Cargo.toml), [lockfile](addon/Cargo.lock), [build script](addon/build.rs), [Rust addon source](addon/src/lib.rs), and [compiled addon](umf_json_value_raw_host_improved_prototype.node) are retained. The experiment was built offline in release mode with Rust 1.90.0 (`1159e78c4 2025-09-14`); its Cargo path dependency reads the worktree's `crates/umf-core` source without editing it.

| Input | SHA-256 |
| --- | --- |
| Improved N-API `addon/src/lib.rs` | `0d81b0c8d87b23c5ba4f3d6c99404b137697521f6985d9710f28e0e2ff47818f` |
| Harness `probe-improved.mjs` | `a29e7a68424d9af41f3117c33ef5d5bf7c3047e0e665ca9a7a826a53ad3f652a` |
| Node receipt | `245b7ab50a5c4d0b7fa01d4ef7d0ba2160c98f95b22a5c509619351fcc5278e5` |
| Bun receipt | `588b399a647aa8227457698ddab5704298b513a1cbeace5cadb1e957b9fc1a12` |
| Compiled addon | `174f2b2022c8afbdcb0adebc990250d1b55a907573e8c817e8a0134c3bde7ffd` |
| `src/model/serialization.ts` | `027360ffd8bf77905f7d14a3d4d933035fe11d9f52ae28d54691cc607cb43586` |
| `dist/umf.js` | `165c94d2986dc183091b73678d5c27f9439cea13901eb111a95eaddd5fb3febe` |
| `dist/umf-node.js` | `52d70ba45a3361857877f0f6b3ff61073b87c37e002f3ae1e1a7a67068267ef8` |
| `crates/umf-core/src/serialization.rs` | `6dcb0ec4fb47e0aa6d5cb545b0cd925b9a1b23838a3782f435386af5a497c392` |
| `crates/umf-core/src/context.rs` | `293a58a1efd6cd006014203363f5b856a0a017116f09567da4076454feb2ac2d` |

[`SHA256SUMS`](SHA256SUMS) pins all retained local source, harness, receipt, build input, and binary files. External worktree sources are pinned by the hashes above; this is not an installed-SDK source closure.
