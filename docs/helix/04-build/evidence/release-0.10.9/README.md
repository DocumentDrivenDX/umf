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
  exact-version Codegen upload controller. PR127 refined the resource protocol
  check. The amended controller passed the exact public archive verification.

`SHA256SUMS` covers these portable records. `site-public-completion.json` combines the actual public functional prefix,
byte-identical downloads, valid public signature and separate navigation-only
font attribution. The original helper exit 1 is retained.

- `linux-qualification-0109.json`, `linux-{python,node,bun,decl}.log`,
  `linux-core-wheel-verification.json` and `linux-probes/` are the Linux x86_64
  receipts for the draft's own SDK, manylinux Core wheel, CLI and Codegen wheel.
  They ran in linux/amd64 containers emulated on an arm64 Mac, from draft assets
  whose digests matched the draft `SHA256SUMS`. The Node explicit WASM
  file-URL loader probe fails exactly as on the Mac and is retained.
- `linux-producer-recovery.json` records the recovered original build, repair
  and upload, sdist correspondence, and exact producer binary hashes. Linux
  installed tests ran with amd64 emulation. An independent wheel rebuild and
  original before/after source maps remain unverified.
- `public-publication.json` records the public GitHub and PyPI hashes, upload
  runs, installed Python and SDK results, cross-platform SDK byte comparison,
  CLI handshake, and the live microsite asset identity.
