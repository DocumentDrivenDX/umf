"""Native Python Protobuf behavioral oracle. Does not import the UMF implementation."""
import json
import sys
import os
import importlib.metadata
from pathlib import Path
from google.protobuf import descriptor_pb2, descriptor_pool, message_factory

assert importlib.metadata.version('protobuf') == '7.36.2'

def load(path):
    source = descriptor_pb2.FileDescriptorSet.FromString(Path(path).read_bytes())
    pool = descriptor_pool.DescriptorPool()
    pending = list(source.file)
    while pending:
        before = len(pending)
        for file in pending[:]:
            try:
                pool.AddSerializedFile(file.SerializeToString())
            except TypeError:
                continue
            pending.remove(file)
        if len(pending) == before:
            raise AssertionError('Unresolved/invalid native descriptors: ' + ', '.join(f.name for f in pending))
    return pool

def run(pool):
    def cls(name): return message_factory.GetMessageClass(pool.FindMessageTypeByName(name))
    Legacy = cls('umf.fixture.legacy.Legacy')
    Order = cls('umf.fixture.modern.Order')
    Account = cls('umf.fixture.edition.Account')
    results = {}
    def check(name, actual, expected):
        assert actual == expected, (name, actual, expected)
        results[name] = actual
    def rejects(name, action):
        try: action()
        except (ValueError, TypeError, OverflowError): results[name] = 'rejected'; return
        raise AssertionError(name + ' unexpectedly accepted')

    value = Legacy()
    check('proto2-required-uninitialized', value.IsInitialized(), False)
    check('proto2-required-path', value.FindInitializationErrors(), ['id'])
    value.id = 'x'
    check('proto2-default-int64-exact', value.balance, 9223372036854775807)
    check('proto2-default-absent', value.HasField('balance'), False)
    check('proto2-default-bytes', value.marker.hex(), '00ff')
    value.balance = 9223372036854775807
    check('proto2-explicit-default-present', value.HasField('balance'), True)
    check('proto2-explicit-default-wire', value.SerializeToString().hex(), '0a017810ffffffffffffffff7f')
    value.ClearField('balance')
    check('proto2-clear-default-wire', value.SerializeToString().hex(), '0a0178')
    rejects('proto2-int64-overflow', lambda: setattr(value, 'balance', 9223372036854775808))
    value.history.extend([0, -1, 1])
    check('proto2-packed-zigzag', value.SerializeToString().hex(), '0a01782203000102')
    value.ClearField('history')
    value.details.SetInParent()
    check('proto2-group-default', value.details.active, True)
    check('proto2-empty-group-wire', value.SerializeToString().hex(), '0a01782b2c')
    value.ClearField('details')
    check('proto2-enum-alias', Legacy.STARTED, Legacy.OPEN)
    rejects('proto2-closed-enum-assignment', lambda: setattr(value, 'state', 99))
    value.ParseFromString(bytes.fromhex('0a01783863'))
    check('proto2-unknown-enum-not-present', value.HasField('state'), False)
    check('proto2-unknown-enum-retained', value.SerializeToString().hex(), '0a01783863')
    value = Legacy(id='x', email='a')
    value.token = b''
    check('proto2-oneof-selection', value.WhichOneof('choice'), 'token')
    check('proto2-oneof-clears-previous', value.HasField('email'), False)
    check('proto2-oneof-empty-present', value.SerializeToString().hex(), '0a01784a00')
    value.ClearField('token')
    extension = pool.FindExtensionByName('umf.fixture.legacy.extension_note')
    value.Extensions[extension] = 'n'
    check('proto2-extension-wire', value.SerializeToString().hex(), '0a0178a206016e')
    check('proto2-extension-reopen', Legacy.FromString(value.SerializeToString()).Extensions[extension], 'n')
    options_type = cls('google.protobuf.FieldOptions')
    field_options = options_type.FromString(Legacy.DESCRIPTOR.fields_by_name['id'].GetOptions().SerializeToString())
    business_term = pool.FindExtensionByName('umf.fixture.legacy.business_term')
    check('proto2-custom-option', field_options.Extensions[business_term], 'stable identifier')

    value = Order(id='')
    check('proto3-implicit-empty-omitted', value.SerializeToString().hex(), '')
    rejects('proto3-implicit-hasfield', lambda: value.HasField('id'))
    check('proto3-optional-absent', value.HasField('quantity'), False)
    value.quantity = 0
    check('proto3-optional-zero-present', value.HasField('quantity'), True)
    check('proto3-optional-zero-wire', value.SerializeToString().hex(), '1000')
    value.ClearField('quantity')
    check('proto3-optional-clear', value.SerializeToString().hex(), '')
    value.totals['lowest'] = -9223372036854775808
    check('proto3-map-exact-int64', Order.FromString(value.SerializeToString()).totals['lowest'], -9223372036854775808)
    line = value.lines.add(sku='s', count=18446744073709551615)
    check('proto3-uint64-maximum', Order.FromString(value.SerializeToString()).lines[0].count, 18446744073709551615)
    rejects('proto3-uint64-negative', lambda: setattr(line, 'count', -1))
    rejects('proto3-uint64-overflow', lambda: setattr(line, 'count', 18446744073709551616))
    value = Order.FromString(bytes.fromhex('2201612a0162'))
    check('proto3-oneof-wire-last-wins', value.WhichOneof('destination'), 'webhook')
    check('proto3-oneof-wire-value', value.webhook.hex(), '62')
    value = Order.FromString(bytes.fromhex('980607'))
    check('proto3-unknown-wire-retained', value.SerializeToString().hex(), '980607')

    value = Account(name='', amount=0)
    check('edition-explicit-name-present', value.HasField('name'), True)
    rejects('edition-implicit-amount-hasfield', lambda: value.HasField('amount'))
    check('edition-mixed-presence-wire', value.SerializeToString().hex(), '0a00')
    value.ClearField('name')
    value.changes.extend([1, 2])
    check('edition-expanded-repeated-wire', value.SerializeToString().hex(), '18011802')
    rejects('edition-closed-enum-assignment', lambda: setattr(value, 'status', 99))
    check('service-input-streaming', pool.FindServiceByName('umf.fixture.modern.Orders').methods[0].client_streaming, True)
    check('service-output-streaming', pool.FindServiceByName('umf.fixture.modern.Orders').methods[0].server_streaming, True)
    return results

before = run(load(sys.argv[1]))
after = run(load(sys.argv[2]))
assert before == after
negative_controls = []
for path in sys.argv[3:]:
    mutated_pool = load(path)  # Invalid descriptors are not a semantic negative control.
    try: run(mutated_pool)
    except (AssertionError, ValueError) as error:
        negative_controls.append({'artifact': Path(path).name, 'detected': str(error)})
    else: raise AssertionError('Native behavior oracle failed to detect mutation: ' + path)
report = {'oracle': 'Python protobuf ' + importlib.metadata.version('protobuf'),
          'cases': len(before), 'beforeAndAfter': 'passed', 'checks': before,
          'negativeControls': negative_controls,
          'scope': 'Authored proto2, proto3, Edition 2023 descriptors; native runtime behavior, not source parser conformance'}
Path(os.environ.get('UMF_BEHAVIOR_REPORT','fixtures/protobuf/behavior-results.json')).write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({key: value for key, value in report.items() if key != 'checks'}, indent=2))
