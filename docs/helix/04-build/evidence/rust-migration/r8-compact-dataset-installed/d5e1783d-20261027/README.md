---
ddx:
  id: umf.evidence.rust-migration.r8-compact-dataset-installed.d5e1783d-20261027
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
    - id: CONTRACT-056
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-bounded-route-d5e1783d
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-dataset-values-compact-default-cutover
      kind: informed_by
---

# Compact Dataset validation replay on the d5 archive

The installed replay passed for `validateCoreDatasetValuesCompact` on the
existing private macOS arm64 archive from the d5 bounded-route cohort. The
replay compared all 17 frozen predecessor cases on Node 26.12.1, Bun 1.4.3,
and real Chromium 153.0.8010.12. It also compared host input admission and
proxy traces against `./reference`, checked detached source/input/result
copies, preserved caller-thrown proxy error identity without reading its
fields, and exercised structural/work limits and the paired 349/350 boundary.

The archive SHA-256 is
`7105a7f69118367cefe1e156481a6e3c85bad49c63157f1956f85dcef52383e2`, with
the captured fixed-point source closure
`d5e1783d7f615c8c1877df4f3d9ded43e68039f6b8f4d307e13ea79c190fa8f9` over
3,529 inputs. The manifest SHA-256 is
`d404215ee30a321696db27076dff46bc2908c17fe92d3ee43caf151bb3acb30e`; the
replay verified 1,802 listed archive members. This replay used the existing
archive and made no build or source change. These pins identify that archived
cohort; they do not establish that its source closure matches a later checkout.

The raw result is [receipt](receipt.json), SHA-256
`5b836124ab9fb7100894a7539e7712e9836ea7956186e69a949f91f142e84d9d`. The
replay harness is
[`compact-dataset-installed.mjs`](../../../../../../../scripts/rust-migration/r8/compact-dataset-installed.mjs),
SHA-256 `5a9e862b4a53f99bcee4e492a6f6dec86ad6a46f398fd68336264c48df2f4762`;
the frozen packet index is SHA-256
`e4be1c5ae280c98e445fbea33fdac308ccb7a567cfbc52e6f2d1f1221fe874b4`.

Reproduce against the retained private archive with:

```sh
bun scripts/rust-migration/r8/compact-dataset-installed.mjs \
  .cache/sdk-distribution/cohorts/d5e1783d/umf-sdk.tgz \
  d5e1783d7f615c8c1877df4f3d9ded43e68039f6b8f4d307e13ea79c190fa8f9 \
  docs/helix/04-build/evidence/rust-migration/r8-compact-dataset-installed/d5e1783d-20261027/receipt.json
```

This is a validate-only operation replay. `verifyCoreDatasetValuesCompact`
was not exercised; its single cumulative `ValueWork` parity remains open.
This receipt qualifies only the stated archive, operation, cases, and hosts.
It does not establish current-source parity, declaration retirement, full SDK
parity, or release qualification.
