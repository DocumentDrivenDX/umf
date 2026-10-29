# R6 CPython 3.14 regex profile

This bounded R6 slice adds `PythonReVersion::V3_14` from an exact CPython
3.14.8 runtime. The installed CPython reports Unicode 16.0.0. The profile keeps
the 3.11–3.13 tables intact and adds versioned Unicode classification,
case-folding and character-name data. The versioned behavior changes exercised
here are the new `\z` strict-end escape and Python 3.14's `\B` match on the
empty string. Older profiles continue to reject `\z` and keep their previous
empty-string `\B` result.

`tools/extend_python_re_314.py` is an additive generator: it reuses the table
program in `generate_python_re_tables.py`, adds the profile without rewriting
older version data, merges CPython 3.14's canonical names with the vendored
Unicode 16 `NameAliases.txt`, and freezes a 3.14 oracle. The oracle comprises
all 403 cases in the vendored CPython `re_tests.py` source plus nine explicit
release-delta and Unicode 16 cases. Outcomes are produced by CPython's `re`
module and consumed by the independent Rust integration test; Rust candidate
results are not inputs to fixture generation.

The exact local oracle was CPython 3.14.8, Darwin arm64, Unicode 16.0.0. The
focused Rust regex unit tests pass (15 tests), the 412-row independent CPython
3.14 corpus passes, and the rebuilt PyO3 extension passes six source-tree
schema/regex assertions under CPython 3.14.8, including `\z`, empty-input
`\B`, and Unicode 16 classification/case-folding. These results do not claim
the complete CPython `test_re` suite, installed-wheel qualification, other
platforms, or broad regex semantic equivalence beyond the existing versioned
corpora and this additive 3.14 cohort.

The Unicode input is the official [Unicode 16.0.0 UCD
`NameAliases.txt`](https://www.unicode.org/Public/16.0.0/ucd/NameAliases.txt),
SHA-256 `bc5e89e5a6f2cf21b1d3976af13432bab3f0b406907d7c7ba9c0f4faf3fc5b44`.
The original 2024 Unicode copyright, version and license URL remain in the
vendored source file. Unicode's current [Terms of Use](https://www.unicode.org/copyright.html)
places UCD data files under Unicode License V3; the repository already carries
that notice at `crates/umf-core/src/python_re_tables.LICENSE`, and the license
permits redistribution provided the notice accompanies the data or associated
documentation. This evidence record associates that notice with both the
vendored file and generated tables. The CPython regex corpus source remains
covered by `crates/umf-core/tests/fixtures/cpython-re/PSF-LICENSE.txt`.

The additive generator verifies `PythonReVersion::V3_14` data without
regenerating the older profiles. A direct comparison confirms that the
3.11–3.13 `python_re_tables.rs` prefix is byte-identical to the predecessor and
all 144,141 prior name-table rows retain identical codepoint/version values.

## Source identities

| Source | SHA-256 |
| --- | --- |
| `crates/umf-core/src/python_regex.rs` | `a3f42238509f8d135bca58bc8adaf683dc5747674676295f20023355ab2079ef` |
| `crates/umf-core/src/python_re_tables.rs` | `a6d89252f77e11d1646c22a002d0ee063ac841d681cd8d1e644edd4dd30f9145` |
| `crates/umf-core/src/python_re_names.dat` | `83e6ec8d43bf356fa1a511508ebf45aef2f6a56efd9d834ba653f3b21b79456f` |
| `crates/umf-core/tools/extend_python_re_314.py` | `f7589b1f821ef4175f88f066f97b5c99290155cf62347e3c7c3bf5c433393436` |
| `crates/umf-core/tools/unicode/NameAliases-16.0.0.txt` | `bc5e89e5a6f2cf21b1d3976af13432bab3f0b406907d7c7ba9c0f4faf3fc5b44` |
| `crates/umf-core/tests/fixtures/cpython-re/outcomes-3.14.tsv` | `b1795db238445eeeafcbd7b370ae27a63ca914dc06ec33440fccd445a384de4a` |
| `crates/umf-core/tests/python_regex_314.rs` | `ed7434741b3b1d97ddae176be044a9c9f6049d87ee2706d635e667ba614b67a8` |
| CPython 3.14.8 executable | `1b5cb11d163e5ba34e2a05fc533c0ed89574d4425f9749a9d89405f651980e0d` |

## Core 0.10.3 publication qualification

Core 0.10.3 is merged and published with [complete bounded publication evidence](core-0103-dependency-plan/public-release-40547321010/README.md). Fresh Linux x86_64 Python 3.11/3.14 public installations each passed the original 254-test suite, byte/native correspondence and required probes. The original source-tree observations above retain their recorded scope.

The built macOS arm64 artifact ships with retained Python 3.11 qualification; macOS Python 3.14 remains unqualified and no fresh macOS public installation proof is claimed. CI runs on Linux. Migration SDK and remaining migration backlog acceptance are separate.
