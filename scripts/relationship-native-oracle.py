"""Pinned native observations; neither carrier establishes author intent."""
import json
import hashlib
import importlib.metadata as metadata
import sys
from pathlib import Path
import rdflib
import pydantic
import runpy
sys.path.insert(0, str(Path('native/linkml/sources').resolve()))
from linkml_model.meta import SchemaDefinition
from linkml_runtime.loaders import yaml_loader

assert rdflib.__version__ == '7.1.4'
assert metadata.version('linkml-runtime') == '1.11.0rc2'
base = Path('fixtures/relationship-native')
rdf_source = (base / 'rdf-domain-range.nq').read_text()
dataset = rdflib.Dataset()
dataset.parse(data=rdf_source, format='nquads')
predicate = rdflib.URIRef('https://example.org/rel/customer')
domain = rdflib.URIRef('https://example.org/type/Order')
range_ = rdflib.URIRef('https://example.org/type/Customer')
assert (predicate, rdflib.RDFS.domain, domain) in dataset
assert (predicate, rdflib.RDFS.range, range_) in dataset
assert len(dataset) == 3
linkml_source = (base / 'linkml-slot.yaml').read_text()
schema = yaml_loader.loads(linkml_source, target_class=SchemaDefinition)
assert schema.classes['Order'].slots == ['customer']
assert schema.slots['customer'].range == 'Customer'
assert schema.slots['customer'].multivalued is False
assert schema.slots['customer'].required is True
assert schema.slots['id'].identifier is True
tablespec_model_path = Path('native/tablespec/sources/src/tablespec/models/umf.py')
tablespec_model = runpy.run_path(str(tablespec_model_path))['UMF']
tablespec_source = (base / 'tablespec-foreign-key.json').read_text()
tablespec = tablespec_model.model_validate_json(tablespec_source)
foreign_key = tablespec.relationships.foreign_keys[0]
assert foreign_key.column == 'customer_id'
assert foreign_key.references_table == 'customers'
assert foreign_key.references_column == 'id'
assert foreign_key.confidence == 0.95
result = {
    'native': {'rdflib': rdflib.__version__, 'linkmlRuntime': metadata.version('linkml-runtime'),
               'tablespecModelSha256': hashlib.sha256(tablespec_model_path.read_bytes()).hexdigest(),
               'pydantic': pydantic.__version__},
    'sourceSha256': {
        'rdf': hashlib.sha256(rdf_source.encode()).hexdigest(),
        'linkml': hashlib.sha256(linkml_source.encode()).hexdigest(),
        'tablespec': hashlib.sha256(tablespec_source.encode()).hexdigest(),
    },
    'rdf': {'quadCount': len(dataset), 'predicate': str(predicate), 'domain': str(domain), 'range': str(range_)},
    'linkml': {'class': 'Order', 'slot': 'customer', 'range': schema.slots['customer'].range,
               'multivalued': schema.slots['customer'].multivalued, 'required': schema.slots['customer'].required,
               'targetIdentifier': schema.slots['id'].identifier},
    'tablespec': {'column': foreign_key.column, 'referencesTable': foreign_key.references_table,
                  'referencesColumn': foreign_key.references_column, 'confidence': foreign_key.confidence},
    'classification': 'native-observation-only',
    'limits': ['RDF domain/range entail types, not reference enforcement or participation cardinality',
               'LinkML slot range and multivalued do not select a target Key or establish source-end multiplicity',
               'TableSpec foreign-key metadata does not establish named target Key identity, lifecycle or enforcement'],
}
(base / 'oracle-results.json').write_text(json.dumps(result, indent=2) + '\n')
print(result)
