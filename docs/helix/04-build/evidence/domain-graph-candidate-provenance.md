---
ddx:
  id: EVID-DOMAIN-GRAPH-PROVENANCE
  type: implementation-evidence
  activity: build
  status: active
  links:
    - id: CONTRACT-052
      kind: informed_by
    - id: CONTRACT-053
      kind: informed_by
    - id: EVID-DOMAIN-CATALOG
      kind: informed_by
---

# Retained graph candidate provenance

The explicit fixture inventory separates retained graph candidates from current
pack metadata. It covers 16 candidates: 14 with current source pack bytes and two
historical candidates for legal and medical 1.0.0. Their current packs are 1.1.0.
Eight packs have no declared graph candidate data; schema-only graph targets do
not imply that a row fixture exists.

The retained legal and medical source pack snapshots are byte-identical to
`spec/domain-packs/{legal,medical}/pack.json` at source commit
`b36c504b130932987efaaa377cdeecc633a745d3`. Their SHA-256 values are:

| Source pack | Original byte hash |
| --- | --- |
| legal 1.0.0 | `2c8809b23b115947eef46e026f7b2c2d854fdd50baaddf3c7725fc3c07cd6745` |
| medical 1.0.0 | `bc0ab3389b3abd8a54e48b2752e6e08a6b0abfb027c54bf3b9b08c6126bd2e39` |

The candidate audit verifies original pack, archive and ontology hashes plus
source/run provenance. Fixed archives must match the original source pack
semantically; replay archives must name its exact original byte hash. A changed
pack at the same version refuses verification. Existing graph, pack, source,
ontology and ZIP bytes remain unchanged. Historical candidates are not relabeled
as current-pack admission evidence.

Local checks on 2026-10-09:

```sh
python3 -B scripts/domain-packs/test-graph-candidate-provenance.py -v
python3 -B scripts/domain-packs/verify-graph-fixtures.py
bun test tests/domain-packs/graph-candidate-provenance.test.ts
```

Seven provenance regressions cover original version classification, explicit
coverage, missing/duplicate declarations, altered pins, source binding changes,
same-version conflicts, escaping paths and ambiguous declarations. The existing
graph verifier also completes all 16 declared candidate correspondence checks
and its refusal cases. The Bun test invokes the provenance regression script.

This change affects host-only development verification and fixture provenance.
It changes no browser library or public schema API. It supplies no new record,
relationship, graph-engine or current-pack admission result. The original source
commit was checked during snapshot recovery; routine verification depends only
on the retained local artifact bytes and does not require Git history or network.
