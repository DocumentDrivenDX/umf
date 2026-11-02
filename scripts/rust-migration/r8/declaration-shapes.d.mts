import type * as ts from 'typescript-api';

export declare function classifyDeclarationShape(api: typeof import('typescript-api'), declaration: ts.Declaration): string;
export declare function classifyInitializerShape(api: typeof import('typescript-api'), declaration: ts.Declaration): string;
export declare function classifyMigrationDisposition(): 'unreviewed';
