/** Source identity and display identity are separate; labels never become keys. */
export type ChangeStatus = 'created' | 'changed' | 'removed' | 'unchanged';
export interface ComponentModel {
    records: {
        id: string;
        label?: string;
        properties?: number;
        status?: ChangeStatus;
    }[];
    edges: {
        id: string;
        source: string;
        target: string;
        label?: string;
        directed?: boolean;
        status?: ChangeStatus;
    }[];
}
export interface MapAnnotation {
    badge: string;
    tooltip?: string;
    tone?: string;
}
/** A display projection retains the whole supplied model, including unknown
 * content and unresolved relationships. It never rewrites the schema source. */
export declare function recordMapProjection<T extends ComponentModel>(input: T, focus?: string, annotations?: Record<string, MapAnnotation[]>): {
    source: T;
    annotations: Record<string, MapAnnotation[]>;
    visual: {
        id: string;
        kind: 'flow';
        form: 'network';
        question: string;
        omissions: string[];
        nodes: {
            id: string;
            label: string;
            detail: string;
            emphasis?: "focus" | undefined;
        }[];
        edges: {
            id: string;
            from: string;
            to: string;
            directed: boolean;
            label: string;
        }[];
    };
    records: {
        id: string;
        label?: string;
        properties?: number;
        status?: ChangeStatus;
    }[];
    edges: {
        id: string;
        source: string;
        target: string;
        label?: string;
        directed?: boolean;
        status?: ChangeStatus;
    }[];
    drawable: {
        id: string;
        source: string;
        target: string;
        label?: string;
        directed?: boolean;
        status?: ChangeStatus;
    }[];
    unresolved: {
        id: string;
        source: string;
        target: string;
        label?: string;
        directed?: boolean;
        status?: ChangeStatus;
    }[];
    recordIds: Map<string, string>;
    edgeIds: Map<string, string>;
};
