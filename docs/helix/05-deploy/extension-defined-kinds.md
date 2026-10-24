# Extension-defined kinds

Kinds classify extension payloads without adding ecosystem meanings to UMF's
core Field, Record or Group. A kind's identity is the exact tuple
`{extension, version, kind}`. Catalog profile 1.0.0 discovers only the root
`kind` tag of an extension attachment at document, module or element scope.

This capability requires an initialized Rust engine through the native or WASM
binding. In the source checkout, initialize it with the generated resources:

```ts
import {createEngine} from '../../../bindings/core/node/index.js';
import {
  coreSchema, semanticTypeReferenceSchema, extensionPackageSchema,
  coreConstraints, domainPolicy,
} from '../../../src/generated/core-model';
import {Registry} from '../../../src/registry/registry';
import {inspectExtensionKinds} from '../../../src/model/extension-kinds';

const engine = createEngine({
  coreSchema, referenceSchema: semanticTypeReferenceSchema,
  packageSchema: extensionPackageSchema, constraints: coreConstraints, domainPolicy,
});
const registry = new Registry(engine).register(manifest, validator, {kinds: true});
const available = registry.listKinds();
const definition = registry.getKind({
  extension: manifest.id, version: manifest.version, kind: 'dashboard',
});
const inspection = inspectExtensionKinds(document, registry);
```

For browsers, use `initializeWasm(loader, globalThis, resources)` from the WASM
binding and pass its engine to the same Registry. Python supplies
`Registry.register_package(manifest, semantics=None, kinds=True)`, `list_kinds`,
`get_kind` and the top-level `inspect_extension_kinds(document, registry)`.
These operations load no code or remote packages from document content.

`listKinds` reports available definitions and catalog coverage for every exact
registered package. Inspection returns a copied source, its ordinary validation,
resolved entries and per-attachment coverage. A discoverable kind can still
have invalid payload semantics: check `sourceValidation`, `coverage` and
`complete` before claiming support. Unknown catalog profiles or qualifiers
remain preserved and uninterpreted. Missing packages never select another
version or infer a kind from a payload label.

Kind activation is explicit. `register(manifest, validator)` keeps catalog
metadata opaque; `{kinds:true}` admits it atomically and adds tag/scope checks
to ordinary document validation. Opt-in without a shared engine fails explicitly.
Existing UMF 0.10.0 documents and ordinary packages require no migration.

The synthetic example is
[`dashboard-package.json`](../../../fixtures/extension-kinds/dashboard-package.json)
and [`dashboard.yaml`](../../../fixtures/extension-kinds/dashboard.yaml). Dataset
shape is a core Record with two core Fields; visual and filter bindings refer
to those identities. SQL remains opaque and causes an explicit completeness
warning. The example qualifies generic composition, not Lakeview, query
execution or native dashboard reconstruction. A native adapter must separately
prove byte-for-byte recovery of untouched originals and qualify edited/native
behavior for its stated source versions.

See [CONTRACT-906](../02-design/contracts/CONTRACT-906-extension-defined-kinds.md)
and [execution evidence](../04-build/evidence/extension-kinds/README.md).

For a focused source-checkout run, use `bun scripts/prepare-kind-tests.ts` then
`bun test ./tests/extension-kinds`. The ordinary `test:prepare` command includes
this native prerequisite. Installed-host qualification additionally builds and
installs the wheel, packs the Node binding and builds wasm-bindgen output; run
`scripts/extension-kinds-conformance.ts` with `UMF_KIND_NODE_PACKAGE` and
`UMF_KIND_PYTHON` pointing to those external installations.
