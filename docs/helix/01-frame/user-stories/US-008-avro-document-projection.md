---
ddx:
  id: US-008
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-003
      kind: informed_by
---

# US-008: Project Avro into an explicit document binding

As an integration author, I want a JSON document schema derived from Avro with
encoding choices and semantic gaps exposed, while retaining the original schema.

- **US-008-AC1:** Original Order produces a valid target with recursive references,
  primitive/named/collection types and explicit long/bytes/union policies. Independent
  instance validation checks positive and invalid shapes. Defaults leave writer
  fields required; logical types and known representation losses remain reported.
  Source retention and target-only recovery are checked separately.
- **US-008-AC2:** Strict policy, unknown bindings and unresolved source names block;
  supplied dependency bundles project with qualified mappings and correct types.
- **US-008-AC3:** Native Avro and independent JSON Schema validation compare mapped
  instances. Every observed discrepancy requires its source-positioned fidelity
  issue; deleting that issue fails a negative control.
- **US-008-AC4:** Chromium executes projection through the public browser package.
- **US-008-AC5:** Every official corpus fixture retains its source; projected target
  schemas compile independently, and unsupported standalone cases remain blocked.

No arbitrary instance conversion, native Avro JSON equivalence or full Avro
conformance is claimed. CONTRACT-008 defines the support profile.
