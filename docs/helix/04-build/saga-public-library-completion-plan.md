---
ddx:
  id: umf.saga-public-library-completion-plan
  type: implementation-plan
  activity: build
  status: complete
  authoring:
    home: repo
  links:
    - {id: FEAT-901, kind: informed_by}
    - {id: US-905, kind: informed_by}
    - {id: US-906, kind: informed_by}
    - {id: SD-901, kind: informed_by}
    - {id: TD-905, kind: informed_by}
    - {id: TD-906, kind: informed_by}
    - {id: STP-905, kind: informed_by}
    - {id: STP-906, kind: informed_by}
    - {id: CONTRACT-908, kind: references}
    - {id: ADR-006, kind: references}
---

# Complete the usable saga library and publish the product cohort

## Scope

The owner directs completion of functionality followed by a real product release.
This successor to the completed implementation, tightening and release-alignment
plans delivers a usable installed library path, fixes concrete uncovered defects,
and publishes fresh SDK 0.10.1 / Python 0.10.5 artifacts. It does not substitute a
qualification-only release for that product release.

FEAT-901, US-905/906, CONTRACT-908, SD-901, TD-905/906, STP-905/906 and ADR-006
govern behavior. Public product evidence and the two immutable successor
qualification releases remain historical. The installed HELIX 0.20.0 build-plan
template, prompt and metadata govern this plan's shape.

## Shared Constraints

- Core remains 0.10.0; actions and saga vocabularies remain 0.1.0 unless a concrete
  semantic correction requires a separately reviewed version change. Root owns
  exact SDK/Python metadata, builds, CI, merge and publication. The current
  release-series checker supports the selected patch tuple without decoupling
  core/SDK series or weakening its exact cohort checks.
- FEAT-901 excludes running a durable orchestrator inside UMF. The consumer owns
  execution and native authority. Do not invent a distributed service or promote
  the test PostgreSQL coordinator as a production SDK runtime. US-905 requires
  independent consumer conformance evidence, not a UMF hosting product.
- Four shared Rust operations already exist and the installed SDK's 19-vector
  corpus already exercises their public facade. Do not present those operations
  as missing, or duplicate the corpus to inflate completion evidence.
- Concrete consumer gap: the installed SDK test bootstraps WASM using derived
  package-root/internal dist paths although the existing default loader supports
  public initialization. Use and document that public path in clean installed
  consumers; no new loading API is justified by the unnecessary test workaround.
  Declaration content never selects executable code.
- Preserve exact values, unknown content, safe refusal, executionVerified:false,
  current authorization and original invocation custody. Reuse shared Rust
  semantics. A discovered semantic defect must be fixed and independently tested,
  rather than waived through narrower documentation.
- Inspect the existing boundary baseline before dependent changes. Use
  `bun run check:rust-boundaries` locally and in selected CI, retaining allowed/
  forbidden import controls and refreshing inventory only for actual source
  changes. New public loading must not expose native APIs to portable semantics.

## Implementation Slices

| Slice | Governing area | Depends on | Ownership / work | Validation gate |
| --- | --- | --- | --- | --- |
| P0 | FEAT-901/CONTRACT-908 scope and baseline | None | Sol review; root and Luna inspect concrete gaps against shipped operations, packaging and actual tests | Separate a real defect or unsupported public use from deliberately excluded host functionality; record findings without inferring failure from stale historical status labels. |
| P1 | Public initialization and installed lifecycle; TD-906/US-906 | P0 | Engine Luna owns installed JS lifecycle witness; Sol owns guide changes | Clean installed consumer uses the existing default public loader without package-root discovery/internal dist imports, then authors, inspects, edits, exchanges and assesses one declaration. Independent expected result/source preservation and deliberate refusal are asserted. Host controls initialization; no new loader API or semantic fork. |
| P2 | Actual semantic/native defect corrections, if discovered | P0; parallel with P1 | Assigned Luna owner; Sol reviews governing clause and failure proof before root integrates | Each concrete defect has a reproducer, corrected implementation and independent expected outcome. Existing reference-consumer authority/finality profile is preserved. No speculative production-host architecture is added. |
| P3 | Documented usable product and exact patch cohort | P1, P2 disposition | Sol: saga usage guide; root: SDK0.10.1/Python0.10.5 manifests/resources/release inputs; Luna: installed Python witness where needed | Runnable JS and Python examples use supported installed imports; documented CLI invocation/limits are accurate. Version/package/resource integrity checks pass with core0.10.0 and vocabulary0.1.0 unchanged. |
| P4 | Frozen artifact qualification and adversarial review | P3 | Root executes; Sol reviews; Luna fixes changed material | Fresh exact SDK/WASM, native CLI and Python wheel/sdist cohort passes installed qualification, independent portable vectors, affected native action/saga lanes and boundary gates. Selected/rebuilt Python wheels bind actual installed payload. Exact candidate bytes and source are recorded before publication. |
| P5 | Merge and publish usable products | P4 | Root | Merge qualified source, publish fresh SDK/Python releases and PyPI via owned route, compare public bytes, then clean public-install lifecycle checks. Preserve previous immutable products; do not upload new bytes under old versions. |

