---
ddx:
  id: umf.evidence.rust-migration.r8-cardinality-resource-source-closure
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
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory.resource-authority-closure-decision
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory.operation-resource-root-interface-decision
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-cardinality-final-installed
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-full-sdk-b991bc20
      kind: informed_by
---

# R8 Core Cardinality resource/source closure — commit 1453af78

This packet closes a bounded resource-provenance chain for the three Core
Cardinality operations at commit `1453af78d3da71693b551a31609a126190591407`.
The checked-in metamodel output manifest, its complete listed input set, the
Cardinality implementation and binding inputs, and the installed SDK archive
all agree on the exact v4/v6 operation-schema bytes and five shared Core model
resources. The machine-readable [resource map](resource-source-map.json)
records the paths, SHA-256 values, provenance class, consumers, and checks.

The operation schemas have distinct provenance. `cardinality-operation-v4`
is a generated output declared in `spec/metamodel/umf.yaml`; Rust metamodel
compilation produces the exact current file hash recorded by the generated
manifest. `cardinality-operation-v6` is an authored versioned schema, not a
metamodel output. The manifest lists its source hash as an external compile
resource, `cardinality.rs` embeds it with `include_str!`, and the current
resource ledger classifies it as `authored-authority-known`. Both schemas name
`urn:umf:core:0.10.0` as their external resource, resolved by the shared Core
schema resource.

The shared engine input is exactly the five resources imported and frozen by
`src/access/core-model-resources.ts`: the Core schema, semantic-type reference
schema, extension-package schema, generated Core constraints, and generated
domain policy. The generated output manifest records each output hash and the
same model/compiler provenance. The Node and browser V4 roots pass this fixed
set into the Rust Core Cardinality engine. All seven resource members in the
private SDK archive have byte hashes equal to the checked-in files and generated
manifest.

The current source manifest contains 566 source entries and pins a model SHA of
`35b72a7f6aa86c98398192e5b67d5841d77127743c671c742dd871a7baee58ca` and
compiler-closure SHA of
`c15fd08421d15cb91dd3ead44a45ac11479130eff4d45b503d66cc7494e355a1`. The
separate SDK build records 3,549 source inputs and a zero-transform fixed point:
source and captured-live closure are both
`b991bc20731f42efd3a73aebd922f8cea7c6927346a63e197e467cf9f1eb028f`. The
private archive SHA is
`b6288048969bc163255064fe7c391fd8043b6e3bcfb6e4b0817e24aa65c62dc6`; its
manifest SHA is
`e8e1e781298577dcb169160a1881253fb81c8b08bbc31372c5a3632cfeecf718`.
An independent comparison of the archive's 3,549 captured-live input hashes
against every corresponding blob in the pinned Git commit found zero
mismatches. This binds the private archive closure to the named commit's source
contents, despite the archive manifest not carrying a Git commit field.
See the [Core Cardinality installed receipt](../r8-cardinality-final-installed/installed-cardinality-receipt.json)
and the [full installed SDK packet](../r8-full-sdk-b991bc20/README.md).

`UMF_METAMODEL_CACHE_DIR=/private/tmp/umf-cardinality-authority-cache bun
scripts/metamodel/build.ts --check` passed and reported current outputs. Direct
SHA-256 checks of all seven archive members matched both checked-in bytes and
the archived generated manifest. The installed SDK packet independently records
verification of all 1,806 payload member hashes and passes its bounded Node,
Bun, and Chromium replay.

This is resource/source provenance for the frozen source and installed archive.
It does not retire ledger rows or establish complete semantic acceptance. The
three Cardinality logical names remain open. Linux x64 archive/install parity,
the full CONTRACT-040 authoring and refusal matrix, and the three-row retirement
review remain required. Do not broaden operation support, generated resource
authority, or release claims from this packet.
