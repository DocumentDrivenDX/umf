# SDK public-H local Docker operator proposal

This is a new outside-repository operator proposal. It is not run and is not a public-H acceptance claim. Read `PLAN.md` for exact scope, mount policy and limits; `run_public_h_docker.py` is the proposed host launcher. The selected image and reader are pinned in `source-identities.json`; `integrity-manifest.json` covers every regular file in this proposal except itself.

The input packet is currently `HELD` and the D5 result plus immutable release identity/assets are not complete. The launcher is intentionally fail-closed: it refuses before Docker if the packet is not `READY`, a field remains held, the reader hash differs from the packet, the image identity is wrong, or any required physical root is unavailable. No Docker image inspection, container run, CI dispatch or Git operation was performed while preparing this proposal. A static Python syntax parse was the only check on the launcher.

The reader's seven proof commands and original H caps remain unchanged. Any later run must use only exact read-only input mounts, the single unique writable output mount, and the pinned Ubuntu 24.04.5 Linux/amd64 image. Its runtime remains OrbStack/Darwin aarch64 emulation; it cannot be described as native Linux or hosted evidence.
