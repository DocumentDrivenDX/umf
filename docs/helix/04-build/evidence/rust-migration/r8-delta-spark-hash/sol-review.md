---
ddx:
  id: umf.evidence.rust-migration.r8-delta-spark-hash.sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r8-delta-spark-hash
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-018
      kind: informed_by
---

# Independent Sol review: Delta Spark hash

Sol first rejected the claimed wire scope because the initial wire module only
re-exported the Rust core function. The corrected candidate now decodes a
bounded JSON request, dispatches the exact `delta/sparkStringHash` operation,
and encodes the signed result; it is not registered in the default host
dispatcher. Sol independently reran the Rust core tests (2/2) and real wire
integration tests (2/2) with Rust 1.90.0 in a separate target directory.

Sol checked SHA-256 of the TypeScript predecessor, 26-case Spark 4.0.1 fixture,
and JVM probe source against the [evidence](README.md). The candidate preserves
the signed individual UTF-8 tail-byte behavior. Its Rust `str` input cannot
represent unpaired UTF-16 surrogates, and the opt-in JSON wire does not prove
the public JavaScript host boundary or the Delta family.

The eight Delta schema/table exact-tree operations now have **core-only**
candidates. Sol compared the current TypeScript source packet's ordered
success/error stages, five schema-warning families (code/path/message), and
eight table numeric boundary outcomes with the Rust tests. The source runner
hash is `954a0f9ccafd32637d1302c9b1dd059f31292ab5b1d2fa252ffa7d5a495f478e`;
the three packet hashes are `9cc1589b2d83fec85643a3027ae11bae5ebf66071fa2190572bcbd263ea5aa14`,
`5522affa3bc0d03961f707fda5f58af36a6d3aa2a905c46bc623b87b8106b510`,
and `178cad22879363ab101ebe69c4e00249b007aaada23e5d4c1fc1d75e53adffd4`.
Sol independently reran the two Rust integration suites (schema 4/4, table
2/2), the two table grammar unit tests, the TypeScript packet check, and
`bun run typecheck`. The Python source-distribution closure suite passed 12/12
after adding the Delta source/resources to the archive.

The exact `NativeJsonTree` remains export/edit authority. The schema temporary
validation view may replace numeric tokens with `0.0` only while its pinned
grammar has no numeric assertions; the table view substitutes `1.0` only while
its strict guard admits the two integer protocol minima and nullable integer
creation time. Future numeric grammar rules fail closed. This is source
preservation and the tested structural subset, not full warning parity: table
semantic warnings, structural error message equality, native Delta validity,
host bindings, installed Node/Bun/Chromium routes and retirement remain open.

The next opt-in `umf.core-wire/1` slice dispatches exactly the eight schema
and table import/export/get/edit operations. Sol inspected the closed operation
set, invocation-local control hook, tagged request/response transport, and
source-preserving core calls, then independently reran all three wire
integration tests. They cover both source round trips, immutable edits,
pointer-before-replacement error order, unknown-operation refusal, and host
control propagation. The wire implementation SHA-256 is
`e325fe0dffba4369af3a622804263159f660ac3bf6ca707c9cd58f5d4ee2b91f`;
its focused test SHA-256 is
`e0a65e56c8b0170faa34aecb76356230d12d6077f1d8f8295c35a2b34d92d1e8`.
This accepts an isolated tagged-wire candidate, with the same table warning,
native Delta and host/default-route limits above.

The subsequent table-context warning candidate closes a bounded part of that
warning gap. Sol independently reran the current TypeScript nine-case receipt
in read-only `--check` mode, then reran the Rust schema (4/4) and table (3/3)
integration suites. The runner SHA-256 is
`4f9a3c5e855dfa157c454da31574228a6eca85d6335686e2683c16eac3482192`;
the receipt SHA-256 is
`5473bf782c18828474ca87f9574b33525452e823f0fdf1392976966f5471f34b`.
The Rust test compares the ordered code, path, message, and severity for those
nine exact inputs. This replaces the earlier blanket statement that table
semantic warning parity was open, but does not prove all contexts, exact
structural error messages, native Delta reader/writer behavior, or a default
host route.

The opt-in wire now also dispatches `delta/schema.inspect` and
`delta/table.inspect`, bringing the closed set to ten operations. Sol
independently reran the expanded wire suite (4/4); it compares all five frozen
schema diagnostic inputs and three selected table inputs through the tagged
transport. The core table suite compares all nine frozen table inputs. The
wire implementation SHA-256 is
`e761195dbdf4f8780a1ffbbfb06b6902148740d973884f52731ed51992b11014`;
the wire test SHA-256 is
`a4d6633ec24ade2b7afd35af8ad5e3e6d63a7fa15fc56f1b9dfa1180cb1849d5`.
No ordered diagnostic mismatch remained in these cases. Native reader/writer
validity, transaction-log reconciliation, host routes and retirement remain
open.

