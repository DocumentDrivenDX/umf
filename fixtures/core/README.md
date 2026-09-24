# Core fixtures

`minimal.json` is an original synthetic, non-PII UMF 0.1.0 envelope example
created for this repository on 2026-09-20. It exercises separate module identity
and explicit references; the correspondence role does not assert equivalence.
It contains no third-party native schema and establishes no ecosystem support.

The test-local `fixture.note` package is also synthetic: a string label with no
additional semantic constraints. Its validator is intentionally trivial because
all of its stated semantics are structural. No source-system oracle is implied.
