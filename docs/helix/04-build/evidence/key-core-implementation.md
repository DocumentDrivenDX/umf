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

## Public Key integration checkpoint

Experimental core 0.6.0 is now available through the public browser entry point.
Membership and named-key authoring, inspection and stable-ID lookup preserve
unknown qualifiers and reject changes to an existing key's ordered tuple.
Explicit migration, rollback and exact tuple encoding are exported. Public
validation passes the original 0.6.0 document to extension Registry callbacks,
so native payload validation sees membership and keys without a stripped view.

Existing Field/record-type, Nullability, Cardinality and Facet operations have
new receipt versions for 0.6.0; published older schemas remain unchanged.
Target validation rejects changes that invalidate a key. Selection traverses
explicit membership and key components, terminates on cycles and reports
separate reference boundaries. Older profiles keep these members opaque.

The exact-file core suite passes 95 tests / 3,424 assertions across 19 files.
Three unsupported-future probes now use 0.7.0 because 0.6.0 is implemented.
Typechecking, declaration emission and the 288-schema / 48-package audit pass.
The public browser bundle is 11,285,437 bytes. Chromium 148 verifies eight
operation recoveries, eight document recoveries, ten versioned-operation
recoveries and four selection recoveries, with two Registry callbacks, zero
getter execution and no external requests. It also checks retained unknowns,
stable-ID conflict refusal, tuple verification, rollback and forged/stale refusal.
The [public checkpoint record](../../../../fixtures/validation/key-public-implementation.json)
retains commands, logs and source fingerprints.

The broader core-ideals regression and fresh native/browser compatibility
qualification remain pending. Earlier gate records describe their historical
execution commits; they are not refreshed by copying current hashes. This
checkpoint does not close the core task, admit the Key ideal, establish native
equivalence or implement any of the five native Key bindings.

## Native/browser compatibility refresh checkpoint

All 92 native/browser refresh commands pass against the public Key integration.
The run covers the existing five-system Field, Nullability, Cardinality and Facet
profiles, public and focused Key browser checks, and Avro exact-input float
narrowing. Typechecking, 288 schemas / 48 packages and the public build pass;
all 1,938 snapshotted verification inputs remained unchanged.
See the [native refresh record](../../../../fixtures/validation/key-native-refresh.json)
for completed commands, retained logs, source fingerprints and explicit limits.

The diagnostic pre-refresh run finished with 416 passes and nine failures: three
unsupported-future probes already corrected and six stale-evidence failures.
That failed run is retained separately. A fresh full repository regression across
324 test files is now required alongside the four separate conformance gates and
facet evidence-negative tests. The refresh checkpoint does not close the Key core
task, widen older native profiles to Key semantics or admit the Key ideal.

## Core task acceptance

Experimental core 0.6.0 now passes its core implementation acceptance. The public
schema, typed membership/key authoring, inspection and stable-ID lookup, exact
`umf-key-tuple-v1` encoding, explicit migration/rollback, versioned prior APIs and
selection have Bun and Chromium evidence. The 54-case validator matrix, 58-case
tuple matrix, 90 archived migration collisions and public entry-point checks all
pass without getter execution or external browser requests.

Qualification at commit `561f6a68` passed 92 native/browser refresh commands,
1,213 regression tests / 113,170 assertions across 324 files, and ten separate
conformance/evidence tests / 159 assertions across five files. The recorded
inventory accounts for all 329 test files. Field, Nullability, Cardinality and
Facet gates all pass, with native equivalence still unclaimed. Typechecking,
declaration emission, the public browser build and the 288-schema / 48-package
audit pass. Source/schema/script/test inputs remained unchanged during the run.

The [acceptance record](../../../../fixtures/validation/key-core-acceptance-evidence.json)
qualifies the core task, including the core portions of US-044-AC1/10/11/12.
US-044 native binding, enforcement, five-system delivery and ideal-admission
requirements remain open. No SQL index or native schema observation is promoted
to authored key intent by this acceptance. Documentation status changes after the
run have their own before/after fingerprint ledger and consistency verification;
the original gate output and native execution counts remain historical evidence.
