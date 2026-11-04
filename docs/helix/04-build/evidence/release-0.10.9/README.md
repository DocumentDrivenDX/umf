# UMF 0.10.9 release evidence

Production source: `9b36814d5b9eda1867d7893575e1acd718cfe4bb`;
Git tree: `3ddb0ff850c92500818d6a0031c856bae0bd0554`.

- `full-source.json` verifies all 70,594 source archive members against Git.
- `source-freeze.json` binds the 8,185 build inputs. `unchanged-implementation.json`
  records the semantic source comparison used to retain existing passing tests.
- `mac-sdk-0109.json`, `mac-sdk-consumer-resume.json`, `node-prefix-harness.mjs`
  and `node-prefix-raw-exit1.log` establish the selected Node/Bun SDK checks.
  The Node payload/refusal checks completed before the excluded explicit Node
  WASM file-URL probe; its actual helper exit 1 is retained. Bun and declarations
  passed independently.
- `mac-python-0109.json` and `mac-python-resume.json` bind the verified Core
  wheel/sdist and CLI, reproduced pure companion and actual installed pair.
  `mac-python-producer.log` retains the original exit-1 function-alias error;
  `mac-python-resume.log` records only the corrected pending probe and metadata.
  Execution provenance identifies the approximately two-second uncoordinated
  resumption; no build, installation or strict wheel verification was repeated.
- `sdk-browser.json`, `site-refresh.json` and `site-local-browser.json` bind the
  exact SDK WASM, sixteen compiler inputs and local DDL/ORM/CRUD preview/download
  flow. The seven ZIP members passed hash and CRC checks with zero unexpected
  external requests or page errors.
- `publisher-policy-tests.json` records sixteen local checks of the separate
  exact-version Codegen upload controller. The integrated source matches those
  tested and reviewed bytes.

`SHA256SUMS` covers these portable records. Linux qualification, public package
publication and public site verification are recorded when complete.
