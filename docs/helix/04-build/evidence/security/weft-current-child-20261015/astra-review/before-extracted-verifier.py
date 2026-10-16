evaluated = exchange({'kind': 'evaluate', 'requestId': 'evaluate', 'sourceReceipt': receipt, 'owner': f['owner'], 'cut': cut, 'operations': operations, 'routes': routes})
assert evaluated['kind'] == 'evaluation'
batch = evaluated['batch']
assert batch['status'] == 'completed' and batch['authority'] is False and (batch['complete'] is False)
expected = 'deny' if inactive else 'permit'
for operation in batch['operations']:
    outcome = operation['outcome']
    assert outcome['authority'] is False and outcome['complete'] is False
    if operation['kind'] == 'read-rules':
        assert outcome['status'] == 'evaluated' and outcome['rows'] and all((x['decision'] == expected for x in outcome['rows']))
    if operation['id'] in action_ops:
        assert outcome['status'] == 'evaluated' and outcome['rows'] and all((x['decision'] == expected for x in outcome['rows']))
for (route_index, route) in enumerate(evaluated['routeResults']):
    result = route['result']
    assert result['status'] == 'evaluated' and result['authority'] is False and (result['complete'] is False)
    for row in result['rows']:
        assert row['readDecision'] == expected
        if not inactive:
            assert row['selection'] == 'selected'
            branches = [x for x in result['plan']['branches'] if x['index'] in row['activeBranches']]
            assert branches
            for branch in branches:
                assert branch['status'] in ['requires-original-action', 'compatible-disclosed-properties'], branch
                if branch['status'] == 'requires-original-action':
                    assert next((x for x in designation['uses'] if x['scan'] == result['plan']['use']['scan'] and x['path'] == result['plan']['use']['path']))['originalAction'] is not None
if name == 'field-free-count':
    assert not routes and (not packet['projections']) and (len(operations) == 1)
if name == 'self-join':
    assert len(packet['scans']) == 2 and {x['use']['scan'] for x in routes} == {'s0', 's1'}
if name == 'false-predicate':
    assert routes and action_ops
