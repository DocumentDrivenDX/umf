---
ddx:
  id: umf.evidence.rust-migration.r8-umf-access-installed-qualification
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-002
      kind: informed_by
    - id: CONTRACT-003
      kind: informed_by
    - id: CONTRACT-004
      kind: informed_by
    - id: CONTRACT-005
      kind: informed_by
    - id: CONTRACT-006
      kind: informed_by
    - id: CONTRACT-007
      kind: informed_by
    - id: CONTRACT-008
      kind: informed_by
    - id: CONTRACT-009
      kind: informed_by
    - id: CONTRACT-010
      kind: informed_by
    - id: CONTRACT-011
      kind: informed_by
---

# R8 `umf_access` installed artifact gate

The nonpublishing workflow at
`.github/workflows/umf-access-installed-qualification.yml` builds and installs
the prerelease `umf_access` wheel together with the exact `umf-core==0.11.0`
wheel, then records a host receipt. Its current matrix is CPython 3.14.8 on
Ubuntu 24.04 x86_64 and macOS 15 arm64. A successful receipt binds the access
source file inventory, installed wheel members, core wheel digest, resolved
versions and required import/export surface to one cohort. The checked-in
compatibility profile is a historical dev0 profile and does not match source
metadata at dev7. The gate refuses that mismatch explicitly; no receipt may be
interpreted as a pass until the profile has been regenerated and reviewed
against an installed dev7 artifact. For this one known mismatch it emits a
`blocked` receipt with a nonzero result. The workflow is manual-only while
this historical profile is stale, so it cannot make every access PR fail or
appear qualified. Restore PR triggering only after reviewing a regenerated
profile against the installed dev7 wheel.

The gate is separate from the existing six-cohort `umf-core` plus `umf-codegen`
aggregate. Those cohorts use CPython 3.11.17–3.13.16 and install the pair with
Pydantic 2.11.9; access requires Pydantic 2.13 or newer. Access's fixed
CPython 3.14.8 profile therefore cannot be silently folded into their receipts.
Integration requires a new, explicit shared host/dependency profile and receipts
covering the same exact source revision and run. Until then this is a distinct
installed-artifact gate.

This gate does not qualify public capture behavior, broader access semantics,
native driver behavior, all supported Python versions, release eligibility, or
publication. The existing six-cohort pair manifest remains `releaseEligible:
false`.

No hosted workflow has run from this source revision. Source inspection predicts
the current profile identity check will block (`0.1.0.dev0` versus
`0.1.0.dev7`); this is a deliberate fail-closed blocker. Blocked workflow
receipts include artifact hashes, source closure, host and toolchain identity,
but are not installed-semantic evidence. Local source edits are not execution
evidence.

The local verifier controls run with CPython 3.14.8: one synthetic pass checks
canonicalized `Requires-Dist`, exact core wheel digest and installed/import
origins; negative controls reject digest drift, wrong import origins and
dependency declaration drift, duplicate/traversal core-wheel members and
symlink members. A subprocess control invokes the verifier with
isolated `-I` and confirms the real historical-profile mismatch is retained in
a blocked receipt. These controls exercise gate logic, not a built package or a
hosted cohort.
