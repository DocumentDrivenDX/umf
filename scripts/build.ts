// SPDX-License-Identifier: MIT OR Apache-2.0
const releaseCheck = Bun.spawn(['python3', 'scripts/check-release-versions.py'], {stdout: 'inherit', stderr: 'inherit'});
if (await releaseCheck.exited) process.exit(1);
const sagaPackage = Bun.spawn(['python3', 'scripts/build-saga-package.py', '--check'], {stdout: 'inherit', stderr: 'inherit'});
if (await sagaPackage.exited) process.exit(1);
const pythonResources = Bun.spawn(['python3', 'scripts/action-runtime-resources.py'], {stdout: 'inherit', stderr: 'inherit'});
if (await pythonResources.exited) process.exit(1);
// The Rust-default builder stages dist and publishes it only after source
// rehash, native artifact checks and complete asset-manifest validation.
const child = Bun.spawn([process.execPath, 'scripts/package-sdk-rust-default.ts'], {
  env: {...process.env, UMF_RUST_DEFAULT_BUILD_ONLY: '1', UMF_RUST_DEFAULT_DIST: 'dist'},
  stdout: 'inherit', stderr: 'inherit',
});
const status = await child.exited;
if (status !== 0) throw new Error(`Rust SDK source build failed (${status}); dist was not published`);
export {};
