# Bundled action support in the normal SDK

Owner decision, 2026-10-13: one SDK installation and coordinated distribution; retain the explicit action vocabulary and separate executor boundary. TD-900 records the decision. `createUmfRegistry()` includes action declaration validation. A bare registry still permits deliberately restricted interpretation. It grants no roles and installs no executor.

Fresh checks pass:56 action tests/343 assertions, actual public-bundle Chromium parity, single-archive fresh consumer installation, both package entrypoints, opaque authorization preservation, malformed declaration refusal, deterministic archive reconstruction, typechecking and generated guide/browser checks. All16 website signatures verify. The SDK archive contains library ESM, types and schemas; the action descriptor is inside that archive. No separate action installation or npm publication is required.

The recorded2,624-test/174-command qualification at5529ead3 remains historical. This bounded additive registry/distribution change does not rewrite that certificate or broaden runtime/backend qualification. CI must independently execute the unchanged native reference consumer and package/browser checks before merge. Main deployment verification and the SDK release remain delivery exits.

Release decision (2026-10-13): publish the unified TypeScript SDK as UMF 0.2.0 (`umf-v0.2.0`), a minor increment from SDK 0.1.0. The installable `umf-sdk.tgz` includes action declarations, schemas and types. Core document format 0.8.0 and action vocabulary 0.1.0 retain their existing compatibility identifiers. Publish only after final CI, merge and deployed website verification; attach the merged CI archive and its checksum. Historical component releases remain available.
