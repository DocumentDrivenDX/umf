---
ddx:
  id: umf.evidence.rust-migration.r5-reference-links-inspection
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# R5 reference-links inspection checkpoint

This opt-in Rust operation inspects direct core references for a 0.10.0 source
document using inspection profile 0.3.0. It preserves each ordered occurrence,
including repeated links and opaque qualifiers; distinguishes absent references
from an explicit empty list; resolves the selected target identity, path, and
optional kind; and reports scoped `UNKNOWN_CORE_FIELD` warning paths. Link roles
remain unverified assertions. The default TypeScript route is unchanged.

`frozen-typescript.json` pins nine predecessor cases and the imported source and
resource SHA-256 closure. The focused Rust wire test compares successful values
and refusal code/message/path triples, then checks JSON and YAML source round
trips. `node.json` records exact Node-API parity; `chromium.json` records exact
real-Chromium WASM parity with Node globals absent.

Validated for this checkpoint:

- `cargo test -p umf-core-wire --test r5_reference_links_inspection`
- `cargo test -p umf-core --test r5_reference_links_inspection`
- release builds of `umf-core-node` and `umf-core-wasm`
- Bun 1.4.3 Node-API differential, 9/9 cases
- Chromium 153 WASM differential, 9/9 cases

Module and element lookup candidates, object-field visits, per-link warning
path scans, and every emitted link now charge the shared Context work meter.
The direct-core regression checks that repeated links increase measured work
and that a bounded host meter refusal propagates without returning a result.

The result schema's `$ref` to the core document resolves through the explicit
engine resource set. As with adjacent Rust inspectors, if an internally
constructed result unexpectedly violates its schema, Rust currently reports
the validator's first failure; TypeScript serializes Ajv's full error array.
That result-construction failure is not reachable in the frozen valid/refusal
cases. This checkpoint does not claim the full model family or native-reference
authority.

Artifact hashes: frozen TypeScript packet
`f7ec983b4a343161ffa4bbe57962ade268cb1cf211e6b12b9205369832e73757`; Rust core
module `b144fed06a007fae3398a392eccd3185447fd3f738222846ca1e56ff391c905d`;
focused wire test `e6d9439be95b087e44f15e0c0571bb4a342454ee1efeaa9c45a3fee13da70feb`;
meter regression test `5fc1533d72c5f1574a085061aa2c7736c8283879a422f01d7d20010fd4fc6089`;
Node addon from parity receipt `ea8edcdfbd3db51e0664773289c38235b1dc65c16b422ab6d9d4749eb88de727`;
WASM `face7bd6d38236d61ec7bf58e33c17f0e57b491a105dc2b38bd457c01b2a6167`.
The packet contains hashes for its full imported TypeScript/resource closure;
Node and browser receipts bind their outcome to the packet hash.
They also pin the relevant Rust core/wire sources, platform wrapper and bridge
sources, Cargo manifests/lockfile, test harness, compiler versions, target, and
build profile; the browser receipt includes the pinned `wasm-bindgen` version.

Independent Sol review replayed both focused Rust tests and the nine-case
TypeScript/Node differential, verified the source and resource pins, and found
no remaining P1/P2 in this bounded metering repair. It verified by source that
scan charges pass through the shared meter, cancellation and deadline checks;
the new runtime regression specifically demonstrates work growth and a late
meter refusal. The Chromium receipt records its own candidate build, but
concurrent changes to the WASM wrapper and restored binary after that capture
mean it is not evidence for the latest moving worktree. A final integrated
source-to-browser rebuild, installed routing and default cutover remain open.
