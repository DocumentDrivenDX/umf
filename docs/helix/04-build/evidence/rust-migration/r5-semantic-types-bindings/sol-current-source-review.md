---
ddx:
  id: umf.evidence.rust-migration.r5-semantic-types-bindings.sol-current-source-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r5-semantic-types-bindings.current-source-replay-2026-10-24
      kind: informed_by
    - id: CONTRACT-078
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
---

# Sol review of current-source semantic-type host packet

I independently checked the clean Node tarball SHA-256
`8b2379268c2573116f45c588f9c8b029d712b395add28696f67c3202827cf351`,
installed addon SHA-256
`16fcd40b9db77d1766736a5aa387593c20d2f207debe54dc70e4367c110db609`,
and browser harness SHA-256
`8102335287b04b7f9b8c51106774f4f76d9c5a6101403d93b656d9f592b2f63d`
against the source-bound follow-up note. I independently ran the two focused
wrapper suites together: 15 tests, 68 assertions passed. The clean-installed
Node package replay passed all six opt-in semantic-type operations, including
the absent/null distinction, copy isolation, work refusal, cancellation and
deadline controls.

I independently reran both Chromium 153.0.8010.12 WASM scripts. The
six-operation semantic-type replay passed its undefined sentinel, isolation,
zero-work and cancellation controls without Node globals. The semantic-value
callback transport passed 14 direct, 10 registration and five aggregate cases,
including the reported-work and control-exception checks. This accepts those
opt-in host packets for the captured source and artifact cohort. It does not
resolve the frozen `vocabularies: null` error mismatch, broad registry scaling,
hard callback preemption, installed default SDK routing or TypeScript
retirement. The older `receipt.json` remains a historical cohort and is not a
receipt for the current worktree.
