# manufacturing reference pack

Version 1.0.0. Authored synthetic fixtures only. Tables and ontology schemas are UMF-owned; TableSpec owns dataset replay/ingestion. Graph schema is a candidate for Truss/Ashlar binding, not tested native intake.

## Inventory

| Concept/table | Fixture rows | Authored fields |
| --- | --- | --- |
| facilities | 1 | id, name |
| machines | 1 | id, facility_id@facilities, name |
| components | 2 | id, machine_id@machines, parent_id?@components, name |
| work_orders | 1 | id, machine_id@machines, status |
| material_lots | 1 | id, material |
| production_runs | 2 | id, work_order_id@work_orders, lot_id@material_lots, started_at |
| observations | 3 | id, component_id@components, value:DECIMAL, unit, observed_at |
| alarms | 2 | id, observation_id@observations, condition |
| inspections | 1 | id, run_id@production_runs, method, result |
| maintenance_events | 1 | id, component_id@components, work_order_id@work_orders, action, alarm_id@alarms, occurred_at, resumed_run_id@production_runs |

## Scenario checks

- resume: Temperature alarm precedes maintenance and resumed run
- unit-change: Do not concatenate unlabeled sensor units
- lineage: Trace run through work order and material lot
- maintenance: Replacement identifies the actual component

## Generation and limits

Use TableSpec sample-data replay with this pack. Small/demo/large are 1/10/100 independent components. Seed and component ordinal namespace identity strings; all foreign keys follow that mapping. This scales row count, not population validity, time span or network complexity. Original literals and templates remain preserved.

No third-party dataset or native-standard vocabulary is bundled. Ecology is a synthetic scientific-method fixture; archaeology is a synthetic context/evidence corpus with illustrative SVGs, not Madaba Plains records or actual excavation photos. External source selection remains separately governed.
