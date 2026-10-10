export interface SourceArtifact {id:string;reference:string;url:string;format:string;dataKind:string;sha256:string;revision?:string}
export interface Entry {id:string;title:string;category:string;path:string;text:string;format:'json'|'yaml';pack?:string;description?:string;schemaFormat?:string;packVersion?:string;aliases?:string[];assets?:SourceArtifact[]}

/** Catalog sources are inspected as data, never executed. */
export interface SchemaBrowserOptions {
  /** URL of the hosted package's assets/ directory; must be HTTP(S). */
  assetsUrl: string;
  /** Caller-supplied catalog. Omit to load catalogUrl instead. */
  entries?: Entry[];
  catalogUrl?: string;
  /** Base URL for declared relative original/download references. */
  assetBaseUrl?: string;
  /** URLSearchParams spelling, for example schema=...&definition=... */
  initialRoute?: string;
  title?: string;
  height?: string;
}
export interface SchemaBrowserHandle {
  iframe: HTMLIFrameElement;
  /** Frame document and module loaded; catalog failures display in its status. */
  ready: Promise<void>;
  destroy(): void;
}
