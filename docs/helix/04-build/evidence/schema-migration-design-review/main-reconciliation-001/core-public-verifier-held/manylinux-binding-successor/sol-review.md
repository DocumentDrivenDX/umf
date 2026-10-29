# Core 0.10.2 public-download manylinux binding review

Verdict: **SOURCE ACCEPT for the affected bindings only; execution remains HELD.** No runtime, imports, AST, tests, Git action or repository edit was performed.

Current held workflow: `/Users/erik/.codex/worktrees/migration-r2-comparison/umf/.github/workflows/python-public-download.yml`, SHA256 `aa2619eb19a4dfa50311c72d25db5ea9a84dd17b4813e1c9119518093091dc3b`. Independently compared with the retained migration-evidence `core-public-verifier-held/python-public-download.yml.held`, SHA256 `a4e74814a707a9f43b5ff28e79269ee677aea6965f5a8874616209e1f40c8102`. The diff contains only the declared artifact/platform/build-source substitutions.

## Affected bindings

Linux now selects the actually qualified `umf_core-0.10.2-cp311-abi3-manylinux_2_34_x86_64.whl`, SHA256 `708f967747b0539b9ca7b6a5f39d1017eea8ddb1d07cd62f4f46592e088f6f39`; native remains `78dd1542f723b4f4d8c336c137caa478974a981ed759ada171a5877d7e0368a8`. These match the accepted run40359647952 output reviewed in `/private/tmp/core-0102-manylinux-artifact-sol-review.md` (SHA256 `3c5930be60da1671b4a963a3a37669d72b137f21b1c18ff82faf39ac4608a2d7`).

Separating `expected-artifact-platform: auto` from `expected-platform: linux_x86_64` is sound here: the runner remains Linux x86-64, while the unchanged closed payload verifier admits the selected repaired platform metadata. Exact qualified wheel SHA, exact public asset filename/URL/size and native SHA still gate installation. Thus auto is not authority to substitute an arbitrary platform or wheel. The one manylinux tag and actual ABI-floor evidence belong to the already reviewed repair artifact, whose complete bytes are pinned here.

Build-source revision now correctly names `a1b909d4f92da6604aeb21d3ea60e9a9943a7f87`; it remains distinct from the future release/tag commit M. Mac filename, wheel/native digests, runner and verifier mode are unchanged; its actual synthetic build commit and source-tree equivalence retain their prior receipts, rather than being relabeled as a1b. Distribution 0.10.2 and semantic Core 0.10.0 remain distinct.

No affected change alters the original two cohorts, 20-minute job bounds, six-module/254-test requirement, source/installed/posttest verification, clean environment, public-only download or bounded evidence recipe. Existing `asset_filename` checks remain consistent. `EXPECTED_RELEASE_COMMIT: HELD_UNTIL_PUBLICATION` still fails before checkout/acquisition, so this is not a dispatchable publication claim.

## Smallest later dispatch change

The currently unregistered manual workflow cannot be used as the operational dispatch path. After actual immutable publication and authoritative resolution of M, pin M and preserve the exact tag `python-v0.10.2`, a1b build-source ancestry and both selected artifact digests. Do not alter the released product/tag merely to register this proof harness.

Use one fresh, exact isolated push branch (for example `codex/core-0102-public-download-qualification`) for the harness H. Replace the manual-only trigger with that exact push trigger; set the fixed release tag directly instead of reading absent push inputs. Before checkout assert repository, `GITHUB_EVENT_NAME == push` and the exact branch ref, while retaining the pinned-M refusal and all existing tag/commit/public-release guards. Record H/run identity separately from M and S in the evidence; checkout still targets the published tag M, not H. Freeze and record the exact harness commit before the normal push.

Add only this exact branch to the existing broad-push exclusions and action-runtime push exclusion as applicable, preserving tags, PR/manual behavior and all normal gates. Inspect the final narrow trigger/identity delta before that single push; no default-branch registration or product version change is required. Publication availability, actual M, final harness source identity and these isolation edits are still outstanding, not inferred by this source acceptance. Keep the original caps and 254 assertions unchanged.
