#!/bin/sh
set -eu
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT=${UMF_MEMORY_WORKTREE:?set UMF_MEMORY_WORKTREE to the clean UMF source checkout}
ARCHIVE=${UMF_MEMORY_ARCHIVE:?set UMF_MEMORY_ARCHIVE to the exact Darwin e9ace728d SDK archive}
EXPECTED_ARCHIVE_SHA=accf61b39c4213ab452fbfff4fe1a31b950934a36c321c74984df45088adcd6c
REPEATS=${UMF_MEMORY_REPEATS:-5}
TASK_TMP=$(mktemp -d "${TMPDIR:-/tmp}/umf-r8-record-values-memory.XXXXXX")
trap 'rm -rf "$TASK_TMP"' EXIT
mkdir -p "$TASK_TMP/node_modules/@umf/core"
ACTUAL_ARCHIVE_SHA=$(node -e 'const c=require("node:crypto"),f=require("node:fs");console.log(c.createHash("sha256").update(f.readFileSync(process.argv[1])).digest("hex"))' "$ARCHIVE")
test "$ACTUAL_ARCHIVE_SHA" = "$EXPECTED_ARCHIVE_SHA" || { echo "archive SHA-256 mismatch: $ACTUAL_ARCHIVE_SHA" >&2; exit 1; }
tar -xzf "$ARCHIVE" -C "$TASK_TMP/node_modules/@umf/core" --strip-components=1
node -e 'const f=require("node:fs"),p=require("node:path"),pkg=JSON.parse(f.readFileSync(process.argv[1]));for(const n of Object.keys({...pkg.dependencies,...pkg.optionalDependencies,...pkg.peerDependencies})){const src=p.resolve(process.argv[2],"node_modules",n),dst=p.resolve(process.argv[3],"node_modules",n);f.mkdirSync(p.dirname(dst),{recursive:true});try{f.symlinkSync(src,dst,"dir")}catch(e){if(e.code!=="EEXIST")throw e}}' "$TASK_TMP/node_modules/@umf/core/package.json" "$ROOT" "$TASK_TMP"
FIXTURE="$ROOT/docs/helix/04-build/evidence/rust-migration/r8-record-values-current-linux-20261027/host-admission.json"
cp "$HERE/measure.mjs" "$TASK_TMP/node_modules/@umf/core/measure.mjs"
for runtime in node bun; do
  for scenario in retained-700k refusal-100001; do
    repeat=1
    while [ "$repeat" -le "$REPEATS" ]; do
      (cd "$TASK_TMP/node_modules/@umf/core" && NODE_PATH="$TASK_TMP/node_modules" UMF_MEMORY_INSTALLED_PACKAGE="$TASK_TMP/node_modules/@umf/core" UMF_MEMORY_FIXTURE="$FIXTURE" UMF_MEMORY_SCENARIO="$scenario" UMF_MEMORY_REPEAT="$repeat" "$runtime" ./measure.mjs)
      repeat=$((repeat + 1))
    done
  done
done
