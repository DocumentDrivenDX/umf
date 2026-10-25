---
ddx:
  id: umf.evidence.rust-migration.r8-captured-logical-render-positive
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-067
      kind: informed_by
    - id: CONTRACT-070
      kind: informed_by
    - id: CONTRACT-071
      kind: informed_by
    - id: CONTRACT-072
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-captured-declarations
      kind: references
    - id: umf.evidence.rust-migration.r8-captured-logical-render
      kind: extends
---

# R8 positive pre-Weft logical-render cohort

This successor cohort makes the authored logical Record and Field identities
explicit in public `RecordRef` and `FieldRef` constructors. It freezes the live
Python capture values and `render_logical()` outputs before Weft. The resulting
strings are UMF's logical request text, not native SQL; the evidence does not
claim Weft acceptance, backend semantics, or execution.

## Contract boundary and relation to negative evidence

[CONTRACT-067](../../../../02-design/contracts/CONTRACT-067-access-sdk-generator.md)
retains package/file custody in the build host. [CONTRACT-070](../../../../02-design/contracts/CONTRACT-070-access-extension.md)
provides the authored source and column facts. [CONTRACT-071](../../../../02-design/contracts/CONTRACT-071-query-command-catalog.md)
keeps dialect/backend lowering, carrier mapping, and result decoding with Weft,
while the deterministic logical request precedes that compiler boundary.
[CONTRACT-072](../../../../02-design/contracts/CONTRACT-072-runtime-targets.md)
separates this build-time transformation from runtime target and connection
ownership.

The authored fixture
[`captured_logical_render_predecessor.py`](../../../../../../python/umf_access/tests/captured_logical_render_predecessor.py)
uses `logical_namespace="com.example.billing"`, `logical_name="Invoice"`,
Field logical names `invoiceId` and `status`, and otherwise matches the minimal
direct/filter/optional declaration shapes. It does not infer these values from
`module="billing"` or `element="Invoice"`. The prior refusal packet remains
unchanged at SHA-256
`af737cbfdc02a6c3e80dcbc951ab412e84581dea67f03e1eb966b6a59baffc0e`; its missing
authored identity refusal is documented in the [negative probe](../r8-captured-logical-render/README.md).

## Frozen observations

The versioned packet
[`logical-render-positive-v1.json`](../../../../../../python/umf_access/tests/fixtures/rust-catalog-capture/logical-render-positive-v1.json)
has SHA-256 `08ea0f4a70292be9b363c3d0c554708d212af3442673bf41be96c086bcc811e4`.
It includes complete tagged `CapturedDeclaration` values, all rendered variants,
and one exact capture-stage refusal. The observations are:

| Declaration | Capture | Presence | `render_logical` observation |
| --- | --- | --- | --- |
| `direct` | captured | none | `SELECT "r".* FROM "com.example.billing"."Invoice" AS "r" LIMIT 4` |
| `filtered` | captured | none | `SELECT "r".* FROM "com.example.billing"."Invoice" AS "r" WHERE "r"."status" = :value LIMIT 4` |
| `optional` | captured | absent | `SELECT "r".* FROM "com.example.billing"."Invoice" AS "r" LIMIT 4` |
| `optional` | captured | present (`value`) | `SELECT "r".* FROM "com.example.billing"."Invoice" AS "r" WHERE "r"."status" = :value LIMIT 4` |
| `unsupported_result` | refused | — | `CAPTURE_UNSUPPORTED: declaration must return a DSL terminal` |

The last row is refused by `capture()` and never reaches rendering. The four
successful variants render without binding context because none contains a
join. This establishes a narrow deterministic pre-Weft output boundary for this
cohort. It does not cover join binding resolution, Pydantic projections, engine
profiles, related-key behavior, command/action lowering, Weft refusal ordering,
or backend grammar acceptance.

## Reproduction

```sh
python/.venv/bin/python scripts/rust-migration/r8/captured-logical-render-positive.py
python/.venv/bin/python scripts/rust-migration/r8/captured-logical-render-positive.py --check
python/.venv/bin/python scripts/rust-migration/r8/captured-logical-render-predecessor.py --check
PYTHONPATH=python/umf_access/src python/.venv/bin/python -m unittest python/umf_access/tests/test_captured_logical_render_positive.py python/umf_access/tests/test_captured_logical_render_predecessor.py -q
```

Both packet checks passed, the earlier negative packet check still passes, and
the focused tests passed three tests. These checks are live Python predecessor
replays. No Rust comparison or installed-wheel qualification is claimed.

## Source pins

| File | SHA-256 |
| --- | --- |
| `python/umf_access/src/umf_access/capture.py` | `492f68954ca66f3fbd15eb008f7e1d6fa690829d9c31e3ec3d85ecb09a7e67a6` |
| `python/umf_access/src/umf_access/dsl/render.py` | `8e57926de9cb62d499e549e5edf575d93220c5e0f460fb376a475e774d9c845b` |
| `python/umf_access/tests/captured_logical_render_predecessor.py` | `3f74f69986babab111a6a00ea5cc79060eb46662ef4aa7833cb227cef1aa8895` |
| `scripts/rust-migration/r8/captured-logical-render-positive.py` | `01181f4adf32b726f54b0f74e8651ec01a2b9e2fdfcf664b895b293da388e5c6` |
| `python/umf_access/tests/fixtures/rust-catalog-capture/logical-render-positive-v1.json` | `08ea0f4a70292be9b363c3d0c554708d212af3442673bf41be96c086bcc811e4` |
| `python/umf_access/tests/test_captured_logical_render_positive.py` | `bb6eef710a9d1d2a27c661eff4fa9c115fbbc99a6b787cbb98bab8c3bde2d2d1` |
| `python/umf_access/tests/fixtures/rust-catalog-capture/logical-render-v1.json` | `af737cbfdc02a6c3e80dcbc951ab412e84581dea67f03e1eb966b6a59baffc0e` |
| `CONTRACT-067-access-sdk-generator.md` | `1f778f6de97e65e3b18e80b446c3b1d46c298f91433921fb2992ca025c5f9637` |
| `CONTRACT-070-access-extension.md` | `6e8e6f428c968b30fc84fe4a73d9c761e1bda18240d33c7fa746e8afd3a8110f` |
| `CONTRACT-071-query-command-catalog.md` | `f02ef333f0eb8dc42ac69dffc8da3fdd721d15937178d9ad2a777f3bbab6e625` |
| `CONTRACT-072-runtime-targets.md` | `ca6c19fe92d56550d2cb5a16833705b9cbcda70a39da63ab266f5b0161960f97` |
