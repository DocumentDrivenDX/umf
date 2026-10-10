---
ddx:
  id: umf.actions-documentation-plan
  type: implementation-plan
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
    - id: FEAT-008
      kind: informed_by
    - id: SD-008
      kind: informed_by
    - id: US-900
      kind: informed_by
    - id: US-056
      kind: informed_by
    - id: CONTRACT-900
      kind: references
    - id: CONTRACT-901
      kind: references
    - id: TD-900
      kind: informed_by
    - id: TD-056
      kind: informed_by
    - id: STP-900
      kind: informed_by
    - id: STP-056
      kind: informed_by
    - id: umf.design-system
      kind: references
    - id: umf.implementation-plan
      kind: references
---

# Action documentation and website implementation plan

## Scope

Requested 2026-10-09: review the internal documentation, plan improvements and inclusion in the repository website, and obtain Astra Ultra review. The audience is an entry-level engineer unfamiliar with UMF, formal analysis and CQRS. This artifact plans subsequent implementation; it does not implement, approve, sign or publish that work.

The documentation already specifies the action model in substantial detail. The gap is a trustworthy learning path: current status is scattered, historical experiments look current, implementation references have drifted, and the website introduces neither actions nor their consumer protocol. See the [review and evidence inventory](evidence/actions-documentation-review.md).

Governing behavior remains [CONTRACT-900](../02-design/contracts/CONTRACT-900-declarative-actions.md), [CONTRACT-901](../02-design/contracts/CONTRACT-901-transactional-action-profile.md), TD-900/056 and STP-900/056. [The acceptance certificate](evidence/actions-certification.md) qualifies core 0.8.0, actions 0.1.0 and the fixed reference consumer, including PostgreSQL 17.9 and Bun 1.4.2. It does not approve draft specifications or establish production/downstream adoption. No new action semantics, public execution service, framework migration or hosting provider is in scope.

## Shared Constraints

- Explain UMF as a machine-readable model of schemas and metadata before introducing actions. Define Record, Field, Key, extension, declaration and consumer with concrete examples; do not invent an expansion of UMF.
- Introduce concepts before terminology. Each chapter states the problem, demonstrates one operation, explains the observed result, and gives a small prediction exercise with an answer. Define terms at first use and link a glossary.
- Separate declaration validity, interpretation completeness, declared compatibility and actual execution. `assessAction` always returns `executionVerified:false`; evidence locators are inert. Inspection does not execute rules, policies or handlers. Explicit rule evaluation APIs are a separate operation, requiring supplied state.
- Read/write frames permit access or changes; they do not require every permitted change. Recipes require their ordered primitive effects; handlers may legitimately do nothing. Unknown relevant semantics prevent safe editing/qualification without being discarded.
- Use the actual approve fixture first. It sets a literal status, declares no conditions, and has no business outputs. Never illustrate an imagined postcondition or inventory arithmetic as though that fixture contains it. Create/link comes second. Reservation arithmetic belongs to an explicitly identified handler/formal example, not graph-write/1 computed assignments.
- Explain commands as requests, events as facts and queries as reads. CQRS separates write/read responsibilities; this profile does not require event sourcing, separate physical databases or exactly-once event delivery. A successful commit can precede a readable projection.
- Keep normative statements in contracts. Guides explain and link them, with machine-checked examples. Prior art is documented comparison, not tested equivalence or adoption.
- Preserve IDs/frontmatter/ddx links and draft approval states. Keep the final certificate and raw historical evidence unchanged. No private keys, credentials or secret reads are required to implement the documentation.

## Learning Path and Deliverables

Canonical explanatory sources: `docs/helix/04-build/guides/actions/`. These are implementation guides, not replacement contracts. Navigation offers “Start here,” “Look up an API,” and “Understand the evidence,” while keeping advanced material optional.

