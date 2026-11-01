---
ddx:
  id: umf.actions-sagas-release-alignment-plan
  type: implementation-plan
  activity: build
  status: complete
  authoring:
    home: repo
  links:
    - {id: FEAT-900, kind: informed_by}
    - {id: FEAT-901, kind: informed_by}
    - {id: SD-900, kind: informed_by}
    - {id: SD-901, kind: informed_by}
    - {id: TD-905, kind: informed_by}
    - {id: TD-906, kind: informed_by}
    - {id: STP-905, kind: informed_by}
    - {id: STP-906, kind: informed_by}
    - {id: CONTRACT-900, kind: references}
    - {id: CONTRACT-901, kind: references}
    - {id: CONTRACT-908, kind: references}
    - {id: ADR-006, kind: references}
---

# Release qualification, align action/saga specifications and verify

## Scope

The owner authorizes “merge and release, then realign specs and iterate.” This
successor plan preserves the completed [implementation](saga-implementation-plan.md)
and [test-tightening](actions-sagas-test-tightening-plan.md) plans. First publish
the already qualified successor evidence; then correct the bounded design and
test-allocation discrepancies below and review fixes until no material blocker
remains. PRs #61 and #42 and unrelated repository work are excluded.

Governing artifacts are FEAT-900/901, SD-900/901, TD-905/906, STP-905/906,
CONTRACT-900/901/908 and ADR-006, linked above. The current source-bound
[tightening evidence](evidence/actions-sagas-test-tightening.md) supplies the
baseline; [PyPI policy](../05-deploy/pypi.md), `spec/release.json` and the exact
version guard govern publication identity. Catalog: installed HELIX 0.20.0
`workflows/graph.yml`; this plan follows its implementation-plan template,
prompt and metadata. It does not replace the broader project build plan.

## Shared Constraints

- Publish `actions-sagas-qualification-2026-10-31` at exact qualified source
  `d5fdfd606660accc9986c7c1c7c7d3929ed5b732`, with `latest=false`. Root owns
  publication and verifies public downloaded bytes before downstream edits.
  Preserve the original ZIP unchanged; its candidate wheels are retained test
  evidence, not an alternate public Python 0.10.4 product cohort.
- Keep SDK/core 0.10.0, Python 0.10.4 and actions/saga vocabulary 0.1.0. No product
  patch or replacement of immutable public bytes is required for these scoped
  test/tooling/docs changes. Do not republish candidate wheels to PyPI.
- ADR-006 retains shared Rust semantic ownership. TypeScript/Python/browser/CLI
  wrappers present the same operations; native coordinator/provider code remains
  a bounded host-owned reference consumer. No production scheduler, runtime
  behavior change, migration or weakened contract is authorized by this alignment.
- Preserve artifact IDs, unknown frontmatter and deliberate links. Correct
  material source/path/ownership/assertion discrepancies; stale lifecycle labels
  alone do not justify broad housekeeping. Future requirements stay requirements.
- Preserve historical release, component and formal packets. STP bytes participate
  in formal source-context hashes: allocation edits do not make old reports verify
  against the new context. No reused traces may be described as a new formal run.
  A transition/property/assumption change invokes TD-905's formal recheck triggers;
  do not introduce one under a documentation correction.
- Existing `bun run check:rust-boundaries` and its import negative controls are
  the boundary baseline, already qualified at d5. Review any new test imports
  against it before integration, refresh inventory if needed, and run the same
  check locally/CI where selected. Do not enlarge baselines to hide violations.

## Implementation Slices

