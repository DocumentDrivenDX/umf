# Hash-pinned Python wheel mirror

A static mirror is an offline distribution route, not a public release or a
publisher/index claim. The layout follows the [PyPA Simple Repository API](https://packaging.python.org/en/latest/specifications/simple-repository-api/).

## Freeze a candidate cohort

The [U7/U8 template](../../../../python/packaging/embedder-wheel-lock.template.json)
records the current intended stack and its four tested cells. At candidate freeze,
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
license and notice files, source provenance, supported cells and optional package
profiles. The pglast containment extra is described separately and is not part of
the default runtime mirror.

## Verify a truly offline install

Use a new virtual environment for each supported cell. Install only from the
mirror's local file index, with pip configuration/environment isolation, no cache,
hashes required and binary wheels only:

```sh
python -m venv /tmp/umf-mirror-check
/tmp/umf-mirror-check/bin/python -I -m pip --isolated install \
  --disable-pip-version-check --no-cache-dir --only-binary=:all: \
  --require-hashes --index-url file:///ABSOLUTE/PATH/TO/MIRROR/simple \
  -r /ABSOLUTE/PATH/TO/MIRROR/requirements.lock
```

The sole package index is a local `file:` URL; `--isolated` ignores ambient pip
index configuration and the complete hash-locked requirements prohibit fallback
or substitution. `--only-binary` prevents a source build. Run `pip check`, the
installed `umf-codegen generate/check` parity/refusal corpus, `umf-table new/check`
and the explicit unapproved-apply refusal before any database connection. The
native PostgreSQL qualification remains a separate check against the exact
installed candidate. Remove a required wheel and alter a wheel in a copied mirror;
resolution or the hash check must refuse. Preserve these outputs with the actual
cell, package/source hashes and install log.

`python tests/codegen/test_package_mirror.py` verifies PEP 503 link generation,
license/source inventory, complete fixture closure, fresh-venv file-index install,
and missing/tampered-wheel refusal. It uses locally constructed test wheels and
does not claim stack-cohort acceptance. Only actual candidate receipts establish
U7/U8 support. Mini-racer is administrative tooling with platform wheels; generated
application code remains stdlib-only. Public index hosting, Lakebase and other
platform acceptance are separate claims.
