# Current security gate replay — 2026-10-15

The first complete gate executed45 implemented cases from the unchanged158-required-case plan.43 passed. S12 failed with the runner's generic fresh-solver error; the selected historical interpreter currently reproduces a missing-Z3 import failure. The original runner masks child stderr, so the later import diagnostic supports the environment diagnosis and is not represented as original child output. P04 exceeded its60-second outer test limit. All113 unimplemented cases remain required failures. The failed gate and original plan are preserved byte-for-byte in first-failed-gate.zip. Its README distinguishes the separately recovered formal artifact from the failed S12 invocation.

A separate S12 replay with pinned Z3 4.15.4 passes84 observations. The unchanged isolated P04 runner passes806 observations, with container and volume cleanup, in65.101 seconds end-to-end (62.074 seconds inside its component receipt). These standalone executions do not replace the failed gate outcomes. Selected solver/runtime pins are retained; they do not prove a hermetic system runtime.

The sole plan change increases P04's outer harness budget from60000 to120000 milliseconds. No assertion, command, source binding, native permission, backend deadline, case identity, required flag or acceptance allocation changes. Independent Astra Ultra review finds no actionable issue; the original report, complete verification script and captured review inputs are retained unchanged. The reviewer did not repeat native or solver campaigns.

A second complete gate is running at this commit with the restored solver and reviewed budget. No passing result is claimed here. All158 cases remain required across34 criteria; P03/L03 remain unimplemented. Complete backend qualification and broader stale-evidence repair remain open.

Reproduction uses the existing gate interface, with an explicit isolated solver:

```sh
python3 -m venv /private/tmp/umf-security-proof-current-20261015
/private/tmp/umf-security-proof-current-20261015/bin/python -m pip install z3-solver==4.15.4.0
UMF_Z3_PYTHON=/private/tmp/umf-security-proof-current-20261015/bin/python bun docs/helix/02-design/spikes/security/acceptance.ts
```

The full gate is expected to remain failed while required implementations are missing. Its per-case execution receipts, not a standalone component total, determine accepted cases.
