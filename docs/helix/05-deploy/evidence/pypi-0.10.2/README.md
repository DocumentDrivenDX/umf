# UMF core 0.10.2 automatic PyPI publication evidence

The published `umf-core==0.10.2` archives passed the automatic release-event dispatcher, the main-only PyPI OIDC publisher, exact public-byte verification, and a clean Linux consumer install. The release event run [40370291196](https://github.com/DocumentDrivenDX/umf/actions/runs/40370291196) selected tag `python-v0.10.2` and dispatched publisher run [40371078894](https://github.com/DocumentDrivenDX/umf/actions/runs/40371078894). All three publisher jobs—`verify-release`, `publish`, and `installed-consumer`—succeeded.

The source and publisher receipts carry tag/metadata commit `6337b4b5f65144387ce5c0bbf9cbad955a921c8f`, which is also the publisher driver. The package archive set was marked as reused unchanged in the release pins; its native-core qualification remains associated with the previously qualified core source `a1b909d4…`. The publisher commit identifies the release metadata path; this record does not claim the archives were built from that commit.

PyPI publication used trusted-publisher OIDC and verified all three archive bytes: the Linux x86_64 wheel SHA-256 is `708f967747b0539b9ca7b6a5f39d1017eea8ddb1d07cd62f4f46592e088f6f39`, the macOS arm64 wheel SHA-256 is `99ff1d1250c613a7b65bdd4dc6cf3ee9fec647e02ec34f8dc5ffb84285b0ac59`, and the source distribution SHA-256 is `90a107aaa507930e1d71c0cf208b77182d06c0bf2a1b13681fd5f7b6ed74cb9d`. The installed consumer passed from `https://pypi.org/simple` on the hosted Linux job.

The three raw receipts are preserved here: [source](source-receipt.json), [publication](publication-receipt.json), and [consumer](consumer-receipt.json). [verification.json](verification.json) records receipt hashes, exact workflow/job times, artifact IDs and archive digests, archive member hashes, and the cross-receipt checks.

This publication evidence does not qualify Arras extras installation or broaden native/platform support. Publication of a macOS archive is not a substitute for the separately owned native cohort qualification and public macOS probe.
