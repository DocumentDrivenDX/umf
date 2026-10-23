---
ddx:
  id: umf.evidence.rust-migration.r6-outcome-values
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
    - id: CONTRACT-067
      kind: informed_by
    - id: CONTRACT-068
      kind: informed_by
    - id: CONTRACT-069
      kind: informed_by
    - id: CONTRACT-070
      kind: informed_by
    - id: CONTRACT-071
      kind: informed_by
    - id: CONTRACT-072
      kind: informed_by
    - id: CONTRACT-073
      kind: informed_by
    - id: CONTRACT-074
      kind: informed_by
    - id: CONTRACT-075
      kind: informed_by
    - id: CONTRACT-079
      kind: informed_by
---

# R6 authenticated outcome-values predecessor freeze

This packet freezes the current Python `outcome_values` implementation before
any Rust or PyO3 change. It covers only `outcome_invocation`, `outcome_slot`,
`outcome_record`, and `outcome_from_record`. CONTRACT-067–075 and CONTRACT-079
remain governing requirements; this packet does not qualify a database, host,
transaction, or complete idempotent-write implementation.

The immutable source snapshot, captured 2026-10-23, is `frozen/outcome_values.py`. `capture.py` loads
that file without importing the package initializers, while using the current
`operation_values` and `session_policy` dependencies. Canonical JSON, digest,
and strict loads therefore use the existing `umf-operation-values/0.1.0`
Rust-backed source bridge; their exact source identities are included in each
capture. New reports record the resolved path and SHA-256 of the loaded
source-tree abi3 extension when available. The historical reports below predate
that field and do not bind an executable cohort. `frozen/source-hashes.json`
records the capture-time dependency identities. No build or production source
edit was made for the original packet.

## Captured behavior

The report contains the exact canonical invocation and response text, HMAC
preimage bytes, derived receipt-authentication key, row-signature body and
signature, slot digest, error class/message outcomes, and payload byte boundary.
The test key and records are deterministic fixtures, not production secrets.
The host-secret bytes appear only as a fixed test fixture; the report contains
derived test vectors for reproducing the preimages.

Both captured runtimes accept a 131,072-byte canonical payload and verify it;
`outcome_record` refuses 131,073 bytes with `SessionError: outcome receipt
capacity exceeded`, while `outcome_from_record` rejects an oversized stored
payload as `SessionError: stored outcome is invalid` before signature checking.
The slot key admits 256 UTF-8 bytes, rejects 260 bytes, rejects empty/NUL and
non-string values with the fixed key diagnostic, and raises Python's
`UnicodeEncodeError` for a lone surrogate before consulting identity fields.
`outcome_invocation` has no explicit secret-length/type check: canonicalization
and UTF-8 encoding happen before `hmac.new` rejects an invalid secret. By
contrast, `_signature` checks exact `bytes` type and a 32-byte minimum at the
signature stage. `outcome_record` computes the response HMAC before it reaches
that check.

Stored receipt first-refusal order is frozen as: exact tuple/list and four exact
strings; lowercase 64-hex invocation/scope/signature and UTF-8 payload limit;
signature authentication; JSON parsing; metadata and authority matching;
response digest and effects-list shape/count; then each exact integer-token
string and declared row bound. A bad signature prevents malformed JSON parsing.
An authenticated malformed JSON payload reaches the operation JSON diagnostic.
Python's ordinary comparisons also mean `items=True` and `max_rows=True` can
admit a single effect with token `"1"`; `outcome_record([True])` writes token
`"True"`, which the verifier rejects at the count stage. These are captured as
predecessor behaviors, not endorsed API design.

The existing `test_table_outcomes.py` separately records tampering, principal,
slot, secret, metadata, and count refusals. This packet adds a self-contained
executable matrix for those first-refusal stages and boundary controls. It does
not run a native database writer to measure storage effects. The frozen source
inspection of `table_writes._steps` records the sequence: operation probe,
`_before`, slot computation, lock, read, scope digest, invocation digest,
metadata, then—when `stored is not None`—receipt verification and return. The
fresh effects/record/insert path is in the other branch. Thus source order says
a mismatched or forged occupied slot refuses before fresh effects and insert;
an executable occupied-slot/no-effects storage test remains open.

