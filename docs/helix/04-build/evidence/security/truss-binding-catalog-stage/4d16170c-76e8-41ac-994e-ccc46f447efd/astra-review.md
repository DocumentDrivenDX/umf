# Astra review: private pending report-basis host custody

Disposition: no remaining blocker for this narrowly qualified component. Read-only source and retained-evidence audit; native executions and the TypeScript check were performed by the parent workflow, not rerun by this reviewer. The only repository write from this review is this note.

Final native receipts (each path below is relative to the parent evidence directory):

| Run | Matching unique observations | Receipt SHA-256 |
| --- | ---: | --- |
| `fba89f21-7726-4437-a670-4b639df1e526/native.json` | 485 | `de5a55c598a3d2bee22a97b0729661bc3a8ac104178d7db8464f2308d01d190a` |
| `4d16170c-76e8-41ac-994e-ccc46f447efd/native.json` | 493 | `f48004882ac8d1f61d40adbc28520d05da86031dfa06052166cf7a426bb50c57` |
| `a52d6673-2855-40f7-a3f6-69f12818e6da/native.json` | 457 | `b9e342a06fcb5c5b586b039aa7b5aa00465074d67a32629a15a5fdf7f363e463` |
| `eeafdfeb-71ee-4941-9d74-8c348ab21930/native.json` | 481 | `fb91197359cda76ce6642a16878f47d5acf38b229be251fa77c9f1ee6dca3c05` |

All four receipts have exactly 718 selected source pins. Independently checked every current source hash, the exact ZIP entry set with no duplicates, and every retained preimage byte against its pin, then rechecked before saving this review. Every expected/observed pair matches with JSON type-sensitive comparison; all four record `all-required-actions-completed`, with acceptance promotion and pending-layout adoption false. ZIP SHA-256 values, in the table's order:

- `1f35dfe0c0044fc0c6c17ac38c4194d2f47c915b5c7d29e78301f263607851e9`
- `c44480257c9b6318eaaff452f9951d9ebd0978dfc462b511865f1d358eefd04e`
- `d7df26fabf7d26698df47e57bb80db2a78269c60cb7bd8b6930ea9df37cfae77`
- `5c3de1104bf94250a2a2ea70e6bdea94f4b33f545e1801dd8b6f398b9098e2d9`

Independently decoded each retained `report-basis.json`, verified its byte SHA against the native digest, and checked the closed ten-member packet. The unchanged host hex equals the separately collected native packet. Original input/binding, full document rows, writer/ordinal/generation/revision and all five metadata families agree. Independently reconstructed the complete metadata image from the ten-component native table snapshot, including exact authored lineage and null pending lineage: 27/27/23/25 entries and 65,895/65,895/57,510/63,250 packet bytes respectively.

The actual bridge query logs show one native basis collection and three exact native basis recheck calls per run. Each is preceded by the original admitted-input comparison with the correct parameter digest. The first recheck succeeds before the original frozen handle is returned; the second follows a savepoint-local generation increment and is recorded as native 55000 refusal; rollback/release precedes the third successful recheck. The restored host bytes also match the subsequent direct native collection. The helper preserves original connection and recognized preparation identity in a private WeakMap. Copied handle, different connection object, copied preparation and a separately recognized equal-byte preparation all refuse. Nine malformed native-result substitutions refuse after the actual input check. Strict primitive revision validation now precedes regex/BigInt: numeric, boxed-string and throwing-coercion inputs refuse with zero SQL calls. This resolves the review finding about retaining a coercible mutable revision object.

The retained strict TypeScript check passes with explicit Bun/Node ambient types and source pin `0a42db5b368e63a9e668366cf329b3fc045d537b39d278d8d3931446753d99be`. Its reported compiler is 7.0.2; this is scoped command evidence, not complete installed compiler/dependency custody. The preliminary ambient-type failure remains unqualified. Typecheck receipt SHA-256: `57548f9b86b19dab921e05045f051c4ab1601b8533dfe35d30f472796d4da4ef`.

Scope limits remain material. The caller-owned connection adapter and transaction fidelity are trusted premises; object identity is not authenticated database actor identity, and the WeakMap is not a report or admission capability. The RPC harness limits a response to 1 MiB; these 57–66 KiB packets do not qualify successful output across the helper/native 8 MiB limit. Existing exact/over-limit tests concern native arguments, not successful maximum-size output, total allocation, CPU or deadline completeness. This adds no registered interpretation, accepted report codec/persistence, source promotion, finalization/publication, complete concurrency/refinement theorem, or backend acceptance. Synthetic composite/authored fixtures are not newly Weft-issued ontology authority. Concurrent Python admission changes are not qualified by this path. The original acceptance ledger remains 26/132.

The earlier 483/491/455/479 runs (7b6036a0/5b2fdd64/84abe8ff/f92758c2), and the prior 482-result run, remain source-specific predecessors; none was repinned or promoted to cover the corrected revision guard and additional controls. No source, native SQL, receipt or preimage was changed by this audit.
