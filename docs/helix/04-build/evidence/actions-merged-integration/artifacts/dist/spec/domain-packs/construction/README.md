# construction reference pack

Version 1.0.0. Authored synthetic fixtures only. Tables and ontology schemas are UMF-owned; TableSpec owns dataset replay/ingestion. Graph schema is a candidate for Truss/Ashlar binding, not tested native intake.

## Inventory

| Concept/table | Fixture rows | Authored fields |
| --- | --- | --- |
| projects | 1 | id, name |
| parties | 1 | id, name |
| contracts | 1 | id, project_id@projects, party_id@parties, amount:DECIMAL, currency |
| locations | 1 | id, project_id@projects, grid, datum |
| assets | 1 | id, location_id@locations, asset_kind |
| work_packages | 2 | id, project_id@projects, name, status |
| activities | 2 | id, work_package_id@work_packages, name |
| dependencies | 2 | id, predecessor_id@activities, successor_id@activities |
| resources | 1 | id, activity_id@activities, quantity:DECIMAL, unit |
| cost_items | 1 | id, contract_id@contracts, activity_id@activities, amount:DECIMAL, currency |
| change_orders | 2 | id, contract_id@contracts, status, amount:DECIMAL, downstream_package_id@work_packages, rfi_id@rfis |
| rfis | 1 | id, asset_id@assets, question, status |
| inspections | 1 | id, asset_id@assets, result, method |
| submittals | 1 | id, project_id@projects, asset_id@assets, status, revision |
| bim_references | 1 | id, asset_id@assets, publisher, model_revision, native_object_id |
| documents | 1 | id, project_id@projects, document_kind, reference, availability |

## Scenario checks

- downstream-change: Delay and RFI retain approved downstream change
- bim-submittal: Approved submittal identifies model revision and physical asset
- cycle: Expose directed schedule cycle without deleting dependency
- change: Proposed change stays separate from contract baseline
- evidence: Inspection and RFI refer to same physical asset

## Generation and limits

Use TableSpec sample-data replay with this pack. Small/demo/large are 1/10/100 independent components. Seed and component ordinal namespace identity strings; all foreign keys follow that mapping. This scales row count, not population validity, time span or network complexity. Original literals and templates remain preserved.

No third-party dataset or native-standard vocabulary is bundled. Ecology is a synthetic scientific-method fixture; archaeology is a synthetic context/evidence corpus with illustrative SVGs, not Madaba Plains records or actual excavation photos. External source selection remains separately governed.
