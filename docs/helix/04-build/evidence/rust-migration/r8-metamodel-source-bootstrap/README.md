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
