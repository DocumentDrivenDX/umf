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
`compatibility-profile.json` remains the historical dev0 profile. The workflow
uses the separate `compatibility-profile-dev7-local-candidate.json`; it is
explicitly scoped to local CPython 3.14.8 macOS arm64 installed-artifact
identity/import/export evidence and does not qualify hosted cohorts. The
workflow remains `workflow_dispatch` only until its hosted matrix has run and
those receipts are reviewed. The earlier dev0-versus-dev7 blocked receipt is
retained as historical evidence in `local-build-attempt-20261026.json`.

The historical local candidate was built from clean source archive commit `76aebded3`
with pinned build tools and Rust 1.90.0, then installed in an isolated Python
3.14.8 venv with exact runtime wheels. The candidate gate passed package
identity, `Requires-Dist` (including the optional extra marker), installed
core/access artifact origins and inventories, the exact core wheel digest,
runtime dependency pins, ABI and required exports. The local receipt is
`local-installed-artifact-candidate-20261026.json`. It is one local cohort and
does not establish hosted parity or release eligibility. Subsequent replay
found that its installed `generated_core.py` no longer matched the regenerated
current source. The former verifier compared installed files with wheel members
but did not compare those wheel members with the selected source tree. The
receipt remains evidence for its original archived source cohort only.

The verifier now requires an exact package-member and byte match between the
access wheel and a clean Git checkout containing the verifier. It records the
source revision, hashes the source package, qualification profile, verifier,
tests and workflow, and rejects symlinks. Its new `sourceClosure` and
`profileEvidence.receiptCohortMatchesLocalEvidence`
fields are prerequisites for the public `capture()` semantic harness. That
harness also checks the installed capture module's wheel-member hash and
origin before comparing four declaration outcomes with the pinned source
predecessor. The intended stage is `local-installed-candidate`, never release
eligible. The fresh clean-source [installed receipt](local-installed-artifact-current-source-20261026.json)
passes at source commit `f8284549896e5f0e33157c543e09d799db924307` with
access wheel SHA-256 `b42b410cd973c09066fcc48c1ff4e2ae4e14c7328066dc38f81bfa123dfaa647`
and core wheel SHA-256 `e9ad7cb196e0de0a166eb03eabf143be2b7eb2b1d7931e6423c5e1a39f477044`.
An isolated CPython 3.14.8 macOS arm64 runtime venv passed `pip check` and
the installed-artifact gate. The dependent [semantic receipt](local-capture-semantic-candidate-20261026.json)
matches direct, bound-parameter, optional-parameter and unsupported-carrier
refusal outcomes against the exact predecessor source SHA-256
`492f68954ca66f3fbd15eb008f7e1d6fa690829d9c31e3ec3d85ecb09a7e67a6`.
Both receipts set `releaseEligible: false`; they do not qualify other capture
shapes or hosted cohorts.

The separate [semantic extension receipt](local-capture-semantic-extension-20261026.json)
adds ordered multi-field projection and a compound, two-parameter predicate with
scalar projection to the original four-case comparison. It records successful
capture outcomes for the five positive shapes and the expected unsupported-carrier
refusal, with exact installed/predecessor structural equality. The extension used
the already installed dev7 wheel from the recorded `f828454…` source cohort and
the frozen predecessor digest above; its updated qualifier/control hashes belong
to the current checkout and do not constitute a new wheel build or clean-source
installed receipt. It remains one local CPython 3.14.8 macOS arm64 semantic
comparison, with `releaseEligible: false`.

The gate is separate from the existing six-cohort `umf-core` plus `umf-codegen`
aggregate. Those cohorts use CPython 3.11.17–3.13.16 and install the pair with
Pydantic 2.11.9; access requires Pydantic 2.13 or newer. Access's fixed
CPython 3.14.8 profile therefore cannot be silently folded into their receipts.
Integration requires a new, explicit shared host/dependency profile and receipts
covering the same exact source revision and run. Until then this is a distinct
installed-artifact gate.

The identity gate alone does not qualify public capture behavior, broader access semantics,
native driver behavior, all supported Python versions, release eligibility, or
publication. The existing six-cohort pair manifest remains `releaseEligible:
false`.

No hosted workflow has run from this source revision. The retained initial
blocked receipt records the earlier dev0-versus-dev7 mismatch; the checked-in
manual workflow now targets the separate dev7 candidate profile. Local
evidence is not a hosted matrix receipt, installed semantic conformance, or
release eligibility.

The local verifier controls run with CPython 3.14.8: a synthetic pass checks
canonicalized `Requires-Dist`, including reordered bounds and the optional
extra marker; the verifier also imports `umf._rust_core.abi3.so` explicitly
and binds its origin to the installed core wheel. Negative controls reject
digest drift, wrong import origins, dependency and marker drift,
duplicate/traversal core-wheel members and symlink members. A subprocess
control invokes the verifier with isolated `-I` and confirms the real
historical-profile mismatch is retained in a blocked receipt. Eighteen
installed-verifier and eight semantic-harness controls pass under the pinned
qualification environment. These controls
supplement, but do not extend, the single local installed-wheel cohort.
