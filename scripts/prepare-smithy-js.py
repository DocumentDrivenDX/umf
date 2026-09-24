# Reproduce narrowly scoped compatibility patches from checksum-pinned upstream sources.
import urllib.request
from pathlib import Path
import hashlib
artifacts={
 'jsonschema':('smithy-jsonschema','','47584feccfe5879ba438d6ab11a646f890bd606ff39c82849c75be1f642fb493'),
 'jsonschema-sources':('smithy-jsonschema','-sources','c1ea256f6f78d07f2fd3be6bd18e7f1fb4fcdaa9882bfa3a802229dda91640f0'),
 'model-sources':('smithy-model','-sources','a488b835c3c38cf9f63e5e2238284049f7a3c7bf3c51925a8e426bb6c49fb6ea'),
 'utils-sources':('smithy-utils','-sources','69b9aa9ba9ca1b1b3047b25b4c4de617ce382f06d79bf2a1ab26b018a1549b96'),
 'model':('smithy-model','','816e2cbbf8a62895d484e481e1d7beb1e4e929dec0cfbdda8c160d69402f750b')}
for name,(artifact,suffix,expected) in artifacts.items():
 path=Path('.cache/smithy')/(name+'.jar');path.parent.mkdir(parents=True,exist_ok=True)
 if not path.exists():path.write_bytes(urllib.request.urlopen(f'https://repo.maven.apache.org/maven2/software/amazon/smithy/{artifact}/1.73.0/{artifact}-1.73.0{suffix}.jar').read())
 if hashlib.sha256(path.read_bytes()).hexdigest()!=expected:raise RuntimeError('Checksum mismatch: '+name)
import zipfile,json,hashlib
from pathlib import Path
z=zipfile.ZipFile('.cache/smithy/model-sources.jar');out=Path('native/smithy/browser/src/main/java');rows=[]
for path in z.namelist():
 if not path.endswith('.java'):continue
 s=z.read(path).decode();original=s
 s=s.replace('.parallelStream()', '.stream()').replace('import java.util.StringJoiner;','import umf.StringJoiner;').replace('Collections.unmodifiableSortedSet(', 'umf.RuntimeCompat.unmodifiableSortedSet(')
 if path.endswith('/DefaultNodeDeserializers.java'):
  s=s.replace('((Class<?>) target).getGenericSuperclass()', 'umf.RuntimeCompat.genericSuperclass((Class<?>) target)')
  s=s.replace('method.getParameters().length', 'method.getParameterTypes().length').replace('method.getParameters()[0].getType()', 'method.getParameterTypes()[0]').replace('setter.getParameters()[0].getParameterizedType()', 'setter.getGenericParameterTypes()[0]').replace('Parameter[] parameters = method.getParameters();','Class<?>[] parameters = method.getParameterTypes();')
 s=s.replace('CharBuffer.wrap(getModel(), start, end)', 'getModel().subSequence(start, end).toString()')
 if path.endswith('/Prelude.java'):
  s=s.replace('.addImport(Prelude.class.getResource("prelude.smithy"))', '.addUnparsedModel("prelude.smithy", umf.PreludeText.SOURCE)')
 if s!=original:
  dest=out/path;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(s);rows.append({'file':path,'originalSha256':hashlib.sha256(original.encode()).hexdigest(),'patchedSha256':hashlib.sha256(s.encode()).hexdigest()})
u=zipfile.ZipFile('.cache/smithy/utils-sources.jar');path='software/amazon/smithy/utils/SimpleParser.java';original=u.read(path).decode();patched=original.replace('CharBuffer.wrap(input, start, position)', 'input.subSequence(start, position).toString()').replace('CharBuffer.wrap(input, start, position - removeRight)', 'input.subSequence(start, position - removeRight).toString()');dest=out/path;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(patched);rows.append({'artifact':'smithy-utils','file':path,'originalSha256':hashlib.sha256(original.encode()).hexdigest(),'patchedSha256':hashlib.sha256(patched.encode()).hexdigest()})
prelude=zipfile.ZipFile('.cache/smithy/model.jar').read('software/amazon/smithy/model/loader/prelude.smithy').decode()
(out/'umf/PreludeText.java').write_text('package umf;\n// Pinned Smithy 1.73.0 prelude, Apache-2.0. Generated unchanged from the native jar.\npublic final class PreludeText { public static final String SOURCE = '+json.dumps(prelude,ensure_ascii=True)+'; }\n')
Path('native/smithy/browser/patch-manifest.json').write_text(json.dumps({'smithy':'1.73.0','changes':rows,'preludeSha256':hashlib.sha256(prelude.encode()).hexdigest(),'remainingUnsupported':'Generic superclass reflection throws explicitly; no validation is disabled'},indent=2)+'\n')
print('Patched',len(rows),'source files')
