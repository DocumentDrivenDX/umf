---
ddx:
  id: US-001
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-001
      kind: informed_by
---

# US-001: Preserve and validate a versioned document

**Feature:** FEAT-001. **Feature requirements:** EXT-01–EXT-03.
**PRD:** FR-4/5/22/34; exercises FR-15/16/23/39 boundaries. **Priority:** P0.

## Story

As an extension author, I want to read, validate, update and rewrite a document
without losing unfamiliar content, so that partial tooling can participate honestly.

## Context

This is the first executable extension envelope. CONTRACT-001 defines exact
fields, versions, errors and operations; no native vocabulary is implemented here.

## Walkthrough

1. Read a document with context-qualified elements and versioned payloads.
2. Validate with installed vocabulary rules and inspect understanding limits.
3. Rewrite unchanged content, or update a fully understood extension instance.
4. Reopen the artifact and verify identities and retained meaning.

## Acceptance Criteria

- [ ] **US-001-AC1** — Unknown JSON-compatible payloads and fields survive JSON/YAML
  read/write while validation explicitly reports incomplete interpretation.
- [ ] **US-001-AC2** — Duplicate identifiers, unresolved core references, undeclared
  payloads and invalid known payloads fail; identical names in separate modules coexist.
- [ ] **US-001-AC3** — Fully interpreted valid edits change output and preserve the
  original; invalid edits and edits under incomplete interpretation are rejected.
- [ ] **US-001-AC4** — Duplicate keys, unsafe serialization values, numeric loss
  and resource-limit violations fail explicitly without invoking getters.
- [ ] **US-001-AC5** — The packaged browser library executes retention and rejection
  checks without Bun/Node globals and reports scoped browser evidence.
- [ ] **US-001-AC6** — Select shared element metadata by qualified identity/context
  and scalar family while retaining full native source context. Explicit core-reference
  closure handles cycles and preserves boundary edges; unknown extension dependencies
  remain uninterpreted. Verify copy isolation, validation/resource limits, the five
  priority adapters' native recovery and browser parity. This advances FR-41.

## Edge Cases

Wrong vocabulary version is unknown, not a substitution. Missing semantic
validator cannot be reported as semantic success. Native larger numeric domains
remain unsupported by this envelope's numeric profile until explicitly encoded.

## Test Scenarios

| Case | AC | Evidence location |
| --- | --- | --- |
| Mixed known/unknown payloads and repeated encoding | AC1 | tests/core/core.test.ts |
| Duplicate IDs, broken reference, missing/invalid extension | AC2 | tests/core/core.test.ts |
| Successful edit, invalid edit and unknown dependency | AC3 | tests/core/core.test.ts |
| Numeric boundaries, tags, aliases, sparse values and cycles | AC4 | tests/core/core.test.ts |
| Built ESM executed in Chromium | AC5 | scripts/browser.ts |

## Dependencies

FEAT-001, CONTRACT-001, ADR-002 and TP-001. No consumer-specific baseline is
required to test this new envelope; TableSpec compatibility remains unverified.

## Out of Scope

Native adapters, cross-format projection, graduated core types and full ecosystem
support are subsequent stories. Passing this story cannot complete the overall goal.

## Review Checklist

- [x] Observable criteria and concrete failure cases are traceable.
- [ ] Acceptance status requires reviewed executable evidence, not test names alone.
