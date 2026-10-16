"""Generated query cohorts cannot silently rebind to different model bytes."""
from dataclasses import replace
from typing import ClassVar
from umf_access.types import StrictModel
from umf_access.dsl import Param, GeneratedSource
import unittest
from umf_access.capture import capture
from umf_access.dsl import Column, Join, Query, query
from umf_access.reviewed import CatalogRead, ReadBuildError, build_query
from test_reviewed_reads import (Compiler, Empty, Projection, projection, objects,
    ORDER, CUSTOMER_REL, SOURCE, binding)


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
        @query
        def mixed_field():
            return objects.filter(other == 1).limit(10).all()
        @query
        def no_source():
            return unpinned.limit(10).all()
        for declaration in (mixed_field, no_source):
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
