---
ddx:
  id: umf.evidence.rust-migration.r8-captured-logical-render
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
      kind: extends
    - id: umf.evidence.rust-migration.r8-catalog-compiler-boundary
      kind: references
---

# R8 pre-Weft logical-render boundary probe

This probe asks whether the three successful captures in the frozen R8
declaration cohort can be rendered by `umf_access.dsl.render.render_logical`
without Weft. The observed answer is no: all four captured variants refuse
before producing a logical request. This is a predecessor behavior packet and a
boundary finding, not a Rust implementation or an SQL/backend claim.

## Contract boundary

[CONTRACT-067](../../../../02-design/contracts/CONTRACT-067-access-sdk-generator.md)
keeps stage-one source/package custody and stage-two publication in the host.
[CONTRACT-070](../../../../02-design/contracts/CONTRACT-070-access-extension.md)
defines authored source and native column facts. [CONTRACT-071](../../../../02-design/contracts/CONTRACT-071-query-command-catalog.md)
assigns SQL dialect lowering, backend acceptance, parameter carriers and result
decoders to Weft, while permitting UMF to prepare the logical input before that
boundary. [CONTRACT-072](../../../../02-design/contracts/CONTRACT-072-runtime-targets.md)
separates compiler work from runtime targets and connections. The
[captured-declaration evidence](../r8-captured-declarations/README.md) freezes
the exact input DTO used here.

## Observation and blocker

[`logical-render-v1.json`](../../../../../../python/umf_access/tests/fixtures/rust-catalog-capture/logical-render-v1.json)
has SHA-256 `af737cbfdc02a6c3e80dcbc951ab412e84581dea67f03e1eb966b6a59baffc0e`.
Its input pin is captured-declaration packet SHA-256
`d4fe1110433c3b144ea8f29d391b72dd84c156b1f8984b4db414c1de6d5b933e`.
Observed variants are `direct` (no optional presence), `filtered` (no optional
presence), and `optional` (absent and present). Each returns the same exact
Python refusal:

```text
CAPTURE_UNSUPPORTED: Record requires authored namespace and logical name
```

The captured `RecordRef` preserves `module="billing"` and `element="Invoice"`
but has `logical_namespace: null` and `logical_name: null`. The captured key
`FieldRef` also has `logical_name: null`. The renderer explicitly requires an
authored logical namespace/name and refuses at the Record check before reaching
field rendering. Inferring logical identity from physical module/element values
would add meaning not provided by the capture source, so the DTO does not supply
a successful render input. The other missing authored field name may be a later
refusal, but this packet does not claim or observe that ordering because the
Record refusal occurs first.

Therefore this cohort does not yet establish a positive pure pre-Weft request
boundary. To probe that boundary, a successor fixture must explicitly author
the logical Record namespace/name and logical field names, capture those values,
and freeze the resulting strings or exact subsequent refusals. For joined
queries, the renderer additionally requires a generated binding containing
relationship pairs and target tables; no such query is in this cohort. None of
these observations establishes Weft acceptance, native SQL, backend semantics,
or compiler equivalence.

## Reproduction

From repository root, with the local pinned Python environment:

```sh
python/.venv/bin/python scripts/rust-migration/r8/captured-logical-render-predecessor.py
python/.venv/bin/python scripts/rust-migration/r8/captured-logical-render-predecessor.py --check
PYTHONPATH=python/umf_access/src python/.venv/bin/python -m unittest python/umf_access/tests/test_captured_logical_render_predecessor.py -q
```

The packet check and focused assertion pass. The runner captures each live
Python refusal with exact code/message and pins the input capture JSON plus
`capture.py`, `render.py`, and declaration source. It emits no request text for
these refusals. It is not an independent native check.

## Source pins

| File | SHA-256 |
| --- | --- |
| `python/umf_access/tests/fixtures/rust-catalog-capture/declarations-v1.json` | `d4fe1110433c3b144ea8f29d391b72dd84c156b1f8984b4db414c1de6d5b933e` |
| `python/umf_access/tests/fixtures/rust-catalog-capture/logical-render-v1.json` | `af737cbfdc02a6c3e80dcbc951ab412e84581dea67f03e1eb966b6a59baffc0e` |
| `python/umf_access/src/umf_access/capture.py` | `492f68954ca66f3fbd15eb008f7e1d6fa690829d9c31e3ec3d85ecb09a7e67a6` |
| `python/umf_access/src/umf_access/dsl/render.py` | `8e57926de9cb62d499e549e5edf575d93220c5e0f460fb376a475e774d9c845b` |
| `python/umf_access/tests/captured_declaration_predecessor.py` | `d377f01569b0c8027dc8f145e56c689e0cb3d24faba86a79abb71c7a723629f4` |
| `scripts/rust-migration/r8/captured-logical-render-predecessor.py` | `21cb1dfd9c155fd176285fc09751911c420386df89c29ec99cac424329655009` |
| `python/umf_access/tests/test_captured_logical_render_predecessor.py` | `2d1725684c2b6c0c9fc0e45e3e9fdb107a7de17c8db9d4d375cb7da398087cb0` |
| `CONTRACT-067-access-sdk-generator.md` | `1f778f6de97e65e3b18e80b446c3b1d46c298f91433921fb2992ca025c5f9637` |
| `CONTRACT-070-access-extension.md` | `6e8e6f428c968b30fc84fe4a73d9c761e1bda18240d33c7fa746e8afd3a8110f` |
| `CONTRACT-071-query-command-catalog.md` | `f02ef333f0eb8dc42ac69dffc8da3fdd721d15937178d9ad2a777f3bbab6e625` |
| `CONTRACT-072-runtime-targets.md` | `ca6c19fe92d56550d2cb5a16833705b9cbcda70a39da63ab266f5b0161960f97` |