| Chapter / proposed file | What a beginner should learn | Required example or check |
| --- | --- | --- |
| `index.md`, `concepts.md`, `glossary.md` | What UMF contains; what actions add; what the library and consumer each do | Annotated order Record, two Fields, primary Key and module extension; distinguish model from stored order |
| `getting-started.md` | Install from the repository, register actions, parse and inspect a declaration | Actual public exports and `approve.json`; output assertions; explain valid versus complete and every displayed status |
| `declarations.md` | Parameters, frozen selections, permitted writes, recipe ordering and handler choice | Approve, then create/link; known error and preserved unknown; conditional no-op explained separately |
| `execution.md` | Authentication, preview, fresh admission, outcomes, original-token reconciliation and revisions | Actual reference-consumer walkthrough; approved and already-approved orders; durable rejection versus rollback; lost acknowledgement and retired replay |
| `receipts-and-queries.md` | Why a commit and a query can disagree temporarily | Receipt store/epoch/version, duplicate and out-of-order facts, complete prefix and content; restore fence boundary |
| `formal-analysis.md` | Why examples alone miss bugs; how models and tests find counterexamples | Plain-language invariant, short interleaving, missing reservation/nonpositive quantity; distinguish SMT, TLC, history checks, native refinement and implementation mutants |
| `api-reference.md` | Find every supported public action function and type | Signatures, input prerequisites, copy behavior, errors, exact profiles, limits and links to exercising tests; include compile/select/admit/evaluate exports, not only the five declaration helpers |
| `support-and-evidence.md` | Tell what is implemented, qualified, unsupported and historical | Version/subset table linked to immutable certificate and witnesses, separate declaration/rule/native columns; known layouts and external-effect exclusions |

Add a short `fixtures/actions/README.md` explaining fixtures, cases and which examples execute where. Add `scripts/actions-reference/README.md` describing host-only status, trusted setup, disposable native stores, qualification commands, shutdown/cleanup and limitations. Link these from the guide rather than duplicating setup instructions. Root README, HELIX README and website developer page lead to the new index and scoped current certificate.

The portable tutorial runs without PostgreSQL, Docker or credentials. Its “inspect” output shows the literal assignment but never claims an order changed. The optional native tutorial identifies every extra prerequisite and uses an owned disposable store with synthetic authority. It must not point learners at user databases, unexplained temporary directories or a presumed running container. The portable approve fixture uses the opaque `reference-roles/1` authorization identity. Show its actual unchecked obligations instead of implying full interpretation. The native tests copy that document and explicitly replace the authorization profile with `umf.actions.roles/1`; the native tutorial must show and validate that change, label the new declaration/revision, then provision current membership and independent replay-discovery policy. Registration alone grants neither. Document explicit failure and cleanup paths. The browser playground can inspect the actual declaration; native execution remains a separately labelled local walkthrough. Any animated CQRS demonstration is illustrative and earns no execution evidence.

## Visual Storyboard and Fidelity Gates

Produce authored vector diagrams with editable source and committed SVG renders under `guides/actions/diagrams/`. Reuse the same renders internally and on the website; no remote rendering service or client-side Mermaid dependency. Follow [DESIGN.md](../02-design/DESIGN.md), with plain labels, numbered steps, restrained colors and visible arrow direction. Each figure includes a caption, text equivalent, source/test references and a legend. Expand crowded mobile figures into sequential panels; offer the full SVG separately.

| Figure | Teaching purpose | Semantic acceptance check |
| --- | --- | --- |
| V1 — Model and instance | Distinguish schema metadata from business data | Record/Field/Key references and action attachment match the actual approve fixture; a stored order is outside the UMF document |
| V2 — Two responsibility lanes | Library describes/checks; consumer executes | No arrow from inspection/assessment to storage; explicit compile/evaluate distinction; trusted authentication at consumer boundary |
| V3 — Approve before/after | Literal SET, changes and business no-op | First invocation changes status; fresh-key no-op persists its own outcome without business version/event advance; replay returns original outcome, not fresh no-op |
| V4 — Ordered create/link | Understand created-effect references | Both links reference an earlier create; endpoints and selected Keys match `create-link.json`; permissions are drawn separately from effects |
| V5 — Retry after lost response | Understand uncertain commit and reconciliation | Commit precedes lost response; reuse original token/revision/input/versions; lookup never executes; current authorization gates original results; distinguish failed rollback |
| V6 — Commit to readable query | Explain CQRS and receipt visibility | Outbox and business commit atomic; delivery repeatable; receiving position 2 before 1 cannot advance complete prefix; content and prefix applied together; store/epoch bound |
| V7 — Handler capability boundary | Explain enforced access without jargon | Handler has bounded gateway, not SQL/credentials/network; invariant checks and control-state reads are consumer-owned and not handler grants |
| V8 — Counterexample storyboard | Make formal analysis concrete | Show assumptions, finite bounds, violated property and corrected requirement; distinguish abstract model from actual native implementation witness |

