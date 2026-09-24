"""Independent GraphQL-core schema check; no GraphQL operations are executed."""
import hashlib
import json
from importlib.metadata import version
from pathlib import Path
from graphql import build_schema, parse, validate_schema

assert version('graphql-core') == '3.2.12'
base = Path('fixtures/projections/ddd-graphql-entities')
sdl = (base / 'generated.graphql').read_text()
report = json.loads((base / 'report.json').read_text())
schema = build_schema(sdl)
assert not validate_schema(schema)
assert schema.query_type.name == 'Query'
assert set(['Order', 'Customer', 'Product', 'OrderProduct']).issubset(schema.type_map)
assert str(schema.get_type('Product').fields['tags'].type) == '[String]'
assert str(schema.get_type('Order').fields['details'].type) == 'String'
assert str(schema.get_type('OrderProduct').fields['quantity'].type) == 'Decimal!'
assert len(parse(sdl).definitions) == 7
assert len(report['residuals']) == 22
assert report['graphqlJs'] == '17.0.2'
fields = {name: {field: str(value.type) for field, value in schema.get_type(name).fields.items()}
          for name in ['Query', 'Order', 'Customer', 'Product', 'OrderProduct']}
sha256 = {str(path): hashlib.sha256(path.read_bytes()).hexdigest()
          for path in [base / 'case.json', base / 'generated.graphql', base / 'report.json',
                       Path('src/projections/ddd-graphql/entities.ts')]}
evidence = {'scope': 'Pinned GraphQL-core schema parse/build/validation of DDD entity-stage SDL; no resolver or query execution',
            'graphqlCore': version('graphql-core'), 'graphqlJs': '17.0.2',
            'fields': fields, 'residuals': len(report['residuals']), 'sha256': sha256}
(base / 'oracle.json').write_text(json.dumps(evidence, indent=2) + '\n')
print(json.dumps({'types': len(fields), 'residuals': len(report['residuals'])}))
