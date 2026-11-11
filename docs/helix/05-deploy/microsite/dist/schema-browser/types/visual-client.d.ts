type Renderer = typeof import('@documentdrivendx/umf-visual/renderers/lini').renderLiniPresentation;
type Result = Awaited<ReturnType<Renderer>>;
export declare function renderVisual(document: Parameters<Renderer>[0], runtimeBaseUrl?: string): Promise<Result>;
export {};