## Execution Contract

Implementation and publication are authorized; Sol plans/reviews and Luna performs
assigned implementation in parallel. Root coordinates shared files and owns git,
CI and releases. No tracker is selected. Continue ordinary fixes through the gates;
an unresolved material authority conflict or required scope expansion is routed
to root. Do not stop after a proposal or another evidence-only publication.

Aggregate comparable usage and a team meter are unavailable: estimate unknown.
The owner supplied no token budget and the runtime exposes no enforceable
team-wide ceiling. Do not describe an invented number as a measured estimate or
enforced limit. Root owns execution controls and any subsequent spending
disposition. Review once, then only changed material and affected dependencies
after concrete failures or fixes.

## Continuation Evidence

Revision 3: active. Root selected SDK0.10.1/Python0.10.5 within the existing 0.10
release series. Direct inspection corrected the initial loading-gap hypothesis:
the public default WASM loader already works, so P1 removes the test workaround
and documents the supported path rather than adding another API. Native Luna
reproduced a provider-registration conflict: the execute path returned a result
outside its schema, threw, and left original ticket custody pending in running
phase. The correction returns schema-valid indeterminate and uses the existing
atomic original-response/unknown-ticket transition to reconciling. The regression
checks blocked dependent work, original control recovery, independently retained
conflicting provider intent, zero native outcomes and unchanged business entity.
The same-family audit also found ticket IDs incorrectly returned as control
recovery references by execute/reconcile/resolve. All admitted unknown branches
now return their original host-issued control capability. Recover-control returns
the retained indeterminate result through its allowed unknown union rather than
wrapping it in an invalid recovered-result shape. Original ticket custody and
current authorization remain separate and unchanged.

Revision 4: P0–P3 complete; source review accepts freeze. Three focused native
cases pass 66 assertions, including exact capability recovery and the pending
ticket barrier. A new claim may reissue the same original invocation; it cannot
execute a later step or create another ticket. Independent provider queries
confirm the conflicting original request, no action outcome and unchanged entity.
Installed SDK checks passed the existing 139 cases and 19 vectors plus strict
TypeScript/public-default-loader lifecycle; selected Python passed 45 existing
checks and two new lifecycle checks. Source-rebuilt Python qualification and the
fresh full cohort remain P4 gates, not completed release claims.

Sol executed both guide examples unchanged using the installed candidate SDK
and selected Python0.10.5 (`-I -B`). Each completes declare/edit/exchange and
returns valid/complete assessment with deliberately unknown claims and
executionVerified:false. The design allocation source correctly refused a safe
declaration because its interpretation is incomplete; the runnable guide now
selects the already retained complete recipe fixture instead of weakening that
refusal. Full source/replacement preservation and exact edited-identity selection
are asserted in the installed witnesses. Package/resource/version metadata and
the 43-input custody roster reflect the new cohort. Next: root refreshes boundary
inventory, freezes source, qualifies exact artifacts in CI and publishes P5.

