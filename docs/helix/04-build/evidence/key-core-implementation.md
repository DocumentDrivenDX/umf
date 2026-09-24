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

## Exact tuple encoding candidate

`src/model/key-tuple.ts` implements `encodeCoreKeyTuple`, receipt verification and
verified byte reading under `umf-key-tuple-v1`. The complete operation schema is
`spec/core/key-tuple-operation.schema.json`. These remain internal candidate APIs;
public 0.6.0 activation, authoring and migration are still pending.

The normative golden vectors and extended boundary matrix cover 58 cases: 26 exact
encodings and 32 expected refusals. Exact decimal spellings and negative zero
canonicalize without Number conversion; nonintegral/rounded inputs reject. Unicode
normalization forms remain distinct; unpaired surrogates reject. Width, precision,
scale and length bounds are enforced. Stable key-ID selection survives key rename
and list reorder; source changes invalidate retained receipts. Unknown relevant
qualifiers, missing identities and forged/nonminimal frames reject atomically.

Bun's combined Key, tuple and Facet candidate regression passes 12 tests / 1,478
assertions. Chromium 148 independently matches all golden/boundary outcomes and
52 JSON/YAML receipt recoveries; it rejects two forged frames and stale source
context, checks shortest count/length framing, and records no getters, host globals
or external requests. See the [browser proof](../../../../fixtures/validation/core-key-tuple-browser.json)
and [checkpoint record](../../../../fixtures/validation/key-tuple-candidate.json).
Typechecking and the 280-schema / 48-package audit pass.

Resource tests refuse aggregate value text and UTF-8 payloads beyond the existing
4,000,000 limit and block huge nonzero exponent expansion before allocation.
Huge width metadata does not allocate a power, and a scale of 9,007,199,254,740,991
can encode an exactly compensating exponent without expansion. Receipt
serialization retains its existing independent limit. Tuple bytes are scoped by
caller-supplied document/Record/Key identity; they prove neither author provenance
nor native uniqueness. No native Key binding or ideal admission is claimed here.

## Explicit Key migration and rollback candidate

`upgradeKeyEnvelope` accepts a valid 0.5.0 source and archives every element-level
`key`, `keys` and `members` collision before producing a 0.6.0 candidate. It does
not adopt valid-looking old declarations. Root/module lookalikes, generic
references and native extension payloads remain unchanged. The complete receipt
schema is `spec/core/key-transition.schema.json`.

`rollbackKeyEnvelope` recomputes the original upgrade, rejects altered receipts,
checks the current candidate's semantic validity and document identity, restores
the exact original envelope and retains the whole later envelope separately.
Later explicit keys and changed native payloads are not applied to the old model
or discarded. Invalid inputs, accessors and wrong profile versions fail atomically.

The combined Key/tuple/transition/Facet candidate regression passes 16 tests /
1,747 assertions. Chromium 148 covers ten collision shapes, 90 archived members,
20 upgrade-receipt recoveries, 20 rollback-receipt recoveries and two recoveries
retaining later assertions. It rejects five forged receipt variants, five wrong
source versions and a wrong document identity, with no getter execution, host
globals or external requests. Typechecking and 281 schemas / 48 packages pass.
See the [browser proof](../../../../fixtures/validation/core-key-transition-browser.json)
and [checkpoint record](../../../../fixtures/validation/key-transition-candidate.json).

These are internal candidate APIs. Public 0.6.0 document support, membership/key
authoring, versioned prior operations and selection, compatibility refresh and
all five native Key bindings remain required. This checkpoint does not close the
core task or admit the Key ideal.
