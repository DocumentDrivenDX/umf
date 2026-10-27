---
ddx:
  id: umf.evidence.rust-migration.r8-read-json-value-inherited-setter-source-oracle-20261027
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
    - id: CONTRACT-002
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-read-json-value-ordinary-20261027
      kind: informed_by
---

# Inherited array-index setter source oracle

This packet records source-only Node and Bun behavior when an inherited setter
is installed at `Array.prototype[0]` during TypeScript `readJsonValue` calls.
The setter logs its invocation count and a portable parser-phase label, then
defines an own index-0 property to preserve the normal array write. Separate
cases exercise two other receiver mutations, one-shot and always-throw
sentinels, and `throw undefined`. Each route invocation restores the original
prototype descriptor in `finally`.

The 20-input shape matrix covers YAML scalars and empty documents, empty,
single, nested, and block sequences, block and flow mappings, and JSON
primitive/collection forms. Its recorded baseline counts include 2 calls for
non-empty YAML scalars, 1 for an empty document, 3 for an empty flow sequence,
5 for a one- or two-item flow sequence, 11 for nested flow sequences, 3 for a
two-item block sequence, 4 for a two-pair block mapping, 7 for a two-pair flow
mapping, 14 for a nested flow mapping, and 9 for a JSON mapping containing a
two-item array. The traces retain ordered phase labels: parser line-start,
stream, flow collection, block-map/block-sequence resolution, flow-collection
resolution, and the collection error-record callback when a resolver-time
setter throw is caught. Node and Bun agree on call counts, portable phase
labels, outcome categories, identity flags, and UMF error metadata. Receipts
also preserve exact runtime messages; native TypeError wording differs between
Node and Bun for the deliberately disruptive no-own-index setter mutation.

One-shot throws at parser phases escape with sentinel identity. A throw from
flow collection resolution is caught and converted to the public `SYNTAX`
diagnostic, then the error-record callback occurs. If that callback also
throws, the sentinel escapes. `throw undefined` is distinguished by an
explicit identity flag and follows the same catch boundary. Omitting the own
index changes parser behavior and is recorded as an observed outcome; it is
not used as a Rust emulation strategy.

This packet compares the TypeScript model reference entry with the TypeScript
V4 default entry only. It does not qualify Rust, WASM, browsers, packaged SDKs,
or release behavior. Parser phase labels normalize stack function names and
omit runtime-specific paths and line numbers. The effects are observable
parser-internal behavior; reproducing them causally would require host callbacks
at equivalent parser write phases, not post-parse synthetic setter calls.

## Replay

From the repository root:

```sh
node scripts/rust-migration/r8/read-json-value-inherited-setter-packet.mjs > docs/helix/04-build/evidence/rust-migration/r8-read-json-value-inherited-setter-source-oracle-20261027/node.json
bun scripts/rust-migration/r8/read-json-value-inherited-setter-packet.mjs > docs/helix/04-build/evidence/rust-migration/r8-read-json-value-inherited-setter-source-oracle-20261027/bun.json
```

The runner builds temporary ESM bundles for the reference and default
entrypoints with Bun and removes the temporary directory after replay. Each
receipt pins the runner, TypeScript entrypoints, parser package sources, and
lockfile. `SHA256SUMS` pins the runner, evidence description, and saved
receipts. Re-run after a source-pin change; old receipts then describe only
their pinned source state.
