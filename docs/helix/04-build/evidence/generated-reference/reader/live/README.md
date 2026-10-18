# Live schema and API reference deployment

Source commit: `c328b84017e188c58aacd0c3d9ee69f45544e7bb`.
[Publish microsite](https://github.com/DocumentDrivenDX/umf/actions/runs/39094585680)
completed successfully, including build signing and Pages deployment.

[Live schema reference](https://documentdrivendx.github.io/umf/reference/core.html)
and [API reference](https://documentdrivendx.github.io/umf/reference/api.html)
passed the independent Chromium and byte/signature checks in `verification.json`.
The live manifest is identical to the locally tested manifest. Eight selected
critical assets match both the served manifest and the local tested bytes.
Both HTML pages match their published attestation digests; Ed25519 verification
uses the repository's registered build public key and the canonicalization/signing
algorithm inspected at pinned Innsigle 4185eb56beb7b52beaa4a00c2fc897f93d44b939.
No private signing key was read locally.

Chromium 153.0.8010.12 exercised latest Document/Record navigation, cold itemType
search, scalarType values, the supplied Avro constant deep link, parameters and
interface members, mobile containment and latest-core workbench execution.
No page errors or unexpected external requests were observed. Screenshots are
retained alongside the receipt. The first live harness attempt had an ambiguous
Record/Record identity Keys selector; selecting the exact first Record result
corrected the harness, and the final run passed.

Examples in this deployed source remain JSON. They were rendered with
JSON.stringify as an implementation convenience; the owner's subsequent YAML
question was answered during deployment. A YAML default/toggle is not part of
this deployed commit. No recruited-reader comprehension or new native adapter
qualification is inferred from these live browser checks.
