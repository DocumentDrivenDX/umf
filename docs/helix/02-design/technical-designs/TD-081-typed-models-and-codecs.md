---
ddx:
  id: TD-081
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-081
      kind: informed_by
    - id: SD-028
      kind: informed_by
---

# TD-081: Use typed models, keys and codecs

**User Story:** [[US-081-typed-models-and-codecs]]. **Feature:** [[FEAT-028]].
**Solution Design:** [[SD-028]].

## Scope

The content of the generated `models.py`, `keys.py`, `codecs.py`, the action type
part of `actions.py`, and the `umf_access` runtime helpers they import. The
`fields.py` query surface is TD-082; the `Actions` client call path is US-085.
CONTRACT-068 is authoritative.

## Technical Approach

**Separate classes per view.** For each selected Record the emitter writes `Order`,
`OrderCreate` and `OrderPatch` from the IR's CONTRACT-070 FieldViews, and one
class per named projection. Field types follow a fixed table:

| View presence | Python annotation | Default |
| --- | --- | --- |
| required | `T` | none |
| null only | `T \| None` | none |
| missing only | `T \| MISSING` | `MISSING` |
| missing and null | `T \| None \| MISSING` | `MISSING` |
| Patch field | `T \| MISSING` (plus `None` when `create.null`) | `MISSING` |

Generated and immutable fields are left out of Create or Patch, so
`extra="forbid"` rejects them. Authored defaults never become Python defaults;
the manifest records default execution as an engine obligation.

**One hardened base.** Every class derives from `umf_access.types.StrictModel`
(`strict=True`, `extra="forbid"`, `frozen=True`, `revalidate_instances="always"`,
`hide_input_in_errors=True`), is decorated `@typing.final`, and inherits an
`__init_subclass__` that raises `TypeError`. No field aliases are emitted, so
constructor parameter names are what type checkers see.

**Exact values in shared validators.** Carrier checks live once in
`umf_access.values` (decimal scale and precision via `Decimal.as_tuple()`,
integer width bounds, `date` versus `datetime`, instant awareness and precision,
local naivety, surrogate rejection). Generated models attach them with
`Annotated[..., AfterValidator(...)]` parameterized by authored facets, so the
emitted code stays small and the logic is tested once against UMF's validators.

**Codecs revalidate.** `encode_*` reads raw attribute values from the instance,
validates the whole graph through `model_validate` on a fresh dict, then maps
Python names to authored Field IDs and converts to the CONTRACT-072 carriers,
omitting `MISSING`. `decode_*` checks the column inventory for duplicates, gaps
and extras before building a mapping, converts carriers to Python values and
validates. Neither trusts an existing instance.

**Keys and actions.** `<Record>Key` keeps declared component order, sets
`__hash__ = None` and exposes `KEY_IDENTITY`; the package exposes
`BUNDLE_INPUT_DIGEST`. `<Action>Input` uses Key DTOs for entity parameters and
`T | MISSING` for optional ones; `<Action>Rejected.code` is a `Literal` union.

**Static evidence so far.** The design-time spike in
`docs/helix/04-build/evidence/typed-persistence/dsl-typing-spike/` (`e9.py`,
`shop/models.py`) shows pyright 1.1.414 and mypy 2.4.0 rejecting an unknown Patch
keyword, a `float` for `Decimal` and `None` for `datetime` on `@final` models with
this configuration and `MISSING` defaults under Pydantic 2.14.1. It does not cover
codecs, golden vectors or nested mutation; those remain UNTESTED.

## Component Changes

Planned new paths:

- `src/compilation/targets/python/index.ts` — models, keys, codecs and action type emission (shared with TD-080).
- `python/umf_access/src/umf_access/types.py` — `StrictModel`, `MISSING` re-export, `Vector`, error types.
- `python/umf_access/src/umf_access/values.py` — carrier validators and transport conversions.
- `python/umf_access/src/umf_access/codec_support.py` — inventory checks and revalidation helpers used by generated codecs.
- `tests/compilation/python/static/models/` — positive and negative static corpora with expected diagnostics.

