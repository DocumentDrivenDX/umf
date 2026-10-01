"""Independent GraphQL-core 3.2.12 acceptance of the complete projection corpus."""
import json
from pathlib import Path
from importlib.metadata import version
from graphql import build_schema, validate_schema
assert version('graphql-core') == '3.2.12'
base = Path('fixtures/projections/ddd-graphql')
cases = json.loads((base / 'generated.json').read_text())
assert cases['graphqlJs'] == '17.0.2'
results = []
for case in cases['cases']:
    schema = build_schema(case['candidate'])
    assert not validate_schema(schema)
    assert schema.query_type.name == 'Query'
    fields = {name: {key: str(f.type) for key, f in t.fields.items()}
              for name, t in schema.type_map.items() if not name.startswith('__') and hasattr(t, 'fields')}
    assert fields == case['fields'], (case['id'], fields, case['fields'])
    assert fields['Product']['tags'] == '[String!]'
    assert fields['Order']['products'] == '[Product]'
    assert fields['OrderProduct']['quantity'] == 'Decimal!'
    if case['id'] == 'heterogeneous':
        assert fields['Order']['customer'] == 'CustomerOrProduct!'
        assert fields['Customer']['orders'] == '[OrderOrLine]'
        assert [t.name for t in schema.get_type('CustomerOrProduct').types] == ['Customer', 'Product']
    if case['id'] == 'self':
        assert fields['Customer']['parent'] == 'Customer!'
        assert fields['Customer']['children'] == '[Customer]'
    if case['id'] == 'no-inverse':
        assert 'orders' not in fields['Customer']
    results.append({'id': case['id'], 'fields': fields, 'valid': True})
(base / 'native.json').write_text(json.dumps({'graphqlCore': version('graphql-core'), 'cases': results}, indent=2) + '\n')
print(json.dumps({'graphqlCore': version('graphql-core'), 'cases': len(results), 'valid': True}))
