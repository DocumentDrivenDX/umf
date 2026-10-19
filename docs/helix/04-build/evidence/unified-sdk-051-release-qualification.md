---
ddx:
  id: umf.evidence.unified-sdk-051-release-qualification
  type: evidence
  activity: build
  status: complete
  authoring:
    home: repo
  links:
    - id: FEAT-033
      kind: informed_by
    - id: CONTRACT-079
      kind: informed_by
---

# UMF SDK 0.5.1 candidate qualification — 2026-10-19

This record qualifies the locally frozen SDK 0.5.1 candidate, official Python
core 0.10.0 and experimental `umf_access` 0.1.0.dev3 for their stated checks.
It does not record publication or full Truss stress qualification. The raw local
capture is `/private/tmp/umf-current010-release-20261019/qualification.json`;
the temporary capture is retained as the run source, while this file records its
release-relevant identity and results.

## Frozen source and artifacts

- UMF source commit: `4c9fb246729be9863f7da45876552a5575e9fc23`.
- Qualified Python source commit: `790c6b125faf8e59127a335246465d99058d406c`; no Python source changes occurred after it, and all 10 core-wheel and 49 host-wheel source-byte comparisons matched.
- SDK archive: `umf-sdk.tgz`, SHA-256 `4ade5b0ab89a5c36ccc1ef93b4c08d4a7eb7c8fcd78d3f5fa52a4d54eed0ecef`.
- SDK file manifest: SHA-256 `fbc53d94e546ef947cdd5ee2cc2b5c0c9847f6ab9d4ea9436e3240e45826605b`; all 1709 of 1709 manifest payload entries matched. The archive contains 1,715 regular files total, including the six additional package metadata/readme/manifest/license files; the receipt separately confirms all 3 license files are present.
- `umf_core-0.10.0-py3-none-any.whl`: SHA-256 `692271d23216241e60c83296ce70bdb1021928c1751362f55d4b120d6cb9acaa`; sdist SHA-256 `09a9f7a2df0b22b6a9ab11c788e7788b19ba44726c49efc21dd6e30ceae79ce1`.
- `umf_access-0.1.0.dev3-py3-none-any.whl`: SHA-256 `a631f9667f7a9d96d637ba6e1ff9dd92e543686bf2c4c5019c1f587d0810004d`; sdist SHA-256 `e57f07d1c457c733be18453b4166a025a1e3271d5f4f2e165b31d81b3ae7c599`.
- Native compiler: Weft source `fe3864c538bfab407ede0024f8366abb9b054c5e`, version 0.4.46; local wheel SHA-256 `a75b0d5572e19ff8737ec312dc2c26ce9be39896915e6238f7e612c2c34774f7`; native extension SHA-256 `b3facb8e6da592238529eb73759e3ad91eb8fcadbcf3c036a64cbe45a937520f`.

## Observed checks

- Fresh Bun consumer installation passed all 139 installed SDK conformance cases. The installed Python core suite passed 166 tests; host identity checks passed 7 tests and 20 subtests.
- Installed `umf_access` compatibility passed 58 runtime tests on Python 3.11 with Pydantic 2.13.5 and another 58 on Python 3.11 with Pydantic 2.14.1. Each probe verified that the installed payload matched the candidate wheel.
- Python 3.11 typing checks passed on the positive corpus with mypy strict, Pyright and ty. Each checker rejected the 11-site negative corpus (11 mypy, 12 Pyright and 11 ty diagnostics).
- Bun and Chromium generated identical candidate output for commerce and the original-derived current Praxis fixture (two browser cases passed).
- The final native access campaign passed three cases: the independent ontology-host case and actual commerce and current-Praxis table cases through the installed host, PostgreSQL 18, and the exact local Weft 0.4.46 candidate. Praxis exercised generated list, cursor and by-key reads, one consumer-owned `ChangeCoverageLevel` handler, then read-after-write using the returned consistency token. The two table cases are scoped evidence, not full Truss performance evidence.

The four release-gate test defaults were updated from Weft 0.4.45 to 0.4.46 without changing library or fixture source bytes. Their resulting SHA-256 values are:

| Test source | SHA-256 |
| --- | --- |
| `tests/access-praxis-binding.test.ts` | `3ae8be5a400cf6ad2173962c2afc1da0af585ea121fee74527d8f284aee04622` |
| `tests/access-unified.test.ts` | `f5d28bc0667acfd374eaca522333c6f39a56734a27b4afbc0b626e14f181a8af` |
| `tests/unified/praxis_binding.py` | `a2a7a6b0335311a62c808a207a7fcb8a43e9e7c63398c1454ea2d0666108f686` |
| `tests/unified/table_binding_e2e.py` | `593c37c61b415ae3e6ecde6b15403ebacc8af523813ac9fa1dca7a390b1a7658` |

## Boundaries and remaining release gates

Weft 0.4.46 is a local compiler candidate; published Weft 0.4.46 remains
pending. Truss's full stress matrix and its performance envelope remain pending.
Publication and final release-asset delivery verification remain pending, so
this is not a claim that the candidate has shipped. These checks do not qualify
production Praxis or Hohfeld adoption, many-valued table relationships, broader
relationship projection, sparse-record absence through nullable SQL tables,
handler execution, production authorization or commit policy. See the existing
[unified Python implementation evidence](unified-python-access.md),
[P1 compatibility evidence](praxis-p1.md), and
[current Praxis fixture and provenance](unified-praxis-current010/README.md)
for their separately scoped claims.

