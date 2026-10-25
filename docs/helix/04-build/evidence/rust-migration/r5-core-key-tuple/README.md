---
ddx:
  id: umf.evidence.rust-migration.r5-core-key-tuple
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
---

# R5 core Key tuple encoding

This opt-in Rust module implements the current core 0.10.0 tuple operations:
`encodeCoreKeyTuple`, `verifyCoreKeyTuple`, `readCoreKeyTupleBytes`, and a
prepared-source handle with v1 encoding and profile-aware verification. It
retains the copied document, explicit Record/stable-Key identity, input wrappers,
key path, and exact bytes. It preserves unknown source content and refuses
unknown qualifiers relevant to the selected key, component references,
membership references, or facets. Context work metering and cancellation apply
to source admission, identity scans, value processing, schema checks, and
receipt serialization.

The opt-in `createCoreKeyTupleEngine` now routes standalone encode through a
retained Rust runtime and verify/raw-byte reads through its receipt-first,
single-use verification stage. Encode admits source, identity, and values
separately, runs Rust identity/current-version preflight, then admits options
and completes the operation while carrying the same host-control bridge and
Rust transport usage. This preserves the predecessor's per-argument 100,000
value ceiling and options-access order. The public generic model factory
remains eager and tuple-capable; the v4 default-root factory still omits tuple
methods while their package exports remain TypeScript. This change does not
select any default route. The fresh Node/Bun and Chromium receipt is
[direct-factory-route-receipt.json](direct-factory-route-receipt.json); its
source cohort, artifact hashes, 87+5 frozen outcomes, 4M-byte boundary, and
cumulative-work controls are pinned there.

The frozen predecessor packet contains 88 encoder cases and five receipt
verification cases, including the v1 normative vectors, scalar/domain
boundaries, malformed value/profile cases, v2 UUID and bits128 vectors,
malformed v2 text, padded-exponent normalization, lone-surrogate lexical inputs,
signed 32-significant-digit exponent boundaries, and stale/forged receipt
failures, crossed malformed-token precedence, and signed negative-zero
canonicalization. Rust compares complete envelopes and refusal code/message/path
triples for 87 encodable inputs plus all
five verification cases. The out-of-profile JavaScript Number vector is kept
with its TypeScript `NUMBER` refusal but marked as a Rust `Value` boundary:
`Value` cannot represent that number, so the Rust model operation cannot receive
it.

Checks passed on the recorded source state:

- `cargo test -p umf-core --test r5_core_key_tuple`: 5 tests passed.
- Focused `umf-core` library tests passed for signed exponent handling, preserved
  shared literal sign-inclusive bounds, and metered tuple normalization.
- `bun test tests/core/key-tuple.test.ts`: 8 tests and 256 assertions passed.
- `bun scripts/rust-migration/r5/freeze-core-key-tuple.ts`: regenerated the
  predecessor packet under Bun 1.4.3.
- A prepared integer-exponent test rejects meter invocation 70 and confirms the
  host control error remains marked as a control failure rather than becoming a
  lexical token refusal.
- Tuple-specific admission excludes the exponent sign from its 32 significant
  digits and matches the predecessor's rounding/expansion refusals. The shared
  literal parser retains its sign-inclusive bound; a mutation-sensitive test
  pins that contract. Tuple exponent normalization is metered before scanning
  and copying.

Independent Sol review reproduced the crossed malformed-token versus signed
32-digit exponent cases, the valid negative-exponent rounding and negative-zero
canonical bytes, and the unchanged shared literal sign bound. The reviewer
replayed five Rust tuple tests, 16 literal tests, the eight-test/256-assertion
Bun predecessor suite and the crossed cases, confirmed the source/test/packet
hashes below were stable, and found no remaining P1/P2 in this bounded core
slice. The review made no repository edits.

The source-only review above is a historical checkpoint. The successor
checkpoint below adds a bounded opt-in Rust wire/Node package route; it does
not change the package root or qualify Python, CLI, browser, or default
cutover. Key equality and tuple bytes do not prove native uniqueness or author
provenance.

The frozen predecessor closure includes the TypeScript tuple/UUID/bit128,
document/literal/JSON helpers, operation schemas, normative v1 vectors, focused
tests, UUID fixture, and CONTRACT-040.

