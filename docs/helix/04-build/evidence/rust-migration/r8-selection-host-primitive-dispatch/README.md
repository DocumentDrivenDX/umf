---
ddx:
  id: umf.evidence.rust-migration.r8-selection-host-primitive-dispatch
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-selection-reference-host-baseline
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-selection-provider-implementation-prep
      kind: informed_by
---

# Selection host diagnostic primitives

The fake-addon probe exercises the private opaque callback, iterator,
diagnostic, Error-carrier, and native spread-failure host events without
enabling a Selection production route. Run it under Node for the Node adapter,
and under Bun for the Bun runtime plus a browser build evaluated in real
Chromium:

```sh
node scripts/rust-migration/r8/selection-host-primitive-dispatch.mjs
bun scripts/rust-migration/r8/selection-host-primitive-dispatch.mjs
```

The full 20-assertion matrix passes on Node 26.12.1, Bun 1.4.3, and Chromium
153.0.8010.12. Complete rerun receipts are in `node-full.json` and
`bun-chromium-full.json`; the earlier five-diagnostic-assertion receipts remain
in `node.json`, `bun.json`, and `chromium.json`. All three hosts assert:

- mixed static and opaque diagnostics retain their order and members;
- the host consults the live `JSON.stringify`, with `JSON` as receiver, and
  preserves a non-string return through native Error construction;
- inherited `Object.prototype.toJSON` sees the ordinary diagnostics array and
  its static and callback entries;
- callback getter throws retain identity; and
- `ConstructErrorCarrier` does not read an inherited `Error.prototype.message`
  getter. A later ordinary property read uses the carrier as receiver and
  retains the getter's thrown identity;
- native spread failures for `undefined`, `null`, and an already-read
  non-callable iterator method match the same host's TypeScript reference text,
  and the iterator getter is read once.

This is host-primitive evidence only. Rust stage integration, final `UmfError`
construction/exposure, Selection wiring, and metering of native stringify
property work remain unverified.
