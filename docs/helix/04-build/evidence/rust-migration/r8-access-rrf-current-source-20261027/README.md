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
fresh source build's WASM glue and binary.

The [receipt summary](receipt.json) binds these runs to build manifest SHA-256
`ef5ff50e418a7060a2df814a226f9f66f7d4d3387a7b6a9d9622b092d9aa7f43`, source
closure SHA-256
`eb0a8cff53696e211dbec2b707751e1d872adc661906084986bad50914923618`, and the
frozen predecessor packet SHA-256
`3e4467f63ff324c35fe4b46824a75d830608a03bf3ee08f722e85ddc370243a1`. The
fail-closed builder verified all manifest-pinned source files, six build
artifacts, host versions, raw receipts, and predecessor packet before writing
the receipt files. See the individual [Node](node.json), [Bun](bun.json), and
[Chromium](chromium.json) receipts for runtime and artifact details. Raw runtime
outputs are retained in the task temporary directory and can be regenerated
with the recorded harnesses against the pinned build.

The prior top-level packet is preserved in Git revision `5999be676`;
[`historical/pre-domain-record-refreeze-20261027/`](historical/pre-domain-record-refreeze-20261027/)
retains its original checksum list and an exact-revision retrieval note.
Earlier historical directories remain in place.

This evidence qualifies only these current-source hosts and cases. It does not
establish installed SDK behavior, PostgreSQL execution, default routing,
release qualification, or archive claims. The remaining predecessor cases
cover single-leg native score preservation/truncation, no-fusion arity refusal,
divergent-row equality refusal/error precedence, and target-defined fusion
refusal; those behaviors remain outside this scorer's claim.
