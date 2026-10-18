---
ddx:
  id: US-089
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-032
      kind: informed_by
    - id: umf.prd
      kind: informed_by
---

# US-089: Evaluate an integration through the generated reference

**Feature:** [FEAT-032](../features/FEAT-032-generated-reference.md).
**Feature Requirements:** REF-01–REF-10. **Priority:** proposed P1.
**PRD Requirements:** FR-29/32/34/39/41. These requirements serve one evaluation
journey; this story does not implement native interchange or conformance itself.

## Story

**As a** Schema Integration Maintainer, **I want** to follow a core definition
through its extension, available operation and test evidence, then inspect an
example locally, **so that** I can choose an integration with an explicit
understanding of its version, subset and limitations.

## Context

The microsite introduces UMF but leaves most technical detail in separate
repository artifacts. A format name does not tell me which operation was
tested or whether its evidence corresponds to the current source. The reference
must connect those facts without inventing stronger support.

## Walkthrough

1. The maintainer opens the core reference and selects a profile and Field definition.
2. They follow a linked native extension and inspect its registration and scope.
3. They select an operation and inspect declaration, recorded outcome and source correspondence.
4. They open an admitted example in the workbench and run the selected operation.
5. They inspect diagnostics and original source, download the result, and retain
   a deep link to the versioned reference entry supporting the decision.

## Acceptance Criteria

- [ ] **US-089-AC1** — Given the repository discovery inventory, when the reference
  is built, then every discovered item is represented or has an explicit checked exclusion.
- [ ] **US-089-AC2** — Given two core profiles, when a reader inspects a definition,
  then its constraints and structural differences remain qualified by profile.
- [ ] **US-089-AC3** — Given a shipped extension version, when its entry is opened,
  then registration availability is distinguished from its manifest declarations.
- [ ] **US-089-AC4** — Given native evidence for an operation, when its integration
  entry is opened, then the exact tested scope and outcome are attributable to the record.
- [ ] **US-089-AC5** — Given changed, incomplete or conflicting evidence, when the
  entry is opened, then its uncertainty is visible without a current-success claim.
- [ ] **US-089-AC6** — Given a supported example, when the reader runs its selected
  operation, then browser output and semantic limitations match the same bounded Bun invocation.
- [ ] **US-089-AC7** — Given unknown extensions or exact numeric tokens, when an
  admitted preservation operation completes, then the original meaning remains recoverable.
- [ ] **US-089-AC8** — Given invalid input, unavailable tooling or a cancelled job,
  when execution ends, then the input remains available with an explicit outcome.
- [ ] **US-089-AC9** — Given keyboard use or a narrow viewport, when the evaluation
  journey is followed, then search, navigation, diagnostics and downloads remain usable.
- [ ] **US-089-AC10** — Given unchanged inputs, when generation is repeated or
  checked, then outputs are identical and checking leaves the checkout unchanged.
- [ ] **US-089-AC11** — Given a publication candidate, when its staged site is
  verified, then references and tools work under the deployment base path with
  asset integrity and existing schema-browser package parity intact.

CONTRACT-077 owns exact formats, commands, routes, error behavior and bounds.
Semantic operation contracts continue to govern their results.

## Edge Cases

- Missing evidence mapping: preserve the declaration and report unassessed evidence.
- A newer successful record contradicts an earlier failure: retain both unless
  explicit, scope-matched supersession resolves the contradiction.
- A URL points to an unknown version: explain the miss and offer version selection.
- Input contains HTML or external references: show inert text; never execute or fetch it.

## Test Scenarios

| Scenario | Criterion | Input and expected observation |
| --- | --- | --- |
| New extension | AC1/3 | Add a manifest version: entry appears; absent registration is explicit |
| Core evolution | AC2 | Compare 0.8.0 and 0.9.0: UUID/bits128 additions appear as structural changes |
| Historical result | AC4/5 | Change one participating source byte: prior pass remains historical |
| Preservation | AC6/7 | Run the unknown-extension fixture: unknown payload remains in retained source |
| Projection loss | AC6 | Run the bounded JSON Schema-to-Protobuf fixture: target and loss report are distinct |
| Refusal | AC8 | Malformed JSON or oversized source: no successful output; input remains editable |
| Navigation | AC9/11 | Open a nested reference under /umf/ and use keyboard Back/Forward |
| Drift | AC10 | Modify a generated page: check fails without rewriting it |

## Dependencies

[SD-032](../../02-design/solution-designs/SD-032-generated-reference.md),
[CONTRACT-077](../../02-design/contracts/CONTRACT-077-generated-reference.md)
and [TD-089](../../02-design/technical-designs/TD-089-generated-reference.md).
Existing semantic contracts and ADR-002 remain authoritative. Test implementation
must cite exercised criteria with `@covers US-089-ACn`.

## Out of Scope

Editing UMF schema definitions in the browser, proving native equivalence,
executing a database, and interpreting arbitrary third-party extension code.

## Authoring reference journey

The maintainer starts with latest core concepts, opens Record or Field and reads
its keys and conditions. They follow a property to accepted value shapes and a
complete example, then follow a related SDK operation to parameters and usage.

- **US-089-AC12:** A cold visit opens latest Document; Record and Field are
  directly discoverable. Exact older links stay pinned with View latest.
- **US-089-AC13:** Record exposes documented keys, membership and identity Keys;
  Field exposes scalarType recognized values and unknown-label policy, and
  itemType's reference shape, target and cardinality restrictions.
- **US-089-AC14:** AVRO_KEYS_EXTENSION is a Constant with exact value, purpose,
  import, usage and related APIs; functions expose parameters/returns and
  interfaces expose members and nested types.
- **US-089-AC15:** Cold property/value/API search navigates directly to context;
  keyboard, refresh, Back and narrow screens retain usable content.

- **US-089-AC16:** Complete and inline schema examples open as YAML. The reader
  can switch to JSON and back using labeled keyboard-operable controls without
  changing values, selected definition or source records.
