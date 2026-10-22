# Explicit CSV Boolean lexical profile evidence

The candidate public operation implements CONTRACT-053's explicitly selected `umf.csv-boolean-lexical/1.0.0` finite grammar. It accepts only original tokens `true`, `false`, `True`, `False` for an authored core0.8 Boolean Field. The exact original source/request/token and unverified JSON source context accompany the actual public Field validation, including invalid/incomplete verdicts. Missing/null remain independent caller states; no pack/archive/graph activates this conversion automatically. Original medical pack and fixture bytes are unchanged.

Eight focused tests plus four existing Record tests pass (118 assertions); both TypeScript configurations pass. All 353 distributed JSON Schemas compile with closed reference inventory. Real Chromium153.0.8010.12 produces byte-identical Bun/public receipts for all four tokens and rejects ten negative controls. Original input, complete browser receipts and report are retained; the browser bundle digest is retained without copying the large reproducible bundle. Source/request and full-receipt aggregate UTF8 JSON budgets are independently exercised, including a pair at the byte ceiling whose resulting receipt exceeds it, plus multi-byte text. The exact byte traversal exits early without whole-value serialization; an instrumented oversized-context control proves no whole-object/string JSON serialization occurs before refusal. Escape/control/surrogate and UTF8 byte counts match native JSON on the bounded cases.

Reproduce in the exact candidate checkout:

```sh
bun test tests/csv-boolean-lexical.test.ts tests/core-record-values.test.ts
bun node_modules/typescript/bin/tsc --noEmit
bun node_modules/typescript/bin/tsc -p tsconfig.tools.json
bun scripts/audit-json-schemas.ts
bun scripts/browser-csv-boolean-lexical.ts /fresh/browser-output
```

The source base is `cea3fa03480de1f3437ecd6d23e500bea618e0f3`; `fingerprints.json` binds candidate source/schema/contract/tests and retained evidence. This receipt proves explicit token conversion and original public validation only. It proves neither external source-context authenticity, implicit historical medical graph admission, clinical/FHIR equivalence nor native graph ingestion.
