---
ddx:
  id: umf.evidence.rust-migration.r8-security-not-current-darwin-20261028-df7fbaa2
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
    - id: CONTRACT-062
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-security-not-direct-binding
      kind: extends
    - id: umf.evidence.rust-migration.r8-security-not-current-linux-20261028-df7fbaa2
      kind: extends
---

# Current-source `securityNot` installed retirement cohort evidence

This packet records two fresh private SDK archives built from the exact `df7fbaa2ae3727f4b0d9e704cc5dedab154c9700` source commit. Both archives have the same fixed-point source closure SHA-256 `6ac79efee9c97b0534378f058b330a0d2f073b0fd6c37ed643219078848969d3`, covering 3,639 inputs with zero generated-input transforms. The source archive was an immutable `git archive HEAD` snapshot; the shared worktree was not used as the Docker build input.

The Darwin arm64 archive SHA-256 is `2c33a74ff8c1a77d689eb32a6b6676f01bfc356bc39f98efbefb5f9efc035494`; the Docker-emulated Linux x86_64 archive SHA-256 is `76edb6c40500498067dd0c1b478001f1c07165e3df51c55941463d608674ef8e`. Each has 1,813 regular tar members. Their member maps, package manifests, source-closure manifest, and raw host receipts are preserved alongside this report and in the linked Linux cohort packet. Archive files remain under `/private/tmp/umf-r8-security-not-darwin-df7/` and `/private/tmp/umf-r8-security-not-current-df7fbaa2/`.

Node 26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12 each passed the ordered 14-case installed package-root and TypeScript-reference replay on both platforms. The valid T/F/U inputs each dispatched to Rust once; all eleven invalid inputs and every reference-route case dispatched zero times. Chromium ran with no Node globals and loaded the packaged WASM artifact. The Darwin receipt hashes are Node `f9385480e064c82dc88a6df818e3801c2c7ea8a9da720fd811202bcea9b4ec6e`, Bun `e95f986a010b1a3e614130d26ebe149c081b3f554047ad689083c543fbd8ab5a`, Chromium `ff233f38c118f1f137b21acb3038121eeeffed2ba8d8567f31465a77bdf4ad69`. Linux receipt hashes are Node `1f9842d646f8c1cd5995e18ccd4f2e5fa6c71815d75737f9b821d9c2e28bda96`, Bun `b112bc0c6d44ef21590c753b8a62e59ec16cb672d85d4adbdcf1c3a356990c90`, Chromium `bcb5fa303cc7eea182c9afa339a2e0567fe89ea3805660cd93bd04cf9baa40cb`.

The Linux build ran in Docker/OrbStack as linux/amd64 emulation with `--cpus=2 --memory=12g --pids-limit=512`, `CARGO_BUILD_JOBS=2`, and `CARGO_INCREMENTAL=0`. It used Rust 1.90.0 and wasm-bindgen 0.2.100. Package `bun run typecheck` passed, and `python3 scripts/test-sdk-package.py` passed 9/9. The Darwin snapshot passed the same package verifier and typecheck, plus `bun scripts/actions-plan-identity.ts --check` and `bun scripts/metamodel/build.ts --check`.

The exact [`/3` input](two-cohort-validator-input.json) was validated by [`gap-ledger.mjs`](../../../../../../scripts/rust-migration/r8/gap-ledger.mjs) from a separate temporary source tree exported from the same HEAD. The validator accepted exactly `package-root-node` and `package-root-browser` for `securityNot`; the evidence-scoped result reports 924 remaining logical gaps. Running the checked-in gap ledger without evidence still reports 925 gaps and zero retirements. The default ledger was not edited. Four negative controls rejected a stale archive hash, a missing Chromium receipt, a stale source closure, and a stale frozen packet hash.

This evidence covers only CONTRACT-062 `securityNot` and the exact pinned source/archive/runtime cohorts. It does not establish hosted Linux CI, broader security-operation parity, release suitability, or any platform beyond these two cohorts. The `./reference` route remains TypeScript.
