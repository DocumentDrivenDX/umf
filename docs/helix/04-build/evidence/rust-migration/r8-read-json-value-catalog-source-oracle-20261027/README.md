---
ddx:
  id: umf.evidence.rust-migration.r8-read-json-value-catalog-source-oracle-20261027
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
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-011
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-read-json-value-ordinary-20261027
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-read-json-value-production-interface-proposal-20261027
      kind: informed_by
---

# Catalog-profile `readJsonValue` TypeScript oracle

This 15-case packet freezes current TypeScript source behavior for the catalog
JSON profile on Node 26.12.1 and Bun 1.4.3. It independently bundles the direct
serialization implementation as the reference and the public V4 default
entrypoint as the default route, then invokes both inside the synchronous
`withCatalogResourceProfile` scope. The result is source-only oracle evidence;
it makes no Rust, WASM, Chromium, installed SDK, or release claim.

The runner compares returned values directly in memory and records prototypes,
ordered own keys, descriptors, and recursive shapes. For thrown outcomes it
records thrown-versus-return state, constructor/name, code, path, message,
own-property shape, and sentinel identity. It also compares ordered raw-host
traces. Stack and generated source-location fields are retained in receipts but
excluded from equality because the two TypeScript source bundles have distinct
generated locations.

Cases cover ordinary catalog JSON, ordering, escaped text, duplicate members,
unsafe numbers and trailing whitespace; a raw Proxy with indexed, length and
slice operations; stateful length, indexed and slice reads; throws from the
length/index/slice operations; and dynamic `JSON.parse` getter/call lookup and
receiver behavior. Raw object sources intentionally exercise runtime behavior
beyond the public primitive-string TypeScript signature because that host
boundary is relevant to the future binding design.

The TypeScript reference and public V4 default entrypoint matched all 15 cases
in each recorded runtime. This comparison does not establish independent
implementation parity: both bundles are built from the same TypeScript
serialization source. It establishes a reproducible source baseline for the
separate catalog binding design. The packet also does not prove resource bounds
for the host's own dynamic `JSON.parse` execution.

## Replay

From the repository root, run:

```sh
node scripts/rust-migration/r8/read-json-value-catalog-packet.mjs > docs/helix/04-build/evidence/rust-migration/r8-read-json-value-catalog-source-oracle-20261027/node.json
bun scripts/rust-migration/r8/read-json-value-catalog-packet.mjs > docs/helix/04-build/evidence/rust-migration/r8-read-json-value-catalog-source-oracle-20261027/bun.json
```

The runner builds two independent temporary ESM bundles from current source
with Bun, invokes the bundles in the selected host, and removes the temporary
directory. The receipts include runtime details and SHA-256 pins for the
serialization/scanner/profile sources and harness inputs. Re-run after any
pinned source changes; the saved receipts are not current-source evidence after
their pins change.

[`SHA256SUMS`](SHA256SUMS) pins the two entry bundles' source files, runner,
and saved receipts.