## Replay

Run from the repository root with the source-tree extension available:

```sh
python3.11 docs/helix/04-build/evidence/rust-migration/r6-outcome-values/capture.py --check
python3.14 docs/helix/04-build/evidence/rust-migration/r6-outcome-values/capture.py --check
python3.14 docs/helix/04-build/evidence/rust-migration/r6-outcome-values/capture.py --parity
python3.14 docs/helix/04-build/evidence/rust-migration/r6-outcome-values/capture.py --source-check
python3.14 docs/helix/04-build/evidence/rust-migration/r6-outcome-values/test_capture_parity.py
```

`--check` replays the immutable predecessor snapshot against current dependency
implementations, independently of live `outcome_values.py` drift.
`--source-check` and `--write` separately require current dependency bytes to
match the capture-time identities in `frozen/source-hashes.json`; they do not
update that manifest. A passing replay after source drift is behavioral
regression evidence only; it does not claim the live files are the captured
ones.
`--parity` removes only the interpreter version field and requires semantic
outcomes, frozen source identities, and runtime implementation to match across
CPython 3.11 and 3.14. When both reports bind a loaded extension, its resolved
path and SHA-256 must match exactly; different or mixed bound/unbound reports
refuse parity. Historical reports both lack this identity and remain explicitly
unbound: their parity result is semantic/source-only, not executable-cohort
evidence. Missing and null extension identities both count as unbound; they are
normalized only for comparing two unbound reports. `test_capture_parity.py`
locks matching, differing, malformed, and mixed identity cases. Do not recapture
after dependency drift without a new reviewed freeze.

The historical report hashes are recorded below; reports name CPython 3.11.17
and 3.14.8 and their exact dependency hashes. They predate the loaded-extension
identity field and are not executable-cohort evidence. New `--write` reports
include `runtime.loadedRustExtension.path` and `.sha256`, or `null` if the
extension could not be identified. Replacing the historical reports requires
a deliberate reviewed recapture.

| Item | SHA-256 |
| --- | --- |
| Frozen `outcome_values.py` | `c68e19f61947b524d8bb097b1d8b4452b17610f0b18589c4a889ec52df2cfc9e` |
| Frozen source hash manifest | `01c8f83dc55bbe08f1173a9b4360642064bec3332803ba1e34330e3a2e5d4361` |
| Capture runner | `676586d804072f03d839662c53d719e68dcdc9dde64cc23c9cd4b3196edc978b` |
| Capture parity controls | `09ad859665b757576d9c27e5a958dd283832acf43bb01a86475c89dab924c2c0` |
| CPython 3.11 report | `043775c13bb4893c75906a99cf2f660324f62be524098b013f6ffd4fba5d3808` |
| CPython 3.14 report | `27ce6f7faf723815ac8b65a008b4b94733c289e2169e7999ce90bf551c6f36bd` |

## Rust/PyO3 shard under source review

Python remains responsible for ordered access to identity, context, metadata
and stored-row objects, exact carrier/type checks, exception translation, and
the `table_writes` lock/read/effect/insert sequence. The source shard delegates
HMAC-SHA256 to the existing `umf_core::operation_values::hmac_sha256`
implementation, slot hashing to SHA-256, and fixed `[u8; 32]` comparison to
cached RustCrypto `subtle` 2.6.1 `ConstantTimeEq`. The PyO3 surface accepts only
byte strings and retains no secret. Python constructs the domain-separated
preimages and retains all first-refusal ordering. Receipt parsing and structure
validation remain in Python. The implementation checkpoint below adds focused
primitive and bridge evidence; it does not qualify full predecessor parity.

Secret policy must preserve stage order: `_signature` alone validates exact
`bytes` and the 32-byte minimum. Invocation and response HMACs accept the
predecessor's ordinary `hmac.new` behavior, and response digest work precedes
the `_signature` check during record creation. A native verifier must preserve
stored-row shape, digest grammar, cap, authentication, parse, metadata, response,
and count precedence exactly. At this source checkpoint, Sol's boundary review,
installed-wheel replay and native database qualification were still pending.

