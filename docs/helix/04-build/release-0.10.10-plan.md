---
ddx:
  id: umf.plan.release-0-10-10
  type: implementation-plan
  activity: build
  authoring:
    home: repo
  links:
    - {id: umf.plan.release-0-10-9, kind: informed_by}
    - {id: umf.plan.release-0-10-7, kind: informed_by}
    - {id: umf.plan.rust-migration, kind: informed_by}
    - {id: ADR-006, kind: informed_by}
    - {id: FEAT-009, kind: informed_by}
    - {id: CONTRACT-080, kind: informed_by}
    - {id: CONTRACT-081, kind: informed_by}
    - {id: TP-001, kind: informed_by}
---

# Prepare source for UMF 0.10.10

## Scope

This change **only prepares source**. It advances first-party version pins from
0.10.9 to 0.10.10 and regenerates the canonical assets that embed the version or
compiler identity. No artifacts are built, nothing is qualified, nothing is
published, and no tag or release exists for 0.10.10. Semantic Core stays 0.10.0
and the metamodel and vocabulary identities are unchanged. This plan makes no
support claim for 0.10.10 beyond the local source checks recorded below.

The package READMEs follow the 0.10.9 wording and name 0.10.10 install commands
and release links. Those statements describe the intended cohort, not an existing
release; no 0.10.10 artifact has been verified to exist.

## Boundaries

- The 0.10.10 publisher controllers still refuse every admission. No 0.10.10
  admission file is created and the reviewed-validator profile for the 0.10.10
  candidate remains empty; both belong to a later reviewed change.
- Historical records stay unchanged: 0.10.8 and 0.10.9 admissions, 0.10.9
  evidence, the qualified-version and manual-only tag sets, and the successor
  qualification inputs. `umf-access` keeps its own 0.1.0.dev10 version; only its
  `umf-core` pin moves to 0.10.10.
- The exact native wheel size profile now also names 0.10.10. That bound is only a
  size profile, not qualification of any wheel.
- The Linux aarch64 platform is not in the closed release file roster and no
  Linux aarch64 artifact is planned or claimed here.

## Unknowns

- Whether the 0.10.10 native Mac and Linux x86_64 artifacts will build and pass
  qualification: unverified; no build was attempted.
- Whether the unchanged generated enforcement differs from 0.10.9 beyond the
  version and compiler provenance: only the local regeneration fixed-point checks
  recorded in the pull request were run.
- The reviewed validators, admissions and publication route for 0.10.10: not yet
  authored.
- Hosted CI at head `558e4f23ef`: the heavy Saga and Lakeview suites were not run
  (no `ci:full` label; the Actions budget is exhausted). `evidence-gate` failed
  because there is no `.ci/evidence/full-suite.json` and no `ci:full` label.
  `installed-identity` failed because `umf-core==0.10.10` is not on PyPI; that
  check, and any pull request touching `python/umf_access/**`, stays red on
  main until Core 0.10.10 is published. Access has not been tested against Core
  0.10.10.
- The compiler digest changed for two reasons: the bumped manifests and
  `crates/README.md` are compiler inputs, and the regenerated compiler-input
  manifest now lists the WASM loader files added by `1d40be0577`, which the
  manifest on main had not yet picked up.

## Exit criteria for this change

Version pins agree across package, Cargo, Python, release metadata and READMEs;
regeneration reaches a fixed point; release-version, metamodel, boundary and
controller policy checks pass locally. Release qualification and publication
require separate reviewed changes with their own evidence.
