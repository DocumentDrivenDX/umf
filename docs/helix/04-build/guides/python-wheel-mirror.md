# Hash-pinned Python wheel mirror

A static mirror is an alternative distribution path while public index publication
is unconfirmed. It does not make a local candidate a supported public release.
The layout follows the [PyPA Simple Repository API](https://packaging.python.org/en/latest/specifications/simple-repository-api/).

Acquire the exact approved wheels for `umf-core`, `umf-access`, `umf-codegen` and
`weft-sql`, plus every transitive dependency and supported platform/Python variant
from the host's frozen lock. Verify original release digests before copying them
into a wheelhouse. Preserve their license files, notices and source/cohort receipts.
Do not synthesize a wheel from an installed environment or overwrite a published
version with different source. Keep development candidates in a distinct staging
mirror; release artifacts require new immutable approved versions.

Run `python scripts/python-package-mirror.py --wheelhouse WHEELS --output MIRROR`.
It performs no network access, refuses an existing output directory, copies exact
wheel bytes, writes normalized `simple/` project pages with SHA256 link fragments,
and records dependencies/license metadata in `manifest.json`. Serve the directory
through the host's approved static HTTPS/mirror service, or use its local file
index for development. Mirror authentication and hosting remain host-owned.

For locking, point the normal resolver at that mirror's `simple/` index, pin exact
versions/hashes and retain the full resolved dependency lock. Validate in a fresh
supported environment. Verify all wheel/source/license hashes and run the actual
`umf-codegen generate/check`, `umf-table check`, generated calls and native host
acceptance for that exact cohort. A four-package `--no-deps` install proves only
those four index entries; it does not prove a self-contained offline dependency
mirror. A later install using a prewarmed resolver cache is a separate claim.

For air-gapped vendoring, copy the complete locked wheelhouse and install with
`--no-index --find-links WHEELS --require-hashes -r requirements.lock` using a
resolver supporting those flags. Verify that no selected package requires an
unavailable source build. Mini-racer0.14.1 and Weft are platform-sensitive native
wheels; the generated application's stdlib-only promise does not extend to those
administrative/build tools. Advertise only matrix cells backed by actual installed
receipts. Public PyPI upload and broader native/platform acceptance remain separate.
