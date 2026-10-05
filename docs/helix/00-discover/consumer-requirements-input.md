# Discovery input: consumer requirements for actions, conformance and relationship semantics

Proposed 2026-10-05, for the owner's review. This is source material from
consumers of UMF that sit above a graph store and a warehouse (Truss and Ashlar
are the two that read UMF directly), not an approved requirements document. It
names no particular consuming application.

## Why now

A consumer is being designed as one interface to an ontology served by a
mutable hot store and a warehouse, with type definitions as UMF and writes as
declared actions. Drafting concrete interactions for it showed six places
where it depends on UMF stating something that is not yet stated, or states in a
form another language cannot test.

## 1. Declarative actions (the build brief's "Actions")

Consumers need an action to be a contract a client can discover and an executor
can enforce. The elements that mattered across the interactions:

- A name, a human description, and typed input parameters, where a parameter may
  refer to an entity by its key.
- Preconditions over the inputs and the current state, stated as UMF
  constraints, with a stated failure reason for each.
- Effects as a closed list of primitive operations: create an entity, change
  named properties, delete an entity, link, unlink. Effects are applied as one
  atomic unit against one store. Effects that cross stores are out of scope for
  a first version.
- A result: the identities created or changed and a version, plus an opaque
  receipt a later read can use to ask for data at least as new as the change.
- Idempotency: an optional caller-supplied key so repeating an action creates
  nothing new.
- Attribution: the person on whose behalf it runs, never only the calling
  service, and the action's own name recorded with the change.
- Authorization as metadata: which roles may invoke it, declared in UMF and
  enforced by the executor.
- A declared loss report: the declared effects are claims, so the executor states
  which it verified, as the brief says the implementation remains the accurate
  semantics and UMF is the contract and loss report.
- A named handler hook for logic that does not fit the primitive operations,
  declared by name so the contract stays discoverable.

Compensation and sagas stay as the brief has them: optional and later.

Acceptance sketch: an action that creates a record, links it to two existing ones
and leaves a third unchanged; invoked twice with one idempotency key; refused by a
failed precondition with the reason; round-tripped through a document with
unknown extension content preserved.

## 2. Language-neutral validity fixtures

A second implementation of UMF reading, in a language other than TypeScript, has
to accept and reject the same documents with the same diagnostics, or a catalog
revision will mean different things in different systems. What is needed:

- Fixtures as data: each document with the UMF version it targets and its expected
  validity.
- Each expected diagnostic as severity, code and path. Message text is
  informative, not compared.
- The diagnostic codes treated as a stable, versioned contract.
- A statement of which fixtures are normative for a core version.

Acceptance sketch: a reader written without UMF's library runs every fixture and
reports agreement on validity and on the set of diagnostics.

## 3. Relationship instance semantics

State whether a relationship has at most one instance for a given source and
target, and how multiplicity counts when two instances would connect the same pair.
A consumer that stores edges needs to know whether `(relationship, source, target)`
identifies an instance, because import, replay and publication depend on it. The
proposal is set semantics: one instance per triple, with several distinguishable
links of one kind modeled as an association entity or a second relationship.

Also state which module owns a relationship that names entities in another module,
and that an entity's reference to another module's entity is by key.

## 4. Scalar and value coverage

Confirm the core scalar families consumers can rely on: integer widths, decimal
precision and scale, bytes, and date-time with offset retention. State how a model
should represent a floating-point number and an arbitrary structured value, if no
core scalar exists: a decimal, or a record without identity? A consumer will refuse
a construct it cannot store exactly rather than accept it silently.

## 5. Key equality and canonical text

Truss has pinned a canonical text for key values so that equal keys are equal
bytes: strings as written, binary as base64, timestamps as written with their
offset, integers and decimals by value with trailing zeros and leading zeros
removed. UMF should own key equality, since keys are UMF's. The proposal is that
UMF adopt or correct this and pin the edge cases in fixtures, as the owner's
earlier request for key fixtures already asks. Also: composite primary keys,
which the first consumers refuse for now.

## 6. Authority

The candidate `authority` extension vocabulary may be the place to say which system
is the system of record for a module and which hold replicas, with different
freshness. If it is not, say where that belongs, because a consumer routing a read
to the right store needs it declared, not inferred.

## Open

- Whether actions belong in core or an extension, given the ideals-first approach.
- Which of these UMF considers in scope for the next core revision.
