# dbt fixture runtime

This environment is development-only. Public adapters compile to browser JavaScript.
The synthetic project uses an in-memory DuckDB profile; no warehouse credentials are required.

```sh
uv venv .cache/dbt-venv --python python3
uv pip install --python .cache/dbt-venv/bin/python -r native/dbt/oracle-requirements.txt
.cache/dbt-venv/bin/python scripts/dbt-fixtures.py
bun scripts/dbt-roundtrip.ts
.cache/dbt-venv/bin/python scripts/dbt-oracle.py
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/dbt-browser.ts
```

Use the local Chromium executable path when it differs. The fixture script disables anonymous
usage reporting. UUIDs and build timestamps are captured with hashes, not normalized. Rebuilding
updates the captured manifest and requires regenerating all downstream evidence. LICENSE files
cover native runtime distributions whose macros appear in generated artifacts. The schema's
own license and commit/hash manifest are under sources/. Pinned schema refresh is explicit via
scripts/dbt-sources.py followed by bun scripts/dbt-schema.ts.

Observed: dbt Core 1.10.0, dbt-duckdb 1.9.3, DuckDB 1.5.5, one model, one seed, four passing data
tests and 429 macros. This is one authored fixture, not exhaustive dbt resource coverage.


The expanded project preserves the original fixture and adds sources, snapshots, semantic
metadata and an executing signed-adjustment unit test:

```sh
.cache/dbt-venv/bin/python scripts/dbt-fixtures.py --rich
bun scripts/dbt-rich-roundtrip.ts
.cache/dbt-venv/bin/python scripts/dbt-rich-oracle.py
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/dbt-rich-browser.ts
```

The build has six successes, five passing tests and two no-ops (exposure and saved query).
The 13 independent metadata edits produce 26 native-checked exports. MetricFlow query execution
is not tested. Do not infer exhaustive configuration coverage from populated collections.


Dependency evidence uses dbt's own Manifest map builders:

```sh
bun scripts/dbt-graph.ts
.cache/dbt-venv/bin/python scripts/dbt-graph-oracle.py
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/dbt-graph-browser.ts
```

The report distinguishes resource and macro edges, retains duplicate occurrences and reports
unresolved references. It does not infer SQL lineage or validate cycle legality/execution.


Context selection evidence follows the graph generation:

```sh
bun scripts/dbt-selection.ts
.cache/dbt-venv/bin/python scripts/dbt-selection-oracle.py
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/dbt-selection-browser.ts
```

NetworkX 3.6.1 uses native dbt maps for independent reachability checks. UMF node/depth limits
and macro exclusion are context policies, not dbt CLI selection syntax. Packets retain full
source; selected pointers and boundary records describe only the requested bounded view.


Run-results/catalog evidence uses a fresh generated DuckDB file under .cache/ so consecutive
build and docs-generation processes see the same local relations:

```sh
.cache/dbt-venv/bin/python scripts/dbt-artifact-fixtures.py
.cache/dbt-venv/bin/python scripts/dbt-failure-fixtures.py
bun scripts/dbt-artifact-roundtrip.ts
.cache/dbt-venv/bin/python scripts/dbt-artifact-oracle.py
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/dbt-artifact-browser.ts
```

The original fixture databases remain unchanged. The catalog's observed DOUBLE total_amount
and the manifest's unenforced decimal(18,2) declaration are preserved separately. Message/comment
edits are candidate artifacts, not changed run outcomes or warehouse state.


Freshness fixtures deliberately include stale and broken queries:

```sh
.cache/dbt-venv/bin/python scripts/dbt-freshness-fixtures.py
bun scripts/dbt-freshness-roundtrip.ts
.cache/dbt-venv/bin/python scripts/dbt-freshness-oracle.py
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/dbt-freshness-browser.ts
```

The generator expects runner success=false and asserts four native outcomes. dbt 1.10.0 emits
only three rows in sources.json; the runtime-error row is omitted by its artifact factory.
runner-results.json is separately reconstructed from all native runner results, with explicit
provenance. Original output and logs remain intact. These are custom SQL freshness checks in
local in-memory DuckDB, not evidence of physical source-table freshness.


The failure project adds eight actual run-results rows: two successful models, one SQL error,
one failed test, one warning test, one passing test and two skipped models. The fixture
collector requires dbt exit code 1 and the exact expected ID/status mapping; unexpected success
or failure rejects the capture. No external database is used. Provenance hashes bind project,
manifest, results, log and frozen runtime requirements. The build uses default scheduling;
it does not claim fail-fast, cancellation, incremental or retry coverage.

Run-results/catalog round-trip and browser scripts now include this fourth artifact. Their
eight format comparisons and eight message/comment edits retain all unrelated source content.
Changing a message does not change an outcome or execute a query.


Semantic-manifest evidence uses the pinned DSI package shipped with this runtime:

```sh
.cache/dbt-venv/bin/python scripts/dbt-semantic-sources.py
bun scripts/dbt-semantic-schema.ts
.cache/dbt-venv/bin/python scripts/dbt-semantic-fixtures.py
bun scripts/dbt-semantic-roundtrip.ts
.cache/dbt-venv/bin/python scripts/dbt-semantic-oracle.py
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/dbt-semantic-browser.ts
```

The collector parses rich-project into a separate target without SQL execution. Native parser
and semantic-validator checks cover three description edits, not MetricFlow queries. The raw
Pydantic schema and the derived nullable serialized schema remain separately inspectable under
semantic-sources/. Unknown fields are preserved by UMF even when the native parser drops them.


The second semantic corpus covers every metric type in DSI 0.8.5 and includes expected invalid
parameter candidates:

```sh
.cache/dbt-venv/bin/python scripts/dbt-semantic-fixtures.py --metrics
bun scripts/dbt-semantic-metrics.ts
.cache/dbt-venv/bin/python scripts/dbt-semantic-metrics-oracle.py
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/dbt-semantic-metrics-browser.ts
```

The project parse must succeed. Subsequent candidates deliberately include three semantic-rule
failures and two parser failures; the oracle asserts their expected categories. Six other
parameter edits pass semantic validation. No MetricFlow query is planned or executed.


The semantic field audit covers every pinned native model field with a finite boundary set:

```sh
.cache/dbt-venv/bin/python scripts/dbt-semantic-field-oracle.py
bun test tests/dbt/semantic-fields.test.ts
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/dbt-semantic-fields-browser.ts
```

The report distinguishes input shapes, native coercion/serialization and direct native field-call
exceptions. It is field-level evidence, separate from whole-manifest semantic validation.
