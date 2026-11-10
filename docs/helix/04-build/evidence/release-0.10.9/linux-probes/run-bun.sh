set -euo pipefail
mkdir /w && cd /w && echo '{"name":"c","private":true}' > package.json && bun add /dl/umf-sdk-0.10.9-linux-x86_64.tgz 2>&1 | tail -3
uname -m; bun --version
cp /probes/sdk-probe.mjs /w/sdk-probe.mjs
echo "--- bun probe"; bun /w/sdk-probe.mjs
echo "--- bun installed consumer"; bun /scripts/test-native-sdk-install.mjs /w/node_modules/@umf/core || echo "exit $?"
echo "--- declarations"; cd /repo && bun /scripts/test-sdk-declarations.ts /w/node_modules/@umf/core 2>&1 | tail -15; echo "decl exit ${PIPESTATUS[0]}"
