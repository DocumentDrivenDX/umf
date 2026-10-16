# B-TP-001 bounded compatibility qualification

Authoritative specifications: dd7b81f6bb5aa6a08cb97bb8c4882eed683dcaba.
Implementation authorized by the owner waiver in the coordinating Execution Contract.
This subtree is owned by the compatibility session. Historical spike files one
directory above are unchanged.

## Shared isolated environment

`/private/tmp/umf-tp001-compat-env/bin/python` is Python 3.14.8 with
Pydantic 2.14.1, pyright 1.1.414 and mypy 2.4.0. The profile pins every installed
transitive distribution and both checker configurations. Checker language target
is Python 3.12; Python 3.12 execution compatibility is UNTESTED.
The temporary environment is host state; recreate it from profile.json pins.
Use `MYPY_CACHE_DIR=/private/tmp/umf-tp001-mypy-cache` when invoking mypy manually.
The runner supplies that setting and pyright's exact Python environment.

## Bounded emitted-fixture qualification

`emit_fixture.py` emits `generated/models.py` from the explicitly bounded
`fixture.json` and trusted fixed query scaffolding, plus explicit catalog call
signatures. It also builds the deterministic pure-Python runtime fixture wheel
under `artifacts/`. The exact wheel is installed in the isolated environment as
`umf-access==0.0.0+tp001.spike`, with `umf-access-runtime/0.1` declared only for
this minimal spike surface. The runner verifies installed module bytes against
the pinned wheel, distribution version, protocol ABI and SHA256. No development
runtime source is imported by the generated fixture. `runtime_fixture.py` is
not the production SDK implementation; many methods deliberately raise
NotImplementedError. The emitter is not CONTRACT-067 semantic admission or the
production generator. This is spike evidence only, never SDK release acceptance.

The minimum fixture covers strict required/null/missing presence, frozen sealed
leaves, full raw-value revalidation at its codec boundary, Record-owned columns,
updates and projections, grouped-count/related-key/page/search result shapes,
explicit catalog call-site signatures and replay-capability separation.

The positive corpus and 30 diagnostic negatives cover the CONTRACT-071 typing
error table and the six previously unqualified typing areas on both checkers.
The nullable-only if_present negative now fails at the enclosing filter through
an invalid-marker overload. See findings.md for the deliberate runtime-internal
mypy overlap suppression; no generated/developer suppression or plugin is used.
Twelve runtime/profile/emission tests cover presence and exact pin/mismatch controls.

## Remaining gates

This bounded baseline avoids circular dependence on the entire generator.
The coordinator accepted B-TP-000 for its captured checker source and accepted
this bounded compatibility gate as sufficient to resume B-TP-002/003. The parent
updated CONTRACT-071/TD-082 to describe the invalid-marker typing rule. Production stage-one generation and real runtime replay remain
STP-080/081/082 gates; this spike cannot close their ACs. Driver/platform/native
lanes are UNTESTED with no target selected, rather than silently qualified.
The governed instant/local temporal profile is owned by another session; no
profile or native temporal semantics are established here.

## Replay

From this directory:

```
/private/tmp/umf-tp001-compat-env/bin/python emit_fixture.py
UV_CACHE_DIR=/private/tmp/umf-tp001-uv-cache uv pip install --no-deps --python /private/tmp/umf-tp001-compat-env/bin/python artifacts/umf_access-0.0.0+tp001.spike-py3-none-any.whl
/private/tmp/umf-tp001-compat-env/bin/python run.py
```

`run.py` checks exact pins before running either checker separately on positive
inputs and every negative. An import/configuration failure or unexpected
positive diagnostic fails. Results retain commands, individual statuses, full
checker output, profile and source SHA256s under results/. Changed inputs require
fresh replay; historical attempts under attempts/ do not qualify current bytes.
