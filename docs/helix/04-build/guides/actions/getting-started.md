# Inspect your first action

You will read the actual approve fixture and inspect its declaration. No database, Docker or credentials are required.

## Get the normal SDK

[Download the current UMF SDK](https://github.com/DocumentDrivenDX/umf/releases/tag/umf-v0.5.0). One SDK contains the browser library, TypeScript declarations and schemas, including action declaration support. There is no separate actions package to install.

Use Bun 1.4.2 for this example. In a new project directory, download and install the released SDK:

```sh
curl -fL https://github.com/DocumentDrivenDX/umf/releases/download/umf-v0.5.0/umf-sdk.tgz -o umf-sdk.tgz
bun init -y
bun add ./umf-sdk.tgz
curl -fL https://raw.githubusercontent.com/DocumentDrivenDX/umf/umf-v0.5.0/fixtures/actions/approve.json -o approve.json
```

The release includes [SHA256SUMS](https://github.com/DocumentDrivenDX/umf/releases/download/umf-v0.5.0/SHA256SUMS) for checking the downloaded archive. The SDK is distributed as this release archive; it is not published to npm.

Create `inspect.ts` with the following code:

```ts
import {createUmfRegistry, readDocument, inspectActions} from '@umf/core';

const document = readDocument(await Bun.file('approve.json').text(), 'json');
const inspection = inspectActions(document, createUmfRegistry());
console.log(JSON.stringify({
  action: inspection.actions[0]!.action.id,
  valid: inspection.validation.valid,
  complete: inspection.validation.complete,
  businessWrites: 0
}, null, 2));
```

Run `bun inspect.ts`. It prints the output explained below: action approve, valid true, complete false and zero business writes. `createUmfRegistry()` supplies the built-in action vocabulary. A host application selects its executor and credentials separately; inspecting a declaration never executes it.

The SDK includes the current core format and action vocabulary. Vocabulary declarations remain explicit in the document.

## Work from source instead

The repository examples are an alternative for contributors. To build the SDK archive yourself, run `bun run build:sdk`; the archive is written to `.cache/sdk-distribution/umf-sdk.tgz`.

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
// SPDX-License-Identifier: MIT OR Apache-2.0
import {createUmfRegistry,readDocument,inspectActions} from '../../src/index';
import fixture from '../../fixtures/actions/approve.json';

const registry=createUmfRegistry();
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
