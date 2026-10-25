---
ddx:
  id: umf.evidence.rust-migration.r8-semantic-reference-python.sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r8-semantic-reference-python
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-078
      kind: informed_by
    - id: CONTRACT-080
      kind: informed_by
---

# Independent Sol review: Python semantic reference slice

The six opt-in Python functions call direct Rust core operations through the
retained `NativeEngine`. I inspected the Python/PyO3 entrypoints and the new
staged Rust helpers. Each method preflights work before caller-value
conversion and uses one fresh Context for conversion, the engine-derived
policy registry, semantic execution, and output. Declaration admits types
before source/identity. Verification schema-checks and recomputes the receipt
before admitting current. The extension setter checks profile and target
before admitting its annotation. These corrections address two ordering
differences found in review. The derived kind-policy registry is rebuilt and
charged per invocation; immutable resources/Engine are retained by the
existing Python factory.

I independently checked SHA-256 hashes of the assembled wheel
`bb11b5a5…`, installed abi3 extension `ee0422ca…`, both fresh TypeScript
predecessor captures `e69af06d…` and `3f60e369…`, and all eight changed
source/test files against the evidence README. I independently imported the
wheel-installed package under CPython 3.14.0 and replayed six focused checks:
exact frozen inspection and declaration results, successful verification,
malformed receipt before current, invalid types before source/identity, and
zero-work refusal before source conversion. All passed. The implementing
agent's focused Rust suites report 11/11 core and 5/5 accessor tests; its
isolated wheel run invoked six Python test functions with a small
`pytest.raises` shim because pytest was unavailable. My smoke did not replay
all 16+16 frozen predecessor cases or the full Python suite.

This accepts the bounded opt-in Python API only for the tested CPython 3.14
arm64 cohort. The wheel was assembled and installed from a fresh native build;
the ordinary Hatchling build could not resolve its backend over the unavailable
network, so the official build hook, hosted 3.11–3.13 wheel/sdist matrix,
default Node/browser roots and release artifacts remain unqualified. The
`setSemanticTypes` `vocabularies: null` case still differs: TypeScript throws a
native `TypeError`, while Rust returns `SEMANTIC_TYPE_PROFILE`. Keep that
explicit blocker open before cross-host default selection or retirement.

## Expanded installed-wheel parity replay

I independently replayed the frozen 16-case core operation packet against the
same installed CPython 3.14 wheel. Fifteen outcomes matched exactly. The one
nonmatch passes JavaScript `undefined` as the required declaration argument:
Python has no corresponding value in this API, and `None` is the meaningful
clear request. Omitting the Python argument raises Python's ordinary required
argument `TypeError`; this is a language-surface distinction, not evidence
that Rust reproduces the JavaScript `NON_JSON` refusal. The representable
15-case core subset is exact for value, code, message and path.

I also replayed 15 extension-accessor cases against that wheel. Twelve exact
outcomes matched. The unknown-content setter preserved the expected
annotation, but I did not independently recompute its separate validation
diagnostics, so that case is only partially checked. `set_missing_annotation`
passes JavaScript `undefined` in the frozen predecessor; Python `None` is an
actual null annotation and produces a different document error.
`set_malformed_vocabulary_container` remains a genuine behavioral mismatch:
TypeScript throws a native `TypeError` for `vocabularies: null`, whereas Rust
returns `SEMANTIC_TYPE_PROFILE`. The packet's separate
`diagnostics_warning_order` operation was not replayed through these six
Python wrappers. This expanded local replay strengthens the bounded opt-in
claim but does not qualify the full 16+16 packet, other Python versions or a
default route.
