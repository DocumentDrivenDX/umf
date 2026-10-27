---
ddx:
  id: umf.evidence.rust-migration.r8-postgres-search-rrf-20261027
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-074
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-python-access-semantic-ownership-decision
      kind: informed_by
---

# R8 PostgreSQL search fusion Python predecessor freeze

[`predecessor.json`](predecessor.json) captures nine direct `_finish` cases
from the current Python implementation. Run
[`postgres-search-rrf-predecessor.py`](../../../../../../scripts/rust-migration/r8/postgres-search-rrf-predecessor.py)
from the repository root with Python 3 to regenerate the packet and execute
its focused assertions.

The cases freeze single-leg truncation and rank assignment, no-fusion arity
refusal, RRF accumulation across ranks and legs, complete-key tie order,
Python equality behavior for duplicate keys, exact divergent-row refusal,
empty legs, target-defined refusal, native score values, and approximate /
partial flag aggregation. Every emitted float includes both its JSON number and
Python `float.hex()` representation. Each case also records all replay inputs:
fusion kind, constant, top-K, per-entry flags, and each leg's ordered key
components, item label, and native score. Event traces record row equality and
the ordered access to each entry artifact for result flags; the disagreement
case also freezes that equality refusal occurs before artifact access. The
ninth case records that the DSL admits positive integer `rrf(k=10**400)`, while
Python `_finish` raises `OverflowError: int too large to convert to float`
during reciprocal scoring. This remains a default-route parity gate: Rust
integration must preserve the reviewed predecessor outcome or explicitly
reconcile the admitted constant bound before route selection.

The eventual Rust boundary remains limited to pure scoring and ordering over
admitted rank/key observations. Python retains database execution, decoding,
Pydantic row construction, row equality, and hydration. This packet does not
claim Rust parity, installed behavior, PostgreSQL qualification, or default
routing. Python 3.13.16 generated and validated the packet. Its SHA-256 is
`3e4467f63ff324c35fe4b46824a75d830608a03bf3ee08f722e85ddc370243a1`; the
generator SHA-256 is
`a9ade65c8b76ef0b2424688cef9a2646544aa534203227482d4f3ce264b2bd85`.
