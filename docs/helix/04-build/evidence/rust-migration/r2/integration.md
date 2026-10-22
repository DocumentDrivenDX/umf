# R2 integration record

R2 implementation and local installed-artifact qualification are complete. The
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
  source review and actual WASM controls. The resource-scope, identity, named-anchor
  and URI/dialect companions add 255, 342, 72 and 72 methods, plus 140 direct
  native URI-join controls. Both installed wheel cohorts pass the public
  comparisons; internal URI controls pass in the native workspace.
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

## Final local qualification

The [production-host receipt](production-host-qualification.json) passes from
clean commit `475b5d3d6b722ab73a17f77410eddb91ce45e056`. Its 439 source-file hashes form
closure `22484d89ffdeaa6a754dac1afa024c1962fbf0e130bf6b815b5ca1d32e994307`; the closure is identical
before and after the run. The [raw integrated log](production-host-qualification.log)
and individual reports retain commands, versions, counts and observations.

| Installed cohort | Qualified observations |
| --- | --- |
| CPython 3.11.17 / Pydantic 2.14.1 / pytest 9.1.1, original wheel | 198 public tests, 139 core cases, 9,282 schema admissions, 4,995 official cases, 2,586 arithmetic controls, 7,671 ordered methods, 263 metadata/path records, six runtime-phase observations, 1,742 serializer observations; zero mismatches |
| Same Python cohort, wheel rebuilt offline from sdist | The same complete tests and comparisons; outside checkout, empty runtime PATH |
| Node 26.12.1 / Bun 1.4.3, npm-packed addon | 139 core cases each, ordered diagnostics and host controls |
| Native Rust CLI | 139 cases with PATH empty |
| Chromium 153.0.8010.12, default shipped WASM | 139 core cases, source/copy/depth and host controls; zero external requests |
| Same Chromium, conformance-feature WASM | 139 core cases, 70,542 regex outcomes, 15 outcome-parser controls, wide-work and ordinary/annotated depth probes; zero external requests |

The native workspace passes 214 tests across 45 suites, including unchanged
2 MiB stack controls and semantic depth 128/129. The compiler passes 67 tests /
478 assertions, eleven-output generation, fixed-point and non-writing controls.
A separate real-Chromium metamodel run passes 139 cases. Lint/type checks,
authority and migration boundaries pass, including 15 inventory/boundary tests.
The [precommit record](precommit-checks.json),
[resource implementation](sol-python-resource-implementation.json), and
[source review](sol-r2-resource-source-closure.json) bind those source checks.

The sdist audit passes all 443 members, with required sources present and no
forbidden binaries or build directories. Its wheel rebuild runs offline with
JavaScript absent from PATH. Exact local artifact sizes follow; hashes and
separate default/feature WASM loader sizes are in the production-host receipt.

| Artifact | Bytes |
| --- | ---: |
| Rust CLI | 4,982,464 |
| Node/Bun addon | 4,459,600 |
| npm package | 1,710,143 |
| Default browser WASM | 3,642,217 |
| Python wheel | 1,968,645 |
| Python source archive | 2,222,170 |
| Wheel rebuilt from archive | 1,969,270 |

The [native benchmark](native-admission-validation-benchmark.json) measures a
500-call complete-validation batch at 34.429 calls/s and admission copying at
40,409.484 calls/s. Each validation executes 2,703 constraint steps and 7,924,651
admitted work units. Fresh-process wall time including parsing and Engine setup
is 154.972 ms with 10,223,616 bytes peak RSS; batch peak RSS is 10,485,760 bytes.
Its clean source checkpoint `2c8781dbe` has identical runtime, resource and
benchmark inputs to the final qualification. These are local macOS arm64
measurements without speedup, cache-cold, cross-host or hard-memory claims.

The [retained codegen refresh](retained-codegen-provenance-refresh.json) proves
its decompressed JavaScript changes only five occurrences of the named compiler
provenance SHA. Packaging, gzip, Python wrapper and boundary controls pass; all
seven MiniRacer operations remain R3/R4 debt.

## Review and delivery

The [final independent Sol review](sol-r2-final-review.json) approves R2
implementation and local source-bound qualification with no open findings. It
reconciles the source, comparator, serializer and installed-artifact evidence.
PR CI and merge provide the final delivery gate; their repository state records
landing separately from local qualification.
CI retains source-bound receipts for each Ubuntu/macOS and Python 3.11.17,
3.12.15 and 3.13.16 matrix job. Local installed qualification above covers
CPython 3.11.17; cross-version native predecessor receipts are separate evidence
and do not substitute for those CI jobs. No package publication is claimed.

## Historical failures and lessons

