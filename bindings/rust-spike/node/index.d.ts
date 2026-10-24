export function run(requestJson: string): string;
export function run_with_validator(requestJson: string, callback: (sourceText: string) => void): string;
export function run_with_control(requestJson: string, shouldCancel: () => boolean, validator?: (sourceText: string) => void): string;
export function engine_version(): string;
