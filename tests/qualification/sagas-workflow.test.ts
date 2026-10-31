import {expect, test} from 'bun:test';
import {parse} from 'yaml';

type WorkflowStep={name?:string;if?:string;run?:string;with?:{path?:string}};
type Workflow={jobs:{qualify:{if:string;steps:WorkflowStep[]}}};

test('qualification workflow applies the impact flags and prepares native images once',async()=>{
 const source=await Bun.file('.github/workflows/sagas.yml').text();
 const workflow=parse(source) as Workflow;
 const steps=workflow.jobs.qualify.steps;
 const step=(name:string)=>{
  const selected=steps.find(candidate=>candidate.name===name);
  if(!selected)throw Error(`Missing workflow step ${name}`);
  return selected;
 };
 expect(workflow.jobs.qualify.if).toContain("needs.impact.outputs.actions == 'true'");
 expect(workflow.jobs.qualify.if).toContain("needs.impact.outputs.saga == 'true'");
 expect(workflow.jobs.qualify.if).toContain("needs.impact.outputs.packages == 'true'");
 expect(step('Prepare native test resources once').if).toContain("needs.impact.outputs.actions == 'true'");
 expect(step('Prepare native test resources once').if).toContain("needs.impact.outputs.saga == 'true'");
 expect(step('Prepare native test resources once').if).toContain("needs.impact.outputs.packages == 'true'");
 expect(step('Prepare native test resources once').run).toContain('bun scripts/prepare-action-tests.ts');
 expect(step('Prepare native test resources once').run).toContain('docker image inspect');
 expect(step('Native action reference qualification').if).toBe("needs.impact.outputs.actions == 'true' || needs.impact.outputs.packages == 'true'");
 expect(step('Portable action qualification').if).toBe("needs.impact.outputs.actions == 'true' || needs.impact.outputs.packages == 'true'");
 expect(step('Native Saga protocol and independent oracle').if).toBe("needs.impact.outputs.saga == 'true' || needs.impact.outputs.packages == 'true'");
 expect(step('Native Saga protocol and independent oracle').run).not.toContain('docker pull');
 expect(source.match(/bun scripts\/prepare-action-tests\.ts/g)).toHaveLength(1);
 const artifacts=step('Preserve exact qualification artifacts').with?.path??'';
 expect(artifacts).toContain('action-native.log');
 expect(artifacts).toContain('action-portable.log');
 expect(artifacts).toContain('saga-native.log');
});
