# R3 actions review controls

The frozen public `generateAccessPackage` control adds a rules/1 condition with an integer root to the selected action. TypeScript returns a refused result at `/actions`; the condition is invalid because rules require a boolean root. The request uses the authored census completeness source and its exact access binding.

The full TypeScript oracle envelope is stored in `frozen.json`. The control SHA-256 is `f6d2c2060d1380906d21cdf1b56395e72e4322a2ad80e31fd3dfc3da28641377`.

Source SHA-256 at capture:

- `src/extensions/actions/analysis.ts`: `0821a8332d0ab7a3e396150abfd8494b1b2f7f9adb2f18e21ebc6d6fc3deae3d`
- `src/extensions/actions/expression.ts`: `d167218001f4d8fcd593b538e7b5eedda4b7fcb28505ac82f5a663470706c5e6`
- `src/compilation/admission/index.ts`: `8fecabb0554c48548b1680f5e82e5d713e7883ba7427b64248249a351c3148ee`
- `fixtures/access/commerce/census-completeness.expected.json`: `fd6ddcbf2b30541458330ca697bd8c9c068e63bb881877bc0f9b474a972daf71`
