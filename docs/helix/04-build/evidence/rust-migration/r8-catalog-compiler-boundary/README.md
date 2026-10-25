---
ddx:
  id: umf.evidence.rust-migration.r8-catalog-compiler-boundary
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: CONTRACT-067
      kind: informed_by
    - id: CONTRACT-070
      kind: informed_by
    - id: CONTRACT-071
      kind: informed_by
    - id: CONTRACT-072
      kind: informed_by
    - id: umf.evidence.rust-migration.r6-catalog-source-join
      kind: references
---

# R8 `compile_catalog` boundary audit

This is a source-level decomposition of `umf_access.build.catalog.compile_catalog`
for planning a later bounded Rust port. It does not change the default route or
establish installed-wheel behavior. The current source cohort was moving; hashes
below identify inspected bytes, not a commit or release artifact.

## Contract boundary

[CONTRACT-067](../../../../02-design/contracts/CONTRACT-067-access-sdk-generator.md)
defines stage one as pure package generation and reserves the catalog outputs for
stage two. It also keeps the stage-one package writer and exact source text
custody in the host tool.
[CONTRACT-070](../../../../02-design/contracts/CONTRACT-070-access-extension.md)
defines authored access views and native column facts consumed by generation;
these facts do not select physical storage or own native lowering.
[CONTRACT-071](../../../../02-design/contracts/CONTRACT-071-query-command-catalog.md)
defines stage two: selected declaration modules are trusted build-time Python
code, capture runs them in the build host, and Weft owns SQL dialects, backend
lowering, parameter carriers, and result decoders.
[CONTRACT-072](../../../../02-design/contracts/CONTRACT-072-runtime-targets.md)
separates this optional build/compiler path from runtime execution, target
connections, and driver integrations.

## Stage map

| Stage | Current operation | Ownership and Rust boundary |
| --- | --- | --- |
| Output ownership | `compile_catalog()` enters `_own_destination()` before compiling. It resolves and validates the package destination and prevents cooperating same-process operations from overlapping. | Python host owns `Path`, locking, and later publication. No compiler callback is involved. |
| Configuration resolution | `resolve_configuration()` copies JSON-shaped configuration, checks the installed Weft distribution/version, reads explicitly pinned files, rejects path escape/symlinks, hashes original bytes, decodes/parses them, resolves `bindingSource`, checks original document membership, and applies target schema-binding rules. | Mixed host custody and deterministic admission. Filesystem, installed metadata, UTF-8/JSON parsing, and ordering/refusal precedence must remain in Python unless separately frozen. |
| Stage-one custody | `_compile_catalog_owned()` reads the generated manifest and every inventoried file, checks `runtimeAbi`, path safety, and source hashes. `_check_native_column_sources()` then checks retained `sources.json`. | Filesystem and package-generation custody remain Python. The existing Rust slice accepts JSON values only after Python reads, hashes, and parses the source inventory. |
| Target binding projection | `_native_column_bindings()` extracts ordered original source references from Unity Search, raw targets, and related-read wrappers; it validates original binding shape, UTF-8, SHA-256, bounded ColumnSet count, and related-read equality. | Already represented by opt-in Rust `access_catalog_custody::native_column_bindings` and a PyO3 facade. This is a pure JSON-shaped projection, not default compiler routing. |
| Source membership join | `check_native_column_sources()` indexes exact source IDs, preserves duplicate match counts, ignores non-dict entries as the Python predecessor does, and requires exactly one original text match for each binding. | Already represented by opt-in Rust `access_catalog_custody::check_native_column_sources` and PyO3. Python retains manifest membership, source path, file hash, and `json.loads`. See the [R6 source-join evidence](../r6-catalog-source-join/README.md) and [frozen packet](../../../../../../python/umf_access/tests/fixtures/rust-catalog-source-join/predecessor.json). |
| Trusted module loading and capture | The builder inserts the selected root on `sys.path`, imports the generated package and declaration modules, inspects module globals and function metadata, resolves annotations, and captures decorated declarations. | Python callback/reflection boundary. CONTRACT-071 treats these selected modules as trusted build code, not inert document data. A Rust function cannot accept or reproduce this behavior without a separately versioned inert capture representation. |
| Source/model correspondence | Captured `RecordRef` identities and source digests are checked against generated Pydantic model classes and their `UMF_SOURCE` metadata. | Python class identity and generated-model reflection. This stage has no current plain-JSON boundary or Rust candidate. |
| Logical query lowering | Captured Nodes and steps drive result selection, Pydantic projection creation, parameter carrier signatures, optional variants, join handling, pagination, ordering, related-key outputs, and target profile checks. `render_logical()` and `render_related_logical()` produce the logical request supplied to compiler adapters. | Deterministic logic exists inside Python, but it consumes Python dataclasses, model annotations, and alias context. This is the first substantial possible shared semantic stage only after capture is frozen as a versioned JSON DTO. It must stop at Weft's declared interface. |
| Backend compilation | `ReviewedSQL.build`, `EngineRead.build`/`compile_original`, `NativeProgram.build`, `emit_command`, and `emit_search` call the supplied compiler and validate original responses/artifacts. | Weft owns target lowering and native SQL; engine owners own their compiler protocols. Moving this stage into UMF Rust would cross the explicit CONTRACT-071 boundary. |
| Catalog assembly | The builder renders `queries.py`, serializes `catalog.json`, invokes `privilege_report()`, computes output inventory hashes, and creates `catalog-manifest.json`. | Mixed deterministic formatting and Pydantic/compiler-derived data. Small helpers such as `_json`, `_sha`, or `_requests_approximate_distinct` are too narrow to move the catalog compiler materially. A useful Rust boundary needs the typed/captured declaration and exact compiler-response DTO first. |
| Publication | `publish_catalog()` validates reserved paths and generation identity, reads prior inventory, checks drift, creates a sibling staging tree, copies old outputs, swaps with `os.replace`, and restores or reports unresolved state on failure. | Python host filesystem operation under CONTRACT-067/071. It must stay out of the Rust semantic core. |

