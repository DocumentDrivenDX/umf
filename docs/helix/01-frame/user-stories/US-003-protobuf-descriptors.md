---
ddx:
  id: US-003
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-002
      kind: informed_by
---

# US-003: Access and preserve native Protobuf descriptors

As a schema-tool author, I want Protobuf's native descriptor meaning available
programmatically in UMF, so that transforms and metadata consumers can inspect
presence, field numbers and options without flattening them into generic records.

## Acceptance Criteria

- **US-003-AC1:** JSON/YAML and native descriptor round trips preserve field presence,
  exact defaults, unknown wire options, order and source metadata; access returns copies.
- **US-003-AC2:** A typed candidate edit changes emitted descriptors, preserves the
  source and carries a compiler-required diagnostic; independent protoc accepts
  the example and exposes the changed value.
- **US-003-AC3:** Invalid scalar values, malformed input and unknown representation
  fields fail explicitly without mutating the source.
- **US-003-AC4:** Independently compiled authored and standard corpus descriptors
  have identical native protoc text decoding before and after UMF round trip.
  No meaningful descriptor field is normalized away to force equality.
- **US-003-AC5:** Actual Chromium executes descriptor retention and candidate edit
  paths with the built library and no Bun/Node globals.

- **US-003-AC6:** An independent native runtime passes expected presence, default,
  integer-boundary, packed/group/oneof/extension and Editions behaviors before and
  after round trip, and detects deliberate default/presence mutations.
- **US-003-AC7:** Explicit native source bundles compile in a browser worker;
  original source remains archived, unresolved imports and invalid declarations
  fail, and an independent compiler/runtime checks the emitted descriptors.

- **US-003-AC8:** Emit current descriptors as native source, recompile before
  returning, and compare all descriptor semantics under the declared layout profile.
  An edited default must reach emitted and reimported source. Unrepresentable
  unknown semantics must fail explicitly. Record every standard corpus root and
  test the same edited-source path in Chromium.

## Evidence and Dependencies

`tests/protobuf/descriptor.test.ts` covers AC1–AC4; `scripts/browser.ts` covers AC5.
CONTRACT-003 defines the profile and diagnostic meanings. FEAT-001 supplies the
extension envelope. This story is a required descriptor foundation, not completion
of full language conformance or SPIKE-001.
AC8 uses `tests/protobuf/emission.test.ts` and actual Chromium source reimport.
AC6 uses the Python oracle in `tests/protobuf/behavior.test.ts`; AC7 uses
`tests/protobuf/source.test.ts` and actual Chromium WASM compilation.