## API/Interface Design

| Surface | Contract | Use |
| --- | --- | --- |
| Generated modules and value policy | CONTRACT-068 | Models, keys, codecs, action types |
| View presence and temporal kind | CONTRACT-070 | Annotation and default selection |
| Transport carriers | CONTRACT-072 | Encoded and decoded representations |
| `CoreKeyIdentity`, value validators | CONTRACT-040/049 | Key identity and golden-vector oracle |

The temporal golden-vector oracle is CONTRACT-075's typed-access profile,
selected from authored CONTRACT-070 date/instant/local meaning. Generic core
validators remain the oracle for their defined non-temporal value domains.
Python instant carriers normalize to UTC before lossless token comparison; no
truncation, offset inference or temporal Key support is introduced.

## Data Model Changes

None to UMF or databases. The golden-vector corpus is a new versioned test
resource shared by the TypeScript and Python suites.

## Integration Points

The Python side depends only on Pydantic at the profile's pinned version and on
`umf_access`. The golden-vector oracle runs UMF's TypeScript validators in Bun to
produce expected verdicts; the Python test reads the recorded verdicts, so the
generated package never imports UMF.

## Security

Validation errors carry field and rule only (`hide_input_in_errors=True`);
generated code never calls `.errors()` with input or logs model dumps. Codec
boundaries revalidate, so a `model_construct` bypass cannot smuggle unchecked
values into storage. Imports perform no I/O.

## Testing

| AC ID | Planned test | Design assertion | Location |
| --- | --- | --- | --- |
| US-081-AC1 | `presence_follows_view` | Presence table and Create/Patch exclusions; `MISSING` omitted, `None` kept; no Python default for authored defaults | `python/umf_access/tests/test_generated_models.py` |
| US-081-AC2 | `exact_values_match_core` | Every golden vector gets the same verdict from generated code and UMF validators; no quantization; UTC normalization | `python/umf_access/tests/test_golden_vectors.py`, `tests/compilation/access-golden-vectors.test.ts` |
| US-081-AC3 | `boundaries_revalidate` | Subclass `TypeError`; `model_construct`, `model_copy(update=...)` and nested-mutation refusals at codecs; value-free messages | `python/umf_access/tests/test_codecs.py` |
| US-081-AC4 | `keys_and_action_types` | Key order, `KEY_IDENTITY`, `__hash__ is None`, separate digest constant, action input and failure-code types | `python/umf_access/tests/test_generated_models.py` |
| US-081-AC5 | `decode_checks_columns` | Inventory refusals before mapping; full revalidation on decode | `python/umf_access/tests/test_codecs.py` |
| US-081-AC6 | `static_and_isolated_import` | Corpora pass and fail as expected on both pinned checkers; no `alias`, `validation_alias` or `serialization_alias` in generated source; override renames the parameter but not the encoded key; docstrings cite pointers; isolated import loads no forbidden module and opens no file or socket | `python/umf_access/tests/test_static_corpus.py`, `python/umf_access/tests/test_isolated_import.py` |

STP-081 is the authoritative mapping. All tests are planned and UNTESTED.

## Migration & Rollback

Generated code is replaced only through US-080's writer; rolling back reverts the
consumer's package directory. Changes to `umf_access` value helpers are a runtime
release; a change that alters accepted values is a new ABI version, not a patch.

## Implementation Sequence

1. Build the golden-vector corpus and record UMF verdicts.
2. Implement `umf_access.types` and `values` against the corpus.
3. Emit models, keys and codecs; add static corpora.
4. Add the isolated-import check and record evidence.

## Risks

| Risk | Mitigation |
| --- | --- |
| `MISSING` behaves differently under a later Pydantic | Exact pin per profile; the profile is unqualified if the spike's checks fail |
| Annotated validators hide types from checkers | Static corpora check that annotations stay `T`, `T \| None` or `T \| MISSING` |
| Generated validators and UMF diverge on an edge value | Disposition is not `exact`; strict generation refuses |
