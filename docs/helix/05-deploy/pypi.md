# Public PyPI publication

## Current required route — 2026-10-26

Owner direction requires `pip install 'arras[truss,umf]'` to resolve wholly from
public PyPI, with future dependency releases published automatically. This
repository publishes the existing qualified `umf-core` archives; Truss and Weft
own their separate packages and workflows. The initial exact-byte backfill is
core 0.10.0 from SDK tag `umf-v0.5.4`, wheel SHA-256
`49633924b45a3c8499d4fcc1a24c30d5a8fcb34d974ab019bbda987cb47da0f9`.
SDK/tag and core package versions are separate identities.

`pypi.yml` now dispatches `publish-pypi.yml` on the default branch when a
core-bearing SDK or standalone `python-vX.Y.Z` release is published. A completed owned `release*.yml`
producer is also observed for releases created with GitHub's workflow token.
The latter route selects exactly one matching published release in that run's
publication window; missing releases do nothing and ambiguity fails. Unrelated
component releases are ignored. The former manual rebuild/upload trigger is
retired so it cannot create competing bytes under an existing package version.

`publish-pypi.yml` requires an exact tag, resolved commit and SHA256SUMS pin,
validates GitHub digests and the SDK/core release pins, then stages only the
unchanged core wheel cohort and sdist. Standalone releases bind `tag`, `commit`,
`distribution`, `version` and the selected filename-to-SHA256 `files` map in
`release-pins.json`. Every released core archive must appear in the checksum
cohort. Unsupported raw `linux_x86_64` native wheels are refused before upload;
they must never be renamed to imply manylinux qualification. A future native
PyPI release requires genuinely built and tested compatible bytes. The `pypi` environment permits only the `main`
driver with no reviewer per release. Register the exact PyPI trusted publisher
for `DocumentDrivenDX/umf`, workflow `publish-pypi.yml`, environment `pypi`.
Registry uploads run exclusively in GitHub Actions and bind the published tag,
source commit and release archive hashes. Local scripts may prepare or verify
archives, but must not upload to PyPI. No stored publishing token is used. A version must be absent or have identical
files and bytes; conflicts and registry errors fail immediately.

A subsequent job without OIDC checks a clean public-PyPI install and installed
origin. Source-validation, upload, byte and consumer receipts remain separate.
The approved environment and trusted publisher are configured. Actual backfill
publication remains pending; configuration alone is not publication evidence. Historical package namespaces and support limits
remain unchanged. Native producer qualification is a separate release lane.
Only its genuinely compatible, qualified wheel cohort may be selected for PyPI;
registry publication does not broaden that cohort’s platform or runtime claims.

## Historical preparation and observations

UMF Python distribution: `umf-core`; import namespace: `umf`. Release 0.8.1
retains core document versions through 0.8.0. TableSpec release 0.0.7 currently
uses a pinned Git dependency on UMF, so its existing GitHub release and Pages
index remain the install route pending public PyPI migration.

Configure a PyPI pending publisher for `umf-core` if the project does not yet
exist, or an ordinary publisher if owned already. Exact GitHub identity:
owner `DocumentDrivenDX`, repository `umf`, workflow `pypi.yml`, environment
`pypi`. Then run **Publish UMF Python to PyPI** at the 0.8.1 release commit.
The workflow tests, builds, checks and uploads wheel and source distribution
using OIDC; no stored PyPI token is required.

After `umf-core==0.8.1` is publicly installable, replace TableSpec's direct Git
requirement with `umf-core>=0.8.1,<0.9`, update its lockfile, verify a clean
public-index install and cut a new TableSpec patch. Configure an ordinary
trusted publisher for the existing `tablespec` PyPI project using its owner
account, repository `DocumentDrivenDX/tablespec`, a dedicated `pypi.yml`
workflow and `pypi` environment. The owner does not control the existing `tablespec` PyPI project (or is unsure).
The public API reports version 0.0.1 and author `rypypi`; repository ownership
does not confer ownership of that package. `tablespec-core` and `tablespec-ddx`
return 404 from the public API at this check. The owner subsequently proposed UMF branding: `umf-tables` or `umf.tables`.
Both return 404 and normalize to the same PyPI identity; the recommended
distribution spelling is `umf-tables`. Naming remains under consideration; retain the `tablespec` import namespace
and CLI. That path uses a pending publisher for the chosen distribution name.
Alternatively obtain project ownership before configuring an ordinary publisher.
Name availability is not a reservation. Do not claim public uploads until verified.

Sources: [PyPI publisher setup](https://docs.pypi.org/trusted-publishers/adding-a-publisher/),
[pending publishers](https://docs.pypi.org/trusted-publishers/creating-a-project-through-oidc/),
[OIDC upload](https://docs.pypi.org/trusted-publishers/using-a-publisher/).

Release verification: UMF 0.8.1 and TableSpec 0.0.7 wheel/sdist metadata pass
Twine. Clean environments install both wheels and import UMF models/schema
helpers and the TableSpec CLI. UMF has 42 passing Python tests; the three
TableSpec feature suites have 63 passing tests. TableSpec 0.0.7 still installs
its pinned UMF 0.8.0 Git dependency, not the new public PyPI candidate.

Publication evidence (2026-10-08): UMF commit `827285a1` published the YAML
website; GitHub Pages workflow `37878855747` passed and all 23 Chromium checks
passed again against the public URL. GitHub releases
[UMF Python 0.8.1](https://github.com/DocumentDrivenDX/umf/releases/tag/python-v0.8.1)
and [TableSpec 0.0.7](https://github.com/DocumentDrivenDX/tablespec/releases/tag/v0.0.7)
contain wheel/sdist artifacts. The `umf` repository now has the `pypi` GitHub
environment matching its manual publishing workflow. PyPI-side configuration
and uploads remain separate.

TableSpec release workflow `37878940575` completed successfully, including
installation from the deployed Pages index and runtime imports.

A distribution name does not select the Python import namespace. An eventual
`umf.tables` API requires a separately governed compatibility migration because
`umf-core` already owns the regular `umf` package. Existing imports and commands
remain unchanged in released TableSpec 0.0.7. Package normalization reference:
https://packaging.python.org/en/latest/specifications/name-normalization/
