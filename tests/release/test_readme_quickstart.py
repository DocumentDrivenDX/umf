# SPDX-License-Identifier: MIT OR Apache-2.0
"""The README quickstart is the script CI executes; they must not drift."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class ReadmeQuickstart(unittest.TestCase):
    def test_readme_block_equals_smoke_script(self):
        script = (ROOT / "scripts/smoke_quickstart.py").read_text()
        body = re.search(r"# quickstart:start\n(.*?)# quickstart:end", script, re.S)
        readme = (ROOT / "README.md").read_text()
        block = re.search(r"<!-- quickstart:start -->\n```python\n(.*?)```\n<!-- quickstart:end -->", readme, re.S)
        self.assertIsNotNone(body, "markers missing in scripts/smoke_quickstart.py")
        self.assertIsNotNone(block, "markers missing in README.md")
        self.assertEqual(block[1].strip(), body[1].strip())


if __name__ == "__main__":
    unittest.main()
