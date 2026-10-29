# SDK 0.5.7 / Core 0.10.2 / R3 preparation

Read-only preparation for the migration freeze. No candidate files were edited, generated, imported, or executed. No migration was performed.

## Core wheel selection across the four SDK cohort cells

The shared template `python/packaging/embedder-wheel-lock.template.json` still has four intended cells: Ubuntu 24.04 x86-64 on Python 3.11 and 3.14, and macOS 14 arm64 on Python 3.11 and 3.14. A Linux-only replacement of the old pure `umf-core` wheel would break both macOS cells: pip cannot install a manylinux x86-64 artifact on macOS arm64.

After the fresh public verification gates pass, the acquisition helper should select exactly one of these two published Core 0.10.2 artifacts from the existing runner cell's OS/architecture, independent of Python minor version:

| Cell platform | Wheel | Wheel SHA-256 | Native member SHA-256 |
|---|---|---|---|
| Ubuntu x86-64 | `umf_core-0.10.2-cp311-abi3-manylinux_2_34_x86_64.whl` | `708f967747b0539b9ca7b6a5f39d1017eea8ddb1d07cd62f4f46592e088f6f39` | `78dd1542f723b4f4d8c336c137caa478974a981ed759ada171a5877d7e0368a8` |
| macOS arm64 | `umf_core-0.10.2-cp311-abi3-macosx_11_0_arm64.whl` | `99ff1d1250c613a7b65bdd4dc6cf3ee9fec647e02ec34f8dc5ffb84285b0ac59` | `49847a1e052e4337d414415e2e3fd3b752238df0238c20f936db7f7bebe7365a` |

The `cp311-abi3` tags cover both existing Python cells in principle; retain and run all four cells rather than inferring Python 3.14 results from the Python 3.11 public verifier. The Linux wheel's manylinux 2.34 floor is appropriate for Ubuntu 24.04; the macOS wheel's 11.0 arm64 floor is appropriate for macOS 14. The lock/install steps still need to prove the selected wheel is accepted in each actual cell.

The exact minimal native-cohort source changes are:

1. `tests/codegen/acquire_offline_cohort.py`: replace the unconditional single `CORE_URL`, `CORE_SHA256`, and `umf_core-0.10.0-py3-none-any.whl` target with a closed platform map keyed by the already selected `cell` OS/architecture. Bind URL, filename, whole-wheel hash, native-member hash, and release provenance for each platform. Reject unknown cells and do not fall back to a different platform artifact. Do not use the URL as current public proof until both published files have passed the fresh public download gate.
2. `python/packaging/embedder-wheel-lock.template.json`: change the `umf-core` distribution version to `0.10.2`. The input template has no platform URL selection; the helper should write the selected platform's exact immutable URL, release identity, and hash into that cell's generated lock provenance.
3. `docs/helix/04-build/evidence/mig-g02-g03/native-qualification-source-pins.json`: replace the single `dependencyPins.core.sha256` with a closed two-platform artifact selection (version `0.10.2`, exact filename, wheel SHA, native SHA per platform). Refresh the template and acquisition-helper source hashes while preserving all existing source pins and the Weft 0.4.53 pin.
4. `.github/workflows/g02-g03-native-qualification.yml`: update its exact Core dependency pin/finalizer assertions to select the Linux row for this workflow's Ubuntu 24.04 x86-64 runtime. Preserve Weft `0.4.53` / SHA `db01c4cf6357d674f1591609a2b9c83a9322ad8f8937c345e5950cc1582b83d2`, the 32 original source pins, all five G02 cases, thirteen selected G03 scenarios, five split domain subcases, 180-second command cap, 1800-second aggregate cap, cleanup and scope labels.

Also update the distribution-only guard at `.github/workflows/access-boundaries.yml:229`, which currently asserts installed `umf-core == 0.10.0`, to assert distribution `0.10.2`. Keep the semantic Core version `0.10.0`; do not change schema semantics or infer a semantic-version bump from the Python distribution version. The native runner records `umf-core` package metadata; its cohort lock and offline mirror must bind the complete selected wheel bytes. The earlier direct public verifier's native-member digest is evidence for those exact full-wheel bytes, not a separate native-member hash check performed by this cohort runner.

## SDK 0.5.7 version inputs

