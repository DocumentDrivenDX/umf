---
ddx:
  id: umf.evidence.rust-migration.r8-security-truth-logic
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
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-002
      kind: informed_by
    - id: CONTRACT-003
      kind: informed_by
    - id: CONTRACT-004
      kind: informed_by
    - id: CONTRACT-005
      kind: informed_by
    - id: CONTRACT-006
      kind: informed_by
    - id: CONTRACT-007
      kind: informed_by
    - id: CONTRACT-008
      kind: informed_by
    - id: CONTRACT-009
      kind: informed_by
    - id: CONTRACT-010
      kind: informed_by
    - id: CONTRACT-011
      kind: informed_by
    - id: CONTRACT-062
      kind: informed_by
    - id: US-079
      kind: informed_by
---

# R8 security logic

## Disclosure codec ownership audit

[`disclosure-predecessor.json`](disclosure-predecessor.json) freezes 25 current
TypeScript outcomes on Bun 1.4.3 (SHA-256
`64ddc995271be3879e79a499b3aed7c32d1477f32f1cd07d8b73bbaaea579064`). The
capture harness is
[`security-disclosure-predecessor.ts`](../../../../../../scripts/rust-migration/r5/security-disclosure-predecessor.ts),
SHA-256 `faa2f2252dd77020b104d5692968c0b0364d70a7100cac46a4f46f5a639be9a8`.
It covers legacy 0.1 validation/JSON encode/decode and V2 inspection/JSON/YAML
encode/decode, including closed-member failures, malformed and duplicate-key
transport, unknown extension retention on V2 refusal, getter non-invocation,
format/error ordering, exact original/absent/withheld/transformed distinctions,
stale pins, and the invariant `complete:false, authority:false` on successful
V2 inspection. Source hashes include both public implementations, their direct
policy/protection/source helpers, model JSON serialization, the fixture files,
and CONTRACT-062.

The Rust disclosure codec route is held. Legacy `validateSecurityDisclosure`
first calls `requireSecurityInterpretation(policy,resolution)` and only then
copies/adjudicates the batch. Its acceptance depends on the complete legacy
policy/ontology/document closure, exact Field-domain references, and
`checkSchemaLiteral`. Its `encode` validates before writing JSON; its `decode`
reads JSON and maps parse or validation errors to the same generic
`SECURITY_DISCLOSURE` refusal. A batch-only Rust validator would therefore
accept inputs the public function refuses and cannot be exposed as that codec.

V2 has a separate dependency closure: `checkProtectionParametersWithinBudget`
resolves policy, catalog, and pinned core-domain/parameter inputs before the
batch snapshot is checked. Inspection then validates exact pins, qualified
Field refs, transform declarations, typed literals, selected policy
dispositions, profiles, row/column bounds, and shared work/text budgets.
Success means transport/source correspondence only and always returns
`complete:false, authority:false`. Unknown batch members refuse as data but
remain in the detached `source`; accessor input is refused without invoking the
getter. Encode validates before JSON/YAML writing, while decode validates its
format/text shape before parsing and maps syntax/semantic refusals to the
generic `SECURITY_DISCLOSURE_V2` envelope. None of the required Rust policy,
protection-catalog, domain-resolution, or literal-check dependencies has an
accepted Rust owner in this slice.

| Public operation | Required Rust owners | Decision |
| --- | --- | --- |
| `validateSecurityDisclosure` | Legacy policy interpretation, resolved ontology/document closure, exact core Field lookup, schema literal admission | Keep TypeScript route; no standalone batch acceptance. |
| `encodeSecurityDisclosure` | All legacy validator owners plus exact JSON source writer | Keep TypeScript route; encoding is validation-coupled. |
| `decodeSecurityDisclosure` | Legacy validator owners plus JSON syntax/duplicate-key precedence and generic refusal mapping | Keep TypeScript route; parser alone is insufficient. |
| `inspectSecurityDisclosureV2` | Protection parameter checks, catalog transforms, core closure/domain resolution, Field indexing, literal budgets/checks | Keep TypeScript route; no policy/catalog/domain owners available. |
| `encodeSecurityDisclosureV2` | Full V2 inspection plus exact JSON/YAML writer and format/error precedence | Keep TypeScript route; writer is validation-coupled. |
| `decodeSecurityDisclosureV2` | Full V2 inspection plus JSON/YAML parsing, format checks, and generic error mapping | Keep TypeScript route; parser alone is insufficient. |

