# R2 integration record

This is the current integration status for R2, not its completion receipt. The
[production contract](../../../../02-design/contracts/CONTRACT-080-authoritative-metamodel.md),
[technical design](../../../../02-design/technical-designs/TD-091-authoritative-metamodel.md),
[test plan](../../../../03-test/test-plans/STP-091-authoritative-metamodel.md),
and [migration plan](../../../rust-migration-plan.md) govern the implementation
and qualification. Earlier R0/R1 evidence and the implementation checkpoints in this directory
are historical; they do not qualify the current source.

## Current integration boundary

R2 integrates a Rust-owned metamodel compiler and shared semantic core with a
native CLI, Python abi3 extension, Node/Bun addon, and browser WASM entry. The
Bun assembler retains only the explicitly pinned Ajv standalone build backend
and final manifest assembly. The compiler owns the portable resources and host
types; the successor `umf.metamodel.outputs/1` manifest identifies the Rust
source closure and build inputs. The current TypeScript implementation remains
the differential reference through R7. R3/R4 still own the seven-operation
`umf-codegen`/V8 migration; R2 does not claim that removal or publication.

The shared core preserves UTF-16 values, ordered object members, exact source
and numeric distinctions, and private Python code-point provenance where the
Python adapter requires it. Rust owns structural/schema evaluation, literals,
constraints, registries, diagnostics, copying and serialization. Bindings admit
host values and provide explicit callbacks; they do not carry semantic kernels
or fall back to another implementation when a native module is absent. The
default profile is cooperative. `HardIsolated` refuses before work. Source and
serialized output retain their 4,000,000 UTF-16-unit limit; copied/private values
have no new aggregate text ceiling, and semantic payload budgets are independent
of bounded transport-wrapper overhead. No hard-preemption or process-memory
guarantee is implied.

## Compatibility decisions and scoped evidence

The qualification gate combines the shared 139-case corpus with independent
predecessor and mutation controls. Counts below identify the tested scope; they
are not claims of complete standards or host-API support.

- The Python schema surface is compared against the exact main-PR41 predecessor
  with `jsonschema` 4.26.0: 9,282 construction outcomes across Draft 3/4/6/7,
  2019-09 and 2020-12, plus 4,995 cases from the pinned official JSON Schema Test
  Suite. Additional controls exercise ordered evaluation methods, annotation
  reach, arithmetic, error metadata and subjects. The phase receipt separates
  11 Draft 3 construction refusals from two admitted schemas that fail during
  evaluation with `PYTHON_SCHEMA_EVALUATION`; it does not relabel them as
  admission refusals. A further 363 admitted local-reference cases / 1,089
  method observations qualify reached missing and non-schema targets, ordered
  terminals and predicate short-circuits under the
  [reference decision](sol-python-schema-reference-terminal-decision.json). See the
  [phase receipt](sol-python-schema-error-subject-phases.json) and frozen
  [evaluation-order](sol-python-schema-evaluation-order-predecessor.json),
  [yield](sol-python-schema-yield-boundaries-predecessor.json),
  [annotation](sol-python-schema-annotation-reach-predecessor.json),
  [metadata](sol-python-schema-error-metadata-predecessor.json), and
  [subject](sol-python-schema-error-subjects-predecessor.json) controls.
- The installed ordered-evaluation gate now selects 7,671 method observations
  with exact immutable predecessor/target guards, plus 263 metadata, subject and
  typed-path error records. Annotation mechanism and order companions distinguish
  native dialect-specific collector order, early returns, mark-only traversal
  and required validity predicates. The fixed-order visitor passed independent
  source review and actual WASM controls. The resource-scope, identity, named-anchor and URI/dialect companions add
  255, 342, 72 and 72 methods, plus 140 direct native URI-join controls. Their source tests pass; independent source review and the full
  installed gate remain pending. These are
  gate inputs, not completed artifact results.
