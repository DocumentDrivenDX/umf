# Merged-source generated output assessment

Run `40277896975`, attempt `1`, completed on `refs/heads/codex/migration-merged-generation` at source commit `55c6a8957fd42b3272bcd08d255df8db4db0b330`. The workflow receipt says `GENERATED_ARTIFACT_ONLY`, with `qualifiesMergedSource: false`; it claims no qualification or source adoption. The downloaded artifact ZIP SHA256 reported for this run is `6a16578b25f9dfe7480116b337493e56451e3ce23101f9d85cea2c75746efea8`.

I checked the extracted evidence against the source commit and artifact receipt. The current checkout HEAD equals the recorded source commit. All 26 `pinnedSourceInputs` rows and all six historical placeholder rows match the exact Git blobs at that commit. The extracted `outputs/` tree has exactly the 16 files covered by `outputFilesSha256`; every file hash matches the receipt, and the size sum is 3,788,996 bytes. The codegen asset roster also matches its generated manifest. The whole extracted artifact has 33 files and 3,814,500 bytes, below the 16 MiB artifact cap.

The closed generated output roster is:

| Output | Bytes | SHA256 |
| --- | ---: | --- |
| `src/extensions/actions/plan-identity.ts` | 355 | `d53b8ba01dda06ac0f7b3057424051807e36c15eb0924b572995f0a9bb396b36` |
| `python/umf_codegen/src/umf_codegen/_release.py` | 170 | `e547adb26c94ba84df8ec53737081178e7b343e448bd6a634c3a0a417df65bbb` |
| `python/umf_codegen/src/umf_codegen/_assets/manifest.json` | 33,447 | `1487c538d1e49c661a79dcd9b0c08ab2a4c31a7ce479dd419e550938bb5f5e62` |
| `python/umf_codegen/src/umf_codegen/_assets/generator.js.gz` | 925,422 | `0cf4359a70581322030763e637026b221a9e8f953a4fb8652e4bb8a29a950d7c` |
| `docs/helix/04-build/evidence/rust-migration/r3/inventory.json` | 2,784,984 | `c691e29078ef0a80a9a8d5ab5a5c2f957d3687494ae55b197b981ba905c9911e` |
| `docs/helix/04-build/evidence/rust-migration/r3/boundary-check.json` | 26,687 | `874d18cf82117e573dbffd77c8457f04dafdfe6841ae575c319c497be7a07fe0` |

The asset manifest and receipt also bind ten notice files: `LICENSE` and `package.json` for `ajv`, `fast-deep-equal`, `fast-uri`, `json-schema-traverse`, and `yaml`. Their individual bytes and hashes match the receipt’s closed output hash map.

The source receipt records the intended version split: Python distribution `0.10.2`; semantic Core `0.10.0`. The committed `python/pyproject.toml` and `python/src/umf/__init__.py` carry `0.10.2`; `spec/core/schema.json` identifies `urn:umf:core:0.10.0` with `umf` const `0.10.0`. The action runtime resource manifest’s `coreSchema` mapping pins that same schema path and SHA256 `bdcf1c6b8a197dfbd769ea47a879eaabeeb1d71cc00cab1f9e600175354c5da7`. The adopted accounted companion is bound at `314cac8416711899285bc3f1a734765d557f7446f7ab0cf58d3dbd2a7dfdd81e` with Stage-A provenance.

All ten recorded bounded commands have raw exit `0`, capture exit `0`, and `truncated: false`. Recorded durations were: Bun install 0.96s; Cargo fetch 0.96s; placeholder capture 0.04s; toolchain identity 0.29s; action-plan identity and check 0.15s each; codegen build and check 0.18s each; R3 inventory 62.66s; and R3 boundary check 2.05s. The logs total 7,727 bytes. The inventory reports source cohort `4ea593a0f64e22c4dfb659d03c4f0e1a6ece46cf8c10abdf61cca6a9df78092a`, 622 source modules and 416 active scripts. The boundary report is `pass` for 631 checked source modules; its log reports zero findings.

The existing Core inventory seed is retained only as a pre-generation placeholder, with SHA256 `cc6f8343fe4c210b1120495151ec6bb38fe048b515886198573329873b621a67`; it is not the generated inventory above and supplies no currentness or qualification evidence. Historical plan identity, codegen assets and boundary report hashes are likewise preserved in `historical-placeholder-inputs.json`.

This is an output/provenance adoption assessment only. The artifact contains no merged-source test, runtime, browser, native, package or release qualification. The receipt does not state a final aggregate elapsed time; this assessment makes no exact total-duration claim. The downloaded ZIP hash is taken from the run handoff; extracted files were independently checked against the receipt.
