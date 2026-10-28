---
ddx:
  id: umf.evidence.rust-migration.r8-bit128-field-installed-20261028
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-076
      kind: implements
    - id: CONTRACT-080
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-bit128-field-host-20261028
      kind: informed_by
---

# R8 installed Bit128 Field opt-in replay

This packet qualifies the explicit `@umf/core-rust-native` and `@umf/core-rust-wasm` package surfaces for `declareCoreBit128Field` against current core 0.10.0. The SDK archive SHA-256 is `d110587e1066921afffe65fbe9ffbfe194524fd5e676412cb1db0632577e0370`; its fixed-point source closure is `fcc5649f22be059ae2c13c017c824f4bfe0c5e6993a212be1c4df89b81c3ca99` across 3,668 live inputs with zero generated transforms. The evidence receipt SHA-256 is `d039fa537eae821d00bfb2aa00ffc881bb8a9468a10e1076eccee7419ef22d83`; the package tarball receipt SHA-256 is `6677ab3281ed799aa0d300cefd333d4e62ee4d6fd25f1b0552224466da22dc99`.

Node 26.12.1 and Bun 1.4.3 each passed all 11 frozen TypeScript cases. Both confirmed source-before-identity proxy ordering, thrown-object identity, branded binding failures, exact public `UmfError` identity, and unrelated exception identity. Headless Chromium 153.0.8010.12 passed the same 11 cases and confirmed accessor refusal before identity access, proxy exception identity, public error identity, and absence of Node globals. Missing and corrupt native addons were refused under Node and Bun; missing and corrupt WASM controls were refused in Chromium. The exact SDK member, resource, package, bundle, and runtime observations are recorded in [receipt.json](receipt.json) and [packages.json](packages.json).

This is a private Darwin arm64 installed opt-in result for this exact source snapshot and resource set. It does not select the V4/default route, retire the Bit128 logical gap, qualify Linux, or make a release claim.
