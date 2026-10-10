# education reference pack

Version 1.0.0. Authored synthetic fixtures only. Tables and ontology schemas are UMF-owned; TableSpec owns dataset replay/ingestion. Graph schema is a candidate for Truss/Ashlar binding, not tested native intake.

## Inventory

| Concept/table | Fixture rows | Authored fields |
| --- | --- | --- |
| institutions | 1 | id, name |
| people | 1 | id, name |
| courses | 1 | id, institution_id@institutions, code |
| academic_terms | 1 | id, starts, ends |
| course_offerings | 2 | id, course_id@courses, term_id@academic_terms |
| enrollments | 1 | id, person_id@people, offering_id@course_offerings |
| assessments | 3 | id, offering_id@course_offerings, name |
| results | 2 | id, enrollment_id@enrollments, assessment_id@assessments, score:DECIMAL |
| prerequisites | 1 | id, course_id@courses, prerequisite_id@courses |

## Scenario checks

- missing-result: An assessment without result remains missing
- offering: Expose a result for another offering
- valid-result: The valid result stays attached to the right offering
- prerequisite: Self-prerequisite remains an explicit contradiction

## Generation and limits

Use TableSpec sample-data replay with this pack. Small/demo/large are 1/10/100 independent components. Seed and component ordinal namespace identity strings; all foreign keys follow that mapping. This scales row count, not population validity, time span or network complexity. Original literals and templates remain preserved.

No third-party dataset or native-standard vocabulary is bundled. Ecology is a synthetic scientific-method fixture; archaeology is a synthetic context/evidence corpus with illustrative SVGs, not Madaba Plains records or actual excavation photos. External source selection remains separately governed.
