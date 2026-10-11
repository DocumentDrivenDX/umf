---
ddx:
  id: umf.td061.supreme-court-mirror
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-061
      kind: references
    - id: SD-026
      kind: references
    - id: CONTRACT-060
      kind: references
---

# Supreme Court mirror: first collection slice

## Scope

Realize US-061-AC13–AC15 through a consumer-owned local mirror. Preserve UMF's schema/tooling boundary and the separate completed appellate fixture pack. First collect the complete case inventory visible in the 2024 and 2026 granted/noted lists; collect every listed docket. Qualify PDF acquisition independently and retain a resumable inventory for the entire discovered subset.

## Technical Approach

Python standard-library HTML parsing preserves native docket metadata, proceedings, links and attorney source text. pypdf 6.10.0 extracts case identities from retained official list PDFs. Hash-addressed originals and append-only observations preserve versions. One-second serial HTTPS transport respects the current robots policy. The shared TableSpec 0.0.8 native Python document-loader acquires explicit PDF batches in local-use mode and emits preservation handoffs; the pinned Bun files are compatibility references; it is not forked.

## Component Changes

Add `scripts/domain-packs/supreme-court-mirror.py`, parser/coverage tests, and a source-only companion handoff under `spec/domain-packs/legal-supreme-court/`. Full downloaded party filings remain in the local collection rather than a publicly redistributable pack. Exact shared acquisition files retain their original fingerprints.

## API/Interface Design

CONTRACT-060 governs discovery/archive interfaces; the companion's retained README and schemas govern acquisition. The mirror is an explicitly invoked consumer tool, outside the browser library. No browser support or TableSpec schema admission is claimed for this source-only slice.

## Security and Performance

No credentials; HTTPS exact-host validation and robots enforcement; responses bounded and source content treated as untrusted data. PDFs are never executed. Local counsel text may include publicly posted contacts and is evidence, not an outreach authorization. Full-list docket collection is serial; PDF bytes and document count are bounded per explicit batch. No latency promise.

## Testing

Check real retained docket/list recovery, all object hashes, counsel and PDF associations, HTML drift refusal, duplicate links, unknown/status distinctions, and repeated versions/failures. Frozen tests do not request the Court. Live evidence reports exact counts and subset exclusions.

## Migration and Rollback

Separate directory and companion identity; remove collector invocation to stop collection. Retain archive for evidence. Existing legal/appellate packs remain independently versioned.

## Risks and Unknowns

Granted/noted discovery omits ungranted petitions and many applications. Complete all-case enumeration and unattended scheduling remain future work. Docket HTML is mutable and parser drift must be visible. Some linked documents may be unavailable or exceed companion limits. Party filing reuse rights are unknown.
