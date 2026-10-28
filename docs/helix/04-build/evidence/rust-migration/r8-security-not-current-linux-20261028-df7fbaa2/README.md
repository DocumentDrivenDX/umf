---
ddx:
  id: umf.evidence.rust-migration.r8-security-not-current-linux-20261028-df7fbaa2
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

# Linux x86_64 current-source `securityNot` cohort

The Linux x86_64 SDK was built from the immutable source snapshot at commit `df7fbaa2ae3727f4b0d9e704cc5dedab154c9700`, with source closure SHA-256 `6ac79efee9c97b0534378f058b330a0d2f073b0fd6c37ed643219078848969d3` across 3,639 inputs and zero generated-input transforms. The Docker/OrbStack linux/amd64 build used a 2 CPU, 12 GiB memory, 512 PID limit; Cargo used two jobs and incremental compilation was disabled.

Archive SHA-256: `76edb6c40500498067dd0c1b478001f1c07165e3df51c55941463d608674ef8e`; package manifest SHA-256: `e6c5a4aaf4eda5e34e5781ea95c835c43c2a17596db96f24753cafdc0e7f3b05`; 1,813 archive members. Node 26.12.1, Bun 1.4.3 and Chromium 153.0.8010.12 each passed all 14 installed replay cases. Raw receipt hashes: Node `1f9842d646f8c1cd5995e18ccd4f2e5fa6c71815d75737f9b821d9c2e28bda96`, Bun `b112bc0c6d44ef21590c753b8a62e59ec16cb672d85d4adbdcf1c3a356990c90`, Chromium `bcb5fa303cc7eea182c9afa339a2e0567fe89ea3805660cd93bd04cf9baa40cb`.

The cohort's member map, package manifest and source-closure map are included. The corresponding Darwin cohort and exact two-cohort `/3` validator input/result are documented in the linked packet.
