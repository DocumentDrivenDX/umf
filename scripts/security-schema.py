"""Generate security representation schemas; typed closure is a separate validator."""
import json
from pathlib import Path

text = {"type": "string", "minLength": 1}
ref = lambda name: {"$ref": "#/$defs/" + name}
def obj(properties, required=None):
    return {"type": "object", "properties": properties,
            "required": list(properties) if required is None else required,
            "additionalProperties": True}
def array(items, maximum, minimum=0):
    return {"type": "array", "items": items, "minItems": minimum, "maxItems": maximum}

defs = {"ref": obj({"documentId": text, "moduleId": text, "elementId": text}),
        "literal": json.loads(Path('spec/core/schema-properties-document.schema.json').read_text())['$defs']['literal']}
defs['term'] = {"oneOf": [
    obj({"kind": {"enum": ['subject', 'resource']}, "identity": {"const": True}}),
    obj({"kind": {"enum": ['subject', 'resource', 'context']}, "field": ref('ref')}),
    obj({"kind": {"const": 'variable'}, "name": text, "identity": {"const": True}}),
    obj({"kind": {"const": 'variable'}, "name": text, "field": ref('ref')}),
    obj({"kind": {"const": 'variable'}, "name": text, "endpoint": text}),
    obj({"kind": {"const": 'constant'}, "field": ref('ref'), "value": ref('literal')})]}
# Alternatives sharing a kind cannot admit more than one selector, despite open unknown retention.
for variant in defs['term']['oneOf']:
    selectors = [k for k in ['identity', 'field', 'endpoint', 'value'] if k not in variant['properties']]
    variant['not'] = {"anyOf": [{"type": "object", "properties": {k: {}}, "required": [k]} for k in selectors]}
defs['expr'] = {"oneOf": [
    obj({"op": {"const": 'literal'}, "value": {"type": 'boolean'}}),
    obj({"op": {"const": 'eq'}, "left": ref('term'), "right": ref('term')}),
    obj({"op": {"enum": ['and', 'or']}, "args": array(ref('expr'), 64, 1)}),
    obj({"op": {"const": 'not'}, "arg": ref('expr')}),
    obj({"op": {"const": 'exists'}, "association": ref('ref'), "as": text, "where": ref('expr')})]}
defs['disposition'] = {"oneOf": [obj({"kind": {"enum": ['original', 'withheld']}}),
    obj({"kind": {"const": 'transformed'}, "transform": {"const": 'constant'},
         "version": {"const": '0.1.0'}, "field": ref('ref'), "value": ref('literal')})]}
defs['disclosure'] = obj({"field": ref('ref'), "disposition": ref('disposition')})
defs['rule'] = obj({"id": text, "effect": {"enum": ['permit', 'require', 'forbid']},
    "actions": array(text, 256, 1), "target": array(ref('ref'), 256, 1), "condition": ref('expr'),
    "disclosure": array(ref('disclosure'), 4096)}, ['id', 'effect', 'actions', 'target', 'condition'])
defs['ontologyRef'] = obj({"documentId": text, "revision": text})
policy = obj({"vocabulary": {"const": 'umf.security'}, "version": {"const": '0.1.0'},
    "id": text, "revision": text, "ontology": ref('ontologyRef'), "rules": array(ref('rule'), 256),
    "native": {}}, ['vocabulary', 'version', 'id', 'revision', 'ontology', 'rules'])
schema = {"$schema": 'https://json-schema.org/draft/2020-12/schema', "$id": 'urn:umf:security:0.1.0',
    "title": 'Shared security policy 0.1.0 representation', **policy, "$defs": defs}

ontology_defs = {'ref': defs['ref']}
ontology_defs['field'] = obj({'ref': ref('ref'), 'protection': {'enum': ['protected', 'unprotected']},
    'queryUse': {'type': 'object', 'properties': {k: {'enum': ['disclosed', 'original-authorized', 'prohibited']}
        for k in ['predicate', 'order', 'group', 'join', 'aggregate']}, 'additionalProperties': True}}, ['ref', 'protection'])
ontology_defs['entity'] = obj({'type': ref('ref'), 'keyId': text, 'fields': array(ref('field'), 4096)})
ontology_defs['endpoint'] = obj({'role': text, 'target': ref('ref'), 'fields': array(ref('ref'), 64, 1)})
ontology_defs['association'] = obj({'type': ref('ref'), 'keyId': text, 'fields': array(ref('field'), 4096),
    'endpoints': array(ref('endpoint'), 64, 1)})
ontology = {'$schema': 'https://json-schema.org/draft/2020-12/schema', '$id': 'urn:umf:security:ontology:0.1.0',
    'title': 'Shared security ontology resolution package 0.1.0',
    **obj({'version': {'const': '0.1.0'}, 'documentId': text, 'revision': text,
      'documents': array(obj({'documentId': text, 'revision': text}), 256, 1),
      'subject': ref('ref'), 'entities': array(ref('entity'), 256, 1),
      'associations': array(ref('association'), 256), 'context': array(ref('ref'), 256),
      'actions': array(text, 256, 1)}), '$defs': ontology_defs}
manifest = {'id': 'umf.security', 'version': '0.1.0', 'coreVersion': '0.1.0',
    'description': 'Finite shared security policies independent of table or graph storage', 'schema': schema,
    'semantics': 'CONTRACT-052; explicit ontology and immutable document resolution required; native enforcement is CONTRACT-053',
    'scopes': ['document'], 'capabilities': {'validation': 'semantic', 'directions': ['import', 'export'],
      'evidence': ['tests/security/policy.test.ts'],
      'native': {'system': 'UMF-authored security', 'version': '0.1.0',
        'subset': 'Policy representation, preservation and bounded syntax inspection; external typed closure and enforcement are separate gates'}}}
root = Path('spec/extensions/security'); root.mkdir(parents=True, exist_ok=True)
for filename, value in [('schema.json', schema), ('ontology.schema.json', ontology), ('package.json', manifest)]:
    (root/filename).write_text(json.dumps(value, indent=2)+'\n')
