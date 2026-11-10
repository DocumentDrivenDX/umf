set -euo pipefail
mkdir /w && cd /w && echo '{"name":"c","private":true}' > package.json && bun add /dl/umf-sdk-0.10.9-linux-x86_64.tgz >/dev/null 2>&1
mkdir /r && cp /repo/package.json /repo/bun.lock /r/ && cp -r /repo/patches /r/patches && cd /r && bun install --frozen-lockfile 2>&1 | tail -3
cp -r /repo/scripts /r/scripts
echo "--- declarations (repo dependency tree frozen lockfile, installed Linux SDK)"; bun scripts/test-sdk-declarations.ts /w/node_modules/@umf/core; echo "decl exit $?"
