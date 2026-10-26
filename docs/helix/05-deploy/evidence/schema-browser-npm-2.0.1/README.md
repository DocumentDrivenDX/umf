# Schema browser 2.0.1 qualified Actions publication

[`@documentdrivendx/umf-schema-browser@2.0.1`](https://www.npmjs.com/package/@documentdrivendx/umf-schema-browser/v/2.0.1)
was published through npm OIDC in [Actions run 40413333066](https://github.com/DocumentDrivenDX/umf/actions/runs/40413333066).
All four jobs passed: immutable-release verification, registry absence check,
actual upload and a fresh public-npm consumer install/import. The raw
[publication receipt](npm-publication-receipt.json) records `oidc_upload` and
`oidc_trusted_publisher: true`; this is a new upload, not an existing-byte skip.

The upload completed at **2026-10-26 22:35:51 UTC**, before the configured
publisher's **2026-10-28 19:22 UTC** expiry deadline. Its first successful
publication closes the pending-validation condition under
[npm's publisher-expiry rules](https://docs.npmjs.com/trusted-publishers/#trusted-publisher-configuration-expiry).
This conclusion uses the actual OIDC publication and public verification;
the npm settings UI was not reread after upload. The previously approved
main-only environment, exact repository/workflow binding, publish permission
and strict two-factor setting were not changed for this release.

## Qualification and exact bytes

[Producer run 40411767168](https://github.com/DocumentDrivenDX/umf/actions/runs/40411767168)
passed both jobs using driver `c0fbbbc56ea0df228aef4da51f58c30caab24114` and
selected product source `ed130607edddc370dcc10ce48c82a1896d3824be`.
It checked 1,227 source inputs, two byte-identical builds with Bun 1.4.2,
the exact offline-installed payload, Bundler and NodeNext TypeScript consumers,
and the installed Customer example in real strict-CSP Chromium with no external
requests or errors. See the raw [producer receipt](producer-receipt.json).

The [immutable GitHub release](https://github.com/DocumentDrivenDX/umf/releases/tag/schema-browser-v2.0.1)
retains original draft ID `424827174`, its exact source tag and all four
original asset IDs/digests. Guarded recovery requalified the same source and
matched every existing asset digest; it replaced no asset. The archive SHA-256 is
`7b76f6912142f2b3f4d0324a2e7db53535f81f80974cb952a9211c2c32d8c542`;
`SHA256SUMS` SHA-256 is
`83843478a73ebbbf066a5891c77810e39a1fd4c380d391db85a57b3f2cc5173b`.
Anonymous npm-served archive bytes equal that qualified archive.

[verification.json](verification.json) records all five Actions artifact API
digests, raw file hashes, release assets and passed gates. Committed receipt
files equal their downloaded ZIP members. Archive binaries remain in the
immutable release rather than this evidence directory.

## OIDC and provenance

The successful main publisher driver is
`82f1980cc2982119115a7e5fc2982d7bf4b93194`. An additional credential-free public
install and `npm audit signatures` verified one registry signature and one
provenance attestation; see the raw [audit output](npm-signature-audit.txt) and
[npm attestation bundles](npm-attestations.json). The decoded
[SLSA statement](npm-slsa-statement.json) binds the exact archive SHA-512,
repository, main workflow path, publisher revision and actual Actions invocation.
Its driver identity is distinct from the selected product source, which the
qualified package provenance and immutable release pins bind independently.

The earlier installer cancellation, draft lookup failure and pre-upload path
failure remain recorded in `verification.json`. They are not successful
publications. The historical [2.0.0 receipts](../schema-browser-npm-2.0.0/README.md)
still truthfully record an existing-byte skip and `oidc_trusted_publisher: false`.
The SDK Latest pointer remains `umf-v0.5.5`. This release adds no private SDK,
Core/native/platform or site-consumer adoption claim.
