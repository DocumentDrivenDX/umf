---
ddx:
  id: umf.evidence.rust-migration.r8-core-nine-dependency-resolved-20261028
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
---

# Core nine-export dependency-resolved installed cohort

The [cohort](cohort.json) (SHA-256 `e79aa37a0f57dd1405822017d152af64b2de82862da5e1962d2499ff33bfb951`) records an offline npm installation of private `@umf/core` 0.5.6 and 19 passing Node, Bun, and real Chromium host receipts for the Schema Properties, Core Inspectors, and CSV Boolean packets. The [consumer lock](consumer-lock.json) (SHA-256 `7230523bfe4b5db9bd69116d3bdc027127314e2d20b6ddd02df578dca20a231d`) has 227 dependency entries with integrity pins. The cohort executes five tamper controls for dependency integrity, installed package and archive identity, and default-route resolution. It verifies the archive and installed package contents, `@umf/core` default and `./reference` resolution, direct dependency versions, and the live/external source closure again immediately before recording success.

The exact 19 files are retained in [receipts.tar.gz](receipts.tar.gz) (SHA-256 `83dd41954aee1546c622ea2b1bb92c8c0b4d82c60901e11ac63d3d5482ae3b2c`). Each path and SHA-256 is listed in `cohort.json`; extract with `tar -xzf receipts.tar.gz`, then verify each entry against that list. The tarball contains exactly those 19 files. The private SDK archive SHA-256 is `af745902a6817a6812caa545d1c6e6c3befaa41e1c56781f570010d3131bdc4e`, and its fixed-point source closure SHA-256 is `31e8f424b6501f5872b576b29f89d92c4eac0424f64159360d5d3fd2c89542e3` over 3,727 inputs with zero source transforms. The archive is retained at `/private/tmp/umf-r8-reviewed-cut/umf-sdk.tgz` and is not a published package.

This replaces the earlier archive-extracted local Core nine-export replay with dependency-resolved installed-consumer evidence for the stated Darwin arm64 cohort. It does not qualify the hosted Linux SDK cohort, complete public API parity, declaration retirement, or a release.
