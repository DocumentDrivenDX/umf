# Full ontology workspace

Owner-directed follow-up to the schema reference IA plan and US-089: show the complete authored ontology on entry, retain it when inspecting definitions, and use the available graph workspace.

The host defaults to all 15 Records and 17 authored connections. Selection and an explicitly requested neighborhood are separate URL state. Full-model and neighborhood views survive refresh; inspecting a Record or Field does not implicitly filter the model. Definition groups and the connection list start closed.

The viewport fits the whole rendered graph, adapts the existing SVG node arrangement to its aspect ratio, and provides Fit graph, zoom and 100% controls with local panning. Desktop retains an adjacent definition inspector; narrow screens stack the inspector below the graph. Resize reflows the same nodes and relationships, using the existing shared relationship geometry. Labels, navigation and markers still come from the installed, immutable schema-browser 2.0.0 renderer. The host's SVG adaptation is qualified against that pinned release by the browser journeys; a renderer upgrade must rerun those checks. No model/schema/validator definitions or package releases change.

`local/verification.json` records Chromium journeys at 1440×900, 1280×800, 798×900 and 390×844, including complete model counts, fitted geometry, zoom/panning, keyboard/history, explicit filtering, field values, downloads, workbench and asset integrity. `main/` and `reader/` retain the broader reference and YAML/JSON journeys. Local TypeScript, reference unit and independent drift-check logs are retained alongside them.

Live browser and signed-publication receipts are recorded separately after deployment. Browser evidence does not claim recruited-reader comprehension or new adapter/native semantics.

A read-only Sol browser review found two interaction defects during implementation: an absolute zoom cap could shrink an isolated fitted node, and detail links discarded explicit neighborhood focus. Both were corrected and receive dedicated browser checks: zoom limits scale with the fitted overview, and all ontology selection links retain explicitly requested focus until Full model is selected.
