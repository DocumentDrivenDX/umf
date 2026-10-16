"""Actual generated-source runtime probe; not installed-wheel/native qualification."""
import importlib
import hashlib
import zipfile
import importlib.metadata
import operator
import json
from pathlib import Path
import sys
from datetime import datetime, timezone, timedelta
from decimal import Decimal

root = Path(sys.argv[1]).resolve()
runtime = Path(sys.argv[2]).resolve()
sys.path.insert(0, str(runtime))
import pydantic
import umf_access
assert sys.version.split()[0] == '3.14.8'
assert pydantic.__version__ == '2.14.1'
assert Path(umf_access.__file__).resolve().is_relative_to(runtime)
assert umf_access.RUNTIME_ABI == 'umf-access-runtime/0.1'
wheel_identity = None
if len(sys.argv) > 3:
    wheel = Path(sys.argv[3]).resolve()
    wheel_identity = hashlib.sha256(wheel.read_bytes()).hexdigest()
    assert wheel_identity == sys.argv[4]
    assert importlib.metadata.version('umf_access') == '0.1.0.dev0'
    with zipfile.ZipFile(wheel) as archive:
        expected = {name for name in archive.namelist() if name.startswith('umf_access/') and not name.endswith('/')}
        actual = {str(path.relative_to(runtime)) for path in (runtime / 'umf_access').rglob('*') if path.is_file() and '__pycache__' not in path.parts}
        assert actual == expected
        for name in expected:
            assert (runtime / name).read_bytes() == archive.read(name)
checks = []

def refused(label, function):
    try:
        function()
    except (ValueError, TypeError):
        checks.append(label)
        return
    raise AssertionError(label + ' unexpectedly accepted')

def load(case):
    for name in list(sys.modules):
        if name == 'shop' or name.startswith('shop.'):
            del sys.modules[name]
    sys.path.insert(0, str(root / case))
    importlib.invalidate_caches()
    return importlib.import_module('shop'), importlib.import_module('shop.codecs')

stamp = datetime(2026, 1, 1, 12, 30, tzinfo=timezone(timedelta(hours=2)))
base = dict(order_id='order-1', amount=Decimal('1.200'), placed_at=stamp)
shop, codecs = load('engine')
assert codecs.encode_Order_patch(shop.OrderPatch()) == {}
assert codecs.encode_Order_patch(shop.OrderPatch(memo=None)) == {'memo': None}
assert 'memo' not in codecs.encode_Order_create(shop.OrderCreate(**base))
assert codecs.encode_Order_create(shop.OrderCreate(**base))['placedAt'].tzinfo is timezone.utc
assert shop.OrderCreate(**base).amount.as_tuple() == Decimal('1.200').as_tuple()
refused('strict decimal', lambda: shop.OrderCreate(**(base | {'amount': '1.2'})))
refused('decimal precision', lambda: shop.OrderCreate(**(base | {'amount': Decimal('1.234')})))
refused('immutable Patch', lambda: shop.OrderPatch(placed_at=stamp))
refused('generated Create', lambda: shop.OrderCreate(**base, revision=1))
refused('Key hash', lambda: hash(shop.OrderKey(order_id='x')))
refused('sealed model', lambda: type('Forbidden', (shop.Order,), {}))
assert shop.OrderKey.__hash__ is None
assert tuple(shop.OrderLineKey.model_fields) == ('line_order_id', 'line_number')
assert not {'c', 'objects'} & set(shop.Order.model_json_schema()['properties'])
checks += ['presence', 'exact decimal tuple', 'UTC encode', 'ordered composite Key', 'ClassVar schema']

shop, codecs = load('containers')
value = shop.OrderCreate(**base, tags=['a'], labels={'a': 'ok'})
assert codecs.encode_Order_create(value)['tags'] == ['a']
assert shop.Order(**base, revision=1, tags=['a'], labels={'a': None}).labels == {'a': None}
for label, delta in [('empty array', {'tags': []}), ('item carrier', {'tags': [1]}),
                     ('Create item null', {'tags': ['a'], 'labels': {'a': None}}),
                     ('map surrogate key', {'tags': ['a'], 'labels': {'\ud800': 'x'}})]:
    refused(label, lambda delta=delta: shop.OrderCreate(**(base | delta)))
value.tags[0] = 1
refused('nested mutation at codec', lambda: codecs.encode_Order_create(value))
row = codecs.decode_Order(['orderId', 'amount', 'memo', 'placedAt', 'revision', 'tags', 'labels'],
                          ['o', Decimal('1.20'), None, stamp, 1, ['x'], {'x': None}])
assert row.placed_at.tzinfo is timezone.utc and row.placed_at.hour == 10
refused('duplicate row column', lambda: codecs.decode_Order(['orderId', 'orderId'], ['a', 'b']))
checks += ['nested row null', 'UTC decode']

shop, _ = load('actions')
assert shop.ShipOrder.module == 'commerce' and shop.ShipOrder.action == 'shipOrder'
assert shop.ShipOrder.input_type is shop.ShipOrderInput
assert shop.ShipOrder.output_type is shop.ShipOrderOutput
shop.ShipOrderInput(order=shop.OrderKey(order_id='o'), memo=None)
refused('wrong entity carrier', lambda: shop.ShipOrderInput(order=object()))
assert shop.ShipOrderRejected('NOT_READY').retryable is False
checks.append('action identity and DTOs')

shop, _ = load('relationships')
assert hasattr(shop, 'CustomerKey') and not hasattr(shop, 'Customer')
assert shop.Order.c.customer.ref.field == 'customer'
assert shop.Order.c.customer.ref.logical_name == 'Customer relation'
checks.append('relationship Key-only closure')

shop, _ = load('projections')
assert isinstance(shop.OrderSummary.UMF_PROJECTION_FIELDS, tuple)
assert len(shop.OrderSummary.UMF_PROJECTION_FIELDS) == 2
refused('immutable update metadata', lambda: operator.setitem(shop.Order.objects.UMF_UPDATE_FIELDS, 'extra', object()))
checks.append('projection identity metadata')

shop, _ = load('named')
assert shop.Order.objects.ref.logical_namespace == 'commerce.logical'
assert shop.Order.objects.ref.logical_name == 'Orders'
assert shop.Order.c.order_id.ref.logical_name == 'Order ID'
checks.append('authored names distinct from IDs/Python attrs')

shop, _ = load('cross-module')
assert shop.Order.c.amount.ref.module == 'commerce'
assert shop.Order.c.amount.ref.field_module == 'shared'
assert shop.Order.c.amount.ref.logical_name == 'Amount'
checks.append('cross-module Field identity')
print(json.dumps({'scope': __doc__, 'python': sys.version.split()[0], 'pydantic': pydantic.__version__,
                  'runtimeSource': str(runtime), 'runtimeWheelSha256': wheel_identity, 'checks': checks, 'count': len(checks)}))
