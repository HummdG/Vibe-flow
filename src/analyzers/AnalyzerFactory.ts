/**
 * Multi-language analyzer that delegates to specific language analyzers
 */

import { BaseLanguageAnalyzer, AnalysisContext, AnalysisResult } from './BaseLanguageAnalyzer';
import { JavaScriptAnalyzer } from './JavaScriptAnalyzer';
import { PythonAnalyzer } from './PythonAnalyzer';
import { JavaAnalyzer } from './JavaAnalyzer';
import { Language, SymbolNode, CallEdge } from '../types';

export class GenericAnalyzer extends BaseLanguageAnalyzer {
    analyze(context: AnalysisContext): AnalysisResult {
        // Best-effort analysis for unsupported languages
        const symbols: SymbolNode[] = [];
        const edges: CallEdge[] = [];
        const imports = new Map<string, string>();
        const exports = new Set<string>();

        // Try to extract basic function-like structures
        const functionPatterns: RegExp[] = [
            /function\s+(\w+)/g,
            /def\s+(\w+)/g,
            /func\s+(\w+)/g,
            /fn\s+(\w+)/g,
            /sub\s+(\w+)/g,
            /proc\s+(\w+)/g
        ];

        for (const pattern of functionPatterns) {
            let match: RegExpExecArray | null;
            while ((match = pattern.exec(context.content)) !== null) {
                const line = this.getLineNumber(context.content, match.index);
                const column = this.getColumnNumber(context.content, match.index);
                
                const id = context.idGenerator.generateSymbolId(
                    context.file,
                    match[1],
                    'function',
                    line
                );

                symbols.push({
                    id,
                    name: match[1],
                    kind: 'function' as const,
                    language: context.language,
                    file: context.file,
                    module: null,
                    line,
                    column,
                    parent_symbol: null,
                    async: null,
                    visibility: null
                });
            }
        }

        const result: AnalysisResult = { symbols, edges, imports, exports };
        return result;
    }
}

export class AnalyzerFactory {
    private static analyzers: Map<Language, BaseLanguageAnalyzer> | null = null;

    private static initializeAnalyzers(): Map<Language, BaseLanguageAnalyzer> {
        if (this.analyzers === null) {
            this.analyzers = new Map<Language, BaseLanguageAnalyzer>();
            this.analyzers.set('JavaScript', new JavaScriptAnalyzer('JavaScript'));
            this.analyzers.set('TypeScript', new JavaScriptAnalyzer('TypeScript'));
            this.analyzers.set('TypeScript React', new JavaScriptAnalyzer('TypeScript React'));
            this.analyzers.set('Python', new PythonAnalyzer('Python'));
            this.analyzers.set('Java', new JavaAnalyzer('Java'));
        }
        return this.analyzers;
    }

    static getAnalyzer(language: Language): BaseLanguageAnalyzer {
        const analyzers = this.initializeAnalyzers();
        return analyzers.get(language) || new GenericAnalyzer('generic');
    }
}

