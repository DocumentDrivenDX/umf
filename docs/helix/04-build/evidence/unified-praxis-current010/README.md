# Current Praxis fixture and transport mapping

This is fixture/design preparation for [FEAT-033](../../../01-frame/features/FEAT-033-generated-ontology-access.md),
[SD-033](../../../02-design/solution-designs/SD-033-generated-ontology-access.md)
and [CONTRACT-079](../../../02-design/contracts/CONTRACT-079-unified-python-access.md).
It does not qualify production Praxis, Hohfeld, a database or handler execution.
The separate source fixture is newly derived UMF0.10, not the original capture.

## Exact consumer input

The observed current local Praxis consumer is `/Users/erik/Projects/praxis-harness-tg`
at `0d7a11d0faf48ecff744e4e89f34f753050c5cb6`, from the Skadden
`praxis-harness` repository. It pins Hohfeld0.4.5. Its actual configured inputs are:

- `config/hohfeld/catalog/catalog.umf.json`: 73,079 bytes,
  SHA256 `6b59abf445829667ee1ae9d66f2402064ba613edc26bde026467c041b947f507`.
- `config/hohfeld/catalog/seed.json`: 40,461 bytes,
  SHA256 `bf6147c3967d818686d12e49d102404a0b0bb24da8e88a312657142fd2509230`.

`praxis/hohfeld_world.py` loads these inputs. `praxis/inventory_reads.py` reads
the six types as the user through Hohfeld's `query`, with key-ordered pages,
bound scalar filters, related keys and point lookups. The console uses Hohfeld's
single-action invocation surface. The source has 20 module-level stand-in
actions. Hohfeld's own `src/hohfeld/umf.py:43,106` currently accepts only0.7;
`src/hohfeld/actions.py` explicitly calls its declaration shape a stand-in.
These are consumer migration facts, not reasons to admit old syntax in UMF.

The action actually changing product coverage is **ChangeCoverageLevel**, on
CoverageAssertion. It is not an invented ChangeCoverage action on Solution.

## Explicit authoring derivation

`derive.py` consumes only the pinned original schema/seed digests. It is an
evidence-local fixture authoring script, not a public legacy adapter or runtime
version selector. Reproduce from a checkout containing those exact inputs:

```sh
python3 docs/helix/04-build/evidence/unified-praxis-current010/derive.py \
  --praxis /path/to/praxis-harness \
  --output tests/unified/praxis
```

The current fixture is [catalog.json](../../../../../tests/unified/praxis/catalog.json),
with [provenance and the complete action mapping](../../../../../tests/unified/praxis/provenance.json).
The 131 seed steps remain byte-identical ordinary data/action calls. The source
fixture retains all six records, field definitions, stable key IDs, nine directed
relationships, their limits, unknown metadata and presentation attachments.
Only the core envelope, actions vocabulary and action location/form change.
Optional authored names remain absent exactly as in the consumer source. Valid
current ID-only fields and records must not be renamed simply to avoid a compiler
limitation; bindings need a documented name-or-ID policy with exact IDs retained.
No output is described as an unchanged original capture.

All20 declarations use actual `umf.actions/0.1.0` shapes: typed Field/Key
parameters, exact bounded key/entity selectors, explicit read/write frames,
ordered preconditions, failure identities and a consumer-owned handler identity.
The old `module.actions` property is removed. Existing `absent` and `exists`
preconditions become `rules/1` not-exists and exists expressions over pre-state
frames. Their original identities, messages and order remain unchanged.

Handler bindings are deliberate. The supplied Add*/Correct* actions include
optional assignments. `graph-write/1` forbids binding optional parameters to
unconditional effects; pretending these are qualified recipes would change
meaning. `x-praxis-handler-contract` therefore retains both the original exact
declaration and a normalized, ordered effect contract using current Field/Key/
relationship references. Missing or explicit-null optional inputs produce no
assignment in the observed Hohfeld resolver; they do not unset a property.
The handler profile, authorization profile and retained contract are **inert,
unchecked consumer metadata**. They load no code and grant no authority.
No recipe interpreter or replacement Hohfeld engine is introduced.

The actual current reader and validator accept this0.10 fixture structurally;
all20 actions pass `admitAction` and action analysis with zero errors. Validation
is incomplete because DDD/presentation/handler meaning remains uninterpreted.
That incompleteness must not become an executor qualification claim. Original
validator diagnostics are retained; no validator result is rewritten.

