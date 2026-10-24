---
ddx:
  id: umf.evidence.rust-migration.r6-related-key-payload
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-004
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: CONTRACT-068
      kind: informed_by
    - id: CONTRACT-069
      kind: informed_by
    - id: CONTRACT-071
      kind: informed_by
    - id: CONTRACT-072
      kind: informed_by
    - id: CONTRACT-075
      kind: informed_by
---

# R6 PostgreSQL related-Key JSON parser: Gate 0

This packet freezes the Python predecessor at
`python/umf_access/src/umf_access/related_keys.py` before any Rust or PyO3
change. It covers the `json.loads` call inside `decode_related_keys`, including
the `_object` duplicate-member hook and `_number` integer, float, and constant
hooks. It does not port or replace the surrounding metadata admission, payload
shape and bound checks, component conversion, Decimal construction, Pydantic
graph validation, Key ordering, or `RelatedKeys` construction; those remain
Python-owned under CONTRACT-068 and the runtime/engine boundaries in
CONTRACT-069/071/072/075.
The PostgreSQL read wrapper also remains Python-owned: it maps a caught
`CodecError` to `ReadObligationUnmet("native related-Key output differs from
original decoder")` without exposing parser detail.

The frozen predecessor is [`frozen/related_keys.py`](frozen/related_keys.py),
SHA-256 `dff3862ac453c553288123436d16e71799b6f43669ee8879f6865b4178bc6324`.
The capture harness SHA and all packet hashes are listed in
[`frozen/source-hashes.json`](frozen/source-hashes.json). The current source
matched this frozen SHA at capture time. The harness executes the frozen
`decode_related_keys` body on CPython 3.11.17 and 3.14.8. It uses stdlib-only
test doubles for Pydantic, generated Key models, and `validate_graph`, so it
isolates the parser plus surrounding Python refusal order without claiming
Pydantic validator or native PostgreSQL/Weft/Truss/Ashlar equivalence. Existing
focused Python behavior remains in
[`test_related_key_transport.py`](../../../../../../python/umf_access/tests/test_related_key_transport.py)
and
[`test_truss_related_metadata.py`](../../../../../../python/umf_access/tests/test_truss_related_metadata.py).

## Frozen behavior

The 56-case reports are
[`cpython-3.11.json`](frozen/cpython-3.11.json) and
[`cpython-3.14.json`](frozen/cpython-3.14.json). Inputs are recorded as exact
Python code-point sequences, which distinguish a raw astral scalar from two
literal surrogate code points even when an ASCII JSON rendering would look
similar. Outcomes record exception class/message, cause and context class/message,
`__suppress_context__`, returned string code points and Decimal tuples, and
Decimal context flags before and after each call. One success case seeds
`Inexact` and `Rounded` before Decimal conversion;
the two extreme exponent refusals set `InvalidOperation`. This distinguishes
inherited context state from flags raised during the call.

The matrix covers duplicate decoded names at the root and nested in arrays,
integer/float/exponent/nonfinite tokens in used and otherwise-unused nested
locations, malformed syntax, raw astral and surrogate inputs, escaped surrogate
pairs and unpaired escapes, accepted root/payload forms, row bounds, truncation,
component/order refusals, and first-failure controls. Every JSON parse refusal
raised by `_object`, `_number`, or `json.loads` `ValueError`/`TypeError` handling
becomes `CodecError("invalid related-Key JSON text")` with no chained cause.
The source also permits a few Python `Decimal` constructor failures to set the
ambient `InvalidOperation` flag before translating them to the fixed
`CodecError`; the two enormous exponent cases record that flag. Other cases
start with cleared flags so the observation is per-call.

One material predecessor divergence is version-specific: 1,200 nested JSON arrays cause CPython 3.11.17 to leak
`RecursionError("maximum recursion depth exceeded while decoding a JSON array
from a unicode string")`; CPython 3.14.8 parses the same text and then returns
`CodecError("closed related-Key JSON payload required")` at the root-shape
stage. A malformed trailing comma also maps to the same outward generic
`CodecError` on both versions, but the suppressed `JSONDecodeError` context
message differs. The other 54 cases match across all captured fields. A single
Rust parser cannot reproduce both interpreter-specific recursion outcomes
without consulting the Python version or choosing a common depth policy. The
opt-in implementation keeps the parser iterative and applies versioned
recursion guards at the Python boundary.

