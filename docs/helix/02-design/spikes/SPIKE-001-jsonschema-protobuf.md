---
ddx:
  id: SPIKE-001
  type: tech-spike
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
---

# Technical Spike: JSON Schema and Protobuf Semantic Fidelity

**Spike ID:** SPIKE-001. **Status:** bounded implementation demonstrated; broader compatibility open. **Lead:** to be
assigned by the project owner. **Proposed time budget:** five engineering days;
this is an investigation cap, not a delivery estimate or approved schedule.

## Objective

Can one small UMF core plus independently registered native vocabularies preserve
JSON Schema and Protobuf meaning while exposing cross-system projection limits?

Answer three design questions with evidence:

1. What extension registration and preservation model survives unknown fields
   and edits without falsely claiming semantic understanding?
2. Which concepts genuinely map to shared core and back in both ecosystems?
3. Which native equivalence oracles and fidelity reports substantiate the claims?

Success requires the FR-37 demonstration: two scoped native round trips on real
corpora and one JSON Schema-to-Protobuf projection with complete known-mismatch
reporting. Test strategy is in [TP-001](../../03-test/test-plan.md).

Out of scope: production packaging, all ecosystem versions, ontology machinery,
general inference, exhaustive extension design, performance optimization, and
query/mutation execution.

## Hypothesis

A small programmatic model can preserve both native vocabularies, expose a
limited common subset, and report target mismatches without flattening source
meaning. The hypothesis has bounded native and directed-projection evidence, recorded below. It does not assume that JSON Schema and
Protobuf have interchangeable presence, defaults, unions, or numeric domains.

Implementation direction: TypeScript compiled to JavaScript, with browser
execution required by the owner's subsequent 2026-09-20 instruction. Verify
development and testing with Bun under ADR-002. Verify
browser-compatible import, validation, export, and projection; use independent
native compiler tools in the test harness where needed. WASM remains an adapter
option. High throughput is not a spike objective.

Prerequisites: obtain TableSpec's current schemas, pin the browser/toolchain
and native tools, identify redistributable corpora, and declare
the exact dialect/version scope. Their absence limits execution, not drafting.

## Approach

| Timebox | Investigation | Evidence Required |
| --- | --- | --- |
| Day 1 | Inspect the TableSpec baseline; pin native scope; establish baseline oracles and source licenses | Baseline inventory, version manifest, selected fixtures, expected outcomes |
| Day 2 | Prototype vocabulary registration and parse-edit-write retention | Known/unknown extension and field preservation cases; unsafe-edit outcome |
| Day 3 | Exercise JSON Schema native round trips | Before/after validation vectors plus retained non-assertion semantics |
| Day 4 | Exercise Protobuf native round trips | Compiled descriptor comparisons, explicit normalization rules, presence/options cases |
| Day 5 | Project JSON Schema to Protobuf and reimport; analyze findings | Valid target output, fidelity report, preserved-source comparison, evidence-derived compatibility matrix |

Stop at the timebox even if the hypothesis is unresolved. Report failing cases
and propose a bounded follow-up; never reduce the fixture scope silently to
make the demonstration pass.

Use native parsers/compiler APIs and compare native semantic models independently
of the importer/exporter. A preserved raw source alone cannot demonstrate typed
model access, edits, or useful cross-system translation.

## Findings

**FINDING 1:** Published native and prior-art tools provide candidate testing
mechanisms, but none establishes UMF fidelity before execution. Evidence:
[source notes](../../00-discover/interoperability-sources.md). This is a research
finding, not a successful spike result.

### Measurements

JSON Schema has 384 schema / 1,301 instance-vector round-trip evidence. The
Protobuf descriptor layer has independent native decode equality over 22 source
files. Detailed versions, failures and limitations are in the implementation plan
and fixture reports. Continue recording fixture counts by construct/version, native
round-trip failures, projection mismatches and classifications, unknown-content
retention failures, resource usage, and exclusions with reasons. Keep unsupported,
failed, and untested cases distinct.

## Analysis

Hypothesis status: demonstrated for the declared native and directed-projection profiles; no universal equivalence claim. JSON Schema validation agreement on finite instances
does not prove universal schema equivalence. Protobuf descriptor equality is
useful only with a documented normalization profile that preserves every
claimed semantic distinction. These are oracle-design risks, not reasons to
replace semantic fidelity with string equality.