- `package.json` is the current SDK distribution metadata: name `@umf/core`, version `0.5.6`, and `private: true`. The package source should move to `0.5.7`; public npm publication cannot be inferred while `private` remains true.
- `scripts/package-sdk.ts` copies `name` and `version` from `package.json` into the packed SDK manifest. `scripts/test-sdk-install.ts` derives the expected version from the same source manifest and checks the installed archive. These scripts have no independent 0.5.6 literal to update.
- `docs/helix/05-deploy/sdk-release-notes-0.5.6.md` is an existing draft and should remain historical. A 0.5.7 release-note artifact should be authored separately when release scope is approved; do not relabel the 0.5.6 receipts.
- Existing evidence under `docs/helix/04-build/evidence/mig-g02/sdk-0.5.6/` proves only its recorded 0.5.6 local install. It does not qualify SDK 0.5.7 or the newly published Core wheel.
- Keep `umf-access` `0.1.0.dev8`, `umf-codegen` `0.1.0a5`, Weft `0.4.53`, Core distribution `0.10.2`, and semantic Core `0.10.0` as distinct identities. Rebuild the SDK archive and installed-check receipts from the final merged source/version; do not reuse the 0.5.6 archive or receipt as current evidence.

## Main overlap and canonical R3 regeneration

The migration worktree is clean at `d82336dfa9c8e6e7c4c04784fee80a3716b46385`; the available Core release commit is `6337b4b5f65144387ce5c0bbf9cbad955a921c8f`; their merge base is `a1b909d4f92da6604aeb21d3ea60e9a9943a7f87`. The full recursive `git merge-tree` attempt could not create its temporary file under the filesystem sandbox. The non-writing `--trivial-merge` comparison marks exactly these paths changed on both sides:

- `docs/helix/04-build/evidence/rust-migration/r3/inventory.json`
- `docs/helix/04-build/evidence/rust-migration/r3/boundary-check.json`

This is an overlap report, not proof of textual conflict hunks. Keep the current parent-reported main-head receipt commit `8e82e134a7b4c23aad561954aa2a48cbc738fb23` distinct from release M; that object was not available in this checkout. Resolve any merge with root's normal merge procedure, then regenerate both R3 outputs from the merged source. Do not union or relabel the old generated JSON.

The existing canonical artifact-only recipe is `.github/workflows/merged-source-generation.yml`, on its isolated `codex/migration-merged-generation` branch. Its frozen input receipt records the actual source commit, Core distribution/semantic identities, the adopted accounted companion and provenance, and hashes/bytes for the pinned source roster. Relevant inputs include `package.json`, `bun.lock`, `bunfig.toml`, merged core-schema/validator resources, `scripts/rust-inventory.py`, `scripts/rust-inventory-typescript.ts`, `scripts/check-rust-boundaries.py`, `Cargo.toml`, and `Cargo.lock`. Preserve its historical-placeholder receipt for prior R3 JSON. The workflow order is source/dependency freeze, then bounded `python -I scripts/rust-inventory.py`, then bounded `python -I scripts/check-rust-boundaries.py`; collect only the generated output family and bound receipt. Existing recipe limits are 1800 seconds aggregate, 60-second evidence reserve, command caps of 600 seconds for inventory and 900 seconds for boundary generation, 1 MiB captured logs, and 16 MiB artifacts.

The R3 inventory's `sourceCohortSha256` includes `package.json`, Bun lock, Cargo manifests/lock, enumerated TypeScript/Python/Rust sources, scripts, and project declarations. Therefore final SDK version `0.5.7` and the final merged source must be fixed before the canonical R3 generation run. The native wheel helper/template/pin manifest and the native workflow are qualification controls, not substitutes for the generated product cohort. Retain their exact hashes in the native qualification source receipt; do not claim they were R3 semantic inputs unless the actual frozen inventory source list demonstrates that relationship.

## Scope holds

This is a preparation report, not permission to run the native migration campaign. The Linux public cohort now has an actual PASS at run `40371456196`, job `121742996207`, artifact `12674535563`; the parent reports that its 254 tests and public wheel/native bytes match. The Mac and PyPI gates remain queued, so the native migration campaign remains held until those fresh gates pass and the final source freeze is ready. Do not broaden provider selection or change UMF/Weft/host authority boundaries. No Weft, semantic-Core, four-cell, test-case, deadline, cleanup, or selected-scope change is proposed.
