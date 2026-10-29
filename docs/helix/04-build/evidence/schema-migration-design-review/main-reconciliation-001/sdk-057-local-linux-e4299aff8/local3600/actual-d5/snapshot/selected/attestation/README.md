# Local Linux G02-D5 route (prepared, not executed)

This directory contains data-only copies of the existing G02-D5 workflow steps, a narrow local identity adapter, and a Docker orchestrator. It is diagnostic evidence only; it does not impersonate a hosted run or create a qualification result. No D5 candidate command has run locally.

## Frozen source and prerequisites

- Source checkout: `/Users/erik/.codex/worktrees/eb69/umf`
- Source commit/tree: `e4299aff8e87e9d211f9d86df2f2013ab9c95945` / `8b98c0d895983ba2b7637dd3aea567dab0943883`
- Workflow: `.github/workflows/access-boundaries.yml`, SHA-256 `f0963d2df1e371112ba6e57999dbf69290796d711eb97ed46637d4ebc63918a1`
- Client image: Ubuntu 24.04.5 amd64 guest, image digest `sha256:7e44ba6b5c483f84c0d630180ba4cd17a82f1bba950577bf1dc9200e7f26e556`; expected Python 3.11.17, Bun 1.4.3, Node 26.12.1, Rust/Cargo 1.90.0.
- Disposable server image: PostgreSQL 18.6 arm64, digest `sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336`; the orchestrator checks full version text, `server_version=18.6`, and `server_version_num=180006`.
- Current-source 18-wheel cohort: bound in `prepared-route.json` as the verified 18-wheel cohort from `/private/tmp/migration-full18-e4299aff8-002/cells/linux-x86_64-py311`, lock SHA-256 `4337ab0597dcec245402abe73bcf8ea1d09bc72a4cb2907473c9e53d0327e611`. The route accepts only this exact cohort and rejects older 6eca705a bytes.

## Local identity and execution boundary

The adapter changes only extracted `/private/tmp` copies of the workflow shell blocks. It replaces GitHub-only event/ref/run variables with `LOCAL_*` values, checks actual source commit/tree/cleanliness, and labels success `LOCAL_DIAGNOSTIC_PASS_...`. The source workflow remains unchanged. The Docker script also verifies that the mounted read-only source volume has the exact commit, tree, branch, clean status, and workflow hash before creating the new private network.

The client shares only the new PostgreSQL container's network namespace. The network is internal, no ports are published, source and cohort mounts are read-only, and D5 output is a fresh writable directory. The cleanup trap proves the Docker daemon is reachable, removes only the uniquely named client, PostgreSQL container, and private network, then verifies successful exact-name filtered listings are empty for those owned names.

The route retains the existing 30-command roster, 37 cases, 16 oracle groups, 19 no-default checks, and three fault scenarios. The new `LOCAL_EMULATED_3600` profile uses a 3,600-second aggregate ceiling with a 3,530-second work clamp, 180 seconds per child, 10 seconds TERM grace, 60 seconds evidence reserve, 1 MiB combined raw logs (768 KiB child plus 256 KiB outer), and 16 MiB selected output metadata. It changes only this local operator policy; the original 1,800-second attempt remains FAIL_OR_UNKNOWN and unqualified. The selected-evidence receipt inventories the complete bounded regular `d5/upload` tree, checks the exact 30 child logs and 22 direct report files (16 oracle, three fault, no-default, and two resource reports), and separately binds the outer capture, operator inputs, source workflow, and three-file payload. Its `roots` map explicitly binds output, proposal operator/attestation, and pinned source roots. Symlinks or special files fail; total selected metadata including the final context and receipt is capped at 16 MiB. The orchestration script requires `D5_EXECUTE=1`, an exact current-source cohort, a named dedicated source Docker volume, and a fresh output directory. It has not been run.
