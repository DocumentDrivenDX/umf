set -euo pipefail
mkdir /w && cd /w && npm init -y >/dev/null && npm install --silent --no-audit --no-fund --ignore-scripts=false /dl/umf-sdk-0.10.9-linux-x86_64.tgz 2>&1 | tail -5
uname -m; node --version
echo "--- node probe"; cp /probes/sdk-probe.mjs /w/sdk-probe.mjs; node /w/sdk-probe.mjs
echo "--- node installed consumer (repo script)"; node /scripts/test-native-sdk-install.mjs /w/node_modules/@umf/core
echo "--- node explicit wasm loader probe"; cp /probes/node-wasm-loader-probe.mjs /w/; cd /w && node node-wasm-loader-probe.mjs; echo "wasm probe exit $?"
