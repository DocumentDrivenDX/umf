import {readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {createCoreKindNullabilityHostInputEngine} from '../../../../bindings/core/node/index.js';
import {CORE_MODEL_RESOURCES} from '../../../../src/access/core-model-resources.ts';
import {inspectCoreElementKind} from '../../../../src/model/field-kind.ts';

const source = JSON.parse(await readFile('scripts/rust-migration/r5/kind-nullability/input.json', 'utf8'));
const identity = {module:'m',element:'known'};
const rss = () => process.memoryUsage().rss;
const iterations = 3;
const tsBefore = rss();
const tsStart = performance.now();
for (let i=0;i<iterations;i++) inspectCoreElementKind(source,identity);
const tsElapsed = performance.now()-tsStart;
const tsAfter = rss();
const factoryStart = performance.now();
const engine = createCoreKindNullabilityHostInputEngine(CORE_MODEL_RESOURCES);
const factoryElapsed = performance.now()-factoryStart;
const rustBefore = rss();
const rustStart = performance.now();
for (let i=0;i<iterations;i++) engine.inspectCoreElementKind(source,identity);
const rustElapsed = performance.now()-rustStart;
const rustAfter = rss();
console.log(JSON.stringify({
  status:'resource-cost-benchmark-complete',
  operation:'inspectCoreElementKind',
  source:'scripts/rust-migration/r5/kind-nullability/input.json',
  iterations,
  typescript:{elapsedMs:Math.round(tsElapsed*100)/100,rssBeforeBytes:tsBefore,rssAfterBytes:tsAfter,rssDeltaBytes:tsAfter-tsBefore},
  rustOptIn:{factoryElapsedMs:Math.round(factoryElapsed*100)/100,elapsedMs:Math.round(rustElapsed*100)/100,rssBeforeBytes:rustBefore,rssAfterBytes:rustAfter,rssDeltaBytes:rustAfter-rustBefore},
  environment:{runtime:process.versions,platform:process.platform,arch:process.arch}
}));
