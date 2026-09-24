# DDD semantic-profile evidence

`sales.json` is an original UMF-authored profile fixture, created 2026-09-20 from
the owner's DDD requirements. It is not a copied external tool format or a claim
of universal DDD serialization compatibility.

The fixture contains three bounded contexts and ten definitions: Order, OrderLine,
ShippingAddress, Money, sales.Customer, OrderPlaced, Ordering, Orders,
support.Customer and billing.AccountHolder. The sales/support customer structures
are identical but remain distinct identities. Their mapping is one-way and partial,
with explicit limitations and a support-owned anti-corruption layer. Local terms
retain the ubiquitous-language vocabulary. Order owns its entity member while
value definitions retain equality semantics. An aggregate invariant retains its
language, version, scope and expression without being treated as executable.

`tests/ddd/profile.test.ts` checks JSON/YAML retention, copied access, incomplete
interpretation, fully understood atomic edits and twelve semantic corruptions.
They cover identity, equality, dangling references, aggregate scope/ownership,
repository/event targets, invariant boundary, mapping limitations, ACL ownership
and terminology scope. These are authored profile expectations; no independent
external DDD application has certified them. The governing rule specification is
CONTRACT-005, whose status remains draft for review.

Chromium 148.0.7778.0 executes the same library's profile round trip and metadata
edit. The full model's opaque invariant blocks conservative editing; the edit
fixture deliberately removes that uninterpreted rule before exercising a safe
model edit. This is not evidence of executing or enforcing the invariant.

No physical table, graph node, endpoint, message transport or transaction boundary
is inferred. DDD-to-document projection and further target bindings are separate
work and must disclose the semantics they cannot express.

`document-projection.json` records the implemented document binding: embedded lines,
Money and ShippingAddress plus identity-only Customer. The result retains the whole
DDD source, exact physical choices, concept mappings and limitation reports.
`tests/projections/ddd-json-schema.test.ts` validates generated JSON Schema with an
independent Ajv instance. It checks required fields, decimal strings and identity
shape, then demonstrates that a negative total still passes structural validation.
Changing Customer to embedding requires its name without changing the source model.
Missing/unused bindings, aggregate-local identity references, non-data roots and
strict policy block. Target-only JSON Schema reimport has no DDD vocabulary.

Chromium executes the same Order projection. These checks establish the declared
schema binding, not aggregate enforcement or an instance-data converter.
