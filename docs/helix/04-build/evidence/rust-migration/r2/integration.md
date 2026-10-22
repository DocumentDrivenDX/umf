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
- The installed ordered-evaluation gate now selects 6,930 method observations
  with exact immutable predecessor/target guards, plus 263 metadata, subject and
  typed-path error records. Annotation mechanism and order companions distinguish
  native dialect-specific collector order, early returns, mark-only traversal
  and required validity predicates. The fixed-order visitor remains under final
  source verification; these are gate inputs, not completed artifact results.
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

This worktree includes scoped native, fixed-point, mutation, installed-binding,
and browser checkpoints from successive implementation snapshots. Their
commands, hashes, and host cohorts remain in the individual evidence records;
any checkpoint predating the final source snapshot is historical. In particular,
the earlier compiler parity run, initial browser run, retained-core suite, and
abi3 loader repair are not substitutes for a source-bound final receipt. The
loader issue had the same symptom as [Rust issue 157750](https://github.com/rust-lang/rust/issues/157750);
the verified local correction used an unstripped release build, and must still
be identified by the final installed-artifact record.

R2 remains open. Final committed-source qualification must rerun canonical
generation and its non-writing/fixed-point controls, the full native and host
corpora, an offline wheel rebuilt from the sdist, packaged Node/Bun addons, CLI,
and production browser WASM in their installed environments. It must bind the
receipts to exact source, lockfile, build inputs, artifacts and host versions;
check the source archive excludes generated binaries and undeclared caches; and
record any remaining disagreements without relaxing frozen controls. Independent
Sol review and approval are pending after that coherent source-bound run. No PR
merge or release is claimed here.
