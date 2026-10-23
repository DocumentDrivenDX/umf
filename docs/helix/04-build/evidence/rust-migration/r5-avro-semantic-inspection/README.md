# R5 bounded Avro schema inspection

This additive checkpoint implements an opt-in, read-only structural inspection
over the exact `NativeJsonTree` retained by the Avro document core. It follows
the source-preservation and semantic boundary in
[CONTRACT-007](../../../../02-design/contracts/CONTRACT-007-avro.md) and the
frozen [TypeScript predecessor](../r5-avro-full-predecessor/README.md).

The current Rust slice recognizes primitive schemas, named record/error/enum/
fixed declarations, arrays, maps, ordered union branches, record fields, and
references to declarations already registered in caller order. Dependencies
are visited in supplied order before the root. Artifact IDs are not entered in
the Avro name registry. Names use native `name` and `namespace` declarations;
records enter the registry before their fields, allowing self-recursion. The
result carries separate `valid`, `complete`, and diagnostic values. Unknown or
incomplete semantics remain in the original tree and are never edited.

Union branch identity distinguishes primitives, array/map containers, and
qualified named types. Named declarations and string/object references share
the same qualified key, so `A` and `n.A` collide in namespace `n`; a named
schema `array` remains distinct from an array container. Object-form named
references use the same caller-ordered registry as string references. Record
fields with absent, empty, or non-string names and fields without a type are
errors. Member scans, name hashing/copying, each field, and each union branch
are metered before work, allowing Context cancellation and work controls to
interrupt large field lists and oversized names before union-key allocation.

Every result includes `AVRO_PROFILE_LIMIT`, so an otherwise clean result is
never represented as complete Avro 1.12 validation. Unresolved names and
duplicate full names/field names are errors. Logical annotations and defaults
receive explicit warning diagnostics when encountered in traversed schema
objects or fields. This code does not validate typed defaults, enum symbol membership,
fixed sizes, aliases, all Avro name grammar, exact numeric semantics, custom
metadata, or every structural constraint. It does not interpret datum codecs,
logical behavior, or protocol, IDL, and object-container formats. Unknown
tagged-representation fields remain guarded by native export in the document
core; inspection does not make them exportable.

The predecessor packet records Bun 1.4.3 and pinned `avsc` 5.7.9, including a
host-number refusal for an exact int64 default. Its capture runner could not
rewrite the frozen predecessor `outcomes.json` in this worktree (EPERM); that
source-linked packet remains unchanged. Focused predecessor AC2/AC3 tests pass
2/2 (14 assertions). A fresh independent parser packet was run with Apache Avro
Python 1.12.0 and fastavro 1.12.2. Both accept the recursive cross-dependency
schema as authored and after Rust bundle export. The Rust integration test
asserts the exported compact dependency/root strings equal the inputs with a
trailing LF. Both parsers accept the named `array` plus array-container union
and the normalized duplicate reference pair `A`/`n.A` within namespace `n`.
The Rust inspector records that named-branch collision as a warning because
both independent parsers accept it. Both parsers reject the tested unresolved
object-form reference, missing field name, and missing field type. Exact input
hashes and outcomes are in
[native-oracle-results.json](native-oracle-results.json), with the reproducible
capture in [native-oracle.py](native-oracle.py). Parser
acceptance does not establish datum, default, logical-type, or full-language
semantics. In particular, avsc validator limits do not establish invalidity.

Focused Rust unit tests in `avro_semantics.rs` exercise ordered dependency name
resolution, self-recursion, artifact-ID/name separation, source immutability,
unresolved string and object-form references, duplicate fields, namespace-
relative names, normalized union branches, named-array/container distinction,
malformed fields, and pre-allocation work-meter interruption. With Rust 1.90.0
and an isolated target,
`cargo test -p umf-core avro_semantics::tests --lib --offline` passes 8/8.
`cargo test -p umf-core --test r5_avro_document --offline` passes 9/9,
including the exact Rust-export and recursive dependency check. Existing Avro
field helper and Protobuf warnings remain.

Reproduce the native capture with
`/private/tmp/umf-r4-build-env/bin/python docs/helix/04-build/evidence/rust-migration/r5-avro-semantic-inspection/native-oracle.py`.

Selected fingerprints at capture time:

| File | SHA-256 |
| --- | --- |
| `crates/umf-core/src/avro_semantics.rs` | `a49c01ab58e624735f7239e4e0bbc42dd9fee6387640fd1da2fc74e1675cb220` |
| `crates/umf-core/tests/r5_avro_document.rs` | `285fe891d8ebfb59b9766baa70ff70e030571c0ca6b9ed48134357031ec2552e` |
| `docs/helix/04-build/evidence/rust-migration/r5-avro-semantic-inspection/native-oracle.py` | `9fb1b7c56d82c5e414579fcc2dac358c260471f3aa57e80814ed6ffbb172cda1` |
| `docs/helix/04-build/evidence/rust-migration/r5-avro-semantic-inspection/native-oracle-results.json` | `c7051e290246fb3d3a477c008811a52a9315af5405191219c7666823c3f6f12e` |
| `docs/helix/04-build/evidence/rust-migration/r5-avro-full-predecessor/capture.ts` | `64813ff1ad26224e32d1158413d7eed5bede5f5352a4099fedf5e3c493749fcc` |
| `docs/helix/04-build/evidence/rust-migration/r5-avro-full-predecessor/outcomes.json` | `2569299ce5ddaf7bd54934139291077487244382df0ffb2b97902ca051db954c` |

These are selected inputs, not a complete transitive Rust build closure or
exhaustive native semantic qualification. Broader conformance, wrapper/browser
binding parity, and default cutover remain open.
