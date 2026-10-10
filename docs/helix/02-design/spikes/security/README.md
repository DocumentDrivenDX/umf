# Shared security feasibility spike

Governing artifacts: FEAT-008, US-079–057, CONTRACT-062/063 and SD-008.
This is disposable proof/test tooling, not a public policy engine, production
compiler, installer or actual Truss/Ashlar binding.

## Reproduce

From the UMF repository root:

```sh
python3 -m venv /private/tmp/umf-security-proof-venv
/private/tmp/umf-security-proof-venv/bin/pip install z3-solver==4.15.4.0
/private/tmp/umf-security-proof-venv/bin/python3 docs/helix/02-design/spikes/security/prove.py
bun test ./docs/helix/02-design/spikes/security/semantic.test.ts
docker run --detach --name umf-security-spike-20261008 --env POSTGRES_HOST_AUTH_METHOD=trust postgres:17.9
python3 docs/helix/02-design/spikes/security/native.py
python3 docs/helix/02-design/spikes/security/lifecycle.py
docker rm --force umf-security-spike-20261008
bun docs/helix/02-design/spikes/security/acceptance.ts
```

The native fixture has no published ports; trust authentication is confined to
the disposable container. Wait for PostgreSQL readiness before native execution.
`native.py` resets only the named container's `sec` schema and fixture roles.
Never point it at production or another project's container. Run native and
lifecycle commands sequentially. The final acceptance command is intentionally
red while required production test runners are absent.

`browser.ts` needs Playwright and an installed Chromium. Set `NODE_PATH` to the
bundled Node package root when project dependencies are absent, and set
`UMF_CHROMIUM_PATH` to an existing Chromium executable if required. Browser
execution binds only localhost, blocks external requests and checks host globals.
Runtime/solver/database versions are recorded in evidence, not inferred from
package declarations. The measured Bun 1.4.2 differs from packageManager 1.3.14;
that replay remains a qualification prerequisite for production support.

## Models and proof limits

`model.ts` implements a bounded ProjectRead restriction and disposition
composition on typed inputs. It does not implement the complete expression
language, ontology resolver, extension package or native lowering API.
`semantic.test.ts` retains independently exercising assertions and AC citations.
The exhaustive matrix covers 2 Staff, 2 Projects, 3 resources with zero/one owner,
all active-assignment relations and grant/forbid combinations: 10,368 decisions.

`prove.py` retains every Z3 formula, assumptions, scope, UNSAT result, satisfiable
population and SAT weakened counterexample. Composition/identity/event-order
theorems are within their declared theories. Relational correspondence and mask
algebra use finite explicit universes. Mapping bijection, trusted facts, exact
native comparisons and authority coordination are premises requiring native
qualification; solver success does not establish an installed database.

`postgresql.sql` independently maps the example through relational junctions and
synthetic typed node/edge tables. It checks static role/RLS and safe field views.
These graph tables are not the Truss 0.12 layout or Ashlar Delta publication.
`lifecycle.py` proves a participating native lock schedule and deliberately
demonstrates stale repeatable-read authority. The initial drain witness uses native result emission. Additional Python host-buffer
witnesses retain a session guard after transaction commit through final release or
discard; an early-session-close control demonstrates revoked rows can remain
releasable. Actual public drivers, streaming/HTTP buffering and distributed failure
handling still need separate qualification.

## Acceptance

The 132 required cases in `../../../03-test/security/cases.json` allocate all
28 criteria; native/backend implementation remains open. `acceptance.ts` executes
reviewed bound test runners afresh and checks command/run identity, source hashes,
AC citations, exact expected/observed assertions and native inventory metadata.
It cannot prove the honesty of arbitrary runner code. Independent oracle/native
assessor review remains mandatory. Prior stored pass receipts are never enough.
Receipts are under `../../../04-build/evidence/security/` relative to this directory.

## Disclosure transport component

`umf.security.disclosure/0.1.0` preserves original null, absence, withholding,
exact integer tokens and replacements with a changed output domain. Whole-batch
corruption tests and real Chromium observations pass. This is shape/domain
validation only; backend authorization, provenance and Weft result-contract
adoption remain unqualified. See TD-056 for the trust boundary and bounds.