V5/V6 should be readable sequence diagrams; V1/V2/V7 clear annotated architecture drawings; V3/V4 concrete state panels; V8 a small state/interleaving story. Avoid an enormous omnibus diagram. Label observable results separately from executor assertions and independent evidence.

Acceptance: no clipped text or crossed ambiguous arrows; labels readable at 390px without shrinking the whole desktop diagram; no distinction relies on color alone; descriptive alt text and adjacent long descriptions; 1440px/390px screenshots and keyboard/zoom review. A semantic reviewer checks each named property above against its fixture/contract/test. A visual reviewer checks layout and teaching clarity. A render pass alone cannot satisfy semantic review. Store deterministic render commands and their pinned dependencies; validate all external SVG references are absent and sanitize generated inline SVG/HTML.

## Implementation Slices

Commands prefixed **proposed** below do not exist yet. Existing qualification commands are evidence checks, not a request to rerun the entire native campaign for prose-only changes.

| Slice | Outputs and governing references | Depends on | Completion gate |
| --- | --- | --- | --- |
| DOC-01 — Status and authority map | Audit/fact inventory; source ownership manifest; links in root/HELIX/canonical build plan; classify stale paragraphs in CONTRACT-900/901, TD-900, STP-900 and historical evidence | None | Every current support claim has exact scope/evidence; no historical pass/open statement presented as current; certificate impact report before any captured-file edit |
| DOC-02 — Beginner portable journey | Concepts/glossary/getting started/declarations; fixture README; runnable examples from actual fixtures | DOC-01 | **proposed** `bun run test:docs:examples`: exercise actual exported APIs, unchanged source, diagnostic/result assertions and known-error/unknown-preservation cases; run the portable examples in Chromium |
| DOC-03 — Consumer and reference | Execution/receipts/API/support chapters; consumer README; stable setup/reproduction entry points | DOC-01, DOC-02 | Inventory all public action exports/types and logical consumer operations; match bounded native outcomes to recorded exercising witnesses; mandatory fresh validation of exact published native setup/walkthrough/cleanup commands in an isolated store, with explicit environment/logs; otherwise ship only a labelled recorded walkthrough and keep runnable acceptance pending |
| DOC-04 — Formal teaching and visuals | Formal chapter and V1–V8; editable sources, SVGs and accessible descriptions | DOC-02, DOC-03 | All eight semantic gates plus screenshot/accessibility review; pinned reproducers replace ephemeral path assumptions; glossary/prediction exercises checked |
| DOC-05 — Static website integration | Small Bun/TypeScript build tool, page templates, source manifest, generated `microsite/dist/actions/`; existing navigation/landing-page pointers; pipeline path/version fixes | DOC-02, DOC-03, DOC-04 | **proposed** `bun run build:docs` deterministic; **proposed** `bun run test:docs:build` checks clean generation, stale outputs, links, base path, snippets, diagrams, escaped content and claim manifest |
| DOC-06 — Reader/browser verification | New documentation evidence record and novice walkthrough results; fix found teaching/build defects | DOC-05 | **proposed** `bun run test:docs:browser` plus fresh repeatable working walkthroughs; desktop/mobile, keyboard/zoom, zero page errors/network dependencies, defined task rubric |
| DOC-07 — Review and publication readiness | Status alignment, certification-impact disposition, HTML/asset manifest, signing instructions and deployment checklist | DOC-06 | All relevant docs checks and actual working demonstrations pass; final semantic/visual review; exact rendered HTML signed through existing Innsigle process when credentials are available; CI regenerates identically and verifies every page before existing deployment |

