# Held native disclosure inspection — 2026-10-16

This increment adds the separate private `umf.security.private-disclosure-child/0.2-candidate` process. It retains the original atomic producer batch, applies the existing whole V2 inspector to the post-native reconstructed batch, and requires exact equality with that original batch. The 0.1 child and old query-child source remain unchanged.

Full security regression:332 tests,5929 assertions; tools TypeScript passes. Independent Astra Ultra review:143 process controls (all72 original vectors and exact16MiB inspection),69 session/scanner/clearing controls,19 new/0.1/legacy tests with812 assertions,10 builder/config negatives,8 CLI preflight negatives,3704 custody/correspondence checks. Exact independent bundle rebuild matches `d333226d9186136704d3f84a9c9dbfc44796efebab563dbc732d60337d2e03eb` with257 source/config pins.

HELD-001 exposed a replay CLI loader-custody defect: post-import pipe drift could still produce success with a misleading hash; adjacent bytecode could execute despite checked source. R2 executes captured pipe bytes directly and checks the pipe and wheel-manifest bytes again at close. Independent pipe and manifest drift refuse without receipts, while poisoned bytecode is ignored. R1 and all counterexamples remain retained. No actionable finding remains after R2.

The reproducible actual reviewed Python bridge replay covers52 retained native operations:47 data matches,4 structural refusals and1 whole V2 refusal after structural matching. Original native driver cells, exact key bag, original order, held Python parent/runtime handle and child cleanup are checked. These are fresh bridge/process executions over recorded native results; no new SQL was executed. The old standalone pipe remains4MiB;16MiB coverage is through direct child process controls. This is no installed Truss admission, authenticated caller/source/current-cut proof or guarded release evidence.

The root initial test failure was a fixture-name typo and remains in the original log. Correcting its label did not change implementation or expected semantics. The all72 vector fixture preserves original producer observations rather than inventing policy expectations.

Acceptance remains45 implemented of158 required cases,113 missing,34 allocated criteria. Exact correspondence of the accepted45's570 source pins passes; no required case is promoted. See the governing TD-056, STP-056 and implementation plan. `integration-witness.json` records retained artifact hashes and the independently verified review archive.
