# Migration portable pin refresh source review

Verdict: **ACCEPT the bounded 13-row portable source-pin edit and one-line golden update only; execution remains HOLD.** Reviewed HEAD28666c2e8aa72bddcf8e18981ec5be987b65f6ce. Final expected-pins.sha256 SHA-2567eafebd7daff390ada426d9ab2faa99062619208979874458870cfe6da683534 and combined workflow SHA-256e233fad1bebfdfb11ab768d641919fbd0a802e118b2453a9b53c4c5c7bd2fb74 were independently confirmed after the owner stopped editing. Exactly96 paths remain, with no additions/removals; exactly13 expected values changed. Every changed value equals the corresponding actual reviewed file bytes.

The combined workflow's only working-tree delta is the accounted companion reproduction golden42218d88→314cac84. It does not alter test rosters, caps, deadlines, dispatch or the all-row `sha256sum -c qualification-inputs/expected-pins.sha256` preflight. That golden follows the actual Stage-A output reviewed in cb7a1e41 and adoption63762, not an arbitrary current hash.

Authorized portable/source provenance set:

```
63b0171e644b5ce2d7a10d97393cee5e67a45c6abc03da8144de65a0e1a54c28  scripts/metamodel/structural-accounting.ts
32d66948460ea7f6118082af70ea80bf563a6c67b5bef6eb441a25f0c97731c1  scripts/qualification/r2-metering-generate.ts
a5ccae9ac6b67813282906f6c230dcc89caf79cd1072b1f62d115b780d3aefae  scripts/r2-metering-browser.ts
314cac8416711899285bc3f1a734765d557f7446f7ab0cf58d3dbd2a7dfdd81e  src/generated/core-validators-accounted.ts
3ed5b7be586477a058cba9b28f87b7f36f541daf36153c260bdda4b5b2e5eb01  src/index.ts
b1d9bc132fefd0f523e72c2d272301cfd69c385340f26bdc6e2c69f30d1aecd4  src/validation/document.ts
82fc26c02172786527e10fd870bb0533de9b03eb146dddb6b30d07d7269f448c  tests/metamodel/r2-metering-browser-entry.ts
9c3ebc13f216bbbc3818dab66052978bf2416bf9d4f731b5400d57f4d8e67ea9  tests/metamodel/structural-accounting-parity.test.ts
4a88fd9bc398c56d71e535841322dcf10d2851e16b026c14679e2d79062e90a7  src/generated/core-validators.ts
bdcf1c6b8a197dfbd769ea47a879eaabeeb1d71cc00cab1f9e600175354c5da7  spec/core/schema.json
48def42448706bbdfe68c458746d23610767feae0da6456735674524b8018887  spec/core/semantic-type-reference.schema.json
a4f4694b3ae32ef47a898f49fdce969b890f1ac901fc6747a43cb8c9c6c77c35  spec/core/extension-package.schema.json
e233fad1bebfdfb11ab768d641919fbd0a802e118b2453a9b53c4c5c7bd2fb74  .github/workflows/combined-migration-qualification.yml
```

The closed transformer/current schemas/ordinary validator/document dispatch/parity controls come from the reviewed main reconciliation and bounded Stage-A source checkpoint2360e5fc. The driver branch delta is accepted in1ee30bf5, with original integrity/caps retained. Browser entry+runner extend139+2 by15 structural extension-kind document vectors (expected156) under cfd62aeb; they are source-reviewed, not newly executed here. The accounted companion is the actual314cac84 emitted artifact/output acceptancecb7a1e41. The src/index.ts difference is the exact accepted upstream main addition exporting model/extension-kinds; read-only merge metadata and its one-line source diff establish this provenance. The four schema/ordinary-validator pins match accepted current main and the actual emitted generation input manifest; no old generated schema output is silently retained. The malformed transient extension-package hash was corrected to actual a4f4694b3ae32ef47a898f49fdce969b890f1ac901fc6747a43cb8c9c6c77c35 before this acceptance.

