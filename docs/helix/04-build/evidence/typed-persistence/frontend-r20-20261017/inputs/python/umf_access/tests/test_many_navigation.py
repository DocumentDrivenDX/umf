"""Navigation metadata controls only; original engines own graph acceptance."""

import unittest
from dataclasses import replace

from umf_access.dsl import (
    CaptureError,
    InverseManyNavigation,
    Join,
    ManyNavigation,
    Query,
    Related,
)
from umf_access.dsl._context import CURRENT, CaptureContext
from umf_access.dsl._nodes import FieldRef, GeneratedSource, RecordRef
from umf_access.dsl.navigation import (
    InverseNavigation,
    RequiredNavigation,
    navigation_parts,
)

SOURCE = GeneratedSource(
    "metadata-only", "0.8.0", "1" * 64, "2" * 64, "umf-access-runtime/0.1"
)


def root(record, key):
    return RecordRef(
        "m",
        record,
        (FieldRef("m", record, key, source=SOURCE),),
        source=SOURCE,
        key_id=key,
    )


SOURCE_SELECTED = root("Owner", "sourceSelected")
TARGET_SELECTED = root("Target", "targetSelected")
RELATION_KEY = root("Target", "relationshipKey")
INVERSE_KEY = root("Owner", "inverseOriginal")
REF = FieldRef("m", "Owner", "edges", source=SOURCE)


def many(**changes):
    return ManyNavigation(
        REF,
        key_target=RELATION_KEY,
        source_query=SOURCE_SELECTED,
        target_query=TARGET_SELECTED,
        inverse_key_target=INVERSE_KEY,
        **changes,
    )


class ManyNavigationTests(unittest.TestCase):
    def setUp(self):
        token = CURRENT.set(CaptureContext(frozenset(), frozenset()))
        self.addCleanup(CURRENT.reset, token)

    def test_original_relation_keys_are_distinct_from_selected_navigation_keys(self):
        relation = many()
        inverse = relation.inverse()
        self.assertIsInstance(inverse, InverseManyNavigation)
        self.assertEqual(
            (
                relation.source_query,
                relation.target_query,
                relation.key_target,
                relation.inverse_key_target,
            ),
            (SOURCE_SELECTED, TARGET_SELECTED, RELATION_KEY, INVERSE_KEY),
        )
        self.assertEqual(
            (inverse.source_query, inverse.target_query, inverse.key_target),
            (TARGET_SELECTED, SOURCE_SELECTED, INVERSE_KEY),
        )
        self.assertIs(inverse.relationship, relation)
        self.assertEqual(Query(SOURCE_SELECTED).related(relation).ref, TARGET_SELECTED)
        self.assertEqual(Query(TARGET_SELECTED).related(inverse).ref, SOURCE_SELECTED)
        self.assertEqual(
            navigation_parts(inverse),
            (TARGET_SELECTED, SOURCE_SELECTED, relation, "inverse"),
        )
        self.assertNotIsInstance(relation, Join)

    def test_unpinned_foreign_roots_and_missing_original_key_refuse(self):
        relation = many()
        for mutation in [
            {"ref": replace(REF, element="Other")},
            {"source_query": replace(SOURCE_SELECTED, source=None)},
            {"key_target": None},
            {"key_target": root("Other", "relationshipKey")},
            {
                "target_query": replace(
                    TARGET_SELECTED, source=replace(SOURCE, input_digest="3" * 64)
                )
            },
            {"inverse_key_target": root("Other", "inverseOriginal")},
            {"direction": "inverse"},
        ]:
            with self.subTest(mutation=mutation), self.assertRaises(TypeError):
                replace(relation, **mutation)
        for mutation in [
            {"ref": replace(REF, element="Other")},
            {"key_target": SOURCE_SELECTED},
            {"source_query": SOURCE_SELECTED},
            {"direction": "forward"},
        ]:
            with self.subTest(inverse=mutation), self.assertRaises(TypeError):
                replace(relation.inverse(), **mutation)

    def test_plain_related_and_alias_navigation_stay_closed(self):
        with self.assertRaises(TypeError):
            navigation_parts(Related(REF, key_target=RELATION_KEY))
        alias_source = replace(
            SOURCE_SELECTED,
            alias="a",
            key=tuple(replace(f, alias="a") for f in SOURCE_SELECTED.key),
        )
        aliased = replace(
            many(), ref=replace(REF, alias="a"), source_query=alias_source
        )
        with self.assertRaises(CaptureError):
            navigation_parts(aliased)
        with self.assertRaises(CaptureError):
            aliased.inverse()

    def test_existing_five_argument_inverse_navigation_abi_unchanged(self):
        annotation = InverseNavigation[object, object, object, object, object]
        self.assertIsNotNone(annotation)
        relation = RequiredNavigation(
            REF,
            RELATION_KEY,
            source_query=SOURCE_SELECTED,
            target_query=TARGET_SELECTED,
            inverse_key_target=INVERSE_KEY,
        )
        inverse = relation.inverse()
        self.assertIsInstance(inverse, InverseNavigation)
        self.assertEqual(inverse.key_target, INVERSE_KEY)
        with self.assertRaises(TypeError):
            InverseNavigation(
                inverse.ref,
                many(),
                TARGET_SELECTED,
                SOURCE_SELECTED,
                key_target=INVERSE_KEY,
                direction="inverse",
            )

    def test_missing_inverse_relationship_key_does_not_erase_selected_roots(self):
        relation = replace(many(), inverse_key_target=None)
        inverse = relation.inverse()
        self.assertEqual(Query(TARGET_SELECTED).related(inverse).ref, SOURCE_SELECTED)
        self.assertIsNone(inverse.key_target)
        with self.assertRaises(CaptureError):
            inverse.has(None)
