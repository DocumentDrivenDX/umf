# Action prior art: questions, access and decisions

Consulted 2026-10-08. These are documented behaviors and UMF design inferences,
not native equivalence claims. No Palantir tenant, Axon runtime, Dafny/Koka compiler,
Cedar evaluator or Temporal server was exercised by this investigation. Public
source/documentation access is distinct from a usable native runtime.

| System / primary source | Can we see/use it? | Decision question and lesson | Stopping condition / limitation |
| --- | --- | --- | --- |
| [Palantir submission criteria](https://www.palantir.com/docs/foundry/action-types/submission-criteria), [function actions](https://www.palantir.com/docs/foundry/action-types/function-actions-overview), [consistency](https://www.palantir.com/docs/foundry/action-types/consistency-guarantees) | Public docs/SDK; trial is a possible access path, no connected tenant here. | Conditions, function-backed edits and isolation are separate concerns. Infer contract plus independently qualified binding, rather than require every action be a static CRUD recipe. | Stop once those distinctions are documented. Native mapping/isolation equivalence remains untested. |
| [Smithy behavior traits](https://smithy.io/2.0/spec/behavior-traits.html) | Public spec/toolchain; repository already has separate native-schema evidence. | Operation typing, idempotence and retry traits describe different guarantees. Name token scope, payload identity, error taxonomy and expiry explicitly. | Concrete lost-ack/deployment history determines UMF keyed semantics; no claim that Smithy defines our replay ledger. |
| [Dafny reference](https://dafny.org/latest/DafnyRef/DafnyRef.html) | Public verifier/source; not installed or run here. | Requires/ensures/read/modify frames distinguish admitted state, promised state and permitted changes. Infer pre/poststate rule binding plus bounded frame separate from implementation. | Representation must express reserve and conditional approve no-op; no formal verification claim. |
| [Koka effect tour](https://github.com/koka-lang/koka/blob/dev/doc/spec/tour.kk.md) | Public language/source; not run here. | Effects expose operational dependencies. An effect annotation does not establish a business postcondition or atomic storage behavior. | Keep rule/frame/handler capability obligations distinct; do not invent a universal evaluator. |
| [Axon command handlers](https://docs.axoniq.io/axon-framework-reference/main/axon-framework-commands/command-handlers/) | Public Axon Framework source; independent reference, not identified with the ambiguous proposal author “Axon.” | Commands request a decision; events record facts; command results and query views differ. | Native outbox/projection history demonstrates separation. Event sourcing is not required. |
| [CQRS pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs), [transactional outbox](https://docs.aws.amazon.com/en_en/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html) | Public architecture descriptions; PostgreSQL is available and exercised. | Commit success does not imply projection visibility or one-time publication. | H13 verifies delayed content and watermark; H17 demonstrates repeated delivery of one domain event. No warehouse guarantee. |
| [Cedar authorization](https://docs.cedarpolicy.com/auth/authorization.html) | Public policy language/evaluator; no runtime test here. | Authorization considers request context and must precede protected replay disclosure. Roles alone are not a universal authorization model. | H08 current denial blocks retained result; general policy request shape remains profile-owned. |
| [Temporal tasks](https://docs.temporal.io/tasks) | Public docs and local-server option; not exercised here. | Retried work needs explicit idempotency and external-effect boundaries. | At-most-once domain commit is distinct from delivery dedupe; no orchestration or exactly-once promise. |

## Selected design

Describe signature, pre/postconditions, finite read/permitted-write frames and
an inert recipe or handler binding. Retain the first graph consumer's human
attribution and role policy without treating them as universal actor semantics.
The stable replay key spans tenant/store/principal/action/token; exact revision,
input and expected-version are compared inside that scope. Pin an original retry
across deployment. Commit, durable terminal rejection, known rollback failure,
unknown acknowledgement, projection visibility and publication have different
observable outcomes.

The decisive runtime questions are tested against PostgreSQL 17.9, not inferred
from the platforms above. The finite protocol model tests safety in its declared
bounds; the portable representation tests preservation and inertness. None
substitutes for a complete public UMF action implementation.
