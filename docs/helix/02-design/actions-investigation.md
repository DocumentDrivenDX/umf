# Action design investigation and stop conditions

Status: bounded design investigation executed; no production implementation
acceptance follows. Preserve artifact IDs and refine existing drafts in place.

| Question | Competing answers | Experiment / decisive observation | Stop condition |
| --- | --- | --- | --- |
| Does revision belong in replay lookup? | Namespace by revision / stable namespace plus payload check | Commit, lose acknowledgement, deploy, retry; count writes and returned version | One commit; changed revision conflicts; retained original revision replays. |
| Is an action a recipe or a semantic contract? | Mandatory ordered primitives / contract plus separate recipe or handler | Encode create-link, approve, reservation and conditional no-op under both candidates | Demonstrate which obligations each represents; select bounded first profiles. |
| Can one-store semantics be enforced? | Independent writes / locked transaction plus durable result | Real PostgreSQL faults and overlapping calls | Rollback, race and retry assertions pass; mutants are rejected. |
| Can contract preservation imply execution support? | Valid means supported / explicit unchecked profile | Portable prototype with unknown members/rules and missing claims | Unknowns survive; declared compatibility never verifies execution. |
| Does commit imply visibility/publication? | One result / separate commit and watermark | Delay read projection and publication | Lag reports pending; no duplicate domain commit on publication retry. |
| Can another implementer determine outcomes? | Informal prose / exact snapshots, histories and failure states | Independent review without executor helpers | Resolve every material ambiguity for the selected profile. |

## Comparison scope

Read primary documentation for Palantir actions, Smithy operation traits, Axon
commands, Dafny contracts, Koka effects, Cedar policy requests, Temporal retries
and CQRS. Each provides evidence only for its documented role. No whole-platform
integration is needed to answer the questions above. Runtime access gaps block
only native claims for those systems. Record consulted URLs/access date and
separate documented behavior from UMF inference.

## Gates

Design readiness requires exact selected semantics, independent expected
observations, results for decision-changing feasibility experiments and no open
question that can change the chosen interface/guarantees. Portable-library
acceptance requires implementation, public API/schema, browser and regression
proof; all nine US-055 criteria are separate from feasibility evidence. Executor
qualification requires named store/executor/version and real runtime histories.
Pending witnesses leave their respective gate open and never count as passes.

## Experiment layout

[experiments/actions](experiments/actions/) contains a language-neutral history
corpus, simplified TypeScript representation prototype, independent expected-result
assertions, real-store harness and a bounded protocol explorer. Prototype fields are deliberately simplified;
full normative FrameEntry/reference/output validation and profile matching remain
public-library work. The representation probe always reports compatibility false
because it implements no executor claim matching. This design-only
code stays outside the browser library and published schemas. Python/native
process APIs remain host-side; Bun tests drive the portable prototype.

## Completed candidate comparison

[Same-scenario comparison](actions-candidate-comparison.md) compares create-link,
approve and reserve under both candidates. Create-link fits a recipe; a literal
approve can already be a no-op. Reservation requires a pre-state-computed value
unavailable to graph-write/1 ValueBinding without changing the request shape.
That selects semantic contract plus recipe or qualified handler binding.
