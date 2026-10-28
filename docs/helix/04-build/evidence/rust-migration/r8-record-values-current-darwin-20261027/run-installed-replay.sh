#!/bin/sh
set -eu
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT=${UMF_R5_WORKTREE:?set UMF_R5_WORKTREE to checkout containing frozen packets and node_modules}
ARCHIVE=${UMF_R5_ARCHIVE:?set UMF_R5_ARCHIVE to the pinned umf-sdk.tgz}
PLAYWRIGHT=${UMF_R5_PLAYWRIGHT_MODULE:-$ROOT/node_modules/playwright/index.mjs}
TASK_TMP=$(mktemp -d "${TMPDIR:-/tmp}/umf-r8-record-values.XXXXXX")
trap 'rm -rf "$TASK_TMP"' EXIT
mkdir -p "$TASK_TMP/node_modules/@umf/core"
tar -xzf "$ARCHIVE" -C "$TASK_TMP/node_modules/@umf/core" --strip-components=1
node -e 'const p=JSON.parse(require("fs").readFileSync(process.argv[1]));for(const n of Object.keys({...p.dependencies,...p.optionalDependencies,...p.peerDependencies})){const src=require("path").resolve(process.argv[2],"node_modules",n),dst=require("path").resolve(process.argv[3],"node_modules",n);require("fs").mkdirSync(require("path").dirname(dst),{recursive:true});try{require("fs").symlinkSync(src,dst,"dir")}catch(e){if(e.code!=="EEXIST")throw e}}' "$TASK_TMP/node_modules/@umf/core/package.json" "$ROOT" "$TASK_TMP"
cp "$HERE/installed-host-runner.mjs" "$TASK_TMP/node_modules/@umf/core/replay-host.mjs"
cp "$HERE/installed-browser-runner.mjs" "$TASK_TMP/node_modules/@umf/core/replay-browser.mjs"
for runtime in node bun; do
  (cd "$TASK_TMP/node_modules/@umf/core" && NODE_PATH="$TASK_TMP/node_modules" UMF_R5_WORKTREE="$ROOT" UMF_R5_INSTALLED_PACKAGE="$TASK_TMP/node_modules/@umf/core" "$runtime" ./replay-host.mjs)
done
(cd "$TASK_TMP/node_modules/@umf/core" && NODE_PATH="$TASK_TMP/node_modules" UMF_R5_WORKTREE="$ROOT" UMF_R5_INSTALLED_PACKAGE="$TASK_TMP/node_modules/@umf/core" UMF_R5_PLAYWRIGHT_MODULE="$PLAYWRIGHT" node ./replay-browser.mjs)
