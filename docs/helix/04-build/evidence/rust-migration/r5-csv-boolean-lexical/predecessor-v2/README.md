# Successor TypeScript predecessor closure

This archive expands the original frozen closure with `src/registry/` and
`spec/metamodel/generated/`, including the omitted `core-constraints.json`.
`standalone-replay-review.json` records the original archive SHA-256 and why it
was insufficient. The original archive remains unchanged.

Replay the copied predecessor suite by extracting the archive into a temporary
directory under the checkout, then run Bun against the extracted
`tests/csv-boolean-lexical.test.ts`. `replay-output.txt` records this replay:
8 tests and 91 assertions pass.
