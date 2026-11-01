# Saga public library completion and product release

**Status — complete, 2026-11-01:** implementation, review, fresh qualification,
merge, product publication and public SDK/PyPI consumer verification passed. The
[completion plan](../../saga-public-library-completion-plan.md) governs this
successor. [PR #80](https://github.com/DocumentDrivenDX/umf/pull/80) merged as
`a42c64ada9f5d85f8e3582cc9706bc3e33b4e334`, tree-identical to qualified source
`90cb61eb63aec3f5a77b5991a56e3dfc3d10bd27`.

The normal [SDK 0.10.1 release](https://github.com/DocumentDrivenDX/umf/releases/tag/umf-v0.10.1)
and [Python 0.10.5 GitHub release](https://github.com/DocumentDrivenDX/umf/releases/tag/python-v0.10.5)
target that exact source. Core remains 0.10.0; actions and saga vocabularies remain
0.1.0. These are new product archives, not another qualification-only release or
replacement bytes under a previously published version.

## Delivered behavior and independent review

Provider registration conflicts previously selected an invalid execute-result
shape, threw and left pending original custody in running phase. Execute now
retains a schema-valid indeterminate result and transitions to reconciling.
Execute/reconcile/resolve unknown results retain the original control capability,
not the provider ticket ID. Recover-control returns the exact retained unknown
result through its valid union. Existing current authority, original invocation
custody and pending-work fences remain intact.

The native regression queries independently retained conflicting provider intent,
zero action outcomes and unchanged business state. Claim may reuse the original
pending invocation, but cannot execute a later step or create another ticket.
Focused checks also exercise capability recovery and bounded reconciliation.

Installed SDK consumers use the existing public default WASM initializer instead
of internal imports. Strict TypeScript and complete declare/edit/JSON-YAML/
assess witnesses retain stable identity, caller source and replacement inputs;
unknown recovery meaning and later registry mutation refuse. Installed Python
checks the newly authored identity, copied edit/refusal inputs and JSON exchange.
The [usage guide](../../../05-deploy/sagas.md) contains runnable examples; Sol ran
its exact Bun and Python snippets against installed candidates. The guide uses
the complete retained recipe fixture; the older design allocation correctly
refuses safe edits when interpretation is incomplete.

## Frozen qualification

[CI 41269415988](https://github.com/DocumentDrivenDX/umf/actions/runs/41269415988)
passed at exact source above. Sol independently reviewed the full log and both
platform cohorts; source remained frozen after review.
The retained [hosted-log review](hosted-log-review.json),
[Linux candidate review](linux-candidate-review.json) and
[macOS candidate review](macos-candidate-review.json) record independent acceptance.

| Gate | Observed result |
| --- | --- |
| Native action reference | 125 tests / 1,997 assertions |
| Portable actions | 63 tests / 513 assertions |
| Saga/oracle/custody | 60 tests / 768 assertions, eight files, 165.27 seconds |
| Shared Rust saga | Six focused tests passed |
| Portable hosts on each platform | Native, Chromium/WASM, CLI, selected Python and source-rebuilt Python: 19/19 vectors each |
| Installed SDK | 139 existing cases + 19 saga vectors; strict public types and lifecycle passed |
| Selected Python | 35 resource + four helper + six installed-payload tests, plus two lifecycle tests |
| Source-rebuilt Python | 19 vectors plus two lifecycle tests, without JavaScript tools |
| Boundaries | 636 source modules checked; production core pass; zero findings; nine negative controls; 16 boundary and 13 inventory unit tests |

Each platform custody packet binds 43 source inputs, 23 retained files and 24
checksum rows. All input hashes agree between macOS and Linux at qualified source.
Seven consumed SDK members match archive, manifest and installed bytes. Selected
and source-rebuilt wheel digests and actual native payloads match their installed
before/after proofs; source archive and platform-selection mappings are retained.

The original [hosted artifact 13069436184](https://github.com/DocumentDrivenDX/umf/actions/runs/41269415988/artifacts/13069436184)
is 97,667,686 bytes, SHA-256
`109c54dcceba56f01191d6f854b83ab435cf8afe0b88a82b13b568b9aaaff113`.

| Qualified product bytes | SHA-256 |
| --- | --- |
| Published SDK archive selected from Linux | `3d95fff822f4f44b3d1a8e56185c3697e94ee66f5315cda7389f5301f3d16d26` |
| Selected manylinux_2_34 x86_64 Python wheel | `cf33b833ff4eaa080f459cf3c93baa7e3b4e436dab5cd7853dd748e3c220dd16` |
| Selected macOS 11+ arm64 Python wheel | `9213ff4b87649f551abcfdff40cdb6b0d75d619260988fa8ea4fe26cac7f6788` |
| Published source archive selected from Linux | `f56bcced69e701d76e28958b36767fe9c7471ed78e3c6ab8106bac818100ed2c` |

Observed interpreters are Python 3.13.17 on Linux x86_64 and 3.13.16 on macOS
arm64; Bun is 1.4.3 and Chromium 153.0.8010.12. Native reference observations
retain PostgreSQL 17.9 and exact image pins. Wheel cp311-abi3 compatibility tags
do not establish execution qualification for every Python version in that ABI.

## Public publication and installed consumers

The [public-release verification](public-release-verification.json) records
immutable exact-source GitHub releases, server digests and all 13 SDK / ten
Python downloaded assets matching staged bytes and checksum cohorts. The SDK
release retains the original full Linux CI ZIP, full macOS cohort ZIP and hosted
log alongside its qualified SDK archive and two native CLI binaries.

The [PyPI verification](pypi-verification.json) records successful owned main-only
OIDC publication in [run 41271459809](https://github.com/DocumentDrivenDX/umf/actions/runs/41271459809),
all three registry archives independently downloaded/hashed against release
bytes, and the clean Linux public-index consumer. The pre-existing manually
disabled automatic dispatcher remains unchanged; this release used the existing
manual publisher route and did not infer registry success from GitHub alone.

The [public-consumer results](public-consumers.json) record a fresh macOS install
of the published Linux-built SDK passing strict TypeScript, 139 existing cases,
19 vectors and positive/unknown/registry-refusal lifecycle checks. Its
[raw installed SDK custody](public-sdk-install-custody.json) binds the released
archive and seven consumed members. A fresh public-index `umf-core==0.10.5`
macOS install confirmed site-packages origin, native loading from the installed
package and no direct-URL metadata, then passed 19 vectors and two lifecycle
tests. The [raw Python host receipt](public-python-host.json) binds the selected
public wheel and native payload before/after execution. It records 44 installed
files / 36 package files; candidate receipts record 46 / 36 because installation
metadata differs. Each cohort is checked against its own exact installed receipt.

## Qualification limits

Historical SDK 0.10.0 / Python 0.10.4 products and the two earlier qualification
releases remain immutable. The historical 43 bounded formal checks retain their
original context; these fixes satisfy existing protocol requirements without
claiming a new TLC run. The library delivers portable semantics and bounded
reference-consumer conformance. Hosts continue to own authenticated execution,
durable coordination and independent provider qualification; no production
hosting service or broader provider support is implied.
