---
ddx:
  id: umf.evidence.rust-migration.r8-inspectors-default-retirement-replay-4547-20261027
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-inspectors-default-retirement-replay
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-default-inspector-relationship-callsite-audit
      kind: informed_by
---

# Historical Core Inspector replay: 4547 archive

This is historical bounded evidence for the private SDK archive
`.cache/sdk-distribution/cohorts/4547d877/umf-sdk.tgz`. Its SHA-256 is
`5f3dccf215b0c1d631d2534946f8305ce6e1bef2d6a10477992a3aa4b4faf599`.
The archive manifest SHA-256 is
`a788c872229faddda77d130e661a41ff5c1525ddc1eece22a58ad908f1d91a10`; it
records source and captured-live closure
`4547d877ea7ac3b5e7bfb2101ae80833257c19ae7ba825cf884bc05c666a49b3`, 3,532
inputs, zero generated transforms, and `fixed-point`. The package is version
0.5.6 and private. This closure identifies the archive's own source snapshot;
subsequent source edits mean it is not evidence for the current checkout.

## Three bounded packets

The frozen predecessor container has SHA-256
`9563378b9fb00b213f76d6c0d09ac0c8278c0fb829c719b566b019971a0f3a7a`.
Each operation packet has two cases: one successful predecessor example and
one accessor preflight refusal. The packet digests are:

| Operation | Cases | Packet SHA-256 |
| --- | ---: | --- |
| `inspectCoreScalarType` | 2 | `51da1be926aa75da165216808028109c042c22cfd7e8f3fbf49180300b1b4895` |
| `inspectCoreRecordMembers` | 2 | `aad087e63a147d74b16255be427ff63f2ae7d7d811d72d2eae0f4f8becbfad6b` |
| `inspectCoreReferenceLinks` | 2 | `b53c9d0c228fe700bec8c5ac9d74196217590affb00621b9d733aa445b198181` |

All three packets passed on Node 26.12.1, Bun 1.4.3, and real Chromium
153.0.8010.12. Outcomes and accessor traces match the frozen packets. Each
success invokes the Rust bridge once on the default route; each accessor
refusal invokes it zero times; all reference-route cases invoke it zero times.
The Chromium replay requested the packaged WASM and confirmed Node globals are
absent. The nine machine-readable receipts are linked below with their SHA-256
digests:

| Operation | Node receipt | Bun receipt | Chromium receipt |
| --- | --- | --- | --- |
| Scalar type | [JSON](inspectCoreScalarType-node.json), `4ac3b951542dff64bb1172dbdfa8b75a01a8f1e3fbaab5f2ab8903b2a182de75` | [JSON](inspectCoreScalarType-bun.json), `fec91681bde6a751664d2fcc2ce67444b19b945e9919f1b85b38302640dabf62` | [JSON](inspectCoreScalarType-chromium.json), `02e64786fe0ffb78fce9b9f50a81955101838162e2b8199e2d336ebe0b139645` |
| Record members | [JSON](inspectCoreRecordMembers-node.json), `6024737f92023e0d7769e73adf0dfe9df0a5563106c53500da26a48e5d1c474f` | [JSON](inspectCoreRecordMembers-bun.json), `234db799368888b4f80318628a6785109c7626458f4dbb42ae2928b8429ea795` | [JSON](inspectCoreRecordMembers-chromium.json), `f2fc2075d151cc90858c4441dd5a82e90c469e275a84c3e268a01d932835b552` |
| Reference links | [JSON](inspectCoreReferenceLinks-node.json), `8578da4dfc97b5e4ad473cd5e105518ea26a94cc4543575c4f7cda629e507c37` | [JSON](inspectCoreReferenceLinks-bun.json), `7e33abdf2dc8dc98701b982409d50bb753ca97d76c51c005298dcccbeb5dc691` | [JSON](inspectCoreReferenceLinks-chromium.json), `c3f15bb4160b3e9664050ed9e21ee7261f6416314414525d2cb416859c53417a` |

## Broader installed replay and limits

The companion installed replay exercised 26 frozen predecessor cases (8
scalar-type, 9 record-members, 9 reference-links) on Node, Bun, and Chromium.
It verified the Node/Bun host error name, prototype, code, path, and message
against the explicit reference route. Chromium matched the frozen result
fields, requested WASM, and ran without Node globals. Missing and corrupt addon
controls refused import on Node and Bun. For a missing addon, Node returned
`Error` and Bun `ResolveMessage`; both reported `MODULE_NOT_FOUND`. The broad
receipt SHA-256 is
`e5511951cf06bb724bea03403755a5f48dee556757424b906fde6959004434ba`:
[core-inspectors-installed.json](core-inspectors-installed.json).

The package-root default/reference separation and bounded invocation controls
pass for this archive, but they do not close retirement. The six retirement
cases per host are narrower than complete CONTRACT-040 acceptance, and this
run covers only the macOS arm64 cohort. The prior source callsite audit is
pinned to the older `5e7138383` source closure; it is not a current-source
callsite review for later edits. Private TypeScript consumers and the retained
legacy raw-profile implementation also require an explicit current source-path
decision. The R8 `/2` validator accepts bounded evidence only and rejects it
for ledger retirement. No declaration is marked retired, and this receipt
does not qualify the complete SDK or release.

[`cohort-pins.json`](cohort-pins.json) preserves the machine-readable archive,
packet, receipt, and blocker summary (SHA-256
`a2307fda08a2948b7f88dffb75c7c211ceaded95d7ce8659715b89fde420df02`).
