# Embedded Core Facets parity helper

ADR-006, CONTRACT-040 and the Rust migration plan govern this local harness
repair. The source-coherent Darwin and Linux SDKs built from `ee4e34f1d` share
3,842 source inputs, closure `f42da44bf75ec1c408e8ae3bc3c2be496a7755d8ae59e8e35356f5bedb704690`
and zero generated transformations. The Linux installed gate failed when its
emitted Node probe called `assertCoreFacetOutcomeParity` without defining it.
The parent interrupted the Darwin gate after establishing this shared defect;
neither archive has accepted installed, retirement or release evidence.
[Observations](observations.json) pin the actual archive bytes and captured logs.

`resourceSuiteSource` now embeds the parity function beside its shape dependency.
The regression executes those exact embedded definitions, permits matching
null-prototype outcomes and rejects prototype-only and frozen-data changes.
Before the repair, six tests passed and this regression failed with the same
ReferenceError; the focused shape/resource/dispatch suite passes all 15 tests
afterward. The SDK builder includes the executable regression in its source
snapshot. This changes only the harness closure; it does not relax any data,
shape, dispatch or retirement assertion. Independent Sol review and fresh
Darwin/Linux archive qualification remain open.

Reproduce locally with:

```sh
node --test scripts/rust-migration/r8/core-facets-outcome-shape.test.mjs scripts/rust-migration/r8/core-facets-resource-suite.test.mjs scripts/rust-migration/r8/core-facets-dispatch-observer.test.mjs
```
