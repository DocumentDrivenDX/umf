set -euo pipefail
python -m venv /tmp/v
/tmp/v/bin/python -m pip install --quiet --disable-pip-version-check pydantic==2.11.9 /dl/umf_core-0.10.9-cp311-abi3-manylinux_2_34_x86_64.whl /dl/umf_codegen-0.10.9-py3-none-any.whl
echo "--- pip check"; /tmp/v/bin/python -m pip check
echo "--- pip list"; /tmp/v/bin/python -m pip list --format=freeze
echo "--- uname"; uname -m; ldd --version | head -1
echo "--- probe"; cd /tmp && /tmp/v/bin/python -I -B /probes/python-pair-probe.py
echo "--- embedded cli"; /tmp/v/lib/python3.11/site-packages/umf/_bin/umf --version || true
/tmp/v/lib/python3.11/site-packages/umf/_bin/umf codegen --version
echo "--- release cli"; mkdir /tmp/c && tar -xzf /dl/umf-v0.10.9-x86_64-unknown-linux-gnu.tar.gz -C /tmp/c && /tmp/c/*/umf --version || true; /tmp/c/*/umf codegen --version
sha256sum /tmp/c/*/umf /tmp/v/lib/python3.11/site-packages/umf/_bin/umf
