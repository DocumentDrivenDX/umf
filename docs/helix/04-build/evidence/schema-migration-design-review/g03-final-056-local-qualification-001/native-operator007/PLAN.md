# G03 Full14 bounded local Linux operator

Status: **PREPARED_NOT_EXECUTED**. This source describes a local diagnostic route only. No Docker invocation, native scenario execution, candidate build, Actions run, or public qualification claim is included here.

## Scope and source ownership

The operator runs the source-owned `run_campaign` from the packet's accepted sealed harness. Its reviewed `scenario_executor` seam defaults to the original direct call; this operator supplies it only to put each existing native dispatch into a fresh bounded Linux process. The source runner still owns the fixed 14-case/19-scenario roster, exact expected-case bindings, target observation and continuity, ordinary/native/profile predicates, serial cleanup fence, and final N14 observation. `scenario_child.py` calls the original `run_chain` or `run_admission_refusal` and returns the unmodified raw dictionary. Parent code verifies the per-scenario envelope, hashes the physical raw report, and passes that dictionary back through the source-owned dispatch boundary. A timeout, process failure, malformed report, capture failure, or cleanup uncertainty remains unknown/failure and prevents later native dispatch; host container cleanup cannot upgrade a case result.

This folder is an adapter proposal, not a candidate source seal. At execution time the operator requires a separately reviewed, immutable input packet that binds the exact harness seal, final held cohort and Weft wheel, selected runtime images, fixture bytes, expected installed-cohort snapshot, and PG 18.6 runtime identity. The final wheel path, digest, byte size, cohort root and source root are packet values; prototype wheel identities are not embedded in this operator.

## Clocks and bounds

One monotonic 1,800-second operator clock covers setup, exact locked install, fixture generation, campaign, final target fence, and cleanup. Work dispatch stops at 1,740 seconds, reserving the final 60 seconds for termination, cleanup, and durable closure. Each of the 19 scenario subprocesses receives one fresh 180-second budget and a 10-second TERM-to-KILL grace. The source executor is asked to dispatch in the exact roster order; a child is refused before launch if a complete 180-second slot cannot fit. The underlying 30-second statement, 5-second lock, 5-second observer/connect, and 16-second writer-join bounds remain those of the sealed source/runtime contract.

Raw stdout/stderr across guest commands and host Docker commands are limited to 1 MiB total, with 64 KiB retained per stream. Truncation, drain expiry, deadline expiry, or physical-log/hash mismatch is failure. The whole selected output tree, including outer logs and the final result, is bounded to 16 MiB. Campaign gets only the remaining space after reserving 1 MiB for outer logs and 1 MiB for the terminal operator record. Scenario reports are collectively restricted to at most half that remaining campaign budget so both physical child reports and the source campaign result can fit; the source campaign result is size-checked before writing. Failure evidence stays bounded and is never turned into PASS by omission.

## Runtime and custody

The operator validates exact image IDs/platforms and actual PG version before the native campaign. Setup uses `--network=none`; the campaign uses a newly-created `--internal` bridge containing only the owned PG 18.6 service and the client. No published port, host network, Docker socket, privileged mode, or outbound network is configured. The client uses the previously reviewed bounded Linux allocation (4 CPUs, 8 GiB, 8,192 PIDs), plus only `SYS_ADMIN` and unconfined seccomp needed by the existing isolated-network probe route. `/tmp` is a bounded executable tmpfs; the exact-lock Python environment is an owned named volume. The PG data directory is one separate named owned volume, explicitly mounted and inspected to exclude anonymous storage. Harness and cohort are mounted read-only. The copied operator packet is a separate read-only bind at `/input-packet.json`, sibling to the read-only `/operator` tree; the guest verifies the copied packet bytes against the unchanged external packet digest before parsing it. Each phase has a separate writable output directory; setup evidence is read-only to campaign and host outer logs are never guest-mounted. The frozen packet's canonical absolute `source.root` and `cohort.root` are preserved byte-for-byte in the packet and explicitly passed as host-to-guest provenance environment values; guest code requires equality before using the fixed `/harness` and `/cohort` mount paths. Setup and cohort roots are therefore proven as packet provenance without changing either packet or guest filesystem path.

