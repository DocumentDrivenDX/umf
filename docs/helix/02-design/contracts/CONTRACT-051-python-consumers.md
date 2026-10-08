---
ddx:
  id: CONTRACT-051
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
---

# CONTRACT-051: Official Python consumers

**Type:** library. **Version:** Python package 0.8.0. **Status:** draft.

## Purpose

Give Python consumers official models and reusable support machinery while
keeping their extension definitions and execution semantics outside UMF core.

## Scope and Boundaries

Distribution `umf-core`, import namespace `umf`, resides under `python/` in UMF.
Canonical `spec/core` JSON Schemas own structure; Pydantic MUST NOT create a
competing document schema. No TableSpec import or JavaScript runtime is allowed.
The initial Python semantic subset covers identity, references, scalar/role labels
and extension registration. Facets, keys, relationships and literal constraints
MUST report unchecked semantics, not semantic completeness. Package version and
core document version are separate identities even when their numbers coincide.

## Normative Surface

| Surface | Contract |
| --- | --- |
| `Document.model_validate(mapping)` | Apply exact version's canonical structure and portable JSON admission; preserve unknown content; reject unsupported core versions and coercion. |
| `Document.to_dict()` / `checked_copy()` | Retain absent versus explicit null and unknown content. Copies MUST be isolated; checked_copy revalidates mutable state. |
| `Document.model_json_schema()` / `core_schema(version)` | Return canonical schema copies; default schema is core 0.8.0. |
| `Element`, `Module`, `Reference`, `Vocabulary` | Pydantic access models; canonical Document admission is required before claiming document validity. |
| `read_document(text,format)` / `write_document(document,format)` | JSON or YAML 1.2. Preserve data; reject duplicate keys, aliases, explicit tags, unsafe integers, negative zero and decimal parsing loss. |
| `read_json_value` / `write_json_value` | Same portable JSON boundary for consumer payloads. Exact larger numbers use explicit string carriers. |
| `schema_validator(schema)` | Honor the declared built-in dialect (default Draft 2020-12); unknown dialects and nonlocal references refuse. |
| `Registry.register(Extension(...))` | Explicit id/version/scopes/schema and optional semantic callback. Reject duplicate registration and nonlocal schema references; no implicit code or network loading. |
| `validate_document(document,registry)` | Return valid, complete and diagnostics with code/path/message/severity. valid means checked rules passed; complete requires no unknown/unchecked content. Callbacks receive copied payload/context. |

Unknown core and extension content MUST remain serializable. Unsupported semantic
surfaces MUST emit warnings; unknown versions MUST NOT silently choose a fallback.
Schema resources MUST be included in both source and wheel distributions.

## Precedence and Compatibility

Core schemas remain structural authority across languages. Consumer extension
schemas and callbacks are explicitly registered at exact versions. A consumer
MUST qualify the semantic subset it implements; structural validity alone MUST
NOT authorize pipeline execution of uninterpreted relevant properties.
Legacy migration and recovery remain consumer operations, using shared machinery.
No npm publication is required for a Python consumer. No PyPI publication claim
follows from a built wheel.

## Error Semantics

Malformed portable values or schema failures raise ValueError (Pydantic validation
errors included). Validation reports convert admission failures to STRUCTURE
errors. Missing extension registrations retain content with UNKNOWN_EXTENSION
warnings. Callback failures become VALIDATOR_FAILURE errors, never success.
Unknown semantic properties make complete false. Revalidation failure leaves
caller-owned source data unchanged.

## Examples

```python
from umf import Document, validate_document
source = Document.model_validate({"umf": "0.8.0", "id": "orders",
                                  "vocabularies": {}, "modules": []})
assert validate_document(source).complete
assert source.to_dict()["id"] == "orders"
```
