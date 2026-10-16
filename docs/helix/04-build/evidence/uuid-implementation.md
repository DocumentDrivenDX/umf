# Exact128-bit and UUID implementation — 2026-10-15–16

CONTRACT-076 / SD-005 / FEAT-005 IDEAL-09 govern the experimental core0.9.0
implementation. This record qualifies the implemented subset; it does not admit
full native equivalence, all-five binding delivery or downstream execution.
Machine results and fingerprints are in
[verification.json](../../../../fixtures/validation/uuid/verification.json).

## Implemented behavior

Core0.9.0 recognizes bits128 and UUID independently of the earlier nine-family
profiles. Value codecs preserve all128 bits through network bytes, signed/unsigned
64-bit words and exact integer tokens. UUID parsing retains original text and
canonical bit identity, including Nil, Max and reserved versions/variants. Word
strings never pass through a JavaScript number. Snapshot checks reject unknown
members, inconsistent values, getters and unsafe byte-view length/iterator overrides.
Carrier validation and conversion consume the same copied input, including hostile
Proxy controls; bit-token syntax rejects terminal line-break boundary tricks.
Both scalar inventories are immutable; caller-visible schema mutations cannot
change the new internal validators.

Field-domain/schema-property authoring returns copied validated Documents. Typed
literals, examples, defaults, allowed-value equality, container item checks,
inspection and metadata selection support0.9 without silently promoting older
lookalike labels. Optional numeric Field context also supports integer128 bounds
and the existing lossless bigint bridge. Unknown relevant refinements refuse.

Explicit tuple-v2 encoding uses distinct bits128/UUID tags and operation-v4
receipts. v1 bytes and older operation profiles remain unchanged. Migration
requires explicit collision mappings, retains the full earlier envelope and
verifies exact source/target consistency before rollback. Routine metadata work
adds no persistent receipt; migration and native-projection recovery remain separate.

Binding3 declares native UUID, sixteen bytes, canonical text or paired64-bit slots.
Its pure value bridge rejects malformed/partial pairs, slot collisions, stale logical
identity and unknown relevant carrier meaning. Native schema proposals cover one
selected Field and retain the complete logical/binding source, paths, target subset
and obligation outcomes. Text enforcement, native order and model/runtime limits
remain visible. SQL identifiers and Avro generated names are checked before output;
expanded proposals must fit the ordinary output bounds. Old native generators
explicitly refuse binding3 rather than misread split storage as a single column.

## Executed verification

The machine summary retains each cohort separately and selects the latest passing
per-file result when reporting their union. This is not one full-repository replay.
A fresh isolated core/new-feature cohort and a later focused cohort cover the final
public operations; earlier binding/projection regression records retain their own
cuts. Every test file runs in its own Bun process through `scripts/run-tests.ts`.

Typechecking, browser ESM/declarations and all420 JSON schemas /69 extension
packages pass. The browser evidence uses Chromium-based Edge155.0.4283.45 against
the actual public bundle:389 independent vectors,2,334 codec checks,389 key checks,
JSON/YAML and migration recovery, required refusals and metadata/carrier operations.
External requests are zero and Node/Bun/Buffer globals are absent. Deliberate host
and forbidden value-module imports are rejected for their intended reasons.

The independent Python oracle uses integer/struct/UUID operations without UMF
helpers. Its389 vectors include all128 single-bit positions, sign boundaries,
Nil/Max and a seeded broad corpus. Native writers receive the library's actual
carrier encodings and compare recovered bits with this independent oracle.

