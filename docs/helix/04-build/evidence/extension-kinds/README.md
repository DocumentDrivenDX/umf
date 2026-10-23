# Extension-defined kinds implementation evidence — 2026-10-23

Implements [CONTRACT-906](../../../02-design/contracts/CONTRACT-906-extension-defined-kinds.md)
and [US-904](../../../01-frame/user-stories/US-904-extension-defined-kinds.md),
following the [implementation plan](../../../02-design/plan-2026-10-22-extension-defined-kinds.md).
The [usage guide](../../../05-deploy/extension-defined-kinds.md) describes explicit
runtime initialization and registration.

Rust owns catalog admission, exact lookup, root-tag/scope validation, ordered
inspection and coverage. Generated definitions and diagnostics originate in
`spec/metamodel/umf.yaml`. Thin bindings transport complete manifests and the
explicit `kinds` registration flag. Core stays 0.10.0; ordinary registration
keeps kind-like metadata opaque. The shared-runtime TypeScript Registry does
not recompile Rust-admitted consumer schemas under the legacy Ajv profile.

The first example is synthetic `example.dashboard` 1.0.0 with catalog profile
1.0.0. Its dataset is an explicitly authored core Record with string and decimal
Fields. Visual and filter bindings use those core identities; SQL remains
opaque with an explicit completeness warning. There is no parallel field model,
dashboard allowlist in the generic engine, automatic type inference or query
execution.

## Qualification

[`receipt.json`](receipt.json) records 15 shared cases with zero mismatches
across the native CLI with empty PATH, a packed Node package under Node and
Bun, an installed Python wheel and real Chromium WASM. Qualification used
Node 26.12.1, Bun 1.4.3, Python 3.13.16, Pydantic 2.14.1 and Chromium
153.0.8010.12 on macOS arm64, with Rust 1.90.0. The receipt pins source and
artifact hashes, checks installed Node source and Python bundled resources,
and verifies that captured sources did not change during execution.

Cases cover resolved kinds, missing/unknown tags, wrong scopes, missing exact
packages/versions, ordinary registration, unknown profiles/qualifiers,
schema-invalid payloads with known kinds, competing classifications,
prototype-like keys, escaped paths and structurally invalid core documents.
Browser composition checks select `sales-row` and its `channel`/`revenue` Fields,
preserve discovery through both UMF serialization formats and reject a visual
bound to a Record instead of its Field. No external browser requests or page
errors occurred.

| Check | Final result |
| --- | --- |
| `cargo test --locked --offline -p umf-core --test extension_kinds` | 8 passed; exact/copy/atomic behavior, callbacks, legacy metadata, hostile keys and bounded failure |
| `bun scripts/prepare-kind-tests.ts` | Native test prerequisite builds and stages successfully; included in ordinary `test:prepare` |
| `bun test ./tests/extension-kinds ./tests/core ./tests/dashboard` | 185 passed, 4,161 assertions |
| `bun test --timeout 30000 ./tests/metamodel` | 59 passed, 405 assertions; includes clean generation, fixed point and no-write checks |
| Installed Python `test_core.py`, `test_rust_core.py`, `test_extension_kinds.py` | 212 passed on Python 3.13.16 |
| `scripts/extension-kinds-conformance.ts` with installed artifact paths | 15 cases × 5 hosts, zero mismatches; receipt above |
| `bun scripts/metamodel-browser.ts` | Existing 138 core vectors plus one explicit callback/boolean-schema case pass in Chromium without unsafe eval |
| Library TypeScript check (`tsc --noEmit`), metamodel generation/check and core authority | Pass; combined tools typecheck has the unchanged baseline error below |
| `bun run test:schemas` | 71 extension packages and 381 JSON Schemas pass |
| Rust boundary checker and negative controls | Pass; no findings; 28 boundary/inventory/transport control tests pass |
| Acceptance traceability check and ledger tests | Pass; 837 criteria; 5 tests and 1,260 assertions |
| Rust core/wire unit and integration suites | 217 tests passed across 29 test groups |

## Standalone PR scope

Separated from the Lakeview application work and rebased onto main commit
`009c042545a17b49ea857eff22d0fcf3fd71ef44`. All results above were rerun
on this support-only source cohort. The Lakeview adapter, native validator
capability, source parser, reconstruction fixtures and interpreter optimization
are excluded. The synthetic dashboard fixture only illustrates generic
classification and reuse of existing core Records and Fields.

## Limits and observed baseline issues

This is generic kind/classification and synthetic dashboard composition
qualification. It does not qualify a native Lakeview adapter, byte-identical
native dashboard reconstruction, live BI behavior or a platform-wide release.
Untouched native-file reconstruction and independent native semantic checks
remain adapter obligations. No adapter migrations or core-marker change were
introduced.

An initial broad Bun path-filter run also selected long historical core-ideal
oracles. It was stopped after the relevant explicit suites passed; it is not a
passing full-suite claim. Five-second metamodel/facet timeouts passed in focused
runs with the standard 30-second test budget. The broad run also exposed a
pre-existing stale hash in `key-avro-discovery-native.json`: its expected hash
for `scripts/core-ideals/key-avro-discovery-native.py` is
`8efa0c5af1f6c5e1cb1bdddaddaa589f9e27181f927b32298997b10fabbe937b`, while
both HEAD and this checkout have
`ef911d6d0ebde3033ae1671ad545db84721b2f6f5ea359b941f5116caf709711`.
Neither historical file was changed or its evidence promoted.

A preliminary Python 3.14 run hit the existing explicit unsupported Python
regex-profile refusal; final Python qualification uses supported 3.13.16.
The new portable full-manifest API does not expand the supported Python-native
consumer-schema regex profiles.

On the standalone current-main cohort, `bun run typecheck` fails only at
`scripts/rust-core/full-conformance.ts:50`: an indexed previous argument has
type `string | undefined` when passed to `RegExp.test`. That file is unchanged
from the main base. Library typechecking passes; no full combined typecheck
pass is claimed.
