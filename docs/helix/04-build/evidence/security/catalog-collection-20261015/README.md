# Atomic pure collection renderer evidence

Baseline: `20cf9f112df8b56d9ad0a5fa687f9275fece19a0`. The private renderer
executes the actual issued catalog program and owner read action over one fact
snapshot. It filters denied rows, and refuses the whole result on unknown,
conflict, recipe/output failure or exhaustion. Rendered Cells remain
`complete:false, authority:false`; no native/write/query credential is issued.

`bun test tests/security tests/adapters/gregorian-date.test.ts` passes 255 tests
and 3230 assertions. Strict TypeScript and the browser build pass. Development
logs retain the initial type-inference failure and earlier test runs.

The operation shares one fresh action/render literal ledger. Issued definition
contexts retain immutable original parameters/Fields without a compile budget.
Output capacity and retained framing/qualified references/escaped strings/profile
metadata are charged. Gregorian outputs retain exact profile context. Legacy
inline constants remain independent of null/absent/unavailable source input;
catalog recipes require present input, including constant/null-out.

Empty requested targets conservatively preflight potential source outputs.
Unconditional withheld output suppresses dependencies; unconditional transforms
suppress original/default-original dependence. Potential catalog recipe metadata
remains checked. Actual rows preflight effective dispositions before any Cell.
This does not claim full symbolic simplification of every source condition.

`formal.py`/`formal.json` retain fourteen conditional Z3 queries (eight UNSAT, six
SAT). Arbitrary-population and arbitrary-row laws assume complete faithful truth
and failure accounting and delayed publication. Definition-level inline/input
gates and shared charge arithmetic are not executable refinement proofs. No
native/source-authentication or total CPU/heap theorem is claimed. Independent
review controls and source mutations provide separate concrete implementation
evidence in the Astra archive. The pre-empty-output-preflight witness is retained
there; review prompted both source-preflight and transform-priority corrections.

The unchanged full gate is `bun docs/helix/02-design/spikes/security/acceptance.ts`
with the existing Z3 Python environment. Its expected nonzero result represents
required cases lacking implementations. `receipt.json` binds exact current source
and evidence hashes; `validation.json` is full freshness output and
`validation-summary.json` is command stdout. No assertion, command, timeout or
required acceptance case is weakened or promoted.

Remaining work includes catalog-aware graph before/after writes, exact read/blind/
vault permissions, query/compiler lineage, owner/current native authority and the
remaining backend acceptance cases. Full S24/S25 remain unqualified.
