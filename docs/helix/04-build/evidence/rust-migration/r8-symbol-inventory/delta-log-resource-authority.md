---
ddx:
  id: umf.evidence.rust-migration.r8-delta-log-resource-authority
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
    - id: CONTRACT-018
      kind: informed_by
---

# R8 Delta log report-schema authority

This bounded family covers the known-action field grammar (CONTRACT-018
US-018-AC10, lines 279–290), Parquet action projection (AC15, lines 436–448),
sidecar reconciliation report (AC16, lines 460–466), and multipart checkpoint
report (AC19, lines 550–562). Each of the four output resources has a direct
public export in `src/index.ts`. The ledger pins the exact generator, governing
contract, direct input schema bytes, transitive Delta/Parquet schema bytes,
generator sources and SDK package closure for each resource.

The transitive composition is explicit: `action-schema.json` reads the Delta
table context schema and the action inspection schema; the Parquet action
report reads native JSON, inspection and Parquet values definitions; Parquet
values composes physical and row schemas, which compose levels/pages/framing
and Parquet metadata/IDL inputs. Sidecar reports compose reconciliation and
Parquet action schemas. Multipart reports compose the Parquet checkpoint,
which embeds reconciliation, sidecar and action reports. These pinned input
resources are byte dependencies only: this evidence does not assign authority
to any upstream resource outside the four named outputs.

The four direct writers now accept `--check`: they compare their deterministic
rendering against existing bytes and fail on drift without calling a write.
`delta-action-schema.ts` also checks its companion action-inspection output;
the focused test checks both bytes remain unchanged. Source/build closure checks
the four `src/index.ts` exports, `scripts/build.ts` copying `spec/` to
`dist/spec/`, and the Python archive traversal of `dist/`. Installed package
bytes remain unqualified.

| Generated resource | Generator | SHA-256 |
| --- | --- | --- |
| `spec/extensions/delta-log/action-schema.json` | `scripts/delta-action-schema.ts` | `9b0472f52235103366dcd707c68bc7bcbb830fb9aea3361fde4f37932d9e586a` |
| `spec/extensions/delta-log/parquet-actions.schema.json` | `scripts/delta-parquet-actions-schema.ts` | `5b080b56bfad836194e34f8ba55be55e0c37ec0f93b3f7b39c0049eecfa34494` |
| `spec/extensions/delta-log/sidecar-reconciliation.schema.json` | `scripts/delta-sidecars-schema.ts` | `04248983885f7514a20d3c0b45a1afa545638e47a40b5703c9cb1fac0ec3acc3` |
| `spec/extensions/delta-log/multipart.schema.json` | `scripts/delta-multipart-schema.ts` | `2126e8a2797fdc4c1c13c5d47d86323f5d87a19f878e6f149f9ec2365d1a8077` |

Validation: all four generator `--check` commands passed; the generated ledger
check passed; focused R8 tests passed 13/13. Ledger SHA-256:
`2507187db4b57294e0856cf7f8ee48d12337b2bd1fed87439f58c52f162a559b`.
Resource-authority counts are 18 generated-known, 13 authored-known, 105
candidate-generated and 62 unresolved aliases. The overall inventory cohort is
still moving, so these counts are this checkpoint only; the parent will recapture
the final fixed point. This bounded update leaves other resource authorities
untouched.
