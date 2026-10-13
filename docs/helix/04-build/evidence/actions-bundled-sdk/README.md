# Bundled action support in the normal SDK

Owner decision, 2026-10-13: one SDK installation and coordinated distribution; retain the explicit action vocabulary and separate executor boundary. TD-900 records the decision. `createUmfRegistry()` includes action declaration validation. A bare registry still permits deliberately restricted interpretation. It grants no roles and installs no executor.

Fresh checks pass:56 action tests/343 assertions, actual public-bundle Chromium parity, single-archive fresh consumer installation, both package entrypoints, opaque authorization preservation, malformed declaration refusal, deterministic archive reconstruction, typechecking and generated guide/browser checks. All16 website signatures verify. The SDK archive contains library ESM, types and schemas; the action descriptor is inside that archive. No separate action installation or npm publication is required.

The recorded2,624-test/174-command qualification at5529ead3 remains historical. This bounded additive registry/distribution change does not rewrite that certificate or broaden runtime/backend qualification. CI must independently execute the unchanged native reference consumer and package/browser checks before merge. Main deployment verification and the SDK release remain delivery exits.
