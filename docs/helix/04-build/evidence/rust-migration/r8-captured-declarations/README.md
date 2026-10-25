---
ddx:
  id: umf.evidence.rust-migration.r8-captured-declarations
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
    - id: umf.evidence.rust-migration.r8-catalog-compiler-boundary
      kind: extends
    - id: umf.evidence.rust-migration.r6-catalog-source-join
      kind: references
---

# R8 captured-declaration predecessor packet

This evidence freezes a small actual `umf_access` declaration capture boundary
as versioned inert JSON. It does not implement a Rust port or claim compiler
parity. The selected trusted Python functions run through the existing
`capture()` function; their result ends at `CapturedDeclaration`. No model/source
correspondence, logical request, Weft call, SQL, or catalog output is included.

## Scope and source boundary

[CONTRACT-067](../../../../02-design/contracts/CONTRACT-067-access-sdk-generator.md)
keeps package and catalog file custody in the build host.
[CONTRACT-070](../../../../02-design/contracts/CONTRACT-070-access-extension.md)
defines authored source/column facts, without assigning physical storage
selection to UMF. [CONTRACT-071](../../../../02-design/contracts/CONTRACT-071-query-command-catalog.md)
selects trusted Python declaration modules at build time and assigns SQL
dialect/backend lowering, carriers, and result decoders to Weft. [CONTRACT-072](../../../../02-design/contracts/CONTRACT-072-runtime-targets.md)
keeps runtime targets and driver connections separate from this compiler stage.
The [R8 compiler boundary audit](../r8-catalog-compiler-boundary/README.md)
identifies capture as Python reflection/execution and the first possible
pre-Weft semantic boundary only after a stable inert representation exists.

The fixture module contains four explicitly decorated declarations over a
minimal `Invoice` record: direct bounded read, parameterized filter, optional
filter with presence expansion, and an unsupported return value. This is an
authored Python declaration fixture using the public UMF DSL. It is not a
generated-package or installed-wheel cohort. The packet preserves class and
dataclass identities with tagged JSON objects, type carriers with tagged typing
objects, and absence sentinels as explicit tags. Every dataclass field is
retained, including nullable `alias: null`; tuple/list/frozenset container types
are tagged instead of collapsed. Focused tests check null aliases and a captured
tuple tag. Its format is
`umf-access-captured-declarations/1`.

## Frozen observations

The packet
[`declarations-v1.json`](../../../../../../python/umf_access/tests/fixtures/rust-catalog-capture/declarations-v1.json)
has SHA-256 `d4fe1110433c3b144ea8f29d391b72dd84c156b1f8984b4db414c1de6d5b933e`.
It records three captures (`direct`, `filtered`, `optional`) and one refusal
(`unsupported_result`, `CAPTURE_UNSUPPORTED`, exact message retained). The
optional declaration has both absent and present variants. The source packet
pins the capture implementation and declaration module; the evidence pins the
packet and generator as well.

The deterministic encoder is test/evidence tooling, not a production API or
proposed Rust wire contract. A future Rust candidate must first accept this
versioned DTO and compare semantics/refusal order against the live Python
predecessor. Capture itself still executes trusted Python callbacks, inspects
annotations, and can reject nondeterministic captures. The packet does not
establish behavior for commands/action references, Pydantic Key identities,
related-key captures, aliases, aggregates, pagination provenance, engines,
source correspondence, or compiler refusals.

## Reproduction

From the repository root, with the pinned local Python environment already
installed:

```sh
python/.venv/bin/python scripts/rust-migration/r8/captured-declarations-predecessor.py
python/.venv/bin/python scripts/rust-migration/r8/captured-declarations-predecessor.py --check
PYTHONPATH=python/umf_access/src python/.venv/bin/python -m unittest python/umf_access/tests/test_captured_declaration_predecessor.py python/umf_access/tests/test_capture.py -q
```

The `--check` mode re-runs the trusted declarations and requires byte-identical
JSON, including current source hashes. The focused packet assertion and capture
suite passed 19 tests in this environment. These checks qualify only the frozen
Python observation and existing capture behavior; there is no independent
native implementation yet.

## Source pins

| File | SHA-256 |
| --- | --- |
| `python/umf_access/src/umf_access/capture.py` | `492f68954ca66f3fbd15eb008f7e1d6fa690829d9c31e3ec3d85ecb09a7e67a6` |
| `python/umf_access/tests/captured_declaration_predecessor.py` | `d377f01569b0c8027dc8f145e56c689e0cb3d24faba86a79abb71c7a723629f4` |
| `scripts/rust-migration/r8/captured-declarations-predecessor.py` | `d40cf93ceb0e1356705787900994970feb662758173e1ef68374bf71c003f57e` |
| `python/umf_access/tests/test_captured_declaration_predecessor.py` | `c7e393fbdfd835d77ebaf38ca5ab84fcb59dc90c98e07299d02792ce839e813e` |
| `python/umf_access/tests/fixtures/rust-catalog-capture/declarations-v1.json` | `d4fe1110433c3b144ea8f29d391b72dd84c156b1f8984b4db414c1de6d5b933e` |
| `CONTRACT-067-access-sdk-generator.md` | `1f778f6de97e65e3b18e80b446c3b1d46c298f91433921fb2992ca025c5f9637` |
| `CONTRACT-070-access-extension.md` | `6e8e6f428c968b30fc84fe4a73d9c761e1bda18240d33c7fa746e8afd3a8110f` |
| `CONTRACT-071-query-command-catalog.md` | `f02ef333f0eb8dc42ac69dffc8da3fdd721d15937178d9ad2a777f3bbab6e625` |
| `CONTRACT-072-runtime-targets.md` | `ca6c19fe92d56550d2cb5a16833705b9cbcda70a39da63ab266f5b0161960f97` |

The R6 [source-membership predecessor](../../../../../../python/umf_access/tests/fixtures/rust-catalog-source-join/predecessor.json)
remains a separate post-filesystem packet. It is not joined to this capture
packet and does not expand its semantics.
