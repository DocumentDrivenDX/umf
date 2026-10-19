# Independent browser integration review

Root review uses the actual Codex in-app Chromium browser against the locally
staged candidate at `http://127.0.0.1:4178/`. This is an unpublished candidate,
not live deployment evidence. The source-bound reference currently reports 2412
entries, 357 schemas, 70 extension versions and 1823 API exports.

Observed working journeys:

- One Schemas entry exposes Ontology, Object reference and Model catalog.
- Document and Element ontology definitions open their actual generated schema
  paths; Element → scalarType opens the exact property definition.
- Field descriptions, clickable shape targets and all eleven recognized scalar
  labels are visible. The object reference also explains unknown label retention.
- itemType presents its required module/element keys and separate item Field,
  a complete example and invalid combinations. YAML is the example default and
  its JSON toggle works.
- API search finds AVRO_KEYS_EXTENSION, presents it as a Constant, shows its
  value/import/usage and switches the task filter as needed.
- Fresh Model catalog navigation followed by reload and Browse catalog leaves
  every domain pack collapsed, including Archaeology. This corrects the earlier
  auto-expansion finding.
- The narrow browser layout remains readable; reference tables scroll within
  their own regions.

Findings returned to Sol/Luna before release:

1. **Resolved on retest:** Workbench startup first failed on the retired tuple3 replacement tuple4
   profile registration. After that correction, another missing fixed validator
   surfaced: `urn:umf:actions:executor-profile:0.1.0`. The complete transitive
   import profile was rebuilt. Actual worker startup now completes with YAML
   selected. Validation returns valid=true with the expected external semantic-type
   warning; toggling to JSON retains the same example values.
2. **Resolved on retest:** Nested facet antecedents remain in the visible rules.
   facets.length, facets.length.unit, facets.precision and facets.integerWidth
   now have separate conditional statements with their actual scalar families.
3. **Resolved on retest:** scalarType displays eleven recognized values with
   meanings and an explicit policy for other nonempty strings. The shape summary
   remains mechanically worded, but does not repeat the excluded list eleven times.
4. **Resolved on retest:** A fresh Workbench validation renders `Validation · YAML`,
   a YAML receipt and `Download Validation.yaml`, while retaining the expected
   external semantic-type warning and valid=true/complete=false result.

Earlier wrong ontology-to-reference targets and missing scalar meanings/values
are resolved in this candidate. At 390px the page width equals the viewport,
reference navigation wraps, and all 28 model-catalog domain groups remain closed
after opening Browse catalog. Temporary viewport overrides were reset. A cold
ontology navigation leaves both Records and Fields collapsed. Separate automated
proof must be rebuilt against the corrected relationship-operation schema; old
console entries from earlier preview revisions are not current proof. Final
release fixity and live receipts remain required.
