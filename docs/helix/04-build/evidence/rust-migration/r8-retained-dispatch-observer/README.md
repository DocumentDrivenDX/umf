# Retained Rust dispatch observer correction

The d62d36b0 Darwin and Linux SDK archives built successfully but failed the
installed Facets dispatch assertion. The observer intercepted only the legacy
`executeRequestWire`; current defaults use the shared retained runtime's
`executeModelRequestWire`. These failed archives establish no acceptance.

The corrected native observer hooks both actual methods before root import,
preserves their descriptors and call behavior, and refuses missing or immutable
entrypoints. The browser registers breakpoints for both unique signatures in
the actual bundle and removes both after observation. Existing frozen outcomes,
host-order, prototype, resource, reference and asset assertions remain intact.
Both probes use the shared strict wire-operation decoder. The helper and its
tests are SDK source inputs, requiring newly built archives for qualification.

[Independent Sol review](sol-review.md) approved the exact files recorded in
[reviewed-inputs.json](reviewed-inputs.json). Eight focused controls pass.
[Direct runtime diagnostic](direct-runtime-diagnostic.log) observes one actual
`model/inspectCoreFacets` call in Node and Chromium 153.0.8010.12 and zero Rust
calls from the corresponding reference execution. This diagnostic uses the
existing direct bundles, establishes no installed-archive qualification, and
does not retire any route or make any release eligible.
