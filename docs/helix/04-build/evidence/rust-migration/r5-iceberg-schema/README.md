---
ddx:
  id: umf.evidence.rust-migration.r5-iceberg-schema
  type: execution-evidence
  activity: build
  status: captured
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
    - id: CONTRACT-020
      kind: verifies
    - id: TD-020
      kind: informed_by
    - id: US-020
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# R5 standalone Iceberg schema predecessor capture

This additive Gate 0 packet freezes the current TypeScript source behavior for the next R5 standalone Iceberg schema JSON adapter. It observes the five CONTRACT-020 operations—import, export, inspect, copied node access and candidate node edit—before any Rust implementation begins. It is source-bound behavior, not a claim that every observed result is contractually correct or native-equivalent.

The capture is governed by [CONTRACT-001](../../../../02-design/contracts/CONTRACT-001-core-envelope.md), [CONTRACT-020](../../../../02-design/contracts/CONTRACT-020-iceberg.md), [US-020](../../../../01-frame/user-stories/US-020-iceberg-schema.md), [TD-020](../../../../02-design/technical-designs/TD-020-iceberg.md), [TP-001](../../../../03-test/test-plan.md), and the R5 sequence in the [Rust migration plan](../../rust-migration-plan.md). It is downstream execution evidence and does not amend those artifacts. CONTRACT-020 limits this slice to standalone schema JSON preservation and consistency; table metadata, format-version legality, partition/sort specifications, defaults execution, history/evolution and broader Iceberg support remain out of scope.

`baseline.json` records the exact successful and rejected outputs for all 35 authored fixtures (26 imported, nine rejected), including exact exported native JSON, diagnostics, JSON/YAML UMF round trips, node retrieval and edit proposals. It also captures all 21 extracted schema occurrences from 19 pinned upstream JSON documents, with original resource path and pointer. Twenty source occurrences import; the missing-root-type occurrence is rejected. Existing PyIceberg, Java and Chromium output files are embedded as raw source text and hashed; no oracle was executed to produce or refresh them.

The additive [source closure receipt](source-closure.json) hashes all 35 authored fixture inputs, the Apache Iceberg 1.11.0 specification/license/notice and Java oracle source/build files, and verifies that each of the 21 extracted occurrences has the same exact tree as its declared source pointer. Its checker also preserves lexical number tokens and object order during this comparison. It records Java 21.0.2, the pinned Maven build configuration and versions evidenced by the old PyIceberg/Java/browser outputs; Maven runtime version was not recorded. Historical native outputs remain bound inputs, not refreshed observations.

The additive [edge-control capture](controls.json) records signed-int32 boundaries and lexemes, the predecessor `2147483647.0000001` binary64 rounding case, reserved-ID thresholds, global field/list/map ID collisions, unknown primitive and identifier warnings, required-struct ancestry, `/0` versus `/00`, UTF-16 and prototype-like keys, and root/missing-target edit ordering. Each control labels normative expectations separately from observed predecessor behavior. These probes do not claim full edit parity.

`baseline.json` includes SHA-256 hashes for the adapter's transitive relative TypeScript import closure, relevant package schemas, governing documents, fixtures, tests and predecessor oracle scripts. Its capture script hash is included. The strict historical replay now fails solely because `rust-migration-plan.md` changed after capture; the two Python checks verify all executable, fixture and oracle inputs while reporting the captured and current plan hashes. Recheck current source and supplemental evidence with:

```sh
bun scripts/rust-migration/r5/iceberg-gate0-controls.ts --check
python3 scripts/rust-migration/r5/check-iceberg-executable-sources.py
python3 scripts/rust-migration/r5/check-iceberg-gate0-closure.py --check
```

To compare the exact historical packet, run the strict capture check from the repository root with Bun 1.4.3 and expect the recorded plan-only drift:

```sh
bun scripts/rust-migration/r5/iceberg-schema-baseline.ts --check
```

Do not re-freeze only to absorb planning edits. A reviewed executable-source change requires a deliberate new packet, a complete JSON diff and updated source/runtime evidence. The capture script invokes only the public TypeScript adapter and core serialization APIs. It does not run Cargo, rustc, Maven, Java, PyIceberg or any native oracle.

## Gate 0 boundary

Independent Sol review accepted this source-only Gate 0 for a bounded Rust implementation and resolved seven immutable resources: five existing core resources, the Iceberg package/envelope schema and the datatype grammar. This does not qualify Rust behavior. Preserve exact number lexemes and unknown native content; do not infer behavior from PyIceberg acceptance or substitute native defaults. The historical native comparisons were not rerun, and their resolved JAR hashes and Maven runtime remain unknown. Fresh native and browser qualification remains required before cutover.


## Current-source replay addendum — 2026-10-23