SHA-256 pins:

- Rust tuple module: `39ff1dc7d353a3831664a0fc1281f1fc39011d87de4be0a88a52e29649184599`
- Shared literal helper: `34b8ae177fc38fc1ef70b78cbdcbcb9bda04446ccc7cf0fec6c253cf03e4d3c1`
- focused Rust test: `8489973b35da927d4d5e22b4ac145ca3ce7aee44a7894ba0565d306bf5cc8566`
- TypeScript freeze runner: `06854ba5630933a7007bf90c129aabfbe656b52bdd5a8b69ef40740fe8f00dfa`
- frozen predecessor packet: `1e0649ea8a723ce9f9836eceda2fd7cb83c6554bf5f01d908016baf0b69aefb5`

## Opt-in core-wire and Node package checkpoint

This checkpoint adds four Rust-dispatched tuple operations to the opt-in core
model route and exposes matching methods from the private `@umf/core-rust-native`
package: direct encode, receipt verification, byte extraction, and prepared
source. The repository package root remains unchanged. The candidate package
is `private: true`; its archive is review evidence, not a published release.

The frozen Rust wire matrix passes all 87 Rust-representable encoder cases and
five verification cases. Its one `integer-host-number` case is explicitly
outside the Rust `Value` profile. The installed binding replay substitutes the
unsafe JavaScript number and records the Rust boundary separately: `NUMBER`,
"Number outside the core interoperable numeric profile", path `/0`; the
TypeScript predecessor reports the same code/message at `/0/integerToken`.
This is a known host-boundary path difference and is not counted as an exact
match. The prepared Node handle deep-freezes only after Rust source admission,
then revalidates the retained source on each encode/verify wire call; this
does not cache validation work as the TypeScript implementation does.

Reading bytes returns the predecessor's `Uint8Array` at the Node wrapper, but
the shared tagged wire route limits byte arrays to `Context.max_values` (100,000)
and reports `LIMIT` at `/bytes` above that bound, even though the core tuple
encoder's byte ceiling is 4,000,000. This route-specific limit is explicit.
Rust tests pin precharge before copying/admitting prepared source and before
allocating/encoding returned bytes.

The macOS arm64 native candidate was built with the pinned Rust 1.90 toolchain,
`--locked --offline`, and an isolated Cargo target. Its package archive at
`/private/tmp/umf-r5-core-keytuple-install/umf-core-rust-native-0.1.0.tgz` has
SHA-256 `877ec9480964236e4fb275c2bdadc97c27b5084cc1b52f54ac1e733489bd9f66`;
the addon build has SHA-256
`4def550a00f4ec2e2af802e9a16592191216a51f47d2ca956ae942fc10c27cc3`.
The package was extracted and imported by package name. Node 26.12.1 and Bun
1.4.3 both exited 0 with 87/87 exact encoder matches, one separately recorded
out-of-profile number boundary, and 5/5 verification matches. Each host also
passed one byte-extraction check, prepared-source copy isolation and encode /
verify checks, and resource/cancellation/meter controls. Durable results,
archive members, and source hashes are in
[node-bun-installed-replay.json](node-bun-installed-replay.json), SHA-256
`7af991d267cde0dc0aecd2f620ab549a18ce1172c387fc29a86fcfaeb439ff23`.
Replay harness SHA-256 is
`f45243b7b5205adaf365619aa9834176f4a5596980eee89d70cdb7d01dd52695` for
the executed replay. A reporting-only update renamed its prepared-operation
summary to `routesEachOperationThroughWire`; the receipt records both hashes.
The routing claim is source inspection of the Node helper, not a separate
runtime counter assertion.
The WASM source mirror is present and its deterministic source check passes,
but this checkpoint does not claim a WASM/browser build or replay.

The focused wrapper suite passed 4 tests / 28 assertions, TypeScript
`bun run typecheck` passed, and the WASM source mirror `--check` passed.
The focused Rust wire suite passed 3/3, including the complete frozen
representable encoder and verifier packet plus resource-precharge controls
(462.12 seconds on this host). The replay checks every encoder outcome and the
five frozen verification outcomes; it performs byte extraction once rather
than repeating redundant verification and byte extraction for every encoder.

