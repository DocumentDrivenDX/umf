# SPDX-License-Identifier: MIT OR Apache-2.0
"""Freeze1 inert custody controls; authored artifacts confer no native authority."""

import copy
import hashlib
import json
import unittest
from datetime import UTC, date, datetime
from typing import Annotated, ClassVar

from pydantic import BeforeValidator

from umf_access.codec_support import decode_model
from umf_access.dsl import GeneratedSource
from umf_access.engine_catalog import EngineRead
from umf_access.native_program import ProgramBuildError, canonical_json
from umf_access.reviewed import ReadBuildError
from umf_access.types import MISSING, StrictModel
from umf_access.values import FieldValidator

PROFILE = "umf.weft-binding-temporal/0.2"
KEY = {"module": "m", "record": "Event", "key": "identity"}
RECORD = {"documentId": "events", "revision": "r1", "module": "m", "element": "Event"}


def identity(element):
    return {**RECORD, "element": element}


DOCUMENT = {
    "umf": "0.10.0", "id": "events",
    "vocabularies": {"umf.access": {"version": "0.1.0"}},
    "modules": [{"id": "m", "elements": [
        {"id": "Event", "kind": "record", "members": [
            {"module": "m", "element": name} for name in ("id", "day", "at", "wall")],
         "keys": [{"id": "identity", "fields": [{"module": "m", "element": "id"}]}]},
        *[{"id": name, "kind": "field", "scalarType": scalar, "nullability": availability}
          for name, scalar, availability in (("id", "string", "required"),
              ("day", "date", "required"), ("at", "timestamp", "required"),
              ("wall", "timestamp", "absent-allowed"))]],
        "extensions": {"umf.access": {"views": [{
            "record": {"module": "m", "element": "Event"},
            "selectedKey": {"module": "m", "element": "Event", "key": "identity"},
            "fields": [{"field": {"module": "m", "element": name},
                        "row": {"missing": name == "wall", "null": name == "wall"},
                        "create": {"missing": name == "wall", "null": name == "wall"},
                        "mutable": name != "id", "generated": False,
                        **({"temporal": kind} if kind in ("local", "instant") else {})}
                       for name, kind in (("id", "string"), ("day", "date"),
                                          ("at", "instant"), ("wall", "local"))]}],
            "columns": [], "search": [], "searchBindings": []}}}],
    "extensions": {"future": {"keep": "café / 𐀀 / unchanged"}},
}
DOCUMENT_TEXT = json.dumps(DOCUMENT, indent=2, ensure_ascii=False) + "\n"
PIN = {"documentId": "events", "revision": "r1", "umfVersion": "0.10.0",
       "sha256": hashlib.sha256(DOCUMENT_TEXT.encode()).hexdigest()}
SOURCE = GeneratedSource(document_id="events", core_version="0.10.0",
                         document_sha256=PIN["sha256"], input_digest="a" * 64,
                         runtime_abi="umf-access-runtime/0.1")


class Parameters(StrictModel):
    since: Annotated[datetime, BeforeValidator(FieldValidator(kind="instant"))]


