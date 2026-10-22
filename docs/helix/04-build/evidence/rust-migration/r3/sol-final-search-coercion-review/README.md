# Retained selected-search enum coercion controls

These additive immutable expectations were captured from the retained TypeScript before repair. Each of the eight enum gates calls `String(value)` before membership checking: index kind/exactness, keyword ranking family, vector metric/computedBy, and binding platform/freshness/filtering. A one-element array containing the accepted enum string therefore passes and is retained unchanged in generated metadata. The Python target dispatch still uses strict equality with `vector`; coercion for admission must not change target dispatch.

`boundaries/frozen.json` captures nested single-element arrays and the exact `GENERATION_FAILED` / `No default value` error for an ordinary JSON object whose own noncallable `toString` field shadows the inherited method, directly or inside an array. Conversion must inspect all array elements before membership testing; a prior mismatch does not suppress a later conversion error. These are ordinary JSON values within the existing public operation, not executable host methods.

No expected value has been refreshed. The original capture inputs/results remain at `/private/tmp/sol-final-review/search-coercion-probes-{input,ts}.json` and `search-coercion-boundaries-{input,ts}.json`; the committed frozen files are self-contained gate inputs.
