---
ddx:
  id: umf.resource.ecology-usgs-water
  type: resource-summary
  activity: discover
  status: draft
  authoring:
    home: repo
---

# USGS water observations

## Source

- URL: [USGS water observations](https://api.waterdata.usgs.gov/)
- Accessed: 2026-10-08. Release/snapshot pin and selected dataset reuse terms remain design inputs unless a release is named below.

## Summary

The United States Geological Survey (USGS) Water Data APIs expose water monitoring locations, time-series metadata, continuous values and daily summaries.

## Relevant Findings

Continuous readings and daily statistics have distinct meanings; location and series metadata supply interpretation context. The documentation is a living source; capture API/schema version and response snapshot before authoring a mapping.

## HELIX Usage

Grounds FEAT-024, US-075 and SD-024 ecology/water-management planning. Source vocabulary/code extraction must use an archived release and explicit mapping tooling; no live vocabulary list is copied into these plans.

## Authority Boundary

Location, series and observation profiles. API access does not imply a retained dataset snapshot or permission to erase quality flags.
