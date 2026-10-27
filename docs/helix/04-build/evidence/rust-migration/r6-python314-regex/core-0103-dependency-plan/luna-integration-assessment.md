# Core Python 3.14 integration assessment

Read-only source/Git comparison for coordination plan `core-python314-coordination-plan001.md`.

## Compatibility and minimum extraction

The bounded feature commit is `f4a410c0522135065a0b20e8d2b69705fddcbac4` (`Add bounded CPython 3.14 regex profile to Rust core`). It changes exactly eight paths:

- `crates/umf-core/src/python_regex.rs`
- `crates/umf-core/src/python_re_tables.rs`
- `crates/umf-core/src/python_re_names.dat`
- `crates/umf-core/tests/fixtures/cpython-re/outcomes-3.14.tsv`
- `crates/umf-core/tests/python_regex_314.rs`
- `crates/umf-core/tools/extend_python_re_314.py`
- `crates/umf-core/tools/unicode/NameAliases-16.0.0.txt`
- `docs/helix/04-build/evidence/rust-migration/r6-python314-regex/README.md`

The migration primary at `fff3d28f0a438bef693aaf04ec9eab82b9ebee53` has byte-identical preimage versions of all changed existing files and the directly used generator/corpus inputs compared with the feature commit's parent. The source delta is therefore a clean eight-file extraction; it does not need Rust-port-specific source or dependency files. Keep the documentation/evidence path because it records source provenance and the actual limited R6 results. Do not merge the entire Rust branch.

The implementation adds V3_14 selection to the existing versioned Unicode table and name lookup paths, the 3.14 `\\z` strict-end escape, and 3.14 empty-input `\\B`, while retaining 3.11–3.13 table branches and changing the profile refusal assertion to reject 3.15. The full independent fixture has 412 rows (403 vendored `re_tests.py` entries plus nine explicit 3.14/Unicode 16 cases). No other repository call sites requiring enum updates appeared in the source search; the implementation and tests are the direct `PythonReVersion` match sites.

## Provenance and generator constraints

`extend_python_re_314.py` is an incremental generator, not a source-only patch: it reads the canonical generator's literal table program, requires an exact CPython 3.14 executable, and rewrites the versioned tables, compact name table, and oracle. It records hashes for the executable, alias input, generator, and outputs. Its emitted provenance does not include an explicit hash for the vendored `re_tests.py` input or pre-generation base table/name files. A hosted recipe should bind those source inputs separately and record exact resulting output hashes; it should verify older 3.11–3.13 table bytes and old name mappings remain unchanged as claimed by the README. Unicode alias data is vendored as `NameAliases-16.0.0.txt`; the evidence associates it with the existing `python_re_tables.LICENSE` notice.

The README reports local CPython 3.14.8/macOS source-tree results: 412 corpus rows, 15 focused Rust tests, and six source-tree PyO3 assertions. These are historical supporting evidence, not installed-package or cross-platform release evidence.

## Release evidence still required

Core 0.10.2 cannot acquire this behavior retroactively. After integrating the eight files, a new immutable Core release is required. Release qualification still needs the original four installed-wheel cells (Linux and macOS, Python 3.11 and 3.14), exact 3.11–3.14 parser/fold/class/anchor/group-name/version-refusal corpora against independent CPython oracles, preservation of all 3.11–3.13 regressions, and the offline-mirror native Document read/write roundtrip using each relevant installed artifact. Keep the recorded failing macOS 3.14 log as baseline. The existing source-tree and overlay checks cannot substitute for these installed-wheel gates.
