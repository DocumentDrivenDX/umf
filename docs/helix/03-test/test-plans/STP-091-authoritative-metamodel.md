---
ddx:
  id: STP-091
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-089
      kind: informed_by
    - id: TD-091
      kind: informed_by
    - id: CONTRACT-080
      kind: references
---

# STP-091: Authority, parity and legacy retirement verification

## Scope

Prove one authored current-core authority without silent semantic loss. The
project test plan and CONTRACT-001 through CONTRACT-011 retain native/browser
qualification boundaries. Test sources MUST cite exercised `@covers US-089-ACn`.

| Criterion | Required test evidence |
| --- | --- |
| AC19 | Clean generation without outputs; closed vocabulary and negative opcode/ref tests; model mutation changes schema and both runtimes; no reverse-schema authority |
| AC20 | Frozen independent current vectors; all structural and semantic rule families; ordered diagnostics, exact callbacks, prototype-safe values, exact numeric/UUID and unknown-content cases; TS/Python installed/browser parity |
| AC21 | Active adapter/classifier/package/schema-ref census; source collisions and preservation/refusal; meaningful regression and required scoped native oracles |
| AC22 | Complete retirement ledger; forbidden old imports/dispatch/exports/shims; current package inventory excludes inert history; all retained markers classified |
| AC23 | Actual Chromium desktop/mobile cold ontology/reference/catalog/local-file; collapsed defaults; Record keys and Field values; API journeys; YAML/JSON edits; Back/refresh/keyboard; no page errors or retired-host visits |
| AC24 | Independent clean fixed-point/reproducibility and no-write stale/missing/extra output check; full test inventory, type/declaration/schema/boundary/build/package/embedding/integrity checks |
| AC25 | Reviewed final diff and findings resolved; CI deployment; live source-manifest/critical byte/public signature checks and repeated browser journeys; docs qualify actual native evidence |

## Execution discipline

Sol freezes concrete test file names alongside compiler interfaces before parallel
implementation. Use disjoint shards while migrating, followed by the complete
required inventory. Never delete or skip meaningful tests to mask regressions;
historical-only assertions become inert dated evidence with explicit reasons.
Python's former incomplete profile is not a correctness oracle. Existing bugs
require explicit reviewed correction. Record commands, source hashes, outcomes,
failures/corrections, environment and qualified limits under
`04-build/evidence/metamodel-authority/`. Preserve pre-existing live evidence.


## R2 concrete allocation and executable proof

The existing AC19–AC25 remain the authority; R2 implements the compiler/core
portion, while unrelated native adapter cutovers and live publication retain
their separate slice gates. Test source cites the applicable `@covers US-089-ACn`.

| AC | Concrete tests and assertions |
| --- | --- |
| AC19 | `crates/umf-metamodel/tests/compiler.rs`, `tests/rust-core/compiler-parity.test.ts`: bootstrap with generated outputs absent; all authored shape/domain refs and operator declarations; reject duplicate/dangling identities and every unknown/malformed nested opcode, including untaken/empty branches; model mutations change schemas and both bound runtimes. |
| AC20 | `crates/umf-core/tests/{admission,structural,literals,constraints,registry,serialization}.rs`, `tests/rust-core/parity.test.ts`: frozen independently expected results plus current differential controls for every rule family; exact ordered diagnostics/code/path/message/severity/valid/complete; copies and immutable snapshots; original-context callbacks, failures and reentry. |
| AC20 | `tests/rust-core/host-admission.test.ts`, `python/tests/test_rust_core.py`: actual lone UTF-16 surrogates and astral pairs in keys/values/source/callbacks; hostile JS descriptors/prototypes/symbols/sparse arrays without getters; Python custom containers; missing versus null, numeric binary64 limits/-0/overflow/underflow/exact-token spelling, UUID/128-bit and Unicode-scalar mechanics. |
| AC20 | `tests/rust-core/registry.test.ts`, installed Python tests: consumer-supplied structural/semantic extensions; exact version/scope/resources, unknown keywords/dialects, dangling refs/no network, callback exceptions and original whole-document context, source/returned/registered-schema mutation isolation. Include existing Draft 7 `schema_validator` behavior. |
| AC20/AC24 | `tests/rust-core/source-profile.test.ts`: JSON/YAML duplicate decoded keys, non-string keys, aliases/tags/directives/documents, scalar spellings and exact read-write-read behavior; numeric/Unicode differences are failures unless explicitly reviewed. Regex corpus covers anchoring/lookarounds/Unicode and resource-risk inputs. |
| AC22/AC24 | `scripts/check-rust-boundaries.py` production graph controls: no core host APIs, platform entropy, JS fallback, schema/compiler reverse dependency or wrapper semantic kernels; retain source-exact legacy differential dispositions until their own cutover. R1 dependency exceptions cannot qualify production crates. |
| AC24 | `tests/rust-core/compiler-parity.test.ts`: truthful compiler closure and backend provenance; all eleven canonical outputs, second-generation exact bytes, untouched tree on check failures for stale/missing/extra outputs; pure native compiler run with empty PATH. Prior bytes remain immutable controls; only approved provenance/backend changes are normalized. |
| AC20/AC24 | `scripts/rust-core/package-conformance.sh`, `scripts/rust-core/browser-conformance.ts`: fresh installed `umf-core` wheel, Node addon under Node and Bun, native CLI and shipped WASM in real Chromium execute the same corpus; missing binaries/init refuse without fallbacks; browser blocks nonlocal requests; independent contexts yield identical results. |
| AC20/AC24 | `crates/umf-core/tests/resources.rs`: limits at/below/above actual 4M UTF-16/128-depth/100K-value and catalog 1M-value profiles; instruction/copy/enumeration/sort/arithmetic budgets; real mid-work cancellation; deadlines from injected clock; no partial success; independent and restored reentrant scopes. Hard-preemption claims require separate real worker termination tests. |
| AC25 | Independent final source/diff/evidence review; exact compiler/model/schema/program/policy/lock/binding/harness/build-hook hashes and artifact inventories; every failed control and intentional compatibility correction recorded under `04-build/evidence/rust-migration/r2/`. R2 does not claim live release/publication. |

Baseline capture must include current TS and Python outcomes separately; their
pre-existing disagreements are not silently resolved by selecting whichever
matches Rust. Frozen expected controls derive from CONTRACT-001/080 and reviewed
current corrections. The complete existing `tests/metamodel/`, Python core suite,
typechecks and authority/boundary/regeneration checks remain mandatory regression.
Generated output tests must mutate model/rules/policies rather than merely assert
that output files exist. Validation of generic programs/policies must also cover
mutation after a prior successful admission; mutable caller input cannot reuse a
private prepared-resource cache.

Planned commands are `cargo test --locked --workspace`,
`bun test tests/rust-core tests/metamodel`, the existing Python core suite against
the installed candidate wheel, `sh scripts/rust-core/package-conformance.sh`,
`bun run check:metamodel`, `bun run check:core-authority`,
`bun run check:rust-boundaries` and `bun run typecheck`. Add these commands only
with real runnable implementations; a named command is not passing evidence.
Record command/environment/source identities and observed failures/results in the
R2 packet. No aggregate token meter or broad package/platform claim is inferred
from a successful local subset.
