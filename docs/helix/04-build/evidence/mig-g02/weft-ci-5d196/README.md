# Weft G02 CI evidence

The byte-preserving archive `weft-ci-5d196-evidence.tar.gz` contains the final receipt, API records, source workflow snapshots, completed job logs, replay pointers, artifact custody, and the original `members.sha256` inventory. The standalone `receipt-final.json` is byte-identical to the reviewed receipt.

Extract with `tar -xzf weft-ci-5d196-evidence.tar.gz -C <destination>`. Archive members are rooted at `weft-ci-5d196/`: `receipt-final.json`; `raw/` for run/job/check/commit/PR/artifact responses and workflow snapshots; `logs/` for completed job logs; `replay-pointers.json`; and `artifact-custody.json`. The historical member inventory is `weft-ci-5d196/members.sha256` inside the archive. `archive-manifest.json` records the archive digest and every member path, byte count, and SHA-256.

The original redirect-header bytes retain CRLF. Downloaded artifact ZIPs and extracted wheel/native/WASM payloads are excluded; their exact hashes, sizes, artifact IDs, and download identities remain in archived `artifact-custody.json`.