## Retained prepared binding checkpoint

The direct prepared-object implementation is present in the Node NAPI and
WASM bindings, but remains opt-in: no default root source-selection has
changed. Native and WASM Rust targets compile, focused handle-shape and
host-control tests pass, and a fresh WASM package replay ran in real Chromium.
The existing tagged request API cannot represent these two predecessor
behaviors without a route-specific exception: its structural value limit is
100,000, while Key tuple byte output is permitted up to 4,000,000 bytes; and a
prepared TypeScript object validates its immutable private source once, while
the wire route currently reconstructs Rust prepared state on every call.

The boundary is one target-native Rust object for each prepared
instance. Node exposes a NAPI class and WASM exposes an equivalent
`wasm-bindgen` class. The frozen JavaScript wrapper keeps that object in a
private closure and exposes exactly the predecessor's four own properties:
`profile`, `source`, `encode`, and `verify`. The Rust object owns one
`PreparedCoreKeyTuples` value (copied source and admitted diagnostics) plus
shared immutable `Arc` references to the Engine and Registry. Each prepared
instance owns its source and diagnostics without deep-cloning compiled
resources. Both bindings decode input, run core work, and encode tagged
results under the same fresh per-call Context and host-control bridge. The
public retained source snapshot is also encoded under the preparation bridge
and tagged-transport allowance. A focused Rust test proves that a retained
source with 100,001 UTF-16 units in one unknown-extension field round-trips
through `source_wire` with low node count; Node and WASM delegate to this
shared helper. There is no global token table, enumerable disposal property,
LRU, or new public handle-count cap.

Proposed operation surface:

```text
runtime.prepareCoreKeyTuples(source) -> PreparedCoreKeyTuples
prepared.source                       -> copied retained source snapshot
prepared.encode(identity, values)     -> CoreKeyTupleReceipt
prepared.verify(receipt)              -> CoreKeyTupleReceipt
runtime.readCoreKeyTupleBytes(receipt, current) -> Uint8Array
```

`prepareCoreKeyTuples` admits/copies the source and runs `source_validate`
exactly once using a fresh ordinary `Context` with the configured cooperative
controls. Tagged decoding, resource admission, source snapshot encoding, and
result encoding are charged through that same host-control bridge. It retains
the admitted Rust prepared value in the native object and
returns a frozen wrapper with a copied public `source` snapshot. `encode` and
`verify` invoke the existing Rust prepared methods on that retained value. Each
invocation constructs a new ordinary
`Context`; no counters, cancellation state, deadline, or work budget are carried
over from preparation or an earlier operation. Each call receives the runtime's
current host-control dispatcher and therefore preserves per-call meter,
cancellation, and deadline behavior. The admitted diagnostics are reused, as in
the TypeScript predecessor. A handle is not an authorization or current-store
assertion.

Dropping the NAPI or WASM object releases its owned Rust values; no external
registry can retain abandoned prepared instances. This preserves the
predecessor's object shape and avoids invalidating live instances at an
arbitrary capacity. If deterministic disposal later proves necessary, it must
be a separately named opt-in internal API, not an own property on the default
prepared object.

The byte operation returns raw bytes directly from the Rust binding. The Rust
core first performs the same receipt/current verification and 4,000,000-byte
ceiling check as the predecessor, then charges work for the returned byte count
before crossing the host boundary. NAPI returns a `Buffer`/`Uint8Array`; WASM
returns the generated `Uint8Array` from `Vec<u8>`. This skips JSON value-array
construction and its 100,000-value ceiling. It does not raise the ordinary
`Context.max_values` limit for source, receipt, or current-document admission.
The ordinary Context also keeps `max_text_units = 4,000,000`, `max_depth = 128`
and `max_constraint_steps = 5,000,000`; `max_work` is an optional host control,
not a `Limits` field, and must receive fresh accounting on each operation. Raw
bytes avoid counting a 2x hexadecimal representation against the text ceiling.
Allocation failure remains a `LIMIT` at `/bytes`. The boundary must check the
length before allocating/copying, and work/control callbacks use the existing
Context charging path (which chunks large charges, then checks cancellation and
deadlines). `HardIsolated` continues to fail with
`RESOURCE_PROFILE_UNAVAILABLE`; unknown profiles remain `RESOURCE_PROFILE`
errors. No fallback to the tagged array path is permitted.

