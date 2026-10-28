---
ddx:
  id: umf.evidence.rust-migration.r8-security-not-retirement-current-13e3313e
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
    - id: umf.evidence.rust-migration.r8-security-not-current-darwin-20261028-df7fbaa2
      kind: extends
---

# Current-source `securityNot` installed replay

This packet records the fixed-point installed SDK replay from the immutable source archive at commit `13e3313e18aeeb1c13ad6543b8004777a67fc6c8`, plus the exact offline Linux build blocker. It does not make a retirement claim.

## Pinned source and Darwin SDK

The source archive was produced with `git archive` at the pinned commit; its SHA-256 is `eb67a8fe84f6a25b04f3da849baa904efbb741dbe766525558af0980b876ad96`. Darwin ARM64 SDK packaging completed on macOS arm64 with Rust 1.90.0, wasm-bindgen 0.2.100, and Bun 1.4.3. The package reported `sourceTransformStatus=fixed-point`, `sourceTransformCount=0`; the captured and packaged source closure SHA-256 is `609a4ac3eaff244964b3501fc0f35a942a75aa11d8f73488f1b2b2b9fd35c3fc`. The installed archive SHA-256 is `686bb6294e4e3b8c37617435bb8c2962c0f21eeaffa1e4f944db34ff1c5519aa`; packet SHA-256 is `10ac8874de655a4896dfd63b0de1dbd884a3049bba5118843beb35fd04bc46e6`.

Three `umf.r8.default-route-retirement-host-receipt/3` receipts are included: Node v26.12.1 (`node.json`, SHA-256 `85a92b6270bfd17dea8945d1ce6ad6a0919007feaeab2f7910b23ca93e1e8088`), Bun 1.4.3 (`bun.json`, SHA-256 `4bcb193b9327dc86e4f7ae8c520a75750b4b2c57c14601e9fe082d535d7d0a75`), and real Chromium 153.0.8010.12 (`chromium.json`, SHA-256 `75f76807e674d4fea9105abf16d9b8a6fa867cd8452752b37b20d0df7632c785`). Each reports 14 cases. The browser run observed no Node or Bun globals and loaded the packaged WASM. Each runtime receipt identifies the same archive, source closure, and packet hashes.

The receipts cover the selected Rust default `package-root-node` and browser routes for `securityNot`, against the `package-reference` route. They establish the current-source installed replay on Darwin ARM64 only.

## Linux offline blocker

The cached `umf-r8-sdk-linux-x64:latest` image was run as `linux/amd64` with Docker `--network none`. Rust 1.90.0, Node v26.12.1, and Bun 1.4.2 were available; Rust/WASM compilation advanced through the core WASM crate. Packaging then stopped at TypeScript declaration generation because the pinned package `@typescript/typescript-linux-x64@7.0.2` was absent. The offline npm cache contained registry metadata for that package but no Linux tarball, and the mounted `node_modules` contained only the Darwin platform package. No Linux SDK archive or Linux runtime receipts were produced. No download or network-enabled bootstrap was attempted. Details are recorded in `linux-blocker.json`.

## Acceptance boundary

This is 3 Darwin runtime receipts out of the required 6 across Darwin ARM64 and Linux x86_64. The exact `/3` retirement validator was not run because the Linux cohort is incomplete. This packet therefore makes no route-retirement, full cross-platform acceptance, or publishability claim; plan and ledger status remain unchanged.