Every resource name is unique to the execution UUID, checked absent before creation, labeled with that UUID, inspected against its expected image/driver/network/mount identity, and removed only after ownership is re-proven. Cleanup checks exact absence for containers, network and both volumes. Unknown identity or unavailable cleanup proof produces `FAIL_OR_UNKNOWN`. Input source and cohort bytes are re-hashed after execution.

## Input packet contract

The command requires `--inputs <absolute canonical packet path> --inputs-sha256 <64 lowercase hex>`, plus `G03_FULL14_EXECUTE=1`. The packet is at most 1 MiB and has this closed top-level shape:

- `profile`: `umf.g03-full14-operator-inputs/1`
- `status`: `FROZEN_FINAL_INPUTS`
- `campaignId`: canonical UUID, frozen for the attempt
- `source`: `{root, manifestSha256, profile}` for the accepted exact-file source seal. Each sealed file row is exactly `{path, sizeBytes, sha256, sourcePath}`; `sourcePath` is absolute provenance from the sealing checkout only and is never dereferenced by the host or guest verifier.
- `cohort`: `{root, custodySha256, aggregateIndexSha256, selectedLockSha256, requirementsLockSha256, mirrorManifestSha256, weftWheel}`; `weftWheel` is `{path, sha256, sizeBytes}` relative to the frozen cohort root
- `images`: closed `client` and `postgres` entries `{id, platform}`; client is `linux/amd64`, PostgreSQL is `linux/arm64`
- `postgresRuntime`: `{fullVersion, shortVersion, serverVersionNum}` with numeric version `180006`
- `fixtureSha256`: expected deterministic inert fixture bytes
- `expectedInstalledCohort`: full canonical installed snapshot, plus `expectedInstalledCohortSha256`

The packet is reviewed and frozen separately from this adapter. Its SHA is supplied at invocation and rechecked inside both phases. Inputs are never reacquired, rebuilt, or modified by this operator.

## Terminal status

`PASS_LOCAL_FULL14` is emitted only when the source report passes its own complete fixed-roster predicates, all 19 child reports are returned and physically closed, N14 executes, the PostgreSQL and installed package identities match the packet, capture/evidence bounds hold, all immutable inputs remain unchanged, and all owned resources are proven absent. The profile remains `local_linux_diagnostic`; `nativeQualificationClaim` and `hostedQualificationClaim` stay false. This does not claim hosted CI, other architectures, release publication, or broader support.


## Setup interpreter boundary repair (operator007)

Actual operator006 completed all seven setup commands, including exact offline installation, pip check and candidate wheel physical-member matching. It then failed before PostgreSQL creation because base Python imported the campaign runner and lacked `psycopg`; no native scenario ran. Operator007 preserves that failure and moves only the setup snapshot into the already-reviewed `snapshot_runner.py` helper, pinned at SHA-256 `79cbde9f4c7a55c36342e2aa9940561be2c504f51c78bf679c4a52395c529c3a`. After exact wheel-member verification, the guest executes the helper with `/venv/bin/python -I`, source runner SHA from the accepted manifest, and an `/out/installed-cohort-snapshot.json` output. This command is recorded by existing `BoundedCommands` under the setup deadline, capture limits and 180-second maximum.

The setup parent no longer imports the campaign runner. It parses only the bounded helper stdout receipt and canonical newline-terminated snapshot file, verifies the physical file size/hash and canonical JSON/hash, then compares full snapshot content and digest to the unchanged packet. The file and command capture remain in setup evidence and are covered by the existing setup inventory when mounted read-only to campaign. Campaign `load_runner()` remains unchanged and runs under `/venv/bin/python`. There is no installation, `sys.path` workaround, packet change, cap change, or claim that the campaign has run.
