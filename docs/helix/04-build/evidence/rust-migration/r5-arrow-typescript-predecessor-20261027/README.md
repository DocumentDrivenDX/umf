---
ddx:
  id: umf.evidence.rust-migration.r5-arrow-typescript-predecessor-20261027
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-016
      kind: informed_by
---

# Arrow schema-JSON TypeScript predecessor outcome freeze

[`typescript-arrow-schema-outcomes.json.gz`](typescript-arrow-schema-outcomes.json.gz)
is the compressed, frozen result of the current public TypeScript Arrow
schema-JSON adapter. Its gzip SHA-256 is
`f408879504a24999d06619182ccf8f9d0ffeeedf93f469003c6572b768bf7200`;
the decompressed JSON is 1,897,420 bytes with SHA-256
`db25d21945478a0802abef0f3af142d48d46da2c58e2ca55d3f14bc0ac54e629`.
The authored source corpus `fixtures/arrow/schema-cases.json` contains 52
cases and has SHA-256
`ecaf8ce3ece8fc449fdb7838d10509bddc651b43e3ff1097793f090c15709c3a`.
It was captured with Bun 1.4.3 by
[`freeze-arrow-typescript-outcomes.mjs`](../../../../../../scripts/rust-migration/r5/freeze-arrow-typescript-outcomes.mjs)
(SHA-256 `c82e870cd0df961e3df21073208d763130eec50e7bd066b5133ed8c0d2898884`)
using `bun scripts/rust-migration/r5/freeze-arrow-typescript-outcomes.mjs OUT_DIR`.

The packet captures successful import, inspection, export, node lookup and
nonmutating edit proposal for each of the 52 cases. It records complete
ordered validation diagnostics, exact JSON serialization bytes and hashes,
exact raw native export bytes, and unchanged input-document hashes across
read/edit operations. Seventeen focused cases cover future types, unknown
content, duplicate metadata, unsafe numeric tokens, malformed input, schema
and semantic refusals, pointer and edit behavior, unknown UMF representation,
and thrown Proxy object identity.

This is a predecessor freeze for the five schema-JSON operations only. It is
not a Rust, Node native binding, browser/WASM, Python, CLI, Apache Arrow, IPC,
array-data or release result. Native and PyArrow evidence stays in its
separate pinned packets. [`SHA256SUMS`](SHA256SUMS) pins the checked-in files.
