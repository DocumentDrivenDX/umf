---
ddx:
  id: umf.design-system
  type: design-system
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
    - id: umf.architecture
      kind: references
---

# UMF interface and brand system

Scope: the UMF microsite, developer guide, browser playground, schema explorer and ecosystem
page. Owner direction on 2026-10-07 requests a themed, attractive site with
design language, brand voice and a logo. This first visual identity is draft
pending human review; no trademark exclusivity or external brand research is
claimed.

## Brand premise and voice

The category is **schema interchange fabric**, from the product direction.
The public headline is **A shared model for your schemas.** Explain what
a visitor can read, preserve or generate before introducing the underlying
metamodel. **Never silently lose meaning** remains the governing principle.

Write for engineers building metadata consumers. Use direct verbs: preserve,
inspect, validate, retain, project, report. Explain unfamiliar terms before
depending on them. Separate a valid envelope from complete interpretation,
retained source from target expressibility, and declared support from evidence.
Keep version, subset and limitations beside capability claims. Label planned
ecosystem integrations as planned, and historical evidence as historical.

Use: “The content stays in the document, but the library could not check it.”
Avoid: “Convert any schema flawlessly.”
Use: “TableSpec uses an earlier UMF format. Its move to the shared model is planned.”
Avoid: “One schema already powers every ecosystem project.”

Keep internal review stages, admission gates and execution ledgers out of public
copy. Link to technical references when visitors need version and operation
details. Use descriptive headings and concrete examples; avoid repeated slogans,
ceremonial labels and strings of abstract nouns.

Do not expand UMF into a new name or call it a universal schema language.
TableSpec’s existing README expansion describes its legacy table format;
the microsite distinguishes that lineage from the shared-core integration.
Do not invent customers, adoption metrics, deadlines or native equivalence.

## Logo

The **interwoven schema mark** uses three horizontal and three vertical strands.
Alternating crossings keep each strand visible: a metaphor for distinct native
meanings traveling together. One olive strand provides recognition without
suggesting that the other strands collapse into one.

The editable vector master is
[logo.svg](../05-deploy/microsite/dist/logo.svg). Use the symbol beside the
lowercase **umf** wordmark; the standalone symbol serves as the favicon.
Keep clear space of at least one stroke width, preserve aspect ratio and
use the paper background to retain crossing separations. Minimum intended
symbol size is 24 CSS pixels; simplify only through a separately reviewed
small-size variant. No raster generation is required for this geometric logo.

## Navigation and Active State

Use one top navigation on every page: Overview, Developers, Playground, Schemas,
Ecosystem and the external GitHub repository. The current internal route has
`aria-current="page"`. Its visible forest underline is derived directly
from `nav a[aria-current]`; it is not a separately assigned visual class.
The logo links home. Small screens wrap navigation without hiding destinations.

| Surface | Component | Active cue | Semantic |
| --- | --- | --- | --- |
| Primary navigation | Internal route link | 2px forest underline | aria-current="page" |
| Schema catalog | Selected schema button | Olive panel and border | aria-current="true" |
| Schema definitions | Selected definition link | Forest fill and paper text | aria-current="true" |

## Visual Hierarchy

- Layout: bounded 1280px editorial canvas; 5% inline gutters. Overview opens
  with a two-column headline and schema-fabric diagram. Working controls lead
  the playground immediately below its short introduction.
- Type: Georgia display headlines give the project a distinct editorial voice;
  DM Sans body text and DM Mono technical labels support reading and inspection.
  System sans-serif and monospace fallbacks keep the interface usable offline.
- Emphasis: forest text and solid primary actions; olive italic headline emphasis;
  restrained outlined secondary actions. Evidence and limitations remain readable.
- Spacing: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 80px rhythm. Cards group
  parallel ideas; rules separate sections. The fabric grid repeats the logo’s
  crossing motif rather than unrelated decoration.
- Responsive: collapse grids to one column below 800px; preserve editable text,
  navigation and horizontal scrolling inside reference tables.

The schema explorer pairs a searchable catalog with a definition inspector.
The catalog groups each pack/version into Overview, Schemas and Domain types.
Examples and local files have separate groups. The detail pane shows pack
breadcrumbs, and column domain-type links resolve within the owning pack/version.
On small screens, the catalog becomes a bounded, vertically scrolling tree
above the inspector. Native declarations, retained extensions and original source use
expandable sections; interpretation limits remain beside the schema title.

## Interaction States

| State | Applies to | Convention |
| --- | --- | --- |
| Hover | Links, buttons, overview cards | Darker action fill; olive links; subtle card lift |
| Keyboard focus | Links, buttons, selects, textarea, summaries | 3px olive outline with 4px offset |
| Loading | Playground module initialization | Explicit library-loading status |
| Ready | Changed source, preset or output format | Clear previous output and diagnostics; ask for a fresh check |
| Success / incomplete | Playground result | Text states validity, interpretation and retention separately |
| Refusal | Invalid source or unsupported core version | “Check refused”; no output; diagnostic explains correction context |

Announce result updates through a polite live status region. Label every input.
Honor reduced-motion preferences: remove smooth scrolling and card movement.
The playground exposes diagnostic codes because developers need the contract
identifier and path. Disabled and asynchronous submission states are absent
from this synchronous operation and are not invented.

## Tokens

### Color

| Token | Value | Use |
| --- | --- | --- |
| paper | #f4f1e9 | Main background, reversed foreground |
| ink | #203c35 | Forest text, buttons and logo |
| muted | #65736b | Secondary prose and captions |
| line | #d2d9ce | Borders and section rules |
| accent | #d8f078 | Lime accent reserve |
| olive | #6a843c | Headline emphasis and diagram links |
| weave | #97ad50 | Distinct logo strand |
| panel | #e9edde | Informational callouts |

### Spacing

Use the rhythm above. Card padding is 25px; primary controls use 13px by 20px;
section spacing is 65px, reducing to 40px on mobile. Corner radii are 4–10px.

### Type

Display: Georgia, 48–84px / 1.03, regular, -3px tracking (mobile -2px).
Section title: Georgia, 32–48px / 1.15, regular.
Card title: DM Sans, 21px / 1.3, bold.
Body: DM Sans, 16px / 1.65; introduction 18px.
Code: DM Mono, 13px / 1.65; technical labels 12px with 1px tracking.
Controls: DM Sans, 14px, semibold.

## Non-Goals

This document records the interface and public identity. Runtime architecture,
deployment and data flow belong in architecture and deployment records;
component implementation internals belong in technical designs; significant
architecture decisions belong in ADRs. This identity does not change UMF’s
semantics or certify native support.
