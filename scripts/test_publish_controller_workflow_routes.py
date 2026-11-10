"""Pure source checks for the 0.10.10 publication controller routes."""
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]


class PublicationControllerWorkflowRouteTests(unittest.TestCase):
    def read(self, name):
        return (ROOT / '.github' / 'workflows' / name).read_text(encoding='utf-8')

    def test_all_publisher_workflows_checkout_the_controller_not_the_tag_source(self):
        for name in ('publish-pypi.yml', 'publish-codegen-pypi.yml', 'publish-access-pypi.yml'):
            with self.subTest(workflow=name):
                text = self.read(name)
                self.assertIn('ref: ${{ github.workflow_sha }}', text)

    def test_core_candidate_uses_the_closed_source_route_and_remains_missing_admission_fail_closed(self):
        workflow = self.read('publish-pypi.yml')
        publisher = (ROOT / 'scripts' / 'publish_core_pypi_release.py').read_text(encoding='utf-8')
        self.assertIn("if tag in ('umf-v0.10.10','python-v0.10.10')", publisher)
        self.assertIn('candidateAdmissionSchema', publisher)
        self.assertIn('CANDIDATE01010_VALIDATORS = {}', publisher)
        self.assertRegex(workflow, r'\^\(umf\|python\)-v')

    def test_codegen_candidate_route_is_separate_from_frozen_0108_0109_and_reserved_0110(self):
        workflow = self.read('publish-codegen-pypi.yml')
        self.assertIn("inputs.tag == 'umf-v0.10.10'", workflow)
        self.assertIn("inputs.tag == 'umf-v0.10.9'", workflow)
        self.assertNotRegex(workflow, r"verify-0109:[\s\S]{0,400}inputs\.tag != 'umf-v0\.10\.8'")
        self.assertIn("'umf-v0.10.10'", workflow)
        self.assertIn('load_candidate01010_profile', workflow)
        self.assertIn('default: false', workflow)
        self.assertIn('public-consumer-01010:', workflow)
        self.assertIn('candidate01010_release_download_roster(value, \'umf-codegen\')', workflow)

    def test_access_candidate_uses_its_own_source_identity_and_separate_public_consumer_route(self):
        workflow = self.read('publish-access-pypi.yml')
        self.assertIn("load_candidate01010_profile(pathlib.Path('.'), 'umf-access'", workflow)
        self.assertIn("if: needs.verify.outputs.route == 'candidate01010'", workflow)
        self.assertIn("'umf-core==0.10.10'", workflow)
        self.assertIn("('umf-access', '0.1.0.dev10'", workflow)
        self.assertIn('default: false', workflow)

    def test_access_source_dependency_in_s_is_not_rewritten_as_part_of_core_controller_work(self):
        access = ROOT / 'python' / 'umf_access' / 'pyproject.toml'
        self.assertIn('umf-core==0.10.8', access.read_text(encoding='utf-8'))

    def test_future_candidate_admissions_and_qualification_pins_remain_absent(self):
        self.assertTrue((ROOT / '.github/release-admissions/umf-codegen-0.10.8.json').is_file())
        for name in ('umf-core-0.10.10.json', 'umf-codegen-0.10.10.json',
                     'access-v0.1.0.dev10-core-0.10.10.json'):
            self.assertFalse((ROOT / '.github/release-admissions' / name).exists())
        codegen = (ROOT / '.github/workflows/publish-codegen-pypi.yml').read_text(encoding='utf-8')
        self.assertIn("inputs.tag == 'umf-v0.10.9'", codegen)
        self.assertNotIn("inputs.tag == 'umf-v0.11.0'", codegen)


if __name__ == '__main__':
    unittest.main()
