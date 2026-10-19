# Balanced full ontology workspace

Owner-directed visual refinement of the full-ontology workspace and the schema reference IA plan / US-089. The same 15 authored Records and 17 connections remain visible by default.

The host replaces the arbitrary row order with the pinned MIT-licensed Dagre 3.1.1 directed layout. It caches horizontal and vertical arrangements, chooses the best fit for the available viewport, measures card labels, and routes connections orthogonally through rank gaps. Parallel connections retain separate paths and numbered badges. Records without authored connections are explicitly identified as standalone. This is a presentation layout, not inferred ontology or native semantics.

The installed schema-browser renderer remains immutable at 2.0.0 and supplies the existing SVG nodes, edge identities, navigation and markers. The host adapts that pinned output. Browser checks qualify the resulting DOM integration, layout, zoom/pan, routing, keyboard/history, field/reference navigation and responsive containment. New geometry checks reject overlapping cards, clipped labels, edges through unrelated cards and incorrect source/target attachments at 1440×900, 1280×800, 798×900 and 390×844.

Adding the exact layout dependency changes the root package/lock fingerprint. The metamodel generator and action-plan identity generator were rerun in that order. `checks/unchanged-semantics.json` verifies that generated schema/constraint meaning is unchanged and generated enforcement/types differ only in compiler fingerprints. The authored model and compiler were not edited. Historical native evidence keeps its observed fingerprints; this change does not refresh or claim new native qualification.

The reference build hashes the actual bundled UI dependency closure and retains its licenses alongside runtime notices. Local and live receipts are kept separately. Reader comprehension with recruited users remains unmeasured.
