"""Compare independently compiled native source descriptors; source locations excluded."""
import sys
from pathlib import Path
from google.protobuf import descriptor_pb2

def load(path):
    result = descriptor_pb2.FileDescriptorSet.FromString(Path(path).read_bytes())
    files = {}
    for file in result.file:
        file.ClearField('source_code_info')
        # Proto2 is the native default syntax when no syntax field is serialized.
        if not file.syntax: file.syntax = 'proto2'
        files[file.name] = file
    return files
before, after = load(sys.argv[1]), load(sys.argv[2])
assert before.keys() == after.keys(), 'Different native dependency set'
for name in before:
    assert before[name] == after[name], 'Native compiler descriptor mismatch: '+name
print('Independent source compiler descriptors agree; source-location fields excluded, proto2 default normalized')
