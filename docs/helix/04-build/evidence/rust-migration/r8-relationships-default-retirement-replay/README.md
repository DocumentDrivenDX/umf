---
ddx:
  id: umf.evidence.rust-migration.r8-relationships-default-retirement-replay
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-041
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-core-relationships-default-boundary
      kind: informed_by
---

# Installed Core Relationships retirement replay

This packet exercises `inspectCoreRelationships`, `lookupCoreRelationship`,
`declareCoreRelationship`, and `verifyCoreRelationshipOperation` through the
installed package root and `./reference`. Each operation has one valid case and
one frozen preflight refusal. The expected values and host reflection traces are
in the four `*.packet.json` files. Packet capture is checkable with
`bun scripts/rust-migration/r8/relationships-default-retirement-packets.ts --check`.

The installed package was the private historical archive
`/private/tmp/umf-r8-sdk-ce1acfb65/umf-sdk.tgz`, SHA-256
`5513efdca5ddb98fce9c5f8d9e105b07205bed1ebd8cd7cf87354e912da0a02e`. Its
build-captured source closure is
`4d4fcdc18399339146e5cb710521f68124833adb5cbba6b19a4543bf07aee0e7`, fixed at
build with zero generated-input transforms. [`cohort-pins.json`](cohort-pins.json)
pins the archive, package and Rust manifests, source inputs, fixtures and packet
digests; [`archive-members.json`](archive-members.json) records all 1,802
archive file hashes, and [`archive-source-cohort.json`](archive-source-cohort.json)
retains the captured 3,487-input source map.

`bun scripts/rust-migration/r8/relationships-default-retirement-receipts-check.mjs`
checks every packet and host receipt against those pins, then submits the
historical archive's captured source map to the current retirement validator.
It passes only when the validator refuses at a current-source hash mismatch;
that expected refusal is the source-cohort gate for this historical run.

Installed Bun 1.4.3, Node 26.12.1, and Chromium 153.0.8010.12 each passed all
eight cases. The Node and Bun harnesses wrap the installed addon's
`executeRequestWire`; the browser harness wraps the WASM module's
`executeRequestWire` export. Valid cases made one Rust call for inspection and
two staged Rust calls for lookup, declaration, and verification. All four
preflight refusals made zero calls. Every `./reference` case made zero addon or
WASM calls. Each host receipt records both routes, exact outcomes and traces,
call counts, installed entry/WASM/native artifact hashes, archive and packet
identities:

| Operation | Bun | Node | Chromium |
| --- | --- | --- | --- |
| `inspectCoreRelationships` | [receipt](inspectCoreRelationships-bun.json) | [receipt](inspectCoreRelationships-node.json) | [receipt](inspectCoreRelationships-chromium.json) |
| `lookupCoreRelationship` | [receipt](lookupCoreRelationship-bun.json) | [receipt](lookupCoreRelationship-node.json) | [receipt](lookupCoreRelationship-chromium.json) |
| `declareCoreRelationship` | [receipt](declareCoreRelationship-bun.json) | [receipt](declareCoreRelationship-node.json) | [receipt](declareCoreRelationship-chromium.json) |
| `verifyCoreRelationshipOperation` | [receipt](verifyCoreRelationshipOperation-bun.json) | [receipt](verifyCoreRelationshipOperation-node.json) | [receipt](verifyCoreRelationshipOperation-chromium.json) |

This is historical installed replay evidence only. The archive predates these
packets and replay harnesses and does not represent current source: its captured
source inputs differ from six files in this checkout, and none of the four new
packets appears in its source closure. The archive therefore cannot pass the
current-source retirement validator or its source-cohort gate. This evidence
does not retire relationship ledger rows, qualify a current fixed-point SDK,
qualify the complete SDK, or authorize publication.

Replay commands (run from repository root, after extracting the pinned archive
to `/private/tmp/umf-r8-sdk-ce1acfb65/extracted/package`):

```sh
UMF_R8_RETIREMENT_ARCHIVE_ROOT=/private/tmp/umf-r8-sdk-ce1acfb65/extracted/package \
UMF_R8_RETIREMENT_RECEIPT_DIR=/private/tmp/umf-r8-relationships-replay-receipts \
UMF_R8_RETIREMENT_ARCHIVE_SHA256=5513efdca5ddb98fce9c5f8d9e105b07205bed1ebd8cd7cf87354e912da0a02e \
UMF_R8_RETIREMENT_SOURCE_CLOSURE_SHA256=4d4fcdc18399339146e5cb710521f68124833adb5cbba6b19a4543bf07aee0e7 \
node scripts/rust-migration/r8/relationships-default-retirement-replay-node.mjs

# Repeat the same command with bun in place of node.

UMF_R8_RETIREMENT_ARCHIVE_ROOT=/private/tmp/umf-r8-sdk-ce1acfb65/extracted/package \
UMF_R8_RETIREMENT_RECEIPT_DIR=/private/tmp/umf-r8-relationships-replay-receipts \
UMF_R8_RETIREMENT_ARCHIVE_SHA256=5513efdca5ddb98fce9c5f8d9e105b07205bed1ebd8cd7cf87354e912da0a02e \
UMF_R8_RETIREMENT_SOURCE_CLOSURE_SHA256=4d4fcdc18399339146e5cb710521f68124833adb5cbba6b19a4543bf07aee0e7 \
UMF_CHROMIUM_PATH='/Users/erik/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' \
bun scripts/rust-migration/r8/relationships-default-retirement-replay-browser.mjs
```
