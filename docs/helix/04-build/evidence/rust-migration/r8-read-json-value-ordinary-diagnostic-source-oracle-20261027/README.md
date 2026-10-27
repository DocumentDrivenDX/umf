---
ddx:
  id: umf.evidence.rust-migration.r8-read-json-value-ordinary-diagnostic-source-oracle-20261027
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
    - id: umf.evidence.rust-migration.r8-read-json-value-ordinary-20261027
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-read-json-value-production-interface-proposal-20261027
      kind: informed_by
---

# Ordinary JSON parser diagnostic source oracle

This 40-case packet records current TypeScript behavior when ordinary
`readJsonValue(source, 'json')` runs with a permissive live `JSON.parse`
override. The getter returns a function that accepts every input, so malformed
JSON reaches the YAML 1.2 parser and exposes its exact public `UmfError`
diagnostics. The packet builds separate TypeScript source bundles for the
reference and public V4 default entrypoint, then compares them in Node and Bun.

Both runtimes matched all 40 cases. Nineteen cases throw `UmfError` with
`SYNTAX`, the empty root path, and exact parser-generated messages; 21 cases
return values because the YAML parser accepts forms that JSON rejects, such as
comments, trailing commas, some flow-map omissions, and truncated numeric or
literal tokens. Receipts retain the returned value shape and exact thrown
`code`, `path`, `message`, class check, and parser event trace.

The matrix covers flow maps and sequences, nested and truncated collections,
comments, single/double quotes and escapes, multiline and CRLF inputs, Unicode
keys and astral text, plus truncated exponent/literal and leading-zero tokens.
Each case captures the `JSON.parse` property getter and call, receiver identity,
argument type and exact string. The accessor is restored in `finally` after each
route invocation. Stack locations are omitted; public parser message text,
including source snippets, caret locations and composed multiple diagnostics,
is preserved exactly.

This is a TypeScript reference/default source baseline only. Both bundles use
the same TypeScript parser implementation. The override deliberately changes
the ordinary JSON path and does not qualify the normal native `JSON.parse`
preflight, Rust diagnostics, WASM, Chromium, installed SDK, or release behavior.
The 21 returned cases are useful evidence that a future Rust implementation
must preserve the predecessor's YAML fallback result as well as its errors.

## Replay

From the repository root, run:

```sh
node scripts/rust-migration/r8/read-json-value-ordinary-diagnostic-packet.mjs > docs/helix/04-build/evidence/rust-migration/r8-read-json-value-ordinary-diagnostic-source-oracle-20261027/node.json
bun scripts/rust-migration/r8/read-json-value-ordinary-diagnostic-packet.mjs > docs/helix/04-build/evidence/rust-migration/r8-read-json-value-ordinary-diagnostic-source-oracle-20261027/bun.json
```

The runner creates and removes temporary ESM bundles with Bun. Receipts pin the
relevant parser source, entrypoints, and harness. [`SHA256SUMS`](SHA256SUMS)
also pins the runner and saved Node/Bun receipts. Re-run after any source-pin
change; saved outcomes do not establish current-source behavior once a pin
changes.
