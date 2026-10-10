---
ddx:
  id: FEAT-008
  type: feature-specification
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
---

# FEAT-008: Shared security semantics and qualified enforcement

**Priority:** P0 for the owner-requested security slice.
**Covered PRD Subsystem(s):** Extensions and Partial Participation
**Covered PRD Requirements:** FR-45; existing FR-4/5/22/27/34 constrain participation.
**Cross-Subsystem Rationale:** Security authoring and binding qualification form
one portable-policy capability; query execution remains consumer-owned.

## Overview

Authors express roles, attributes and ontology relationships once, independently
of physical tables or graph storage. Consumers expose the exact security subset
they can enforce and refuse weaker translations.

## Ideal Future State

The same Staff/Project ownership restriction protects ordinary Employee, Company
and junction tables and logical node/edge types in Truss and Ashlar. A maintainer
can inspect counterexamples, deployment prerequisites and acceptance evidence.

## Problem Statement

Physical grants, row filters and masks have different scope from logical policies.
Shared value containers and retained snapshots complicate field protection.
Source-level policy declarations currently do not establish installed enforcement.

## Functional Areas

| Area | Author outcome |
| --- | --- |
| Meaning and authoring | Typed, ontology-qualified policy with explicit unknown behavior |
| Binding qualification | Equivalent decisions and disclosure on declared storage profiles |
| Authority lifecycle | Current authority for writes, history, paging and derived copies |

## Requirements

### Meaning and authoring

- SEC-01: Use independently versioned shared extension semantics; preserve unknown
  native policies without interpreting them as permission. Core promotion is a separate gate.
- SEC-02: Separate logical entity/field/relationship targets from native table,
  column, property-carrier and role identities. Raw tables need no graph terminology.
- SEC-03: Support trusted subject binding, roles, typed attributes and explicitly
  bounded relationship conditions, including active Staff assignment to an owning Project.
- SEC-04: Separate permits, mandatory restrictions and prohibitions; missing,
  incomplete, invalid or untrusted required facts must never authorize disclosure.
- SEC-05: Distinguish canonical null/absence, withheld fields and transformed
  values; declare allowed query use of protected fields.

### Binding qualification

- SEC-06: Qualify PostgreSQL relational, Truss PostgreSQL, Unity Catalog Delta
  relational and Ashlar Delta profiles independently. Native evidence for a
  synthetic graph fixture cannot qualify an actual Truss or Ashlar installation.
- SEC-07: Compare independent semantic decisions to native filters, write
  effects and disclosed values, including direct access and privileged bypass controls.
- SEC-08: Preserve source policies, mapping assumptions and unsupported obligations;
  no report-mode security weakening may be installed as enforcement.

### Authority lifecycle

- SEC-09: Evaluate both original and proposed write state and field mutation authority.
- SEC-10: Declare current authority, retained ownership, revocation ordering,
  paging invalidation and propagation into history, feeds, caches and exports.
- SEC-11: Distinguish private integrity/authorization observation from public disclosure.
- SEC-12: Tie every acceptance criterion to exercising tests, versions, source
  fingerprints and evidence; formal results must state scope and assumptions.

### Non-Functional Requirements

Security/fidelity: zero unauthorized rows, values or committed effects in the
admitted corpus; 100% P0 criterion allocation and no skipped required native cases.
Portability: public semantic operations must execute in Bun and real Chromium
without host APIs. Resource bounds and refusal outcomes are contractual.
Performance: record policy overhead and query plans at 1k/100k/1M fixture records;
no latency SLA is invented before owner capacity targets are supplied.

## User Stories

- [US-079: Author and analyze policies](../user-stories/US-079-security-semantics.md)
- [US-056: Qualify storage enforcement](../user-stories/US-056-security-bindings.md)
- [US-057: Maintain current authority](../user-stories/US-057-security-lifecycle.md)

## Edge Cases and Error Handling

Multiple owners require an explicit quantifier. Cross-document equal labels do
not share authority. Partial authorization observations cannot prove absence.
Unsupported native masks, historical access or policy composition refuse admission.

## Success Metrics

All twelve security requirements have a story and design owner; all required
backend criteria pass independently, with no unqualified equivalence claims.

## Constraints and Assumptions

Use existing identity, extension and physical-binding concepts. DDD is optional.
The first language is nonrecursive; recursive ownership and arbitrary policy
code require separately versioned semantics. Host authentication remains injected.
Existing concerns for fidelity, identity, bounded processing, conformance and
browser portability apply; no new authentication-provider slot is selected for
this library. Full timing-channel resistance is outside the initial profile.

## Dependencies

FR-45, CONTRACT-001, CONTRACT-040/041/042, CONTRACT-062/063 and SD-008.
Weft owns query lowering; consumers own execution and native installation.

## Out of Scope

Production grants, live deployment, universal inference, recursive relationship
engines and replacing database-native security administration.
