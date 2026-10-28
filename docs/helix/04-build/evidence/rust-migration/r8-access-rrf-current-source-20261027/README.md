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

This packet records fresh Node, Bun, and Chromium replays of five cases from the
frozen nine-case Python `_finish` predecessor. All hosts passed with zero
mismatches. Node and Bun loaded the shared native addon; Chromium loaded the
refrozen build's WASM glue and binary.

The [Node receipt](node.json) records Node v26.12.1 and addon SHA-256
`9d8f741c7cb8392f312ee8df361182f78031ea6fb334ccab186ee06335089b5a`. The
[Bun receipt](bun.json) records Bun 1.4.3 and the same addon hash. The
[Chromium receipt](chromium.json) records Headless Chromium 153.0.8010.12,
its user-agent, and WASM artifact hashes `c12100fb…90c820` (glue) and
`c9ad376f…617e3` (binary). The replay compares four frozen pure-result cases
and a three-identity non-involutive key-order permutation control, including
ordered identities and exact binary64 score bits.

The [receipt summary](receipt.json) binds these runs to build manifest SHA-256
`2cd9bdb5bb32e43cb76a11fa3074e321e1c24777ff139e139f1311d21172dcff`, source
closure SHA-256
`7483d797dbf4a7cbb0dd538e02dca51ab4d7567bcf1939ad6cdb03b38ad87acf`, and the
frozen predecessor packet SHA-256
`3e4467f63ff324c35fe4b46824a75d830608a03bf3ee08f722e85ddc370243a1`. The
fail-closed builder verified all manifest-pinned source files, six build
artifacts, host versions, raw receipts, and predecessor packet before writing
the receipt files. Raw runtime outputs are retained in the task's temporary
directory and can be regenerated with the recorded Node, Bun, and Chromium
harnesses against the pinned build.

The preceding top-level packet is preserved in committed source revision `851f648bb` (manifest `7acacd541cb89814ca04f20d3443ac3b166290fac9d4a8bd1173876e8f5d0d87`, source closure `58faa724a3ca71315ab8337a8bc060841ba6a882797a8bbb85a22025f29b270b`). Earlier historical directories remain in place.

This evidence qualifies only these current-source hosts and cases. It does not
establish installed SDK behavior, PostgreSQL execution, default routing,
release qualification, or archive claims. The remaining predecessor cases
cover single-leg native score preservation/truncation, no-fusion arity refusal,
divergent-row equality refusal/error precedence, and target-defined fusion
refusal; those behaviors remain outside this scorer's claim.
