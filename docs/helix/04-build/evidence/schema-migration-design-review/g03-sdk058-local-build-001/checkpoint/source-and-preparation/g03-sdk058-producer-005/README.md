# Local SDK 0.5.8 producer harness (source-only successor 005)

This private source-only successor is prepared for independent Sol review. It has
not been executed. The earlier 001/003/004 source packets and actual001 failed
staging output remain preserved. Root must approve this exact closure before a
new bounded producer attempt.

The producer source is pinned to commit
`855f6c48649496fc60b3303798790d0ddb55d38f`, tree
`53f2bfffbc0c5780e79d76d8fd3d202239d088b2`, and clean source volume
`umf-sdk058-source-855f6c486-001`. Before archive creation, a bounded
`git ls-tree -r -l -z HEAD` roster is checked against root's source-only metadata:
66,664 regular blobs, 4,859,161,120 bytes, maximum file size 68,475,965 bytes,
10,661,032 roster bytes, and SHA-256
`e0b198ea713c32344272c4d7b46a3626c39b7860b7a32602d580fd0df57fb6c1`. All
archive and expanded-source checks must match the admitted roster.

Only the transient Git archive and expanded regular source bytes use the
8 GiB source-staging class. The existing 100,000 archive-member cap, safe
relative paths, regular files/directories only, stable bounded archive digest,
fixed source-staging failure codes, and the original 1,500-second deadline
remain. Extraction copies regular files in bounded chunks while checking that
same guest deadline. This change does not expand selected-software or public
evidence limits.

The producer has exactly four ordered stages: `bun install --frozen-lockfile`
(300 seconds), `cargo fetch --locked` (600 seconds), `bun run build:sdk` once
(600 seconds), then `bun scripts/test-sdk-install.ts` once (180 seconds). Each
phase ceiling includes up to 10 seconds of termination grace. The aggregate
remains 1,500 seconds with a 1,380-second guest-work window and 120-second host
finalization reserve. Only the original 139-case install consumer receives
`UMF_SDK_INSTALL_RETAIN_DIR=/out/sdk-install`.

The installed software handoff keeps only
`/out/sdk-install/node_modules/@umf/core` plus its custody JSON. It excludes
unused consumer dependency trees and `node_modules/.bin`. Limits remain
256 MiB total, 64 MiB per file, and 8,192 files. Public logs and evidence remain
capped at 1 MiB and 16 MiB inclusive. SDK outputs are not yet present; no SDK
hash or consumer status is asserted by this source packet.
