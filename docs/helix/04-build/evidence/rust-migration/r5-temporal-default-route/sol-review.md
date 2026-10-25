---
ddx:
  id: umf.evidence.rust-migration.r5-temporal-default-route.sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r5-temporal-default-route
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-065
      kind: informed_by
    - id: CONTRACT-066
      kind: informed_by
---

# Independent Sol review: temporal default-root candidate

Sol inspected the V4 Node/Bun and browser root overrides, the N-API and WASM
temporal value admission, and the four direct Rust temporal results. Both
bridges parse the date or left operand before admitting the second operand,
matching the TypeScript predecessor's failure order. The wrappers reconstruct
the frozen profile results and the exact built-in `TypeError`/`RangeError`
class and message. No bare core date or timestamp gains implicit semantics.

Sol verified the private manifest's package entry, browser entry, N-API addon
and WASM SHA-256 hashes as
`0251b9cab09ef82f45b0c40ee3043a2c3be5f3791974ca71fc46ea7380e5715d`,
`3074429cea64f9b8dfbfaafa476e3035355d27f0a41120105ab45be7c8cd46c3`,
`b5adbf7c3281efaa4986e70e9995a953b0c24de4d35d5d39c942bf8eb8e0802f`,
and `2090ad0cde42aab4a69cb3015b028af36d4c724c7a3ce434c241cd3db3354d45`.
The captured live source tree hash was
`6c6b38652bbb2d8093de7d8e2b59a3419e59e154e7e4885a5fab488b4afd7f12`;
the derived private build tree was
`27af9a660d2911e0311e0dfcf848bc8da9db498e852ee816a7fa4a153d7b8b79`.
Sol also checked the implementation and route-test file hashes against the
[source receipt](README.md).

Sol independently reran the package-root differential on Bun 1.4.3 and plain
Node 26.12.1. Both passed exact error class/message, ten raw-host non-string
cases including revoked proxies, and date/left-before-second failure order.
The real Chromium 153.0.8010.12 rerun passed all 17 browser checks and found
no Node globals. The source-bound Rust wire suite passed 10/10 when the private
archive was built; an independent rerun against the moving worktree is pending
because concurrent Delta edits temporarily make the shared crate uncompilable.

This accepts the four selected default-root routes only for the captured
private artifact cohort. The manifest explicitly reports eleven generated
input changes and `source-drift-not-publishable`. The route scripts cover the
stated errors, raw hosts and selected successes, not the entire temporal
input space. A fixed-point source cohort, complete default-root regression,
Python/platform release matrix, `./reference` retirement and publication
remain open.