| Slice | Area / governing source | Depends on | Owner / bounded files | Validation gate |
| --- | --- | --- | --- | --- |
| R0 | Publish successor qualification; release policy and completed tightening evidence | None | Root: custom GitHub release, original hosted ZIP, manifest, notes, SHA256SUMS | Exact tag resolves d5; latest=false; public assets match prepared hashes; manifest separates qualified d5 from merged/source-doc identities and old product releases. No product/PyPI mutation. |
| A1 | Shared semantic/package ownership; ADR-006, CONTRACT-908, TD-906 | R0 public verification | Engine Luna: TD-906, SD-901, FEAT-901, SD-900 | Actual Rust modules and wrapper boundaries replace fictitious locations/TypeScript semantic ownership. Describe contract-owned schema promotion through the real extension package generator, without claiming a core metamodel rewrite or duplicating authority. Keep unknown semantics and executionVerified:false. |
| A2 | Distinct completion meanings; US-906-AC14/CONTRACT-908 | R0 public verification | Engine Luna: STP-906 AC14, related A1 paragraphs | Allocate existing public native success and rejected-allocation/unwind tests, with independent provider outcomes and history assertions, to distinguish forward success from compensated termination without distributed atomicity. Portable assessment's executionVerified:false is only the boundary, not completion proof. |
| A3 | Native design correspondence and retirement witness; FEAT-901 SAGA-16, CONTRACT-901/908, STP-905 AC24 | R0 public verification | Native Luna: TD-905; existing retirement-before-admission case in tests/saga/protocol.test.ts; STP-905 only if its allocation needs correction | Replace nonexistent Python/planned modules with actual coordinator/provider/oracle boundaries. Extend the existing native scenario with independent provider refusal and retained original lookup/replay assertions, current authorization intact; no duplicate lifecycle flow. |
| V1 | Adversarial source/spec review | A1, A2, A3 | Sol: changed documents, test and affected dependencies; root executes checks | All four documentation findings and the native witness gap are individually resolved or have a concrete blocker. No annotation/count substitutes for assertion review; no weakened semantics or unproved platform/production claim. |
| V2 | Integration and iterative correction | V1 | Root: tests, selected CI, git; agents fix only owned changed material | Focused retirement test, relevant allocation/source checks and selected CI pass at final source; boundary/inventory remain valid. Re-review changed fixes and affected dependencies only. Record exact run/source identity and limits before completion. |

A1 and A2 share one owner and may be delivered together. A3 is independent and
may run in parallel after R0. Agents wait for root's public verification signal;
plan authoring itself may proceed before publication.

## Execution Contract

Implementation and release are explicitly authorized by the owner; root retains
git, CI and publication execution. Sol plans and reviews; the two Luna agents
own the bounded changes above. No additional tracker is selected. Ordinary fixes
within these acceptance gates proceed without repeated permission requests.
Escalate only a material unresolved authority conflict, a necessary new runtime
or contract change, or an action outside the authorized scope.

Comparable aggregate token usage and a team-wide meter are unavailable; estimated
usage is unknown. Use a provisional 30,000-token planning ceiling for this bounded
successor work, including implementation, checks and review; it is not an enforced
runtime cap. Check available usage at the release, first review and integration
checkpoints; report unmeasured usage honestly. If the ceiling is known to be
reached, preserve remaining work and obtain a disposition rather than silently
increase it. Review once, then re-review only fixes or new material evidence.

## Continuation Evidence

