# DDD-to-GraphQL entity-stage fixture

`case.json` supplies a DDD Order/Customer/Product/OrderProduct model and an
explicit entity, field, scalar and synthetic-root policy. `generated.graphql`
is the report-mode SDL. `report.json` retains source-qualified losses,
including the schema-only root, identity, `Int` range, custom `Decimal`
coercion, optional value and many-field list differences.

`oracle.json` is GraphQL-core 3.2.12 schema validation in an independent Python
process; the portable operation also imports the candidate through
`umf.graphql` schema mode and GraphQL.js 17.0.2. `browser.json` records Chromium
parity and strict refusal. No resolver or GraphQL operation is executed.
Relationships and inverse fields await the relationship core gate and the full
generator bead.
