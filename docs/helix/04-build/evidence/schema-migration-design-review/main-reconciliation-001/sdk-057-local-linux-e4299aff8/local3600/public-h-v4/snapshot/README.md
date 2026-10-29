# SDK 0.5.7 local public-H metadata staging, v4

This immutable staging snapshot carries the accepted v4 reader, READY packet006, its metadata-only preflight, and the actual public release metadata. It also preserves the accepted v3 snapshot plus v3 packet005 and its refused preflight as historical evidence. The v3 staging directory was not modified.

The v4 reader source was accepted in `reviews/sdk-057-local3600-public-h-v4-sol-source-review001.md`. The narrow identity validation follows `reviews/sdk-057-public-h-evidence-id-sol-plan001.md`. The release API response is retained under `release/` and packet006 binds tag `umf-v0.5.7`, release ID 427466486, published time `2026-10-29T04:28:03Z`, and commit M `dce9b430422242edd135e69a7a64620d0244784e`.

`reader-v4/metadata-preflight-006.json` records metadata-only success for packet inputs, retained D5 evidence, and the actual full18 continuation003 evidence. This is not a public-H execution, a fresh public download/install proof, or a qualification claim. No public-H command was run.

The external D5 metadata stage remains referenced by its exact path and integrity manifest in `source-map.json`; bulky wheel binaries and disposable environments are not copied into this staging directory.
