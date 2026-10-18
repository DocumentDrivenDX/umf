# UMF for UMF

`umf.yaml` describes the current UMF language using UMF Records and Fields.
It includes qualified member/item/record references and an explicit metadata
vocabulary declared by `package.json`. The ordinary extension-package envelope
marker is independent of the model's document marker.

This is a descriptive self-model, not a replacement instance validator. Original
JSON Schema fragments, conditionals, tagged unions and source pointers survive in
`umf.metamodel` metadata. JSON Schema and core semantic validators retain their
authority. The diagram's conceptual connections describe containment,
specialization or target resolution; they are not instance relationship counts.
Required key presence remains in the retained schema metadata; it does not
imply ideal nullability or a native absence carrier. Structural registration
alone reports incomplete interpretation as expected.

The reviewed projection lives in `scripts/reference/self-model.ts`. To update it
with an intentional language change, run `bun scripts/reference/self-model.ts
--write`, review the YAML diff, then run the reference build and tests using the
repository's pinned Bun. Normal reference builds compare the authored YAML's
values to canonical sources and refuse drift or unresolved connections. They emit
manifest-bound YAML, JSON and graph data from the same model.

Open the site's Schemas → Ontology view to explore it, then follow a property to
the Object reference for accepted values and conditional rules. The catalog's
self-model item routes to that same ontology; it does not relabel this current
source to fit an older released catalog parser.
