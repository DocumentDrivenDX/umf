# SDK release merge M — bounded source-custody exception

ACCEPT the source-custody exception for normal PR48 merge M dce9b430422242edd135e69a7a64620d0244784e, tree8e040530334624efc7627bbb5288d1da471907ec, relative to qualified producer P e4299aff8e87e9d211f9d86df2f2013ab9c95945. P is an ancestor of M.

Independent Git diff confirms exactly one non-doc path differs: .github/workflows/microsite.yml. The complete delta removes its automatic push and pull_request trigger/path-filter blocks; workflow_dispatch and every byte from that entry through permissions/jobs/end remain identical. This is a CI execution-policy change inherited from main under the local-only/no-Actions instruction. All other non-doc product, generated, dependency, source-pin and SDK payload paths are identical. Do not claim all workflows or whole trees are identical P/M.

No product/SDK/full18/D5 rerun is justified by this trigger-only difference. Preserve exact P-bound producer receipts and record M separately, together with this delta. The reviewed H source requires clean P plus ancestry and exact remote M tag, rather than false whole-tree equality, so this exception is compatible with its source contract. The source-custody review does not assign an SDK tag or qualify public assets. Actual immutable publication and fresh bounded public-H download/install proof remain required.

Read-only text/Git metadata/blob review only; no candidate execution, tests, imports, AST/YAML parsing, Docker, Git mutation or Actions.
