# Action requirement provenance and consumer decisions

2026-10-08. Source: [consumer proposal](consumer-requirements-input.md), owner
instruction to execute the revised requirements/design plan, FR-45 and NFR-50.
This ledger distinguishes consumer obligations from general action meaning.

| Requirement | Source / consumer decision | Placement / status |
| --- | --- | --- |
| Discover typed input, output and failure contracts | Consumer §1; model clients | General action declaration; selected. |
| Describe conditions and bounded changes | Consumer §1; executors | Consumer supplies preconditions/effects. General postconditions and a permitted-write frame are design inferences selected by this investigation; not quoted consumer requirements. |
| Closed create/set/delete/link/unlink recipe | Consumer §1; first graph consumer | `graph-write` execution profile; retain original meaning, do not require every future action to be a static recipe. |
| One atomic store | Consumer §1; mutable graph consumer | First transactional profile; cross-store orchestration excluded. |
| Human on whose behalf execution occurs | Consumer §1 | Required by first graph consumer; general actor-kind attribution is a design inference; the first profile also records the calling service. Service-only actions outside this profile, not universally forbidden. |
| Invocation role policy | Consumer §1 | First role-profile binding; principal/action/resource/context is a possible broader profile, not a selected universal request shape. |
| Optional replay key | Consumer §1 | Preserve optionality; keyed invocations get explicit dedupe guarantees. No-key retries receive no at-most-once promise. |
| Changed identities, version and read receipt | Consumer §1 | Distinct commit outcome and qualified read visibility. |
| Named handler | Consumer §1 | Independent binding to a contract; never an unknown-effect waiver. |
| Ordered unconditional recipe and no allocated keys | Initial design choice | Bounded recipe subset; not universal requirements. |
| Expected-version conflict | Concurrency scenarios | First optimistic concurrency profile; selected, explicit in request identity. |
| Stable replay identity across upgrades | Astra review / lost-ack history | Contract revision is checked payload, not lookup namespace. Selected for keyed first profile. |
| Events/publication | CQRS investigation | Committed outbox facts are separate from delivery; prototype demonstrates separation, no mandatory event sourcing. |
| Full cross-language core diagnostics / authority | Consumer §2–6 | Separate scope; action experiment fixtures do not satisfy these requirements. |

## First clients and decisions

An author must decide whether a contract expresses the business invariant. A
client must determine required inputs and failures, preserve its original revision
and token on retry, and distinguish rejection from unknown commit status. An
executor must decide whether it supports the exact contract/profile and whether
current state/authorization permit a commit. A read consumer must decide whether
its declared projection watermark satisfies a receipt.

## Selected experiment boundary

Synthetic string keys and positive integer quantity; keyed invocations; one local
PostgreSQL store; human principal plus service. Initial authorization and inventory
checks use one transaction; publication and delayed projections are separate.
This is a feasibility profile, not a production authentication implementation or
UMF core/native equivalence claim. No external platform access is required.

## Iteration 2 decisions (owner-directed design improvement)

ACT-09–13 and CONTRACT-053 are design inferences from the system-comparison gaps,
not retroactive quotations of the consumer proposal. Select bounded JSON AST
rules and input-key selectors; discriminate roles from policy bindings; define
snapshot revisions, lookup/expiry, serialized invariant boundaries, enforced
handler access, validation-only preview and separate audit/visibility semantics.
Only the proposed action extension is required now; shared rule, authority,
event and workflow extension extraction remains driven by demonstrated reuse.
No runtime profile has acquired native qualification through these decisions.
