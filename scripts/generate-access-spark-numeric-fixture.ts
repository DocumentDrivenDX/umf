import { generateAccessPackage } from '../src/compilation/index';
import { profile, request } from '../tests/compilation/access-fixtures';

const root = process.cwd();
const destination = process.argv[2];
if (!destination?.startsWith('/')) throw new Error('absolute owned fixture output required');
const fixture = `${root}/fixtures/access/spark-numeric`;
const req = request();
req.sources = await Promise.all(['logical', 'physical'].map(async id => ({
  id, format: 'json' as const, text: await Bun.file(`${fixture}/${id}.json`).text(),
})));
req.records = [{ module: 'numeric', element: 'Metric' }];
req.actions = []; req.projections = []; req.bindings = ['physical'];
req.package = 'spark_numeric_fixture';
req.names = ['id', 'big', 'amount'].map((python, index) => ({
  sourceId: 'logical', pointer: `/modules/0/elements/${index}`, python,
}));
const pinned = profile();
pinned.dependencies = pinned.dependencies.map(d => d.distribution === 'umf_access' ? { ...d, version: '0.1.0.dev0' } : d);
pinned.python.version = '3.11.17';
const inputs: { path: string; sha256: string }[] = [];
for (const pattern of ['src/**/*.ts', 'spec/**/*.json']) {
  for (const path of new Bun.Glob(pattern).scanSync({ cwd: root, onlyFiles: true })) {
    inputs.push({ path, sha256: new Bun.CryptoHasher('sha256').update(await Bun.file(`${root}/${path}`).arrayBuffer()).digest('hex') });
  }
}
inputs.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
pinned.codeSha256 = new Bun.CryptoHasher('sha256').update(JSON.stringify(inputs)).digest('hex');
const result = generateAccessPackage(req, pinned);
if (result.outcome !== 'candidate') throw new Error(JSON.stringify(result.diagnostics));
for (const file of result.files) await Bun.write(`${destination}/${file.path}`, file.text);
