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
`45116162b154da756e3abee5bd59fca9da345b761fd20c91e72891196f328209`, source
closure SHA-256
`9eb6c681a5cabf35d94394b2def87a159c15777b58877dc0070003fb16e71130`, and the
frozen predecessor packet SHA-256
`3e4467f63ff324c35fe4b46824a75d830608a03bf3ee08f722e85ddc370243a1`. The
fail-closed builder verified all manifest-pinned source files, six build
artifacts, host versions, raw receipts, and predecessor packet before writing
the receipt files. See the individual [Node](node.json), [Bun](bun.json), and
[Chromium](chromium.json) receipts for runtime and artifact details. Node and
Bun captures can be regenerated from the repository root with the evidence-only
[harness](harness/rrf-dist-replay.mjs), using the accepted private dist:

```sh
node docs/helix/04-build/evidence/rust-migration/r8-access-rrf-current-source-20261027/harness/rrf-dist-replay.mjs /private/tmp/umf-r8-domain-pack-fixedpoint-replay-final > /private/tmp/rrf-node.json
bun docs/helix/04-build/evidence/rust-migration/r8-access-rrf-current-source-20261027/harness/rrf-dist-replay.mjs /private/tmp/umf-r8-domain-pack-fixedpoint-replay-final > /private/tmp/rrf-bun.json
```

The harness loads `umf_core_node.node` from that dist and imports the pinned
repository helpers `bindings/core/node/tests/access-rrf-replay.js`,
`bindings/core/node/src/access-rrf.js`, and `bindings/core/node/src/wire.js`.
Those helpers are covered by the build manifest source closure; the packet
harness itself is evidence-only and is covered by this packet's checksum list.
The Chromium replay uses the existing
`bindings/core/wasm/tests/access-rrf-current-source.chromium.mjs` with the same
dist's `wasm/` directory.

The superseded active packet is preserved in [pre-domain-pack-route-replay-20261028/](historical/pre-domain-pack-route-replay-20261028/), with its original receipts, predecessor fixture, and checksum list. Earlier historical directories remain in place.

This evidence qualifies only these current-source hosts and cases. It does not
establish installed SDK behavior, PostgreSQL execution, default routing,
release qualification, or archive claims. The remaining predecessor cases
cover single-leg native score preservation/truncation, no-fusion arity refusal,
divergent-row equality refusal/error precedence, and target-defined fusion
refusal; those behaviors remain outside this scorer's claim.