## Next-stage disposition

No additional `compile_catalog` stage is ready for a default Rust route. The
already implemented custody projection and source-join are the only current
stages with an exact JSON-shaped Rust boundary and frozen predecessor packet.
The next substantial candidate would be deterministic pre-Weft lowering from a
versioned captured-declaration DTO to a logical query/command plan. That DTO is
not currently emitted or frozen. The current lowering reaches Python `Node`,
`RecordRef`, `FieldRef`, `ProjectionRef`, `CapturedParameter`, Pydantic model
annotations, and contextual aliases, then makes target-specific checks before
calling Weft. Starting Rust implementation before freezing those inputs risks
silently changing capture, refusal order, result types, or target provenance.

Before reconsidering that stage, capture a predecessor packet from actual trusted
declarations with exact successful/refused outcomes and source pins. At minimum
cover optional presence expansion, joins and binding pairs, projections and
aggregates, paging/order Key provenance, commands/action references, related
keys, engine targets, Weft refusals, and repeated-capture nondeterminism. Keep
module import/execution, annotation introspection, Pydantic model generation,
Weft calls, source-file custody, and publication in Python. The existing source-
join packet is not a compiler packet and cannot support a broader parity claim.

## Existing source-join predecessor and checks

The existing packet
[`predecessor.json`](../../../../../../python/umf_access/tests/fixtures/rust-catalog-source-join/predecessor.json)
has SHA-256 `672d858ecd77e6cf6ee940ae6562652ff7af01853548aaeb47aa8e78618f1eaa`.
It contains eight source-membership cases exercised by
[`test_rust_catalog_source_join.py`](../../../../../../python/umf_access/tests/test_rust_catalog_source_join.py),
which evaluates the live Python predecessor over the packet inputs and compares
the opt-in native result. That packet covers only the post-filesystem source
join, not `compile_catalog` output parity.

Checks run during this audit:

| Command | Result | Limit |
| --- | --- | --- |
| `PYTHONPATH=python/umf_codegen/src /Users/erik/.local/bin/python3.11 -m unittest discover -s python/umf_codegen/tests -q` | Passed, 21 tests. | Confirms the independent codegen Python suite in this checkout; it does not test `umf_access.compile_catalog` or the catalog extension. |
| `PYTHONPATH=python/umf_access/src:python/src python/.venv/bin/python -m unittest python/umf_access/tests/test_rust_catalog_source_join.py python/umf_access/tests/test_native_column_custody.py -q` | Failed, 9 tests: imported `_rust_core` lacks `access_catalog_source_join_profile_version`. | `python/src` shadows the separately installed core package in this command. This result cannot qualify the opt-in operation. |
| `PYTHONPATH=python/umf_access/src /private/tmp/umf-rust-py311-qual/bin/python -m pytest -q python/umf_access/tests/test_rust_catalog_source_join.py python/umf_access/tests/test_native_column_custody.py` | Passed, 9 tests and 8 subtests. | The corrected import path loads `/private/tmp/umf-rust-py311-qual/lib/python3.11/site-packages/umf/_rust_core.abi3.so` (SHA-256 `d6723d9ec6bc99881c605433d5d485ecc616b8300bd8332de8a8ec7b5019b0aa`) with profile `umf-access-catalog-source-join/0.1.0`. This is a local installed-wheel check for the scoped source-join slice, not a full compiler or six-cohort release qualification. |

