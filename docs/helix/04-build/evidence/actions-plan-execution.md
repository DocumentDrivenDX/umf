# Executed action design plan — 2026-10-08

Scope: owner-authorized improvements and bounded requirements/design investigation
in the managed `actions-requirements-design` worktree. HELIX artifact IDs and
frontmatter were preserved; no production action extension was added.

## Results and decisions

- Real PostgreSQL 17.9: all 21 fixture histories passed independent expected-result
  assertions. Five faulty variants were rejected: revision-scoped lookup, replay
  before current authorization, failed rollback, premature visibility and bypassed protected-record frame check.
- Bun 1.4.2: five representation tests passed (eleven assertions). This is a small
  design probe, not the CONTRACT-052 public validator or US-055 acceptance suite.
- Finite protocol exploration: stable-token design has 12 reachable states and
  17 transitions with no violation of its two safety invariants. Both mutants
  have counterexamples. Bounds: two calls, one token, two revisions, one deployment,
  one revocation and initial stock two. Atomic-call abstraction excludes crashes,
  fairness and unbounded liveness; SQL race testing is separate.
- Chromium probe is recorded with its actual version/driver in browser-results;
  exact Bun/Chromium probe equality passed: Chromium 153.0.8010.12 with bundled
  Playwright driver 1.62.1 in image v1.63.0-noble. These versions qualify the
  actual probe rather than assuming driver and image package versions match.

The contract now separates semantics from binding, permitted writes from required
recipe effects, and consumer-specific human attribution from general actor-kind
profiles. Retry scope survives deployment; revision is checked payload. Admitted
business rejection/conflict is durable; known execution failure rolls back;
lost acknowledgement remains indeterminate. Fresh business no-op and replay are
separate. Read visibility requires projection content plus a qualified contiguous
watermark; outbox commit and repeatable delivery are separate.

## Reproducible evidence

All experiment sources and results are under
[actions experiments](../../02-design/experiments/actions/):

- `histories.json`: explicit initial states, requests, step schedules, expected
  statuses/state/outcome counts and exact durable-result equality pairs.
- `native.py`, `store.sql`, `native-results.json`: actual SQL transactions,
  overlapping invocations, failures and mutant outcomes, with source SHA-256 and
  runtime version. `returnedPayload` records the executor response even when no
  terminal outcome exists; the outcome ledger/count determines durability. Equality
  pairs cover original persisted committed/rejected payloads, including the
  first lost client acknowledgement. Python driver uses Docker/psql only on the host.
- `representation.ts`, `representation.test.ts`, browser entry/harness and
  Bun/browser results: simplified representation, source preservation, unknown
  rejection, getter inertness and copy isolation. Bundled code includes the
  existing accessor-safe core JSON copier, not host APIs.
- `protocol.py`, `protocol-results.json`: finite states and explicit mutant traces.

Create an isolated PostgreSQL container without ports/volumes/network:
`docker run --detach --rm --network none --name umf-actions-design-proof -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17.9`.
Run `python3 docs/helix/02-design/experiments/actions/native.py`, then stop that
container. Run `bun test ./docs/helix/02-design/experiments/actions/representation.test.ts`
and `python3 docs/helix/02-design/experiments/actions/protocol.py`.
The browser entry is bundled for target browser and exercised in the local
Playwright v1.63.0 noble image; the checked-in harness records the actual Chromium
and bundled Playwright driver versions. Its dependency mounts are read-only and
network is disabled. Host paths must be adjusted on another machine.

## Independence and limitations

Astra reviewed the history expectations without executor helpers and identified
several ambiguous outcomes. The corpus was corrected before the passing run:
terminal rejection, optimistic conflict, unordered race outcomes, durable result
equality, fresh no-op and per-tenant identities are now explicit. Native expected
assertions read fixture data rather than duplicate the SQL algorithm. Mutation
rejection establishes discrimination of these particular defects, not completeness.
In the SQL revision-namespace mutant an explicit-order uniqueness failure may
prevent a second business commit; its wrong outcome still violates the fixture.
The finite model separately exhibits two commits with that namespace mistake.

Synthetic string keys/integer quantities and a synthetic person/permission grant
are the tested subset. No real authentication, arbitrary expression evaluator,
composite-key equality, association Record, native trigger instrumentation,
cross-store freshness, original-core conformance or production executor is claimed.
H15 compares the named sentinel against pre-state before commit and rejects an
injected violation; a bypass mutant is caught by the expected-state oracle. This
qualifies only that sentinel check, not general FrameEntry selectors or absence
of attempted writes/outside-frame reads.
Outbox delivery is intentionally repeatable, not exactly once. Source snapshots
cannot prove a handler did not read or attempt writes outside its frame.

Failed attempts were corrected, not counted as passes: Python newline syntax,
shadowed concurrent module, initial reused SQL tables, Bun filter/build argument
syntax, container dependency resolution, ARM64 executable path and missing
browser global export. Astra's second review also corrected the initial self-
signalled frame violation and overly permissive prototype compatibility result. Final runtime evidence supersedes these failed runs only
for the named experiments.

## Separate gates

Design investigation: experiments executed and draft semantics revised; final
independent review findings are recorded below before declaring readiness.
Portable library acceptance: OPEN; all nine US-055 public API/schema/JSON/YAML,
full reference validation and regression criteria remain UNTESTED.
Production executor qualification: OPEN; this experiment qualifies only its
named fixture observations, not a deployable executor or native platform adapter.
Current core release qualifications remain separate and are not waived.

Sources, access and decision stop conditions:
[prior-art decisions](../../02-design/actions-prior-art-decisions.md).
Provenance: [consumer decision ledger](../../00-discover/actions-requirement-provenance.md).

## Independent final review and closure

Astra Ultra reviewed the revised interface/corpus and then the experiment sources.
Its material findings were implemented: durable rejection precedence, selector
phase/claim support, business-versus-control rollback, typed output phase and
recipe restriction, fresh-key retryability, retained-revision interpretation,
protected-record detection instead of self-signalled failure, conservative
prototype compatibility, evidence labels and expanded AC allocations.

[Same-scenario candidate comparison](../../02-design/actions-candidate-comparison.md)
closes its final comparison gap. Reservation, rather than approval no-op, is the
expressiveness decision: graph-write/1 cannot derive new stock from pre-state and
quantity with its input/literal bindings while retaining the original request.
The design investigation is complete for the selected bounded declaration and
feasibility scope. Artifacts remain draft; this is not owner approval or a
production release. The public library and production executor gates stay open.
Temporary experiment containers were removed; the worktree and evidence remain.

Consistency checks passed: six governed IDs unique, their ddx references resolve,
eight feature requirements and nine public criteria allocated, evidence source
fingerprints verified, relative links checked and `git diff --check` passed.
These checks are document/evidence checks, not additional runtime coverage.
