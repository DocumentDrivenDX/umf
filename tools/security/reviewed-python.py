"""Execute only trusted reviewed helper bytes; never policy/model-provided code.
A source digest binds content, not an issuer or native authorization credential.
The host owns the reviewed path and expected digest. Python runtime/stdlib remain
explicit trusted prerequisites; cached bytecode for this helper is not executed.
"""
import hashlib,re,types
from pathlib import Path
MAX_SOURCE_BYTES=4000000
def load_reviewed_module(path,expected_sha256):
 if not isinstance(expected_sha256,str) or not re.fullmatch('[0-9a-f]{64}',expected_sha256):raise ValueError('Missing exact reviewed source pin')
 source_path=Path(path)
 with source_path.open('rb') as stream:source=stream.read(MAX_SOURCE_BYTES+1)
 if len(source)>MAX_SOURCE_BYTES:raise ValueError('Reviewed helper source bound exceeded')
 actual=hashlib.sha256(source).hexdigest()
 if actual!=expected_sha256:raise ValueError('Reviewed helper source changed before execution')
 module=types.ModuleType('reviewed_helper')
 module.__file__=str(source_path)
 # Compilation and execution use the same verified in-memory bytes. No import
 # loader, timestamp/size cache validation or .pyc artifact selects helper code.
 exec(compile(source,str(source_path),'exec'),module.__dict__)
 return module,actual
