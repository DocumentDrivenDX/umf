# Inspect your first action

You will read the actual approve fixture and inspect its declaration. No database, Docker or credentials are required.

## Prepare the repository

```sh
git clone https://github.com/DocumentDrivenDX/umf.git
cd umf
bun install --frozen-lockfile
bun run build
bun run docs:example
```

Use Bun 1.4.2, as pinned by package.json. The final command runs scripts/actions-docs/inspect-example.ts, which prints the inspection summary. The companion portable verification checks the expected result and source preservation.

## Read the code

The executable example below uses the public entry point. The relative paths are correct in scripts/actions-docs/inspect-example.ts; run the command above rather than pasting these imports into a different directory.

<!-- generated:portable-example:start -->
```ts
import {Registry,readDocument,registerActions,inspectActions} from '../../src/index';
import fixture from '../../fixtures/actions/approve.json';

const registry=registerActions(new Registry());
const document=readDocument(JSON.stringify(fixture),'json');
const inspection=inspectActions(document,registry);

console.log(JSON.stringify({
 action:inspection.actions[0]!.action.id,
 valid:inspection.validation.valid,
 complete:inspection.validation.complete,
 businessWrites:0
},null,2));
```
<!-- generated:portable-example:end -->

## Understand the output

<!-- generated:portable-output:start -->
```json
{
  "action": "approve",
  "valid": true,
  "complete": false,
  "businessWrites": 0
}
```
<!-- generated:portable-output:end -->

The action has module sales and ID approve. Its recipe sets one selected order's status to the literal approved. The supplied fixture has no preconditions, postconditions or business outputs; do not infer extra business rules from its name.

The fixture deliberately uses the opaque reference-roles/1 authorization profile. Its authorization obligation remains unchecked. Registration preserves that declaration, but does not certify its enforcement. The companion `bun run test:docs:examples` also checks preservation of unknown content and an assessment with missing claims: it is incompatible and says executionVerified false. Those checks are separate from this first inspection.

## Try it in the browser

<!-- playground -->

This runs the same portable inspection against the same fixture. It does not connect to a business database or execute the action. Inspect the validation flags and obligations before assuming a declaration is eligible for use.

## Observe a real refusal

Run `bun run docs:example:refusal`. It tries to add a second action with the existing ID approve to sales. The public API refuses with ACTION_IDENTITY and leaves the original document unchanged. This is a declaration error, not a business transaction rollback. Inspect scripts/actions-docs/refusal-example.ts for the executable code and assertions. Unknown preservation in the first example is different: future meaning remains in the document and is reported unchecked.

## Predict the result

Would replacing an unknown rule with an invented true condition make the original declaration safely editable?

Answer: no. Relevant unchecked meaning blocks safe replacement. Preserve the original content and obtain a supported interpretation instead of guessing.