## Proposed production boundary for review

The proposed thin Python facade is a versioned `umf.rust_related_keys`
capability whose parser accepts the already type-checked exact Python `str`
and returns the JSON value tree expected by the existing Python checks. It
should be parser-only: generated Key metadata, Pydantic model creation,
Decimal conversion/flags, field admission, and native engine reads remain in
Python or their existing owners. Native malformed syntax, duplicate decoded
object member names, and any JSON numeric token (including `NaN` and infinities
at any nesting depth) should collapse at the Python facade to the existing
`CodecError("invalid related-Key JSON text")` without an underlying cause.
Metadata/profile and `type(value) is str` checks stay before this call; root,
bound/truncation and component checks stay after it.

Rust `String` is not a lossless carrier for every Python string accepted here.
The PyO3 boundary should therefore carry Unicode code points, including
surrogates, without passing through `str`/UTF-8 replacement conversion. A
candidate is CPython UCS-4 access or Python UTF-32 little-endian encoding with
`surrogatepass`, with the reverse conversion preserving each code point.
Escaped high/low surrogate pairs in JSON must combine into one astral scalar as
`json.loads` does; unpaired escapes remain lone surrogate code points. Raw
surrogate code points already present in the Python source string remain
individual code points. Sol review must select and qualify the concrete PyO3
representation, including abi3 availability and output construction.

`decode_related_keys` has no payload-size limit, parser work meter, or
cancellation argument. The enclosing PostgreSQL read does carry a finite
`timeout_ms` deadline (default 5,000 ms, checked by `_DeadlineCursor`); related
payloads are decoded synchronously after `fetchmany`, so the parser cannot be
interrupted mid-call. The driver rechecks its deadline before subsequent
cursor work and does not return the page after an overrun. This is caller-level
deadline enforcement, not a hard parser-work or payload-byte bound. Do not
claim a Rust resource ceiling or introduce a new acceptance limit in this
parity slice. A Rust implementation should avoid native stack overflow by
using an iterative parser or equivalent safe internal strategy, but that
choice must be reconciled with the observed 3.11/3.14 depth divergence above.
Passing a deadline or cancellation/work-meter control into the parser is a
possible follow-up, but changes this helper's current call interface and needs
owner approval plus interruption/refusal-order evidence. The existing Key
`bound` limits returned rows, not input bytes or parser work.

At Gate 0 capture there was no Rust/PyO3 implementation, Cargo/rustc/native
build, installed wheel, or engine replay. The frozen source, harness and reports
above remain the immutable predecessor record.

## Replay

Run from the repository root with the named interpreters available:

```sh
python3.11 docs/helix/04-build/evidence/rust-migration/r6-related-key-payload/capture.py --source-check --check
python3.14 docs/helix/04-build/evidence/rust-migration/r6-related-key-payload/capture.py --source-check --check
```

`--source-check` refuses if the live Python predecessor no longer matches the
capture-time SHA. `--check` replays the immutable frozen copy and compares the
whole per-interpreter report. The reports bind only the recorded source and
CPython versions; the test doubles deliberately leave Pydantic behavior,
package installation, native bindings, and consumer execution unqualified.

## Opt-in implementation checkpoint

The implementation adds a parser-only `umf_access.rust_related_keys` facade and
an opt-in `decode_related_keys_rust` entry point. The existing
`decode_related_keys` continues to use CPython `json.loads`. Metadata/profile
admission, exact `str` admission, root shape, bound/truncation, component
conversion, Decimal construction and flags, Pydantic validation, Key ordering,
and driver behavior remain Python-owned. The access facade calls the public
`umf.rust_related_keys` core capability bridge rather than the core package's
private extension. The access Python dependency-boundary check passes 93 modules
with zero violations. The Rust parser stores strings as
Unicode code points; the PyO3 bridge transports Python `str` through
`encode("utf-32-le", "surrogatepass")` and reconstructs values by the matching
surrogate-preserving decode.

