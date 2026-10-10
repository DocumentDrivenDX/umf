import type { JsonObject } from '../../model/types';
import { type Program } from '@typespec/compiler';
export declare function compileTypeSpecProgram(files: Record<string, string>, entrypoint: string, libraries?: Record<string, string>, emission?: {
    options: JsonObject;
    outputs: Record<string, string>;
}): Promise<Program>;
export declare function typeSpecCompilerReport(program: Program, libraries?: Record<string, string>): {
    compiler: string;
    libraries: {
        [x: string]: string;
    };
    valid: boolean;
    complete: false;
    diagnostics: {
        code: string;
        severity: import("@typespec/compiler").DiagnosticSeverity;
        message: string;
        file?: string;
        start?: number;
        end?: number;
    }[];
    limitations: string[];
};
export declare function checkTypeSpecSources(files: Record<string, string>, entrypoint: string, libraries?: Record<string, string>): Promise<{
    compiler: string;
    libraries: {
        [x: string]: string;
    };
    valid: boolean;
    complete: false;
    diagnostics: {
        code: string;
        severity: import("@typespec/compiler").DiagnosticSeverity;
        message: string;
        file?: string;
        start?: number;
        end?: number;
    }[];
    limitations: string[];
}>;
