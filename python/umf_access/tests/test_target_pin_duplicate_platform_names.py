"""Duplicate target platform names cannot stand in for distinct pins."""

from __future__ import annotations

import unittest

from umf_access.adoption import TargetIdentity
from umf_access.catalog import TargetPin


class TargetPinDuplicatePlatformNamesTests(unittest.TestCase):
    def setUp(self):
        self.pin = TargetPin(
            "postgresql",
            "pg",
            "18",
            "profile-a",
            "a" * 64,
            (("driver", ("3.2", "3.3")), ("server", ("18.0",))),
        )

    def identity(self, platform):
        return TargetIdentity(
            "postgresql", "pg", "18", "profile-a", "a" * 64, platform
        )

    def test_rejects_duplicate_observed_driver_even_when_server_is_absent(self):
        self.assertFalse(
            self.pin.matches(self.identity((("driver", "3.2"), ("driver", "3.3"))))
        )

    def test_rejects_duplicate_observed_server_even_when_driver_is_absent(self):
        self.assertFalse(
            self.pin.matches(
                self.identity((("server", "18.0"), ("server", "18.0")))
            )
        )

    def test_unique_components_match_independent_of_order(self):
        self.assertTrue(
            self.pin.matches(self.identity((("server", "18.0"), ("driver", "3.3"))))
        )

    def test_rejects_duplicate_names_in_pin(self):
        malformed_pin = TargetPin(
            "postgresql",
            "pg",
            "18",
            "profile-a",
            "a" * 64,
            (("driver", ("3.2",)), ("driver", ("3.3",))),
        )
        self.assertFalse(
            malformed_pin.matches(
                self.identity((("driver", "3.2"), ("driver", "3.3")))
            )
        )


if __name__ == "__main__":
    unittest.main()
