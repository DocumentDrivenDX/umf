# G03 local Linux admission probe operator plan

Status: source packet prepared for review; not executed. This is a compiler/admission diagnostic only. It does not exercise PostgreSQL, native ordinary behavior, G03-N12, the full campaign, a hosted runner, or a published release.

## Inputs and identities

- Probe source: `/private/tmp/g03-local-linux-admission-probe-003/probe.py`, SHA-256 `b8f672f3ceefac3a9c085424edf50d9173534b7a0803689b7d211b0d41482630`.
- Source pins: `/private/tmp/g03-local-linux-admission-probe-003/source-pins.json`, SHA-256 `eca8b1d34cd524eb6defce1f218ef66a4efc6458ab01b7e87f6b53c174cfc4ec`.
- Producer source P remains commit `e4299aff8e87e9d211f9d86df2f2013ab9c95945`, tree `8b98c0d895983ba2b7637dd3aea567dab0943883`, mounted read-only from `umf-migration-source-267675510` at `/volume-producer`. The guest still verifies HEAD, tree, clean status, and six pinned source files.
- Runtime remains the pinned Linux/amd64 image `sha256:7e44ba6b5c483f84c0d630180ba4cd17a82f1bba950577bf1dc9200e7f26e556`, with exact Python `3.11.17` and Bun `1.4.3` checks.
- Read-only cohort is `/private/tmp/g03-held-cohort-001/aggregate`, mounted at `/cohort/aggregate`. It contains the selected held candidate Weft `0.4.55+g03.a96e4f29262e` wheel (14,373,430 bytes, SHA-256 `51d607f851c72cffbc0dc45a969237f23d90b59185826b9eda56a791e799533e`) and the same 17 other wheel bytes as the accepted 18-wheel closure. Its selected-child lock is SHA-256 `29c69360e6bcbea329f1ddab05725f727316a729954f123cf11c102486a5c94b`; aggregate index `c4d99294936f1631949cb7252d98c8e91b9ba106bf329e251dc9c8ef41e5287d`; requirements lock `c28065235c7863051de1498c6144dfc1813264f5011dcaff865c2791515b75e4`; mirror manifest `9e304930ca19abc38091a90e324806649d1f75b1ca799b37448327c5c0b052b9`.
- The candidate Weft wheel is held, unpublished, and only built for `manylinux_2_34_x86_64`. Core remains its separately identified immutable release input; Access and Codegen remain source-built from P. The guest compares installed Weft wrapper/native files byte-for-byte with the selected wheel.

## Probe and expected baseline

The original five cases and refusal boundaries remain unchanged: absent-envelope native baseline; matching logical default under module 0.2; expected legacy 0.1 refusal; native-only 0.2; and mismatch refusal. No database, authentication, session lease, or SQL execution occurs. In addition to those case statuses, PASS now requires the first baseline case's compiled ordinary program SHA-256 to equal `c8be43e133c5869b2ac01c520e92177d620b558c326cc8d6aa6b087454ecaf5e`. The exact baseline hash is present in both probe source and pins.

## Execution envelope (unchanged from accepted operator 002)

- One unique output under `/private/tmp/g03-local-linux-admission-operator-003/runs/`.
- Exact fixture generation, fresh hash-locked offline install plus `pip check` and installed-wheel member verification, then the probe; each candidate command is capped at 180 seconds, total at 600 seconds with a 60-second receipt/cleanup reserve.
- Docker `--pull never`, `--platform linux/amd64`, `--network none`, read-only container root, 4 CPUs, 8 GiB, 8192 PIDs; only the existing `SYS_ADMIN`/`seccomp=unconfined` needed by unchanged `unshare --net` calls. P and cohort inputs are read-only. `/tmp` and `/venv` are executable tmpfs; output is the sole writable bind.
- Guest retained logs are capped at 768 KiB and the accepted outer helper at 128 KiB per stream (1 MiB total). Entire evidence is capped at 16 MiB. Physical logs, receipt, output roster, exact owned container cleanup, and daemon-visible absence must close before operator PASS.
- No lock regeneration, dependency resolution, network install, retry, source build, candidate source edit, full18 replay, Actions dispatch, release upload, or version publication.

Previous packets remain intact: operator 001's pre-probe noexec failure and operator 002's prepared-but-unexecuted source are historical. This packet is source-only pending Sol review; root execution authorization remains separate.
