evaluated = exchange({'kind': 'evaluate', 'requestId': 'evaluate', 'sourceReceipt': receipt, 'owner': f['owner'], 'cut': cut, 'operations': operations, 'routes': routes})
assert evaluated['kind'] == 'evaluation'
batch = evaluated['batch']
assert batch['status'] == 'completed' and batch['authority'] is False and (batch['complete'] is False)
assert [(x['id'], x['kind']) for x in batch['operations']] == [(x['id'], x['kind']) for x in operations]
assert [x['id'] for x in evaluated['routeResults']] == [x['id'] for x in routes]
assert [x['result']['plan']['use'] for x in evaluated['routeResults']] == packet['routes']
expected = 'deny' if inactive else 'permit'
for operation in batch['operations']:
    outcome = operation['outcome']
    assert outcome['authority'] is False and outcome['complete'] is False
    if operation['kind'] == 'read-rules':
        assert outcome['status'] == 'evaluated' and len(outcome['rows']) == 1 and all((x['decision'] == expected for x in outcome['rows']))
        assert [x['resource'] for x in outcome['rows']] == [{'type': packet['scans'][0]['type'], 'key': [{'string': 'r1'}]}]
    if operation['kind'] == 'scan':
        selected = next((x for x in operations if x['id'] == operation['id']))['selection']['fields']
        cells = []
        for field in selected:
            if field['elementId'] == 'salary':
                cells.append({'field': field, 'disposition': 'transformed', 'outputType': {**field, 'elementId': 'salaryMaskLabel'}, 'value': {'string': '[private]'}})
            elif field['elementId'] == 'token':
                cells.append({'field': field, 'disposition': 'original', 'value': {'string': 'opaque-token'}})
            else:
                raise AssertionError('Unexpected fixture Field')
        assert outcome['status'] == 'rendered' and outcome['rows'] == ([] if inactive else [cells])
        assert outcome['valueProfiles'] == []
        rules = next((x['outcome'] for x in batch['operations'] if x['id'] == operation['id'].replace('-cells', '-rules')))
        assert len(outcome['rows']) == sum((x['decision'] == 'permit' for x in rules['rows']))
    if operation['id'] in action_ops:
        assert outcome['status'] == 'evaluated' and len(outcome['rows']) == 1 and all((x['decision'] == expected for x in outcome['rows']))
for (route_index, route) in enumerate(evaluated['routeResults']):
    result = route['result']
    assert result['status'] == 'evaluated' and result['authority'] is False and (result['complete'] is False)
    assert len(result['rows']) == 1 and result['rows'][0]['resource'] == {'type': packet['scans'][0]['type'], 'key': [{'string': 'r1'}]}
    for row in result['rows']:
        assert row['readDecision'] == expected
        if inactive:
            assert row['selection'] == 'read-denied' and row['activeBranches'] == []
        if not inactive:
            assert row['selection'] == 'selected'
            branches = [x for x in result['plan']['branches'] if x['index'] in row['activeBranches']]
            assert branches
            for branch in branches:
                assert branch['status'] in ['requires-original-action', 'compatible-disclosed-properties'], branch
                if branch['status'] == 'requires-original-action':
                    assert next((x for x in designation['uses'] if x['scan'] == result['plan']['use']['scan'] and x['path'] == result['plan']['use']['path']))['originalAction'] is not None
if name == 'field-free-count':
    assert not routes and (not packet['projections']) and (len(operations) == 2) and (operations[1]['selection']['fields'] == [])
if name == 'self-join':
    assert len(packet['scans']) == 2 and {x['use']['scan'] for x in routes} == {'s0', 's1'}
if name == 'false-predicate':
    assert routes and action_ops
