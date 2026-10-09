---
ddx:
  id: umf.resource.archaeology-open-context-api
  type: resource-summary
  activity: discover
  status: draft
  authoring:
    home: repo
---

# Open Context data/API shapes

## Source

- URL: [Open Context data/API shapes](https://opencontext.org/about/services)
- Accessed: 2026-10-08. Selected record snapshots and media terms require inventory.

## Summary

Open Context documents item and search APIs that expose linked archaeological metadata through JSON-LD.

## Relevant Findings

Record and media searches have separate scopes; native records retain linked identifiers and spatial/temporal context. The cookbook also describes CSV and geospatial export, noting flattening limits. API documentation is a living source and does not pin a project snapshot.

## HELIX Usage

Grounds FEAT-025, US-076 and SD-025. Extract native vocabulary and identifiers from pinned source bytes through declared mapping tooling, not from remembered labels.

## Authority Boundary

Native snapshot/mapping profile. Retain complete supplied records and context dependencies alongside tabular projections; any harvesting stays in separate host-side consumer work.