The depth policy is versioned at the Python boundary. The parser core remains
iterative and imposes no independent depth, work, input-size or output-size cap.
The binding uses balanced `Py_EnterRecursiveCall` / `Py_LeaveRecursiveCall`
calls for each parsed array/object, so the active CPython recursion limit and
ambient Python call depth govern the opt-in call. This preserves the captured
CPython 3.11.17 `RecursionError` for 1,200 nested arrays and the captured
CPython 3.14.8 parse-then-root-shape `CodecError`; it does not impose a common
depth policy. The scan stops at the parser's first failure offset so later
trailing text or containers cannot override an earlier parser refusal.

The Python facade reconstructs duplicate/numeric hook failures as their inner
`CodecError`, and malformed syntax as a `JSONDecodeError` with the versioned
message and source position. The existing outer `raise CodecError(...) from
None` therefore retains the frozen exception class/message/order,
`__context__`, `__cause__` and `__suppress_context__` behavior. The facade only
selects the captured CPython 3.11 and 3.14 profiles.

The binding and module registration compile with locked offline Cargo inputs;
all 11 focused Rust parser tests pass. The opt-in PyO3 extension replay matches
all 56 frozen outcomes on CPython 3.11.17 and all 56 on CPython 3.14.8 (112
facade observations total). The approved 3.11 deep-array recursion outcome,
3.14 root-shape outcome, malformed/numeric precedence and exception context
match exactly. Sol's independent review found that a low custom recursion
limit exposes additional differences on both 3.11 and 3.14: per-container
native guards do not consume the same Python decoder and hook frames as
`json.loads`. Sol found that the first replay's `ambient(190)` control under
recursion limit 50 failed before parser entry. The control now uses limit 250,
requires an observed parser call, and records the versioned 3.11
`RecursionError` / 3.14 root-shape `CodecError`. Both frozen replays still pass
56/56. Broad recursion parity remains an opt-in qualification gap.

The custom-limit controls are now source-bound in
[`recursion_controls.py`](recursion_controls.py), with captured matrices in
[`custom-recursion-cpython-3.11.json`](custom-recursion-cpython-3.11.json) and
[`custom-recursion-cpython-3.14.json`](custom-recursion-cpython-3.14.json).
Each matrix checks limits 30, 50, 100 and 250 at ambient Python call depths 0,
10, 25, 40 and 190, then finds the first nested-array depth raising
`RecursionError` (through depth 220). It records whether the parser path was
entered, separating parser-budget outcomes from failures before dispatch.

On CPython 3.11, 12 of 20 controls differ by exactly one nested array: the
Rust facade reaches its first parser `RecursionError` one container later than
the frozen `json.loads` decoder. For example, limit 50 at ambient depth 0 gives
frozen depth 40 and Rust depth 41; limit 250 at ambient depth 190 gives 50 and
51. A trial with a second native recursion guard moved the limit-50/ambient-0
Rust threshold from 41 to 21, so a fixed extra guard is not a valid repair.
CPython 3.14 has one mismatch in the 20 controls: at limit 50 and ambient depth
40 the frozen decoder has no `RecursionError` through depth 220, while the Rust
facade raises at depth 1 after parser dispatch. Disabling its native recursion
guard did not resolve this case, which is raised by the additional Python
facade frames near an exhausted ambient stack; that trial was reverted. Adding
a second guard also failed: at limit 50 and ambient depth 0 it moved the Rust
threshold from 41 to 21. No artificial recursion offset or duplicate CPython
parse was added; these profiles remain qualified only for the frozen 56-case
corpus and recorded controls, not arbitrary recursion limits or ambient stack
depths.

Replay the custom controls with the same source-tree extension overlay used by
the 112-case corpus:

```sh
python3.11 docs/helix/04-build/evidence/rust-migration/r6-related-key-payload/recursion_controls.py --extension-overlay /path/to/extension-overlay --output /tmp/custom-recursion-cpython-3.11.json
python3.14 docs/helix/04-build/evidence/rust-migration/r6-related-key-payload/recursion_controls.py --extension-overlay /path/to/extension-overlay --output /tmp/custom-recursion-cpython-3.14.json
```

The initial refactor also added one Python call frame to the default decoder,
changing refusals near a custom recursion limit. The default function body has
since been restored to the frozen predecessor's direct `json.loads` call frame;
an independent CPython 3.11 probe at recursion limit 100 now finds no mismatch
for six payload endings at depths 80–104. The default decoder remains on
`json.loads` and has not been cut over.

### Corrected custom-limit measurement (successor to the wrapper matrices)

