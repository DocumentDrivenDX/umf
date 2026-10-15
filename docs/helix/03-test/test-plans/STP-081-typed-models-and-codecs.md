---
ddx:
  id: STP-081
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-081
      kind: informed_by
    - id: TD-081
      kind: informed_by
---

# STP-081: Use typed models, keys and codecs

## Story Reference

**User Story:** [[US-081-typed-models-and-codecs]].
**Technical Design:** [[TD-081-typed-models-and-codecs]].
**Related Solution Design:** [[SD-028]]. **Project Test Plan:** [[test-plan]].

## Scope and Objective

Prove that generated models follow authored presence, keep exact values, cannot
be bypassed at codec boundaries, expose correct key and action types, decode
safely, and are rejected or accepted by pinned type checkers as designed. All
tests and commands are planned and **UNTESTED**. The design-time spike under
`docs/helix/04-build/evidence/typed-persistence/dsl-typing-spike/` is not
acceptance evidence for any AC.

## Acceptance Criteria Test Mapping

| AC ID | Failing test to create | Asserted behavior | Required source citation |
| --- | --- | --- | --- |
| US-081-AC1 | `presence_follows_view` | OrderPatch() omits every field; memo=None remains explicit null; amount=None refuses. Revision is excluded from Create/Patch, placed_at is excluded from Patch and required in Create. Nullable array items/map values preserve None; MISSING array positions/present map values refuse; absent map keys remain absent. No authored default becomes Python execution and no encoded mapping carries MISSING. | `@covers US-081-AC1` |
| US-081-AC2 | `exact_values_match_core` | For every golden vector, the shared-runtime validation and codec verdict for the generated model equals the recorded UMF verdict. Listed accept and refuse cases hold; accepted decimals keep their coefficient; instants with any fixed offset encode to the same UTC carrier. | `@covers US-081-AC2` |
| US-081-AC3 | `boundaries_revalidate` | Subclassing a generated class raises `TypeError`. An invalid `model_construct` instance, an invalid `model_copy(update=...)` result and a nested list mutated after construction each raise at `encode_*`. No raised message contains the offending value. | `@covers US-081-AC3` |
| US-081-AC4 | `keys_and_action_types` | Selected composite Key and alternate Key produce distinct DTOs preserving exact order and KEY_IDENTITY; RecordKey aliases selectedKey only. Entity inputs/relationships use the exact declared Key; wrong-Key substitution fails all three pinned checkers and runtime admission even for equal component types. DTOs are unhashable; digest remains separate. The rejection Literal includes declared codes and reserved ENTITY_MISSING; protocol refusals retain their separate exception paths. | `@covers US-081-AC4` |
| US-081-AC5 | `decode_checks_columns` | `decode_Order` refuses duplicate, missing and unexpected columns before building a mapping (asserted with a spy on mapping construction) and returns a validated `Order` for a valid row whose values equal the carriers' meaning. | `@covers US-081-AC5` |
| US-081-AC6 | `static_and_isolated_import` | pyright, mypy and ty at the pinned versions and configuration report no errors on `static/models/positive/` and exactly the expected rule and line for each file in `static/models/negative/`; a control file proves imports resolved. Generated source contains no `alias`, `validation_alias` or `serialization_alias`; with the `placedAt` to `placed_at` override, `OrderCreate(placed_at=...)` type-checks and encodes the key `placedAt`; every attribute docstring contains its source pointer. In a clean virtual environment with only the profile's pins, importing the package opens no file or socket beyond module loading and `sys.modules` contains none of the forbidden packages. | `@covers US-081-AC6` |
| US-081-AC7 | `runtime_fix_without_regeneration` | Build two `umf_access` wheels with the same runtime ABI, one with a seeded defect in the shared decimal-scale validator. Under the defective wheel, `OrderCreate(amount=Decimal("1.234"), ...)` validates and encodes; under the fixed wheel the same call raises `ValueError` naming `amount` and the scale rule. The generated package's file digests and the `umf-access check` exit status are identical in both runs. | `@covers US-081-AC7` |
| US-081-AC8 | `generated_codecs_are_thin` | Parsing every generated module with `ast` finds each `encode_*` and `decode_*` body to be one `return` of a call into `umf_access` whose arguments include the module's metadata table; metadata tables contain only literals and name references; no `If`, `Raise`, `Try`, `Compare`, `For` or `While` node appears outside Pydantic field declarations. | `@covers US-081-AC8` |
| US-081-AC9 | `clean_on_three_checkers` | In the pinned Python 3.11 environment, pyright, mypy and ty at their profile versions and configuration report zero diagnostics on the generated commerce package and `static/models/positive/`; a search of generated source finds no `type: ignore`, `pyright: ignore` or `ty: ignore`; the US-081-AC1 encodings produce the same mappings on Python 3.11. | `@covers US-081-AC9` |

## Executable Proof

Planned commands (not implemented), run inside the isolated profile environment:

```sh
python -m pytest python/umf_access/tests/test_generated_models.py python/umf_access/tests/test_codecs.py python/umf_access/tests/test_golden_vectors.py
python -m pytest python/umf_access/tests/test_static_corpus.py python/umf_access/tests/test_isolated_import.py
python -m pytest python/umf_access/tests/test_runtime_driven_codecs.py
bun test tests/compilation/access-golden-vectors.test.ts
```

`test_static_corpus.py` runs each checker per corpus file and compares diagnostics
with `expected.json`; negative cases must exit non-zero with the expected rule,
not just any error. Each command's status is kept separately.

Record results under `docs/helix/04-build/evidence/typed-persistence/` with
Python, Pydantic, pyright, mypy and ty versions, the checker configuration, commands,
statuses and observed diagnostics.

## Data and Setup

- The generated package for `fixtures/access/commerce/`, produced by US-080's
  generator. The fixture supplies `names` overrides (`orderId` to `order_id`,
  `placedAt` to `placed_at`) because CONTRACT-067 keeps valid authored IDs as
  Python names by default.
- `fixtures/access/golden-vectors/`: one file per carrier with inputs, authored
  facets and the verdict recorded from UMF validators by the Bun test.
- `tests/compilation/python/static/models/{positive,negative}/` with
  `expected.json`; seeded from the spike's `e9.py` cases and extended to Create,
  Key and action input types.
- A pinned Python 3.11 virtual environment built from the profile's dependency
  list, including pyright, mypy and ty; no global packages.
- Two locally built `umf_access` wheels with the same runtime ABI, one carrying a
  seeded decimal-scale defect, used only by `runtime_fix_without_regeneration`.

## Edge Cases and Failure Modes

Null-and-missing fields, decimals equal across scales, Key equality versus UMF
equality, `.errors()` input leakage, unsupported floating-point Fields (refused
at generation) and `Vector` outside a search index (refused at generation).

## Build Handoff

Create the golden vectors and red tests first, then implement TD-081. Each AC
needs a real assertion with its `@covers` tag. Static negatives count only when
the expected diagnostic, not merely a non-zero exit, is observed. Done only when
every test passes in the pinned environment and evidence is recorded.