Revision 2: R0 complete; A1–A3 authorized. Baseline source d5 was qualified by
CI 41228219639 and merged through PR #76; completed tightening evidence records
the exact archive and source identities. Root reports PR #77 closeout merged.
The immutable [qualification release](https://github.com/DocumentDrivenDX/umf/releases/tag/actions-sagas-qualification-2026-10-31)
resolves to exact d5. Root's [public verification receipt](../05-deploy/evidence/actions-sagas-qualification-20261031/public-verification.json)
records all four public downloads matching GitHub digests and the published
checksum cohort, with `umf-v0.10.0` retained as latest product release. The original
ZIP remains SHA-256 `23f426eeabf44a99e4397d2737405e5a37b95c9bcc8758077ab106a77b2000e7`.
The original public [qualification manifest](../05-deploy/evidence/actions-sagas-qualification-20261031/qualification.json)
is retained alongside it.

Revision 3: A1–A3 source changes and V1 changed-material review are accepted.
The six existing artifacts preserve their frontmatter byte-for-byte. AC14 now
uses existing native success/compensated witnesses; the existing retirement test
adds independent provider refusal and retained lookup/redelivery assertions.
Focused native retirement checks passed 15, 3 and 6 assertions; typecheck,
package generation, coupled versions, coverage inventory and local boundary
checks pass. The boundary inventory records 627 modules / 453 active scripts;
636 source modules were checked with production core passing and zero findings.
No production runtime or contract
semantics changed; historical release and formal packets remain unchanged.

Revision 4: R0, A1–A3 and V1/V2 are complete. Changed-material review identified
and resolved three consistency defects: SD-900's superseded TypeScript engine
direction, STP-906's portable-only mapping introduction after allocating native
AC14 witnesses, and TD-905's obsolete planned-gateway wording. Final review is
clean; no additional journey or runtime implementation was introduced.

Qualified source `f02117a0e70067a745d514ee15d5c177f1e15987` passed
[CI 41254161733](https://github.com/DocumentDrivenDX/umf/actions/runs/41254161733).
[PR #78](https://github.com/DocumentDrivenDX/umf/pull/78) merged as
`3485208ab5a39f92fd4aec9cc408b2de0889325a`. The selected saga/oracle/custody
suite passed 59 tests / 751 assertions across eight files in 164.06 seconds,
including the extended retirement cut and both completion-meaning witnesses.
Six focused Rust saga tests, type/resource checks, package generation, coupled
version checks and boundary gates passed. The boundary gate checked 636 source
modules, with production core passing, zero findings, nine negative controls and
16 boundary plus 13 inventory unit tests.

The independently reviewed [hosted artifact 13062434024](https://github.com/DocumentDrivenDX/umf/actions/runs/41254161733/artifacts/13062434024)
is 12,132 bytes, SHA-256
`4883b15cdfcb4967845da5d92ba3baad6f02d29982ba7d20fc1a2e91aa874411`.
It retains the raw suite log, actual provider-platform observations, PostgreSQL
and handler image pins, and the bounded component observation. The provider
observations identify PostgreSQL 17.9 and the pinned image cohort. This artifact
does not replace the five-host installed qualification packet at d5: that broader
evidence retains its original source/artifact identity. No fresh all-host,
production-provider or formal-run claim follows from this selected CI lane.
Product versions, public product bytes and historical packets remain unchanged.
Aggregate token usage remains unmeasured; no enforced spending cap is claimed.

## Validation Plan

- [x] Public release tag, manifest and asset bytes pass independent verification.
- [x] A1 ownership/path/package statements agree with actual code and governing contracts.
- [x] A2 completion mapping names actual native forward-success and completed-compensation assertions, supported by independent provider/history witnesses; positive assessment inventories remain allocated separately.
- [x] A3 independently proves fresh retired admission refusal plus retained lookup/replay.
- [x] Focused native checks and final selected CI pass; boundary inventory/check remains valid.
- [x] Review finds no contract weakening, semantic fork or false current/formal/product claim.

Existing broad action/saga campaigns remain baseline evidence while their inputs
are unchanged. This iteration extends one native witness; use the existing CI
impact selector to run affected lanes rather than repeat all installed-host
qualification solely for prose changes. A newly failing test or concrete input
change can require broader validation. Record observed counts; never infer
all-AC completion from a suite count.

## Risks and Rollbacks

| Risk | Impact | Response | Rollback |
| --- | --- | --- | --- |
| Qualification release confused with a new runtime/Python distribution | High | Separate tag, exact source/CI manifest, no top-level product wheel assets or version bump | Correct additive metadata; preserve original immutable archives and product releases. |
| Alignment erases required behavior because current code is narrower | High | Review each change against CONTRACT-900/901/908 and FEAT-901; retain unsupported requirements/limits explicitly | Revert affected wording and resolve the authority conflict before claiming closure. |
| Native proof trusts coordinator history or duplicates a journey | High | Extend existing retirement cut; assert independent provider custody/refusal and exact retained original result | Revert only the faulty test extension, preserving its existing witness. |
| New allocation implies old formal evidence has current context | Medium | Keep captured historical context separate; apply recheck triggers only for semantic changes | Revert misleading claim; preserve original packets unchanged. |

## Exit Criteria

- [x] R0 is public and byte-verified with unchanged product releases.
- [x] A1–A3 resolve their named discrepancies without weakening governing semantics.
- [x] V1/V2 pass, required checks and review are recorded at exact final source.
- [x] Root merges the scoped alignment changes; no material blocker remains.
- [x] This successor plan records outcomes and limits; old completed plans and historical packets remain unchanged.
