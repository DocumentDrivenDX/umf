# UMF core 0.10.0 PyPI publication evidence

Workflow run [40368039611](https://github.com/DocumentDrivenDX/umf/actions/runs/40368039611) completed successfully on `main` at driver commit `6337b4b5f65144387ce5c0bbf9cbad955a921c8f`. The source verification, OIDC publication, and installed-consumer jobs all passed.

The published distribution is `umf-core==0.10.0`. Its release metadata identifies SDK tag `umf-v0.5.4` and source commit `53de049136c7e41b482d1a73665d031cd5fbaec6`; release pins mark the core archives as reused unchanged (`coreAssetsReusedImmutable: true`). These fields identify the enclosing SDK release metadata, not a claim that the core wheel was rebuilt from that commit. The wheel SHA-256 is `49633924b45a3c8499d4fcc1a24c30d5a8fcb34d974ab019bbda987cb47da0f9`; the sdist SHA-256 is `6b3ad653f95ed5321d5cec69fcaa08037ce1546386b76cbc4e52d1abf19cb19d`. The publication receipt records trusted-publisher OIDC upload and successful PyPI byte verification. The consumer receipt records a clean install from `https://pypi.org/simple`.

The three receipt files are copied byte-for-byte from the run’s downloadable artifacts. Their artifact IDs and archive SHA-256 values, receipt digests, run/job timestamps, and cross-receipt checks are recorded in [verification.json](verification.json):

- Source receipt: artifact `12672015690`, archive SHA-256 `7d3766c787a0c5db670092a60e062062fd153b406dc1401d6a25643fcc2f3d02` ([receipt](source-receipt.json)).
- Publication receipt: artifact `12671303614`, archive SHA-256 `085413a0b7d1995e9ea34b61c1618debfa617a06ac714adc4ea82c00372e445e` ([receipt](publication-receipt.json)).
- Consumer receipt: artifact `12671927633`, archive SHA-256 `9b2ac322fc8e76b2d5265e0f1a31023299b20b1eb4ab9a6d695cb972d0e87a0a` ([receipt](consumer-receipt.json)).

This evidence qualifies the exact `umf-core` 0.10.0 source, publication, PyPI-served files, and public-index consumer install. It does not qualify complete `arras[truss,umf]` resolution, later automatic releases such as 0.10.2, or additional platform/native-wheel support. Those remain separate gates.
