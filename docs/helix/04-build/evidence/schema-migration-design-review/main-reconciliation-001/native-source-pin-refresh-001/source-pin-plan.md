# Native current-source pin refresh plan

The inspected candidate is commit `815d902d28732a022c2953f831051738737e6a60`. This is a source-pin assessment only. No native command, product runtime, import, test, or Git operation was run.

The existing native workflow remains `.github/workflows/g02-g03-native-qualification.yml` (SHA-256 `1577b27dfc96b9f59082bb1652f27715a1c22c5f396e3f731cf003e53b4c29f0`). Its existing runner and selected roster stay intact: all five G02 fixture cases, the existing selected G03 scenarios and five separate domain subscenarios, with G03-N12 unqualified and G03-N14/full campaign open. The previously source-reviewed G03 five-domain runner split is already the current pinned runner: `tests/lifecycle/g03-defaults-native.py` SHA-256 `361f250158e10ade881e78baf480d534e0b27ecf6c70062b9955e2110e23c0ed`. Its case bodies and the workflow's deadlines, limits, cleanup, and finalizer were not changed.

I refreshed only three code-generation output identities in `docs/helix/04-build/evidence/mig-g02-g03/native-qualification-source-pins.json`. The previous values were the reviewed pre-rebuild placeholders; the exact current bytes are the adopted outputs from the bounded merged-generation receipt at `docs/helix/04-build/evidence/schema-migration-design-review/main-reconciliation-001/merged-generation-40277896975/generated-source-receipt.json`:

| Source pin | Current SHA-256 |
|---|---|
| `python/umf_codegen/src/umf_codegen/_release.py` | `e547adb26c94ba84df8ec53737081178e7b343e448bd6a634c3a0a417df65bbb` |
| `python/umf_codegen/src/umf_codegen/_assets/manifest.json` | `1487c538d1e49c661a79dcd9b0c08ab2a4c31a7ce479dd419e550938bb5f5e62` |
| `python/umf_codegen/src/umf_codegen/_assets/generator.js.gz` | `0cf4359a70581322030763e637026b221a9e8f953a4fb8652e4bb8a29a950d7c` |

These values match both the adopted source tree and that receipt's output hashes. The existing workflow still rebuilds codegen assets and checks deterministic output hashes before it builds the cohort. The source-pin manifest is now SHA-256 `589bf0f3c0a4cd88de1ff0ccf3e8d31d004d5cfba69026959de3f15582789d82`; a stdlib bytewise check confirms all 32 pinned source files match.

The native Core dependency identity remains unchanged and held: the manifest still states `umf-core` 0.10.0 with its existing SHA-256 `49633924b45a3c8499d4fcc1a24c30d5a8fcb34d974ab019bbda987cb47da0f9`. Do not replace its URL, wheel hash, distribution version, or expected semantic identity until the intended Core 0.10.2 artifact has immutable public publication evidence. Consequently this source refresh does not authorize dispatch or claim the native cohort is current for Core 0.10.2.

No workflow, dependency identity, cap, assertion, fixture, selected-case list, or native behavior claim changed.