Signed-payload parsing remains Python-owned to preserve exact Python equality
and type behavior. After the lowercase-hex gate, signatures decode to fixed
32-byte values for Rust's constant-time comparison. The fake-writer control in
`python/umf_access/tests/test_outcome_slot_short_circuit.py` checks forged and
authenticated-but-mismatched occupied receipts stop after operation probe,
lock, and read, before effects or insert. Native database replay remains open.

## Source identity at capture

| Source | SHA-256 |
| --- | --- |
| Active `outcome_values.py` | `c68e19f61947b524d8bb097b1d8b4452b17610f0b18589c4a889ec52df2cfc9e` |
| `operation_values.py` | `106cd256e4976d37855eb6ef838c553de717bbcf09be269fbe374f1bdb4f852a` |
| `session_policy.py` | `c267a73ae12c942e94675282351d7a15aa46780f7e9707eea1e9287c2f45f254` |
| `rust_operation_values.py` | `6f6b5444319a36732b75ad57367f72013bd74ca081e0e0e49ad06238160aac25` |
| `umf-core/src/operation_values.rs` | `a2bef35886f79d522a62aa400a2c16a5af1cfb9037b932eb7f06b1547be71812` |
| `bindings/core/python/src/lib.rs` capture-time predecessor | `c0d8ce9b890dd439adeb99efebe54a4d02baaea2ed77f676967049c098c8a27a` |
| `table_writes.py` | `089f809fbe5baa4a97a0c9dff11889de6cc42bd0d446ae2ee4541438483e6785` |
| Existing `test_table_outcomes.py` | `df7a292f537a665912d7886b3fa2d34df703904ef5adc3d17f0e8c89dbfc3df3` |

The existing outcome unittest passes 6 tests on CPython 3.14. The same suite
cannot import under the available CPython 3.11 environment because Pydantic is
missing; the standalone 3.11 capture bypasses the package initializer and
successfully replays the frozen functions using the installed source-tree
extension. No aggregate CPython 3.11 unittest pass is claimed.

## Bounded native primitive checkpoint

The R6 shard now reuses a streaming HMAC-SHA256 implementation: it feeds the
inner and outer pads and message directly to `Sha256`, without allocating a
`64 + message.len()` message copy. Rust exposes a versioned profile and the
three exact capabilities `hmac_sha256`, `slot_sha256`, and
`signature_matches`. The opt-in Python bridge checks both profile and capability
set before every call. `outcome_values.py` remains unchanged, so the default
implementation and Python-owned preimage construction, secret-type asymmetry,
and stage order are preserved.

Focused Rust tests passed RFC 4231 cases, empty inputs, SHA block-boundary
messages, keys at and above the 64-byte HMAC block size, and signature
mismatches at the first, middle, and last byte. The PyO3 crate passed `cargo
check` and `cargo build`. An isolated Python package overlay using the rebuilt
extension passed 60 HMAC boundary comparisons against the Python standard
library, plus SHA, signature-width, mismatch-position, and exact-bytes carrier
checks. This was not an installed-wheel replay: `maturin` is unavailable in the
environment. The full outcome predecessor and native database transaction
replays remain open.

| R6 source hash at initial primitive checkpoint | SHA-256 |
| --- | --- |
| `crates/umf-core/src/operation_values.rs` | `f376ca1b3d644a38e5c2ab060f413769683ae7c4650ea036c6a7e0a267b5da4c` |
| `crates/umf-core/src/outcome_values.rs` | `27e269b539006a00e5b26f11f9f5f866c0a413a36cee82ce85dbb8b55111a701` |
| `bindings/core/python/src/lib.rs` | `3417eadc158e77af97da58c33617fcd67a9ef6ed061dd8dc862f1985207b1ff7` |
| `python/src/umf/rust_outcome_values.py` | `35269f486e21245301e80bca7abaa2f330ea45f12beef6f0c84760be94aec09f` |
| `python/umf_access/tests/test_rust_outcome_values.py` | `a554028165f36d0f580129a3dd5dca634522ed9c4467acd59a23b23fe76326fc` |

This source checkpoint is superseded for installed-wheel qualification by the
record below. The shard remains opt-in: the existing `outcome_values.py` default
path is unchanged, and no default cutover or production activation is claimed.

