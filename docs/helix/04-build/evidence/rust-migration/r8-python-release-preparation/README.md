---
ddx:
  id: umf.evidence.rust-migration.r8-python-release-preparation
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-python-coordinated-release
      kind: extends
    - id: umf.evidence.rust-migration.r8-release-pair-readiness
      kind: informed_by
---

# R8 local Python release-pair preparation

This slice adds `tools/prepare_python_release_pair.py`, a local, non-publishing
consumer for the aggregate receipt emitted by
`.github/workflows/python-coordinated-release.yml`. It reruns the existing
six-cohort verifier against the downloaded artifact tree and requires the
aggregate receipt's source revision, workflow run, six cohort receipts,
source/resource/sdist closures, verifier identity, and five deduplicated
artifact hashes to match. The resulting canonical JSON manifest pins both
platform `umf-core` wheels, the `umf-core` sdist, and the `umf-codegen` wheel
and sdist, plus their relative local paths and the aggregate receipt hash.

The tool has no upload, registry, tag, or publication operation. A prepared
manifest is local custody evidence only. It does not prove that the aggregate
receipt came from GitHub's artifact service; the caller must supply the
aggregate and cohort artifacts downloaded from the same workflow run. It does
not independently rerun hosted builds, inspect external registry contents,
provide rollback pins, establish consumer adoption, or close the broader R8
port gates. The existing Core-only publisher remains separate and is not
invoked.

Focused tests cover a deterministic valid manifest from absolute and relative
artifact paths, missing cohort, mixed source/run claims, altered artifact
bytes, wrong release versions, omitted platform wheel, and an unverified
aggregate field. Sol reran the module with the repository's Python virtual
environment; all 10 tests passed. This is local synthetic-fixture evidence,
not a hosted cohort or publication receipt.
