---
ddx:
  id: umf.evidence.rust-migration.r8-metamodel-source-bootstrap
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-005
      kind: informed_by
    - id: CONTRACT-080
      kind: informed_by
    - id: umf.evidence.rust-migration.r7-metamodel-bootstrap
      kind: extends
---

# R8 clean-source metamodel compiler bootstrap

The previous compiler bootstrap built the general `umf-cli` binary. Even with
its code generation feature disabled, Cargo feature unification reached broad
core modules whose `include_str!` inputs are generated spec resources. A cold
source fixture correctly omitted those derived outputs, so compilation failed
before metamodel generation could run.

The source-bound compiler now builds a dedicated `umf-metamodel-cli` package.
It depends on the metamodel compiler feature of `umf-core`, the metamodel
package, and the extracted `umf-tagged-wire` codec. The compiler-only core
module graph is explicit in `umf-core/src/lib.rs`; the full graph remains in
`full_modules.rs`. Normal CLI and core-wire dependencies request `full-core`,
which takes precedence when Cargo unifies features. The bootstrap metamodel
uses the same `constraint_language::check_program` implementation directly,
without pulling in the broader runtime constraint facade. The tagged UTF-16
and binary64 wire codec is shared by both CLIs rather than copied.

The clean-source fixture copies only paths declared in the generated source
manifest plus the authored compiler resources. It also discovers every file
under the four compiler package roots and asserts each is declared in the
manifest, preventing the fixture from silently supplying an undeclared source.
The source manifest was regenerated after the compiler and binding source
cohort froze; its SHA-256 is
`41826bed8a6b6c1903255ecec86873acdd87ac25bbf711b85cc91d8b6db8aab7`.
The strengthened clean-source fixture now passes from that declared closure.

On the current macOS arm64 host, these offline compile checks passed:

| Check | Result |
| --- | --- |
| `cargo check --locked --offline -p umf-metamodel-cli --no-default-features` with a private bootstrap target | Pass |
| `cargo check --locked --offline -p umf-cli --no-default-features` with the full CLI target | Pass |
| `cargo check --locked --offline -p umf-core --no-default-features --features metamodel-compiler,full-core` | Pass; feature-union negative control retains full core |
| `cargo check --workspace --all-features --locked --offline` | Pass |
| `cargo test --locked --offline -p umf-core-wire preserves_member_order_and_accepts_member_field_order_independently` | Pass; includes tagged string transport behavior |
| `bun test --timeout 30000 tests/metamodel/compiler-kernel.test.ts -t 'clean generation has no derived dependency'` | Pass after manifest regeneration: 1 test, 32 assertions |
| `UMF_METAMODEL_CACHE_DIR=/private/tmp/umf-metamodel-sol-review-cache bun test --timeout 30000 tests/metamodel tests/reference/self-model.test.ts` | Pass after manifest regeneration: 71 tests, 518 assertions |
| `bun run check:metamodel` and both Python resource-mirror `--check` modes | Pass after regeneration |

Targeted `rustfmt --check` for changed Rust files and `git diff --check` pass.
Workspace-wide `cargo fmt --all -- --check` reports broad formatting drift in
unrelated files and is not used as a clean result.
This evidence establishes a local source-bound bootstrap and feature-isolation
behavior; it does not establish a cross-platform release build or completion of
the broader metamodel retirement work.

## Current-source fixed point after 2026-10-26 commits

After commits `2b953bfec`, `e3de811e6`, and `38b572c60`, the generated
metamodel manifest was regenerated from the current source cohort. Its
SHA-256 is `d4da2844bdfd30aea908eddfd362a69954e19bbbaa600cba6c4d075e1ace2bd6`.
The generated action-plan producer identity was also refreshed; its source
file SHA-256 is `3f7f629e9ef96f9d423bcefa3850279f863e686d9ab3aad6d1f6e8e7d33bb86f`.

The current-source checks passed on macOS arm64 with Bun 1.4.3:

| Check | Result |
| --- | --- |
| `bun run build:metamodel` | Pass; authored model validates against generated current enforcement |
| `bun run check:metamodel` | Pass; metamodel outputs current |
| `bun scripts/actions-plan-identity.ts --check` | Pass after identity regeneration |
| `bun test tests/metamodel` | Pass; 61 tests, 484 assertions |
| `bun scripts/metamodel-browser.ts` | Pass; Chromium 153.0.8010.12, receipts 138 + 1, no page errors |

This is a current-source fixed-point and scoped compiler/browser result. It
does not qualify the Rust migration as complete or change any runtime support
claim.

## Current-source refresh after the origin/main merge

After `bfb082cac` and merge commit `1328c79b8`, the metamodel manifest was
regenerated. Only the source digest for `bindings/core/python/src/lib.rs`
changed; generated schema outputs did not change. The manifest SHA-256 is
`538f601d30a183c6188343c36ec8ac8a40588cbb24d20ee61dcc10ad492af07c`. The
action-plan identity was refreshed against the new manifest; its generated
source SHA-256 is
`0c8c7e448020f1fc69c8a7193272adb7507e78fee7ab4e015950e13604b9d9cc`.

On macOS arm64 with Bun 1.4.3, `bun run build:metamodel`,
`bun run check:metamodel`, `bun scripts/actions-plan-identity.ts --check`, and
`bun run typecheck` passed. `bun scripts/metamodel-browser.ts` passed on
Chromium 153.0.8010.12 with receipts 138 + 1 and no page errors. `git diff
--check` passed. This refresh verifies current generated provenance and
browser behavior for the unchanged schema output set; it makes no additional
Rust binding, parity, or release claim.

## Final source refresh at `84cc17df3`

The final source at `84cc17df33a97330956c97fa375ae61e1c1549d2` includes the
capture extension from `e9f003a4e` and the stable Selection test whose exact
source SHA-256 is
`4ba6cc0ebc57a0dbdca20318bd9a6b567a601aa6493e92c426150173c0038154`.
Regeneration updated the manifest source digests for
`bindings/core/node/tests/selection-host-json.test.js` and
`bindings/core/python/src/lib.rs`; generated schema outputs remain unchanged.
The final manifest SHA-256 is
`76d7161544b1343cbec9171b013be8a7fa2b731a1ec14273c155fd6b63d975a0`. The
action-plan identity was refreshed against that manifest and has SHA-256
`9d5c54ee37c4a84d5838acf0a177ae48970da07cc7d0f8c79787886fa2026687`.

On macOS arm64 with Bun 1.4.3, `bun run build:metamodel`,
`bun run check:metamodel`, `bun scripts/actions-plan-identity.ts --check`,
`bun run typecheck`, `bun scripts/metamodel-browser.ts`, and `git diff --check`
passed. Chromium 153.0.8010.12 reported receipts 138 + 1 and no page errors.
This final source refresh supersedes earlier uncommitted manifest hashes in
this evidence; it does not expand runtime or release support claims.