No Rust core/wire operation was added: no strict sub-operation in these public
codecs can decide success without one of the missing authority/interpretation
closures. The already accepted tagged truth/composition operations remain
opt-in and do not constitute disclosure validation. The packet is a current
TypeScript predecessor only; it does not qualify a future Rust implementation
or a default route.

## Port boundary

This candidate implements `securityNot`, `securityAnd`, `securityOr`,
`composeSecurityRules`, and `securityRefIdentity`. Rust core owns T/F/U
interpretation, composition of already-evaluated rules with a closed
constant-disclosure subset, and stable tuple identity serialization;
`umf-core-wire` exposes opt-in operations through the existing tagged
`umf.core-wire/1` codec. The wire entrypoint is not connected to Node, Bun,
Python, or WASM roots. No package route or TypeScript retirement is qualified.

The Rust boundary receives already admitted tagged Values. JavaScript
accessors and proxies are not representable in this format, so the candidate
does not claim raw-host input parity. `securityRefIdentity` matches the
predecessor's fixed-order `JSON.stringify([documentId,moduleId,elementId])`
for non-null tagged JSON references, including missing object members as null
array slots. `securityNot` applies its closed truth
check directly. `securityAnd` and `securityOr` preserve the predecessor's
copy-before-bounds order, require an array of 1–64 operands, and reject any
value outside T/F/U. The copied value and result are accounted through the
Rust invocation context and wire encoder.

Composition consumes supplied rule effects and truths. It does not evaluate
policy conditions, select policy, admit facts, authenticate identity, authorize
a query, or perform native effects. Indeterminate remains a refusing outcome;
this packet does not prove that all policy dependencies were admitted.

## Public security executable export inventory

The source root currently exposes 43 executable declarations in the security
family. No Rust security owner existed before this slice; generic core `Value`,
`Context`, and tagged-wire facilities are transport/admission foundations,
not existing security semantics. Five names below now have candidate Rust core
owners. All 43 remain on their existing TypeScript source routes.

| Source family | Exact public executable exports | Behavior represented |
| --- | --- | --- |
| `logic.ts` | `composeSecurityRules`, `securityAnd`, `securityNot`, `securityOr` | Strong Kleene expression truth and already-evaluated policy/disclosure composition. The candidate covers all four exports for admitted JSON values and constant string/boolean disclosure values. |
| `policy.ts` | `SECURITY_EXTENSION`, `securityPackage`, `readSecuritySource`, `writeSecuritySource`, `inspectSecurityPolicy`, `securityRegistry`, `requireSecurityInterpretation` | Extension identity/package metadata, source parsing/writing, policy inspection, registry construction and interpretation requirement. |
| `evaluate.ts` | `evaluateSecurityAccess`, `evaluateSecurityCollection` | Supplied policy/resolution/fact evaluation for one resource or a collection. |
| `write.ts` | `evaluateSecurityWrite` | Logical create/update/delete admission against supplied original/proposed state. |
| `dependencies.ts` | `securityPolicyDependencies`, `securityIdentityTransportDependencies` | Policy Field/Association reference extraction and identity-transport dependencies. |
| `disclosure.ts` | `validateSecurityDisclosure`, `encodeSecurityDisclosure`, `decodeSecurityDisclosure` | Security disclosure batch validation and versioned transport codec. |
| runtime state | `SecurityReadRegistration`, `SecurityAuthorityGuard` | Registration and authority-guard lifecycle objects. These remain Rust host/capability work. |
| `policy-representation-v2.ts` | `securityV2Package`, `inspectSecurityPolicyV2Source`, `upgradeSecurityPolicySource`, `downgradeSecurityPolicySource` | Proposed security 0.2 source metadata inspection and explicit representation migration. |
| `policy-v2-legacy-access.ts` | `evaluateSecurityPolicyV2LegacyAccess` | Restricted legacy-engine evaluation of an interpretable security 0.2 policy. |
| `protection/catalog.ts` | `protectionPackage`, `inspectProtectionCatalog`, `requireProtectionInterpretation` | Protection catalog package metadata and catalog interpretation. |
| `protection/source.ts` | `readProtectionSource`, `writeProtectionSource` | Protection source parsing/writing. |
| `protection/references.ts` | `resolveSecurityProtectionSources` | Versioned protection-reference resolution. |
| `protection/domains.ts` | `resolveSecurityProtectionDomains` | Field-domain and core-closure resolution. |
| `protection/parameters.ts` | `validateProtectionParameters` | Typed transform-parameter validation. |
| `protection/queries.ts` | `inspectProtectionQueryProperties` | Declared transform/query-use property inspection. |
| `protection/functions.ts` | `inspectProtectionFunction`, `evaluateProtectionValue` | Versioned pure transform inspection and value evaluation. |
| `protection/disclosure.ts` | `inspectSecurityDisclosureV2`, `encodeSecurityDisclosureV2`, `decodeSecurityDisclosureV2` | Proposed 0.2 disclosure envelope inspection and codec. |
| `protection/obligations.ts` | `inspectProtectionObligations` | Protection-declaration obligation inspection. |
| `action-purposes.ts` | `inspectSecurityActionPurposes` | Action-purpose declaration inspection. |
| `types.ts` | `securityRefIdentity` | Stable security-reference identity string. |

