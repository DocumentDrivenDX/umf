# Core0.10.3 CW affected closure003

Verdict: ONE remaining concrete CW-F6 blocker; all other prior finite correction conclusions below accepted in scope. Exact eight postimages match the frozen tuple at9ddd. This is the affected closure of receipt002 SHA7b1641d5…, not another product audit. No candidate execution/import, AST/YAML evaluation, tests, generation, Git or source edits. Read-only source/hash and one exact historical producer-jobs API read only.

## Remaining CW-F6 correction

P1 — tools/verify_core_public_producer.py:expected_source_jobs now requires:

- qualify-installed-artifact (linux-x86_64, 3.11.17)
- qualify-installed-artifact (macos-arm64, 3.11.9)

But the producer job has no explicit name; its unchanged include matrix has six values. The authoritative existing two-cell run40338720085 confirms actual job names:

- qualify-installed-artifact (linux-x86_64, ubuntu-24.04, x64, 3.11.17, x86_64, linux_x86_64)
- qualify-installed-artifact (macos-arm64, macos-15, arm64, 3.11.9, arm64, macos_arm64)

Thus both source_jobs lists are empty and the public producer guard always refuses the otherwise genuine six-job run. Change only expected_source_jobs to the exact actual six-value names, preserving current normal PR check names. Alternatively an explicitly matching producer job name is technically possible but would require considering existing required check-name identity; updating the helper is smaller. Keep uniqueness and the exact corrected four selected platform/version job names, run/attempt/path/head/event checks, eight artifact names/digests, direct+sdist_rebuilt key set, full archive correspondence and all four installed controls. No regex broadening or skipped producer proof.

This uses actual historical naming evidence only, not historical0.10.2 qualification as0.10.3 evidence. Primary API: https://api.github.com/repos/DocumentDrivenDX/umf/actions/runs/40338720085/jobs?per_page=100, read through the connected GitHub tool; job IDs121627192012/121627192031.

## Closed affected families retained

CW-F1: commands run in their own session/process group; parent-exit/orphaned group, timeout, overflow and signal errors fail closed. TERM/KILL plus hard drain end and bounded wait remove the prior indefinite inherited-pipe wait. Allowance includes grace/drain and original cleanup reserve; UTC/monotonic endpoints retained. Original producer build/install/test/rebuild bodies and receipt operations now use the shared runner, while assertions/roster remain. Producer/selected/public evidence assembly has bounded tiny fallback evidence and nonzero failure. The shared deadline still begins before acquisition; fixed original limits remain.

CW-F2: exact binary repair/test acquisition lock and fresh venv/compatible Pydantic2.14.1/core2.50.1 selection retained. No source-build resolution or semantic/lower-bound change added in the new cells. External primary lock acquisition bytes were not re-downloaded in this closure; actual frozen hashes remain the claimed input identity, not a new installed proof.

CW-F3: --no-compile restored for both selected/public installs; strict installed RECORD/no-pyc checks retained. Consumer now explicitly selects the exact umf-release-selected child directory created by the bundle/uploader. Exact254 cases/zero skips, actual14 probes, exact interpreter/platform/import/distribution/semantic identities, selected wheel/native/common-sdist and pre/post installed payload checks retained.

CW-F4: sdists are streamed rather than inflated wholesale, with original finite128MiB file/512MiB total/100000-member bounds and bounded PKG-INFO. The16MiB compressed archive/family bound remains separate and unchanged. Safe path/single-root/member/metadata/range checks remain; wheel/RECORD/ELF/actual auditwheel minimum-policy behavior and closed non-native payload are unchanged from prior accepted source conclusions.

CW-F5: packet represents the exact seven metadata ROLES while filenames/size/hash remain HELD until actual final assembly. Only SHA256SUMS and release-pins.json have existing fixed protocol filenames. Exact API roster and hashes cover all three package archives plus the actual seven metadata rows; SUMS covers all assets except itself; release-pins.files binds only the three archives. No invented final metadata filename/hash, extra archive allowance or circular checksum claim.

CW-F6 otherwise: genuine push/manual producer profile is chosen explicitly; normal PR gates remain separate and source S is not relabeled as a synthetic PR merge or M. Exact producer source/tree/run/attempt, tests/verifier from S, public archive byte correspondence, full direct/rebuilt receipt roles, four installed cells and H/M/S proof evidence retained. The unreachable packet asset-output code was removed. Packet remains HELD and no public/install/release claim is accepted.

## Exact frozen tuple

| Path | SHA-256 |
| --- | --- |
| .github/workflows/python-action-runtime.yml | 76d36dbb97147e7ecb378f0266ff1a92fd161b5f3471ab328e2406a58cad2a6a |
| .github/workflows/core-0.10.3-public-install-proof.yml | 67d6918c171c84ea54b66cfaed632f8fbf03cde8f84f90890f3e593420723c66 |
| tools/core_python_qualification_runner.py | 68a89974e0dc002b88fa5d6b50213d30a2f9cb4080c000982ef966655ef945f8 |
| tools/qualify_python_release_wheel.py | fbb1caabd4ff62ce4e1bb4313888a85d216a869908e4a1afbc736404f912e404 |
| tools/verify_core_public_producer.py | 51d1ca06fc46a2210d063a45012861a0a654d966f736c3a717532665649c7bfc |
| tools/verify_core_public_release.py | 5e661bb2be37c39f2dd498daca440a73d7f924006a49dd65c6357e679b58f5ad |
| qualification-inputs/core-0.10.3-wheel-input-lock.json | 9bd2f8db08dd8bd911f680fec8716abe8726961e7d204aa71ac4f271d810d44f |
| qualification-inputs/core-0.10.3-public-install-proof.json | edcf7931363b56040985a7f6c307a0b2c8cbe2725cec43e3ad36cf6ae0b505ae |

Only the exact remaining source-job-name correction requires another affected check. Preserve current CG run/failure history separately; CG source/output adoption, naming/publication holds, future actual producer artifacts and original required CI remain open. No CW dispatch acceptance before this blocker closes.