- Python regex is a separate CPython profile from ECMAScript matching. The
  reviewed controls cover 70,542 outcomes across CPython 3.11.17, 3.12.15 and
  3.13.16, including grammar, Unicode, surrogate, search and invalid-pattern
  boundaries. This does not claim the entire Python `re` or `jsonschema` API.
- Python serialization has 5,226 frozen observations across those three CPython
  versions and ruamel 0.18.15/0.19.1. It covers typed JSON/YAML values, key
  order, lexical scalar resolution, source characters and scanner contexts. A
  source-pinned saphyr-parser 0.1.0 patch gives the shared parser explicit
  default-YAML-1.2 and Python-native scanner profiles; global source rewriting is
  not used.
- Runtime compatibility controls include the retained TypeScript operator
  comparisons (6,271 ordinary and 2,619 edge cases, including 805 refusal
  observations) and 1,548 ECMAScript numeric-coercion boundaries. Their scope is
  the named corpus and approved mappings, not all JavaScript behavior.

Three narrow corrections are explicitly reviewed and do not authorize broader
normalization:

1. [R2-SOL-CORRECTION-001](approved-schema-compatibility-deltas.json) corrects
   one Draft 2019-09 `unevaluatedProperties.json` case (group 6, case 1) from the
   frozen predecessor's invalid result to the standards-supported valid result.
   The frozen predecessor remains unchanged. The
   [same-defect amendment](approved-python-schema-2019-ap-correction.json)
   explicitly qualifies the general schema-object additionalProperties annotation
   rule with independently frozen native/target controls; other legacy collector
   behavior is preserved.
2. [R2-SOL-CORRECTION-002](approved-python-yaml-nel-correction.json) requires the
   Python YAML writer to escape U+0085 so write/read preserves it. Native raw-NEL
   reader behavior remains unchanged; the default ECMAScript profile is not
   affected.
3. [R2-SOL-CORRECTION-003](approved-python-schema-unordered-extras-correction.json)
   replaces seed-dependent hash-set traversal with owned instance insertion
   order only for schema-valued Python `additionalProperties`. Its separate
   [36-case/108-method target](sol-python-schema-unordered-targets.json) keeps
   other traversal and diagnostic ordering controls intact.

Other implementation decisions—including the Python serialization profile,
YAML scanner profile, Python regex versions, and source-aware diagnostic
projection—are documented in their linked decisions and CONTRACT-080. Frozen
predecessor receipts are not regenerated to match the candidate.

## Evidence state and remaining gate

The first installed run from `c13120f95` passes the packed Node/Bun and empty-PATH
CLI 139-case controls, default production WASM, 198 Python public tests, 139 Python
core vectors, 9,282 schema admission decisions and 2,586 arithmetic controls. It
stops on ten Draft 2019-09 recursive-reference outcome mismatches. No final
production-host receipt exists. Source-local fragments must respect nested
resource IDs, and recursive lookup must preserve reference-resolution history
and nonanchored barriers. The focused native-controlled correction now passes
89 scope cases, 114 identity cases, 24 named-anchor cases and 24 URI/dialect
cases at source level;
independent review and committed-artifact qualification remain open.