`SecurityReadRegistration` and `SecurityAuthorityGuard` are the only class
exports in this inventory. Constants, package objects and the reference helper
are included because they are executable root declarations in the R8 source
census; they are not algorithms solely by their census label. This is an
operation map, not a claim that every declaration has the same support level.

## Truth predecessor and oracle

[`frozen-typescript.json`](frozen-typescript.json) stores the exact 3×3 AND/OR
tables, three NOT outcomes, and four selected refusals. It pins source,
acceptance test and contract digests. The [replay script](replay-predecessor.ts)
imports the live predecessor, verifies all three digests, then compares every
captured output, error code, message and path. The independent expected tables
are hand-enumerated from CONTRACT-062's strong Kleene rules; the Rust test also
derives conjunction as minimum and disjunction as maximum over `F < U < T`.

The captured scope covers both truth-table cells and boundaries: empty input,
invalid truth, operand count 65, and an object passed to NOT. It does not attempt
to serialize a JavaScript accessor or proxy through the Rust wire format.

## Composition predecessor and oracle

[`compose-cases.json`](compose-cases.json) pins 22 predecessor cases and
hand-evaluated CONTRACT-062 outcomes. It covers default deny, permit/require/
forbid decision order, unknown truth, protected-field omissions, false-permit
obligation exclusion, withheld dominance, equal and conflicting transforms,
boolean transforms, and selected shape/member/effect/truth/disclosure/bounds
error precedence. The [composition replay](replay-compose-predecessor.ts)
checks source/test/contract hashes and replays every result on Bun 1.4.3. The
Rust wire test compares the result and error envelope to the frozen packet.
Values are already admitted JSON; raw host accessor/proxy parity is out of
scope.

## Reference identity predecessor and oracle

[`ref-identity-cases.json`](ref-identity-cases.json) freezes eight Bun
predecessor outputs for ordinary, escaped, Unicode, lone-surrogate, missing,
null, nested JSON, and non-object non-null values. The
[identity replay](replay-ref-identity.ts) checks the source, test, and contract
hashes before invoking the TypeScript export. Rust uses the core compact JSON
writer over the same ordered three-member tuple, which handles ECMAScript
integer-index key order and isolated UTF-16 units. A null top-level reference,
getters/proxies, `toJSON`, and non-JSON values remain outside the tagged subset.
The result is a stable identifier string, not authenticated identity or
authority.

## Internal expression admission primitive

The internal core helper `check_security_expression_shape_and_bounds` walks an
already schema-admitted tagged expression, applies the predecessor's one-based
depth limit (16) and depth-first node limit (4096), and returns the first
`SECURITY_BOUND` fault with the matching path/message. Its small shape guard is
only defensive validation of that caller precondition. It does not validate
policy schema, term semantics, unknown members, ontology closure, or the
remaining diagnostic list. TypeScript inspection records a bound diagnostic at
each over-limit visit and continues sibling traversal; this helper stops at its
first fault. The [frozen packet](expression-bounds-cases.json) and
[Bun replay](replay-expression-bounds.ts) verify exact limits, first-fault path
and depth-first precedence against the live policy inspector. No binding or
default route exposes this helper.

## Reproduction

From the repository root:

```sh
bun docs/helix/04-build/evidence/rust-migration/r8-security-truth-logic/replay-predecessor.ts
bun docs/helix/04-build/evidence/rust-migration/r8-security-truth-logic/replay-compose-predecessor.ts
bun docs/helix/04-build/evidence/rust-migration/r8-security-truth-logic/replay-ref-identity.ts
bun docs/helix/04-build/evidence/rust-migration/r8-security-truth-logic/replay-expression-bounds.ts
RUSTC=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/rustc \
  CARGO_TARGET_DIR=/private/tmp/umf-security-truth-target \
  rustup run 1.90.0 cargo test -p umf-core-wire --test security_logic_wire --offline
RUSTC=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/rustc \
  CARGO_TARGET_DIR=/private/tmp/umf-security-truth-target \
  rustup run 1.90.0 cargo test -p umf-core security_logic::expression_bounds_tests --offline
rustup run 1.90.0 rustfmt --check --edition 2021 \
  crates/umf-core/src/security_logic.rs \
  crates/umf-core-wire/src/security_logic_binding.rs \
  crates/umf-core-wire/tests/security_logic_wire.rs
```

Observed predecessor results on Bun 1.4.3: truth replay matched nine AND/OR
cells, three NOT cases and four selected refusals; composition replay matched
22 cases (14 outcomes and 8 refusals); identity replay matched eight vectors.
The focused composition Rust wire integration suite passed 4/4 and the identity
wire suite passed 3/3 on rustc 1.90.0; Rust formatting check passed. Cargo emitted
pre-existing dead-code warnings in unrelated core and codegen modules.
Expression-bound predecessor replay matched all five cases (three first
bound faults); `security_logic::expression_bounds_tests` passed 4/4 on rustc
1.90.0 and the core source formatting check passed.

## Source and evidence identity

The predecessor sources are pinned in their JSON packets. SHA-256 for the Rust
core module, wire module, focused integration tests, packets and replay scripts
were captured on 2026-10-24. The security export inventory is
from `src/index.ts` at SHA-256
`acfc8529b437fc6daa279a6586acb25644bae4c3c0b0fe15541d07eba20658da`; the
current source index is a moving parallel R8 input and must be rechecked at
integration freeze.

| File | SHA-256 |
| --- | --- |
| `crates/umf-core/src/security_logic.rs` | `e11662e07f270b64bc20c2c830c250c7fa32b63f6da6dbb9e45f9b882bcfa86c` |
| `crates/umf-core-wire/src/security_logic_binding.rs` | `00d6944bbc7f3cd3ae629460a2301d0e442e033d43291a508a79516ac64e4d9e` |
| `crates/umf-core-wire/tests/security_logic_wire.rs` | `008d23ccc603af9274aba1e0abecd4c425a16c2baeeade330de75a158064cd97` |
| `frozen-typescript.json` | `d3d3dfc029923afb582eb2c5539024c4bcd1b0b60a95bf139e018441d1b8c770` |
| `replay-predecessor.ts` | `5beb6b2c0bb7fe260405cb5487f72d07d0e0720ae1c9fa050c1ac92fa6a4e22e` |
| `compose-cases.json` | `f110415b14af6796935f55358bf820df6cff8a4245c62bea1f7257040db30887` |
| `replay-compose-predecessor.ts` | `132e29ccfcb57fedb3ce1a2aed3523d58daadd726df44b4a9b3ce5357220fef1` |
| `ref-identity-cases.json` | `6fca5d908248138cfe273affe7b2ece64adad9d136b942d2406ff2c11873dd29` |
| `replay-ref-identity.ts` | `9918d4684992fbcfdca3769d4e36638297dca235a3e60993d70d4a4928d172e8` |
| `crates/umf-core-wire/tests/security_ref_identity_wire.rs` | `b24849ffcd2354070ceea3f90c129749b8b010da5e5974ac8802fec8b4333a87` |
| `tests/security/ref-identity.test.ts` | `3376900cd5fc3d6a24f38c2675982b16d6590351091dfa349b76812c9b505ae9` |
| `expression-bounds-cases.json` | `b21d037f39928e46ec35569b0be37a95d083a17d18590733074de7327973207c` |
| `replay-expression-bounds.ts` | `606399e9d8378dbb9384e197c7b33214a5dc7c8665ccac33ccb975516ec9a576` |

These hashes identify the files at capture. The shared worktree has parallel
R8 edits, so all source and ledger identities require a final integration
recapture before any broader claim.

This is a bounded R5 candidate slice. It does not complete the `extensions:security`
family, any security acceptance story, default binding routing, native
enforcement, or R8 release qualification.
