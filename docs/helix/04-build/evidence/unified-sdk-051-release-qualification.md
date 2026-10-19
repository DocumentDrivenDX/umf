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
