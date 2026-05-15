/**
 * Python analyzer
 */

import { BaseLanguageAnalyzer, AnalysisContext, AnalysisResult } from './BaseLanguageAnalyzer';
import { SymbolNode, CallEdge } from '../types';

export class PythonAnalyzer extends BaseLanguageAnalyzer {
    analyze(context: AnalysisContext): AnalysisResult {
        const symbols: SymbolNode[] = [];
        const edges: CallEdge[] = [];
        const imports = new Map<string, string>();
        const exports = new Set<string>();

        // Extract imports
        this.extractImports(context.content, imports);

        // Extract functions
        this.extractFunctions(context, symbols, edges, imports);

        // Extract classes
        this.extractClasses(context, symbols, edges, imports);

        // All top-level definitions are considered exports in Python
        symbols.forEach(s => {
            if (s.parent_symbol === null) {
                exports.add(s.name);
            }
        });

        return { symbols, edges, imports, exports };
    }

    private extractImports(content: string, imports: Map<string, string>): void {
        // from module import name1, name2
        const fromImportRegex = /from\s+(\.+[\w.]*|[\w.]+)\s+import\s+([^\n#]+)/g;
        let match;

        while ((match = fromImportRegex.exec(content)) !== null) {
            const moduleName = match[1];
            const importedItems = match[2]
                .replace(/\([^)]*\)/g, '')
                .trim()
                .split(',')
                .map(item => {
                    const parts = item.trim().split(/\s+as\s+/);
                    return {
                        name: parts[0].trim(),
                        alias: parts[parts.length - 1].trim()
                    };
                })
                .filter(item => item.name && item.name !== '*');

            importedItems.forEach(item => {
                imports.set(item.alias, moduleName);
            });
        }

        // import module or import module as alias
        const importRegex = /^import\s+(\.+[\w.]*|[\w.]+)(?:\s+as\s+(\w+))?/gm;
        while ((match = importRegex.exec(content)) !== null) {
            const moduleName = match[1];
            const alias = match[2] || moduleName.split('.').pop()!;
            imports.set(alias, moduleName);
        }
    }

    private extractFunctions(
        context: AnalysisContext,
        symbols: SymbolNode[],
        edges: CallEdge[],
        imports: Map<string, string>
    ): void {
        const lines = context.content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const match = /^(\s*)def\s+(\w+)\s*\(/. exec(line);
            
            if (match) {
                const indentLevel = match[1].length;
                const functionName = match[2];
                const lineNumber = i + 1;

                // Determine if it's async
                const isAsync = line.includes('async def');

                const id = context.idGenerator.generateSymbolId(
                    context.file,
                    functionName,
                    'function',
                    lineNumber
                );

                symbols.push({
                    id,
                    name: functionName,
                    kind: 'function',
                    language: context.language,
                    file: context.file,
                    module: null,
                    line: lineNumber,
                    column: match[1].length,
                    parent_symbol: null,
                    async: isAsync,
                    visibility: functionName.startsWith('_') ? 'private' : 'public'
                });

                // Extract function body and calls
                const body = this.extractPythonFunctionBody(lines, i, indentLevel);
                this.extractCalls(context, body, id, lineNumber, edges, imports);
            }
        }
    }

    private extractClasses(
        context: AnalysisContext,
        symbols: SymbolNode[],
        edges: CallEdge[],
        imports: Map<string, string>
    ): void {
        const lines = context.content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const match = /^(\s*)class\s+(\w+)(?:\(([^)]+)\))?:/.exec(line);
            
            if (match) {
                const indentLevel = match[1].length;
                const className = match[2];
                const lineNumber = i + 1;

                const classId = context.idGenerator.generateSymbolId(
                    context.file,
                    className,
                    'class',
                    lineNumber
                );

                symbols.push({
                    id: classId,
                    name: className,
                    kind: 'class',
                    language: context.language,
                    file: context.file,
                    module: null,
                    line: lineNumber,
                    column: indentLevel,
                    parent_symbol: null,
                    async: null,
                    visibility: className.startsWith('_') ? 'private' : 'public'
                });

                // Extract methods
                this.extractMethods(context, lines, i, indentLevel, classId, symbols, edges, imports);
            }
        }
    }

    private extractMethods(
        context: AnalysisContext,
        lines: string[],
        classStartLine: number,
        classIndent: number,
        parentId: string,
        symbols: SymbolNode[],
        edges: CallEdge[],
        imports: Map<string, string>
    ): void {
        const methodIndent = classIndent + 4; // Standard Python indent
        
        for (let i = classStartLine + 1; i < lines.length; i++) {
            const line = lines[i];
            const lineIndent = line.search(/\S/);
            
            // Exit class body
            if (line.trim() && lineIndent <= classIndent) {
                break;
            }

            const match = new RegExp(`^\\s{${methodIndent}}def\\s+(\\w+)\\s*\\(`).exec(line);
            
            if (match) {
                const methodName = match[1];
                const lineNumber = i + 1;
                const isAsync = line.includes('async def');

                const methodId = context.idGenerator.generateSymbolId(
                    context.file,
                    methodName,
                    'method',
                    lineNumber
                );

                // Determine visibility
                let visibility: 'public' | 'private' | 'protected' | null = 'public';
                if (methodName.startsWith('__') && methodName.endsWith('__')) {
                    visibility = 'public'; // Special methods
                } else if (methodName.startsWith('__')) {
                    visibility = 'private';
                } else if (methodName.startsWith('_')) {
                    visibility = 'protected';
                }

                symbols.push({
                    id: methodId,
                    name: methodName,
                    kind: 'method',
                    language: context.language,
                    file: context.file,
                    module: null,
                    line: lineNumber,
                    column: methodIndent,
                    parent_symbol: parentId,
                    async: isAsync,
                    visibility
                });

                // Extract method body and calls
                const body = this.extractPythonFunctionBody(lines, i, methodIndent);
                this.extractCalls(context, body, methodId, lineNumber, edges, imports);
            }
        }
    }

    private extractPythonFunctionBody(lines: string[], startLine: number, baseIndent: number): string {
        const bodyLines: string[] = [lines[startLine]];
        const contentIndent = baseIndent + 4;

        for (let i = startLine + 1; i < lines.length; i++) {
            const line = lines[i];
            const lineIndent = line.search(/\S/);

            // Empty line
            if (line.trim() === '') {
                bodyLines.push(line);
                continue;
            }

            // Exit function body
            if (lineIndent <= baseIndent) {
                break;
            }

            bodyLines.push(line);
        }

        return bodyLines.join('\n');
    }

    private extractCalls(
        context: AnalysisContext,
        body: string,
        callerId: string,
        baseLine: number,
        edges: CallEdge[],
        imports: Map<string, string>
    ): void {
        // Match function calls: functionName(
        const callRegex = /(\w+)\s*\(/g;
        let match;

        const calledFunctions = new Set<string>();

        while ((match = callRegex.exec(body)) !== null) {
            const functionName = match[1];
            
            // Skip common built-ins and keywords
            const skip = [
                'if', 'for', 'while', 'with', 'try', 'except', 'finally',
                'print', 'len', 'range', 'str', 'int', 'float', 'bool',
                'list', 'dict', 'set', 'tuple', 'isinstance', 'hasattr',
                'getattr', 'setattr', 'super', 'type', 'open', 'enumerate',
                'zip', 'map', 'filter', 'sorted', 'reversed', 'min', 'max',
                'sum', 'abs', 'round', 'all', 'any', 'ord', 'chr'
            ];
            
            if (skip.includes(functionName)) {
                continue;
            }

            calledFunctions.add(functionName);
        }

        // Create edges
        calledFunctions.forEach(funcName => {
            edges.push({
                from: callerId,
                to: funcName, // Temporary - will be resolved to actual ID
                type: 'call',
                file: context.file,
                line: baseLine,
                column: 0,
                via: funcName
            });
        });
    }
}

