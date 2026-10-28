---
ddx:
  id: umf.evidence.rust-migration.r8-access-rrf-current-source-20261027
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-074
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-postgres-search-rrf-20261027
      kind: informed_by
---

# R8 opt-in PostgreSQL search RRF current-source replay

This packet records fresh Node, Bun, and Chromium replays of five pure scoring
cases selected from the frozen nine-case Python `_finish` predecessor. All three
hosts passed with zero mismatches. The Node and Bun hosts ran the shared native
addon; Chromium loaded the build's WASM glue and binary.

The [Node receipt](node.json) records Node v26.12.1 and addon SHA-256
`a934d315a28e1da173e42e92866aaf9dda1434d95f043881e4df35b29f46399a`.
The [Bun receipt](bun.json) records Bun 1.4.3 and the same addon hash. The
[Chromium receipt](chromium.json) records Headless Chromium 153.0.8010.12,
its user-agent, and WASM artifact hashes. The five cases are the four frozen
pure-result cases plus a three-identity non-involutive key-order permutation
control. Ordered identities and exact binary64 score bits were compared by the
pinned harnesses.

The [receipt summary](receipt.json) binds these runs to build manifest SHA-256
`3fd773d003c1262542a404dbfcc83fbc6e8f444e484a8ec4035dbf281d5a8ece`, source
closure SHA-256
`757c36080591f98244010510a60ec20063135233aaf88de5114216bfe3da15aa`, and the
frozen predecessor packet SHA-256
`3e4467f63ff324c35fe4b46824a75d830608a03bf3ee08f722e85ddc370243a1`. The
builder verifies all source files and six build artifacts against that
manifest before writing these receipts. The raw runtime outputs were captured
separately and are reproducible by running the Node and Bun harnesses and the
Chromium harness against the pinned build's `wasm` package.

The previous packet is preserved intact in
[`historical/pre-copyjson-sparse-rrf-20261027/`](historical/pre-copyjson-sparse-rrf-20261027/),
alongside the earlier historical subdirectories.

This evidence qualifies only these current-source hosts and cases. It does not
establish installed SDK behavior, PostgreSQL execution, default routing,
release qualification, or archive claims. The four remaining predecessor cases
cover single-leg native score preservation/truncation, no-fusion arity refusal,
divergent-row equality refusal/error precedence, and target-defined fusion
refusal; those behaviors remain outside this scorer's claim.
