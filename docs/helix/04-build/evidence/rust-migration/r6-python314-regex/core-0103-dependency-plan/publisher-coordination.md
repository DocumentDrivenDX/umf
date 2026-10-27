# Core 0.10.3 publisher coordination

2026-10-26 — Arras/registry publishing owner confirmation.

The existing merged UMF main `pypi.yml` dispatcher and `publish-pypi.yml` accept numeric standalone tags such as `python-v0.10.3`; they are not fixed to 0.10.2. The qualified macOS arm64 / genuinely manylinux x86_64 cp311-abi3 wheel cohort plus sdist can follow the successful 0.10.2 exact-three-archive route. Archive metadata must say `umf-core` version `0.10.3`; `release-pins.json` must bind tag, exact tagged metadata commit, distribution, version and the complete selected filename-to-SHA256 map. `SHA256SUMS`, GitHub asset API digests and original archive bytes must agree. Unsupported raw linux_x86_64 tags remain refused. Publisher verification does not confer Python 3.14 native qualification; the Core owner must supply the new genuine evidence.

The main-only `pypi` environment and exact PyPI trusted publisher are configured and validated by actual OIDC uploads, including automatic release-event run 40371078894 for Core 0.10.2. There is no registry configuration blocker or conflicting Core version reservation in this chat. Proposed Core 0.10.3 and schema-browser 2.0.1 are distinct component versions; the browser patch does not publish the private SDK.

UMF immutable future releases is enabled. Attach every reviewed archive, release-pins and checksum asset while the GitHub release is DRAFT; publish only after attachment and digest verification. Then the existing release event / owned producer completion dispatcher can select the exact release and invoke the main-only OIDC publisher, with separate anonymous-byte and fresh-consumer gates. If the release is created by GITHUB_TOKEN, preserve the existing owned-producer completion route so token event suppression cannot silently prevent publication.

This is a readiness confirmation only. No 0.10.3 source generation, tag, dispatch, upload or publication has been initiated here. Existing 0.10.2 bytes and the original four-cell migration gate remain unchanged.
