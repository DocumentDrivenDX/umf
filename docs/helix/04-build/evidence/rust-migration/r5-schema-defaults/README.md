# R5 schema default resolver

This checkpoint ports only `resolveCoreDefault` from CONTRACT-049. The Rust
core operation resolves `missing` and `present` states against a selected Field,
returns a copied source/result envelope, and validates any resulting present
literal with the existing Rust field-value kernel. The new
`model/resolveCoreDefault` core-wire route and opt-in Node model wrapper expose
the operation; the default TypeScript API and all other schema-property
operations remain TypeScript-owned.

## Frozen predecessor and parity

`frozen-typescript.json` contains the current Bun 1.4.3 predecessor source and
24 captured requests: five successes and 19 refusals. The cases cover default
application to missing and null, unchanged present values, invalid resulting
null, malformed state/identity, exact first-error order when both are malformed,
wrong-version and invalid source precedence over incomplete/empty identity,
module lookup before empty element ID, and unknown state, identity and default
qualifiers. Successful Rust outputs are compared as complete values,
including source, identity, input, result and `applied`. Refusals compare exact
code, path and message; the wire test also compares the UTF-16 error envelope.

The frozen fixture SHA-256 is
`0660e22312a38875cd3f850f4c6caaf5558a4bf4d4f4bb01463cb1c80487125c`.
Its reproducible harness is
[`freeze.ts`](../../../../../../scripts/rust-migration/r5/schema-defaults/freeze.ts),
SHA-256 `f43338f2af6f49d6e6e0cde4ab3539ebd589bbde5d889046fe3729cd25de9ce9`.
The TypeScript predecessor source at capture has SHA-256
`2a7fb88a8a560f070c0f4ff7685b2e1be474082271e96ee7c8b85ab5ac6d905f`.

Focused checks passed on macOS arm64 with Rust 1.90.0 and Bun 1.4.3:

```sh
cargo test -p umf-core --test r5_schema_defaults
cargo test -p umf-core-wire --test r5_schema_defaults
bun test --timeout 30000 tests/core/schema-properties.test.ts tests/rust-schema-defaults-binding.test.ts
bun run typecheck
```

Rust core parity passes all 24 frozen requests; wire parity passes its operation
matrix; the TypeScript predecessor suite (49 tests), real-addon Node alias test,
typecheck and `git diff --check` pass. The core suite also meters a million-unit
unknown qualifier before refusing. The actual Node addon was rebuilt for the
alias test. The changed Rust files pass `rustfmt --check`. The Rust implementation source SHA-256 is
`3f2a1c970eef5d3ee8fb126da58a812b154eeab8f64055f991d95480518e3f90`;
the core test is `eeef691bf919398997f2714d5491fecde1a3892c063d7cea11546fa24b64fb4e`,
the wire dispatcher is `5e20a7faac5d970312e44a67eb51086958c9e5eaa5b4de979267bd3bd41bc783`,
and the wire test is `563a84f303133f062e87f251c0f8f17b3ccde2a8a53ee5c7bdf92bd0135100be`.
The Node wrapper source and declaration hashes are
`eca80bd8cbdc809fedb8a4b1f854111df587c248088daf07015a242d9f09bbcf` and
`d2fa0da1814444bdd071236676d61b0d9d0a9715a46cff084e4f738b40903c06`.
The Node binding alias test is `e8c55541d2fd5a798772a25b663ada8ba4d0df1f8069ca009a64262c6667396b`.

## Qualification limits

This is source-level Rust core and tagged-wire parity for the exercised
CONTRACT-049 operation and current 0.10.0 fixture. The Node wrapper was checked
with a rebuilt local native addon, not a packaged/installed artifact. Python, CLI,
WASM/browser, full repository tests, independent native oracles and default
TypeScript cutover were not exercised. It makes no additional native semantic
support claim and does not port declaration, inspection, or field-value APIs.
