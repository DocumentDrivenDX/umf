---
ddx:
  id: umf.evidence.rust-migration.r8-security-not-admission-adapter
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
    - id: CONTRACT-062
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-security-not-default-cutover
      kind: extends
    - id: umf.evidence.rust-migration.r8-security-truth-logic-binding
      kind: informed_by
---

# R8 `securityNot` scalar admission adapter

## Scope and disposition

This slice adds an opt-in host adapter for the single `securityNot` operation.
It checks the input using only strict scalar equality against `T`, `F`, and `U`.
Invalid values throw the same `UmfError` class, `SECURITY_TRUTH` code,
`Invalid security truth` message, and empty path as the TypeScript predecessor.
The adapter performs no object reflection, so it does not call getters or
trigger Proxy traps. For admitted tokens it delegates to
`umf_core::security_logic::security_not` through the supplied Rust executor;
the TypeScript check is host admission, while the NOT decision remains Rust
owned.

The adapter is not exported from `src/index.ts`, and neither
`src/index-node-v4.ts` nor `src/index-browser-v4.ts` selects it. Source-root
defaults remain TypeScript. The adapter stays opt-in until real Chromium and
installed-package qualification pass. The prior browser-policy blocker is
recorded in [`browser-attempt.json`](../r8-security-not-default-cutover/browser-attempt.json);
no workaround was attempted in this slice.

## Implementation and same-host matrix

[`rust-not-adapter.ts`](../../../../../../src/extensions/security/rust-not-adapter.ts)
imports the predecessor `UmfError` and wraps an existing
`createSecurityLogicEngine()` result. The host check evaluates only
`value !== 'T' && value !== 'F' && value !== 'U'`. Valid values call the Rust
executor; invalid values stop before Rust admission.

The reusable runner is
[`security-not-adapter-parity.mjs`](../../../../../../scripts/rust-migration/r8/security-not-adapter-parity.mjs).
It compares direct TypeScript and the guarded Rust route on the same host for
the original 14 cases: T/F/U, invalid null/number/boolean/string, array,
plain/null-prototype objects, an enumerable getter, and three Proxy forms.
It compares return values, error class/name/code/message/path, and observed
getter/Proxy effects. The Node comparison uses a Bun-built bundle of the
source surface so the predecessor and adapter share one `UmfError` class;
Bun imports that source surface directly.

| Host | Exact matches | Observation |
| --- | ---: | --- |
| Node 26.12.1 | 14/14 | All outcomes and host-effect traces match. |
| Bun 1.4.3 | 14/14 | All outcomes and host-effect traces match. |

Raw observations and timing samples are in [`node.json`](node.json) and
[`bun.json`](bun.json). All invalid objects yield the predecessor `UmfError`
without a getter call or Proxy trap. The three valid tokens delegate to Rust.

## Runtime controls and cost

The executor is created with the existing explicit
`createSecurityLogicEngine({controls})` profile. A valid `T` under
`maxWork: 0` still returns Rust `RESOURCE_LIMIT`; a valid `F` with cancellation
enabled returns Rust `CANCELLED`; and the Rust meter receives work for a valid
token. An invalid object under the same zero budget returns predecessor
`SECURITY_TRUTH` before Rust and produces no meter charge. This preserves
predecessor admission order and keeps runtime/resource enforcement for every
admitted semantic operation.

The local comparative timing sample used 10,000 warm-up calls and five runs of
100,000 alternating T/F/U calls per route. Median per-call timings were:

| Host | TypeScript | Raw Rust | Guarded Rust |
| --- | ---: | ---: | ---: |
| Node 26.12.1 | 8.60 ns | 10.06 µs | 10.08 µs |
| Bun 1.4.3 | 2.61 ns | 9.89 µs | 9.81 µs |

The guarded-versus-raw difference is smaller than run-to-run timing variation
and changes sign between hosts. These numbers show the adapter's scalar check
is small compared with the binding call; they are local measurements, not a
performance or release claim. With the engine already imported, the median
factory sample was 0.154 µs per Rust engine and 0.0074 µs per additional
admission adapter in Node; Bun measured 0.128 µs and 0.0125 µs respectively.
The factory measurement excludes module load, addon/WASM initialization and
package installation.

## Verification and limits

The parity runner asserts all 14 comparisons, direct delegation of exactly the
three valid tokens, zero meter work for invalid input, and preservation of the
resource-limit, cancellation, and meter controls for valid input. Both the
focused adapter check and repository-wide `bun run typecheck` pass on the
current worktree. The earlier repository-wide failure from the in-progress
JSON-number raw-host files was resolved by their declaration update; those
files were not changed in this slice.

The R8 symbol inventory `--check` currently reports a stale snapshot, so no
claim is made that the shared inventory/ledger has been refreshed for the
concurrent source cohort. The adapter is not reachable from a package root and
does not add a public default export. The ledger remains an explicit pre-commit
check for the coordinating source cut.

No real Chromium or installed SDK package replay is claimed here. Therefore
this adapter is evidence for a bounded opt-in bridge only; it does not close
the browser/package gate or justify changing the default export.

## Source pins

| File | SHA-256 |
| --- | --- |
| `src/extensions/security/logic.ts` | `df5857cf39f924552a8082f87d911b81725cce0cf1fda4375daeeb07dd48c8c8` |
| `src/extensions/security/rust-not-adapter.ts` | `c75a12d6bd6b0d8d30c0d5d9b016d65e60fb7b78240c419d6f56c84f58c757ac` |
| `scripts/rust-migration/r8/security-not-adapter-parity.mjs` | `63b9cb3f636509ee862b4402c89836fd4273b5c85dbb0aba6ce51a1644889f77` |
| `scripts/rust-migration/r8/security-not-adapter-surface.ts` | `5fe83ebac124b713b7778db84988da30e0d882441ed2e9773ba0675c99a39afb` |
| `bindings/core/node/src/security-logic.js` | `eb8aa9eaab7fc8b29223ef0002c983f1599555fe8bcc2ff5e47041f93abb36af` |
| `crates/umf-core/src/security_logic.rs` | `38bea5c75d7d01365817237a554176dfc24b759d25d12185591c13cb91062c19` |
| `crates/umf-core-wire/src/security_logic_binding.rs` | `ba54e08c367698a6ff79420402d145b9f9d126b77c6004ade51076073ff5e4c3` |

