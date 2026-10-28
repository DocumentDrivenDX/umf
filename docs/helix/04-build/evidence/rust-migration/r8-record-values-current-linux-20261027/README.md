---
ddx:
  id: umf.evidence.rust-migration.r8-record-values-current-linux-20261027
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-record-values
      kind: extends
    - id: umf.evidence.rust-migration.r8-security-not-current-linux-20261027
      kind: extends
---

# Record Values current-source installed-route evidence (Linux x86_64)

This packet records the installed `@umf/core` package replay on Docker-emulated
Linux x86_64, built from commit `e9ace728d2e8c0758b4723e3d1eef90b330ebe0d`.
The archive is `/private/tmp/umf-sdk-linux-e9ace728d.tgz`, SHA-256
`dc3ec269f99266862ea078e23d166c4b50e30cc5b1fd0ef3cf337982b31bd93a`. Its
fixed-point source closure is
`a53fba2dcf8edb4907de646040e446f95c6af7c13b6f6abd165dcdde5a893c25` across
3,595 inputs with zero generated-input transforms; this matches the Darwin
cohort source closure. The package is version 0.5.6. The archive stays in
`/private/tmp` and is not copied into the repository.

The frozen TypeScript packet contains 24 semantic cases and the host-admission
packet contains 19 raw-host cases. Node 26.12.1 and Bun 1.4.3 both pass all
cases on the installed default and TypeScript reference routes. Each runtime
records 44 default Rust dispatches and zero reference dispatches. Getter and
Proxy traces remain empty, including the two explicit ordering probes. Chromium
153.0.8010.12 passes the same semantic and raw-host cases, loads the packaged
WASM member, confirms that `process` and `Buffer` are absent, and records 46
bridge calls with zero reference calls. Its resource controls retain 700,000
units of opaque content and reject 100,001 values on both routes with `UmfError`
`LIMIT`, message `JSON structural limit exceeded`, path `/99999`.

Raw runner outputs are in [`node.json`](node.json), [`bun.json`](bun.json), and
[`chromium.json`](chromium.json). The exact frozen inputs, installed-route
runners, source closure, archive manifest, and member map are included here.
The archive member map, runner/result hashes, and source file hashes are checked
by [`verify-packet.mjs`](verify-packet.mjs). To replay the installed archive,
set `UMF_R5_WORKTREE` to the clean source tree, `UMF_R5_ARCHIVE` to the Linux
archive path, and `UMF_R5_PLAYWRIGHT_MODULE` to the Playwright ESM module, then
run [`run-installed-replay.sh`](run-installed-replay.sh).

This qualifies the recorded Linux x86_64 local emulation cohort only. It does
not establish hosted CI, a release, complete Rust-port coverage, or retirement
of any default-route gap. The Chromium 700,000-unit control is a single retained
value test and does not establish a general memory bound.
