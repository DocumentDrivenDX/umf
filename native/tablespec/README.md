# TableSpec source baseline

`sources.json` identifies the inspected local repository, commit and actual content
hashes. The 17 selected files include the Python UMF model, checked-in JSON Schema,
loader/validator, type mappings, native tests, monolithic/split examples and license.
Regenerate with `bun scripts/tablespec-sources.ts [repository-path]`.

The current Python model allows boolean, contextual-map or absent column nullability;
the checked-in JSON Schema's nullable property permits a map or null. Native runtime
checks confirm all four nullable cases in `fixtures/tablespec/oracle.json`. Column data types
include VARCHAR, DECIMAL, INTEGER, DATE, DATETIME, TIMESTAMP, BOOLEAN, TEXT, CHAR,
FLOAT and EMBEDDING. Embeddings are structured/vector data, not scalar strings.

The initial adapter implements monolithic ingestion, copied column edits, core scalar
metadata and native recovery through both UMF formats. Split bundles preserve all
supplied files, expose ordered column metadata and support copied column edits.
Loader migrations and cross-system projections remain open. Payload validation is
not native model validation.

Reproduce with `bun scripts/tablespec-roundtrip.ts`, then run
`scripts/tablespec-oracle.py` with Python containing Pydantic and PyYAML (the inspected
repository's `.venv/bin/python` was used). Run `bun scripts/tablespec-browser.ts` with
`UMF_CHROMIUM_PATH` pointing to Chromium when Playwright's browser is not installed.
For split evidence, first run `bun scripts/tablespec-split.ts`, then
`scripts/tablespec-split-oracle.py` with the native repository's Python environment.
That oracle verifies the installed model against the captured source before invoking
the captured loader. Browser verification consumes both monolithic and split fixtures.