The decisive parity packet for a future implementation must establish:

- Byte reads at 0, 100,000, 100,001, 4,000,000, and 4,000,001 bytes. The first
  four match TypeScript success/refusal outcomes exactly, except that 4,000,001
  is refused by the shared core ceiling; both targets return identical raw
  bytes for accepted values. Include allocation/precharge refusal before output
  allocation and cancellation at multiple copy chunks.
- One successful preparation followed by several encodes and verifies records
  one source validation, retains the same source snapshot after caller mutation,
  and matches predecessor envelopes and refusal code/message/path triples.
  Per-call meters reset, cancellation/deadline controls are fresh, and a
  per-call control failure does not poison the handle or another invocation.
- Foreign-source receipts retain the predecessor's stateless fallback refusal
  behavior; malformed receipts and stale source have pinned outcomes. The
  prepared object's enumerable own keys are exactly `profile`, `source`,
  `encode`, and `verify` in both targets, and garbage collection drops the
  underlying Rust object without an external registry.
- Bun/Node native and real Chromium/WASM runs use isolated freshly built
  packages, exercise identical cases, and pin the exact Rust source, generated
  NAPI/WASM exports, package members, and wrapper hashes. These establish only
  this interface's scoped parity; they do not establish SDK installation,
  release, or retirement.

The WASM target compiles for `wasm32-unknown-unknown`; focused Node unit tests
cover admission and output-control interruption, and shared wrapper tests pin
the frozen four-key object shape. The retained Rust byte-read handle separates
receipt admission from current-document access: a malformed receipt is rejected
before the host reads `current`, and both stages share the operation control
bridge. A target-width mismatch discovered by the full frozen packet was fixed:
decimal scale is encoded as full-width unsigned LEB128, and precision / integer
width comparisons saturate only above the target's addressable width (reachable
coefficients remain bounded by Context). The literal regression test and staged
wire receipt-order test both pass.

Fresh Rust 1.90 / wasm-bindgen 0.2.100 WASM and NAPI packages were replayed in
Headless Chromium 153.0.8010.12, Bun 1.4.3 and Node 26.12.1. Each runtime matched
all 87 in-profile encoder cases, checked the one out-of-profile host-number
refusal separately, and matched all five verification cases. The runs also
confirmed the prepared own keys are exactly `profile`, `source`, `encode`, and
`verify`; raw reads of 100,001 and 4,000,000 bytes; refusal of 4,000,001 bytes
(`LIMIT`, `/values`); 100,001-unit retained source snapshots;
receipt-before-current getter order; first-stage maxWork and meter refusal
without current access; and cancellation/meter/deadline behavior with recovery
where applicable. The frozen TypeScript packet SHA-256 remains
`1e0649ea8a723ce9f9836eceda2fd7cb83c6554bf5f01d908016baf0b69aefb5`.

Receipts and artifact hashes:

- Chromium outcome: `/private/tmp/umf-keytuple-browser/receipt.json`, SHA-256
  `1a53b59bd0de89dfdcf140cf895fef63d2ba57a08994128559878ec4a9c8d972`.
- Bun outcome: `/private/tmp/umf-keytuple-bun-receipt.json`, SHA-256
  `181db51df37648286eac65235d11377cf87769595d1d789533d6a70a1bc633dd`.
- Node outcome: `/private/tmp/umf-keytuple-node-receipt.json`, SHA-256
  `affef65997ec984d6b0448509c20968940d3490d848216e2fa79628b1b4be5e0`.
- Installed-package replay harness used for the older run: `/private/tmp/umf-keytuple-node-run/replay.mjs`, SHA-256
  `1e0146581b2f420eb55fde75061395136d001e549eb5dc933c8b35ae2ec49da4`.
- Fresh package entrypoints: Node `a94359b3dbdfb3691d9df174025e4bd08d81d7590fbdd6489b740ad3874b1594`; WASM
  `24a4928fdeebc5cbf1fa90501504ed767696d441f0b18a9a0f50f20414cb758a`.
- Chromium WASM binary and generated JS: `b792f4b68084543a7fb158240833915bcf1a67f6e9781b5b0a37ad323982065f` and
  `6d52a3b762a51decbc870e6477a370dd2d9e1928cd86acf93f6ba80c7a825f1e`.
