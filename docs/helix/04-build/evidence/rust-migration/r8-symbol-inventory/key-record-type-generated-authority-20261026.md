---
ddx:
  id: umf.evidence.rust-migration.r8-symbol-inventory.key-record-type-generated-authority-20261026
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-080
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory.versioned-core-operation-resource-authority
      kind: continues
---

# Key and Record Type operation resource authority

CONTRACT-080 vocabulary 1.3.0 adds Key v2 and Record Type v6 to the closed
`umf.metamodel.resources` declaration sequence. The Rust metamodel compiler
accepts only their exact output paths, IDs, titles, external resource IDs and
fixed serializer profiles. It resolves a resource link only to a listed output
ID or a declared `$defs` member of that output. Record Type's two links to
Kind v6 use `#/$defs/declaration`; arbitrary paths, external IDs and fragments
reject. The compiler does not accept raw JSON Schema in these declarations.

The newly generated files retain the previous exact bytes:

| Output | SHA-256 |
| --- | --- |
| `spec/core/key-operation-v2.schema.json` | `67c35f417d940d9d3ff8c4fe7ca57ea29d319a1da4310ea3f9d2437160e9095b` |
| `spec/core/record-type-operation-v6.schema.json` | `2b40d2be0562794f918738d96ee8f974f7133f26ee8476583b944c9f676a255d` |

The compiler emits Key's object, array and root keywords in a fixed binding
order and omits an empty `$defs` for Record Type. The manifest binds these
outputs to the metamodel and compiler source. This establishes authority for
the current bytes from this amendment forward; it does not reconstruct the
historical edits that produced them.

On macOS arm64, the pinned Rust 1.90.0 offline metamodel suite passes 25 unit
tests and 5 integration tests. The integration suite pins all six operation
resources to frozen bytes and hashes, checks reversed declaration order, and
rejects unauthorized paths, external IDs, and `$defs` fragments. Canonical
generation and `--check` reached a fixed point after the Selection Rust source
cohort and removal of the generated Cardinality v4 schema from the compiler
input closure. The clean-source test regenerates Cardinality v4 without
seeding that output; the metamodel and self-model suite passes 71 tests. The
generated manifest SHA-256 is
`713eed1628281265708d17ff45d92daf7cbb32963aa10edcf3de844716434936`.
The nine-resource Python action-runtime manifest was refreshed to the current
canonical bytes (SHA-256
`d2f2a70fa2a64fe82fbf5930c6d3f7eb045aa38168f201440641f6f9f40b90d4`);
its focused suite passes 34 tests with an installed editable `umf-core`
workspace. The installed SDK archive must still be recaptured after the
complete source cohort freezes. This receipt does not qualify installed SDK
bytes or change any executable retirement gap.
