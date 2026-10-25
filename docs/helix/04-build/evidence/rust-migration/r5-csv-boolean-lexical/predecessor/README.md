# CONTRACT-053 CSV Boolean lexical predecessor freeze

This packet freezes the TypeScript predecessor before the opt-in Rust candidate.
The source is `src/model/csv-boolean-lexical.ts`; its input recipe and refusal
assertions are `tests/csv-boolean-lexical.test.ts`. The replay command is
`bun test tests/csv-boolean-lexical.test.ts`. The captured full suite output is
`bun-test-output.txt`.

The first archive lacks the generated core constraint resource needed for
standalone replay. Its bytes are preserved. See `../predecessor-v2/` for the
expanded source closure, replay evidence, and provenance record. The suite
covers all accepted tokens, refusal classes, core Field verdicts, immutable
custody, receipt recomputation, hostile shapes, UTF-8 limits, Unicode/surrogate
accounting, and absent/null separation.
