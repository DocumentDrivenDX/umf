# Local public-H Docker operator — proposal 009 (V6-r2 reader pin)

Status: PREPARED, NOT EXECUTED; source review pending. Reader `/private/tmp/sdk-057-local3600-public-h-v6-r2/run-local3600-public-h.py` SHA-256 `94f944788ac2724935c3685d7f05c6f6952425916e73872896e0071a839bc4c8` and packet011 `/private/tmp/sdk-057-local3600-public-h-v6-r2/local3600-public-h-inputs.011.ready.json` SHA-256 `d3d9424a5e0a7ca85dd67936f135646d41bff62692e146a0db05d7fa164ca195` are pinned here. The packet is attempt 6 with the same execution UUID and exact release/evidence identities.

The V6-r2 reader accepts actual index-relative references from the full18 aggregate index while preserving aggregate-root assembly receipt paths and hash-binding every corresponding file. The installed Python probe receives the index-parent mirror path, and its branch explicitly resolves the aggregate index before using that parent. The immutable aggregate, producer receipt, wheels, SDK wrapper, D5 evidence and release assets are unchanged.

The operator runner changes only its reader path/hash and copy of the exact safe-directory config. All proposal008 storage/export behavior and original H command/cap limits remain unchanged. This is source/provenance preparation only; no Docker, H run, network download, product execution, or release operation occurred.
