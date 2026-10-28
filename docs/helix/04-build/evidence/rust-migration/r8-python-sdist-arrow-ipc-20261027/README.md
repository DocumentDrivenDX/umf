---
ddx:
  id: umf.evidence.rust-migration.r8-python-sdist-arrow-ipc-20261027
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
---

# Offline Python sdist-to-wheel rebuild after Arrow IPC source closure repair

The prior hosted Python artifact job failed because the `umf-core` sdist omitted
`spec/extensions/arrow-ipc/package.json`, which Rust reads with `include_str!`.
The source archive list, Hatch force-include map, mirrored closure tests, and
verifier helper pin now include that exact authority. On macOS arm64 with
CPython 3.13.16, Hatchling 1.32.4, and Rust 1.90.0, the corrected
`umf_core-0.11.0.tar.gz` was extracted and rebuilt into a wheel with Cargo
offline. The sdist member's SHA-256
`2853107a7c644ef416a1b53b00ae35b3c476d99d7eec5b38c8d4b8f472d22aae`
matches the repository authority byte for byte.

The sdist SHA-256 is
`10775ff0b9106caf17b9846e759c4798baa24922ad413da0296618c7c62d3d97`.
The rebuilt `cp311-abi3-macosx_11_0_arm64` wheel SHA-256 is
`c2e17b302c4bddcf0c913d1abffdaaeef5ba616078d06f23c3917acf33dff17c`.
It contains `umf/_rust_core.abi3.so` and `umf/_bin/umf`. An isolated Python
import from an extracted wheel target loaded both `umf` and the native module.
The repository artifact verifier accepted its source payload, native/CLI
Mach-O arm64 profile, distribution version, and wheel tag; its raw
[verifier receipt](verifier-receipt.json) and the concise [local build
receipt](receipt.json) are pinned by [SHA256SUMS](SHA256SUMS).

The archive and wheel remain in local temporary storage and are not released
artifacts. This is one local macOS arm64/CPython 3.13.16 rebuild and import
smoke. It does not establish the six hosted release cohorts, a complete
installed test suite on this wheel, or publication readiness.