The separate Delta JSONL source slice adds opt-in Rust capture, export, and
inspection under `umf-r8-delta-log/0.1.0`. Sol inspected its exact source
retention and first-line/UTF-16 offset handling, independently verified the
five-case TypeScript packet in read-only mode, and reran two Rust core and
three wire tests. The wire differential compares ordered line metadata,
tagged exact number tokens, statuses and diagnostics; capture/export tests
retain the original source. The TypeScript source, runner, packet, Rust core,
wire and wire-test SHA-256 values are, respectively,
`1a28d81d20448cc95815572d9ec9d9f828f052e2adce93acf8fdc1be7ceef989`,
`15bfc5b2f9eb681eae580235995b4607b95d3fa4b80f535b4fae3ad527ce2e73`,
`2f24508da90f0b1ede641f32e6d9e85f25f05376259e7d8de17b9f4a6ff5b18f`,
`27b0a596b55128947c0783413215d41fcb467099d42bb3a6c3d30d987cd18cf6`,
`173caec828063fc49190bb711f5481a45e2133bbefb88a54464ba7939404d961`,
and `6a433a245cd2122b728e4226dd223c6d43c3512b8e27a95e4f16c7befec96aeb`.
This accepts only source capture and parsed-envelope inspection for the
frozen subset. Delta action semantics, reconciliation, native transaction
validity and default host routes remain open.

## Action shapes and ordinary reconciliation — 2026-10-25

Sol inspected the bounded `inspectDeltaActions` implementation and reran the
six-case current-TypeScript packet check and tagged wire differential (1/1,
74.19 seconds). The packet SHA-256 is
`e98c343558b7ed88d0899aff722e50b337ae987f4827b68821db005232f95ebb`;
the core and wire-test hashes are
`6b496d4bb5ccbc65c333fcc51e478f08072ae5a44acd495e1dfeaaa9b9a2010f`
and `eef90ab579ff27312e1594b9dcb634cf2c2510aca3fdaffd3578b742897a077e`.
The frozen comparisons cover shape diagnostics and exact tagged source
retention, not native transaction validity or a full numeric interpreter.

Sol then reviewed the opt-in `delta/log.reconcileCommits` core and wire path,
verified the five-case packet byte-for-byte, and independently reran its wire
differential (1/1, 36.66 seconds). The TypeScript source, freeze runner,
packet, Rust core, and wire-test hashes are respectively
`a407492f770a392c2d8929a1b3ceb5c631028206fe1b3879d0471cb04e8489fc`,
`c272a98137951d9e06582ba14f93805ea2bc991baf727fba73c95c54ab32df74`,
`68fbd9821fd4ec0d3221a07753878dc38b88d86d459ed782ddc706fe3b6550b5`,
`562d5c2d4a97233432a48faa7259354a6af0fceec8362652acd56ca075311392`,
and `c12bbad1f60c77dc9c5eca48284150d5199bc31b12318269b9b00a9d53922f51`.
The implementation preserves full source documents and orders the frozen
diagnostics. It remains a five-case candidate: add/remove identity conflicts,
cross-commit map replacement order, checkpoint handling, and broader numeric
diagnostics are not qualified. In particular, the Rust `put` path removes and
appends an existing key, whereas JavaScript `Map.set` retains its insertion
position; any replacement-containing history needs a separate differential
before route promotion. No default host route or retirement is accepted.

## Mapped-field rename — 2026-10-25

Sol reviewed the opt-in `delta/table.renameMappedField` path and independently
checked its nine-case current-TypeScript packet byte-for-byte. The first Rust
candidate converted malformed UTF-16 pointer segments to empty text and could
drop schema text during export. Sol required explicit `DELTA_RENAME_PATH`
refusal for those segments and direct retention of the UTF-16 schema value.
After the correction, Sol reran the tagged wire differential (2/2 tests): all
nine frozen cases matched, and a separate malformed-surrogate pointer case
was refused without replacement. The packet SHA-256 is
`ac456a121bf6d330095cceaf2a9e8fbbac05df18d93a558f2436da4f42400f83`;
the reviewed Rust core, wire and test source hashes are
`0406b8f9c530aa0a9039981cea0ebca5de281f71bba4b6db5cc996660ed12fb3`,
`f70bea19ce67f530b9e15204a61586a15d7f9f59e7271ec5444efafc1b382a56`,
and `176e086d64780e9c5f17566f53766cba14b49d6a3284ae8d4c1ca9bd8799809c`.
`rustfmt --check` and integrated `git diff --check` passed.