| Native runtime | Observed subset | Evidence |
| --- | --- | --- |
| PostgreSQL17.9, aarch64 | Four required singular carrier DDLs/catalogs;1,556 bit recoveries; overflow refusal and signed-order counterexample | [Receipt](../../../../fixtures/validation/uuid/postgresql.json) |
| SQL Server2022,16.0.4295.3, amd64 container | Four required singular carrier DDLs/catalogs;1,556 bit recoveries; overflow refusal and native UUID-order counterexample | [Receipt](../../../../fixtures/validation/uuid/sqlserver.json) |
| Apache Avro1.12.0 / fastavro1.12.2 | Four carriers across both native writers/readers;3,112 bit recoveries plus two signed64 overflow refusals | [Receipt](../../../../fixtures/validation/uuid/native-oracle.json) |
| PyArrow21.0.0 / Parquet UUID annotation | Five native file/value paths, including signed and unsigned word pairs;1,945 bit recoveries | Same native receipt |
| Captured TableSpec model / pinned source digest | Canonical string schema accepted and normalized/revalidated; unsupported native/bytes/word choices explicitly blocked | [Receipt](../../../../fixtures/validation/uuid/tablespec.json) |

Apache Avro warns that its fixed UUID annotation is ignored. That warning is
retained; fixed-byte recovery is not native logical-type enforcement. TableSpec
validation is specifically its captured Python model, not agreement with every
checked-in JSON Schema or Spark ingestion. Original corpus/source hashes and
native candidate DDL correspondence remain in the machine record.

## Failed attempts and corrections

The first broad selection also matched historical core-ideal acceptance gates;
it was stopped and replaced with explicit directory/file selections. Three old
negative tests used0.9 as an unknown future version; they now use0.10 while retaining
the same refusal assertions. The broad projection regression initially lacked its
Python oracle and Go cache permission; the pinned oracle was installed in the
isolated environment and the failed/remaining files passed their repaired replay.
No production assertion was weakened to bypass that environment failure.

PostgreSQL readiness initially saw its temporary initialization server; the harness
now waits for the final postgres process. A signed-minimum comparison literal needed
an explicit quoted bigint cast. sqlcmd split an overlong fixture input line inside
UUID text; bounded input lines remove that transport corruption. Replayed database
checks pass and remove only the matching labeled owned fixture. A browser control
needed Bun AggregateError inspection to prove the intended rejection reason.
An oversized-output control exposed that copying alone bounds structure, not text;
proposal publication now separately checks serialized output size.

## Remaining gates and support limits

This initial native profile does not generate binding3 indexes, relationship
layouts or whole-model migrations. Such declarations remain round-trippable with
incomplete interpretation; unsafe generation/value operations refuse. Native
key/index/foreign-key pairing, nullable-pair enforcement across every writer,
consistent read/mutation atomicity, wider schemas and complete native-to-ideal
composition still require their separate bindings and admission/delivery gates.
Descriptor classification retains supplied native detail but is not a proof of
all native equality/coercion behavior. Projection recovery verifies retained
source/artifact agreement; it is not source authentication or arbitrary native-edit
reconciliation. Existing historical gate receipts are not refreshed by these tests.

Text-only bridges preserve bit identity; original case spelling must remain in
caller-held source/token records when lexical recovery matters. Pair storage is
an explicit option, not a measured optimality claim. No performance benchmark,
UUID generation, native equivalence or Truss/Weft runtime adoption is asserted.

## Reproduction and public example

See [native/uuid/README.md](../../../../native/uuid/README.md) for native runtime
commands and dependencies. Portable checks:

```sh
bun run typecheck
bun run build
bun run test:schemas
bun scripts/run-tests.ts tests/core tests/bit128.test.ts tests/uuid.test.ts tests/core-uuid.test.ts tests/core-uuid-key.test.ts tests/core-uuid-transition.test.ts tests/binding-uuid.test.ts tests/uuid-native-projection.test.ts
UMF_CHROMIUM_PATH='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' bun scripts/uuid-browser.ts
```

```ts
const uuid = parseUuid('00112233-4455-6677-8899-aabbccddeeff');
const words = bits128ToWords(uuidToBits128(uuid), true);
// {high:'4822678189205111', low:'-8603657889541918977'}
```
