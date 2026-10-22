"""Original HLL descriptor custody; native statistical behavior is tested separately."""
import copy
import unittest

from umf_access.build.approximate import SPARK_HLL, require_approximate_profile
from umf_access.reviewed import ReadBuildError


class ApproximateProfile(unittest.TestCase):
    def program(self):
        return {"version": "weft.raw-read/0.1", "target": "spark-delta4", "outputs": [
            {"name": "group", "carrier": "string", "nullable": False},
            {"name": "estimate", "carrier": "integer", "nullable": False,
             "approximate": True, "approximation": copy.deepcopy(SPARK_HLL)},
        ]}

    def test_descriptor_is_retained_without_inventing_a_hard_bound(self):
        program = self.program()
        before = copy.deepcopy(program)
        require_approximate_profile(program, "spark-delta4")
        self.assertEqual(program, before)
        self.assertIs(program["outputs"][1]["approximation"]["error"]["hardBound"], False)

    def test_unknown_profile_and_descriptor_changes_refuse(self):
        for profile in (None, "postgresql18", "unity-catalog", "ashlar-spark4"):
            with self.subTest(profile=profile), self.assertRaises(ReadBuildError):
                require_approximate_profile(self.program(), profile)
        for key, value in (("approximate", 1), ("nullable", 0), ("carrier", "float"), ("approximation", {})):
            program = self.program()
            program["outputs"][1][key] = value
            with self.subTest(key=key), self.assertRaises(ReadBuildError):
                require_approximate_profile(program, "spark-delta4")
        for key, value in (("hardBound", True), ("hardBound", 0), ("value", "0.01"), ("kind", "maximum-relative-error")):
            program = self.program()
            program["outputs"][1]["approximation"]["error"][key] = value
            with self.subTest(key=key, value=value), self.assertRaises(ReadBuildError):
                require_approximate_profile(program, "spark-delta4")
        program = self.program()
        program["outputs"].pop()
        with self.assertRaises(ReadBuildError):
            require_approximate_profile(program, "spark-delta4")