| Risk | Probability | Impact | Mitigation |
| --- | --- | --- | --- |
| Importer/exporter share the same mistaken mapping | Unassessed | False round-trip pass | Independent native baseline and negative mutation cases |
| Test corpora omit native escape hatches | Unassessed | Overstated support | Include custom vocabularies/options and declare untested scope |
| Core abstraction erases presence or constraint semantics | Unassessed | Irrecoverable loss | Keep native distinctions; require both directions before core promotion |
| Existing TableSpec assumptions bias the whole model | Unassessed | Privileged ecosystem | Test unrelated native constructs before freezing common core |

## Conclusions

The extension envelope and exact native representations have executable evidence.
Bounded Protobuf source-language and application behavior evidence now exists;
the directed projection now has explicit mismatch and source-recovery evidence. Even a
passing result only supports the declared versions, features, and evidence scope.

## Recommendations

**RECOMMENDATION:** Use this bounded investigation as the first implementation
experiment after native scope, baseline access, and tool versions are resolved.
Retain the owner's architecture direction while treating concrete model and
mapping choices as hypotheses. Record resulting contract decisions and update
architecture, concern practices, and the test plan from actual evidence.

## Artifacts

Planned outputs: prototype and version manifest; baseline inventory; native and
cross-format fixtures; oracle definitions; fidelity reports; compatibility
results; conclusions and follow-up decisions. Core, JSON Schema and Protobuf
descriptor artifacts now exist; remaining outputs are not yet complete.

## Native Evidence and Promotion Review (2026-09-20)

Both native paths now have executable evidence: JSON Schema's pinned required
corpus and the bounded Protobuf descriptor/source cases documented in the build
plan. Edited Protobuf source recompiles in the browser and through independent
native tools. The directed cross-system projection now has independent expected-mismatch
evidence under CONTRACT-004. The findings below remain the promotion boundary.

No type or constraint concept is promoted to core from these results:

| Candidate | Counterexample or unresolved distinction | Decision |
| --- | --- | --- |
| Integer | JSON Schema's mathematical integers do not imply Protobuf's signed/unsigned widths or wire encodings. Native boundary tests reject values beyond specific Protobuf ranges. | Keep native domains; a projection needs an explicit range choice. |
| Required/presence | Proto2 required initialization, proto3 optional zero presence and implicit omission differ. JSON Schema `required` asserts object-member existence. | Keep native presence rules; report target enforcement gaps. |
| Union | Protobuf oneof field selection permits absence and has last-value wire behavior. JSON Schema oneOf asserts exactly one matching subschema. | Do not equate the two. |
| Default | A Protobuf getter can return an absent field's default; a JSON Schema default is annotation under the installed profile. | Preserve each meaning independently. |
| Namespace | Native package/import scope and JSON Schema resource URI scope are not interchangeable identity mechanisms. | Retain native identities within the existing neutral module envelope. |

These findings guide B-007's loss report and later promotion review. A future core
concept needs a defined meaning and bidirectional evidence, not just shared names.


## Directed Projection Findings (2026-09-20)

CONTRACT-004 / US-004 / TD-004 implement the directed JSON Schema-to-Protobuf
profile. Explicit field tags and integer-width policy produce a compiled proto3
target for supported carriers. The machine-readable result retains source,
mappings, policy, limitations and target diagnostics. Unsupported shape/scope
choices block; allowing reported loss is an explicit caller policy.

Nine independently specified instance comparisons and three additional native
checks cover required, bounds, nullability, alternatives, array constraints,
defaults and native encoding differences. The oracle rejects a deliberately
incomplete report. The original JSON Schema is recoverable from retained source;
target-only descriptor reimport demonstrably lacks its validation vocabulary.
The Order and recursive-object fixtures exercise nested definitions/references.
Chromium executes the public projection with the WASM compiler.

The bounded FR-37 demonstration now has all three execution paths: JSON Schema
native round trip, Protobuf native descriptor/source round trip and one directed
projection with known-mismatch reporting. This does not conclude the overall UMF
goal, certify TableSpec/Axon compatibility, support every Protobuf Edition or prove
arbitrary schema equivalence. No native concept is promoted merely because it
participates in this lossy mapping. Next: early DDD semantics and its projections,
then the full extension inventory and programmatic-consumer demonstrations.
