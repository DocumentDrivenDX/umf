# Hash-pinned Python wheel mirror

A static mirror provides an offline distribution route. A released mirror
archive does not imply public package-index hosting. The layout follows the
[PyPA Simple Repository API](https://packaging.python.org/en/latest/specifications/simple-repository-api/).

## Freeze a candidate cohort

The [U7/U8 template](../../../../python/packaging/embedder-wheel-lock.template.json)
records the current intended stack and four target qualification cells. These are
not support claims until their CI receipts exist. At candidate freeze,
update its repository/release source fields to the exact candidate commits and
immutable release assets. Build the UMF wheels from source; acquire every selected
third-party/platform wheel from its recorded immutable source. The wheelhouse must
contain the complete dependency closure for all four cells, including every
compatible platform wheel for native dependencies. Do not make wheels from an
installed environment or overwrite an already-published version with different
source.

Capture exact wheel inventory into a fresh file:

```sh
python scripts/python-package-mirror.py \
  --wheelhouse WHEELS \
  --template python/packaging/embedder-wheel-lock.template.json \
  --capture-lock /tmp/praxis-embedder-wheel-lock.json
```

Review the captured lock before retaining it in governed evidence. It records
exact filenames/tags, SHA-256, byte size, METADATA dependencies, license fields and
files, source provenance, and the lock-template digest. Capture refuses missing
or undeclared distributions, wrong versions, malformed wheels, missing declared
license files, and overwrite. This command records a candidate inventory; it does
not make it approved. The builder refuses an unresolved template or a wheelhouse
that differs by even one file or hash.

The `python-codegen` CI matrix performs acquisition per exact runner cell.
`tests/codegen/acquire_offline_cohort.py` builds `umf-access` and `umf-codegen`
from the checked-out commit, verifies the immutable UMF core and Weft release
wheels, acquires the pinned binary-only PyPI closure, compares each PyPI wheel
with that release's JSON SHA-256, and captures an 18-wheel lock for the cell.
The lock, generated template, mirror manifest and installed receipt are uploaded
together. The receipt's actual OS identity is authoritative; a machine with a
different OS release cannot stand in for an intended CI cell. Review all four
receipts before recording a four-cell support claim.

Build a fresh static mirror only from the reviewed lock:

```sh
python scripts/python-package-mirror.py \
  --wheelhouse WHEELS \
  --lock docs/helix/04-build/evidence/praxis-embedder/wheel-lock.json \
  --output /tmp/praxis-embedder-mirror
```

Keep the local PEP 503 index and the generated hash-pinned `requirements.lock`
with the manifest when handing off the mirror. The `simple/` project links include
the wheel SHA-256 fragment. The manifest carries wheel sizes, dependency metadata,
license and notice files, source provenance, intended cells and optional package
profiles. The pglast containment extra is described separately and is not part of
the default runtime mirror.

## Optional SQL containment profile

The optional administrative parser is a separate cohort and mirror. The
[pglast template](../../../../python/packaging/pglast-optional-wheel-lock.template.json)
and [captured lock](../evidence/praxis-embedder/pglast-optional-wheel-lock.json)
pin pglast 7.20 for the four target OS/Python cells. This lock records each
wheel hash and size plus the upstream sdist URL and hash. The wheels declare
`GPL-3.0-or-later` and contain no standalone license files; the lock records the
sdist `PKG-INFO` license evidence hash and bundled `libpg_query/LICENSE` notice
hash. Preserve that source archive and notice with any optional-profile
distribution. The parser remains outside the default wheel closure and mirror.
These pins do not claim all four cells have passed installed qualification.

Capture and build this mirror with its own exact wheelhouse:

```sh
python scripts/python-package-mirror.py \
  --wheelhouse PGLAST_WHEELS \
  --template python/packaging/pglast-optional-wheel-lock.template.json \
  --capture-lock /tmp/pglast-optional-lock.json
python scripts/python-package-mirror.py \
  --wheelhouse PGLAST_WHEELS \
  --lock docs/helix/04-build/evidence/praxis-embedder/pglast-optional-wheel-lock.json \
  --output /tmp/pglast-optional-mirror
```

## Verify a truly offline install

Use a new virtual environment for each intended cell. The probe first matches the
actual OS release, architecture, libc and Python minor against that cell, then
requires an OS network-denial sandbox (`sandbox-exec` on macOS or `unshare
--net` on Linux) before installation or installed probes. Non-root Linux callers
also need `sudo` and `setpriv`: the child drops back to the original UID/GID
inside the namespace, clears supplementary groups, and proves both identity and
loopback denial. This prevents root-owned install files in the caller's private
test workspace. If that facility cannot
be established, qualification refuses. The receipt records the runner's actual
OS release and the enforced network isolation. Install only from the mirror's
local file index, with pip configuration/environment isolation, no cache, hashes
required and binary wheels only:

```sh
python -m venv /tmp/umf-mirror-check
/tmp/umf-mirror-check/bin/python -I -m pip --isolated install \
  --disable-pip-version-check --no-cache-dir --only-binary=:all: \
  --require-hashes --index-url file:///ABSOLUTE/PATH/TO/MIRROR/simple \
  -r /ABSOLUTE/PATH/TO/MIRROR/requirements.lock
```

The sole package index is a local `file:` URL. `--isolated` ignores ambient pip
configuration; OS network denial prevents global configuration or direct URLs
from reaching the network, and the builder rejects direct-URL `Requires-Dist`
dependencies. The complete hash-locked requirements prohibit fallback or
substitution. `--only-binary` prevents a source build. Run `pip check`, the
installed `umf-codegen generate/check` parity/refusal corpus, `umf-table new/check`
and the explicit unapproved-apply refusal before any database connection. The
native PostgreSQL qualification remains a separate check against the exact
installed candidate. Remove a required wheel and alter a wheel in a copied mirror;
resolution or the hash check must refuse. Preserve these outputs with the actual
cell, package/source hashes and install log.

`python tests/codegen/test_package_mirror.py` verifies PEP 503 link generation,
Metadata 2.4 and legacy license paths, unsafe license-path and direct-URL refusal,
license/source inventory, complete fixture closure, fresh-venv file-index install,
and missing/tampered-wheel refusal under OS network denial. It uses locally
constructed test wheels and does not claim stack-cohort acceptance. Only actual
candidate receipts establish U7/U8 support. Mini-racer is administrative tooling with platform wheels; generated
application code remains stdlib-only. Public index hosting, Lakebase and other
platform acceptance are separate claims.
