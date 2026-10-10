import type { Diagnostic } from '../../model/types';
import type { Document } from '../../model/types';
/** The tree remains authoritative; the temporary JS view is used only for shape validation. */
export declare function inspectDeltaActions(doc: Document): {
    source: Document;
    complete: false;
    parsedAll: boolean;
    lines: import("./log").DeltaLogLine[];
    knownShapesValid: boolean;
    diagnostics: Diagnostic[];
};
