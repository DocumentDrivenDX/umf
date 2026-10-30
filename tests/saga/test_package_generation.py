"""Exercise the real package compiler in an isolated source/output tree."""
from pathlib import Path
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
ROOT = Path(__file__).resolve().parents[2]

class SagaGeneration(unittest.TestCase):
    def test_exact_regeneration_and_stale_output_refusal(self):
        with tempfile.TemporaryDirectory(prefix='umf-saga-package-') as directory:
            root=Path(directory)
            paths=['scripts/build-saga-package.py', 'docs/helix/02-design/contracts/schemas/saga-0.1.0.schema.json', 'docs/helix/02-design/contracts/schemas/saga-runtime-1.schema.json']
            for path in paths:
                target=root/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes((ROOT/path).read_bytes())
            command=[sys.executable,str(root/'scripts/build-saga-package.py')]
            def run(*extra):return subprocess.run(command+list(extra),capture_output=True,text=True)
            self.assertEqual(run().returncode,0)
            self.assertEqual(run('--check').returncode,0)
            output=root/'spec/extensions/saga/package.json';original=output.read_bytes()
            output.write_text('{}\n')
            refused=run('--check');self.assertNotEqual(refused.returncode,0);self.assertIn('package.json',refused.stderr)
            output.write_bytes(original)
            source=root/paths[1];schema=json.loads(source.read_text());schema['title']='Changed authored source';source.write_text(json.dumps(schema))
            refused=run('--check');self.assertNotEqual(refused.returncode,0);self.assertIn('schema.json',refused.stderr)
            self.assertEqual(run().returncode,0)
            self.assertEqual(run('--check').returncode,0)
            generated=json.loads((root/'spec/extensions/saga/generated.json').read_text())
            self.assertEqual(set(generated['sources']),set(paths[1:]))

if __name__=='__main__':unittest.main()
