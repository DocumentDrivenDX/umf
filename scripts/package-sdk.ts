// SPDX-License-Identifier: MIT OR Apache-2.0
// Canonical SDK archive path: scripts/package-sdk.py verifies the Rust-default dist manifest/source cohort, including Saga
// schemas/resources and atomically writes .cache/sdk-distribution.
const child=Bun.spawn(['python3','scripts/package-sdk.py'],{stdout:'inherit',stderr:'inherit'});
const status=await child.exited;
if(status!==0)throw new Error(`SDK packaging refused (${status}); no archive was published`);
export {};
