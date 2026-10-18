---
ddx:
  id: STP-089
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-089
      kind: informed_by
    - id: TD-089
      kind: informed_by
    - id: CONTRACT-077
      kind: references
---

# STP-089: Generated reference and microsite verification

## Story Reference

[[US-089-generated-reference]] and [[TD-089-generated-reference]] govern the
evaluation journey. [CONTRACT-077](../../02-design/contracts/CONTRACT-077-generated-reference.md)
owns exact interfaces. The [project test plan](../test-plan.md) supplies the
portable/Bun/browser/native separation. This slice consumes historical native
records; it does not renew their native acceptance.

## Scope and Objective

Prove generated inventory completeness, attributable outcomes, fixed local tools,
source retention, deterministic generation and usable desktop/mobile presentation.
Existing explorer, reusable-browser and action-guide surfaces must remain usable.

## Acceptance Criteria Test Mapping

Each cited test source contains the corresponding `@covers US-089-ACn` tag.
Criteria remain owned by the story; this matrix records executable assertions.

| Criterion | Test source / case | Asserted behavior | Level |
| --- | --- | --- | --- |
| US-089-AC1 | `tests/reference/reference.test.ts`: extension/schema census, exclusions, boundary injections | Every discovered schema/package exists; exclusions have existing sources and reasons; actual forbidden imports/cycles refuse | Contract/integration |
| US-089-AC2 | Same suite: profile census and structural comparison; browser core pointer journey | Exact profile remains visible; ordered fields and numeric token differences survive; definition links retain pointers | Unit/browser |
| US-089-AC3 | Same suite: exact manifest/schema and registration; browser DDD entry | Default SDK and explicit registry availability stay distinct | Contract/browser |
| US-089-AC4 | Same suite: real independent oracle and five-priority records; browser integration entry | Mixed oracle outcomes and recorded subsets remain attributable | Integration/browser |
| US-089-AC5 | Same suite: source mutations, missing closure, conflicts and supersession | Missing/mismatched proof cannot become current successful support; conflicts remain visible | Unit/integration |
| US-089-AC6 | Public runtime suite and `scripts/reference/browser.ts` workbench | Current-core validators execute; exact JSON serialization matches public Bun output; native projection/compiler produce output with explicit losses | Integration/browser |
| US-089-AC7 | Unknown-content preservation and exact structural comparison | Unknown payload remains in output and retained source; exact tokens remain distinguishable | Unit/browser |
| US-089-AC8 | Malformed/oversized input; worker cancellation and strict projection | Explicit refusal/cancellation clears stale output and retains original input/download | Integration/browser |
| US-089-AC9 | Browser keyboard activation, seven mobile routes, measured search/cancellation | Catalog activates by keyboard; no 375px document overflow; interaction budgets are measured | Browser/visual review |
| US-089-AC10 | Isolated second generation and deliberate HTML drift test | Bytes match; check refuses changed output without overwriting it; prior output is restored | Integration |
| US-089-AC11 | Manifest closure test, nested-base-path browser routes and tampered shard | Every asset matches its digest; source links/history work under /umf/; changed shards refuse | Contract/browser |

## Executable Proof

```sh
GOTOOLCHAIN=go1.27.1 bun scripts/build-protobuf.ts
bun run build:reference
bun run check:reference-boundaries
bun test tests/reference
bun run typecheck
bun run test:reference:browser
bun run test:docs:build
bun run test:docs:examples
```

The browser harness starts its own ephemeral local server. Recorded Chromium
version, desktop/mobile screenshots, interaction measurements and page/network
errors live in [generated-reference evidence](../../04-build/evidence/generated-reference/README.md).
The report binds the tested manifest digest. Signing/publication are separate
from local browser verification; no unsigned preview is release acceptance.

## Data and Setup

Use pinned repository dependencies and Playwright Chromium. Reference examples
retain exact original source and checked expected observations. The projection
fixture has independent JSON Schema required/minimum/minLength constraints,
demonstrating which constraints proto3 does not enforce. The compiler receives
explicit local source files; no native database or remote schema service is used.

## Edge Cases and Failure Modes

Malformed input, unknown content, oversize source, contradictory records, stale
hashes, unsupported record formats, unknown schema pointers, forbidden imports,
cycles, changed assets and cancelled work must fail visibly or remain explicitly
unassessed. No test may turn file existence into a passing native observation.

## UX Coverage

| Pattern | Disposition | Criterion / reason |
| --- | --- | --- |
| Navigation | Covered | AC2/9/11: pointers, nested routes, refresh/history and existing pages |
| Keyboard/overlays | Covered / absent | AC9: native button activation/focus; no modal or custom overlay |
| Async actions | Covered | AC6/8: verified lazy loading, cancellation and stale-result isolation |
| Forms | Covered | AC6/8: operation/profile/registry selection, editable input and local file handling |
| Data states | Covered | AC4/5/8/11: mixed, unknown, historical, error and tampered-source states |
| Destructive actions | Not applicable | No persistent data mutation or delete operation |

## Build Handoff

Boundary adoption precedes extraction and worker implementation. Build complete
records before navigation, then run fixed tools and the whole evaluation journey.
Capture screenshots and review them visually; DOM assertions alone do not establish
visual fidelity. Completion requires the actual checks above and separate reporting
of any signature/publication limitation.

## Reader acceptance mapping

| Criterion | Executable proof |
| --- | --- |
| US-089-AC12 | Reader tests: numeric latest selection; browser latest Document, concept navigation and old exact link |
| US-089-AC13 | Reader tests: key/conditional/reference/open-value facts; browser Record, scalarType, itemType and validated complete examples |
| US-089-AC14 | Compiler documentation census and browser constant/function/interface/member journeys |
| US-089-AC15 | Browser cold search, keyboard/history and 390/798/1280px screenshots with overflow assertions |

Run existing reference unit/build, boundary, typecheck and Chromium gates.
Record reader evidence under generated-reference to avoid evidence self-hashing.
Observed human comprehension remains separate from automated browser evidence;
no recruited-reader session may be claimed without actual participants.
