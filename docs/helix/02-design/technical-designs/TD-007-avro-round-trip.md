---
ddx:
  id: TD-007
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-007
      kind: informed_by
    - id: US-007
      kind: informed_by
---

# TD-007: Avro native schema adapter

Use the exact JSON tree already exercised by JSON Schema to preserve Avro schema
JSON. The helper remains in the JSON Schema adapter for now; sharing its encoding
does not establish semantic equivalence between the languages' type concepts.

Register `umf.avro` with structural and bounded semantic validation. Walk native
schema positions separately from default data, and preserve custom attributes.
Use avsc's types-only browser entry with pinned buffer/util shims; no filesystem,
Bun or process global is required in the application. Independent Python tools
remain development-only oracles.

Tests compare all parsed native metadata, exact unsafe-number tokens, copied access
and atomic edits. Native binary comparison uses two independently implemented
encoders and decoders, plus reader-evolution and corruption controls. Reports retain
known validator disagreement. Browser tests execute the actual bundled ESM export.

Next work expands official fixtures and validation coverage before closing B-011;
IDL, protocol/RPC and container artifacts need separate explicit representation
contracts if included in a support profile. Cross-system projections must report
loss and retain source artifacts under FEAT-003.


Named dependencies are represented as an ordered list of independently retained
native trees. The browser interpreter uses a fresh null-prototype avsc registry
for each payload and parses dependencies before the root. It never discovers or
fetches dependencies implicitly. Registry errors remain diagnostics and block
conservative edits. Root-only export refuses to omit the dependency list.

The native dependency oracle creates independent Apache `Names` and fastavro named
schema environments, compares binary behavior before/after export, changes a field
in DocumentInfo from string to bytes, and verifies that stale string data fails.
This demonstrates semantic effects beyond replaying original source text.
