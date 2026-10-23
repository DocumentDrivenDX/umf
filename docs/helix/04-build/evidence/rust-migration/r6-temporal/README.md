---
ddx:
  id: umf.evidence.rust-migration.r6-python-access-temporal
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-002
      kind: informed_by
    - id: ADR-004
      kind: informed_by
    - id: CONTRACT-068
      kind: informed_by
    - id: CONTRACT-072
      kind: informed_by
    - id: CONTRACT-075
      kind: informed_by
    - id: TD-081
      kind: informed_by
    - id: STP-081
      kind: informed_by
---

# R6 Python access temporal codec evidence

This slice implements only the Python carrier profile in CONTRACT-075 and the
instant normalization required by CONTRACT-068. `umf_access.values` retains
Python ownership of exact `date`/`datetime` class admission, fixed `timezone`
admission, `fold == 0`, and offset-field extraction. The native
`access_temporal_canonical_token` operation owns Gregorian validation, local
token construction, fixed-offset arithmetic at microsecond precision, UTC
normalization, and the years 0001–9999 output bound. It calls the existing
Gregorian and exact RFC3339 kernels for calendar/clock validation. The Python
adapter checks the exact `umf-access-temporal/0.1.0` capability and refuses
missing or mismatched native support; it has no Python semantic fallback.

The public `temporal_token` API is retained. Generated codec instant fields
now reconstruct the codec's UTC-aware Python `datetime` from native canonical
token fields. Other codec branches are unchanged. `umf_access` pins
`umf-core==0.11.0`; this requires a compatible native wheel and narrows
installation platforms to the published `umf-core` wheel set until R8 builds
all declared wheels.

## Tested cohort

On Python 3.11.17, the native `umf-core==0.11.0` macOS arm64 abi3 wheel and
`umf_access==0.1.0.dev6` wheel were built from this checkout, installed into an
isolated environment, and tested from the installed distributions. The wheel
SHA-256 values were:

| Wheel | SHA-256 |
| --- | --- |
| `umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl` | `643d255657bacf8a221d1bcc438acf5f29c707d36cc953f9113530a082d42800` |
| `umf_access-0.1.0.dev6-py3-none-any.whl` | `2d69ff1da42161e1ba022e39a881e0479405ddfb27ac9cb433de2bbe3cc89f15` |

These hashes identify the built wheels at test time. The worktree had
concurrent R5 changes, and this receipt does not include an immutable source
closure tying each wheel to a complete repository digest.

`test_temporal_carriers_red.py` passed all six tests against the installed
wheels. Its independent oracle is Python's `datetime`/`timezone` implementation
using `astimezone(UTC)` and integer microseconds, never timestamps or the local
timezone. Vectors span years 0001, 1569/1570 negative Gregorian-era boundaries,
1600 leap day, 1969/1970 epoch boundaries, and 9999. Additional vectors cover
positive and negative offset seconds and microseconds, the maximum admitted
fixed offset, and UTC normalization overflow at both year limits.

`test_access_temporal_codec.py` passed all four tests against the installed
wheels. Its generated-style `encode_model` consumer verified an instant with a
30-second and 1-microsecond offset, exact UTC output, year-underflow refusal
without source-value leakage, refusal when the native profile capability does
not match, and raw native binding acceptance at microsecond 999999 with
value-free refusals at 1000000, 1234567 and `u32::MAX`. A separate
installed-environment probe confirmed importing `umf_access` without temporal
use does not load `umf._rust_core`.

The broader `unittest` discovery over `python/umf_access/tests` ran 434 tests,
skipped 38 and ended with 23 errors. Most errors were missing generated
`commerce`, `refinement_shop`, or `search_docs` packages; two modules also
require `weft`, and one regeneration setup points to an archived wheel path
that is absent from this worktree. The checked-in generated commerce snapshots
cannot serve as the R6 consumer because they pin UMF core 0.8.0 while the
installed runtime requires 0.11.0. The scoped temporal and codec suites above
use the installed R6 wheels and passed independently.

The focused Rust module tests passed all six tests with
`cargo test -p umf-core access_temporal -- --nocapture`. They cover shared
Gregorian/RFC3339 validation, offset seconds and microseconds, kind refusal
precedence, offset range, normalized-year overflow, and Euclidean conversion
across negative epoch/era boundaries. The extension was built with the
repository's macOS unstripped release settings to avoid dyld's invalid
`LINKEDIT` string-pool offsets from stripped artifacts.

This evidence does not qualify other Python versions or platforms, other
timezone implementations, target database temporal conversion, arbitrary
timestamp syntax, or broader temporal semantics. Full wheel-matrix coverage
and platform expansion remain R8 work.

## Public cross-package bridge follow-up

The integration boundary scan found that `umf_access.values` reached the
private `umf._rust` module across packages. The source now calls the public
`umf.rust_temporal` bridge, which forwards to the same native capability without
a Python semantic fallback. A separate offline-built, isolated installed-wheel
cohort on macOS arm64 CPython 3.11.17 passed the six temporal-carrier tests and
four codec/native tests, including profile mismatch and raw microsecond
refusals. The `umf-core` wheel contains `umf/rust_temporal.py`.

| Follow-up wheel | SHA-256 |
| --- | --- |
| `umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl` | `326b913c9b40798f0c104e14e523bc158a992978ae053b76d275d921f1f2cc50` |
| `umf_access-0.1.0.dev6-py3-none-any.whl` | `9962e9cde245949dfebbb1c36ed19a3673ada6b31948854d8784bbc10edae3dc` |

`scripts/check-rust-boundaries.py` passed against 583 current source modules,
with zero findings and no V8 debt, using
`UMF_RUST_BOUNDARY_REPORT=/private/tmp/umf-rust-boundary-current.json` so the
historical R4 receipt was not overwritten. The follow-up wheels were built
while other R5 files were still changing; these hashes identify tested artifacts
but do not prove an immutable whole-source closure or the release matrix.
The installed-wheel P1 compatibility replay passed 59 runtime tests against
the follow-up wheels. A separate Sol review verified both recorded hashes,
the installed facade, lazy native loading, six carrier tests, and four
codec/native tests and found no P1/P2 issue in this public bridge. That approval
is limited to the macOS arm64 CPython 3.11 cohort and the public bridge change.
