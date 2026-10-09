# hr reference pack

Version 1.0.0. Authored synthetic fixtures only. Tables and ontology schemas are UMF-owned; TableSpec owns dataset replay/ingestion. Graph schema is a candidate for Truss/Ashlar binding, not tested native intake.

## Inventory

| Concept/table | Fixture rows | Authored fields |
| --- | --- | --- |
| organizations | 1 | id, name |
| organizational_units | 1 | id, organization_id@organizations, name |
| positions | 2 | id, unit_id@organizational_units, title |
| candidates | 1 | id, name |
| applications | 2 | id, candidate_id@candidates, position_id@positions, status |
| interviews | 1 | id, application_id@applications, starts, result |
| offers | 1 | id, application_id@applications, amount:DECIMAL, currency |
| employment_relationships | 1 | id, candidate_id@candidates, position_id@positions, valid_from, valid_to |
| reporting_relationships | 1 | id, employee_id@employment_relationships, manager_id@employment_relationships, valid_from, valid_to |

## Scenario checks

- two-applications: Two applications yield one offer and employment relationship
- historical: Reporting relation is excluded before its valid period
- candidate: Accepted application does not replace employment identity
- cycle: A self-management assertion remains a visible error

## Generation and limits

Use TableSpec sample-data replay with this pack. Small/demo/large are 1/10/100 independent components. Seed and component ordinal namespace identity strings; all foreign keys follow that mapping. This scales row count, not population validity, time span or network complexity. Original literals and templates remain preserved.

No third-party dataset or native-standard vocabulary is bundled. Ecology is a synthetic scientific-method fixture; archaeology is a synthetic context/evidence corpus with illustrative SVGs, not Madaba Plains records or actual excavation photos. External source selection remains separately governed.
