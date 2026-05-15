/**
 * Java analyzer
 */

import { BaseLanguageAnalyzer, AnalysisContext, AnalysisResult } from './BaseLanguageAnalyzer';
import { SymbolNode, CallEdge } from '../types';

export class JavaAnalyzer extends BaseLanguageAnalyzer {
    analyze(context: AnalysisContext): AnalysisResult {
        const symbols: SymbolNode[] = [];
        const edges: CallEdge[] = [];
        const imports = new Map<string, string>();
        const exports = new Set<string>();

        // Extract package
        const packageMatch = /package\s+([\w.]+);/.exec(context.content);
        const packageName = packageMatch ? packageMatch[1] : null;

        // Extract imports
        this.extractImports(context.content, imports);

        // Extract classes and interfaces
        this.extractClasses(context, symbols, edges, imports, packageName, exports);

        return { symbols, edges, imports, exports };
    }

    private extractImports(content: string, imports: Map<string, string>): void {
        const importRegex = /import\s+(static\s+)?([\w.]+)(?:\.\*)?;/g;
        let match;

        while ((match = importRegex.exec(content)) !== null) {
            const fullPath = match[2];
            const name = fullPath.split('.').pop()!;
            imports.set(name, fullPath);
        }
    }

    private extractClasses(
        context: AnalysisContext,
        symbols: SymbolNode[],
        edges: CallEdge[],
        imports: Map<string, string>,
        packageName: string | null,
        exports: Set<string>
    ): void {
        // Match class/interface declarations
        const classRegex = /(public|private|protected)?\s*(abstract|final)?\s*(class|interface|enum)\s+(\w+)/g;
        let match;

        while ((match = classRegex.exec(context.content)) !== null) {
            const visibility = match[1] as 'public' | 'private' | 'protected' || 'public';
            const kind = match[3] === 'interface' ? 'interface' : 'class';
            const className = match[4];
            const line = this.getLineNumber(context.content, match.index);
            const column = this.getColumnNumber(context.content, match.index);

            const classId = context.idGenerator.generateSymbolId(
                context.file,
                className,
                kind,
                line
            );

            symbols.push({
                id: classId,
                name: className,
                kind,
                language: context.language,
                file: context.file,
                module: packageName,
                line,
                column,
                parent_symbol: null,
                async: null,
                visibility
            });

            if (visibility === 'public') {
                exports.add(className);
            }

            // Extract methods
            const classBody = this.extractClassBody(context.content, match.index);
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
        // Match method declarations
        const methodRegex = /(public|private|protected)?\s*(static|final|abstract|synchronized)?\s*(?:<[^>]+>)?\s*(\w+)\s+(\w+)\s*\([^)]*\)\s*(?:throws\s+[\w,\s]+)?\s*[{;]/g;
        let match;

        while ((match = methodRegex.exec(classBody)) !== null) {
            const visibility = match[1] as 'public' | 'private' | 'protected' || 'public';
            const methodName = match[4];
            const absoluteIndex = baseIndex + match.index;
            const line = this.getLineNumber(context.content, absoluteIndex);
            const column = this.getColumnNumber(context.content, absoluteIndex);

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
                async: null,
                visibility
            });

            // Extract calls
            const methodBody = this.extractMethodBody(classBody, match.index);
            this.extractCalls(context, methodBody, methodId, absoluteIndex, edges, imports);
        }
    }

    private extractClassBody(content: string, startIndex: number): string {
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

    private extractMethodBody(content: string, startIndex: number): string {
        return this.extractClassBody(content, startIndex);
    }

    private extractCalls(
        context: AnalysisContext,
        body: string,
        callerId: string,
        baseIndex: number,
        edges: CallEdge[],
        imports: Map<string, string>
    ): void {
        // Match method calls
        const callRegex = /(\w+)\s*\(/g;
        let match;

        const calledFunctions = new Set<string>();

        while ((match = callRegex.exec(body)) !== null) {
            const functionName = match[1];
            
            const skip = ['if', 'for', 'while', 'switch', 'catch', 'synchronized', 'new', 'super', 'this'];
            if (skip.includes(functionName)) {
                continue;
            }

            calledFunctions.add(functionName);
        }

        calledFunctions.forEach(funcName => {
            const line = this.getLineNumber(context.content, baseIndex);
            const column = this.getColumnNumber(context.content, baseIndex);

            edges.push({
                from: callerId,
                to: funcName,
                type: 'method_call',
                file: context.file,
                line,
                column,
                via: funcName
            });
        });
    }
}

