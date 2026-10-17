"""Classification controls; native acceptance belongs to real Spark E2Es."""

import builtins
import unittest
from unittest.mock import patch

from umf_access.delta_read import _expired_snapshot_error


class OptionalDriverClassification(unittest.TestCase):
    def test_absent_optional_driver_preserves_unknown_original_failure(self):
        original = ValueError("original failure")
        real_import = builtins.__import__

        def without_driver(name, *args, **kwargs):
            if name == "py4j.protocol":
                raise ModuleNotFoundError("optional driver absent", name="py4j")
            return real_import(name, *args, **kwargs)

        with patch("builtins.__import__", side_effect=without_driver):
            self.assertIs(_expired_snapshot_error(original), False)
        self.assertEqual(original.args, ("original failure",))
        self.assertIsNone(original.__cause__)

    def test_other_import_failures_are_not_misclassified_as_retention(self):
        missing = ModuleNotFoundError(
            "broken driver dependency", name="another_dependency"
        )
        real_import = builtins.__import__

        def broken_driver(name, *args, **kwargs):
            if name == "py4j.protocol":
                raise missing
            return real_import(name, *args, **kwargs)

        with (
            patch("builtins.__import__", side_effect=broken_driver),
            self.assertRaises(ModuleNotFoundError) as caught,
        ):
            _expired_snapshot_error(ValueError("original failure"))
        self.assertIs(caught.exception, missing)
