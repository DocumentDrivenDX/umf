import {readFileSync,writeFileSync} from 'node:fs';
import {analyzeAction} from '/Users/erik/.codex/worktrees/rust-binding-spike/umf/src/extensions/actions/analysis.ts';
const root='/Users/erik/.codex/worktrees/rust-binding-spike/umf';
const base=JSON.parse(readFileSync(root+'/docs/helix/04-build/evidence/rust-migration/r3/sol-action-closure/expression-analysis.json','utf8')).cases[0];
const cases=[];
for(const depth of [33,129]){
 const document=structuredClone(base.document),action=structuredClone(base.action);let expression:any={literal:{boolean:true}};
 for(let i=0;i<depth;i++)expression={op:'not',arg:expression};
 Object.assign(action.preconditions[0].rule,{expression:JSON.stringify(expression),references:[]});
 cases.push({id:'sol-independent-action-expression-depth-'+depth,document,action,expected:analyzeAction(document,action,'/action')});
}
{const document=structuredClone(base.document),action=structuredClone(base.action);action['2']={};action['1']={};cases.push({id:'sol-independent-action-numeric-unknown-order',document,action,expected:analyzeAction(document,action,'/action')});}
writeFileSync(root+'/docs/helix/04-build/evidence/rust-migration/r3/sol-independent-action-review/analysis.json',JSON.stringify({cases},null,2)+'\n');
