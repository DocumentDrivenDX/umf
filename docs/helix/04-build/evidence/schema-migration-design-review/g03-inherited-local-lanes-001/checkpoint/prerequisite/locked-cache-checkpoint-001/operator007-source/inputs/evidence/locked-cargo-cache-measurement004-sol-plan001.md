# Acquisition004 finite cache measurement repair

Accepted narrow repair plan for source-only Luna implementation, then independent source closure and root's bounded acquisition. No cap, clock, network scope, product command, additional test family or release gate changes are needed. Sol used source/data reads and physical hashes only; this private plan is explicitly authorized. Preserve frozen001/002/003 and all failed actual evidence.

## Actual003 prerequisite failure

`/private/tmp/g03-linux-locked-cargo-cache-operator-003/runs/2c527cb8c89640ecb060291e62e07505/operator-result.json`, SHA-256 `efed283137531214b65ba5f1923e78057065795cb52f884cd33ec305c075753d`, records FAIL_OR_UNKNOWN in25.348 seconds. The guest reports `executionPerformed:false` and `pinned base image Cargo cache apparent size differs`; Cargo fetch never started. The host's `executionPerformed:true` records container-start attempt, not fetch success. Owned container and volume absence are verified in the receipt; complete raw captures total2111 bytes. Sol independently closed all41 public-file hashes and the inclusive35786-byte evidence total (33498-byte result plus2288 other bytes). No acquired cache or product qualification follows.

## Read-only root metadata probe

Probe directory: `/private/tmp/g03-cargo-base-size-metadata-probe-001`.

- `result.json`: SHA-256 `ac6c83816ee2e1f121ca198954aaa1582359c773fda1f3fc2f20920fda7789a4`.
- `probe.py`:1159 bytes, `94959758ac9bb3ae2651f7cff5e3b50903c788bddf6c82f1aaccf101f7af0189`.
- `stdout.log`:617 bytes, `421056e6c0b0f80d44de3fef32c732cdae4864f310e3c7ce4cb6b9a0a5a2ccf2`.
- `stderr.log`:0 bytes, `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

Sol read these files and independently matched their physical hashes. The root receipt records exact builder `sha256:1f983eafda3fd12f069837f7e972179ec3b8d74587190751db85b555b3430c10`, Linux/amd64, networknone, read-only filesystem metadata and du only, exit0 and owned-container absence from an exact-name query. No Cargo, compiler or product operation ran.

The exact-image probe observes cache161 regular files totaling17410143 bytes, matching its historical du output17410143; adding2 directory st_size values produces17417537. Index214 regular files total13154725 bytes, matching historical du13154725; adding216 directory st_size values produces13160387. Neither root contains hardlinked files. These are observed measurement correspondences for the pinned image, not a universal claim about GNU du or filesystems. The naive directory-inclusive Python helper does not measure the quantity retained in the historical pins.

## Finite source change

Use the already guarded `tree_inventory` per-root total of regular-file content bytes directly against the unchanged17410143 cache and13154725 index pins. Remove the redundant naive directory-st_size traversal. Describe the checked metric accurately in source and receipt/provenance; retain the historical du receipt as historical evidence and bind the new exact-image metadata probe. Preserve complete cache/index inventories, copied-seed equality, full Cargo-home scratch guard, archive/public limits, exact source/toolchain binding and single bounded fetch command.

Pin the retained failure/probe/plan evidence in the frozen004 package and refresh all affected manifest/source/provenance hashes coherently. Do not rewrite003 or reuse its output directory. The accepted003 tuple, exact archive classification, owner-checked cleanup and deadline repairs remain intact. The existing three pure-helper regression families are sufficient; no extra test family or semantic/product run is requested. Root remains the sole actual executor. Obtain finite004 source closure before the next bounded acquisition; unchanged003 must not be retried.
