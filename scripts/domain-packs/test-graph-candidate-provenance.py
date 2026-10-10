"""Local regression controls for retained graph-candidate provenance."""
import copy
import importlib.util
import json
from pathlib import Path
import shutil
from tempfile import TemporaryDirectory
import unittest

BASE = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('graph_provenance', Path(__file__).with_name('graph-candidate-provenance.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class GraphCandidateProvenanceTests(unittest.TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        inventory = json.loads((BASE/'fixtures/domain-packs/graph-candidates.json').read_bytes())
        self.entry = next(e for e in inventory['candidates'] if e['pack'] == 'legal')
        inventory['candidates'] = [self.entry]
        for reference in [self.entry[k] for k in ('fixture', 'archive', 'source_pack')] + ['spec/domain-packs/legal/pack.json']:
            target = self.root/reference
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(BASE/reference, target)
        self.inventory = self.root/'fixtures/domain-packs/graph-candidates.json'
        self.inventory.write_text(json.dumps(inventory))

    def test_original_candidates_are_classified_without_rewriting_them(self):
        audit = module.verify_inventory(BASE)
        historical = [r for r in audit['candidates'] if r['classification'] == 'historical-pack']
        self.assertEqual([r['pack'] for r in historical], ['legal', 'medical'])
        self.assertTrue(all((r['source_version'], r['current_version']) == ('1.0.0', '1.2.0') for r in historical))
        self.assertEqual(len(audit['candidates']), 16)
        self.assertIn('gtfs-schedule', audit['without_candidate'])
        self.assertIn('medical-carrier', audit['without_candidate'])

    def test_new_pack_without_candidate_is_reported_and_not_silently_passed(self):
        target = self.root/'spec/domain-packs/new-pack/pack.json'
        target.parent.mkdir(parents=True)
        target.write_text('{"id":"new-pack","version":"1.0.0"}')
        self.assertEqual(module.verify_inventory(self.root)['without_candidate'], ['new-pack'])

    def test_missing_duplicate_and_undeclared_candidates_refuse(self):
        original = self.inventory.read_bytes()
        for entries in [[], [self.entry, self.entry]]:
            value = json.loads(original)
            value['candidates'] = entries
            self.inventory.write_text(json.dumps(value))
            with self.assertRaises(ValueError):
                module.verify_inventory(self.root)
        self.inventory.write_bytes(original)
        fixture = self.root/self.entry['fixture']
        fixture.unlink()
        with self.assertRaises(ValueError):
            module.verify_inventory(self.root)

    def test_changed_pack_archive_source_and_schema_pins_refuse(self):
        fixture = self.root/self.entry['fixture']
        original = fixture.read_bytes()
        for section, member in [('pack', 'sha256'), ('pack', 'version'), ('dataset', 'archive_sha256'), ('schema', 'sha256')]:
            value = json.loads(original)
            value[section][member] = 'changed'
            fixture.write_text(json.dumps(value))
            with self.subTest(section=section, member=member), self.assertRaises(ValueError):
                module.verify_candidate(self.root, self.entry)
        fixture.write_bytes(original)
        source = self.root/self.entry['source_pack']
        source.write_bytes(source.read_bytes()+b' ')
        with self.assertRaises(ValueError):
            module.verify_candidate(self.root, self.entry)

    def test_source_bindings_and_same_version_conflicts_refuse(self):
        fixture = self.root/self.entry['fixture']
        original = fixture.read_bytes()
        value = json.loads(original)
        value['source_bindings'] = []
        fixture.write_text(json.dumps(value))
        with self.assertRaises(ValueError):
            module.verify_candidate(self.root, self.entry)
        fixture.write_bytes(original)
        current = self.root/'spec/domain-packs/legal/pack.json'
        current.write_bytes((self.root/self.entry['source_pack']).read_bytes()+b' ')
        with self.assertRaises(ValueError):
            module.verify_candidate(self.root, self.entry)

    def test_escaping_references_refuse(self):
        for reference in ['../outside.json', '/outside.json', 'https://example.invalid/pack.json']:
            entry = copy.deepcopy(self.entry)
            entry['source_pack'] = reference
            with self.subTest(reference=reference), self.assertRaises(ValueError):
                module.verify_candidate(self.root, entry)
        with TemporaryDirectory() as outside:
            source = Path(outside)/'pack.json'
            source.write_bytes((self.root/self.entry['source_pack']).read_bytes())
            link = self.root/'escaped-source.json'
            link.symlink_to(source)
            entry = {**self.entry, 'source_pack': 'escaped-source.json'}
            with self.assertRaises(ValueError):
                module.verify_candidate(self.root, entry)

    def test_ambiguous_or_unknown_inventory_members_refuse(self):
        with self.assertRaises(ValueError):
            module.load('{"format":"first","format":"second"}')
        original = json.loads(self.inventory.read_bytes())
        for entries in [[None], [{**self.entry, 'unverified_revision': 'invented'}]]:
            value = {**original, 'candidates': entries}
            self.inventory.write_text(json.dumps(value))
            with self.subTest(entries=entries), self.assertRaises(ValueError):
                module.verify_inventory(self.root)


if __name__ == '__main__':
    unittest.main()
