---
ddx:
  id: umf.evidence.rust-migration.r8-core-inspector-consumer-boundary
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-core-inspectors-installed
      kind: informed_by
---

# Raw-profile Inspector consumer boundary

The default Node and browser V4 entrypoints now create `inspectRawTableBinding`
with their bound Rust `inspectCoreRecordMembers` operation. The shared
`raw-profiles-inspector.ts` factory takes that operation explicitly; the
`raw-profiles.ts` reference entry still instantiates it with the TypeScript
inspector. The V4 named export selects the injected route. The rest of the
raw-profile validation remains TypeScript, and the full V4 bundle retains a
shadowed TypeScript Inspector implementation through broad `src/index.ts`
exports. This change does not retire the Inspector or raw-profile ledger gap.

The focused Bun suite passes 11 tests and 82 assertions: unchanged reference
profiles, callback delegation and error identity, V4 Node/reference equality
for known, partial, validation-error, and accessor-refusal inputs. Typecheck
passes. The existing reference-only Chromium harness still passes its 12
declarative-profile cases. The real Chromium 153.0.8010.12 V4 harness passes nine browser cases
across the three declarative profiles, requests one WASM asset, and observes
no Node globals. It confirms that the isolated injected factory bundle lacks
the TypeScript Record Members inspector marker; the full V4 bundle still
contains that shadowed implementation. The browser harness runs with:

```sh
UMF_WASM_PKG=/private/tmp/umf-raw-profiles-wasm \
  bun scripts/binding/raw-profiles-rust-browser.ts
```

The browser run used wasm-bindgen 0.2.100 glue generated from a reused target
WASM (`target/wasm32-unknown-unknown/release/umf_core_wasm.wasm`, SHA-256
`3f8efcb6d8468bfc017492c7ee9d3f19d0ea60a909921ab901abc1f48a0cc21b`).
The generated `umf_core_wasm_bg.wasm` SHA-256 is
`03cae3bc96ba02e13a47f6a0c304432187505b64e52a5214ee141e145aefc79e`.
This run did not freshly compile the target WASM. The current helper source
still needs a fixed-point installed SDK build and Node/Bun/Chromium replay
before any installed-route qualification or retirement decision.
