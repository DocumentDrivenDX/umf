# Prepared core inspection and reached-element capacity

CONTRACT-049's invocation-owned metadata reader reuses the existing Key, facet
and schema-property interpretation routines. It preserves JSON guards, validates
once, freezes an owned snapshot, and indexes references into it. No native
execution or native enforcement is claimed. Temporal qualification remains HELD.

The authored fixture has 2,000 dependency Records, each with its own Key Field,
4,006 reached elements, 10,006 relevance paths, 88,323 JSON values and 1,298,909
UTF-8 source bytes. Its four relationship modules keep the ordinary public
relationship result envelopes within the existing JSON value bound.

The original repeated-inspector implementation failed an external 120-second
execution bound even after the ancestor-prefix relevance optimization; that
failure is retained separately. With prepared inspection, the real admission
E2E passed with no diagnostics in 19.14 seconds (Bun 1.4.2). Restoring only the
old relevance-path guard made the same fixture fail with exactly LIMIT at the
logical source root in 21.44 seconds. The corrected unique-element guard was
restored in finally. Neither the fixture limits nor its assertions were weakened.

Explicit command (not included in default unit discovery):

```
/private/tmp/sdk-bun142-recovered/bun test ./tests/compilation/access-reached-elements.e2e.ts
```

Run it under an external 120-second process timeout: Bun's in-process test timeout
cannot interrupt synchronous JavaScript. Source validity, exact reached roots and
absence of diagnostics are asserted independently. Logs retain the complete
outcome. Core selector parity, unknown-content preservation, mutation isolation,
invalid-source/identity and guarded-copy controls live in
`tests/core/prepared-inspection.test.ts`. Existing facet/Key/schema-property
regressions remain applicable; this does not claim a new native or temporal profile.

Real Chromium 153.0.8010.12 also passed the browser-compatible public-core bundle probe for both core versions: 5,703 bytes equal to Bun 1.4.2, SHA-256 `10e4e71853d51127192400d230e61b03c8d3b1b94c4da4e2325ccabb02db9d9b`. The probe exercises ordinary-selector parity, exact unknown qualifier paths/content, caller/result mutation isolation and recursively frozen owned snapshots. Run `bun scripts/core-prepared-browser.ts`; browser and loopback server close in finally. Exact outputs and receipt are retained under `browser/`.
