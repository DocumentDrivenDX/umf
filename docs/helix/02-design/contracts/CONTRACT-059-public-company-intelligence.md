---
ddx:
  id: CONTRACT-059
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-027
      kind: informed_by
    - id: CONTRACT-052
      kind: informed_by
    - id: CONTRACT-053
      kind: informed_by
---

# CONTRACT-059: Public-company intelligence fixed profile

**Type:** schema and local projection. **Version:** pack 1.0.0; projection profile 1.0.0. **Status:** draft.

## Purpose

Specify source-preserving, offline SEC research metadata under domain-pack and execution-profile 1.0.0; no new shared extension version.

## Scope and Boundaries

UMF owns schemas and authored scenarios. TableSpec owns local ingestion/archive/engine execution. Public metadata grants no network or code-execution permission. No private data joins or provider-specific model tiers are pack semantics.

## Normative Surface

The canonical table schemas under `spec/domain-packs/public-company-intelligence/umf/` define all exact columns/types/keys. The ontology follows CONTRACT-053. All primary and foreign keys MUST be string identities; CIK values MUST retain ten digits.

| Surface | Rules |
| --- | --- |
| `projectSecSubmissions(text, sourceId)` | Parse a supplied SEC submissions JSON object; require numeric/string CIK and company name, parallel recent-filing arrays; emit company, filing and identifier rows with source IDs and original row JSON. Unknown columns MUST survive row fragments and original input. No retrieval, shard merging or amendment inference. |
| `projectSecCompanyFacts(text, sourceId)` | Parse supplied Company Facts JSON; preserve each taxonomy/concept/unit/array ordinal, numeric token, dates, accession and native JSON. Missing/null value is nullable with distinct `value_state`; strings MUST NOT be silently accepted as numeric facts. No period aggregation or custom/segment support inferred. |
| Identity | JSON tuple encoding of source ID plus native scope/ordinal. Filing identity is the tuple of CIK and accession. Source IDs MUST be nonempty and source-qualified by the caller. |
| `research_profile` | Inert metadata: selected universe, inclusive filing-date window, source coverage, local-source selection, explicit remote candidates and consumer ownership. MUST NOT authorize fetching, model calls or email. |
| Numeric values | Exact JSON numeric tokens are VARCHAR; no JavaScript Number or floating-point arithmetic. Missing/null/zero MUST remain distinct. |
| Screen | Split exact `items` metadata on commas; select 2.01 acquisition/disposition or 2.05 restructuring for 8-K/8-K/A in the declared window. No substring matching; amendment linkage remains unresolved unless independently authored. |
| Hypothesis | Authored interpretation with review status, supporting signal and run; MUST NOT assert an observed company need, model confidence or native fact. |
| Corpus | Fixed external row bindings with per-file SHA-256, lineage and source-specific redistribution policy. No replay or fabricated fallback. |

## Precedence and Compatibility

CONTRACT-052 governs pack/source structure; CONTRACT-053 governs targets, inclusion and graph candidates; this contract narrows domain interpretation. Original sources remain authoritative. Pack, projection and source snapshot revisions are independent. Rebuilds use pinned local sources only; source refresh requires a deliberate pack revision. Unknown source fields remain preserved, not interpreted.

## Error Semantics

Malformed JSON, duplicate members, wrong known types, invalid CIK, unequal recent-array lengths or empty/duplicate accession identities MUST refuse projection. Missing taxonomy units or invalid numeric value types MUST refuse. Integrity/rights/path failures follow CONTRACT-052/053. No retry, live fetching or silent truncation occurs.

## Examples

A source-qualified observation of numeric `9007199254740993.0100` MUST retain that exact token as text. Item `2.02` alone MUST NOT become an acquisition signal. An SEC-selected universe MUST retain `membership_basis: selected-research-universe`, with no S&P equivalence assertion.

## Non-Normative Notes

SEC APIs cover standard entity-wide financial concepts; underlying filings remain necessary for other contexts. SEC's [reuse policy](https://www.sec.gov/about/webmaster-frequently-asked-questions) permits reuse of public filings; these company-authored filings are not described as government-authored works. A declaration is not blanket clearance for unrelated datasets.
