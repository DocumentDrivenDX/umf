import { type Document, type Json } from './types';
export declare const coreEvolutionPolicySchema: {
    $schema: string;
    $id: string;
    title: string;
    type: string;
    additionalProperties: boolean;
    required: string[];
    properties: {
        profile: {
            const: string;
        };
    };
}, coreEvolutionOperationSchema: {
    $schema: string;
    $id: string;
    title: string;
    type: string;
    additionalProperties: boolean;
    required: string[];
    properties: {
        operation: {
            const: string;
        };
        version: {
            const: string;
        };
        profile: {
            const: string;
        };
        before: {
            $ref: string;
        };
        after: {
            $ref: string;
        };
        beforeValidation: {
            type: string;
            properties: {
                valid: {
                    type: string;
                };
                complete: {
                    type: string;
                };
                diagnostics: {
                    type: string;
                    items: {
                        type: string;
                        properties: {
                            code: {
                                type: string;
                                minLength: number;
                            };
                            path: {
                                type: string;
                            };
                            message: {
                                type: string;
                            };
                            severity: {
                                enum: string[];
                            };
                        };
                        required: string[];
                        additionalProperties: boolean;
                    };
                };
            };
            required: string[];
            additionalProperties: boolean;
        };
        afterValidation: {
            type: string;
            properties: {
                valid: {
                    type: string;
                };
                complete: {
                    type: string;
                };
                diagnostics: {
                    type: string;
                    items: {
                        type: string;
                        properties: {
                            code: {
                                type: string;
                                minLength: number;
                            };
                            path: {
                                type: string;
                            };
                            message: {
                                type: string;
                            };
                            severity: {
                                enum: string[];
                            };
                        };
                        required: string[];
                        additionalProperties: boolean;
                    };
                };
            };
            required: string[];
            additionalProperties: boolean;
        };
        classification: {
            enum: string[];
        };
        complete: {
            type: string;
        };
        changes: {
            type: string;
            items: {
                type: string;
                additionalProperties: boolean;
                required: string[];
                properties: {
                    beforePath: {
                        type: string[];
                    };
                    afterPath: {
                        type: string[];
                    };
                    kind: {
                        enum: string[];
                    };
                };
            };
        };
        presenceChecks: {
            type: string;
            items: {
                $ref: string;
            };
        };
        diagnostics: {
            type: string;
            items: {
                type: string;
                properties: {
                    code: {
                        type: string;
                        minLength: number;
                    };
                    path: {
                        type: string;
                    };
                    message: {
                        type: string;
                    };
                    severity: {
                        enum: string[];
                    };
                };
                required: string[];
                additionalProperties: boolean;
            };
        };
        residuals: {
            type: string;
            items: {
                type: string;
                minLength: number;
            };
        };
    };
    allOf: {
        if: {
            properties: {
                classification: {
                    const: string;
                };
            };
        };
        then: {
            properties: {
                complete: {
                    const: boolean;
                };
                residuals: {
                    maxItems: number;
                    type: string;
                };
                beforeValidation: {
                    properties: {
                        valid: {
                            const: boolean;
                        };
                        complete: {
                            const: boolean;
                        };
                    };
                    type: string;
                };
                afterValidation: {
                    properties: {
                        valid: {
                            const: boolean;
                        };
                        complete: {
                            const: boolean;
                        };
                    };
                    type: string;
                };
            };
        };
        else: {
            properties: {
                complete: {
                    const: boolean;
                };
                residuals: {
                    minItems: number;
                    type: string;
                };
            };
        };
    }[];
};
export interface CoreEvolutionPolicy {
    profile: 'core-0.8-absent-string-additions/0.1';
}
export declare function inspectCoreEvolution(before: Document, after: Document, policy: CoreEvolutionPolicy): Json;
export declare function verifyCoreEvolution(receiptInput: unknown, before: Document, after: Document, policy: CoreEvolutionPolicy): Json;