Revision 5 — 2026-11-01: P4 complete. Qualified source
`90cb61eb63aec3f5a77b5991a56e3dfc3d10bd27` passed
[CI 41269415988](https://github.com/DocumentDrivenDX/umf/actions/runs/41269415988)
and merged through [PR #80](https://github.com/DocumentDrivenDX/umf/pull/80) as
`a42c64ada9f5d85f8e3582cc9706bc3e33b4e334`, preserving the exact qualified tree.
Sol independently accepted source, complete hosted log, Linux retained artifact
and macOS cohort. Native actions passed 125 tests / 1,997 assertions, portable
actions 63 / 513, and saga/oracle/custody 60 / 768. Each of five portable host
roles passed 19 vectors; SDK passed 139 existing cases plus 19 saga vectors and
strict public consumer/lifecycle checks. Selected and source-rebuilt Python each
passed two lifecycle tests; selected Python passed 35 resource, four helper and
six installed-payload checks. Exact 43 input hashes, 23 retained files and 24
checksum rows were verified separately in each platform packet.

The original hosted artifact is 13069436184, 97,667,686 bytes, SHA-256
`109c54dcceba56f01191d6f854b83ab435cf8afe0b88a82b13b568b9aaaff113`.
The [completion evidence](evidence/saga-public-library-completion/README.md)
records reviewed artifact hashes and qualification limits. The normal immutable
SDK 0.10.1 and Python 0.10.5 GitHub releases target exact qualified source; root
reports server asset digests verified and all Python release assets downloaded
and matched. At this checkpoint P5 still required full SDK public-byte/consumer
verification and PyPI/public-installed consumer results. The pre-existing manually disabled PyPI
dispatcher is not enabled by this scope; root uses the owned main-branch OIDC
publisher. Historical formal 43-check evidence is unchanged: the fixes implement
existing control/finality requirements and do not constitute a new TLC run.

Revision 6 — 2026-11-01: P5 and the goal are complete. All 13 SDK and ten Python
GitHub assets were downloaded and matched against staged bytes/checksums; both
immutable product tags resolve to exact qualified source. The public Linux-built
SDK passed a fresh macOS installed strict TypeScript check, 139 existing cases,
19 saga vectors and the positive/unknown/registry-refusal lifecycle. Owned
[OIDC run 41271459809](https://github.com/DocumentDrivenDX/umf/actions/runs/41271459809)
passed release verification, publication and a clean Linux public-index consumer.
Independent registry metadata and downloads match all three Python archives.
A fresh macOS public-index Python0.10.5 install confirmed site-packages/native
origin without direct-URL metadata and passed 19 vectors plus two lifecycle tests.
Its actual binding receipt records 44 installed files / 36 package files, stable
before/after; candidate installation receipts separately record 46 / 36. These
counts describe different installer metadata cohorts, not a payload discrepancy.
The [final evidence](evidence/saga-public-library-completion/README.md) links all
source/artifact reviews, publication and public-consumer receipts. Final review
is clean; no required functional, qualification or publication step remains.

## Validation Plan

- [x] Concrete gap inventory distinguishes promised behavior from excluded host work.
- [x] Installed public loading/lifecycle examples pass without internal imports.
- [x] Actual uncovered defects have independent failure and correction proof, or P2 is explicitly closed with no defect found.
- [x] Canonical documents describe delivered APIs and retain governing semantics.
- [x] Exact fresh candidate artifacts pass required shared/native/installed checks.
- [x] Public product bytes and clean SDK/Python consumer installation pass after publication.

## Risks and Rollbacks

| Risk | Impact | Response | Rollback |
| --- | --- | --- | --- |
| User receives another evidence release instead of usable products | High | P5 requires SDK/Python publication and public consumer checks | Keep prior immutable products available; correct release metadata without overwriting bytes. |
| Consumer initialization introduces artifact-supplied executable loading | High | Use the existing trusted public initialization path; preserve portable inertness tests | Revert the faulty consumer example; retain existing initialization semantics. |
| Scope completion falsely requires a hosted orchestrator | High | Apply FEAT-901 exclusions and host/library ownership explicitly | Remove invented host work; finish concrete portable/public-consumer defects. |
| New binary bytes lose qualification custody | High | Freeze source and bind exact installed/artifact bytes before publication | Rebuild/requalify a new candidate; never relabel old receipts. |

## Exit Criteria

- [x] P0–P3 complete with no uncovered required functional defect remaining.
- [x] P4 review and qualification pass against exact final artifacts/source.
- [x] P5 publishes SDK0.10.1/Python0.10.5 and verifies public consumer behavior.
- [x] Final evidence records limits, source, runs, artifact identities and immutable prior releases; no material blocker remains.