## Known presentation metadata

Real selected fields contain `hohfeld.view/0.1.0` metadata such as
`{label:"Delivery",format:"badge",tones:{chat:"blue",handoff:"amber",app:"teal"}}`.
For this generator it is presentation-only. Keep its complete JSON in the API
description/metadata with explicit retained-only interpretation. Do not derive
types, authorization, filters or effects from labels/tones. Do not generalize
this to accepting unknown selected logical extensions.

## Single action wire mapping

[wire-examples.json](../../../../../tests/unified/praxis/wire-examples.json)
provides concrete requests for the real seeded identities. They are examples,
not captured live responses. The generated call is:

```python
receipt = await Actions(client).change_coverage_level(
    level="full",
    coverage_assertion=CoverageAssertionKey(code="aderant.client-reporting-budgets"),
)
```

The request identifies `catalog.ChangeCoverageLevel`; its typed key uses the
exact field ID `CoverageAssertion.code`. A consumer binding resolves the
selected declaration, verifies its exact schema digest, decodes that sole key
component, and delegates to the authenticated user's existing session:

```python
ontology.invoke(
    "catalog.ChangeCoverageLevel",
    {"level": "full", "coverageAssertion": "aderant.client-reporting-budgets"},
    idempotency_key=request["idempotency_key"],
)
```

This is a mapping specification, not an implemented transport. It must not
re-resolve caller-authored effects or run the retained handler contract. The
current Hohfeld registration path needs actual0.10 consumer migration before
this can be claimed as a live current-format integration.

For this single update, map actual Hohfeld receipt `refs` to typed `changed`
keys, `created` to the empty array, preserve all five actual change counts and
pass the authoritative `token` unchanged as `consistency_token`. No business
output exists. Do not fabricate a token, infer commitment from an exception or
retry uncertain writes. Other20-action result classifications require their
actual effect/receipt contract; a generic touched-reference array is not proof
of which refs were created. No such broader execution claim is made here.

Read mapping is similarly once at the consumer boundary: exact typed field IDs
such as `Solution.code` select declared local names such as `code`; values remain
bound parameters. Hohfeld's result has local column names and `truncated`, not
the unified wire's field-ID rows and opaque cursor. The adapter must rename
columns through the declaration, preserve absent/null, and own a query/source/
ordering-bound cursor. It must not reinterpret a Hohfeld revision as a source
digest or a row position. `at_least` passes the unchanged host token to the same
authoritative read. Unsupported reads return explicit unsupported outcomes.

## Focused acceptance tests for the implemented release cut

1. Read/validate exact0.10 source; six record identities, nine relationships,
   20 unique action IDs in original order. No module.actions or old-version
   admission. Verify fixture/seed/source/action hashes and exact retained views.
2. Generate all20 typed handler methods with no business output. Retain handler
   contracts/preconditions/effect order in description as unchecked metadata.
   Reject malformed typed references and unknown logical field extensions.
3. Isolated Python3.11 `-S`: list and by-key Solution reads and typed
   CoverageAssertion key. Preserve optional missing values, explicit-null cells
   and exact source identity. The actual addresses relationship is many-valued;
   the current table host only admits to-one relationship bindings. Assert an
   explicit unsupported outcome, never misdeclare the fixture as to-one. This
   test does not qualify broader relationship projection or sparse-record
   absence preservation in a nullable SQL table.
4. Assert the single ChangeCoverageLevel wire request above, host-returned
   changed key/counts/token, then a by-key read with that exact `at_least` token.
   Wrong key owner refuses before dispatch; named failed precondition and denied
   outcome remain typed; lost response remains uncertain without retry.
5. For CorrectSolution, omitted summary stays absent in the wire; explicit null
   remains an explicit null input and the external handler's documented no-op
   assignment behavior is unchanged. No implicit unset or generated effect.
6. Run shared read/list/single-action scenarios through final installed SDK and
   exact published Weft0.4.45/host wheel as the table cohort; separately qualify
   an actual migrated Hohfeld binding. A mock mapping assertion does not count
   as native Hohfeld or production Praxis qualification.
7. Regenerate and compare full bytes/hashes in Bun and Chromium, run the existing
   positive/negative three-checker corpus, and retain independent artifact pins.

Broader batches, TypeScript output, naming overrides and API diff remain feature
inventory, not automatic next-release blockers derived from unassigned story
priority. This preparation does not quietly change their governing requirements.
