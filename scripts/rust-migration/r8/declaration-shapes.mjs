// SPDX-License-Identifier: MIT OR Apache-2.0
// Deterministic syntax-only classification. These labels describe TypeScript
// declaration form, not behavior, Rust coverage, or retirement readiness.
export function classifyDeclarationShape(ts, declaration) {
  if (ts.isFunctionDeclaration(declaration)) return 'function-declaration';
  if (ts.isClassDeclaration(declaration)) return 'class-declaration';
  if (ts.isEnumDeclaration(declaration)) return 'enum-declaration';
  if (ts.isVariableDeclaration(declaration)) return 'variable-declaration';
  if (ts.isBindingElement(declaration)) return 'binding-element';
  if (ts.isModuleDeclaration(declaration)) return 'module-declaration';
  if (ts.isSourceFile(declaration) && declaration.fileName.endsWith('.json')) return 'json-resource';
  return 'other-runtime-declaration';
}

export function classifyInitializerShape(ts, declaration) {
  if (!ts.isVariableDeclaration(declaration)) return 'not-applicable';
  const initializer = declaration.initializer;
  if (!initializer) return 'no-initializer';
  if (ts.isArrowFunction(initializer)) return 'arrow-function';
  if (ts.isFunctionExpression(initializer)) return 'function-expression';
  if (ts.isClassExpression(initializer)) return 'class-expression';
  if (ts.isObjectLiteralExpression(initializer)) return 'object-literal';
  if (ts.isArrayLiteralExpression(initializer)) return 'array-literal';
  if (ts.isNewExpression(initializer)) return 'new-expression';
  if (ts.isCallExpression(initializer)) return 'call-expression';
  if (ts.isStringLiteralLike(initializer) || ts.isNumericLiteral(initializer) ||
      initializer.kind === ts.SyntaxKind.TrueKeyword || initializer.kind === ts.SyntaxKind.FalseKeyword ||
      initializer.kind === ts.SyntaxKind.NullKeyword || ts.isBigIntLiteral(initializer) || ts.isRegularExpressionLiteral(initializer)) return 'literal';
  if (ts.isIdentifier(initializer)) return 'identifier';
  if (ts.isTemplateExpression(initializer) || ts.isNoSubstitutionTemplateLiteral(initializer)) return 'template-expression';
  return 'other-expression';
}

export function classifyMigrationDisposition() {
  // No row-level retirement decision is authorized by syntax shape alone.
  return 'unreviewed';
}
