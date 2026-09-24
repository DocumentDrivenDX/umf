# Core Key implementation checkpoints

## Candidate 0.6.0 schema and ownership validation

TD-044 and CONTRACT-040 govern the new named primary/alternate-key shape. The
integrated planning branch supplies stable key IDs and normative tuple vectors.
Core 0.6.0 additionally defines explicit Record membership so validation can check
that key components belong to their owning Record without interpreting generic
reference roles as ownership. Legacy `key`, `keys` and `members` remain opaque in
older profiles; migration must archive them before the new profile is activated.

`spec/core/key-document.schema.json` describes the candidate's local shapes.
`validateKeyCandidate` checks referenced Field resolution, unique ownership,
per-record key IDs/names, duplicate component sets independent of order, primary
count, required singular components and defined equality domains. Unknown
qualifiers are retained and diagnosed. This internal candidate validator does not
activate 0.6.0 public `validateDocument` or authoring APIs.

The Bun Key tests pass 3 tests / 375 assertions. Combined Key/Facet candidate
regression passes 6 tests / 1,262 assertions. Chromium 148 independently agrees on
54 cases (15 valid, 39 expected invalid) and 108 JSON/YAML metadata recoveries,
with zero getter executions, host globals or external requests. This is metadata
recovery, not the pending ideal/native Key round-trip gate. See the
[browser record](../../../../fixtures/validation/core-key-candidate-browser.json).
Typechecking and the 279-schema / 48-package audit pass.

The first schema compile exposed missing local property declarations required by
strict AJV; the generator now supplies them. A container fixture initially reached
an earlier scalar/container structural rejection instead of its intended singular
component check; it now uses a structurally valid container. An exact-optional
TypeScript fixture annotation was also corrected. These changes preserve strict
validation and do not relax the Key contract.

The planning branch integration passed 65 binding/relationship/projection tests
with 358 assertions, typechecking and its then-current 278-schema / 48-package
audit. Existing native/browser records remain scoped to their source fingerprints;
this integration is not a fresh native execution or a compatibility refresh.

Next: public key authoring/inspection and stable-ID lookup, exact tuple encoding,
complete operation schemas, collision-preserving migration/rollback, versioned
older operations and selection, then compatibility/native/browser qualification.
The Key core bead remains in progress. None of the five native Key bindings or
ideal-admission gates is claimed complete by this candidate checkpoint.