Exactly eight remaining stale rows, deliberately NOT authorized for replacement by this portable edit:

```
tests/lifecycle/g03-defaults-native.py
  expected ffb5c1b50daec8b8b7ab6857d9149654dd75b13f785446465fd4389bdec9a088
  actual   361f250158e10ade881e78baf480d534e0b27ecf6c70062b9955e2110e23c0ed
.github/workflows/python.yml
  expected c304b0da6c9c5cab38284b1b0079614488acfaa58f941c51188c00f478b71e16
  actual   a35b50cc37b3169ee2e7d27054662f5e78a836967378f36bd9dab802dbe0642f
.github/workflows/sql-containment.yml
  expected f5cd800a6fa0913061a091ea71e0a036ccc8302c9245d4f1df70dd6fe6c34a30
  actual   a918a625d62a39372eb176bade5d92f7e1fc78c82d54c29577f0e51e88262d52
.github/workflows/actions.yml
  expected f375d5c3aec3b84fa2f49bd20549f342d312ba7468c338a4be01a4a160739589
  actual   0de61410bd78e34587121c6c1faa4d87f29d37f36776033d2ac5954baad07d3c
.github/workflows/rust-core.yml
  expected d862f32c58c330a5f3b8de77fd48dc067dd477f96d36c7321ac4ceb0e1e0e8a0
  actual   4401e44a491c459790e5c079c4d8c865a0332e425688918310b2b6048383248e
.github/workflows/rust-spike.yml
  expected ae9093d505394efa6f4c38966f31c943ffeb39f0f4b9b570554157dfb2d85c39
  actual   e5295c36e259dad84edad9489bfa9c7a2fc8eaa178a1d79563892a55cf08dbb3
.github/workflows/pypi.yml
  expected d921132f460f1ab3fbf42621d3af2f558682d1438e2343e80a64862096b3bc81
  actual   8169c32c74f93c5c939fcf1c019c71942183844a37c432688e827cbc055590d1
.github/workflows/access-boundaries.yml
  expected 35c86557eb90b458b15d1319e089f64883e3de682eea6edc6a756a5f09183664
  actual   b67fabb828b251040a73187c7c4cb965f4a5e6f6407062e9678efbf2a29e2a31
```

Disposition: g03-defaults-native.py is the separately source-reviewed five-domain split361f2501 (cfd62aeb); it is native-only provenance, not a portable test or native qualification. Its expected row remains unchanged here and gives no dispatch authority. Native current-source pins and actual native continuation require their own bounded accepted cohort/ticket.

The seven workflow hashes are dependency/trigger-roster metadata, not portable product inputs to silently absorb. Python/sql-containment/actions/rust-core/rust-spike reflect already reviewed exact branch-ignore unions preserving tags/PRs (a560f29a). Access-boundaries additionally contains the accepted four-line Rust1.90.0 source-dbapi isolation fix (2803ef79), with no native success claim; its migration merge naturally has a different complete-file hash from the standalone Core file. Pypi is exact accepted main's shared verify_python_artifacts.py invocation replacing the inline verifier, as shown by read-only main-merge metadata/source diff. Future correction can be a separate explicit workflow-provenance-only pin decision from those exact parent images and recorded receipts, without executing or modifying their gates. None of those seven expected hashes is blessed for replacement by this review.

The all96-row preflight is currently guaranteed to refuse on those eight mismatches. Do not run, claim preflight PASS, drop rows, bypass the check, or mix a bulk current-hash refresh into the accepted portable edit. Root must obtain the separate concrete pin disposition before a qualification dispatch. Existing generated-output byte-copy acceptancea29f22bf remains bounded to artifacts, with no full merged qualification, native support or release/currentness claim.

No product/source edits, imports, AST/typecheck, runtime/tests, Git mutations or native probes were performed. Read-only Git metadata/diffs and stdlib hash comparisons only. Automatic-review rejection is preserved; this receipt authorizes only the concrete reviewed portable subset and does not bypass that rejection for unrelated rows.