No full `compile_catalog` predecessor packet, current coordinated installed
Python pair, complete source-coherent wheel test, or broader Rust compiler
candidate was run in this audit.

## Source pins

| Inspected file | SHA-256 |
| --- | --- |
| `docs/helix/02-design/contracts/CONTRACT-067-access-sdk-generator.md` | `1f778f6de97e65e3b18e80b446c3b1d46c298f91433921fb2992ca025c5f9637` |
| `docs/helix/02-design/contracts/CONTRACT-070-access-extension.md` | `6e8e6f428c968b30fc84fe4a73d9c761e1bda18240d33c7fa746e8afd3a8110f` |
| `docs/helix/02-design/contracts/CONTRACT-071-query-command-catalog.md` | `f02ef333f0eb8dc42ac69dffc8da3fdd721d15937178d9ad2a777f3bbab6e625` |
| `docs/helix/02-design/contracts/CONTRACT-072-runtime-targets.md` | `ca6c19fe92d56550d2cb5a16833705b9cbcda70a39da63ab266f5b0161960f97` |
| `python/umf_access/src/umf_access/build/catalog.py` | `cb2bd0b998cd151ef513acb040b2431b33976bc1d44902479e83b9f7f6154471` |
| `python/umf_access/src/umf_access/capture.py` | `492f68954ca66f3fbd15eb008f7e1d6fa690829d9c31e3ec3d85ecb09a7e67a6` |
| `python/umf_access/src/umf_access/dsl/render.py` | `8e57926de9cb62d499e549e5edf575d93220c5e0f460fb376a475e774d9c845b` |
| `python/umf_access/src/umf_access/engine_catalog.py` | `b79e8b42fddb9380643adcb2b05a09d6e16032b92b7f9c4835d7af48c537bb61` |
| `python/umf_access/src/umf_access/reviewed.py` | `a5e10e1101229deaae38e05394c93e77217a4e8eca00fc7d41a17eacc48871be` |
| `python/umf_access/src/umf_access/native_program.py` | `32d633f32305787f1775c8e1b1a6e4d58a3d1c271b311e736d65fdce6ce173bc` |
| `crates/umf-core/src/access_catalog_custody.rs` | `814f85aa1ad92469bb719e40504e1776b7f08bb0f5f5c5c5012d5aabf0fbe989` |
| `python/umf_access/src/umf_access/rust_catalog_custody.py` | `7673ae1c8c69224c599bdacc9003b855970eea7d700b4370c05d021951719d86` |
| `bindings/core/python/src/lib.rs` | `aff48292249dedc0d077301433b4ee43bfb5c13211bde8d4a68cc8fc24fb7dc7` |
| `python/umf_access/tests/fixtures/rust-catalog-source-join/predecessor.json` | `672d858ecd77e6cf6ee940ae6562652ff7af01853548aaeb47aa8e78618f1eaa` |
| `python/umf_access/tests/test_rust_catalog_source_join.py` | `f397b950e5b94ffb0da3878e870267f96e463a725ba4137191d77fa5137b08f5` |
| `python/umf_access/tests/test_capture.py` | `f259325fbfc743452b443761196dc8cec7d7fb95ebaccf6d7ecc59e0455737df` |
| `python/umf_access/tests/test_engine_catalog.py` | `26541631d5ca6e7d95b52e1b30c9f433b1bd0afc89f4fc742a9f65b6a41e27c3` |
| `python/umf_access/tests/test_catalog_writer.py` | `ea18f39f03c90040f091ffd6ae7993d7634af658a978d1b43f8abcbca081f251` |
| `python/umf_access/tests/test_catalog_configuration.py` | `acc7ddf5e54e355ebad73bde1c41637da0477c1ce6250e9237b3af80012a4fac` |

These pins describe the source inspection and test attempt only. They do not
qualify an installed package or a default route.