## Final 0.5.1 artifact and stack addendum — 2026-10-19

This addendum supersedes the earlier candidate-only and pending-publication
statements above for the exact SDK/core/host and native cohorts named here. The
earlier attempts and raw captures remain intact; the first native stack capture
is a real failed attempt caused by a stale expected Weft version, not a passing
receipt.

- The existing `umf-sdk.tgz` archive remains SHA-256
  `4ade5b0ab89a5c36ccc1ef93b4c08d4a7eb7c8fcd78d3f5fa52a4d54eed0ecef`.
  Its authoritative embedded file manifest is
  `/private/tmp/umf-051-final-artifacts-20261019/sdk-manifest.json`, SHA-256
  `fbc53d94e546ef947cdd5ee2cc2b5c0c9847f6ab9d4ea9436e3240e45826605b`.
  This exact manifest is the release receipt; a separate older sidecar is
  stale and must not be substituted. The recorded archive inventory has 1,715
  regular files, including 1,709 manifest payload entries; all payload entries
  matched, and the receipt confirms all three license files.
- The final metadata-only `umf_core` 0.10.0 wheel is
  `/private/tmp/umf-051-final-artifacts-20261019/core/umf_core-0.10.0-py3-none-any.whl`,
  SHA-256 `49633924b45a3c8499d4fcc1a24c30d5a8fcb34d974ab019bbda987cb47da0f9`.
  Its 20 runtime payload files are byte-identical to the previously qualified
  wheel (`692271d23216241e60c83296ce70bdb1021928c1751362f55d4b120d6cb9acaa`);
  this rebuild changes package metadata only.
- The final `umf_access` 0.1.0.dev3 current-UMF-0.10 host wheel is
  `/private/tmp/umf-current010-release-20261019/host-dev3-current010/umf_access-0.1.0.dev3-py3-none-any.whl`,
  SHA-256 `9c53221fa17deefb1a205a53a1d03aba94daab08e1a6fa83aa62d67cfd57b243`.
  Its build receipt identifies source `4fc64adf3`, matches all 50 checked
  files, and records four installed compiler-transport tests. The tested
  published stack is Weft 0.4.47 and Truss 0.0.40 on local macOS ARM64 with
  PostgreSQL 18.6.
- The initial native capture at
  `/private/tmp/umf-051-published-stack-native.log` records the independent
  ontology-host and Praxis cases passing, then a commerce case failing only
  because its assertion still expected Weft 0.4.46 while the installed,
  published compiler reported 0.4.47. The corrected commerce gate and reviewed
  read/transport capture at `/private/tmp/umf-051-published-stack-affected.log`
  and `.json` pass: commerce passes against Weft 0.4.47; 23 reviewed tests pass
  and two tests explicitly skip because the generated reporting fixture is not
  available. Together with the two passing cases from the first capture, the
  three native stack cases pass. This is scoped integration evidence, not the
  complete Praxis lifecycle or full Truss stress qualification.
- `/private/tmp/umf-051-final-pydantic-compatibility.json` records 58 installed
  host tests passing under Python 3.11/Pydantic 2.13.5 and another 58 passing
  under Python 3.11/Pydantic 2.14.1. Both runs verified installed wheel bytes;
  exact decimal handling, missing-versus-null behavior, and the listed
  refusal cases passed. The second run records Pydantic Core 2.50.1; the first
  records 2.46.5.
- The current-source microsite cleanup removes the retired pre-0.10 action
  compiler demo while retaining historical native-owner source/assets in the
  archive. Its current generated catalog contains 28 packs and 313 entries;
  four focused tests pass with 47 assertions. The current page inventory gate
  passes for 21 pages. No published microsite claim or signer activation is
  recorded here.

The broader Praxis per-call lifecycle, genuine sync/async native adapters,
pool/fork/cancellation matrix, complete frozen dependency lock, and managed
service acceptance remain open. Bun-free generation/index qualification is
also not claimed by this record. The evidence above does not close FEAT-033's
broader adoption requirements or assert production Praxis/Hohfeld behavior.

## Final import-lint correction

The automatic Python run on `57e68afed` passed its tests, then reported 14
Ruff findings. The final correction sorts/coalesces imports and preserves the
three intentional `MISSING` public re-exports with line-local PLC0414 annotations.
Independent review confirms identical non-import AST in all 12 changed Python
files and no new import-cycle or initialization dependency. Ruff 0.17.1 is clean.

The rebuilt host wheel supersedes `9c53221f…` above: SHA-256 `972f5751956433471b70a63e6c5df07a2df421264ed685b3862a2271089d4441`.
All 50 packaged files match source and the installed wheel; only six runtime
files differ from the native-qualified parent through imports/comments. Final
installed compatibility passes 58 tests with each Pydantic version, all four
actual published-Weft 0.4.47 transport tests pass, and isolated catalog import
passes. The earlier native results retain their parent-wheel identity. No
unrelated native or stress campaign is repeated for this bounded lint delta.