The two `custom-recursion-cpython-3.11/3.14.json` files immediately above are
retained as historical diagnostic artifacts, but their entry counts and
threshold conclusions are superseded. Their monkey-patched wrappers added a
Python call frame around the frozen `json.loads` and, on the Rust side, an
additional frame specifically around the native call. Thus the Rust-path frame
count was not equalized; that extra frame could mask a one-container threshold
difference. Do not use their `parserEntered` values as proof of native entry.

The successor runner, [`recursion_controls.py`](recursion_controls.py), records
the direct production call outcome and a separate `sys.setprofile` diagnostic
for the same 20 `(recursion limit, ambient depth)` controls. No callable is
replaced. Profile events identify Python `json.loads`, the Rust facade, and the
native PyO3 `related_keys_parse` `c_call`. A normal successful-call probe also
observed that exact native event. However, profiling itself changed first-error
outcomes in 14 controls on CPython 3.11 and one on 3.14, so profile entry counts
are diagnostic only; only the unprofiled columns are used for the threshold
comparison. Corrected compact records are
[`custom-recursion-cpython-3.11-direct.json`](custom-recursion-cpython-3.11-direct.json)
and
[`custom-recursion-cpython-3.14-direct.json`](custom-recursion-cpython-3.14-direct.json).

On CPython 3.11.17, 12/20 direct controls differ by exactly one nested array:
the frozen decoder fails at depth `n`, while Rust fails at `n+1`. Both direct
failures use CPython's contextual message `maximum recursion depth exceeded
while decoding a JSON array from a unicode string`, which identifies the native
recursion guard failure rather than a generic facade-stack failure. The other
eight controls reach ambient recursion failure before either parser or parse
success through depth 220. On CPython 3.14.8, all 20 direct controls agree;
there is no 3.14 direct threshold mismatch in this matrix. A profile-only
generic failure at limit 50 / ambient depth 40 is an instrumentation artifact
and is absent from direct calls. These bounded controls do not establish
arbitrary recursion-limit parity. No version-specific offset is justified:
the 3.11 delta is stable in the tested parser-reached controls, but a fixed
extra guard previously overcorrected substantially and would be artificial.
The safe result is to leave custom-limit parity open and keep this parser
opt-in.

The direct-control replay was run against the unchanged parser source. The
frozen corpus still matches all 56 outcomes on each interpreter (112 total).
At this checkpoint, SHA-256 values are:

| Source/artifact | SHA-256 |
| --- | --- |
| `bindings/core/python/src/related_keys.rs` | `585dde491ba7a3907172be72d79c24a41207009e8888b04ee4ab94affa7c5a97` |
| `python/umf_access/src/umf_access/rust_related_keys.py` | `7b641a74754061a694dc53a4ef37258f75b5dc4b2567fdc2456a520af07f24f0` |
| `recursion_controls.py` | `95d6b5a610c36af2798a3ea2736cbe06ba653963aebf9c6936fca865c76eae33` |
| `custom-recursion-cpython-3.11-direct.json` | `c19e873c4942b8e858f5a47d410490b9bcb87b8ae6701c79773a2906fd6da8de` |
| `custom-recursion-cpython-3.14-direct.json` | `7e84ab1a6e18b052ee4e2b5b404eda637e5421bd463dd6d1b03e8d6e4377688a` |

The focused pytest module could not be collected against the existing generated
`commerce` fixture because its `GeneratedSource` pins do not match the current
runtime. The frozen corpus replay uses synthetic generated Key models and
independently confirms parser and Python refusal behavior. Installed consumer
and native engine replay remain pending. No default cutover or broader
parser/resource support is claimed.

The 106 parser-applicable observations are 53 cases in each of the two frozen
interpreter reports. The full installed facade replay must still compare all 112
observations. The six excluded from the parser-only count are the three
preflight cases in each interpreter cohort: `precedence-metadata-before-parse`,
`precedence-owner-profile-before-value-type`, and
`precedence-value-type-before-parse`. Each is refused by Python-owned metadata,
profile, or exact-string admission before the Rust parser is called.

The earlier source snapshot hashes in the legacy table at the end of this
record are retained as historical values. Successor hashes appear in the
additive repair section below.

## CPython 3.11 recursion repair — 2026-10-23

This additive successor leaves the frozen direct-call predecessor files and
earlier failed experiment unchanged. The PyO3 boundary now holds one additional
recursion credit while it replays the first JSON container on CPython 3.11.17,
matching the active `json.loads` frame. CPython 3.14.8 retains its prior rule.
The parser remains iterative, and the default Python decoder still calls
`json.loads` directly.

The [3.11 repaired direct-call report](custom-recursion-cpython-3.11-direct-repaired.json)
and [3.14 report](custom-recursion-cpython-3.14-direct-repaired.json) have
SHA-256 `78054141cf8c7139b976411138512c863ec3657ff661282bab5d1f8c21b05491`
and `bad4232d37307632f4745078e56a009a399aab78ea82cd7977f8d24e4c98959f`.
Each matches all 20 frozen direct-call outcomes; the full frozen facade replay
matches 56/56 on each interpreter. Eleven focused Rust parser tests,
`cargo check -p umf-core-python`, and the rebuilt PyO3 extension pass. The
extension used for independent replay has SHA-256
`a7c08dcc6c88af415588694d204f0f7c67ec073f16d66eb0a9abd5a98d6c3ae5`.
The repaired binding and authored test source SHA-256 values are
`d5f99acccc49c8d2f4bf89b94c4673ad3af3585cfbd223b9e490f03738a56114`
and `60c3a922ea3df3d51329d9c2251d95400b6c92fa2fd5cfe8c0fed1470a1ba2a5`.

Independent Sol review reproduced 12/20 old CPython 3.11 mismatches and
0/20 repaired mismatches on both interpreters. It ran the authored threshold
test with synthetic captured Key metadata: the old extension failed at Rust
depth 45 versus Python depth 44; the repaired extension passed on both
interpreters. No P1/P2 remained in this bounded repair. The generated commerce
fixture's `GeneratedSource` pins are stale, so this is not a complete package
test. Installed generated-client/native-engine acceptance and hard work,
memory, cancellation and deadline guarantees remain open.

### Earlier source snapshot (historical)

| Source | SHA-256 |
| --- | --- |
| `crates/umf-core/src/access_related_keys.rs` | `4f04679c88dbb020208557759c4b9a020acb271b81f2de81255df5fe4a95e697` |
| `bindings/core/python/src/related_keys.rs` | `585dde491ba7a3907172be72d79c24a41207009e8888b04ee4ab94affa7c5a97` |
| `python/umf_access/src/umf_access/related_keys.py` | `bd47ac0367e27bf104fa3ae8bf797608ce7fee3f24eef6dbb88a620ce5fe2c12` |
| `python/umf_access/src/umf_access/rust_related_keys.py` | `7b641a74754061a694dc53a4ef37258f75b5dc4b2567fdc2456a520af07f24f0` |
| `python/src/umf/rust_related_keys.py` | `42a003455ee004ceb8027e72f561e292c3686afa190d5fc0f6423688b232b912` |
| `python/umf_access/tests/test_rust_related_keys.py` | `4f612e3259aafed47bd8380de1e990b88faa8ad869b0e20fcc7fdaaa640fb2be` |
| `docs/helix/04-build/evidence/rust-migration/r6-related-key-payload/replay_rust.py` | `2c2ae2a7cb5d3bb8663645574ea34c61abb17b5a6373df24f64345aac58a5636` |
| `docs/helix/04-build/evidence/rust-migration/r6-related-key-payload/recursion_controls.py` | `283f945527ef5e69ecb1708a2230e65b6d3a0a45dbfcb6fab608ed3fc95a0912` |
| `docs/helix/04-build/evidence/rust-migration/r6-related-key-payload/custom-recursion-cpython-3.11.json` | `f38677660b6b0aefa9859b4a1dae09c409bac46fd4cd2a2f006ab0e879a6060f` |
| `docs/helix/04-build/evidence/rust-migration/r6-related-key-payload/custom-recursion-cpython-3.14.json` | `639d07d17869ea507fa5063af1d9113f67333540c346b1da679dcbfb6c7a13c9` |

### Staged live default replay (current source)

The public `decode_related_keys` default now selects the Rust JSON parser only
for CPython 3.11 and 3.14, after metadata, PostgreSQL profile, and exact-`str`
admission. The call remains in the public decoder frame. CPython 3.11 uses the
explicit `loads_default` facade frame to model the call topology needed by its
`json.loads` recursion budget; CPython 3.14 calls `loads` directly. The
opt-in `decode_related_keys_rust` path is unchanged. CPython 3.12/3.13 and
non-CPython runtimes keep the Python `json.loads` path. Missing or mismatched
native capability is caught only at the PostgreSQL boundary and becomes a
fixed `ReadObligationUnmet` after decoder metadata and text-type admission.

Using current access source and an abi3 extension rebuilt from the current
Rust binding source, the live default matched all 56 frozen outcomes and all
20 unprofiled direct recursion controls on both CPython 3.11.17 and 3.14.8.
The source replay also retains the frozen parser-entry count of 53/56 on
CPython 3.11; the other three observations are rejected before parser entry.
Profiling changed outcomes in 14 controls on 3.11 and zero on 3.14, so those
profiled results remain diagnostic only. The earlier 12/20 result came from
the immutable 6cd866f core wheel, which predates the binding repair recorded
above; it is not evidence for the current binding. Its one-array threshold
deltas were `(limit, ambient depth; frozen → wheel)`: `(30,0; 21→22)`,
`(30,10; 11→12)`, `(50,0; 41→42)`, `(50,10; 31→32)`, `(50,25; 16→17)`,
`(100,0; 91→92)`, `(100,10; 81→82)`, `(100,25; 66→67)`, `(100,40; 51→52)`,
`(250,25; 216→217)`, `(250,40; 201→202)`, and `(250,190; 51→52)`. The
current extension/source overlay results below have zero unprofiled mismatches.

The access source was not installed in that replay. The compiled extension
was built with the documented macOS LINKEDIT workaround from
`bindings/core/python/src/related_keys.rs` SHA-256
`d5f99acccc49c8d2f4bf89b94c4673ad3af3585cfbd223b9e490f03738a56114`; its
SHA-256 was
`9908b33f12b89ea2e58bfc209322799cea3e7590eac12f7ce3064ad8a9a23787`.
Both replay runners used the synthetic Pydantic and generated-Key capture
harness, so this is source/extension overlay evidence, not an installed wheel
cohort or PostgreSQL/Weft consumer qualification.

Actual CPython 3.12.15 and 3.13.16 probes loaded the current live decoder with
the frozen synthetic model, decoded a valid related-Key payload, and observed
no import of `umf_access.rust_related_keys`; the Python parser remained
selected. The focused source test module passed 10 tests plus five subtests on
CPython 3.11 and 10 unittest cases on CPython 3.14 with a temporary synthetic
`commerce.OrderKey`. These checks do not qualify Rust behavior on 3.12/3.13 or
replace the pending exact installed core/access-wheel and consumer runs.

Current replay source hashes are:

| Source | SHA-256 |
| --- | --- |
| `bindings/core/python/src/related_keys.rs` | `d5f99acccc49c8d2f4bf89b94c4673ad3af3585cfbd223b9e490f03738a56114` |
| `python/umf_access/src/umf_access/related_keys.py` | `90dd7aeb784ff06bd0baebf1e035b819aee66fd5619eb74af159f109a49132ca` |
| `python/umf_access/src/umf_access/rust_related_keys.py` | `e80fa3489cefa12aaaaa80b55784f0bb03d53c1cb466c3bc3f0c1710c40ab5b6` |
| `python/umf_access/src/umf_access/postgres_read.py` | `51002e22de961cec878a85370aecd9458dce9d30e9bf279c5789567dcf3246ab` |
| `python/umf_access/src/umf_access/types.py` | `d351d98cc0076342cfac4914103ab32eafbf6140adec1a28b4066f8ef9b0c3cc` |
| `python/umf_access/tests/test_rust_related_keys.py` | `33a052c0ce39046365fa18e61a77723fb66fd51ac0da3134ef82ffcb1eb32357` |
| `replay_rust.py` | `2a20121da4281307c6a722bb0446968274e53b8a6d45d0becef17dd95a6c7690` |
| `recursion_controls.py` | `6da9deea6578145a5c22c76031fd3372844fb0e99641a7ca477466908f489831` |
| Current compiled extension overlay | `9908b33f12b89ea2e58bfc209322799cea3e7590eac12f7ce3064ad8a9a23787` |
