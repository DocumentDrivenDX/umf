"""Pinned GraphQL-core schema check for expected relationship SDL; no operations execute."""
import json
from importlib.metadata import version
from pathlib import Path
from graphql import build_schema, parse, validate_schema

assert version('graphql-core') == '3.2.12'
source = Path('fixtures/projections/ddd-authored-relationships/expected-relationships.graphql').read_text()
schema = build_schema(source)
assert not validate_schema(schema)
assert schema.query_type.name == 'Query'
fields = {name: {field: str(value.type) for field, value in schema.get_type(name).fields.items()}
          for name in ['Order', 'Customer', 'Product', 'OrderProduct']}
assert fields['Order']['customer'] == 'Customer!'
assert fields['Order']['products'] == '[Product]'
assert fields['Customer']['orders'] == '[Order]'
assert fields['Product']['orders'] == '[Order]'
assert fields['OrderProduct']['quantity'] == 'Decimal!'
assert 'orders' not in fields['OrderProduct']
assert all(not schema.get_type(name).fields[field].args for name in fields for field in fields[name])
print(json.dumps({'runtime': 'GraphQL-core 3.2.12', 'definitions': len(parse(source).definitions),
                  'fields': fields, 'operationsExecuted': 0}, sort_keys=True))
