# UMF 0.2.0 website installation example

The developer landing page and action guide link to the unified `umf-v0.2.0` release. The getting-started guide downloads its `umf-sdk.tgz`, installs `@umf/core`, downloads the fixture from the same release tag and calls `createUmfRegistry`, `readDocument` and `inspectActions`. No separate actions package is installed.

The exact shell and TypeScript fences were extracted and executed in a fresh consumer on 2026-10-13 with Bun 1.4.2. Output: action approve, valid true, complete false, businessWrites zero. The archive contains bundled declarations; execution remains selected by the host. The SDK is not advertised as published to npm.

Generated guide checks, eight diagram checks and all seven malformed-source/output negative controls pass. Website signature and deployed browser verification remain required delivery checks.
