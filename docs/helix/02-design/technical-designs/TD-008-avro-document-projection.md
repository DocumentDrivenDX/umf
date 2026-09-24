---
ddx:
  id: TD-008
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-008
      kind: informed_by
    - id: US-008
      kind: informed_by
---

# TD-008: Avro document projection

Validate the Avro source, copy policy/source and preserve diagnostics before
lowering. Compile ordered dependency declarations before the root; a qualified-name
map allocates JSON Schema definitions before traversing record fields so recursive
references terminate. Primitive encodings are explicit, with strict end-of-string
patterns for decimal/hex strings, including trailing-newline rejection.

Keep native defaults and logical interpretation in source; add source-positioned
fidelity issues rather than materializing misleading JSON defaults. Use `anyOf`
for the selected untagged union binding and disclose branch ambiguity. Reject
unresolved/unsafe interpretation, then import the generated native schema through
the JSON Schema adapter. No storage engine or execution meaning enters core.

Bun tests use independent Ajv instance validation and validate the result contract.
The Python oracle independently maps five authored instance vectors into Avro
values and JSON documents, compares acceptance, and removes the required long-range
issue as a negative control. Chromium exercises dependency-aware schema projection.
Broader instance conversion and additional encoding policies require their own
contracts and evidence.
