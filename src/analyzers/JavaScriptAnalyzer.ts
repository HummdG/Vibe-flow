/**
 * JavaScript/TypeScript analyzer
 */

import { BaseLanguageAnalyzer, AnalysisContext, AnalysisResult } from './BaseLanguageAnalyzer';
import { SymbolNode, CallEdge } from '../types';

export class JavaScriptAnalyzer extends BaseLanguageAnalyzer {
    analyze(context: AnalysisContext): AnalysisResult {
        const symbols: SymbolNode[] = [];
        const edges: CallEdge[] = [];
        const imports = new Map<string, string>();
        const exports = new Set<string>();

        // Extract imports
        this.extractImports(context.content, imports);

        // Extract exports
        this.extractExports(context.content, exports);

        // Extract functions
        this.extractFunctions(context, symbols, edges, imports);

        // Extract classes
        this.extractClasses(context, symbols, edges, imports);

        // Extract arrow functions
        this.extractArrowFunctions(context, symbols, edges, imports);

        return { symbols, edges, imports, exports };
    }

    private extractImports(content: string, imports: Map<string, string>): void {
        // ES6 named imports: import { foo, bar } from 'module'
        const namedImportRegex = /import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]([^'"]+)['"]/g;
        let match;
        
        while ((match = namedImportRegex.exec(content)) !== null) {
            const names = match[1].split(',').map(n => {
                const parts = n.trim().split(/\s+as\s+/);
                return parts[parts.length - 1].trim();
            });
            const modulePath = match[2];
            names.forEach(name => imports.set(name, modulePath));
        }

        // Default imports: import foo from 'module'
        const defaultImportRegex = /import\s+(\w+)\s+from\s*['"]([^'"]+)['"]/g;
        while ((match = defaultImportRegex.exec(content)) !== null) {
            imports.set(match[1], match[2]);
        }

        // Namespace imports: import * as foo from 'module'
        const namespaceImportRegex = /import\s+\*\s+as\s+(\w+)\s+from\s*['"]([^'"]+)['"]/g;
        while ((match = namespaceImportRegex.exec(content)) !== null) {
            imports.set(match[1], match[2]);
        }
    }

    private extractExports(content: string, exports: Set<string>): void {
        // export function/class/const/let/var
        const exportRegex = /export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+(\w+)/g;
        let match;
        
        while ((match = exportRegex.exec(content)) !== null) {
            exports.add(match[1]);
        }

        // export { foo, bar }
        const exportBraceRegex = /export\s*\{\s*([^}]+)\s*\}/g;
        while ((match = exportBraceRegex.exec(content)) !== null) {
            const names = match[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0].trim());
            names.forEach(name => exports.add(name));
        }
    }

    private extractFunctions(
        context: AnalysisContext,
        symbols: SymbolNode[],
        edges: CallEdge[],
        imports: Map<string, string>
    ): void {
        // Regular function declarations
        const funcRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)/g;
        let match;

        while ((match = funcRegex.exec(context.content)) !== null) {
            const line = this.getLineNumber(context.content, match.index);
            const column = this.getColumnNumber(context.content, match.index);
            const isAsync = match[0].includes('async');
            const isExported = match[0].includes('export');

            const id = context.idGenerator.generateSymbolId(
                context.file,
                match[1],
                'function',
                line
            );

            symbols.push({
                id,
                name: match[1],
                kind: 'function',
                language: context.language,
                file: context.file,
                module: null,
                line,
                column,
                parent_symbol: null,
                async: isAsync,
                visibility: isExported ? 'public' : null
            });

            // Extract calls within this function
            const functionBody = this.extractFunctionBody(context.content, match.index);
            this.extractCalls(context, functionBody, id, match.index, edges, imports);
        }
    }

    private extractClasses(
        context: AnalysisContext,
        symbols: SymbolNode[],
        edges: CallEdge[],
        imports: Map<string, string>
    ): void {
        const classRegex = /(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?\s*\{/g;
        let match;

        while ((match = classRegex.exec(context.content)) !== null) {
            const line = this.getLineNumber(context.content, match.index);
            const column = this.getColumnNumber(context.content, match.index);
            const isExported = match[0].includes('export');

            const classId = context.idGenerator.generateSymbolId(
                context.file,
                match[1],
                'class',
                line
            );

            symbols.push({
                id: classId,
                name: match[1],
                kind: 'class',
                language: context.language,
                file: context.file,
                module: null,
                line,
                column,
                parent_symbol: null,
                async: null,
                visibility: isExported ? 'public' : null
            });

            // Extract methods
            const classBody = this.extractBlockBody(context.content, match.index);
            this.extractMethods(context, classBody, match.index, classId, symbols, edges, imports);
        }
    }

    private extractMethods(
        context: AnalysisContext,
        classBody: string,
        baseIndex: number,
        parentId: string,
        symbols: SymbolNode[],
        edges: CallEdge[],
        imports: Map<string, string>
    ): void {
        // Method patterns - exclude constructors and reserved keywords
        const reservedKeywords = new Set(['if', 'for', 'while', 'switch', 'catch', 'try', 'with', 'do']);
        const methodRegex = /(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/g;
        let match;

        while ((match = methodRegex.exec(classBody)) !== null) {
            const methodName = match[1];
            
            // Skip reserved keywords
            if (reservedKeywords.has(methodName)) {
                continue;
            }
            
            const absoluteIndex = baseIndex + match.index;
            const line = this.getLineNumber(context.content, absoluteIndex);
            const column = this.getColumnNumber(context.content, absoluteIndex);
            const isAsync = match[0].includes('async');

            const methodId = context.idGenerator.generateSymbolId(
                context.file,
                methodName,
                'method',
                line
            );

            symbols.push({
                id: methodId,
                name: methodName,
                kind: 'method',
                language: context.language,
                file: context.file,
                module: null,
                line,
                column,
                parent_symbol: parentId,
                async: isAsync,
                visibility: 'public'
            });

            // Extract calls within method
            const methodBody = this.extractBlockBody(classBody, match.index);
            this.extractCalls(context, methodBody, methodId, absoluteIndex, edges, imports);
        }
    }

    private extractArrowFunctions(
        context: AnalysisContext,
        symbols: SymbolNode[],
        edges: CallEdge[],
        imports: Map<string, string>
    ): void {
        // const func = async () => {}
        const arrowRegex = /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g;
        let match;

        while ((match = arrowRegex.exec(context.content)) !== null) {
            const line = this.getLineNumber(context.content, match.index);
            const column = this.getColumnNumber(context.content, match.index);
            const isAsync = match[0].includes('async');
            const isExported = match[0].includes('export');

            const id = context.idGenerator.generateSymbolId(
                context.file,
                match[1],
                'function',
                line
            );

            symbols.push({
                id,
                name: match[1],
                kind: 'function',
                language: context.language,
                file: context.file,
                module: null,
                line,
                column,
                parent_symbol: null,
                async: isAsync,
                visibility: isExported ? 'public' : null
            });

            // Extract calls
            const functionBody = this.extractArrowBody(context.content, match.index);
            this.extractCalls(context, functionBody, id, match.index, edges, imports);
        }
    }

    private extractCalls(
        context: AnalysisContext,
        body: string,
        callerId: string,
        baseIndex: number,
        edges: CallEdge[],
        imports: Map<string, string>
    ): void {
        // Match function calls: functionName(
        const callRegex = /(\w+)\s*\(/g;
        let match;

        const calledFunctions = new Set<string>();

        while ((match = callRegex.exec(body)) !== null) {
            const functionName = match[1];
            
            // Skip common keywords and built-ins
            const skip = ['if', 'for', 'while', 'switch', 'catch', 'typeof', 'return', 'new', 'await', 'async', 'try', 'with', 'do', 'throw', 'delete', 'void', 'yield', 'import', 'export', 'instanceof'];
            if (skip.includes(functionName)) {
                continue;
            }

            calledFunctions.add(functionName);
        }

        // Create edges (we'll resolve targets later in the graph builder)
        calledFunctions.forEach(funcName => {
            const absoluteIndex = baseIndex;
            const line = this.getLineNumber(context.content, absoluteIndex);
            const column = this.getColumnNumber(context.content, absoluteIndex);

            edges.push({
                from: callerId,
                to: funcName, // Temporary - will be resolved to actual ID
                type: 'call',
                file: context.file,
                line,
                column,
                via: funcName
            });
        });
    }

    private extractFunctionBody(content: string, startIndex: number): string {
        let braceCount = 0;
        let inBody = false;
        let bodyStart = -1;

        for (let i = startIndex; i < content.length; i++) {
            if (content[i] === '{') {
                if (!inBody) {
                    inBody = true;
                    bodyStart = i;
                }
                braceCount++;
            } else if (content[i] === '}') {
                braceCount--;
                if (braceCount === 0 && inBody) {
                    return content.substring(bodyStart, i + 1);
                }
            }
        }

        return '';
    }

    private extractBlockBody(content: string, startIndex: number): string {
        return this.extractFunctionBody(content, startIndex);
    }

    private extractArrowBody(content: string, startIndex: number): string {
        const arrowIndex = content.indexOf('=>', startIndex);
        if (arrowIndex === -1) {
            return '';
        }

        // Check if it's a block body or expression
        let i = arrowIndex + 2;
        while (i < content.length && /\s/.test(content[i])) {
            i++;
        }

        if (content[i] === '{') {
            return this.extractBlockBody(content, i);
        } else {
            // Expression body - find the end (semicolon or newline)
            const end = content.indexOf(';', i);
            if (end !== -1) {
                return content.substring(i, end);
            }
            const lineEnd = content.indexOf('\n', i);
            if (lineEnd !== -1) {
                return content.substring(i, lineEnd);
            }
            return content.substring(i);
        }
    }
}

