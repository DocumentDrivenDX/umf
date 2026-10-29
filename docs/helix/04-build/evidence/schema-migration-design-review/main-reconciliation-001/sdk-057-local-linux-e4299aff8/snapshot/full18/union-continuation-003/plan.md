# Frozen full18 union continuation 003

State: PREPARED ONLY. Await root's explicit GO. Do not start Docker containers or execute controls/replay before GO. This is a narrow custody correction to 002, not a new acquisition, assembly, or source run.

## Purpose and delta

002's outer watchdog capture and inner command capture both used `logs/<cell>-union-replay.log`. The inner command record therefore did not match the physical file after the host capture overwrote it. Preserve 002 byte-for-byte as a functional pass with unqualified custody. In 003, the outer stage file is `logs/host-<cell>-union-replay.log`; inner command logs remain `logs/<cell>-union-replay.log`. The finalizer now requires different paths and verifies each physical file's size and SHA-256 against its respective record. Receipt records 002's collision and its unqualified disposition.

## Frozen inputs and unchanged scope

Use source volume `umf-migration-source-267675510`, expected source commit `e4299aff8e87e9d211f9d86df2f2013ab9c95945`, tree `8b98c0d895983ba2b7637dd3aea567dab0943883`. Source must be clean and mounted read-only. Reuse only the existing original aggregate at `/private/tmp/migration-full18-e4299aff8-002/aggregate`, mounted read-only and unchanged: index SHA-256 `fac25d7d5041983f1e3d464efbdda70e84df19f9fd7b70882990e4a05e69a634`, generator corpus SHA-256 `80b8059d48490761bc98255d58409d96f46b399d78b79d0dd9aa43d30d7e6187`, producer receipt SHA-256 `4375e0c4a0faf89f78056086225cd25352e8c7299966395006bdba809da2b064`. No reacquire, reassembly, rebind, or aggregate rewrite.

Reuse exact pinned image IDs: py311 `sha256:7e44ba6b5c483f84c0d630180ba4cd17a82f1bba950577bf1dc9200e7f26e556`; py314 `sha256:2474bc9010faea57300e5e8c33a6be6fce4d37dada3bf8af7d8230069f4c0a30`. Reuse exact operator-only packaging 26.3 bootstrap wheel SHA-256 `d7193f7c8e4e93f444fde0262bf90af30e16fa0ad0ad44cb553c87339b23cd1c`, size 129956, publisher JSON SHA-256 `4f190d2f0b312b3086058cee64ab4333bf3ce67fb78b4c2bdb43899049b29f4d`. Bootstrap remains absent from target 18-wheel lock and mirror.

For each cell, preserve the exact 002 sequence: offline bootstrap and full default-environment equality proof, existing selector control for active requested-extra refusal and inactive optional-extra inactivity, then original isolated full18 offline mirror probe with exact selected cell and source SHA. No code/interpreter/verifier/control/probe changes.

## Limits and evidence

Preserve original full18 local contract: 3600-second stage watchdog; Docker stop grace 30 seconds; 8 CPUs; 24 GiB memory; 8192 PIDs; `--pull=never`; linux/amd64; network none; SYS_ADMIN and seccomp unconfined; exact pinned image; read-only source and aggregate. No original full18 log/evidence byte cap is claimed. Preserve the added continuation-only defenses, labeled as operator caps: 1 MiB captured host-stage logs total, 1 MiB captured command logs per cell, 16 MiB total evidence metadata including receipt.

Before finalizing, 003 verifies both host-stage and inner command log paths are distinct and both physical files match their recorded byte lengths and SHA-256 values. If py311 has completed, verify this correspondence before starting py314; stop if it fails. Final receipt keeps original py311 failure, 001 unqualified watchdog disposition, and 002 functional-but-custody-unqualified collision disposition. No global/full18 PASS claim until the root-level finalizer accepts the resulting evidence.

## Frozen files and digests

Canonical harness digest is SHA-256 of ordered `shasum -a 256` records:

- `run-union-continuation.sh`: `73bcc02eb5bafd0ad3ec8d959e24329662dc4a1db2c1de558d1b3126ab96c407`
- `run-cell.sh`: `2814935522b7a7863cd69bd494e762235220b6f6bb473b0f8b3cf0a1fb765c96`
- `prove-bootstrap.py`: `779a818c1793650e54ba1c365031626395058fdaa9fa1bf19d8f2309cad92bb6`
- `capture-bounded-log.py`: `f3520d808d9d748be68a0bfced22e7970844c5916af65dbe7fdf519b7a8ffda5`
- `finalize.py`: `a23ad484e0e0de67084a208dd42f6b76e8f120af3ab6eff82dded2c0070b6658`

Combined harness SHA-256: `07904d34b782a07bad53cd29797eaca70e0f3c6cb20adc51b1084004b4084ea3`.

Exact 002-to-003 script diff: `/private/tmp/migration-full18-e4299aff8-union-continuation-003/harness-diff.patch`, SHA-256 `4b8f0e88a2ddfdef4c7f5013e6deeb38186e439929572acf4a3fdef0e1ca69d9`.

Static checks: `bash -n` on shell scripts and in-memory Python compilation passed. No bytecode files written. Output root `/private/tmp/migration-full18-e4299aff8-union-continuation-003/output` must remain absent before execution. No source, Git, Actions, SDK, acquisition, aggregate-assembly, or D5 operations are part of this package.
