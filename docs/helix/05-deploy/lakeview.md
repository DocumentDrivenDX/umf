# Lakeview original-file preservation

`umf.lakeview` 0.2.0 applies extension-defined kinds to the Lakeview importer
proposed in PR42. It preserves an untouched original UTF-8 `.lvdash.json` file
byte for byte while exposing explicit dataset columns and widget-query outputs
as core Records and Fields. It requires the initialized shared Rust runtime.

In a source checkout, use the native engine and generated resources as shown in
the [kind initialization guide](extension-defined-kinds.md). Then:

```ts
import {
  importLakeviewDashboardBytes, exportLakeviewDashboardBytes,
  lakeviewRegistry,
} from '../../../src/adapters/lakeview';
import {inspectExtensionKinds} from '../../../src/model/extension-kinds';
import {readDocument, writeDocument} from '../../../src/model/document';

const original = await Bun.file('dashboard.lvdash.json').bytes();
const {document, issues} = importLakeviewDashboardBytes(
  original, {id: 'sales-dashboard', namespace: 'sales'}, engine,
);
const registry = lakeviewRegistry(engine);
const inspection = inspectExtensionKinds(document, registry);
const restored = readDocument(writeDocument(document, 'yaml'), 'yaml');
const reconstructed = exportLakeviewDashboardBytes(restored, engine);
```

For browsers, initialize the WASM engine with the same generated resources and
pass it to the same adapter. The byte boundary rejects invalid UTF-8 and retains
an optional BOM. Text APIs are also available; original escape spelling, number
tokens, whitespace and line endings stay in the source archive.

`lakeviewRegistry` explicitly selects catalog interpretation and the compiled
`lakeview/0.2.0` validator. Neither a manifest property nor document content can
activate it. Generic discovery reports exact kind identities and ordinary
validation. A valid preserved document remains incomplete because native
rendering, expression evaluation and Databricks acceptance are unverified.

Dataset Records contain only explicitly named native columns, including native
calculations. Separate query-result Records contain explicitly named widget
query outputs. Core references connect layout items, query results, unambiguous
datasets and their Fields. A query output is not assumed to be a base-table
column. Types, nullability, cardinality and a complete row schema are not inferred
from query text. Native expressions and unknown properties remain retained.

Export checks that native fragments, Records, Fields and references still agree
with the original source. Changing them without a qualified native rewrite
throws `LAKEVIEW_EDIT_UNSUPPORTED`; export never hides a Field edit by returning
old archived bytes. Original UMF import options (document ID, title and a uniform
namespace) are metadata, not native rewrites. Original-source corruption produces
an attributable validation error. Resource/cancellation failures abort explicitly.

PR42's old `umf.dashboard` 0.1 projection helper remains available as
`projectLakeviewToLegacyDashboard`, an explicitly separate compatibility view.
The 0.2 native importer stores no parallel field dictionary and does not attach
that legacy projection automatically. Edited dashboard generation and a future
generic dashboard profile need separate semantics and evidence.

The [execution evidence](../04-build/evidence/lakeview/README.md) records byte
comparisons through both UMF formats in Rust, packed Node/Bun, the native CLI
with an empty PATH, and real Chromium. It qualifies three committed inputs,
including PR42's unchanged original fixture; it does not qualify live Databricks
acceptance or an edited-source exporter.
