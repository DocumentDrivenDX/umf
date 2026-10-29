# Migration post-generation pin preparation

Inspected the clean migration candidate at `aa8a23394a8103afe8142818c1d292b8c41c6e5c` using Git metadata, file reads, and Python standard-library JSON/SHA-256 only. No product/runtime imports, AST, tests, source edits, or Git mutations were performed.

## Current native source manifest

`docs/helix/04-build/evidence/mig-g02-g03/native-qualification-source-pins.json` is SHA-256 `88a9de55e8d0134451a20e508ff60315ba4fd6844fcbc4abb472bfda7054bd7f`. Its 32 `sourcePins` entries all match current file bytes. The platform-aware Core entries are already current: Linux-only native distribution pin `umf-core 0.10.2`, filename `umf_core-0.10.2-cp311-abi3-manylinux_2_34_x86_64.whl`, wheel SHA `708f967747b0539b9ca7b6a5f39d1017eea8ddb1d07cd62f4f46592e088f6f39`, native SHA `78dd1542f723b4f4d8c336c137caa478974a981ed759ada171a5877d7e0368a8`; the profile hash matches the current four-cell template. The already-reviewed source rows are package.json `c7b69fba001805dc9cd4e26e84a9b786be379c1413d020c34600c063d287101b`, acquisition helper `3fce50c241afd5ef3e5dfa3ea2736c1fbe5b98f8788b98ac296db476395f8503`, and template `5ce1f5a5f69132737d3710126921c085e4dadc751b20d827dd9d4f59c62c8c0f`.

No native source-pin refresh is currently indicated. Recheck the 32 rows after canonical output adoption; update only rows whose actual adopted bytes change. Keep the Linux-only selected native Core pin and its existing Weft 0.4.53, 32-path source roster, cases, and deadlines intact. Semantic Core stays 0.10.0; distribution is 0.10.2.

## Combined portable 97-path manifest

`qualification-inputs/expected-pins.sha256` is SHA-256 `d0806281e94a791320fb26920484585a11ef066e78309da25c91184481e39517`. It has 97 entries; 94 currently match. Three exact mismatches are:

- `package.json`: recorded `031bdb38c663c33804c02de06906c9c4fdd7bbf32728204cd4c8d30959c324ed`; current `c7b69fba001805dc9cd4e26e84a9b786be379c1413d020c34600c063d287101b` (SDK version 0.5.7, `private: true`).
- `.github/workflows/pypi.yml`: recorded `8169c32c74f93c5c939fcf1c019c71942183844a37c432688e827cbc055590d1`; current `b970dfb643281fb8c9e58b89d4da872f379809397937f01dcd277705c34d7c09`.
- `.github/workflows/access-boundaries.yml`: recorded `b67fabb828b251040a73187c7c4cb965f4a5e6f6407062e9678efbf2a29e2a31`; current `e94235c9e027748fecfa218350ed82684ba5f6e33cf978728e4064125b01f50a`.

The current 97-path list already pins the adopted accounted companion at `314cac8416711899285bc3f1a734765d557f7446f7ab0cf58d3dbd2a7dfdd81e`; current `src/generated/core-validators.ts` also matches. Neither the Core acquisition helper nor the wheel template is in this portable roster; their custody is in the native manifest. The list does not currently include any newly generated output beyond the accounted companion. Do not invent output hashes or replace the companion pin from a run that has not been inspected and adopted.

The canonical generator `scripts/qualification/r2-metering-generate.ts` has another stale package lock: its `LOCKED_FILES` row still expects package.json SHA `031bdb...`, while current package.json is `c7b69f...`. It must be updated to the current package hash; then refresh that generator's own row in the 97-path manifest from the final file bytes. The four generator `INPUTS` (validator plus three schemas) currently match their declared hashes. After the hosted generation artifact is reviewed/adopted, update the 97-path manifest only for actual current source/output files that changed and are in its closed roster, plus the three known rows and the generator hash. Keep all unrelated expected rows unchanged.

On the inspected candidate, a new combined workflow run would fail its initial `sha256sum -c qualification-inputs/expected-pins.sha256` because of the three mismatches above; if that is repaired without changing the generator's stale package lock, the generator would then refuse the new package bytes. The active run's own result remains unknown until its retained receipt/log is inspected.

## Existing workflow and adoption order

The combined workflow is push-only on `codex/migration-integrated-qualification`; its runner checks the exact event/ref and uses the generator's `stage-b-reproduction` mode, which separately admits that branch. The selected G02/G03 workflow is push-only on `codex/migration-g02-g03-native-qualification`, checks the 32-row native source manifest, builds the exact Linux cohort, and retains the original 35-minute/180-second/2-worker bounds and selected scenarios. Root must stage/commit the frozen source and refreshed manifests, then push each exact qualification branch to trigger its intended job. Root should first inspect and adopt the active canonical output artifact with its source/run identity; then freeze regenerated file hashes and manifests. Only after that review and refresh should the combined portable and native qualification jobs run from the finalized source cohort. These checks do not claim the four-cell SDK matrix has passed; retain its separate Ubuntu24.04/Linux and macOS14/arm64 Python3.11/3.14 cells.

No generated R3 output hashes were presumed current or refreshed in this report.