This worktree includes scoped native, fixed-point, mutation, installed-binding,
and browser checkpoints from successive implementation snapshots. Their
commands, hashes, and host cohorts remain in the individual evidence records;
any checkpoint predating the final source snapshot is historical. In particular,
the earlier compiler parity run, initial browser run, retained-core suite, and
abi3 loader repair are not substitutes for a source-bound final receipt. The
loader issue had the same symptom as [Rust issue 157750](https://github.com/rust-lang/rust/issues/157750);
the verified local correction used an unstripped release build, and must still
be identified by the final installed-artifact record.

The reviewed resolver source now passes 214 workspace tests, all retained 2 MiB
stack controls, 67 compiler tests / 478 assertions, canonical generation and
non-writing/fixed-point checks, 139 Chromium core cases, lint/type checks and
migration boundaries. The independent source review is conditional on fresh
committed artifacts.

R2 remains open. Final committed-source qualification must exercise the full host
corpora, an offline wheel rebuilt from the sdist, packaged Node/Bun addons, CLI,
and production browser WASM in their installed environments. It must bind the
receipts to exact source, lockfile, build inputs, artifacts and host versions;
check the source archive excludes generated binaries and undeclared caches; and
record any remaining disagreements without relaxing frozen controls. Independent
Sol review and approval are pending after that coherent source-bound run. No PR
merge or release is claimed here.


The clean `2c8781dbe` installed run resolves all ten former official-suite
mismatches: 4,995 official cases, 9,282 admission decisions and 2,586 arithmetic
controls pass. It also passes 198 Python public tests, the 139-vector installed
Python/Node/Bun/CLI/default-WASM controls and feature-WASM regex/depth/work probes.
It stops before ordered candidate comparisons on a harness receipt-field error: the
path-segments profile counts 42 `errorRecords`, while its helper requested
`methods`. The narrow harness repair selects the actual field; immutable receipt
hashes, counts and outcomes remain unchanged. This failed run is not the final
production-host receipt.

The [native benchmark](native-admission-validation-benchmark.json), bound to the
clean `2c8781dbe` source and exact resources, measures 500 representative complete
validations at 34.429 calls/s and admission copying at 40,409.484 calls/s. Each
validation executes 2,703 constraint steps and 7,924,651 admitted work units. A
fresh process, including setup, completes one validation in 154.972 ms with
10,223,616 bytes peak RSS; the batch process peaks at 10,485,760 bytes. These are
local macOS arm64 measurements, not a speedup comparison, cache-cold claim or
hard memory guarantee. Runtime setup is outside per-call timers.

The retained codegen assets are refreshed after canonical compiler provenance
changes. Their decompressed JavaScript is byte-identical after replacing only
the named compiler SHA, as proved by the
[refresh receipt](retained-codegen-provenance-refresh.json). Packaging, gzip,
Python wrapper and boundary controls pass. All seven MiniRacer operations remain
R3/R4 debt.


The `d3d7b83f5` retry again passes the runtime phases but stops at the new URI
profile guard before ordered candidate comparisons: the admission profile belongs
to the immutable fixture, while its profile receipt records per-version equality
flags. The corrected guard checks those actual owners with exact hashes.
A separately preserved offline installed wheel environment then executes the
entire comparator. Its path projection compares native and frozen representations
in lossless typed Key/Index form, and six runtime-phase observations retain exact
messages. The [complete comparator result](installed-schema-comparator.json)
passes 2,879 cases, 7,671 methods, 263 metadata records and six runtime observations
with zero mismatches. No production Rust or expected outcome changed. Independent
Sol reviewed the repair and its preservation/negative controls; the final clean
committed full-host gate remains required. CI now preserves each platform/Python
qualification receipt as a separately named artifact.


The `453923263` integrated run reaches serialization after every preceding host
and schema gate passes. Its 14 null-tag mismatches come from the two frozen
spellings of Python None, not production behavior. The reviewed comparison helper
canonicalizes only exact `{kind: NoneType, value: null}` and `{kind: null}` tags,
recursively preserving list/map structure, order and all other tags. Malformed
aliases refuse. No fixture, NEL correction or Rust implementation changes.

The [standalone archive/rebuild receipt](installed-serialization-archive-rebuild.json)
qualifies 1,742/1,742 serializer observations on both original and rebuilt wheels,
a 443-member source archive with required sources and no forbidden artifacts, and
an offline wheel rebuild with JavaScript absent from PATH. The rebuilt wheel
also passes 198 public tests, 139 core vectors, 9,282 admission decisions, 4,995
official cases, 2,586 arithmetic controls, 7,671 ordered method observations and
263 metadata records. These standalone results precede the final clean integrated
receipt. The shared directive-profile category includes all 16 tail observations
within its 74 entries; none are omitted by the zero separate-tail counter.
