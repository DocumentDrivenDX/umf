# UMF for UMF

`umf.yaml` is the authored definition of current UMF. Records and Fields declare
language objects and properties; the closed `umf.metamodel` vocabulary supplies
structural shapes, key presence and ordered semantic constraints. Required key
presence remains distinct from value nullability and native absence carriers.

The compiler generates the current JSON Schema, portable constraint and domain
data, TypeScript types and standalone structural validators, Python shapes and
the vocabulary package. Generic bounded interpreters execute the same inert
program in TypeScript and Python. Native dialect meaning stays extension-owned;
unknown content is retained and incomplete interpretation remains explicit.
No authored raw JSON Schema fragments or per-core-rule callback names supply
an alternative rule authority.

Edit the model, then run `bun run build:metamodel`. Review the authored and
generated diffs together. `bun run check:metamodel` checks source hashes, output
inventory and byte equality without writing. Generation independently parses
the source, validates the model through generated enforcement and checks the
fixed point. `package.json` and `generated/` are compiler outputs.

The reference, ontology and catalog consume this source and its provenance.
CONTRACT-080 and the authority completion plan qualify current tests, remaining
integration/release gates and historical evidence. Diagram connections describe
language containment, specialization or resolution rather than instance counts.
