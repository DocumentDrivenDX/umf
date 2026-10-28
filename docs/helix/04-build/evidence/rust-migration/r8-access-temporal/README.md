---
ddx:
  id: umf.evidence.rust-migration.r8-access-temporal
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
    - id: TP-001
      kind: informed_by
    - id: CONTRACT-065
      kind: informed_by
    - id: CONTRACT-066
      kind: informed_by
    - id: CONTRACT-075
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-access-temporal
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
---

# R8 access-temporal Rust operation candidate

This packet qualifies a bounded opt-in Rust operation candidate for the two
logical TypeScript exports `ACCESS_TEMPORAL_PROFILE` and `parseAccessTemporal`.
The Rust constant is `umf_core::access_temporal::ACCESS_TEMPORAL_PROFILE`;
the pure operation is `umf_core::access_temporal::parse_access_temporal` and
the opt-in tagged boundary is
`umf_core_wire::access_temporal_binding::execute_access_temporal_wire`.
The implementation already existed from the R5/R6 temporal slice; this R8
packet adds a current TypeScript reference capture and a direct Rust wire replay.

[`reference-packet.json`](reference-packet.json) freezes the 48 tagged cases
from the 56-case R5 TypeScript predecessor. The eight JavaScript raw-host
cases are excluded because `umf.core-wire/1` carries tagged JSON values and
cannot represent `Date`, boxed strings, accessors, or proxy traps. The packet
pins the selected profile, operation name, predecessor digest, TypeScript
parser/dependency/contract source hashes, all successful result fields, and
the exact error class and message for refusals. It retains original token text,
UTC offset spelling, six-digit precision rules, epoch arithmetic, range checks,
and the captured refusal precedence.

## Focused qualification

On the captured worktree source, Bun 1.4.3 replayed the TypeScript reference
packet 48/48. The Rust integration candidate replayed all 48 cases through the
tagged wire and compared every output member, error code, and UTF-16 error
message. A direct core assertion also checked the exact version string and the
pre-epoch `-1` UTC-second result. The focused Rust candidate passed 2/2 tests.

Reproduce the packet and checks with:

```sh
bun scripts/rust-migration/r8/access-temporal/freeze.ts
bun scripts/rust-migration/r8/access-temporal/replay.ts
RUSTC=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/rustc \
  CARGO_TARGET_DIR=/private/tmp/umf-access-temporal-r8-target \
  /Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/cargo \
  test -p umf-core-wire --test access_temporal_r8_candidate --offline
```

## Opt-in Node/Bun addon candidate

The Node addon now exposes the wire operation through a private JS adapter and
an explicit `createAccessTemporalEngine()` factory. The factory checks the
`umf-access-temporal/0.1.0` profile before use. The adapter uses JS `typeof`
guards for primitive token and kind carriers, preserving public refusal order
without coercion or property access. Rust owns supported string kinds, token
limits, their precedence, and parsing. The adapter returns a frozen, plain
object matching the TypeScript result shape. The Node package's default entry
and V4 route are unchanged.

On the captured Darwin-arm64 worktree, Rust 1.90.0 passed the two focused
`access_temporal_r8_candidate` tests. The Node addon built from that source
matched the frozen 48-case packet exactly on Node 26.12.1 and Bun 1.4.3. Three
focused wrapper tests passed on Bun, including the eight host-only predecessor
carriers (null, number, object, array, Date, boxed String, Proxy and accessor
object), a non-string Proxy kind, and zero proxy traps or getter calls.
Repository TypeScript typecheck passed. The addon was replayed from a temporary package copy because the
worktree's ignored prebuilt addon is not writable in this environment.

## Opt-in browser/WASM candidate

The WASM module now exposes `accessTemporalProfileVersion` and
`executeAccessTemporalWire`; the private browser-compatible facade checks that
version, rejects non-primitive token/kind carriers before any property
reflection, transports strings as UTF-16 tagged values, restores TypeError or
RangeError from the Rust result, and freezes the decoded result. A fresh WASM
build replayed all 48 tagged vectors through this facade in Bun 1.4.3. Focused
facade tests cover all eight raw-host refusal shapes, token-type before
kind/length precedence, proxy-kind refusal without reflection, zero proxy
trap/getter calls, absent/mismatched bindings, frozen results, and lone-surrogate
preservation through tagged transport. Sol independently reran the source-built
WASM harness with macOS process permission after correcting its lone-surrogate
expected message against the TypeScript predecessor. Real Chromium
153.0.8010.12 passed all 48 tagged cases, eight raw-host refusals, kind/token
precedence, zero Proxy/accessor observations, and the absence of Node globals.
The Rust `wasm32-unknown-unknown` release module used for that replay has
SHA-256 `097c6c59263554b371eeff9ddad33b77d4f8b5bf5f0f61981ccab33d5beb752d`.

Reproduce with `bun scripts/rust-migration/r8/access-temporal/wasm-browser.mjs`
and `bun test ./bindings/core/wasm/tests/access-temporal.test.js`.

This establishes opt-in Node/Bun and real-Chromium source-built binding
candidates for the 48 tagged vectors plus the eight raw-host refusals above.
The temporary Node addon has SHA-256
`5d1d32a8d7b53d727e1a0109b3b7e441bc0b3c75576047d2dd443c768c3a68a6`.
These local artifacts are not a canonical installed SDK archive. This evidence does not choose temporal
meaning for a core scalar, validate a Python carrier, preserve arbitrary UMF
document extensions, activate a default package route, qualify the browser
facade as an installed package, or qualify installed package routing. The six R8 ledger rows remain
unchanged and open pending review of the complete current
source cohort. This evidence is not route retirement or a release claim.

## V4 source route selection

Node V4 now creates the guarded Rust access-temporal engine from the already
loaded native binding, and browser V4 creates it from the WASM module already
loaded during V4 initialization. Their synchronous `parseAccessTemporal` and
`ACCESS_TEMPORAL_PROFILE` exports use the binding's version check and retain
the wrapper's primitive-carrier guards, tagged-wire behavior and frozen result.
The generated `src/index-v4-default.ts` facade is expected to omit these two
local overrides; `src/index.ts` continues to export the TypeScript reference
implementation for `./reference`.

The focused source-route test passes 3/3, including a negative control that
checks the reference entry remains TypeScript. The generated facade is current
and repository TypeScript checking passes. A local fixed-point `bun run build`
with zero generated-input transforms produced matching native/WASM assets.
Its V4 Node bundle then matched all 48 frozen tagged cases and eight raw-host
refusals on Node 26.12.1 and Bun 1.4.3, with zero proxy traps or accessor
getters. The replay script is
`tests/rust-core/access-temporal-v4-runtime.mjs`. This is local source-built
V4 evidence; installed Node/browser package dispatch and current-source
installed route replay remain unqualified here. No retirement or release
claim follows from this source change.

Before the local rebuild, the ignored Node addon lacked
`executeAccessTemporalWire` and `accessTemporalProfileVersion`; the guard
failed closed with `RUST_NODE_BINDING_MISSING`. The old ignored WASM package
also lacked both exports. The fixed-point local build supplied the matching
Node addon for the source-built V4 replay above. Installed V4 Node/browser
route replay remains a separate qualification.
