# Native selector test corpus

All 15 files in [the pinned upstream selector/cases subtree](https://github.com/smithy-lang/smithy/tree/dd2d50a93db313ee21b41916af158442e14669e1/smithy-model/src/test/resources/software/amazon/smithy/model/selector/cases)
are retained unchanged, with source paths, hashes and LICENSE. Selection used the
complete recursive GitHub tree at that commit; no files were filtered by test outcome.
Embedded `selectorTests` metadata contains 90 expressions and expected shape sets.

`bun scripts/smithy-selector-oracle.ts` verifies file hashes and assembles each model
using Smithy 1.73.0 on the unmodified JVM. It compares every public UMF query against
both the complete native shape-ID set and upstream expected results. For the latter,
`skipPreludeShapes` uses the upstream SelectorRunnerTest namespace filter. Filtering
is confined to the test harness; the public API returns native prelude matches too.
Original source first survives a UMF YAML archive round trip. Native and result-schema
failures fail the gate. Three malformed selectors verify blocked results without
partial shape sets. Runtime hash and all cases are in `../selector-oracle-results.json`.

The native semantics include variables inside expressions, but the public shape-set
API does not return variable environments. No cross-language semantic equivalence
or complete selector-language coverage is claimed. The Chromium runtime harness also
compares all 90 complete native shape sets.
