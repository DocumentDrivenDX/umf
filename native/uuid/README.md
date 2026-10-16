# UUID carrier qualification

CONTRACT-076 and SD-005 govern this bounded profile. Inputs/receipts live in
`fixtures/validation/uuid/`; the implementation status is
`docs/helix/04-build/evidence/uuid-implementation.md`.

Reproduce from the repository root:

```sh
python3 scripts/bit128-oracle.py
bun scripts/uuid-native-artifacts.ts
/tmp/umf-uuid-native-env/bin/python scripts/uuid-native-oracle.py
bun scripts/uuid-postgresql.ts
bun scripts/uuid-sqlserver.ts
/Users/erik/Projects/tablespec/.venv/bin/python scripts/uuid-tablespec-oracle.py
bun run build
UMF_CHROMIUM_PATH='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' bun scripts/uuid-browser.ts
```

Python native dependencies are avro1.12.0, fastavro1.12.2 and pyarrow21.0.0.
Install them in an isolated environment; paths above identify the actual test
host environment, not a runtime library requirement. TableSpec uses the captured
model source, with its exact digest recorded by the oracle.

PostgreSQL and SQL Server harnesses create their own UUID-named, labeled containers
from locally available postgres17.9 and SQL Server2022 images. No host port is
published; only these owned fixtures are removed after checking their labels.
SQL credentials are synthetic fixture-only inputs and never receipt content.
The receipts record actual server versions rather than relying on mutable image tags.
Each subprocess has a finite timeout and readiness is bounded.

Avro fixed UUID annotation warnings remain recorded: raw16-byte datum recovery
is not proof that a writer enforces the annotation. Parquet observes actual
native file schemas/values, including signed and unsigned64-bit pair layouts.
The TableSpec model test is schema validation, not Spark ingestion. Native key,
index, relation, nullable pair and runtime atomicity acceptance remain unclaimed.
