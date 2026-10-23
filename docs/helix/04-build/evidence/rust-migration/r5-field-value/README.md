# R5 core field-value validation checkpoint

This checkpoint adds `Engine::validate_core_field_value_public` in `umf-core` for the current public CONTRACT-049 `validateCoreFieldValue` behavior. It copies identity and literal `Value`s through the invocation `Context`, preserves raw UTF-16 identity keys and values, validates the full source with an empty default `Registry`, selects the exact module/element Field, and delegates literal semantics to the existing exact Rust kernel. Model admission failures become one error diagnostic; `LIMIT`, cancellation, deadline and other operation failures propagate.

The TypeScript predecessor outputs were captured in `frozen-typescript.json` and are compared against the Rust method by `crates/umf-core/tests/r5_field_value.rs`. Fifty cases cover integer allowed-value acceptance/refusal, exact decimal range, Unicode-scalar length, case-insensitive binary equality, identity check ordering and exact diagnostics, unknown identity/facet/itemType qualifiers containing slash/tilde/lone-surrogate UTF-16 units, missing Field, and runtime string-carrier edge cases. On a plain string Field, TypeScript accepts malformed JSON string carriers when their dynamically coerced `length` does not enter the Unicode loop, and throws the exact TypeError when a positive/coercible length enters the missing `charCodeAt` call; a null-prototype object used as `length` throws `No default value`. `{string: null}` also throws the observed null-length TypeError. Unknown relevant facet/itemType qualifiers still reject before compatibility carrier handling, including when the string carrier is malformed. The Rust wrapper preserves these frozen observations locally with copied-JSON coercion confined to the public field-value path, maps TypeErrors to operation-level `TYPE_ERROR`, and leaves unrelated generic JSON Pointer paths unchanged. The test also forces identity-copy admission over a two-value limit and requires an operation-level `LIMIT`.

`rust-actual-results.json` was emitted by the Rust core example, then checked against the complete frozen results with Ajv 8.20.0 under Draft 2020-12 using `validation-output.schema.json`. The independent Python 3 stdlib controls use `Fraction` for exact integer/decimal comparisons, Python Unicode code-point count for the supplementary-character length, and byte decoding for binary hex equivalence; all five controls pass in `independent-controls.json`.

## Validation

- `cargo test -p umf-core --test r5_field_value`: 2 passed.
- `cargo test -p umf-core`: passed for the captured worktree source. This includes the two focused tests; the captured run reported no failures.
- Ajv 8.20.0: all 50 actual Rust outputs satisfy the local validation-output schema, and their complete JSON envelopes equal the frozen TypeScript observations, including the malformed-carrier TypeError controls.
- Python 3 stdlib independent controls: 5 passed.

Independent Sol rereview reproduced all 50 frozen Bun observations and exact
Rust results, validated actual outputs with Ajv, and passed the two focused
Rust tests and cooperative-meter helper regression. No P1/P2 remains in this
bounded core checkpoint. The reviewed `literal.rs`, `engine.rs`,
`ecma_coercion.rs`, frozen fixture and actual-output SHA-256 values were
`f6c9df27270ed982245de222ca68a3b8558b421768670851820b321e8c42f48c`,
`6c9c8d1046c7f4513794f5875d57319f12c4bddecf6f278271f5e2fb6d654dfa`,
`f42e1247699ca6242b3736ca2239cd7445e5848fdcfb47c09b7a2c8532310eca`,
`c5b0d980a561ffd751c411e9f9745f6b091d34cf337214910debfe352ef6d014`,
and `b826eb95fac09a9b2956e4fa82e95125dbde9433e573d11b098d7f2b4f8f30db`
respectively.

## Source cohort and limits

Source hashes at capture:

| Source | SHA-256 |
| --- | --- |
| `src/model/schema-properties.ts` | `2a7fb88a8a560f070c0f4ff7685b2e1be474082271e96ee7c8b85ab5ac6d905f` |
| `src/model/internal/field-body.ts` | `a45eaa50d18a20e2ef7f92190b7deb6dbfbd8854ab2766bace5a7bce069d1208` |

The public TypeScript API remains authoritative and unchanged. This is Rust core evidence only. It does not establish Node, Bun, WASM/browser, Python, CLI, installed-binding, native-system or default-cutover support. The Rust method's source validation uses the engine's supplied trusted resources and a fresh empty registry, matching the public TypeScript API's no-registry profile. Malformed string-carrier compatibility is scoped to the public method and frozen JSON carrier coercions. Arbitrary JavaScript runtime objects and malformed-carrier combinations involving `allowedValues` remain outside the evidence. Array length coercion preserves UTF-16 and uses metered ECMAScript number conversion; borrowed `length` values are not cloned, subtree traversal is admitted before walking, and array join capacity and numeric formatting are precharged (including a 400-unit upper bound for fixed-point f64 formatting) before materialization. `TYPE_ERROR` is the Rust operation error; each future binding must explicitly map it to its host's TypeError behavior before claiming parity. Broader literal families remain unqualified.