The `c13120f95` run exposed ten recursive-reference mismatches, repaired against
immutable native scope, codepoint-identity, anchor and URI/dialect companions.
Later [2c8781dbe](installed-2c8781dbe-failed.log),
[d3d7b83f5](installed-d3d7b83f5-failed.log), and
[453923263](installed-453923263-failed.log) runs stopped on harness receipt-field,
typed-path/message projection and None-tag mismatches. Comparison repairs preserve
all native expectations; they introduce no additional semantic correction.
The [complete ordered comparator](installed-schema-comparator.json) and
[serializer/archive rebuild](installed-serialization-archive-rebuild.json) were
executed in retained installed environments before the final integrated run.
All 16 directive-tail cases are included within the 74 shared directive-profile
observations; the separate tail category counter does not represent omitted work.

Keep resource identities in native codepoints through lookup, separate display
projection from identity, meter owned work before allocation, and repeat the
unchanged stack controls after evaluator-state changes. For later slices, run
every installed comparator end to end before the all-host gate and verify
lossless comparison representations and receipt-field ownership independently.


CI delivery preflight repairs runner-context placement, exact Python provisioning
through uv with absolute interpreter paths, isolated Rust toolchain state, and
the hook integration fixture. CI writes receipts to a fresh job-local path; a
failed job cannot upload the committed local receipt as a new witness. The
[reviewed preflight](ci-delivery-preflight.json) retains all gates. The
[Linux diagnostic](ci-linux-inventory-bdf469.txt) identified two inventory defects:
a local virtualenv activation script entered the source census, and Python 3.9
silently omitted 47 symbols from an authored file that Python 3.11 parses. The
repair excludes generated environments, requires Python 3.11+, and refuses
unparseable source instead of emitting an incomplete census. CI explicitly
provisions the declared Rustfmt component before package builds. The [repair preflight](ci-inventory-repair.json) passes inventory checks on all
three qualified Python versions, 20 inventory/boundary controls, 578 module
boundaries with zero findings, and workflow lint. Fresh final-source CI remains
a merge condition.

The retained [Linux CPython 3.13 receipt](ci-bdf469-ubuntu-python313-qualification.json)
qualifies the complete installed-artifact gate at `bdf469560e0e8b4a81aac394266b2c738f04a169`,
closure `831aef59b6a802be82fa5aa7b9d9078d6ff459acd6025763aa7bb881c911fb8d`.
The job subsequently refused the stale inventory; this receipt establishes runtime
qualification, not overall CI success or qualification of the later census fix.
The current local runtime qualification precedes these CI-only/tool repairs.


The next Linux run confirms the census is current. Its remaining R1 entropy
exception failure was output formatting: hosted CI sets `CARGO_TERM_COLOR=always`,
which inserts ANSI escapes into Cargo tree glyphs. The checker now explicitly
requests plain output; pinned exception identities, paths, parents, features and
source checks are unchanged. The [offline Linux forced-color control](ci-linux-forced-color-boundary-control.json)
passes 578 module boundaries with zero findings and all nine embedded negative
controls. This scopes a checker repair; fresh CI and merge remain delivery gates.


## Hosted production qualification

The [independent hosted qualification review](sol-r2-hosted-qualification-review.json)
approves all six source-bound cohorts and this evidence-only follow-up with no
findings; final repository CI and reviewed merge remain external delivery gates.

All six [hosted cohorts](ci-production-qualification/index.json) pass at reviewed
head `06b108a03cb86c1786afead2ced7d32af55a7f14`: Ubuntu and macOS, each with
CPython3.11.17/3.12.15/3.13.16, Node26.12.0, Bun1.4.3 and Cargo1.90.0. Each
original and offline sdist-rebuilt wheel passes the complete comparisons above,
including 198 public tests, with zero mismatches. All native CLI, packed Node/Bun,
default Chromium WASM and regex-feature Chromium WASM gates pass separately.

All receipts retain source commit `bb1555c483bd43f546e67413993d8098afc24573`
(the PR's synthetic merge), whose tree `88021edc5421dcacedb48e10d87523f18eb2266a`
equals the reviewed head. Their 439 source hashes form closure
`2896e4e122cad5e2fde4b4ef04789fddfddb350e8fb054c3a5bc57ed2c83c1cd`. For each
receipt, all 67 qualification-input bindings and 42 raw-output hashes reconcile;
raw reports, exact counts, interpreter identities, empty startup Git state and
no-JavaScript/archive controls pass. Downloaded receipt ZIP bytes match GitHub's
artifact digests. Binary artifact sizes/hashes are CI observations and checked for
internal consistency; CI binary bytes were not downloaded.

The older local receipt and intermediate failed/historical CI observations retain
their original source identity. Evidence-only follow-ups do not relabel this
qualification and must preserve its source closure. PR43 records final repository
checks and merge. The seven MiniRacer codegen operations remain R3/R4 work.
