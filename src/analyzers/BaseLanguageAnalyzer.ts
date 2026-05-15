/**
 * Base interface for language analyzers
 */

import { SymbolNode, CallEdge, Language } from '../types';
import { IdGenerator } from '../utils/idGenerator';

export interface AnalysisContext {
    file: string;
    content: string;
    language: Language;
    idGenerator: IdGenerator;
    workspaceRoot: string;
}

export interface AnalysisResult {
    symbols: SymbolNode[];
    edges: CallEdge[];
    imports: Map<string, string>; // imported name -> module path
    exports: Set<string>;
}

export abstract class BaseLanguageAnalyzer {
    protected language: Language;

    constructor(language: Language) {
        this.language = language;
    }

    /**
     * Analyze a file and extract symbols and relationships
     */
    abstract analyze(context: AnalysisContext): AnalysisResult;

    /**
     * Helper to count lines up to a position
     */
    protected getLineNumber(content: string, position: number): number {
        return content.substring(0, position).split('\n').length;
    }

    /**
     * Helper to get column number at a position
     */
    protected getColumnNumber(content: string, position: number): number {
        const lastNewline = content.lastIndexOf('\n', position);
        return position - lastNewline;
    }

    /**
     * Extract a substring safely
     */
    protected extract(content: string, start: number, end: number): string {
        return content.substring(Math.max(0, start), Math.min(content.length, end));
    }
}