## Installed CPython 3.11 wheel qualification

On 2026-10-23, the complete `umf-core` CPython 3.11 abi3 wheel was built from
the current checkout using the repository Hatchling hook and pinned Rust 1.90.0
toolchain. A direct maturin 1.9.6 extension wheel was also built separately.
Both used `/private/tmp/umf-r6-outcome-target` as Cargo target and outputs under
`/private/tmp/umf-r6-outcome-wheel`; the installed qualification wheel was
`umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl` in the isolated
`/private/tmp/umf-rust-py311-qual` environment. The installed extension resolved
to that environment's `umf/_rust_core.abi3.so`.

This qualification binds PyO3 source SHA-256
`3417eadc158e77af97da58c33617fcd67a9ef6ed061dd8dc862f1985207b1ff7`, as
recorded in the JSON report. Iceberg subsequently changed the shared binding
file, whose current SHA-256 is
`b3381f58d77fedb79627227863a424a62670613452c85c0ff9039cb607571e94`; that
later source is outside this built wheel. The parent task will rebuild and
replay a combined wheel after the shared binding stabilizes.

[`installed-wheel-python311.json`](installed-wheel-python311.json) records the
exact wheel and extension SHA-256 values, loaded binary path/hash, qualified
source hashes and host versions. Its captured outcome matrix exactly matches the
frozen CPython 3.11 predecessor after excluding installed-binary identity
metadata. The replay includes receipt size boundary, malformed stored shapes,
bad digests/signatures, authenticated malformed JSON, authority mismatch,
secret type/length ordering, effect count behavior and surrogate handling.
The runner is [replay_installed_wheel.py](replay_installed_wheel.py).

The installed-wheel Python suite passed six tests across the crypto bridge and
occupied-slot short-circuit controls. It checks exact profile and capability
handshake, including wrong version, missing and extra capabilities; RFC 4231
and Python `hmac` parity; empty and SHA block-boundary inputs; a 2 MiB message
with a 4 KiB key; slot SHA-256; fixed-width signature equality and mismatch
positions; and exact `bytes` carrier errors. The Rust shard's four unit tests
also pass. The shard has no application-level stream protocol or fallible stream
interface, so stream errors are not a supported behavior to claim; long input
coverage exercises its internal streaming hash updates through the single-call
byte API.

This qualifies the bounded crypto bridge and frozen outcome receipt behavior on
Darwin arm64, CPython 3.11.17, abi3 CPython 3.11, maturin 1.9.6 and Rust 1.90.0.
It does not qualify the whole Rust operation-values surface or native
PostgreSQL/Weft transactions. `pg_isready` reported no response at `/tmp:5432`;
Docker access was denied, so no native database result is claimed. The default
outcome implementation and broader R6 migration remain separate work.

The qualification environment also had `umf-core` 0.11.0, pytest 9.1.1,
Pydantic 2.14.1, typing-extensions 4.16.0 and Hatchling 1.32.4. Exact host and
wheel details are retained in the JSON report. Key artifact hashes are:

| Artifact | SHA-256 |
| --- | --- |
| Installed `umf-core` wheel | `75e6a3461ed43fd380ee8702238dea4f6bc09b8cad10fb5e0791aa55dbd60b2a` |
| Direct maturin extension wheel | `5da5015d847ca0d2e8c259fa05c90014acc535e66666fdf541ed46ef29873b5d` |
| Installed Rust extension | `08d724f322bf75a4b8ed0af8053d38f519066d75632c4f01ab93fe1a54c0d1e4` |
| Installed semantic replay report | `9fb05701e6fab3c27f7205d1a2c7e1efecba133f3f7cae70faa9872a2cfc1b90` |

## Integrated wheel requalification after Iceberg binding repair

