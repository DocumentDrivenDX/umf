# SPDX-License-Identifier: MIT OR Apache-2.0
"""Native term obligations must refuse mismatches before releasing rows."""

from __future__ import annotations

import copy
import unittest

from umf_access.pages import ReadObligationUnmet
from umf_access.postgres_read import _term_admissions, _verify_terms
from umf_access.reviewed import ReadBuildError


def obligation() -> dict[str, object]:
    return {"termFilter": {
        "version": "umf.raw-term-filter/0.1",
        "nativeCatalogBeforeAfter": True,
        "indexes": [{"nativeAdmission": {
            "sql": "SELECT $1 = $2",
            "dbapiSql": "SELECT %(__umf_term_1)s = %(__umf_term_2)s",
            "dbapiParameterOrder": ["__umf_term_1", "__umf_term_2"],
            "parameters": [
                {"name": "__umf_term_1", "carrier": "string", "source": {"appSchema": True}},
                {"name": "__umf_term_2", "carrier": "string", "source": {"literal": {"string": "owned_schema"}}},
            ],
        }}],
    }}


class TermAdmissionTests(unittest.TestCase):
    def test_binds_only_retained_sources_and_preserves_sql(self) -> None:
        original = obligation()
        saved = copy.deepcopy(original)
        admissions = _term_admissions(original, "owned_schema")
        self.assertEqual(original, saved)
        self.assertEqual(admissions, ((
            "SELECT %(__umf_term_1)s = %(__umf_term_2)s",
            {"__umf_term_1": "owned_schema", "__umf_term_2": "owned_schema"},
        ),))
        self.assertEqual(_term_admissions({}, "owned_schema"), ())

    def test_malformed_and_unknown_obligations_refuse(self) -> None:
        mutations = [
            lambda term: term.update(version="future"),
            lambda term: term.update(nativeCatalogBeforeAfter=False),
            lambda term: term.update(indexes=[]),
            lambda term: term["indexes"][0]["nativeAdmission"].update(dbapiSql=None),
            lambda term: term["indexes"][0]["nativeAdmission"].update(dbapiParameterOrder=[]),
            lambda term: term["indexes"][0]["nativeAdmission"]["parameters"][0].update(source={"callerInput": True}),
            lambda term: term["indexes"][0]["nativeAdmission"]["parameters"][1].update(name="__umf_term_1"),
            lambda term: term["indexes"][0]["nativeAdmission"]["parameters"][0].update(carrier="integer"),
        ]
        for mutate in mutations:
            value = obligation()
            mutate(value["termFilter"])
            with self.subTest(mutation=mutate), self.assertRaises(ReadBuildError):
                _term_admissions(value, "owned_schema")

    def test_native_admission_requires_exactly_one_true_boolean(self) -> None:
        admissions = _term_admissions(obligation(), "owned_schema")
        for rows in ([], [(False,)], [(None,)], [(1,)], [(True,), (True,)], [(True, "extra")]):
            program = _verify_terms(admissions)
            self.assertEqual(next(program), ("execute", *admissions[0]))
            self.assertEqual(program.send(None), ("many", 2))
            with self.subTest(rows=rows), self.assertRaises(ReadObligationUnmet):
                program.send(rows)
        program = _verify_terms(admissions)
        next(program)
        program.send(None)
        with self.assertRaises(StopIteration):
            program.send([(True,)])


if __name__ == "__main__":
    unittest.main()
