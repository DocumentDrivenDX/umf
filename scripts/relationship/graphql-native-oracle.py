"""Independent GraphQL-core schema check; no operations or resolvers run."""
import hashlib
import json
from importlib.metadata import version
from pathlib import Path
from graphql import build_schema, parse, validate_schema

assert version('graphql-core') == '3.2.12'
base = Path('fixtures/relationship/graphql-native')
sdl = (base / 'schema.graphql').read_text()
adapter = json.loads((base / 'adapter.json').read_text())
schema = build_schema(sdl)
assert not validate_schema(schema)
assert schema.query_type.name == 'Query'
assert str(schema.get_type('Order').fields['customer'].type) == 'Customer'
assert str(schema.get_type('Order').fields['computedCustomer'].type) == 'Customer'
assert str(schema.get_type('Customer').fields['orders'].type) == '[Order!]!'
assert len(parse(sdl).definitions) == 5
assert adapter['authoredRelationships'] == 0
sha256 = {str(path): hashlib.sha256(path.read_bytes()).hexdigest()
          for path in [base / 'schema.graphql', base / 'adapter.json',
                       Path('scripts/relationship/graphql-native-oracle.py')]}
evidence = {'scope': 'Pinned GraphQL-core native SDL schema validation; object fields do not establish authored relationship or computed behavior',
            'graphqlCore': version('graphql-core'), 'graphqlJs': adapter['graphqlJs'],
            'objectFields': ['Order.customer', 'Order.computedCustomer', 'Customer.orders', 'Line.order'],
            'authoredRelationships': 0, 'sha256': sha256}
(base / 'oracle.json').write_text(json.dumps(evidence, indent=2) + '\n')
print(json.dumps({'objectFields': len(evidence['objectFields']), 'authoredRelationships': 0}))
