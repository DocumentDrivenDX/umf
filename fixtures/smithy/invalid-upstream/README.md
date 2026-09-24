# Pinned Smithy invalid-loader corpus

Source: [Smithy loader invalid fixtures](https://github.com/smithy-lang/smithy/tree/dd2d50a93db313ee21b41916af158442e14669e1/smithy-model/src/test/resources/software/amazon/smithy/model/loader/invalid),
commit `dd2d50a93db313ee21b41916af158442e14669e1` (Smithy 1.73.0).

The manifest inventories every `.smithy` and `.json` file in this subtree: 181 IDL
files and one JSON file. Upstream bytes, paths and SHA-256 hashes are retained with
LICENSE. Selection used the complete (not truncated) GitHub recursive tree for the
pinned commit; source files came from that commit's raw URLs. This README is local.

`bun scripts/smithy-negative-oracle.ts` verifies all hashes, assembles each file
standalone with the pinned unmodified JVM, then checks the public JavaScript assembly
API after an exact UMF YAML source round trip. No companion models are inferred.
The report is `../negative-oracle-results.json`. All 182 are rejected on both VMs.
181 return validation events; `mixins/resource-mixin-with-properties.smithy` throws
`java.lang.IllegalStateException` on the JVM. That exception is retained as an explicit
native outcome, and its message matches the blocked JavaScript API issue. It is not
counted as successful validation. Every blocked API result retains source and has no
partial assembled model. Event comparisons use severity/ID multisets, not diagnostic
message or source-location equivalence.

`bun scripts/smithy-js-browser.ts` includes these same 182 cases alongside the existing
144 cases. Run after building the optional runtime and generating native reports.
Current evidence is parity for this corpus across VMs, not an independent implementation
or a claim covering all invalid Smithy models, validators, selectors or custom traits.
