// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from 'typescript-api';
import {isPinnedCanonicalJsonMapJoin,structuralAccountingSource} from '../../scripts/metamodel/structural-accounting';

const root=process.cwd();
const generated=readFileSync(resolve(root,'src/generated/core-validators.ts'),'utf8');
const schemas=[
 'spec/core/schema.json',
 'spec/core/semantic-type-reference.schema.json',
 'spec/core/extension-package.schema.json',
].map((path)=>JSON.parse(readFileSync(resolve(root,path),'utf8')) as unknown);

test('R2 structural companion accepts only pinned canonical map-join pipelines',()=>{
 const companion=structuralAccountingSource(generated,schemas);
 expect(companion.match(/accountedJoin\(/g)?.length).toBeGreaterThanOrEqual(2);
 expect(companion).toContain('accountedMap(');
 expect(companion).toContain('function accountedJoin(');
});

test('R2 structural companion refuses an unpinned altered canonical pipeline before classification',()=>{
 const altered=generated.replace('value.map(canonicalJson).join(",")','value.map((item) => canonicalJson(item)).join(",")');
 expect(altered).not.toBe(generated);
 expect(()=>structuralAccountingSource(altered,schemas)).toThrow(/STRUCTURAL_ACCOUNTING_SOURCE_PIN/);
});

function onlyJoinExpression(expression:string):ts.CallExpression{
 const source=ts.createSourceFile('canonical-join-control.ts',`const result = ${expression};`,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const calls:ts.CallExpression[]=[];
 const visit=(node:ts.Node):void=>{if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='join')calls.push(node);ts.forEachChild(node,visit);};
 visit(source);
 if(calls.length!==1)throw new Error(`expected one join call, found ${calls.length}`);
 return calls[0]!;
}

test('R2 canonical join classifier accepts the actual left-associated object-key mapping',()=>{
 expect(isPinnedCanonicalJsonMapJoin(onlyJoinExpression('Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonicalJson(value[key])).join(",")'))).toBe(true);
 expect(isPinnedCanonicalJsonMapJoin(onlyJoinExpression('value.map(canonicalJson).join(",")'))).toBe(true);
});

test('R2 canonical join classifier refuses malformed and user-shaped pipelines',()=>{
 expect(isPinnedCanonicalJsonMapJoin(onlyJoinExpression('Object.keys(value).sort().map((key) => JSON.stringify(key) + (":" + canonicalJson(value[key]))).join(",")'))).toBe(false);
 expect(isPinnedCanonicalJsonMapJoin(onlyJoinExpression('Object.keys(value).sort().map((prop) => JSON.stringify(prop) + ":" + canonicalJson(value[prop])).join(",")'))).toBe(false);
 expect(isPinnedCanonicalJsonMapJoin(onlyJoinExpression('other.map(canonicalJson).join(",")'))).toBe(false);
});

test('R2 structural companion carries the closed pointer escape kind before replacement',()=>{
 const companion=structuralAccountingSource(generated,schemas);
 expect(companion).toMatch(/accountedReplace\([^\n]*"slash", account\)/);
 expect(companion).toMatch(/accountedReplace\([^\n]*"tilde", account\)/);
 expect(companion).toContain("kind==='slash'&&unit===47");
});
