---
ddx:
  id: umf.evidence.rust-migration.r8-sec-projection-candidate-installed
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-059
      kind: informed_by
    - id: TD-078
      kind: informed_by
---

# R8 SEC projection candidate: installed Darwin checkpoint

The fixed-point SDK archive SHA-256
`996dd7c991ccc068bfbf58e21709d01e3babf238e4ef23ca01cf6f7f63cce9ed`
captured source closure
`8227af60468cb93bc6f495aaccee14876f4698204ccfb26f2ee6629e2fac836c`
with zero source transforms. The
[installed SDK receipt](darwin-arm64-sdk-receipt.json) verifies 1,812 archive
members, replays frozen SEC projection and admission cases plus two pinned SEC
source files in Node 26.12.1, Bun 1.4.3, and Chromium 153, and reports exact
candidate/reference parity within each host. Host-native null/undefined
`TypeError` messages vary between Bun and Node/Chromium; the receipt records
the actual messages and normalizes only these messages for cross-host
comparison. The candidate matches the reference on each host.

All three installed SDK hosts pass output at 33,554,431 and 33,554,432 UTF-16
code units, refuse 33,554,433 with `LIMIT`, and report the late invalid row
before the output ceiling. Missing and corrupt native/WASM asset controls
refuse. The browser measurement sampled the harness-descendant process tree
every 100 ms during the browser phase and observed a peak aggregate RSS of
3,011,600 KiB across four Chromium processes. It excludes the Bun harness,
may count shared mappings more than once, and may miss shorter spikes.

The installed wheel receipts for
[CPython 3.11.17](darwin-arm64-cpython311-wheel-receipt.json),
[3.12.15](darwin-arm64-cpython312-wheel-receipt.json), and
[3.13.16](darwin-arm64-cpython313-wheel-receipt.json) pass the same output
boundaries, late-invalid ordering, and overlong source-ID error precedence in
the installed Python wrapper and packaged Rust CLI. Their 8,000-observation
child processes measured peak RSS of 84,328,448, 85,032,960, and 86,409,216
bytes, respectively. The tested
wheel is
`umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl` (SHA-256
`27aa05a1143e33b2961e950e48baac847afd511d928d945c19a72c328d9c67aa`);
its packaged CLI SHA-256 is
`b090d545776e04ef52444c434d7dae9d94983a3fdcfa2bd8c7b21feeb83ae35d`.
The installed-wheel test script SHA-256 is
`1b770ddf21fe84c42ab5470c062061521c36657b61c04048ce85ca6e8590c6fc`.

These are bounded private Darwin arm64 observations. The SDK receipt includes
the reviewed Node source-ID precheck and current Key Tuple and Python resource
edits. The rebuilt wheel includes the CLI source-ID precedence correction.
Hosted Linux SDK and six-cohort Python CI results, SEC default-route
qualification, declaration retirement, and release gates remain open.
