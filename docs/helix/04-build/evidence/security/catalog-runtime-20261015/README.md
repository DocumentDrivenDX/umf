# Canonical action/disposition runtime: qualified evidence

Baseline: `8267602757147035ec4257ee760f615c3d8e2aac`. This private component
consumes actual issued source programs. It evaluates logical action decisions and
effective source dispositions over pinned typed Record/graph facts. It returns
`complete:false, authority:false`. It does not render Cells or authorize native
queries, writes, reversals or vault operations. Host pins and completeness flags
are attestations, not authenticated credentials.

The root regression command is `bun test tests/security tests/adapters/gregorian-date.test.ts`: 244 tests, 3178 assertions. Strict types and browser
build pass. `security-regression-initial.log` also retains an earlier run with an
unmatched Gregorian test path; the final command includes the actual adapter test.
The reference compatibility before/after logs and original helper are retained.
Opaque non-record references remain metadata, with no inferred domain/FK meaning.

`formal.py`/`formal.json` retain nine Z3 queries: five UNSAT and four SAT. The
arbitrary-witness existential results assume the same complete population and
validated F/T/U values. Disposition/budget laws assume faithful source
correspondence and precharging. They do not prove executable/native refinement,
source authentication, total CPU/heap bounds, rendered Cells or write enforcement.

The independently authored Astra Ultra oracle, actual Bun/Chromium executions,
mutants, source capture and the pre-correction composition-work witness are
retained separately. `receipt.json` binds final source and evidence hashes and
records the actual acceptance/freshness results.

The unchanged acceptance command is `bun docs/helix/02-design/spikes/security/acceptance.ts`, with the previously configured Z3 Python environment.
Its expected nonzero exit represents required cases without implementations; no
assertion, command, timeout or acceptance status is weakened by this component.
`validation.json` is the full freshness validator output, while
`validation-summary.json` is its command stdout. Four scoped HELIX artifacts
validate; the global plan retains its pre-existing two blockers/twelve warnings.

Remaining work includes atomic pure collection rendering, source-aware original
read/blind-write/vault authorization, graph-aware original/proposed write checks,
exact backend owner profiles/current native authority, and all unbound cases.
No full S24/S25 admission is claimed.
