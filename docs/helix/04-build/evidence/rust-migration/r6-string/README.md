---
ddx:
  id: umf.evidence.rust-migration.r6-python-string
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
    - id: ADR-006
      kind: informed_by
    - id: CONTRACT-068
      kind: informed_by
    - id: CONTRACT-072
      kind: informed_by
---

# R6 bounded Python string admission

This slice moves Unicode scalar admission for exact built-in Python `str` values
from `umf_access.values.validate_string` into the shared Rust core. It does not
claim a whole-package or release qualification.

## Ownership and behavior

Python still performs the initial `isinstance(value, str)` check. Non-strings
retain `ValueRuleError("string carrier required")`. Exact built-in strings
require the separately versioned `umf-access-string/0.1.0` native capability;
missing or mismatched capabilities fail closed. The Python bridge returns the
original input object after native admission. The Rust binding reads CPython
code points one at a time with `PyUnicode_GetLength` and `PyUnicode_ReadChar`;
it makes no UTF-8 conversion and no full-string copy, so lone surrogates reach
the Rust decision. The Rust core charges one work unit per inspected point and
stops at the first surrogate or non-scalar code point.

String subclasses retain the predecessor's Python iteration and `ord()` path,
including custom iterator results, short-circuiting, exception types and
exception identity. This also means subclasses continue to work when the native
string capability is absent. `FieldValidator(kind="string")` delegates through
the same public helper and returns the identical accepted object.

The PyO3 bridge uses `Context::ordinary()`. Core-level meter and cancellation
tests exercise per-point interruption and prove the stream stops at that
boundary. The raw binding currently supplies no host meter, deadline,
cancellation callback, or enforced total work ceiling; scanning is bounded by
the input's existing Python string and uses constant additional space. Native
engine errors are allowed to propagate as their existing PyO3 error envelopes;
only a `false` scalar decision is translated to the semantic
`ValueRuleError("string contains unpaired surrogate")`. `value_from_native`
and its Unicode-encoding error order are unchanged.

## Predecessor freeze

[`frozen-predecessor.json`](frozen-predecessor.json) captures 18 direct-helper
and `FieldValidator(kind="string")` outcomes before implementation. The probe
ran on CPython 3.11.17 against the source-tree predecessor
`python/umf_access/src/umf_access/values.py`, SHA-256
`02dd96fc2d8de2d6c5ce5bb250a64131a81acb8174231e16ec117f9680d2342d`.
The freeze records ordinary non-string errors; empty, ASCII, BMP,
supplementary and combining strings; lone and explicit paired surrogate code
points at multiple positions; accepted object identity; and custom subclass
iteration, exception identity and invalid yielded-item behavior.
Reproduce the capture from the repository root with
`python3.11 docs/helix/04-build/evidence/rust-migration/r6-string/freeze_predecessor.py`;
the script loads the frozen predecessor Git blob and verifies its SHA-256
before running the controls.

## Verification status

The installed wheel was built from the frozen `/private/tmp/umf-r6-snapshot`
using CPython 3.11.17, Hatchling 1.27.0, Rust 1.90, `CARGO_NET_OFFLINE=true`,
and isolated `CARGO_TARGET_DIR=/private/tmp/umf-r6-string-target`. This is a
historical source-bound cohort: its schema adapter, inspector, and native JSON
hashes are recorded in [`source-cohort.json`](source-cohort.json). The adapter
changed after this wheel was built, so this evidence does not claim the current
worktree or final-release source. The resulting
`umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl` has SHA-256
`150a204c225c620238f1b2e1b47c8bf7d2e12dd6dd7ebb47f4f39a7d8d0af654`.
Its installed extension exposes both versioned string functions, including
the raw exact-string path.

The focused Rust core tests pass, including first-surrogate and above-range
refusals, meter rejection, and cancellation. The installed-wheel access suite
passes 8/8; generated-field/access constraints pass 9/9; the PostgreSQL
projection value suite passes 2/2. These are installed wheel plus source
access-package tests on CPython 3.11.17. No live PostgreSQL server was available
(`pg_isready` reported no response on `/tmp:5432`), so this does not qualify a
native database consumer. The installed-wheel run also does not claim the
entire Python package or release.
