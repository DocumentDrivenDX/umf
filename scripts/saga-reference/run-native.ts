// SPDX-License-Identifier: MIT OR Apache-2.0
import {createHash} from 'node:crypto';
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const sources=['scripts/saga-reference/run-native.ts','scripts/saga-reference/coordinator.ts','scripts/saga-reference/provider.ts','scripts/saga-reference/provider.sql','scripts/saga-reference/schema.sql','tests/saga/native-recovery.test.ts','tests/saga/native-harness.ts','tests/saga/provider-fixture.ts','tests/saga/history-oracle.ts','tests/saga/history-oracle.test.ts','scripts/actions-reference/executor.ts','scripts/actions-reference/outcomes.ts','fixtures/actions/approve.json','spec/extensions/saga/runtime.schema.json'];
const profile={command:['bun','test','tests/saga/native-recovery.test.ts','tests/saga/history-oracle.test.ts'],postgresImage:'postgres:17.9',bun:Bun.version,platform:process.platform,architecture:process.arch,sources};
const sourceBytes=(await Promise.all(sources.map(async path=>`${path}\0${await Bun.file(path).text()}`))).join('\0');
const driverHash=digest(await Bun.file('scripts/saga-reference/run-native.ts').text()),profileHash=digest(JSON.stringify(profile)),sourceHash=digest(sourceBytes);
const child=Bun.spawn(profile.command,{stdout:'pipe',stderr:'pipe'}),[stdout,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
const raw=stdout+stderr;await Bun.write('tests/saga/native-run.log',raw);
if(exit!==0)throw Error(`native saga run failed with exit ${exit}; raw output retained in tests/saga/native-run.log`);
const evidenceMatch=[...raw.matchAll(/\{"profile":"umf-actions-saga-reference-native-1"[^\n]+/g)].at(-1);
if(!evidenceMatch)throw Error('native test did not emit retained evidence JSON');
const evidence=JSON.parse(evidenceMatch[0]);
evidence.reproducibility={sourceHash,driverHash,profileHash,rawRunLogHash:digest(raw),sourceFiles:sources,driver:'scripts/saga-reference/run-native.ts',command:profile.command};
await Bun.write('tests/saga/native-evidence.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({componentAssertions:evidence.componentAssertions.length,unverifiedStoryAcceptance:evidence.storyAcceptance.length,reproducibility:evidence.reproducibility}));
