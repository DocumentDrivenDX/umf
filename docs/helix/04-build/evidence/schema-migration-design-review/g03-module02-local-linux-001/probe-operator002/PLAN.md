# G03 compiler-admission local Linux operator plan

Status: prepared, not executed (revision 002). The operator runs only the already frozen five-case source/compiler compatibility probe. It does not run PostgreSQL, invoke an action, validate native ordinary behavior, close G03-N12, or claim hosted/native-metal evidence.

## Frozen inputs

- Probe: `/private/tmp/g03-local-linux-admission-probe-002/probe.py`, SHA-256 `032e0546ad4d7846845da0a77a52a2efcab28be7318b1b35204532068ba4f8ef`.
- Probe pins: `/private/tmp/g03-local-linux-admission-probe-002/source-pins.json`, SHA-256 `82db10f7a95989cc7b68d468710ba97e7d606881c8cb2d01accaba6005211dc6`.
- Candidate source: P commit `e4299aff8e87e9d211f9d86df2f2013ab9c95945`, tree `8b98c0d895983ba2b7637dd3aea567dab0943883`, existing Docker volume `umf-migration-source-267675510`, mounted read-only at `/volume-producer`.
- Runtime image: Linux amd64, image digest `sha256:7e44ba6b5c483f84c0d630180ba4cd17a82f1bba950577bf1dc9200e7f26e556`; require exact observed Python `3.11.17` and Bun `1.4.3` before candidate commands.
- Cohort: `/private/tmp/migration-full18-e4299aff8-002/aggregate`, read-only at `/cohort/aggregate`; selected Linux 3.11 lock SHA `4337ab0597dcec245402abe73bcf8ea1d09bc72a4cb2907473c9e53d0327e611`; aggregate index SHA `fac25d7d5041983f1e3d464efbdda70e84df19f9fd7b70882990e4a05e69a634`; requirements lock SHA `bca40a3db5f840f1059443fdd02c66f47a894b51ecdcb9bd33ffa93d4911ce49`; mirror manifest SHA `75e64af5b1f3b3d6f5c6cbbf7bbde2174aa955f22afb11f8d6b82ded051ae3db`.

## Container inputs and isolation

Mount only the existing P volume (read-only), aggregate directory (read-only), frozen probe directory (read-only), this operator directory (read-only), and one unique fresh output directory (read-write). Use `--network none`, `--pull never`, `--platform linux/amd64`, a read-only container root, executable `/tmp` tmpfs, 4 CPU / 8 GiB / 8192 PID bounds, and only the previously qualified `SYS_ADMIN` plus `seccomp=unconfined` needed for the unchanged `unshare --net` command. Do not use privileged mode, host networking, host namespaces, a broad `/private/tmp` mount, a database, or pre-existing containers. The only writes inside the container are executable `/tmp` cache, fresh executable `/venv` tmpfs, and the unique output bind.

Before any candidate command, preflight the exact image and existing source volume, source HEAD/tree/clean status, required P source-file hashes, probe/pin hashes, lock/aggregate/manifest hashes, and wheelhouse roster against the frozen pins. Refuse on any mismatch. The guest observes exact Python 3.11.17 and Bun 1.4.3 identities before fixture generation; it does not install either runtime or dependencies from a network or source build.

## Three candidate commands

1. Fixture producer, under a 180-second command limit: `bun tests/lifecycle/g03-defaults-native-fixture.ts /out/g03-defaults-native-fixture.json`.
2. Fresh environment and exact offline install/check, under a 180-second command limit: create `/venv` with `/opt/hostedtoolcache/Python/3.11.17/x64/bin/python3.11`, run the probe-002 frozen hash-locked install against `file:///cohort/aggregate/mirror/simple`, then run `pip check`. Install with pip `--no-compile` so the exact installed wrapper/native package roster contains only wheel-owned files. Compare every installed `weft/` wrapper/native member by size and SHA to the exact selected immutable Linux wheel as part of this command. No requirement resolution, cache fallback, retry, editable/source install, or extra package.
3. Probe, under a 180-second command limit and network namespace isolation: `/venv/bin/python -I /probe/probe.py --fixture /out/g03-defaults-native-fixture.json --report /out/g03-admission-report.json`, via the existing `unshare --net` boundary.

Retain each command's exact argv, start/end UTC, elapsed time, exit code, bounded stdout/stderr byte counts and physical log hashes. Preserve all nonzero statuses and partial outputs. Probe statuses must match its own exact expected five-case vector to report its probe-level PASS; that remains source/compiler admission only.

## Bounds and cleanup

Enforce 180 seconds per candidate command, 600 seconds total including input copy/setup/receipt/export/cleanup, reserving 60 seconds for final evidence and cleanup; aggregate retained logs to 1 MiB; cap the complete exported evidence tree at 16 MiB. Enforce while draining, not after unbounded buffering. After terminal status, hash and enumerate all regular output files, reject symlinks/special files/unknown files, close the receipt and physical hashes, remove only the exact run-owned container, then verify that exact container name is absent. A cleanup or capture failure forces operator `FAIL_OR_UNKNOWN`, even if the probe report says PASS. Keep guest receipt, host wrapper record and Docker stdout/stderr as distinct files.

Output directory is unique under `/private/tmp/g03-local-linux-admission-operator-002/runs/`; never overwrite a prior attempt. The accepted bounded-capture helper caps outer streams at 128 KiB each (256 KiB combined); the guest controls the remaining 768 KiB of the 1 MiB total logs cap. The installed Weft wrapper/native member comparison binds the actual files to the immutable wheel, beyond checking only the wheel archive. Each member is streamed under a separate 64 MiB software-member processing bound; this is not an evidence-log or export allowance. No candidate/runtime command has run. Root authorization is required after the final operator source review.


Revision 002 is a narrow retry source packet. Preserved revision 001 execution failed before any probe cases because `/venv` was mounted without execute permission; its exact evidence remains in `/private/tmp/g03-local-linux-admission-operator-001/runs/e2dbd083504c4d6e9d722cac595975e1`. Revision 002 changes only `/tmp` and `/venv` tmpfs mounts to `exec` and makes failure cleanup recognize the already removed, verified-absent owned container without treating a redundant `docker inspect` as an error. All candidate commands, source inputs, isolation, and bounds are unchanged.