## Website Build Design

Keep the existing four pages and style tokens. The present `style.css` imports Google Fonts: guide output must use system fonts or repository-local licensed font assets, with their source/license and hashes in the ownership manifest. Do not silently reuse the remote import while claiming no runtime network dependency. Block external requests in the browser gate and verify readable fallback typography, diagram labels and layout. Their `dist/` HTML is currently authored source, not a generic generated output directory. Add generated action pages under `dist/actions/`, with a manifest that explicitly owns only those pages/assets. A generator must never delete the handwritten pages. Guide Markdown, executable snippets/fixture excerpts and diagrams are the single explanatory source; contracts remain linked authoritative references. The existing developer page gets a short action entry point and correctly scoped links.

Build from a declared complete input set: guides, diagram source/render versions, snippet harness, fixtures, relevant public exports/contracts and support manifest. Validate input paths and reject unresolved includes, malformed frontmatter, duplicate anchors and raw unsafe HTML. Use a bounded Markdown feature set, escape code/text and preserve accessible semantic markup. Resolve local repository links to stable repository URLs for published pages and guide-relative links to generated routes; reject broken anchors and unsupported schemes. Test both local preview and the `/umf/` GitHub Pages base path, including nested routes, SVG/CSS/script paths, refresh and deep links.

Avoid wall-clock timestamps in generated pages. Generate a source/output hash manifest; two clean builds must match byte-for-byte. CI regenerates into a staging directory and compares with reviewed committed generated files before signature verification. Stale pages, missing new routes or changed diagrams fail clearly. Sign finalized HTML after generation; CI verifies without obtaining signing secrets. Ensure Innsigle coverage includes all added pages. HTML signatures alone do not attest separately referenced SVG/JS/CSS bytes: asset hashes must be bound through a reviewed signed-page manifest reference or signed manifest mechanism demonstrably supported by the existing verifier. Until that mechanism is selected and verified, describe asset hashes as CI integrity checks, not cryptographic asset attestation.

Update both push/PR path filters for all declared documentation inputs and checker/build scripts, including guides, action fixtures and relevant governing artifacts. Add docs build/check steps before Innsigle verification/upload. Align the workflow's Bun 1.3.14 pin with the repository's Bun 1.4.2 pin, and record the chosen version. Keep PR checks separate from master deployment. Update `05-deploy/README.md` to explain authored versus generated sources, reproduction, signatures, input triggers and rollback. Do not present the earlier private Sites preview as the repository GitHub Pages deployment or evidence of this new guide.

## Issue Decomposition

DOC-01–07 are reviewable work packages, with the blockers above. No external work items or human assignments are created by this planning task. Future issues reference this plan, nearest governing artifact and completion gate, labelled `helix`, `activity:build`, `kind:build` and `area:actions-documentation`. Use US-900/056 when testing those existing behaviors; do not invent new action acceptance criteria or story identities for prose improvements. DOC-02/04 need technical writer and semantic review; DOC-05 needs build/security review; DOC-06 requires real runnable system demonstrations; reader sessions are follow-up. Owners are unassigned.

## Validation Plan

