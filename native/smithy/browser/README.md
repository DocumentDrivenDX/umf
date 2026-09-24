# Experimental Smithy JavaScript runtime

`bun run build:smithy-experiment` verifies pinned source hashes, regenerates the narrow
compatibility patches, and compiles Smithy 1.73.0 through TeaVM 0.15.0. The generated
ES module is `target/javascript/smithy.js`; it exports `assemble(sourcesJson)` and
returns a JSON report with native diagnostics and an exact `modelJson` string. Build
artifacts are ignored. Use the public `createSmithyJavaScriptBackend(module)` and `assembleSmithyDocument` APIs
to consume it explicitly. The runtime remains a separate optional module.

The unmodified baseline still fails:
`mvn -q -f native/smithy/browser/unmodified-pom.xml process-classes`.
Its findings remain in `compile-findings.json`. The patched build overrides native
classes by unpacking the pinned dependencies before compilation and excluding their
original jars from TeaVM's classpath. This ordering is essential.

The patch generator retains Apache-2.0 headers; `LICENSE-SMITHY` accompanies the sources.
`patch-manifest.json` records original/patched hashes. Changes use sequential streams,
small StringJoiner/read-only sorted-set adapters, equivalent method reflection APIs,
an unchanged embedded prelude and materialized string slices. The last change avoids
TeaVM 0.15.0 CharBuffer.charAt ignoring buffer position. Generic-superclass reflection
remains unsupported and throws explicitly; model validation is not disabled.

Evidence commands:

- `bun scripts/smithy-js-experiment.ts`: 144 JVM corpus outcome/event/hash comparisons.
- `UMF_CHROMIUM_PATH=/path/to/chromium bun scripts/smithy-js-browser.ts`: the 144 existing and 182 invalid-loader
  cases in Chromium, three invalid-model rejections, exact numeric metadata and no
  Bun/process globals. Both reports include the generated runtime SHA-256.
- `java -cp native/smithy/browser/target/classes native/smithy/browser/RuntimeCompatTest.java`:
  26 helper behavior comparisons and mutation/unsupported-reflection guards.

Current reports show complete agreement for this corpus. This does not establish
arbitrary custom-validator/reflective behavior or the complete language/runtime surface.
More negative fixtures and remaining reflective behavior require
additional work before a broader support claim. The public API reports current limits. The full conformance gate now builds the optional runtime and checks the public API
against the native corpus. Runtime-specific experimental reports remain separate.

Public integration (after building and serving the generated module):

```ts
import * as runtime from './smithy.js';
import {createSmithyJavaScriptBackend, assembleSmithyDocument} from '@umf/core';

const backend = createSmithyJavaScriptBackend(runtime);
const result = await assembleSmithyDocument(sourceDocument, backend, {id: 'assembled'});
// Inspect status/events/issues. Keep result.source alongside any result.model.
```

The public result schema retains native event locations and shape IDs. Runtime/protocol
failures return blocked results without partial models. This direct backend is synchronous
inside the async operation; use the worker backend for cancellation and deadlines.
Native serialization can add explicit mixin apply entries on reassembly; the public
oracle compares second-stage output and flattened effective-model hashes separately.

To run off the page thread, serve generated `worker.js` beside `smithy.js`:

```ts
import {createSmithyWorkerBackend, assembleSmithyDocument} from '@umf/core';
const backend = createSmithyWorkerBackend({workerUrl: '/smithy/worker.js', timeoutMs: 30000});
const controller = new AbortController();
const result = await assembleSmithyDocument(sourceDocument, backend, {
  id: 'assembled', signal: controller.signal,
});
```

Each call uses a fresh worker and terminates it on completion, failure, timeout or abort.
Cancellation and deadline expiry return blocked results without a partial model.

The negative-corpus gate is `bun scripts/smithy-negative-oracle.ts`, after building the
runtime. It checks every pinned invalid-loader model after UMF source round trip and
records native exceptions separately. The expanded Chromium report contains 326 cases;
the older Bun experimental report remains its original 144-case scope.

Native shape-set queries are available with `createSmithyJavaScriptSelectionBackend(runtime)`
and `selectSmithyShapes(document, backend, selector, {id})`. The generated module exports
`select(modelJson, expression)` alongside `assemble`. The direct query backend runs synchronously;
`createSmithyWorkerBackend` also supports queries in disposable workers. Full source/assembly results accompany
selected shape IDs. The 90-case selector gate is `bun scripts/smithy-selector-oracle.ts`;
the Chromium runtime harness now repeats those expressions too.

For a cancellable query, pass the worker backend to
`selectSmithyShapes(document, backend, selector, {id, signal})`. The configured timeout
applies separately to assembly and selection, using a fresh worker for each. A cancelled
or timed-out selection retains the completed assembly/source and returns no shape set.
Serve `worker.js` beside `smithy.js` from the same generated build.

The runtime also includes checksum-pinned smithy-jsonschema 1.73.0 and exports
`jsonSchema(modelJson, rootShape)`. Use `createSmithyJavaScriptJsonSchemaBackend` with
`projectSmithyToJsonSchema` and the explicit `native-defaults-2020-12` policy. This direct
operation is synchronous. The JVM comparison is `bun scripts/smithy-jsonschema-oracle.ts`;
independent target tests are `.venv/bin/python scripts/smithy-jsonschema-oracle.py`.
Unresolved native recursive-root references and conversion conflicts block targets.

The explicit `native-root-definition-2020-12` projection profile uses the additional
`jsonSchemaWithRootDefinition` runtime export. It keeps the original schema, adds the
typed root at the converter's native pointer, and retains adapted output separately.
Run `bun scripts/smithy-jsonschema-oracle.ts --root-definition` and
`.venv/bin/python scripts/smithy-root-definition-oracle.py` for JVM and independent
recursive-instance checks. Both profiles keep strict loss policy blocked.

Use profile `native-service-context-2020-12` with `serviceContext` to honor an existing
service's closure and declared renames. The runtime export is `jsonSchemaForService`.
The projection retains native and root-definition output and rejects roots outside the
service. Run `bun scripts/smithy-jsonschema-oracle.ts --service-context` and
`.venv/bin/python scripts/smithy-service-context-oracle.py` for the 40-case JVM matrix and
independent target constraints. Emission remains synchronous and uses explicit loss policy.
