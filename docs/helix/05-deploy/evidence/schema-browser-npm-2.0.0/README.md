# Schema browser 2.0.0 Actions registry verification

[Actions run 40385375283](https://github.com/DocumentDrivenDX/umf/actions/runs/40385375283) passed all four jobs: release verification, npm preflight, publication/readback and a fresh public-npm consumer install/import. The main publishing driver was `1bf52abcbfbc5eb4aa1c3ec9f1db3ee0bf72ee6b`; the original release was `schema-browser-v2.0.0`, source `c4ad0e8a83816e5ea4003dab09e781ab92c91dcb`. The original tarball SHA-256 is `03e13341c79f29fe891fa6d97a3e504b36a483ba51c98b2e1bcb557b6036e8e1` and `SHA256SUMS` SHA-256 is `f78c3475ecbd55394bc64045b067d13abc7066687b3e18e61589e04cf3f070df`.

The registry already contained identical 2.0.0 bytes. The [publication receipt](npm-publication-receipt.json) truthfully records `existing_exact_bytes` and `oidc_trusted_publisher: false`; no new upload, version, rebuild or repack occurred. The [consumer receipt](npm-consumer-receipt.json) records a public-registry installation and successful package entrypoint import. [verification.json](verification.json) retains all four GitHub artifact API digests and raw receipt hashes; committed receipt files equal the downloaded ZIP members. The source artifact's tarball and sum file match the original release pins.

## Configuration and remaining activation condition

The approved GitHub `npm` environment is restricted to the `main` branch with no per-release reviewer. Repository release immutability is enabled for future releases; existing releases retain their original status and bytes. All future release assets must be attached while the release is a draft, before publication.

The npm package settings saved and read back the exact trusted publisher: `DocumentDrivenDX/umf`, `publish-schema-browser-npm.yml`, environment `npm`, with direct `npm publish` enabled and no dist-tag permission. See [the safe configuration projection](publisher-configuration.json). The package's existing strict two-factor publishing setting remains enabled.

**At this historical check, the new npm publisher was pending validation.** npm required its first successful upload before **2026-10-28 19:22 UTC**; otherwise the configuration would expire. This historical matching-byte run did not satisfy that condition. The later [qualified 2.0.1 Actions publication](../schema-browser-npm-2.0.1/README.md) completed an actual OIDC upload at **2026-10-26 22:35:51 UTC**, closing the condition before its deadline. The original receipts and configuration snapshot below remain unchanged. See [npm's configuration-expiry rules](https://docs.npmjs.com/trusted-publishers/#trusted-publisher-configuration-expiry).

This evidence covers the existing public browser package only. The private `@umf/core` development package and GitHub SDK archives remain outside this npm publication. It adds no Core/native/platform support claim.