- Fresh Node native addon: `0f28e89cb22107d122db3b0e53ce154335af3dc194c385d0be98ab7f42c2288d`.
- Core tuple and literal implementations: `5b473a014743863ff74d064653f454c6fdfda35e67fed89bae5bfcc9e96a67e5` and
  `cedfd806e8487c7a5dd684b809b19bc244bbc7d67ef94292509e75588c1ec47f`.
- Rust wire binding and focused wire test: `d98e4f974fbec1695341fb5a5fc77f14f728243becc60aa93aa581297f14daf9` and
  `fcc14a6d91fc30dfeef287bd7226b26f66e78a531798c0da1a9dfd7391fce1d0`.
- Frozen packet: `1e0649ea8a723ce9f9836eceda2fd7cb83c6554bf5f01d908016baf0b69aefb5`.

These are scoped implementation replays, not installed SDK qualification.
The retained tuple route now admits immutable resources eagerly at factory
creation. Host resource snapshotting and Rust Engine/Registry admission use the
factory's `resourceControls` ledger (or the factory controls when omitted);
each operation and prepared method receives a fresh per-call Context. The
retained runtime owns shared immutable Engine/Registry state, while each
prepared object owns its source snapshot and has exactly the predecessor's
four enumerable own properties. Rust moves the five decoded resource values
out of the transport object after charging the lookup work, avoiding unmetered
deep clones before Engine admission. The focused factory controls prove that
accessors are not invoked, setup `maxWork: 0` refuses, and later caller
mutation does not alter the admitted snapshot. This corrects the prior lazy
initialization blocker; default source selection remains held for independent
Sol review. Browser/Python installed qualification, broader resource bounds,
and source-distribution/release qualification remain open.

At the source checkpoint, hashes were:

- `core_key_tuple.rs`: `d3f82c374da48ff27da7869649342ea555b2197acdec684d0edd6eff2771e7f8`
- core-wire dispatcher: `c6806b21f8b7c8a2f34150b1188314f8749989e033ecc53b4dff48f209e7f68a`
- focused wire test: `a2baa844bd6336ecc5777432ba234a34a97fdfa77bd5eedcd8c671d39f654066`
- Node tuple helper: `684c01d780622a063f89356066e34ac7cb0bbed64cf5783dc3d163a7f77df438`
- Node entrypoint in the archive: `483d39b9399cf43f394caf5ccf3a9136ec86d31a02590ddc3a42ae39b9f7acfd`
- Node archive package manifest: `a8ce8e9e86e5b694c2f88e71dad9dcd67a6aea185b068b5edd31b42814b9cbd6`
- executed installed replay harness: `f45243b7b5205adaf365619aa9834176f4a5596980eee89d70cdb7d01dd52695`
- current reporting harness: `8900f6698fd70ac5d6788caa7f64a2fcd0b7336cb8ef76a92480fd05aa37986a`
- frozen predecessor packet: unchanged at `1e0649ea8a723ce9f9836eceda2fd7cb83c6554bf5f01d908016baf0b69aefb5`

Default route activation, browser and Python installed qualification, broader
resource bounds, and source-distribution/release qualification remain open.

### Eager factory revision replay

This receipt set supersedes the earlier replay hashes above for the eager
factory revision. Node 26.12.1 and Bun 1.4.3 each matched 87 in-profile cases
of 88 total encoder cases; one host-number case is separately pinned as an
out-of-profile refusal. Both matched all five verification cases and
receipt-before-current getter order, 100,001- and 4,000,000-byte reads, and the 4,000,001-byte
`LIMIT` refusal. Headless Chromium 153.0.8010.12 matched the same packet and
also confirmed the eager factory's accessor refusal, setup `maxWork: 0`, and
resource snapshot isolation. The prepared API own keys remained exactly
`profile`, `source`, `encode`, and `verify`. Cancel, meter, deadline, and
per-call recovery controls passed in the WASM replay; Node exercised
cancellation and meter refusal. These are opt-in scoped binding results, not
source-selection or release qualification.

