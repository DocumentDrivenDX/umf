import { Registry } from '../../registry/registry';
import { type Document, type ExtensionPackage } from '../../model/types';
export declare const DASHBOARD_EXTENSION = "umf.dashboard";
export declare const dashboardPackage: ExtensionPackage;
export interface DashboardReference {
    module: string;
    element: string;
}
export interface DashboardExpression {
    language: string;
    version?: string;
    text: string;
}
export interface DashboardPosition {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface DashboardModeColor {
    light?: string;
    dark?: string;
}
export interface DashboardTheme {
    name?: string;
    fontFamily?: string;
    palette?: string[];
    roles?: Partial<Record<'canvasBackground' | 'widgetBackground' | 'widgetBorder' | 'font' | 'selection', DashboardModeColor>>;
}
export interface DashboardField {
    role: 'column' | 'measure';
    type?: 'string' | 'boolean' | 'integer' | 'decimal' | 'date' | 'date-time';
    title?: string;
    description?: string;
    expression?: DashboardExpression;
}
export type DashboardChannel = 'x' | 'y' | 'value' | 'target' | 'color' | 'size' | 'angle' | 'label' | 'detail' | 'tooltip' | 'column';
export type DashboardChart = 'counter' | 'bar' | 'line' | 'area' | 'scatter' | 'pie' | 'heatmap' | 'table';
export interface DashboardEncoding {
    channel: DashboardChannel;
    field: string;
    aggregation: 'none' | 'measure' | 'sum' | 'avg' | 'count' | 'count-distinct' | 'min' | 'max' | 'custom';
    expression?: DashboardExpression;
    title?: string;
    scale?: 'quantitative' | 'temporal' | 'categorical';
    sort?: {
        by: 'value-ascending' | 'value-descending' | 'label-ascending' | 'label-descending' | 'custom';
        values?: string[];
    };
    format?: {
        kind: 'number' | 'currency' | 'percent' | 'date';
        decimals?: number;
        abbreviation?: 'none' | 'compact';
        currency?: string;
    };
}
interface DashboardBase {
    description?: string;
    [key: string]: unknown;
}
export interface DashboardRoot extends DashboardBase {
    kind: 'dashboard';
    title: string;
    pages: string[];
    layout: {
        columns: number;
    };
    theme?: DashboardTheme;
}
export interface DashboardPage extends DashboardBase {
    kind: 'page';
    title: string;
    role: 'canvas' | 'global-filters';
}
export interface DashboardData extends DashboardBase {
    kind: 'data';
}
export interface DashboardDataset extends DashboardBase {
    kind: 'dataset';
    title: string;
    grain?: string;
    source: {
        kind: 'table';
        table: string;
    } | {
        kind: 'query';
        query: DashboardExpression;
    };
    fields: Record<string, DashboardField>;
}
export interface DashboardVisual extends DashboardBase {
    kind: 'visual';
    title: string;
    trace?: string;
    chart: DashboardChart;
    dataset: DashboardReference;
    rows?: 'aggregated' | 'detail';
    encodings: DashboardEncoding[];
    position: DashboardPosition;
}
export interface DashboardText {
    kind: 'text';
    trace?: string;
    content: {
        format: 'plain' | 'markdown';
        text: string;
    };
    position: DashboardPosition;
    [key: string]: unknown;
}
export interface DashboardFilter {
    kind: 'filter';
    title: string;
    trace?: string;
    control: 'single-select' | 'multi-select' | 'date-range' | 'range' | 'text-search';
    targets: {
        dataset: DashboardReference;
        field: string;
    }[];
    default?: {
        values: (string | number | boolean)[];
    };
    position: DashboardPosition;
    [key: string]: unknown;
}
export type DashboardDefinition = DashboardDataset | DashboardVisual | DashboardText | DashboardFilter;
export declare function dashboardRegistry(): Registry;
export declare function inspectDashboard(document: Document): import("../..").Validation;
export declare function readDashboardDocument(text: string, format?: 'json' | 'yaml'): Document;
export declare function writeDashboardDocument(doc: Document, format?: 'json' | 'yaml'): string;
export declare function getDashboardDefinition(doc: Document, module: string, element: string): DashboardDefinition;
export declare function editDashboardDefinition(doc: Document, module: string, element: string, update: (definition: DashboardDefinition) => DashboardDefinition): Document;
export {};
