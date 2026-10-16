packet = json.loads(child.native_request_json())
designation = json.loads(child.designation_json())
assert packet['authority'] is False and packet['securityReady'] is False
assert packet['sourceRequestSha256'] == sha(parent.source_request_json().encode())
assert packet['primaryAction'] == designation['primaryAction'] == f['owner']['disclosure']['readAction']
assert packet['designationSha256'] == sha(child.designation_json().encode())
assert packet['modelPins'] == [x['pin'] for x in req['modules']]
assert packet['sources'] == designation['sources']
assert [x['role'] for x in packet['sources']] == ['policy', 'ontology', 'catalog', 'owner']
for source in packet['sources']:
    original = next((x for x in req['opaqueSources'] if x['role'] == source['role']))
    assert source['sha256'] == original['sha256'] and source['identity'] == original['identity']
(expected_scans, expected_projections, expected_routes, expected_actions) = expected_signatures[name]
assert [(x['scan'], x['type']['elementId']) for x in packet['scans']] == expected_scans
assert [(x['scan'], x['path'], x['field']['element']) for x in packet['projections']] == expected_projections
assert [(x['scan'], x['path'], x['field']['elementId'], x['operator'], x['operation'], x['required']) for x in packet['routes']] == expected_routes
assert [x['originalAction'] for x in designation['uses']] == expected_actions
for scan in packet['scans']:
    assert scan['type'] == {'documentId': 'domain', 'moduleId': 'm', 'elementId': 'Resource'} and scan['record'] == {'documentId': 'domain', 'revision': 'query-value-core-r1', 'module': 'm', 'element': 'Resource'}
for projection in packet['projections']:
    assert projection['field'] == {'documentId': 'domain', 'revision': 'query-value-core-r1', 'module': 'm', 'element': projection['field']['element']}
fields = [(op, x) for op in packet['operations'] for x in op['operands'] if x['input']['kind'] == 'field']
assert len(fields) == len(packet['routes']) == len(designation['uses'])
assert [(x['scan'], x['path']) for x in packet['routes']] == [(x['input']['scan'], x['path']) for (_, x) in fields]
assert [(x['scan'], x['path']) for x in designation['uses']] == [(x['scan'], x['path']) for x in packet['routes']]
for (route, (operation, operand)) in zip(packet['routes'], fields):
    assert route['field'] == field_ref(operand['input']['identity']) and route['operator'] == operation['operator'] and (route['operation'] == operation['kind'])
routes = [{'id': 'route' + str(i), 'use': route} for (i, route) in enumerate(packet['routes'])]
assert all(('mode' not in x['use'] and 'originalAction' not in x['use'] for x in routes))
