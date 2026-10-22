# Owner-issued obligation source correspondence experiment

Draft annex to SPIKE-010 and Weft CONTRACT-005, tracing to US-056-AC7/AC10.
This first implementation uses the original security0.1 owner context; draft
graph0.2 and native graph/profile qualification remain separate work.

This composes the private admission-obligation declaration projection with the
actual owner context. It does not emit SQL, admit a compiled response, validate
required native evidence, or qualify a backend acceptance case.

Source IDs are canonical compact JSON arrays of strings, serialized by the
pinned owner serde_json implementation. No whitespace, escaping or tuple aliases
are admitted. Each serialized ID is at most4096 UTF8 bytes; the complete set is
at most4096 IDs. Delimiter concatenation cannot replace this encoding. Key and
output positions are one-based decimal string tokens. Tuple prefixes are:

- primary-action, action.
- policy/ontology/query, exact original source SHA256.
- model, documentId, revision, umfVersion, SHA256; module, documentId, selectedModuleId.
- scan, occurrence, target(documentId,moduleId,elementId).
- action, occurrence, action; rule, occurrence, action, ruleId.
- key, occurrence, action, target triple, selected keyId.
- key-field, occurrence, action, target triple, keyId, position, field triple.
- field, occurrence, action, owner target triple, field triple.
- context, occurrence, action, field triple.
- association, occurrence, action, association triple.
- projection/query-field, occurrence, field triple.
- operator, inventory position, occurrence, target triple, field triple, operator,
  disclosed; or the same prefix followed by original-authorized, originalAction.
- output, output position, output name.

The actual source/catalog/query identity checks precede context construction.
The new inventory borrows compiler-owned requirements. Model pins bind revisions
for the field/type triples, and exact policy/ontology/query hashes retain source
custody. Per-scan actions retain all applicable rules, ordered identity components,
stored/context channels and association dependencies. Repeated output positions
and self-join occurrences stay distinct. COUNT still issues scan/action/output
requirements; this does not interpret or admit its computed result.

The union of projected declared semanticSources must equal the issued set:
missing, extra, substituted or noncanonical IDs refuse. This is whole-inventory
correspondence, not proof of per-capability enforcement-site assignment, complete
capability selection, interpreted physical/result semantics or native enforcement.
Each declaration's own sources remain intact; union checking does not erase them.
Backend/version/target labels must be compatible with the context, but that check
does not authenticate host selection or replace exact registration-byte custody.
EvidenceCaseIds still require an independently derived required-native-case map.

Derivation uses a one-million-visit/sixteen-million-UTF8-byte ledger. It charges
source bytes before hashing, component bytes and the exact encoded size before
serialization. Source count, NUL and encoded-size limits refuse atomically.
Projection, derivation and union comparison have separate bounded ledgers; no
aggregate CPU/process-memory theorem is claimed.

Required controls: exact complete owner-context projection; removal of each
issued ID; extra/substituted/noncanonical sources; repeated projected field
positions; self-join occurrence retention; COUNT requirements; tuple delimiter,
quote/backslash/control/Unicode boundaries;4096-byte admission and larger refusal;
actual work/text exhaustion. Controls additionally use an independently authored complete expected fixture
inventory, an alternate spelling of the same decoded tuple, same-field stored
and context channels, disclosed/original-authorized operator modes and same-domain
composite Key positions under source-admitted reversal. These finite fixtures
qualify tested branches only; they do not prove general extraction completeness. Native case/authority coverage remains
unqualified. The prior187-check consolidated checkpoint predates this extension.
