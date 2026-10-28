---
ddx:
  id: umf.evidence.rust-migration.target-pin-python-predecessor-20261028
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: CONTRACT-071
      kind: informed_by
    - id: CONTRACT-072
      kind: informed_by
---

# Direct Python `TargetPin.matches` predecessor packet

This packet freezes 13 direct calls to the current `TargetPin.matches` implementation
in `python/umf_access/src/umf_access/catalog.py`. It covers equality of all five
identity fields, equality of platform-component counts, name containment, version
sets, and duplicate/missing names. The source digest and complete case inventory
are recorded in [packet.json](packet.json).

The accepted cases show exact equality for `kind`, `backend_id`,
`backend_version`, `target_profile` and `binding_sha256`. A platform version is
accepted when it is in the configured set for that name. Different component
counts, unknown names and unqualified versions fail. The frozen packet also
records the implementation's duplicate-name edge: two observed entries named
`driver` can match a two-entry pin containing `driver` and `server`, while the
`server` component is absent. This follows from equal tuple lengths followed by
per-observed-entry containment in a dictionary; it does not establish one-to-one
name correspondence. This edge is recorded as observed behavior, not endorsed
as desired matching policy.

The capture/check harness is
[`capture_target_pin_predecessor.py`](../../../../../../scripts/rust-migration/capture_target_pin_predecessor.py).
Run from the repository root with the Python 3.13 project environment:

```sh
python/.venv/bin/python scripts/rust-migration/capture_target_pin_predecessor.py --check
PYTHONPATH=python/umf_access/src python/.venv/bin/python -m unittest python/umf_access/tests/test_target_pin_predecessor.py
```

The focused test checks source-digest freshness and replays each frozen case
against the direct Python method. The capture reported 13/13 expected results;
the focused unittest passed under CPython 3.13.16.

Scope is strictly the current Python `TargetPin.matches` source and these cases.
`ReadPlan.bind`, host-call ordering, target dispatch, artifact calls and Pydantic
construction are outside this packet. It makes no claim about Rust parity,
installed routing or any Rust implementation.