class Event(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = SOURCE
    UMF_FIELDS: ClassVar[tuple] = tuple(("m", name, name) for name in ("id", "day", "at", "wall"))
    id: str
    day: Annotated[date, BeforeValidator(FieldValidator(kind="date"))]
    at: Annotated[datetime, BeforeValidator(FieldValidator(kind="instant"))]
    wall: Annotated[datetime, BeforeValidator(FieldValidator(kind="local"))] | None | MISSING = MISSING


def seal(program):
    program.pop("structuralDigest", None)
    program["structuralDigest"] = {
        "owner": "weft-runtime-engine-page" if "pageSize" in program else "weft-runtime-engine-read",
        "version": "0.4", "sha256": hashlib.sha256(canonical_json(program).encode()).hexdigest()}
    return program


def fixture(page=False):
    """Full authored wire vector, deliberately whitespace-sensitive inside strings."""
    abi = {"identity": "truss-postgresql-logical-query", "version": "1.3", "sha256": "b" * 64}
    binding = {"interfaceVersion": "truss-runtime-binding/0.5", "schema": "truss",
               "queryAbi": abi, "installationId": "fixture-only", "releaseId": "truss-catalog-runtime/0.76-temporal-candidate",
               "releaseSha256": "c" * 64, "catalogRevision": 1,
               "maximumScanRows": 10000, "maximumResultRows": 1000, "maximumBytes": 1048576,
               "documents": [{k: PIN[k] for k in ("documentId", "revision", "sha256")}],
               "records": [{"identity": RECORD, "typeId": "1", "fields": [
                   {"identity": identity(name), "propertyId": str(i + 1)}
                   for i, name in enumerate(("id", "day", "at", "wall"))],
                   "keys": [{"keyId": "identity", "propertyIds": ["1"]}]}], "relationships": []}
    binding_text = json.dumps(binding, indent=2) + "\n"
    request = {"interfaceVersion": "weft-compile/0.2.10", "dialect": "weft-sql/0.2.0",
               "modules": [{"pin": PIN, "documentJson": DOCUMENT_TEXT, "selectedModuleIds": ["m"]}],
               "sql": "SELECT id, day, at, wall FROM Event WHERE at >= :since ORDER BY wall NULLS FIRST, id LIMIT 3",
               "parameters": {}, "exactParameters": {}, "temporalProfile": PROFILE,
               "temporalParameters": {"since": {"kind": "instant", "value": "1969-12-31T23:59:59.5Z"}},
               "options": {"allowCandidate": True},
               "target": {"backendId": "truss.postgresql.runtime", "backendVersion": "0.4.47",
                          "targetProfile": "truss-runtime-pg18.6/0.7-temporal-candidate",
                          "bindingJson": binding_text, "bindingSha256": hashlib.sha256(binding_text.encode()).hexdigest()}}
    requirements = {"version": "truss.temporal-source-guard/0.2", "record": RECORD,
                    "fields": [{"field": identity(name), "kind": kind,
                                "presence": {"missing": name == "wall", "null": name == "wall"}}
                               for name, kind in (("day", "date"), ("at", "instant"), ("wall", "local"))]}
    outputs, columns, fields, projections = [], [], [], []
    for i, (name, kind) in enumerate((("id", "string"), ("day", "date"), ("at", "instant"), ("wall", "local"))):
        logical = {"family": "string", "facets": {}, "nullable": False} if kind == "string" else None
        rep = ({"kind": "scalar", "logicalType": logical, "carrier": "text", "decoder": "text"} if kind == "string"
               else {"kind": "value", "descriptor": identity(name), "nativeNull": True})
        outputs.append({"name": name, "carrier": kind, "nullable": name == "wall", "missing": name == "wall",
                        "source": identity(name), "representation": rep, "modelPins": [PIN],
                        **({"decoder": {"profile": "truss-temporal/0.2", "kind": kind,
                                       "temporalProfile": PROFILE}} if kind != "string" else {})})
        columns.append({"outputName": name, "position": i + 1, "sourceIdentities": [identity(name)],
                        "nullable": name == "wall", "representation": rep})
        descriptor = {"identity": identity(name), "availability": "absent-allowed" if name == "wall" else "required",
                      **({"kind": "scalar", "type": {"family": "string", "facets": {}, "nullable": False}}
                         if kind == "string" else {"kind": "exactScalar", "scalarType": "date" if kind == "date" else "timestamp"})}
        fields.append({"identity": identity(name), "kind": kind, "missing": name == "wall", "nullable": name == "wall",
                       "descriptor": descriptor, "logicalType": logical})
        projections.append({"name": name, "field": i})
    source_function = "truss.person_query_temporal_page_objects(jsonb,int,text,jsonb)" if page else "truss.person_query_temporal_objects(jsonb,int,jsonb)"
    artifact = {"status": "compiled", "interfaceVersion": request["interfaceVersion"], "dialect": request["dialect"],
                "targetContext": {k: binding[k] for k in ("queryAbi", "releaseId", "releaseSha256", "installationId", "catalogRevision")},
                "backend": {**{k: request["target"][k] for k in ("backendId", "backendVersion", "targetProfile")},
                                                "interfaceVersion": "weft-backend/0.2.10"},
                "bindingSha256": request["target"]["bindingSha256"], "modelPins": [PIN], "columns": columns,
                "logicalPlan": {"record": RECORD, "fields": fields, "modelPins": [PIN], "selectedKey": KEY,
                                "keyFields": [0], "outputs": projections,
                                "sort": [{"field": 3, "direction": "desc", "nulls": "first"},
                                         {"field": 0, "direction": "asc", "nulls": "last"}]},
                "parameters": [{"position": i + 1, "logicalType": {"family": "string", "facets": {}, "nullable": False},
                                "origin": {"kind": kind, **({"record": RECORD} if i == 1 else {})}, "value": value}
                               for i, (kind, value) in enumerate((("runtime-binding", binding_text),
                                   ("temporal-source-requirements", canonical_json(requirements))))],
                "sql": 'SELECT * FROM ' + source_function.split('(')[0] + '($1::jsonb, 1, ' + ("'identity', " if page else '') + '$2::jsonb) WHERE "at" >= $3::text',
                "sourceDomainChecks": {"version": "weft.truss-temporal-domain-checks/0.2", "mode": "native-validated-source",
                                       "queryAbi": abi, "maxScanRows": 10000, "maxBytes": 1048576,
                                       "sources": [{"record": RECORD, "bindingParameter": 1, "requirementsParameter": 2,
                                                    "sourceFunction": source_function, "selectedKey": KEY if page else None}]}}
    artifact["parameters"].append({"position": 3,
                                  "logicalType": {"kind": "accessTemporal", "temporalKind": "instant", "profile": PROFILE},
                                  "value": request["temporalParameters"]["since"]["value"],
                                  "origin": {"kind": "parameter", "name": "since", "temporalKind": "instant"}})
    program = {"version": "weft.engine-page/0.4" if page else "weft.engine-read/0.4", "compiler": "truss-runtime-temporal",
               "request": request, "status": "compiled", "artifact": artifact, "outputs": outputs}
    if page:
        program.update(pageSize=2, selectedKey=KEY, after=None,
                       page={"version": "weft.engine-temporal-page/0.2", "selectedKey": KEY,
                             "visibleOutputPositions": [1, 2, 3, 4], "keyOutputPositions": [1],
                             "sort": [{"field": identity(name), "direction": direction, "nulls": nulls,
                                       "kind": kind, "outputPosition": pos}
                                      for name, kind, direction, nulls, pos in (("wall", "local", "desc", "first", 4),
                                                                             ("id", "string", "asc", "last", 1))]})
    return seal(program)


class OwnerReply:
    def __init__(self, original):
        self.original, self.calls = original, []

    def compile_engine_read_json(self, packet):
        self.calls.append(json.loads(packet))
        return self.original

    compile_engine_page_json = compile_engine_read_json


class TemporalEngineCatalogTests(unittest.TestCase):
    def test_explicit_builder_routes_and_retains_exact_whole_original(self):
        for page in (False, True):
            program = fixture(page)
            original = json.dumps(program, indent=3, ensure_ascii=False) + "\n"
            owner = OwnerReply(original)
            entry = EngineRead.build(owner, program["request"], parameters=Parameters, result=Event,
                                     method="truss-runtime-temporal", temporal_profile=PROFILE,
                                     **({"page_size": 2, "selected_key": KEY} if page else {}))
            self.assertEqual(entry.originals(), original)
            self.assertEqual(entry.originals().encode("utf-8"), original.encode("utf-8"))
            self.assertEqual(entry.artifact()["request"]["modules"][0]["documentJson"], DOCUMENT_TEXT)
            self.assertEqual(entry.artifact()["request"]["target"]["bindingJson"], program["request"]["target"]["bindingJson"])
            self.assertEqual(entry.artifact(), program)
            self.assertEqual(json.loads(entry.artifact_json)["version"], "umf.engine-catalog/0.4")
            self.assertEqual(owner.calls, [{"version": program["version"], "compiler": program["compiler"],
                                           "request": program["request"],
                                           **({"pageSize": 2, "selectedKey": KEY} if page else {})}])
            restored = EngineRead(entry.artifact_json, Parameters, Event)
            self.assertEqual(restored.originals(), original)
            copied = restored.artifact()
            copied["artifact"]["columns"][0]["representation"]["nativeNull"] = False
            self.assertEqual(restored.originals(), original)

    def test_invalid_selection_refuses_before_compiler_dispatch(self):
        request = fixture()["request"]
        for options in ({}, {"temporal_profile": "unknown"},
                        {"temporal_profile": PROFILE, "method": "truss-runtime"},
                        {"temporal_profile": PROFILE, "page_size": True, "selected_key": KEY},
                        {"temporal_profile": PROFILE, "page_size": 2},
                        {"temporal_profile": PROFILE, "selected_key": KEY},
                        *({"temporal_profile": PROFILE, name: {}} for name in
                          ("related_source", "relationship", "source_selected_key", "order_key"))):
            owner = OwnerReply("{}")
            with self.subTest(options=options), self.assertRaises(ReadBuildError):
                EngineRead.compile_original(owner, request, **{"method": "truss-runtime-temporal", **options})
            self.assertEqual(owner.calls, [])

    def test_resigned_metadata_faults_and_mixed_profiles_refuse(self):
        faults = [lambda p: p.update(unknown="retained but refused"),
                  lambda p: p["request"].update(temporalKeys=True),
                  lambda p: p["request"].update(temporalProfile="unknown"),
                  lambda p: p["request"]["target"].update(backendVersion="0.4.46"),
                  lambda p: p["outputs"][2]["decoder"].update(kind="local"),
                  lambda p: p["outputs"][3].update(missing=False),
                  lambda p: p["outputs"][1]["source"].update(element="at"),
                  lambda p: p["outputs"][1].update(modelPins=[]),
                  lambda p: p["artifact"]["columns"][1].update(sourceIdentities=[]),
                  lambda p: p["artifact"]["targetContext"].update(installationId="foreign"),
                  lambda p: p["artifact"]["parameters"][1]["origin"].update(kind="parameter"),
                  lambda p: p["artifact"]["parameters"][1]["logicalType"].update(family="integer"),
                  lambda p: p["artifact"]["parameters"][2].update(value="2024-01-01T00:00:00Z"),
                  lambda p: p["artifact"]["parameters"][2]["origin"].update(temporalKind="local"),
                  lambda p: p["artifact"]["sourceDomainChecks"].update(maxBytes=1),
                  lambda p: p["artifact"]["sourceDomainChecks"]["queryAbi"].update(version="1.2"),
                  lambda p: p["artifact"].update(temporalKeys=[]),
                  lambda p: p["request"].update(options={"allowCandidate": True, "securityOverride": True}),
                  lambda p: p["request"]["temporalParameters"].update(SINCE={"kind": "instant", "value": "2024-01-01T00:00:00Z"}),
                  lambda p: p["artifact"]["sourceDomainChecks"]["sources"][0].update(requirementsParameter=1)]
        for fault in faults:
            program = copy.deepcopy(fixture())
            fault(program)
            with self.subTest(fault=fault), self.assertRaises(ReadBuildError):
                EngineRead.from_original(canonical_json(seal(program)), parameters=Parameters, result=Event)

    def test_sql_and_original_source_bytes_are_in_digest_custody(self):
        for section, key in (("artifact", "sql"), ("request", "sql")):
            program = fixture()
            program[section][key] += " "
            with self.assertRaises(ReadBuildError):
                EngineRead.from_original(canonical_json(program), parameters=Parameters, result=Event)
        program = fixture()
        program["request"]["modules"][0]["documentJson"] += " "
        with self.assertRaises(ReadBuildError):
            EngineRead.from_original(canonical_json(seal(program)), parameters=Parameters, result=Event)

    def test_annotation_alone_cannot_select_instant_or_local(self):
        class Bare(StrictModel):
            id: str
            day: date
            at: datetime
            wall: datetime | None | MISSING = MISSING
        with self.assertRaises(ReadBuildError):
            EngineRead.from_original(canonical_json(fixture()), parameters=Parameters, result=Bare)

    def test_generated_source_kind_presence_and_refinement_must_match(self):
        from pydantic import create_model
        for replacement in (
            (datetime, BeforeValidator(FieldValidator(kind="local"))),
            (datetime, BeforeValidator(FieldValidator(kind="instant", minimum=1))),
        ):
            altered = create_model("Altered", __base__=Event, at=(Annotated[replacement[0], replacement[1]], ...))
            with self.assertRaises(ReadBuildError):
                EngineRead.from_original(canonical_json(fixture()), parameters=Parameters, result=altered)
        for metadata, value in (("UMF_FIELDS", (("m", "foreign", "at"),)),
                                ("UMF_SOURCE", GeneratedSource(document_id="foreign", core_version="0.10.0",
                                     document_sha256=PIN["sha256"], input_digest="a" * 64,
                                     runtime_abi="umf-access-runtime/0.1"))):
            altered = create_model("WrongSource", __base__=Event)
            setattr(altered, metadata, value)
            with self.assertRaises(ReadBuildError):
                EngineRead.from_original(canonical_json(fixture()), parameters=Parameters, result=altered)

    def test_raw_column_unknown_metadata_stays_in_original_and_replay(self):
        program = fixture()
        program["artifact"]["columns"][1]["futureNativeMetadata"] = {"opaque": ["exact", 1]}
        original = json.dumps(seal(program), indent=1) + "\n"
        entry = EngineRead.from_original(original, parameters=Parameters, result=Event)
        self.assertEqual(entry.artifact()["artifact"]["columns"][1]["futureNativeMetadata"], {"opaque": ["exact", 1]})
        self.assertEqual(EngineRead(entry.artifact_json, Parameters, Event).originals(), original)

    def test_unprojected_source_guard_coverage_is_complete_and_ordered(self):
        class Projected(StrictModel):
            UMF_SOURCE: ClassVar[GeneratedSource] = SOURCE
            UMF_FIELDS: ClassVar[tuple] = Event.UMF_FIELDS[:3]
            id: str
            day: Annotated[date, BeforeValidator(FieldValidator(kind="date"))]
            at: Annotated[datetime, BeforeValidator(FieldValidator(kind="instant"))]
        program = fixture()
        program["outputs"] = program["outputs"][:3]
        program["artifact"]["columns"] = program["artifact"]["columns"][:3]
        program["artifact"]["logicalPlan"]["outputs"] = program["artifact"]["logicalPlan"]["outputs"][:3]
        original = canonical_json(seal(program))
        self.assertEqual(EngineRead.from_original(original, parameters=Parameters, result=Projected).originals(), original)
        for fault in (lambda fs: fs.pop(), lambda fs: fs.reverse(), lambda fs: fs.append(fs[0])):
            changed = json.loads(original)
            requirements = json.loads(changed["artifact"]["parameters"][1]["value"])
            fault(requirements["fields"])
            changed["artifact"]["parameters"][1]["value"] = canonical_json(requirements)
            with self.subTest(fault=fault), self.assertRaises(ReadBuildError):
                EngineRead.from_original(canonical_json(seal(changed)), parameters=Parameters, result=Projected)

    def test_page_hidden_outputs_and_full_string_key_tuple(self):
        program = fixture(True)
        program["outputs"].append(copy.deepcopy(program["outputs"][0]))
        program["outputs"][-1]["name"] = "__key"
        program["artifact"]["columns"].append(copy.deepcopy(program["artifact"]["columns"][0]))
        program["artifact"]["columns"][-1].update(outputName="__key", position=5)
        program["page"]["keyOutputPositions"] = [5]
        original = canonical_json(seal(program))
        self.assertEqual(EngineRead.from_original(original, parameters=Parameters, result=Event).originals(), original)
        for fault in (lambda p: p["page"].update(keyOutputPositions=[2]),
                      lambda p: p["page"].update(keyOutputPositions=[]),
                      lambda p: p["page"]["sort"][0].update(kind="instant"),
                      lambda p: p["page"]["sort"][0].update(outputPosition=True),
                      lambda p: p.update(after={"forged": "tuple"}),
                      lambda p: p["outputs"][-1].update(carrier="integer")):
            changed = json.loads(original)
            fault(changed)
            with self.subTest(fault=fault), self.assertRaises(ReadBuildError):
                EngineRead.from_original(canonical_json(seal(changed)), parameters=Parameters, result=Event)

    def test_compiler_block_keeps_original_diagnostics_and_bytes(self):
        original = ' {"status":"blocked", "diagnostics":[{"code":"WFT-ENGINE-READ"}]}\n'
        with self.assertRaises(ProgramBuildError) as caught:
            EngineRead.compile_original(OwnerReply(original), fixture()["request"],
                                        method="truss-runtime-temporal", temporal_profile=PROFILE)
        self.assertEqual(caught.exception.original_json, original)

    def test_existing_carrier_codec_preserves_three_kinds_and_presence(self):
        fields = tuple({"python": name, "field": name, "kind": "instant" if name == "at" else "identity", "item": None}
                       for name in ("id", "day", "at", "wall"))
        for wall in (MISSING, None, datetime(2024, 2, 29, 1, 2, 3, 123456)):
            values = ["one", date(2024, 2, 29), datetime(1969, 12, 31, 23, 59, 59, 500000, tzinfo=UTC), wall]
            result = decode_model(Event, [f["field"] for f in fields], values, fields)
            self.assertEqual(result.at, values[2])
            self.assertEqual(result.wall, wall)
        entry = EngineRead.from_original(canonical_json(fixture()), parameters=Parameters, result=Event)
        before = entry.originals().encode("utf-8")
        decode_model(Event, [f["field"] for f in fields], values, fields)
        self.assertEqual(EngineRead(entry.artifact_json, Parameters, Event).originals().encode("utf-8"), before)
        with self.assertRaises(ValueError):
            decode_model(Event, [f["field"] for f in fields],
                         ["one", date(2024, 2, 29), datetime(2024, 1, 1), None], fields)

    def test_generic_targets_refuse_before_native_dispatch(self):
        from datetime import timedelta
        from types import SimpleNamespace
        from unittest.mock import Mock
        from umf_access.postgres_read import execute_read
        from umf_access.targets import NotCompiledForTarget, PostgresConfiguration, PostgresTarget
        from umf_access.delta_read import SparkDeltaTarget
        entry = EngineRead.from_original(canonical_json(fixture()), parameters=Parameters, result=Event)
        params = Parameters(since=datetime(2024, 1, 1, tzinfo=UTC))
        connection = Mock(info=SimpleNamespace(server_version=180006))
        configuration = PostgresConfiguration("app", "a" * 64, (180006,), timedelta(seconds=5))
        with self.assertRaises(NotCompiledForTarget):
            PostgresTarget(connection, configuration).read(entry, params)
        connection.cursor.assert_not_called()
        with self.assertRaises(ReadBuildError):
            execute_read(connection, entry, params, app_schema="app")
        connection.cursor.assert_not_called()
        # Read refuses the catalog before touching a Spark session/configuration.
        spark = object.__new__(SparkDeltaTarget)
        with self.assertRaises(NotCompiledForTarget):
            spark.read(entry, params)


if __name__ == "__main__":
    unittest.main()
