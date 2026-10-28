---
ddx:
  id: umf.evidence.rust-migration.read-plan-bind-python-predecessor-20261028
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
    - id: umf.evidence.rust-migration.target-pin-python-predecessor-20261028
      kind: informed_by
---

# Direct Python `ReadPlan.bind` predecessor packet

This packet records direct calls to the current Python `ReadPlan.bind` in
`python/umf_access/src/umf_access/catalog.py`. It freezes returned selection,
exception class/message, and ordered host observations around the direct
`TargetPin.matches` call. The cases and source/harness digests are in
[packet.json](packet.json); the executable replay is
[`test_read_plan_bind_predecessor.py`](../../../../../../python/umf_access/tests/test_read_plan_bind_predecessor.py).

The successful two-variant trace establishes this order: `artifact()` for each
variant in declaration order; one `target.identity()` call; platform observation
inside matching; a second `artifact()` call for the selected variant; then
parameter model construction. A nonmatching pin still observes the target
platform as matching proceeds. An artifact failure prevents target identity
observation; an identity failure occurs after all initial artifact calls; an
argument-inventory error occurs before any host calls. The platform-failure case
shows its exception propagates after one platform property read. These are
observed Python predecessor boundaries, not proposed Rust behavior.

The packet deliberately retains the current `TargetPin.matches` implementation
and its observed semantics, including the duplicate-name edge documented by the
[direct matcher packet](../target-pin-python-predecessor-20261028/README.md).
It does not choose duplicate-name policy, change the Python default route, or
claim Rust parity or broader catalog qualification.

Run from the repository root with the Python 3.13 project environment:

```sh
PYTHONPATH=python/umf_access/src python/.venv/bin/python -m unittest python/umf_access/tests/test_read_plan_bind_predecessor.py
```

The focused unittest passes and checks both source freshness and the exact
frozen outcomes/traces.
