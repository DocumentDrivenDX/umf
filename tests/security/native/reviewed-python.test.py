"""Managed helper custody component checks; not native B12 qualification.
@covers US-056-AC10
"""
import hashlib,importlib.util,os,py_compile,sys,tempfile,types,unittest
from pathlib import Path
source=Path('tools/security/reviewed-python.py')
helper=types.ModuleType('reviewed_source_loader')
exec(compile(source.read_bytes(),str(source),'exec'),helper.__dict__)
def digest(value):return hashlib.sha256(value).hexdigest()
class ReviewedSourceTests(unittest.TestCase):
 def test_exact_source_and_executed_digest(self):
  with tempfile.TemporaryDirectory() as directory:
   path=Path(directory)/'fixture.py';body=b"result='fresh'\n";path.write_bytes(body)
   module,actual=helper.load_reviewed_module(path,digest(body))
   self.assertEqual(module.result,'fresh');self.assertEqual(actual,digest(body))
 def test_same_size_same_timestamp_stale_bytecode_is_not_executed(self):
  with tempfile.TemporaryDirectory() as directory:
   path=Path(directory)/'fixture.py';old=b"result='stale'\n";new=b"result='fresh'\n";self.assertEqual(len(old),len(new));path.write_bytes(old)
   original=path.stat();prefix=sys.pycache_prefix
   try:
    sys.pycache_prefix=str(Path(directory)/'cache')
    py_compile.compile(str(path),doraise=True)
    path.write_bytes(new);os.utime(path,ns=(original.st_atime_ns,original.st_mtime_ns))
    spec=importlib.util.spec_from_file_location('cached_fixture',path)
    cached=importlib.util.module_from_spec(spec);spec.loader.exec_module(cached)
    self.assertEqual(cached.result,'stale')
    exact,actual=helper.load_reviewed_module(path,digest(new))
    self.assertEqual(exact.result,'fresh');self.assertEqual(actual,digest(new))
   finally:sys.pycache_prefix=prefix
 def test_changed_source_refuses_before_body_execution(self):
  with tempfile.TemporaryDirectory() as directory:
   path=Path(directory)/'fixture.py';path.write_text("raise RuntimeError('unreviewed body executed')\n")
   with self.assertRaisesRegex(ValueError,'changed before execution'):helper.load_reviewed_module(path,'0'*64)
 def test_missing_or_malformed_pin_refuses_before_io(self):
  for pin in [None,'','0'*63,'A'*64,'g'*64]:
   with self.assertRaisesRegex(ValueError,'source pin'):helper.load_reviewed_module('/does-not-exist',pin)
 def test_source_bound_refuses(self):
  with tempfile.TemporaryDirectory() as directory:
   path=Path(directory)/'fixture.py';body=b' '*(helper.MAX_SOURCE_BYTES+1);path.write_bytes(body)
   with self.assertRaisesRegex(ValueError,'bound'):helper.load_reviewed_module(path,digest(body))
 def test_receipt_digest_is_not_taken_from_module_metadata(self):
  with tempfile.TemporaryDirectory() as directory:
   path=Path(directory)/'fixture.py';body=b"__reviewed_source_sha256__='fabricated'\n";path.write_bytes(body)
   module,actual=helper.load_reviewed_module(path,digest(body))
   self.assertEqual(module.__reviewed_source_sha256__,'fabricated');self.assertEqual(actual,digest(body))
if __name__=='__main__':unittest.main()
