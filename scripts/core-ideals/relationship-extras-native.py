"""Independent pinned native shape checks; native schema meaning is not authored intent."""
import json
import sys
import platform
from pathlib import Path
from importlib.metadata import version
system = sys.argv[1]
if system == 'graphql':
    from graphql import build_schema, validate_schema
    assert version('graphql-core') == '3.2.12'
    versions = {'graphqlCore': version('graphql-core')}
elif system == 'rdf':
    import rdflib
    assert rdflib.__version__ == '7.6.0'
    versions = {'rdflib': rdflib.__version__}
else:
    sys.path.insert(0, str(Path('native/linkml/sources').resolve()))
    from linkml_model.meta import SchemaDefinition
    from linkml_runtime.loaders import yaml_loader
    assert version('linkml-runtime') == '1.11.0rc2'
    versions = {'linkmlRuntime': version('linkml-runtime')}
base = Path('fixtures/validation/relationship-extras')
corpus = json.loads((base / 'corpus.json').read_text())
assert corpus['graphqlJs'] == '17.0.2'
results = []
def identity(r): return (r['module'], r['element'])
def wrapped(t, b): return '[' + t + ']' if b['max'] == '*' or b['max'] > 1 else t + ('!' if b['min'] == 1 else '')
for case in corpus['cases']:
    if case['request']['system'] != system: continue
    p, r, archive = case['request'], case['relationship'], case['archive']
    names = {identity(n): n['name'] for n in p['records']}
    if p['system'] == 'graphql':
        schema = build_schema(archive['text'])
        assert not validate_schema(schema)
        assert schema.query_type.name == p['root']['typeName']
        target = p.get('forwardUnion') or names[identity(r['target'][0])]
        for endpoint in r['source']:
            assert str(schema.get_type(names[identity(endpoint)]).fields[p['field']].type) == wrapped(target, r['targetMultiplicity'])
        if 'inverse' in r:
            source = p.get('inverseUnion') or names[identity(r['source'][0])]
            for endpoint in r['target']:
                assert str(schema.get_type(names[identity(endpoint)]).fields[p['inverseField']].type) == wrapped(source, r['sourceMultiplicity'])
        if 'forwardUnion' in p:
            assert [t.name for t in schema.get_type(p['forwardUnion']).types] == [names[identity(t)] for t in r['target']]
        fields = {n['name']: {f: str(v.type) for f, v in schema.get_type(n['name']).fields.items()} for n in p['records']}
        results.append({'name': case['name'], 'system': 'graphql', 'fields': fields, 'valid': True})
    elif p['system'] == 'rdf':
        graph = rdflib.Dataset()
        graph.parse(data=archive['text'], format='nquads')
        predicate = rdflib.URIRef(p['predicate'])
        def classes(node):
            if isinstance(node, rdflib.URIRef): return [str(node)]
            assert isinstance(node, rdflib.BNode)
            head = graph.value(node, rdflib.OWL.unionOf)
            assert isinstance(head, rdflib.BNode)
            result, visited = [], set()
            while head != rdflib.RDF.nil:
                assert head not in visited
                visited.add(head)
                value = graph.value(head, rdflib.RDF.first)
                assert isinstance(value, rdflib.URIRef)
                result.append(str(value))
                head = graph.value(head, rdflib.RDF.rest)
                assert head is not None
            return result
        domain, range_ = graph.value(predicate, rdflib.RDFS.domain), graph.value(predicate, rdflib.RDFS.range)
        assert classes(domain) == [names[identity(e)] for e in r['source']]
        assert classes(range_) == [names[identity(e)] for e in r['target']]
        assert (predicate, rdflib.RDF.type, rdflib.OWL.ObjectProperty) in graph
        if 'inversePredicate' in p:
            inverse = rdflib.URIRef(p['inversePredicate'])
            assert (inverse, rdflib.OWL.inverseOf, predicate) in graph
            assert graph.value(inverse, rdflib.RDFS.domain) == range_
            assert graph.value(inverse, rdflib.RDFS.range) == domain
        # Domain/range declarations carry neither SHACL cardinality nor graph-reference integrity.
        assert not any(str(q[1]).startswith('http://www.w3.org/ns/shacl#') for q in graph)
        results.append({'name': case['name'], 'system': 'rdf', 'domain': classes(domain), 'range': classes(range_), 'quads': len(graph), 'valid': True})
    else:
        schema = yaml_loader.loads(archive['text'], target_class=SchemaDefinition)
        assert str(schema.id) == p['schemaId']
        slot = schema.slots[p['slot']]
        assert str(slot.range) == names[identity(r['target'][0])]
        assert slot.multivalued == (r['targetMultiplicity']['max'] == '*' or r['targetMultiplicity']['max'] > 1)
        assert slot.required == (r['targetMultiplicity']['min'] > 0)
        for endpoint in r['source']: assert p['slot'] in schema.classes[names[identity(endpoint)]].slots
        if 'inverseSlot' in p:
            inverse = schema.slots[p['inverseSlot']]
            assert str(inverse.range) == names[identity(r['source'][0])]
            for endpoint in r['target']: assert p['inverseSlot'] in schema.classes[names[identity(endpoint)]].slots
        results.append({'name': case['name'], 'system': 'linkml', 'classes': list(schema.classes), 'slot': p['slot'], 'range': str(slot.range), 'multivalued': slot.multivalued, 'required': slot.required, 'valid': True})
assert len(results) == (8 if system == 'linkml' else 9)
(base / ('native-' + system + '.json')).write_text(json.dumps({'versions': versions, 'python': platform.python_version(), 'interpreter': sys.executable, 'scope': 'Native metamodel/schema parsing and graph structure; no instance or referential enforcement claim', 'cases': results}, indent=2) + '\n')
print(json.dumps({'cases': len(results), 'systems': {s: sum(r['system'] == s for r in results) for s in ['graphql', 'rdf', 'linkml']}, 'valid': True}))
