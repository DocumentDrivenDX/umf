// SPDX-License-Identifier: MIT OR Apache-2.0
const releaseCheck = Bun.spawn(['python3', 'scripts/check-release-versions.py'], {stdout: 'inherit', stderr: 'inherit'});
if (await releaseCheck.exited) process.exit(1);
// Build the TypeScript reference and the qualified Rust root routes from one
// immutable source snapshot. The builder stages dist and swaps it only after
// source rehash and asset validation succeed.
const child=Bun.spawn([process.execPath,'scripts/package-sdk-rust-default.ts'],{
 env:{...process.env,UMF_RUST_DEFAULT_BUILD_ONLY:'1',UMF_RUST_DEFAULT_DIST:'dist'},
 stdout:'inherit',stderr:'inherit',
});
const status=await child.exited;
if(status!==0)throw new Error(`Rust SDK source build failed (${status}); dist was not published`);
export {};
