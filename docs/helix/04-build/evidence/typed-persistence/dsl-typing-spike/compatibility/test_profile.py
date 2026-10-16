"""Negative controls keep absent dependencies and wrong profiles from passing."""
from copy import deepcopy
import json
import unittest
from run import ROOT, validate_profile

class ProfileTests(unittest.TestCase):
    def test_exact_installed_artifact(self):
        validate_profile(json.loads((ROOT/'profile.json').read_text()))

    def test_wrong_pins_refuse(self):
        original=json.loads((ROOT/'profile.json').read_text())
        for key in ('version','abi'):
            profile=deepcopy(original)
            profile['runtimeAbi'][key]='wrong'
            with self.subTest(key=key), self.assertRaises(ValueError):
                validate_profile(profile)
        profile=deepcopy(original)
        profile['dependencies']['pydantic']='0.0.0'
        with self.assertRaises(ValueError): validate_profile(profile)
        profile=deepcopy(original)
        profile['configurationSha256']['mypy.ini']='0'*64
        with self.assertRaises(ValueError): validate_profile(profile)
        profile=deepcopy(original)
        profile['python']='0.0.0'
        with self.assertRaises(ValueError): validate_profile(profile)
        profile=deepcopy(original)
        profile['runtimeWheelSha256']='0'*64
        with self.assertRaises(ValueError): validate_profile(profile)

if __name__ == '__main__':
    unittest.main()
