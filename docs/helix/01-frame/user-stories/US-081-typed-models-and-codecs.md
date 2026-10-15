---
ddx:
  id: US-081
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-028
      kind: informed_by
---

# US-081: Use typed models, keys and codecs

**Feature:** [[FEAT-028]]. **Feature Requirements:** TM-03, TM-04.
**PRD Requirements:** FR-52. **Priority:** P0 within the proposal.

## Story

**As an** Application Developer,
**I want** generated Pydantic models for rows, creation, patches, keys and projections, with codecs that convert to and from storage carriers,
**So that** my editor and type checker catch wrong fields and values, and values reach storage with the exact meaning the schema defines.

## Context

CONTRACT-068 defines the generated ABI. Each Record gets separate classes because
UMF keeps three presence rules apart: what a stored row holds (`Order`), what
creation accepts (`OrderCreate`) and what a change accepts (`OrderPatch`).
Absence uses Pydantic's `MISSING` sentinel; `None` means an explicit null.
Literal UMF defaults are applied by the engine, never by Python.

Pydantic validation alone is not enough for exact meaning: strict mode still
does not check decimal scale without rounding, timestamp kinds or nested
mutation. Generated codecs therefore own every conversion, revalidate the whole
value graph and agree with UMF's own validators on a shared golden-vector corpus.

A design-time spike at
`docs/helix/04-build/evidence/typed-persistence/dsl-typing-spike/` showed that
pyright 1.1.414 and mypy 2.4.0 reject an unknown Patch keyword, a `float` for a
`Decimal` field and `None` for a non-null field on models with this
configuration under Pydantic 2.14.1. It is design evidence, not an
implementation or acceptance result.

## Walkthrough

1. The developer imports `Order`, `OrderCreate`, `OrderPatch` and `OrderKey`
   from the generated package.
2. The developer builds an `OrderPatch(memo=None)` to clear a memo; the type
   checker flags `OrderPatch(ammount=...)` and `amount=1.5` before running.
3. An action client or bulk command calls `encode_Order_patch`, which revalidates
   and returns `{"memo": None}` keyed by authored Field IDs.
4. A read returns columns and rows; `decode_Order` checks the column inventory
   and builds a validated `Order`.
5. Invalid values raise `ValueError` subclasses naming the field and rule but
   not the value.

## Acceptance Criteria

- [ ] **US-081-AC1** — Given the CONTRACT-070 `Order` view, when I construct and encode row, Create and Patch values, then `OrderPatch()` encodes `{}`, `OrderPatch(memo=None)` encodes `{"memo": None}`, `OrderPatch(amount=None)` refuses, the engine-generated `revision` and the immutable `placed_at` are rejected as extras in Patch, `revision` is rejected in Create, `MISSING` never reaches an encoded mapping, and no authored default appears as a Python default.
- [ ] **US-081-AC2** — Given the exact-value golden-vector corpus, when each vector is validated by the generated model and codec and by UMF's `validateCoreFieldValue` and `validateCoreRecordValues`, then both accept and reject the same vectors, `Decimal("125.5")` is accepted unquantized for `numeric(12,2)` while `Decimal("1.234")`, floats, `bool` for `int`, numeric strings, naive instants, finer-than-microsecond instants, `datetime` for `date`, zone-attached local timestamps and lone surrogates refuse, and instants encode normalized to UTC.
- [ ] **US-081-AC3** — Given a generated model, when I subclass it, build an instance with `model_construct`, change it with `model_copy(update=...)`, or mutate a nested list after construction, then subclassing raises `TypeError` and every codec boundary revalidates from raw attribute values and refuses the invalid state, with error messages that name the field and rule but contain no input value.
- [ ] **US-081-AC4** — Given a Record with an ordered composite Key and a selected action with entity, optional and required value parameters, when I use `<Record>Key` and `<Action>Input`, then Key components keep declared order, `KEY_IDENTITY` equals UMF's `CoreKeyIdentity` plus document and core identity, `BUNDLE_INPUT_DIGEST` is exposed separately, Key DTOs are unhashable, entity parameters are typed as the target Key DTO, optional parameters are `T | MISSING`, and `<Action>Rejected.code` is a `Literal` union of the declared failure codes.
- [ ] **US-081-AC5** — Given a column inventory and row from a target, when I call `decode_<Record>`, then a duplicate, missing or unexpected column refuses before any mapping is built, a valid row is fully revalidated, and decoded values equal the exact meaning of their transport carriers.
- [ ] **US-081-AC6** — Given the pinned pyright and mypy with the profile's checker configuration, when they check the model positive and negative corpora, then the positive corpus reports no errors, each negative case reports its expected diagnostic, no generated field has an alias (a `names` override changes the constructor parameter name while codecs still emit the authored Field ID), each generated attribute's docstring cites its UMF source pointer, and importing the generated package in an isolated environment containing only the profile's pinned dependencies performs no I/O and loads none of the compiler, the `umf` document package, Weft, Truss or Ashlar.

## Edge Cases

- A field admitting both null and absence is `T | None | MISSING`; one admitting
  only null is `T | None` with no default.
- `1.2`, `1.20` and `1.200` are equal at scale 2 and all accepted; the carrier
  keeps the input coefficient rather than quantizing.
- Python equality of Key DTOs is not UMF Key equality; no key-byte encoder is
  generated, so consumers keep using `umf-key-tuple-v1`.
- Pydantic's `.errors()` includes input unless called with `include_input=False`;
  generated code never logs it, and `model_dump` is not a persistence boundary.
- Other floating-point Fields are not supported in 0.1 and refuse at generation
  (US-080); `Vector` is only for search-index Fields (US-084).

## Test Scenarios

| Scenario | AC ID | Input / State | Expected Result |
| --- | --- | --- | --- |
| presence_follows_view | US-081-AC1 | Empty, null-only and full Patch; Create with and without `placed_at`; `revision` supplied | Encodings as specified; extras and forbidden nulls refuse |
| exact_values_match_core | US-081-AC2 | Golden vectors for every carrier in the value policy | Agreement with UMF validators; no rounding or coercion |
| boundaries_revalidate | US-081-AC3 | Subclass, `model_construct`, `model_copy(update=...)`, nested mutation | `TypeError`; codec refusals with value-free messages |
| keys_and_action_types | US-081-AC4 | Composite Key; action with entity, optional and required parameters | Order, identity, unhashable, typed parameters and failure codes |
| decode_checks_columns | US-081-AC5 | Duplicate, missing, extra column; valid row | Refusal before mapping; validated model |
| static_and_isolated_import | US-081-AC6 | Positive and negative corpora; `names` override; clean virtual environment | Expected checker outcomes; alias-free names and docstrings; import without I/O or forbidden modules |

## Dependencies

US-080 (the generated package); US-082 for the regenerate-and-fix refactoring flow that TM-04 also requires; CONTRACT-040/049 value and Key meaning;
CONTRACT-067/068/070; CONTRACT-072 transport carriers; Pydantic 2.14 or later and
pinned checkers per ADR-004. Feature requirements TM-03, TM-04; PRD FR-52.
TD-081 owns implementation detail; STP-081 owns the test mapping.

## Out of Scope

Query declarations (US-082), executing reads or actions (US-083, US-085),
key-byte encoding, floating-point Fields other than search vectors, and any
claim that a Python model enforces constraints in the database.