- Node receipt: `/private/tmp/umf-keytuple-node-receipt.json`, SHA-256
  `a728cfccbd745fa1604486cfea5e63c6edcba46616fe721569a79188ba63ec60`.
- Bun receipt: `/private/tmp/umf-keytuple-bun-receipt.json`, SHA-256
  `087a5f21358187cea6d9be93563906ec6adbd9f41c52851d4272ec4453a2f28c`.
- Chromium receipt: `/private/tmp/umf-keytuple-browser/receipt.json`, SHA-256
  `efe70a7834d634c61fe271ec536bb5c8ca8bcfd2dd3620acd371fab6f5d57115`.
- Executed replay harness: `/private/tmp/umf-keytuple-node-run/replay.mjs`, SHA-256
  `4064fa00d309cef3d28359f9889b56aacd150cf1bb6c86facf5255e546802aa1`.
- Factory controls replay: `/private/tmp/umf-keytuple-node-run/factory-controls.mjs`,
  SHA-256 `25dc141ff5c49c919c9bf473746df9b6c1f0bc09bd541e85f7bee62bbcec97a7`;
  both Node and Bun receipts at `node-factory-controls.json` and
  `bun-factory-controls.json` have SHA-256
  `c186d8ff24e732ebfe74abea840416c6d6b935d39f6eeaa0979dbe45802e2bfb`.
- Factory cost harness: `/private/tmp/umf-keytuple-node-run/factory-cost.mjs`,
  SHA-256 `0d7b38cf39e32ace62ca07dafb8c6fd39a299318993b21088a1fb4c296d81b1d`.
  The final clean Node addon on this resource set measured 1.86 seconds
  and 401,221,260 charged work units. The host-side resource snapshot took
  7.19 ms and its second runtime wire encoding took 3.28 ms (649,508 encoded
  characters); most measured setup time/work is Rust resource validation and
  Engine/Registry admission, rather than the two JS passes. This is a concrete
  setup cost to keep in mind for callers that set a factory `maxWork` limit.
- Core kind/nullability inputs compiled into both final artifacts:
  `core_kind.rs` SHA-256 `97d239aceb03f7da69d1e3a409a679621430ced66d5015eed402cdb09277f5b4`;
  `nullability.rs` SHA-256 `911b5040fd4ae5db99b9d8ea687b6c024281c43c46a2c09ec8abbb74bcd38d9d`.
- Node entrypoint: `10d95d1e7e50d9d6a8d420b97e9d2e93449a712841c7dcc4dff91899616e1f6d`;
  retained Node Rust entrypoint: `520fb3594647ae1d2a27254b415d93f876baebb4ce9648025e157a410604c40d`.
- WASM entrypoint: `0c8faa29194bf679852ebc444696e23d67ef2501e1aa713318b814f4dd8656f4`;
  retained WASM Rust entrypoint: `ea5e942fa81444193f9b28977660f23712d2e6d00c46e87d5e4293df55289da5`.
- Shared tuple runtime: `623996c457b485f82b11065e2f369971bac4d18893b7de3d0da105e2b7dd40df`;
  core tuple kernel: `5b473a014743863ff74d064653f454c6fdfda35e67fed89bae5bfcc9e96a67e5`;
  literal kernel: `cedfd806e8487c7a5dd684b809b19bc244bbc7d67ef94292509e75588c1ec47f`.
- Fresh Node native addon: `0407206200b00f82c5a272c7623b21bacf87eb7110df0dd83773428193921943` (artifact mtime: 2026-10-24 17:18:42 EDT).
- Fresh WASM binary and generated JS: `7baad26de9e1be673e31e88837da0c6a8604c827ab8100248cca404be469d57a` and
  `e90c8bb958f699ca7b0c7d374cdbdd003879f3f38d28399e1c5dee1d0293131d`.
- Fresh WASM binary mtime: 2026-10-24 17:18:43 EDT. The generated WASM package
  was replayed in Chromium after this build.
- Frozen predecessor packet SHA-256 remains
  `1e0649ea8a723ce9f9836eceda2fd7cb83c6554bf5f01d908016baf0b69aefb5`.

The [default-root cutover candidate](default-cutover-candidate.md) records the
four-export source-selection proposal, current host-order blocker, Python
scope, startup-cost gate, and exact R8 rows. It proposes no route selection.
