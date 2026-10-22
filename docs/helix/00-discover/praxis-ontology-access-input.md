# Praxis input: generated ontology access

The owner supplied the [original Praxis request](inputs/praxis-ontology-access-request-2026-10-18.txt)
for typed ontology access code. It contains R1–R21, covering a language-neutral
API description, stdlib-only Python clients, typed reads/actions, a consumer-owned
transport, deterministic generation, drift checks and binding tests.

The owner subsequently clarified the product direction: developers use the
latest UMF, now and as it evolves. They generate from the schema they already
have. Compatibility selection, historical source variants and extra access
models must not become their workflow. The implementation targets UMF 0.10.0,
including UUID, bits128 and semantic references.

[FEAT-033](../01-frame/features/FEAT-033-generated-ontology-access.md) carries the
requirements, retaining OA-01–OA-21 traceability to the original request.
[SD-033](../02-design/solution-designs/SD-033-generated-ontology-access.md) records
the design. Table and ontology access remain part of UMF's schema-to-code goal.


The [2026-10-20 adoption asks](inputs/praxis-ontology-access-asks-2026-10-20.md)
retain the consumer's release-cohort observations and eight requests. This is
fake-transport/generator evidence, with no Truss, Weft or PostgreSQL execution.
Current UMF remains the authoring target. Hohfeld/Praxis owns legacy-action
conversion; UMF must diagnose action-shaped content it cannot generate.