This accepts a data-only proposal for the frozen table contexts. It does not
authorize a Delta transaction or prove historical uniqueness, external data
file mappings, concurrent writers, broader schema resources, native Delta
reader/writer behavior, default Node/Bun/browser binding or retirement.

## Reconciliation replacement order and file conflicts — 2026-10-25

The five-case reconciliation candidate appended an updated map value, whereas
the current TypeScript `Map.set` leaves its original insertion position. The
successor packet adds three current-TypeScript histories for cross-commit
replacement order, a same-commit add/remove conflict, and a later removal of
an added file. Sol independently checked the eight-case packet byte-for-byte
and reran the focused tagged wire differential (1/1 test, all eight cases).
The TypeScript predecessor hash remains
`a407492f770a392c2d8929a1b3ceb5c631028206fe1b3879d0471cb04e8489fc`;
the capture runner, packet, Rust core and wire-test hashes are
`659c7aacb59f1a62b1288641a445a35a76df8be0bf046a0d85019d907b6242ed`,
`18fdd5d62cf8e60e8f9b0c0e558b145e6ce0d853d8fa55824a120f472bcf5b45`,
`d34cd628f9406828f208a3a9b42d09f9c8c57ff39e8625a5ea99a5f7d554a1b9`,
and `c12bbad1f60c77dc9c5eca48284150d5199bc31b12318269b9b00a9d53922f51`.
Integrated `bun run typecheck` and `git diff --check` pass.

The Rust `put` now replaces in place for the frozen ordinary-action maps.
Deletion-vector transitions beyond those cases, checkpoint semantics, native
Delta transaction validity, malformed UTF-16 action identities, broader
diagnostic/error sequencing, and default host routing remain unqualified.

## Reconciliation UTF-16 preservation — 2026-10-25

Sol found that the reconciliation candidate converted malformed-surrogate
identity or source-error text to empty UTF-8. The revised path scans the
inspected action report before extracting identities, explicitly refuses any
ill-formed UTF-16 with `DELTA_HISTORY_UTF16`, and retains the exact source. A
source-inspection error now stores its message as `Value::String(Utf16)` rather
than replacing it with empty text. The TypeScript predecessor's malformed
`txn.appId` identity is frozen as UTF-16 code units in the portable packet;
the Rust branch is an explicit refusal, not an exact state-reconstruction
match for that case.

Sol independently reran the nine-case predecessor packet check, the focused
Rust core preservation test (1/1) and the tagged wire replay (1/1, 71.28
seconds). The capture runner, packet and Rust core SHA-256 values are
`cd90afc2d8e54cbadeaffb08d6a9e3962f8cca483f65234f62ad58f394dca457`,
`0a4e26f4a3b807408d43cab64cd70c4764bb40d3ce3439c29605586a7509080b`,
and `fafd61d49a372a841a2a879a27148ab60943491362b6044beb8b5f5ce81c9d71`.
The eight ordinary histories remain the exact-report subset. Native Delta
transactions, checkpoint behavior, default host routing and executable
retirement remain open.

## Ordinary deletion-vector transition packet — 2026-10-25

Sol kept `reconcileDeltaCommits` and its existing `state.adds`/`state.removes`
interface for the next ordinary-history wave. No checkpoint API was added.
The four new histories freeze same-path/same-vector replacement, refusal of a
DV change without prior removal, removal before a new vector is added, and
ordered repeat/unknown tombstones. Sol independently reran the thirteen-case
predecessor check and the Rust wire differential (1/1, 115.18 seconds). Twelve
ordinary histories match the complete TypeScript report; the malformed UTF-16
case remains an explicit source-preserving Rust refusal.

The reviewed capture runner and packet SHA-256 values are
`37bd8d82ef78b281d403c3b8d20f14e356940615faaeea946b60aa05be0709b0`
and `f8f09f15596391afcd35f311d31aeefa30cf0888d2bb3d42019dd98b0f69fb4e`.
The existing Rust core SHA-256 is unchanged at
`fafd61d49a372a841a2a879a27148ab60943491362b6044beb8b5f5ce81c9d71`.
This packet does not establish DV bytes, feature requirements, checkpoint
reconstruction, native transaction validity or default-root retirement.
