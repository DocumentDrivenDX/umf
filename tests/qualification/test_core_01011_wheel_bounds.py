"""Pure controls for the exact 0.10.11 native-wheel sizing profile."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    'core_release_wheel', ROOT / 'tools/qualify_python_release_wheel.py')
SELECTOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SELECTOR)


class Core01011WheelBounds(unittest.TestCase):
    def test_exact_version_uses_existing_native_profile(self):
        native = (64 * 1024**2, 128 * 1024**2, 64 * 1024**2)
        compact = (16 * 1024**2,) * 3
        for version in ('0.10.7', '0.10.8', '0.10.9', '0.10.11'):
            self.assertEqual(SELECTOR._wheel_bounds(version), native)
        for version in ('0.10.3', '0.10.10', '0.10.12'):
            self.assertEqual(SELECTOR._wheel_bounds(version), compact)
        self.assertEqual(SELECTOR.MAX_RELEASE_ASSET_BYTES, compact[0])

    def test_archive_above_16_mib_is_admitted_only_under_native_wheel_bound(self):
        limit, _, _ = SELECTOR._wheel_bounds('0.10.11')
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'size-control.whl'
            for size, accepted in ((16 * 1024**2 + 1, True), (limit, True), (limit + 1, False)):
                with self.subTest(size=size), path.open('wb') as stream:
                    stream.truncate(size)
                    if accepted:
                        self.assertEqual(SELECTOR._bounded_regular(path, limit), size)
                    else:
                        with self.assertRaises(ValueError):
                            SELECTOR._bounded_regular(path, limit)
                    with self.assertRaises(ValueError):
                        SELECTOR._bounded_regular(path)


if __name__ == '__main__':
    unittest.main()
