set -euo pipefail
: "${EXPECTED_PYTHON:=3.11.17}"
export EXPECTED_PYTHON
rm -rf /worktree
mkdir -p /worktree /out/coordinated-artifacts /out/core-sdist-rebuilt /out/codegen-sdist /out/codegen-rebuilt
cp -a /src/. /worktree/
mv /opt/cargo/registry /opt/cargo/registry-image
ln -s /host-registry /opt/cargo/registry
cd /worktree
export CARGO_TARGET_DIR=/out/cargo-target
export CARGO_NET_OFFLINE=true
export RUSTUP_TOOLCHAIN=1.90.0-x86_64-unknown-linux-gnu
export PYO3_PYTHON=/usr/local/bin/python
python - <<'PY'
import platform, sys, sysconfig
import os
assert platform.python_version() == os.environ['EXPECTED_PYTHON'], platform.python_version()
assert sys.implementation.name == 'cpython'
assert platform.machine() == 'x86_64', platform.machine()
print(f'python={sys.version} platform={sysconfig.get_platform()} machine={platform.machine()}')
PY
rustc -Vv > /out/rustc-version.txt
cargo --version > /out/cargo-version.txt
python -m pip check
python -m build --no-isolation --wheel --sdist python
python -m build --no-isolation --wheel --sdist python/umf_codegen
python -m twine check python/dist/* python/umf_codegen/dist/*
cp python/dist/* python/umf_codegen/dist/* /out/coordinated-artifacts/
python tools/verify_python_artifacts.py \
  --wheel python/dist/*.whl \
  --sdist python/dist/*.tar.gz \
  --rebuilt-wheel-directory /out/core-sdist-rebuilt \
  --repository . \
  --expected-platform linux_x86_64 \
  --receipt /out/core-artifact-receipt.json
python - <<'PY'
import tarfile
from pathlib import Path
archive = next(Path('/out/coordinated-artifacts').glob('umf_codegen-*.tar.gz'))
destination = Path('/out/codegen-sdist')
with tarfile.open(archive, 'r:gz') as stream:
    members = stream.getmembers()
    roots = {Path(item.name).parts[0] for item in members if Path(item.name).parts}
    if len(roots) != 1 or any(Path(item.name).is_absolute() or '..' in Path(item.name).parts for item in members):
        raise SystemExit('unsafe or malformed codegen sdist')
    stream.extractall(destination, members=members, filter='data')
source = destination / next(iter(roots))
PY
python -m build --wheel --no-isolation --outdir /out/codegen-rebuilt /out/codegen-sdist/umf_codegen-*
python - <<'PY'
import hashlib
from pathlib import Path
left = next(Path('/out/coordinated-artifacts').glob('umf_codegen-*.whl'))
right = next(Path('/out/codegen-rebuilt').glob('umf_codegen-*.whl'))
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
print(f'codegen_sdist_rebuild_direct_sha256={sha(left)}')
print(f'codegen_sdist_rebuild_rebuilt_sha256={sha(right)}')
if sha(left) != sha(right):
    raise SystemExit('codegen sdist rebuild differs from direct wheel')
PY
python -m venv --system-site-packages /out/pair-tests
/out/pair-tests/bin/python -m pip install --no-index --no-deps \
  /out/coordinated-artifacts/umf_core-*.whl \
  /out/coordinated-artifacts/umf_codegen-*.whl
cd /out
/out/pair-tests/bin/python -I - <<'PY'
import importlib.metadata as metadata
import pathlib, sysconfig
import umf, umf_codegen
assert metadata.version('umf-core')
assert metadata.version('umf-codegen')
assert pathlib.Path(umf.__file__).is_relative_to(pathlib.Path(sysconfig.get_path('platlib')))
assert pathlib.Path(umf_codegen.__file__).is_relative_to(pathlib.Path(sysconfig.get_path('purelib')))
from umf import current_core_version
assert current_core_version() == '0.10.0'
from umf_codegen import generate_python_client
fixture = pathlib.Path('/worktree/fixtures/actions-binding/source.json').read_text()
import json
result = generate_python_client(json.dumps(json.loads(fixture), ensure_ascii=False, separators=(',', ':')), package='pair_check')
assert result['files']
print(f"installed_pair_smoke=passed umf-core={metadata.version('umf-core')} umf-codegen={metadata.version('umf-codegen')}")
PY
/out/pair-tests/bin/umf-codegen --help > /out/installed-codegen-help.txt
grep -qi generate /out/installed-codegen-help.txt
cd /out
/out/pair-tests/bin/python -I -B -m pytest -q \
  /worktree/python/umf_codegen/tests \
  /worktree/python/tests/test_core.py \
  /worktree/python/tests/test_rust_core.py | tee /out/pytest.log
