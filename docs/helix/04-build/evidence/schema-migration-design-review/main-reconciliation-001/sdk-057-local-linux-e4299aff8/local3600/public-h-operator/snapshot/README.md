# Public-H local operator evidence staging

Status: **metadata-only adoption staging; public-H not run**. This packet collects the three source proposals, their plans, diffs, source maps/identity records and per-proposal integrity manifests, plus Sol’s initial and final source reviews. It is outside the repository and is not an adopted repository change or a qualification result.

Sol accepted the v003 operator source only in review `reviews/sol-review002.md` (review SHA-256 `d91cb537ffed9dcd615f0cc8956e24c429da138cf40524be0ef68a7691516778`). The v003 runner itself is preserved under `proposal-v003/run_public_h_docker.py` (SHA-256 `59519b2635251bfa3c5f5fdaf4c502c67a93383fba8fde75199ea663ae2c2a54`); source-level review and integrity metadata are included. v001 and v002 remain byte-preserved historical review iterations, not execution candidates. The exact source progression is described in `source-map.json` and the proposal-local diffs.

Public-H remains unexecuted. The public-H packet is still held pending release merge/publication and immutable release tag/asset identities. The exact pinned image was not inspected or run during this staging task. No Docker command, Git operation, CI/Actions dispatch, candidate command, or network activity was performed.

Current D5 qualification context is separate: the local emulated 3600-second producer reports all 30 replay commands, 37 cases, 19 no-default checks, and 3 fault-injection checks passed; Sol is reviewing the final audit and cleanup closure. This staging packet does not turn that producer result into a final D5/release/public-H acceptance. No claim is made about native Linux or hosted execution; the proposed public-H runner is explicitly OrbStack/Darwin aarch64 emulation of Ubuntu Linux/amd64.

The original H reader’s seven commands and its 1800-second aggregate, 180-second child, 60-second evidence reserve, 10-second grace, 1 MiB log, and 16 MiB metadata limits are unchanged in the proposals. Outer wrapper bounds are separately labelled. See the plans and review files for the full scope and limitations.
