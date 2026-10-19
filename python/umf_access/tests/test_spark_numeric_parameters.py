# SPDX-License-Identifier: MIT OR Apache-2.0
"""Exact owner-declared Spark parameter transport before native dispatch."""
import copy
import unittest
from decimal import Decimal, localcontext

from umf_access.delta_read import _numeric_parameters, _runtime_obligations
from umf_access.targets import TargetMismatch


def artifact():
    parameters = [{"name": "integer", "carrier": "integer", "nullable": False},
                  {"name": "decimal", "carrier": "decimal", "nullable": True}]
    return {"parameters": parameters, "obligations": {"numericPredicateParameters": {
        "version": "weft.spark-exact-numeric-text/0.1", "parameters": copy.deepcopy(parameters),
        "maximumTokenBytes": 10000, "format": "finite-plain-base-ten"}}}


class NumericParameterTests(unittest.TestCase):
    def test_unimplemented_original_obligations_refuse_before_native_dispatch(self):
        source = artifact()
        source['obligations'].update({'transaction': 'snapshot-read', 'tableIdentity': 'uuid-and-version',
            'timeout': 'one-call-deadline', 'rowCap': 50, 'principal': 'administrative-single-tenant',
            'ansiEnabled': True, 'binaryStringCollation': True, 'escapedStringLiterals': False,
            'sparkVersion': '4.0.1', 'deltaVersion': '4.0.0'})
        _runtime_obligations(source)
        for name in ('listPredicateParameters', 'unknownFutureSemantics'):
            changed = copy.deepcopy(source)
            changed['obligations'][name] = {'version': 'unknown'}
            with self.assertRaises(TargetMismatch):
                _runtime_obligations(changed)
        for name, value in (('principal', 'managed'), ('ansiEnabled', 1), ('snapshot', False),
                            ('rowCap', True), ('sparkVersion', 'future'), ('timeout', 'unbounded')):
            changed = copy.deepcopy(source)
            changed['obligations'][name] = value
            with self.assertRaises(TargetMismatch):
                _runtime_obligations(changed)

    def test_plain_tokens_do_not_use_decimal_context_or_native_numeric_inference(self):
        source = artifact()
        integer = 10**5000 + 17
        decimal = Decimal('-12345678901234567890123456789012345678.00000000000000000001')
        values = {"integer": integer, "decimal": decimal, "__umf_after_0": Decimal('1.20')}
        with localcontext() as context:
            context.prec = 2
            actual = _numeric_parameters(source, values)
        self.assertEqual(actual["integer"], '1' + '0' * 4998 + '17')
        self.assertEqual(actual["decimal"], '-12345678901234567890123456789012345678.00000000000000000001')
        self.assertEqual(actual["__umf_after_0"].as_tuple(), Decimal('1.20').as_tuple())
        self.assertIs(values["integer"], integer)
        for value, expected in ((Decimal('-0E-4'), '-0.0000'), (Decimal('1E+40'), '1'+'0'*40), (None, None)):
            self.assertEqual(_numeric_parameters(source, {"integer": 0, "decimal": value})["decimal"], expected)

    def test_bad_carriers_nonfinite_and_oversized_tokens_refuse(self):
        for integer, decimal in ((True, Decimal(1)), (1.0, Decimal(1)),
                                 (1, Decimal('NaN')), (1, Decimal('Infinity')),
                                 (1, Decimal('1E+10000')), (1, Decimal('1E-10000')),
                                 (10**10000, Decimal(1)), (None, Decimal(1)), (1, 1)):
            with self.subTest(integer_type=type(integer).__name__, decimal=repr(decimal)), self.assertRaises(ValueError):
                _numeric_parameters(artifact(), {"integer": integer, "decimal": decimal})

    def test_original_closed_codec_metadata_cannot_be_widened(self):
        for mode in range(4):
            source = artifact()
            decoder = source["obligations"]["numericPredicateParameters"]
            if mode == 0:
                decoder["maximumTokenBytes"] = 10001
            elif mode == 1:
                decoder["parameters"].reverse()
            elif mode == 2:
                decoder["version"] = 'guessed'
            else:
                decoder["extra"] = True
            with self.assertRaises(TargetMismatch):
                _numeric_parameters(source, {"integer": 1, "decimal": None})


if __name__ == '__main__':
    unittest.main()
