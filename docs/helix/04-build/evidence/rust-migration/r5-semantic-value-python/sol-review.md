---
ddx:
  id: umf.evidence.rust-migration.r5-semantic-value-python.sol-review
  type: evidence
  activity: build
  status: accepted
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-078
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-semantic-value-python
      kind: references
---

# Independent Sol review: opt-in Python semantic validator binding

I reviewed the Python facade, PyO3 dispatcher, shared Rust wire operation, tests,
and source-bound receipt after the Luna implementation. The reviewed Python
module SHA-256 is `17c07b1ac6f6152f73d2065ef64785471b2a43684e40818a92f86efb20ac4b57`;
PyO3 source is `d981c1dd59e54678b362c5f11350b63203d0961d3e43ec84ce1557561fa12c69`;
and semantic wire source is `d6d96fd51b0a163fd0116ef1396332e56fa50b6c6753829d58c523c688926016`.
The source/installed-wheel hashes and exact host version are pinned in
[`receipt.json`](receipt.json). This review accepts only the opt-in CPython
semantic-value callback slice.

The review found a callback-provenance defect: the module-private
`_ReportWorkControl` class can be imported by caller code, so matching the
exception class alone let a validator spoof a terminal resource failure.
The dispatcher now requires the exact sticky fault instance created by
`report_work`; arbitrary caller exceptions, including forged
`UmfCoreError("RESOURCE_LIMIT")`, produce a semantic unknown. Callback
exception stringification is guarded. Reported work reaches the single Rust
`Context` on return, throw, or resource refusal. An invalid report remains
terminal even if the callback catches it.

I independently checked the source hashes, wheel native-member hash, and
receipt recomputation, and reran the focused installed-wheel suite on
CPython 3.11.17: 5 tests passed. Its hostile controls cover forged faults,
failing exception stringification, caught invalid work, cancellation,
reentrancy, UTF-16, frame limits, and aggregate validation. I corrected the
README's work/provenance wording and refreshed its source hash in the receipt.
The agent's Rust wire and cargo-check results remain identified as agent
executions in that receipt.

Large-registry work scaling, hard callback preemption, persistent registry
handles, browser callbacks, default routing, and final release compatibility
remain open. The source-bound receipt script currently names a temporary
wheel path, so it is a local replay receipt rather than a portable CI gate.
