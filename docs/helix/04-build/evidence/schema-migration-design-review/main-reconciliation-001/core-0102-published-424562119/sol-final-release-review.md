# Core 0.10.2 final release asset assembly review

**SOURCE / ASSET ACCEPT for the exact frozen ten-file assembly.** No concrete assembly blocker found. This accepts root's authorized draft → attach → exact readback → publish sequence, subject to the immediate source/tag/release/version freshness checks below. It does not itself establish publication, PyPI success or fresh public-download qualification.

Reviewed directory `/private/tmp/core-0102-final-metadata` against `/private/tmp/core-0102-final-metadata-manifest.json`, independently verified SHA256 `552f7cb2e2bb0570d93232ed1395dc2301bc10aa34c9697b500a1314ec5d70b0`. Exactly ten regular, nonsymlink files are present; every actual byte count and SHA matches the closed manifest. Review used only standard-library JSON/hash/ZIP/XML metadata reads; no candidate/native/tool execution, imports, tests or Git action.

## Exact selected release assets

- Linux: `umf_core-0.10.2-cp311-abi3-manylinux_2_34_x86_64.whl`, 3,582,082 bytes, SHA256 `708f967747b0539b9ca7b6a5f39d1017eea8ddb1d07cd62f4f46592e088f6f39`.
- Mac: `umf_core-0.10.2-cp311-abi3-macosx_11_0_arm64.whl`, 3,294,849 bytes, SHA256 `99ff1d1250c613a7b65bdd4dc6cf3ee9fec647e02ec34f8dc5ffb84285b0ac59`.
- Single source distribution: `umf_core-0.10.2.tar.gz`, 2,652,087 bytes, SHA256 `90a107aaa507930e1d71c0cf208b77182d06c0bf2a1b13681fd5f7b6ed74cb9d`.

These are exactly the previously accepted archives, not newly rebuilt or renamed artifacts. The historical raw Linux wheel and distinct sdist-rebuilt wheels are not additional top-level publisher inputs. Prior Linux artifact review `3c5930be…`, Mac review `e74b6e24…` and source review `fd117386…` are reused, not re-executed.

## Metadata and evidence closure

`qualification.json` SHA256 `44b72323ec0b343911c47477b5058f33fb64b070265f5be10ce0117b373d3718` correctly binds these selected bytes, actual producers, repair harness, installed-payload evidence and recorded environments. It preserves Mac synthetic producer f4d22c6f… with genuine tree equivalence to S rather than relabeling it. Each selected installed suite records 254/0/0/0; older-runtime, other-architecture, SQL/managed-host and publication claims remain excluded. The source-distribution rebuilds are explicitly historical evidence and not selected wheels.

Evidence ZIP SHA256 `e873b3ce9c374607b516332fd990ee6c4121b9e78610fc8151859f2279c57e47`, 163,526 bytes, contains exactly 65 unique safe paths and no package binaries. Its `evidence-index.json` SHA256 `87d1eb41105f5ca8894cf9672cc06e081e3b7698515e23d0068910a94bff3b95` covers all other 64 entries. Every indexed size/hash was independently checked; the three retained Sol review hashes match the prior accepted receipts, and the included Linux/Mac XML counts are 254 tests with zero errors/failures/skips.

`release-pins.json` is the exact closed five-key object `{commit, distribution, files, tag, version}`: M, `umf-core`, precisely the three archive filename/hash pairs, `python-v0.10.2`, `0.10.2`. It contains no historical raw wheel or metadata archive as a package-upload candidate.

`PUBLIC_ASSET_INVENTORY.json` accurately hashes eight ordinary assets. Its own digest is explicitly excluded from itself and supplied by SHA256SUMS; SHA256SUMS has no self-entry and accurately covers every other top-level asset, nine unique rows. This is explicit noncircular accounting, not a missing checksum. Release notes retain extension-kind feature scope, distribution 0.10.2 versus semantic Core 0.10.0, separate SDK release, exact cohort limits and no broader migration/host support claim.

## Source identity and actual gate scope

Qualified product S is `a1b909d4f92da6604aeb21d3ea60e9a9943a7f87`, tree `f9f1655af59c4c030e58a19405fe22ae55db40bb`; its normal merge 3fd8c61c… has the same tree. Archived actual checks independently total 63 success and one expected skip.

Release/publisher M is `6337b4b5f65144387ce5c0bbf9cbad955a921c8f`, tree `d3adf126be14b38a982d496844212fba6e8c523a`. Retained primary merge/comparison objects in `/private/tmp/core-publisher-merge-6337b4b5` confirm the exact ten publisher workflow/script/test/docs/generated-inventory changes and no Core package-source change. M is NOT full-tree equal to S. Publisher-controls 121724450426 and inventory-boundaries 121724450441 succeeded. The actual M snapshot remains eight success, six in progress, nineteen queued and thirty-one cancelled duplicate-push checks; the seven cancelled run IDs and pending scope are explicitly retained. `current-source-ci.json` accurately states this correspondence and does not claim all M gates passed.

Immediately before external writes, root must recheck the actual intended M binding and absence of the tag/release/PyPI version, preserving the existing 404 precheck evidence and refusing any collision or changed identity. Then attach only these ten exact assets to the authorized draft, read back exact names/sizes/digests and target M before publication. The subsequent automatic publisher and fresh public proof must supply their own actual results; no such result is inferred by this assembly acceptance. No new optional campaign or qualification scope is required by this review.
