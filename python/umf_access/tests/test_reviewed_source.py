"""Generated query cohorts cannot silently rebind to different model bytes."""
import unittest
from dataclasses import replace
from typing import ClassVar

from test_reviewed_reads import (
    CUSTOMER_REL,
    ORDER,
    SOURCE,
    Compiler,
    Empty,
    Projection,
    binding,
    objects,
    projection,
)
from umf_access.capture import capture
from umf_access.dsl import Column, GeneratedSource, Param, Query, query
from umf_access.dsl._context import CaptureError
from umf_access.reviewed import CatalogRead, ReadBuildError, build_query
from umf_access.types import StrictModel


class StaleKey(StrictModel):
    KEY_IDENTITY: ClassVar[dict[str, str]] = {"documentId": "praxis-read-test", "coreVersion": "0.8.0", "module": "commerce", "element": "Order", "key": "Order_key"}
    UMF_SOURCE: ClassVar[GeneratedSource] = replace(SOURCE, input_digest="b" * 64)
    id: int


class SourcePins(unittest.TestCase):
    def test_exact_cohort_build_restore_and_missing_loaded_source(self):
        @query
        def declaration():
            return objects.join(CUSTOMER_REL).into(projection).limit(10).all()
        entry = build_query(capture(declaration), Compiler(), parameters=Empty, result=Projection,
                            target="postgresql18", binding=binding(), row_cap=10)
        self.assertEqual(entry.artifact()["generatedSource"]["input_digest"], SOURCE.input_digest)
        with self.assertRaisesRegex(ReadBuildError, "CATALOG_STALE"):
            CatalogRead(entry.artifact_json, Empty, Projection).artifact()
        self.assertEqual(CatalogRead(entry.artifact_json, Empty, Projection, SOURCE).artifact(), entry.artifact())
        with self.assertRaisesRegex(ReadBuildError, "CATALOG_STALE"):
            CatalogRead(entry.artifact_json, Empty, Projection, replace(SOURCE, input_digest="b" * 64)).artifact()

    def test_stale_root_and_mixed_join_refuse_before_compiler(self):
        class NeverCompile:
            def compile_raw_read_json(self, request: str) -> str:
                raise AssertionError("source mismatch reached Weft")
        stale = Query(replace(ORDER, source=replace(SOURCE, document_sha256="b" * 64)))
        @query
        def stale_root():
            return stale.limit(10).all()
        mixed = replace(CUSTOMER_REL, target=replace(CUSTOMER_REL.target, source=replace(SOURCE, input_digest="b" * 64)))
        @query
        def mixed_join():
            return objects.join(mixed).into(projection).limit(10).all()
        for declaration in (stale_root, mixed_join):
            with self.subTest(declaration=declaration), self.assertRaisesRegex(ReadBuildError, "CATALOG_STALE"):
                build_query(capture(declaration), NeverCompile(), parameters=Empty, result=Projection,
                            target="postgresql18", binding=binding(), row_cap=10)

    def test_mixed_filter_field_and_unpinned_root_refuse(self):
        class NeverCompile:
            def compile_raw_read_json(self, request: str) -> str:
                raise AssertionError("source mismatch reached Weft")
        other = Column(replace(ORDER.key[0], source=replace(SOURCE, input_digest="b" * 64)))
        unpinned = Query(replace(ORDER, source=None))
        no_key = Query(replace(ORDER, key_id=None))
        @query
        def mixed_field():
            return objects.filter(other == 1).limit(10).all()
        @query
        def no_source():
            return unpinned.limit(10).all()
        @query
        def no_selected_key():
            return no_key.limit(10).all()
        for declaration in (mixed_field, no_source, no_selected_key):
            with self.subTest(declaration=declaration), self.assertRaisesRegex(ReadBuildError, "CATALOG_STALE"):
                build_query(capture(declaration), NeverCompile(), parameters=Empty, result=Projection,
                            target="postgresql18", binding=binding(), row_cap=10)

    def test_key_parameter_and_literal_keep_their_generated_cohort(self):
        class NeverCompile:
            def compile_raw_read_json(self, request: str) -> str:
                raise AssertionError("stale Key reached Weft")
        @query
        def paged(after: Param[StaleKey | None]):
            return objects.page(size=2, after=after)
        @query
        def literal_key():
            return objects.get(StaleKey(id=1))
        captured = capture(paged)
        self.assertEqual(captured.parameters[0].key_source, StaleKey.UMF_SOURCE)
        for declaration in (captured, capture(literal_key)):
            with self.assertRaisesRegex(ReadBuildError, "CATALOG_STALE"):
                build_query(declaration, NeverCompile(), parameters=Empty, result=Projection,
                            target="postgresql18", binding=binding())

    def test_same_generation_alternate_key_cannot_replace_selected_key(self):
        class Alternate(StrictModel):
            KEY_IDENTITY: ClassVar[dict[str, str]] = {**StaleKey.KEY_IDENTITY, "key": "alternate"}
            UMF_SOURCE: ClassVar[GeneratedSource] = SOURCE
            id: int
        @query
        def get_wrong():
            return objects.get(Alternate(id=1))
        @query
        def page_wrong(after: Param[Alternate | None]):
            return objects.page(size=2, after=after)
        for declaration in (get_wrong, page_wrong):
            with self.assertRaisesRegex(CaptureError, "selected Record Key"):
                capture(declaration)


class CursorDispatch(unittest.TestCase):
    def test_continuation_nullability_before_read_dispatch(self):
        import hashlib
        import json
        from types import SimpleNamespace
        from unittest.mock import patch

        from test_reviewed_reads import JOIN_SQL, JoinedRow
        from umf_access.pages import ReadContinuation, StaleContinuation
        from umf_access.postgres_read import _program
        from umf_access.reviewed import ReviewedSQL

        entry = ReviewedSQL(JOIN_SQL, Empty, JoinedRow, 2, keyset=True).build(
            Compiler(), target="postgresql18", binding=binding())
        connection = SimpleNamespace(info=SimpleNamespace(transaction_status=0, server_version=180006,
                                                          dbname="test", host="local", port=5432))
        identity = hashlib.sha256(json.dumps([entry.artifact_json, entry.context_json, "app", [],
                                             "reader", "test", "local", 5432, []], separators=(",", ":")).encode()).hexdigest()
        def admission(*args, cache_context=None, shape_proof=None):
            self.assertIsNone(cache_context)
            self.assertEqual(shape_proof, [])
            yield from ()
            return ("reader",), []
        for values, permitted in (((None, None), False), ((None, True), False),
                                  ((None, 1), True), (("name", 1), True), (None, True)):
            with self.subTest(values=values), patch("umf_access.postgres_read.native_read_admission", admission):
                after = None if values is None else ReadContinuation(values, identity)
                program = _program(connection, entry, Empty(), app_schema="app", after=after)
                dispatched = False
                try:
                    while True:
                        step = next(program)
                        if step[:2] == ("execute", entry.artifact()["dbapiSql"]):
                            dispatched = True
                            break
                except StaleContinuation:
                    self.assertFalse(permitted)
                finally:
                    program.close()
                self.assertEqual(dispatched, permitted)