The combined Rust/PyO3 source was rebuilt into
`/private/tmp/umf-r5-iceberg-python-dist/umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl`
and installed over the prior package in the isolated CPython 3.11.17
qualification venv. This wheel SHA-256 is
`73fad0296c9aeca302e32596373f363253f22c1ffd31dd6ef78dd9cda0cf69c5`; the
loaded extension SHA-256 is
`b054f5b220afd8b89932c6195234cd8e336d845d5ba9bddd37f7e0f2a77ef2a5`. The final
combined `bindings/core/python/src/lib.rs` SHA-256 is
`44c2aa4c358244e0dbfc03547b1570ae47330d46aed7fbe3e856b804cd26317c`, recorded
with other source hashes in
[`installed-wheel-python311-integrated.json`](installed-wheel-python311-integrated.json).
The frozen 17-case refusal matrix and 8 slot controls again match the CPython
3.11 predecessor exactly. The earlier [`installed-wheel-python311.json`](installed-wheel-python311.json)
remains unchanged and continues to describe the pre-Iceberg wheel/source cohort.

Against this combined installed wheel, the R6 bridge plus occupied-slot Python
tests pass 6/6, the four Rust outcome-value unit tests pass 4/4, and the six
capture identity controls pass 6/6. The bridge exercises profile/capability
errors, including extra capabilities, long input (2 MiB message and 4 KiB key),
SHA-256 and constant-time signature behavior. There is no fallible application
stream protocol in this shard; native PostgreSQL/Weft remains unavailable and
unqualified as described above. The integrated report SHA-256 is
`17ef0bde5d0db0bad71cc936388a3f43a35079880821691c42e507a15f9620ab`.

## Final core-fix cohort — CPython 3.11 and 3.12

After the UTF-16 Protobuf inspector fix, the complete current `umf-core`
CPython 3.11 abi3 wheel was rebuilt once from the combined source using the
Hatchling custom hook and Rust/Cargo 1.90.0. Cargo output went to the isolated
`/private/tmp/umf-r6-final-target`; the wheel is at
`/private/tmp/umf-r6-final-dist/umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl`.
Its SHA-256 is `02b6b8fe766993c615902b2a7b90e75505657fc6f74fe0a4d3adccf7146c8335`.
The installed abi3 extension has the same SHA-256 in CPython 3.11 and 3.12:
`8ae1a6a40462a3a081dcc1a8316d2163f29afb9725d87b2bbe0e72e7a5dd8ed8`.

The final source closure records `bindings/core/python/src/lib.rs` at
`44c2aa4c358244e0dbfc03547b1570ae47330d46aed7fbe3e856b804cd26317c` and
`crates/umf-core/src/protobuf_inspect.rs` at
`ea9304c1ee65f1685e9efff93f1172aa3aea344fccc2a6337f9aec263862367b`. These
hashes, both installed extension paths and wheel identity are preserved in the
separate [CPython 3.11 final replay](installed-wheel-python311-final.json) and
[CPython 3.12 final replay](installed-wheel-python312-final.json). Their SHA-256
values are respectively
`642788f1fb31fd015bf7911eaa3f308ec62f53d8ba2e326534f2594c39f48c4b` and
`f3c454943ee1682dc874c470da1dfe6ad78bdf9377b348b11b8e70e5644c8b24`. Each
replay matched the frozen 17-case receipt refusal matrix and 8 slot controls.
For CPython 3.12, comparison ignores only the interpreter version field; source,
semantic outcomes and loaded extension digest remain recorded.
Those receipt and slot observations replay the frozen Python predecessor using
the installed operation-values dependency. They do not substitute the opt-in
Rust outcome crypto bridge into receipt construction or verification. Separate
focused tests exercise Rust HMAC-SHA-256, slot SHA-256 and fixed-width signature
comparison through the Python bridge.

The full-package R5 Iceberg harness, with no namespace shim, passes under both
CPython 3.11.17 and 3.12.15: 26 authored imports, 9 authored refusals, 20
upstream imports, 1 upstream refusal, and controls pass. Against the final
CPython 3.11 installation, the R6 bridge plus occupied-slot tests pass 6/6,
the Rust outcome-value unit tests pass 4/4, and capture identity controls pass
6/6. The 3.12 environment did not have pytest; its qualification includes the
full-package harness and frozen outcome replay only. Native PostgreSQL/Weft
remains unavailable and unqualified. These receipts supersede the prior
combined-wheel checkpoint for the Protobuf inspector source fix, while retaining
the earlier reports as immutable historical cohorts.