- Maintain a claim matrix: explanatory statement → fixture/source symbol → contract section → existing test/evidence → website route/figure. Inventory public exports mechanically; require explicit coverage or documented omission. Do not duplicate the full certificate's 6,990-source inventory into a tutorial build.
- Machine-check runnable snippets through the public entry point and expected observations, including `executionVerified:false`, error/refusal cases and source preservation. Test meaningful behavior, not snapshots of all incidental report prose. Protect the beginner approve example from silently acquiring fabricated conditions/outputs.
- The native tutorial is optional for the reader, but fresh validation is mandatory before publishing it as runnable. Execute the exact authored setup, walkthrough, failure and cleanup commands in a disposable native environment; record its server/runtime version and independent stored-state observations. Documentation cannot infer a current fresh native result from old recorded logs.
- Check generated navigation, links, anchors, manifest completeness, assets, base path, deterministic output and stale-file cleanup confined to generated ownership. Browser verification exercises the actual public bundle and docs routes, not a synthetic HTML surrogate.
- First-time reader rubric: starting with no UMF/CQRS knowledge, independently run portable inspection; explain why no business write happened; find and interpret one refusal; distinguish failed rollback from indeterminate outcome; explain why received fact 2 does not prove fact 1 visible; identify one unsupported native scope; locate the exact evidence. Record assistance, wrong predictions and revisions. Owner update (2026-10-09): two entry-level reader sessions remain a usability follow-up. The release gate is actual runnable demonstrations of success, refusal/rollback, replay and projection visibility, exercised against the qualified runtime with independently observed stored state. No simulated success or unavailable human session substitutes for working system evidence.
- Captured-document impact: calculate proposed changed paths against certificate source/governing hashes before edits, and compare the input-discovery inventory before/after for additions and removals. Adding package scripts, build tools or documentation tests can change captured input sets even when guide Markdown itself is outside them. New guides do not automatically change captured inputs; status corrections to captured contracts/TD/STP do. Preserve the historical certificate unchanged. Record documentation-only deltas and their exact old/new hashes separately, without claiming the original certificate binds new bytes. Changes to normative behavior require upstream design/test review and fresh applicable qualification. If current-source certification is required after any captured change, use the existing qualification/fingerprint rules; a prose label cannot waive them.
- Existing focused gates, when applicable: `bun run typecheck`, `bun run build`, `bun test ./tests/actions/*.test.ts`, `bun scripts/actions-browser.ts`, `bun scripts/acceptance-traceability.ts --check`. Full core/native recertification is required only by the actual changed-input/qualification policy, not asserted unnecessary by this plan.
- Record final scope, sources, versions, commands, screenshots, reader outcomes, unresolved gates and review findings under `04-build/evidence/`. Website publication evidence stays separate from action execution evidence.

## Risks and Rollbacks

| Risk | Impact / response | Rollback |
| --- | --- | --- |
| Beginner guide silently strengthens or weakens semantics | High: claim matrix and per-figure semantic review; retain normative authority | Revert guide/figure and generated pages together; never edit historic proof to fit prose |
| Status corrections invalidate a source-bound current claim | High: classify changes first; additive lineage report or required fresh qualification | Retain certified snapshot and point to dated evidence; withdraw unqualified current-source claims |
| Generated pages drift or erase authored pages | High: explicit ownership, staging comparison and no broad `dist` cleanup | Revert source/build/output as one change |
| Attractive diagrams hide concurrency or receipt holes | High: named negative cases, captions and readable sequential panels | Replace offending figure with verified text until corrected |
| Signing unavailable | Publication gate remains pending | Keep reviewed local build; do not claim verified publication |
| Beginner reader sessions unavailable | Usability follow-up remains open | Release requires executable walkthroughs; reader comprehension is not yet independently established |
| Deployment introduces broken nested routes or assets | Preview base-path/browser gates; verify actual published routes after authorized deployment | Revert site commit through existing master workflow; preserve action evidence |

## Exit Criteria

The implementation plan is complete when its internal-document audit is traceable, learning path and eight visuals have precise acceptance gates, website generation/signing ownership is clear, work packages are dependency ordered, and Astra Ultra findings are resolved or explicitly pending. Execution is complete only after DOC-01–07 gates pass (including fresh native validation if publishing a runnable native tutorial); neither this plan nor a passing action certificate substitutes for a reviewed novice website.

## Open Decisions and Review

Implementation must confirm the supported deterministic vector renderer, exact Markdown/template dependency pins, complete Innsigle page coverage and supported asset-binding mechanism. Reader availability and signing credential access are unconfirmed. These are bounded DOC-04/05/06/07 decisions; they do not require changing the action model. Astra Ultra reviewed this plan and confirmed all five findings resolved, with no remaining plan blocker. See the review evidence for findings and dispositions. This is scoped plan approval, independent of artifact approval state or future execution gates.
