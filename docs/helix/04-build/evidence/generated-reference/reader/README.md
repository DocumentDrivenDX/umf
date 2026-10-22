# Schema and API reader verification

Scope: latest-first schema and task-based API reference under FEAT-032,
US-089 AC12–15 and the schema-reference-ia plan. Local unsigned build;
no publication, deployed-byte check or renewed native qualification.

The reader retains 1,899 discovered API exports with symbol-specific structural
documentation. Reviewed purpose/usage coverage is separate: uncurated exports
are explicitly labeled Generated structural documentation. That label is not a
claim of behavior/error or human-comprehension qualification.

## Attempts and corrections

- Dependencies were absent. Frozen-lockfile restoration passed using Bun 1.4.2.
  The ambient Bun is 1.4.3; deterministic reference commands use pinned 1.4.2.
- The initial Go build could not write its default cache in the sandbox; using
  an owned temporary cache built the pinned Go 1.27.1 Protobuf assets.
- Red reader tests established the missing companion output before generation.
- Initial typechecking identified table/disclosure DOM typing; corrected.
- The local server required execution outside the sandbox for loopback/Chromium.
- Initial browser journeys passed. Screenshot review led to allowed-key tables
  separated from prohibited-key disclosures, task synchronization on API links,
  exact numeric constraint spelling and horizontal-table guidance.

## Acceptance evidence

`browser.json` binds the tested manifest digest, Chromium version and completed
reader journeys. The parent `browser.json` records the broader workbench,
source integrity, route and mobile regressions. Images alongside this file
show Record, scalarType and the supplied Avro constant at desktop, embedded and
mobile widths. Source and example checks remain separate from presentation.

Final command results follow. No recruited-reader
session occurred; the proposed three-reader/60-second comprehension target is
unverified. Browser automation establishes actual navigation and rendered
content, not observed comprehension by new users.

## Final results

- Pinned Bun 1.4.2 reference generation: passed; 2,542 entries including 411
  schemas, 70 extension versions and 1,899 API exports. Reader catalog: 729,777
  bytes; manifest records exact final asset bytes.
- `bun test tests/reference`: 16 passed, 0 failed, 13,937 assertions. Includes
  isolated deterministic regeneration and nonmutating drift/tamper controls.
  The expanded repeat-build test has a 240-second bound.
- `bun run test:reference:browser`: 30 broader checks plus 11 reader checks
  passed in Chromium 153.0.8010.12. Both reports bind the same final manifest.
- `bun run typecheck`: passed.
- `bun run check:reference-boundaries`: passed across 19 files; actual prohibited
  import/cycle injections also pass their negative controls in the unit suite.
- `git diff --check`: passed before this evidence closeout.

The broader suite checks seven reference routes at 375px and desktop, sixteen
existing public routes, source integrity, history, unknown-content preservation,
worker cancellation, exact serialization and optional local Protobuf compilation.
Reader-specific screenshots cover 390, 798 and 1280px. Manual screenshot review
confirmed the revised key hierarchy, constant usage, sidebar context and mobile
containment; source/code/table regions support keyboard focus.

Captured precursor failures are retained as `attempt-*` files. The first broad
browser precursor expected tampered-source refusal after initialization; the
reader now rejects that source during startup. The reader precursor classified
its same-origin blob worker as external; the corrected assertion admits only
local origin/blob/data traffic and still rejects external HTTP requests. The
earlier drift failure came from editing source while a build was running; final
frozen-source regeneration and drift controls pass.