The metamodel fixed-point regeneration changed seven generated resources and the
rust-migration-plan changed independently. The original strict executable-source
checker therefore fails first at `src/generated/core-model.ts`; that failure is
retained as a historical drift signal. The immutable `baseline.json` and prior
native/browser oracle outputs were not rewritten.

The additive [current-source replay](current-source-replay.json) binds all current
source hashes and all 35 authored fixture byte hashes recorded in
`source-closure.json`, and replays the same 35 authored cases, 21 upstream schema
occurrences, and four guard controls. All recorded operation outcomes equal the
frozen predecessor outcomes. Its [assessment](current-source-assessment.json)
separates seven generated compiler/provenance-only changes from the migration-plan
hash drift. Comparison of generated payloads removes only `compilerSha256`
provenance values and generated `$comment`/header compiler hashes; the remaining
content matches the checked-in `HEAD` blobs. The historical baseline retained
source hashes rather than the seven original generated file bytes, so that
payload comparison is against `HEAD`, while the source-only outcome replay is the
direct comparison against the frozen baseline. This does not prove native
equivalence.

Run both additive checks from the repository root. `--check` compares the
recorded assessment without rewriting evidence:

```sh
bun scripts/rust-migration/r5/iceberg-current-source-replay.ts --check
python3 scripts/rust-migration/r5/check-iceberg-current-source-replay.py --check
```

The checker also runs an in-memory one-byte mutation control against an authored
fixture and requires the closure hash check to reject it; no fixture file is
modified. It invokes no Cargo command or native/browser oracle and verifies the
prior oracle output files remain byte-for-byte unchanged. A fixture hash or
semantic outcome mismatch fails closed; there is no waiver path.

## Bounded Rust core and native CLI checkpoint — 2026-10-23

The opt-in Rust implementation covers standalone Iceberg 1.11 schema JSON in
`crates/umf-core/src/iceberg_schema.rs`. Its eight focused tests pass, including
all 35 authored and 21 upstream frozen imports. The five versioned wire
operations (`iceberg.schema.import`, `export`, `inspect`, `getNode`,
`proposeNodeEdit`) use lossless core-wire values and one ordinary `Context`
for request admission, seven pinned resources, execution and response encoding.
The CLI route is `umf iceberg schema --stdin-wire`; `--capabilities` declares
profile `umf-r5-iceberg-schema/0.1.0` and the five operations. The focused
`--locked --offline --no-default-features` wire and CLI suites each pass three
tests, with the wire suite replaying all 56 frozen import cases. Sol reviewed
the bounded core, wire and CLI source with no remaining P1/P2 after repairs to
sibling-name metering and rejected-schema diagnostic completeness.

The reviewed source hashes are `2f06f8fbbb51198c83cfb7a6e4c77583338234c1352b780d79859c2f407da52d`
for `iceberg_schema.rs`, `3434b15d6d2c589cd88ccfe04297a22af3be9bd10422393316cc400f273afeb6`
for `umf-core-wire/src/lib.rs`, and `cbe31e809778de43538a59f6c047a990298fed5d0d7ce8121fb8f6ab2d182a34`
for `umf-cli/src/main.rs`. This is focused source and CLI qualification, not
installed-package qualification. Python, Node/Bun and distributed Chromium
bindings, table context, evolution and default adapter activation are separate
gates; subsequent bounded binding and native receipts are recorded independently.

## Fresh PyIceberg oracle replay — 2026-10-23

The [fresh native receipt](fresh-pyiceberg-2026-10-23.json) records an isolated
CPython 3.12.15 / PyIceberg 0.11.0 run of the pinned authored oracle script.
It completed 52 retained JSON/YAML round trips, 21 native-accepted schemas
and the field-rename check. The generated output SHA-256 equals the retained
historical `fixtures/iceberg/oracle-results.json` bytes; the repository oracle
file was not rewritten. This is fresh native evidence for the script's authored
subset, not a direct execution of the Rust wrapper. The nine UMF-invalid
fixtures and Java upstream oracle are separate controls; broader native
semantics and table context remain open.

## Fresh Java Iceberg oracle replay — 2026-10-23

The [fresh Java receipt](fresh-java-2026-10-23.json) records an isolated
Temurin 21.0.13+9 / Maven 3.9.16 build and execution of the pinned Apache
Iceberg 1.11.0 oracle. All 21 extracted upstream schema occurrences produced
result entries exactly equal to the retained Java oracle; the output file bytes
differ only in the Java runtime version, 21.0.13 versus 21.0.2. The receipt
binds the JDK and Maven archives, oracle source and compiled class, and all 44
resolved classpath JARs with a [per-JAR manifest](fresh-java-classpath-2026-10-23.json)
and reproducible closure digest. Historical oracle outputs were not rewritten. This
qualifies that native upstream subset, not the Rust binding's five operations,
table context, evolution or other Iceberg versions.
