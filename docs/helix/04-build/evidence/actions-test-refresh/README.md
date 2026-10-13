# Fresh command and adapter test qualification

Source `5529ead377ddf2ae267c426e18aec3d0ca90e9e4` passes the complete test pipeline. CONTRACT-900/901 and STP-900/901 keep their existing bounded support scope; passing this suite does not admit new production backends or broaden native semantics.

| Fresh execution | Result |
| --- | --- |
| Disjoint regression shards | 2,607 tests / 485 files / 162,923 assertions / zero failures |
| Native and Chromium qualification inventory | 174 of 174 commands passed |
| Auxiliary checks | Six commands passed |
| Strict evidence gates | 17 tests / eight files / 210 assertions passed |
| `bun run test`, every live test file | 2,624 tests / 493 files / 163,133 assertions / zero failures |
| Public command API in Chromium | 44 cases passed, Bun parity, no external requests |
| Final core evidence integrity | Field, nullability, cardinality, facets, key and relationship verified |

The [pipeline manifest](../../../../../fixtures/validation/core-check-refresh/pipeline.json) records every actual stage and raw-log digest. The [native manifest](../../../../../fixtures/validation/core-check-refresh/native-browser.json) binds all 174 commands to 8,041 captured inputs and their actual outcomes. The exact full-suite inventory audit and its executable audit helper are retained here. All captured source inputs independently match the delivery worktree.

Runtime: Linux arm64, Bun 1.4.2 build744846f84, Chromium153.0.8010.12, Python3.12.3, jsonschema4.25.1, protoc36.2, Go1.27.1 and the digest-pinned qualification image recorded by the pipeline. Docker runners use `--init`. Each test file executes in a fresh sequential Bun process; assertion failures, skipped tests, incomplete summaries and crashes fail the runner. Handler execution and cleanup deadlines, network denial, PostgreSQL constraints and rollback assertions remain unchanged.

Both push and PR CI separately pass 120 native command tests in 40 files and 44 browser cases; their artifacts and 22 matching authored source fingerprints are retained. Generated bundles are qualified build outputs, not authored-source fingerprints. `qualified-generated-inputs.zip` preserves the exact 15 generated proof inputs; a host build can produce different bytes and must not be substituted under these retained hashes.

The earlier `12ca7660` shared-VM run crashed inside Bun/JSC during the full suite. Its partial successes are historical, not the evidence for this pass. The replacement process runner was directly checked with 14 existing tests / 227 assertions and refusal controls for assertion failure, early process exit, skipped tests and duplicate selection. Incidental AppleDouble fixture metadata is preserved separately and excluded from authored evidence. No tests or semantic checks were skipped to obtain this result.

Merge, current main CI and deployed website verification remain separate delivery checks. The original bounded action certificate and its historical formal/native evidence remain unchanged.
