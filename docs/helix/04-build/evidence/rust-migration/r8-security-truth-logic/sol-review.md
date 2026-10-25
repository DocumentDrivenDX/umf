---
ddx:
  id: umf.evidence.rust-migration.r8-security-truth-logic.sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r8-security-truth-logic
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-062
      kind: informed_by
---

# Independent Sol review: security truth and composition

Sol reviewed the three-operation Rust core and tagged-wire slice. The first
review found that `securityNot` must apply its truth check directly, whereas
`securityAnd` and `securityOr` copy input before bounds and truth checks. The
candidate was corrected and explicitly limited to already admitted tagged
Values; it does not reproduce raw JavaScript accessor or proxy behavior.

On 2026-10-24, Sol independently reran the frozen TypeScript predecessor with
Bun 1.4.3: source hashes matched, nine AND/OR table cells, three NOT cases and
four refusal cases passed. The existing security suite passed 5 tests with 853
assertions. A separate Rust 1.90.0 build target passed all three
`security_logic_wire` tests. Sol recomputed SHA-256 for the Rust core, wire
module, focused test, frozen packet and replay script; all five matched the
hashes in [README.md](README.md).

This review accepts an opt-in Rust tagged-wire operation for the bounded truth
subset. A later candidate added `composeSecurityRules` for already evaluated
rules and constant string/boolean disclosure. Sol independently reran its
22-case Bun predecessor packet (14 hand-oracle results and eight exact
refusals), the four-test Rust wire suite, and checked SHA-256 for the updated
Rust core, wire module, test, frozen packet, replay script and README against
their source-bound evidence. This extends the accepted opt-in tagged-value
subset to four operations, with no policy/fact selection or raw-host parity.

The other security exports, Node/Bun/Chromium and Python bindings,
installed package routing, source-frozen integration, and R8 retirement remain
open.

The next bounded review accepts `securityRefIdentity` only on admitted tagged
JSON values. Sol independently reran its eight-case Bun 1.4.3 predecessor
packet and source-hash check, the existing Bun source test (one test, eight
assertions), and three Rust 1.90 wire tests. Review found an unmetered clone of
large components before serialization; the agent corrected it to charge
`copy_json` per selected component before tuple allocation, and a million-unit
control-refusal test passed. Sol checked current core/wire/test SHA-256 values
`e11662e07f270b64bc20c2c830c250c7fa32b63f6da6dbb9e45f9b882bcfa86c`,
`00d6944bbc7f3cd3ae629460a2301d0e442e033d43291a508a79516ac64e4d9e`,
and `b24849ffcd2354070ceea3f90c129749b8b010da5e5974ac8802fec8b4333a87`.
Raw getters/proxies, non-JSON values and null-root JavaScript TypeError behavior
are outside this opt-in wire subset.

Sol also independently replayed the five-case Bun expression-bound oracle and
the four focused Rust core tests. The internal `pub(crate)` helper checks
already schema-admitted expression shapes, first-fault depth 16/node 4096
bounds and Context work refusal. Its packet and replay SHA-256 values are
`b21d037f39928e46ec35569b0be37a95d083a17d18590733074de7327973207c`
and `606399e9d8378dbb9384e197c7b33214a5dc7c8665ccac33ccb975516ec9a576`.
TypeScript may collect later sibling bound diagnostics; this Rust helper stops
at the first fault and is not exposed through a wire or public binding.
Neither slice establishes `requireSecurityInterpretation`, policy/ontology
closure, installed routes or native enforcement. This adds one opt-in executable
security export (five of 43); the internal helper does not count as a retired
public export.

Sol independently checked the later 25-case current TypeScript disclosure
packet (SHA-256
`64ddc995271be3879e79a499b3aed7c32d1477f32f1cd07d8b73bbaaea579064`)
against its harness (SHA-256
`faa2f2252dd77020b104d5692968c0b0364d70a7100cac46a4f46f5a639be9a8`)
and reran both disclosure suites: seven tests and 203 assertions passed. The
six public disclosure encode/decode/inspect operations are validation-coupled.
Legacy acceptance depends on security interpretation, ontology/document/Field
resolution and literal checks; V2 additionally depends on protection/catalog,
domain/transform, pin and budget interpretation. A parser-only Rust operation
would not preserve their success and refusal semantics. Sol accepts the
documented hold on those default routes; this audit adds no Rust owner and no
retirement claim.
