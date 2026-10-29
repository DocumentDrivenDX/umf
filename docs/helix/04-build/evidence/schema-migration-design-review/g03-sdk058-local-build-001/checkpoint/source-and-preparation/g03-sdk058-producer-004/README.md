# Local SDK 0.5.8 producer harness (frozen source successor)

This is a private, source-only successor prepared for independent Sol review. It
has not been executed. The original 001 source remains held unchanged; partial
002 artifacts are also preserved. Root must independently approve this exact
source closure before one bounded Linux producer attempt.

The producer source is pinned to commit
`855f6c48649496fc60b3303798790d0ddb55d38f` and tree
`53f2bfffbc0c5780e79d76d8fd3d202239d088b2`; its clean source volume is
`umf-sdk058-source-855f6c486-001`. The separate binding record identifies the
source preparation receipt, immutable runtime image, harness file hashes,
limits, outputs, and same-path future read-only mounts.

The command roster is exactly four ordered stages: `bun install
--frozen-lockfile` (300 seconds), `cargo fetch --locked` (600 seconds),
`bun run build:sdk` once (600 seconds), then `bun scripts/test-sdk-install.ts`
once (180 seconds). Cargo fetch is retained because `build:sdk` invokes the
Rust metamodel compiler. Each phase ceiling includes up to 10 seconds of
termination grace. One 1,500-second supervisor deadline includes container
termination, owned-container cleanup, and bounded finalization. The guest work
window is 1,380 seconds; the host reserves 120 seconds split into 15 seconds
for owned-container removal/absence verification and 105 seconds for bounded
output closure. The 10-second client termination grace is included before that
120-second reserve. No phase receives a fresh aggregate clock.

Only the original 139-case install consumer receives
`UMF_SDK_INSTALL_RETAIN_DIR=/out/sdk-install`. The original consumer assertions
run before retention selection. The handoff keeps only
`/out/sdk-install/node_modules/@umf/core` plus its small custody JSON; unused
consumer dependencies and `node_modules/.bin` are excluded. The installed SDK
package and archive are separate retained software. Each selected regular
file is physically hashed with stable identity checks. Limits are 256 MiB total,
64 MiB per file, and 8,192 files. No symlink is followed or included in the
selected package inventory.

The SDK archive is retained at `/out/sdk-distribution/umf-sdk.tgz` with its
manifest. The original test writes archive custody for
`/tmp/umf-source/.cache/sdk-distribution/umf-sdk.tgz`; that custody is never
rewritten. A later parity container must bind `/out/sdk-distribution`
read-only at `/tmp/umf-source/.cache/sdk-distribution` and bind `/out/sdk-install`
read-only at `/out/sdk-install`, then pass the archive path exactly as recorded
in custody.

Public logs and evidence are capped at 16 MiB inclusive; logs have a 1 MiB
aggregate cap. A separate outer closure verifies the owned container is absent,
re-hashes retained software and public evidence, and reads back its final
receipt. Failure-only metadata remains small if evidence exceeds its cap. The
harness performs no Actions, Mac runtime, Praxis, Rust/wheel regression rerun,
or publication.
