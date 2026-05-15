/**
 * Core type definitions for the Code Flow Mapper
 * Language-agnostic representation of code structure
 */

export type NodeKind = 'function' | 'method' | 'class' | 'interface' | 'type' | 'module' | 'namespace' | 'script';
export type EdgeType = 'call' | 'method_call' | 'constructor' | 'dispatch' | 'component' | 'other';
export type Visibility = 'public' | 'private' | 'protected' | null;
export type Language = 
    | 'Python' 
    | 'JavaScript' 
    | 'TypeScript' 
    | 'TypeScript React' 
    | 'Java' 
    | 'C#' 
    | 'Go' 
    | 'C' 
    | 'C++' 
    | 'Rust' 
    | 'PHP' 
    | 'Kotlin' 
    | 'Swift'
    | 'generic';

export interface SymbolNode {
    id: string;
    name: string;
    kind: NodeKind;
    language: Language;
    file: string;
    module: string | null;
    line: number;
    column: number;
    parent_symbol: string | null;
    async: boolean | null;
    visibility: Visibility;
}

export interface CallEdge {
    from: string;
    to: string;
    type: EdgeType;
    file: string;
    line: number;
    column: number;
    via?: string;
}

export interface FileSummary {
    path: string;
    language: Language;
    defines: string[];
    reads_from_files: string[];
    writes_to_files: string[];
    calls_out_to_files: string[];
}

export interface DiffInfo {
    added_nodes: SymbolNode[];
    removed_nodes: SymbolNode[];
    modified_nodes: Array<{
        before: SymbolNode;
        after: SymbolNode;
        changes: string[];
    }>;
    added_edges: CallEdge[];
    removed_edges: CallEdge[];
}

export interface ExecutionStep {
    index: number;
    timestamp: string | null;
    event_type: string;
    description: string | null;
    file: string | null;
    line: number | null;
    active_stack: Array<{ symbol_id: string | null }>;
}

export interface ExecutionTrace {
    steps: ExecutionStep[];
    highlighted_nodes: string[];
    highlighted_edges: Array<{ from: string; to: string }>;
}

export interface Summary {
    static_overview: string | null;
    changes_overview: string | null;
    runtime_overview: string | null;
    notable_files: string[];
    notable_symbols: string[];
}

export interface CodeFlowAnalysisResult {
    nodes: SymbolNode[];
    edges: CallEdge[];
    files: FileSummary[];
    diff: DiffInfo | null;
    execution: ExecutionTrace | null;
    summary: Summary;
    warnings: string[];
}

export interface FileInput {
    path: string;
    language: string;
    content: string;
}

export interface TraceEvent {
    timestamp?: string;
    type: string;
    description?: string;
    file?: string;
    line?: number;
    function?: string;
    stack?: string[];
}

export interface FocusHint {
    entrypoints?: string[];
    regions?: string[];
}

export interface AnalysisInput {
    mode: 'static' | 'change_diff' | 'runtime';
    files: FileInput[];
    prev_files?: FileInput[];
    trace_events?: TraceEvent[];
    focus?: FocusHint;
}

