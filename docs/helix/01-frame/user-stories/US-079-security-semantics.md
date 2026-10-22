---
ddx:
  id: US-079
  type: user-story
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-008
      kind: informed_by
    - id: umf.prd
      kind: informed_by
---

# US-079: Author and analyze shared security policies

**Feature:** FEAT-008. **Feature Requirements:** SEC-01–05, SEC-12–15. **PRD Requirements:** FR-46. **Priority:** P0.

## Story

**As a** Schema Integration Maintainer
**I want** to author and analyze shared security policies
**So that** I can reuse policies with evidence of zero unauthorized disclosure in the admitted corpus.

## Context

The shared security slice separates logical policy from native enforcement.
CONTRACT-062/063 own exact semantics, outcomes and evidence; a declared profile
is insufficient to qualify an actual storage installation.

## Walkthrough

1. I select the Clients/Projects/Staff ontology and a versioned policy.
2. I select complete trusted facts and the intended storage profile.
3. I run validation and the story-specific conformance scenarios.
4. I inspect refusals, counterexamples and qualified evidence before admission.

## Acceptance Criteria

- [ ] **US-079-AC1** — Given the Staff/Project ontology, when I author its ownership restriction, then the policy resolves to stable typed identities.
- [ ] **US-079-AC2** — Given equal labels in separate documents, when I bind a policy, then their authority remains distinct.
- [ ] **US-079-AC3** — Given malformed paths, incompatible operands or unknown semantic content, when I request interpretation, then it refuses while preserving the source.
- [ ] **US-079-AC4** — Given permits and mandatory restrictions, when an unassigned Staff member has a broad reader grant, then access remains denied.
- [ ] **US-079-AC5** — Given complete assignment facts, when I evaluate active and inactive assignments, then only the qualifying assignment permits the scoped read.
- [ ] **US-079-AC6** — Given incomplete or untrusted facts, when I evaluate the restriction, then no disclosure is authorized.
- [ ] **US-079-AC7** — Given protected fields, when I inspect disclosure, then original null, absence, withholding and transformation remain distinguishable.
- [ ] **US-079-AC8** — Given a protected field without original-value query permission, when I filter or aggregate using that field, then its declared query-use restriction is enforced.
- [ ] **US-079-AC9** — Given a policy document containing native or unknown extensions, when I round-trip it, then its uninterpreted meaning remains retained.
- [ ] **US-079-AC10** — Given the same admitted model and facts, when I evaluate it in Bun and Chromium, then the semantic outcomes agree.

- [ ] **US-079-AC11** — Given a version-pinned protection catalog and qualified Field domains, when I request interpretation, then exact references, typed parameters, declared bounds and complete known meaning are required; unknown content remains preserved and blocks interpretation.
- [ ] **US-079-AC12** — Given a protection reference in security 0.2.0, when I resolve or migrate the policy, then the exact catalog/transform versions are required, legacy constant semantics remain unchanged, and rollback to 0.1.0 refuses any non-constant transform rather than broadening access.
- [ ] **US-079-AC13** — Given transform determinism and declared disclosure properties, when I admit query use, then the effective retained properties include implied leakage and satisfy the operator's dependency; random tokenization cannot authorize disclosed equality joins or groups.
- [ ] **US-079-AC14** — Given an admitted pure transform, when I evaluate and encode it in Bun and Chromium, then independently expected exact outputs agree and original null, absence, withheld, transformed null and stored tokens remain distinct; authored native code is never executed.
- [ ] **US-079-AC15** — Given protection declarations, when I inspect them, then hash declarations require an algorithm and declared salt custody (none or keyed); unsalted hash requires retained equality and a mandatory dictionary-attack warning obligation. Tokenize/encrypt declarations require complete stored custody and propagation metadata; keyed/vault reversibility requires a distinct reverse action. Declarations remain unverified native obligations.
- [ ] **US-079-AC16** — Given a field mutation, when I evaluate its semantic write admission, then an original read disposition or explicit field-bound blind-write permission is required, even when the proposed value equals the mask output; stored-transformed mutation additionally requires its declared vault-write action. Native atomicity and authenticated current action checks remain binding obligations.

## Edge Cases

Incomplete facts refuse access; equal labels do not imply equal identity.
Unsupported native behavior cannot be downgraded to a successful translation.

## Test Scenarios

| Scenario | State | Expected |
| --- | --- | --- |
| Assigned Staff | Alice active on Project A; resource owned by A | Read permitted after all obligations |
| Sibling Project | Alice assigned A; resource owned by B in same Client | Read denied |
| Revoked assignment | Alice has no current active assignment to A | Later read denied |
| Incomplete facts | Assignment provider has incomplete coverage | No authorized disclosure |

## Dependencies

FEAT-008, FR-46, CONTRACT-062/063, SD-008, TD-079. US-056 and US-057 depend on US-079 interpretation.

## Out of Scope

Production administration, arbitrary policy code and recursive inheritance.
