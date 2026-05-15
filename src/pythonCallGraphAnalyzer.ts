import * as fs from 'fs';
import * as path from 'path';

// Input/Output types matching the specification
export interface FileDescriptor {
    path: string;
    language: 'python';
    content: string;
}

export interface AnalysisInput {
    files: FileDescriptor[];
    entrypoints?: string[];
    workspace_root: string;
}

export interface SymbolNode {
    id: string;
    name: string;
    kind: 'function' | 'method' | 'class';
    module: string;
    file: string;
    line: number;
    column: number;
    class_name?: string;
    enclosing_function?: string;
    async?: boolean;
}

export interface CallEdge {
    from: string;
    to: string;
    type: 'function_call' | 'method_call' | 'constructor_call' | 'decorator';
    file: string;
    line: number;
    column: number;
    via?: string;
}

export interface CallGraphOutput {
    nodes: SymbolNode[];
    edges: CallEdge[];
    warnings: string[];
}

// Internal data structures
interface ImportInfo {
    name: string;           // The name as used in the file (alias or original)
    module: string;         // The module it comes from
    originalName?: string;  // The original name if aliased
    isRelative: boolean;
}

interface SymbolDefinition {
    name: string;
    kind: 'function' | 'method' | 'class';
    module: string;
    file: string;
    line: number;
    column: number;
    className?: string;
    enclosingFunction?: string;
    isAsync: boolean;
    bodyStartLine: number;
    bodyEndLine: number;
}

export class PythonCallGraphAnalyzer {
    private files: Map<string, FileDescriptor> = new Map();
    private symbols: Map<string, SymbolDefinition> = new Map();
    private symbolsByName: Map<string, SymbolDefinition[]> = new Map();
    private symbolsByModule: Map<string, SymbolDefinition[]> = new Map();
    private imports: Map<string, ImportInfo[]> = new Map();
    private fileToModule: Map<string, string> = new Map();
    private warnings: string[] = [];
    private workspaceRoot: string = '';
    private nextId: number = 1;

    analyze(input: AnalysisInput): CallGraphOutput {
        try {
            this.reset();
            this.workspaceRoot = input.workspace_root;

            // Validate input
            if (!input.files || input.files.length === 0) {
                return {
                    nodes: [],
                    edges: [],
                    warnings: ['No Python files provided']
                };
            }

            // Build file index
            for (const file of input.files) {
                this.files.set(file.path, file);
                const module = this.pathToModule(file.path);
                this.fileToModule.set(file.path, module);
            }

            // Step 1: Parse all files and extract symbols
            for (const file of input.files) {
                this.extractSymbols(file);
            }

            // Step 2: Parse imports
            for (const file of input.files) {
                this.extractImports(file);
            }

            // Step 3: Build call graph
            const edges = this.buildCallGraph();

            // Step 4: Convert to output format
            const nodes = this.symbolsToNodes();

            return {
                nodes,
                edges,
                warnings: this.warnings
            };
        } catch (error) {
            return {
                nodes: [],
                edges: [],
                warnings: [`Fatal error: ${error}`]
            };
        }
    }

    private reset(): void {
        this.files.clear();
        this.symbols.clear();
        this.symbolsByName.clear();
        this.symbolsByModule.clear();
        this.imports.clear();
        this.fileToModule.clear();
        this.warnings = [];
        this.nextId = 1;
    }

    private pathToModule(filePath: string): string {
        // Convert file path to Python module notation
        // e.g., "src/utils/helper.py" -> "src.utils.helper"
        let modulePath = filePath.replace(/\\/g, '/');
        
        // Remove .py extension
        if (modulePath.endsWith('.py')) {
            modulePath = modulePath.substring(0, modulePath.length - 3);
        }
        
        // Convert __init__ to package name
        if (modulePath.endsWith('/__init__')) {
            modulePath = modulePath.substring(0, modulePath.length - 9);
        }
        
        // Convert path separators to dots
        return modulePath.replace(/\//g, '.');
    }

    private extractSymbols(file: FileDescriptor): void {
        const lines = file.content.split('\n');
        const module = this.fileToModule.get(file.path)!;
        
        let currentClass: SymbolDefinition | null = null;
        let currentFunction: SymbolDefinition | null = null;
        let indentStack: Array<{ indent: number; symbol: SymbolDefinition | null }> = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const indent = this.getIndentation(line);
            const trimmed = line.trim();

            if (trimmed === '' || trimmed.startsWith('#')) {
                continue;
            }

            // Update scope based on indentation
            while (indentStack.length > 0 && indentStack[indentStack.length - 1].indent >= indent) {
                const popped = indentStack.pop();
                if (popped) {
                    // Update body end line for the popped symbol
                    if (popped.symbol) {
                        popped.symbol.bodyEndLine = i - 1;
                    }
                }
            }

            // Update current class and function based on stack
            currentClass = null;
            currentFunction = null;
            for (let j = indentStack.length - 1; j >= 0; j--) {
                const stackItem = indentStack[j].symbol;
                if (stackItem) {
                    if (stackItem.kind === 'class' && !currentClass) {
                        currentClass = stackItem;
                    } else if ((stackItem.kind === 'function' || stackItem.kind === 'method') && !currentFunction) {
                        currentFunction = stackItem;
                    }
                }
            }

            // Match class definitions
            const classMatch = /^class\s+(\w+)\s*[:\(]/.exec(trimmed);
            if (classMatch) {
                const className = classMatch[1];
                const column = line.indexOf(className);
                const symbol: SymbolDefinition = {
                    name: className,
                    kind: 'class',
                    module,
                    file: file.path,
                    line: i + 1,
                    column,
                    isAsync: false,
                    bodyStartLine: i + 1,
                    bodyEndLine: lines.length
                };
                
                const id = this.generateSymbolId(symbol);
                this.symbols.set(id, symbol);
                this.addToIndex(symbol);
                
                indentStack.push({ indent, symbol });
                currentClass = symbol;
                continue;
            }

            // Match function/method definitions
            const funcMatch = /^(async\s+)?def\s+(\w+)\s*\(/.exec(trimmed);
            if (funcMatch) {
                const isAsync = !!funcMatch[1];
                const funcName = funcMatch[2];
                const column = line.indexOf(funcName);
                
                const kind = currentClass ? 'method' : 'function';
                const symbol: SymbolDefinition = {
                    name: funcName,
                    kind,
                    module,
                    file: file.path,
                    line: i + 1,
                    column,
                    className: currentClass?.name,
                    enclosingFunction: currentFunction ? this.generateSymbolId(currentFunction) : undefined,
                    isAsync,
                    bodyStartLine: i + 1,
                    bodyEndLine: lines.length
                };
                
                const id = this.generateSymbolId(symbol);
                this.symbols.set(id, symbol);
                this.addToIndex(symbol);
                
                indentStack.push({ indent, symbol });
                continue;
            }
        }

        // Finalize body end lines for remaining symbols
        for (const stackItem of indentStack) {
            if (stackItem.symbol) {
                stackItem.symbol.bodyEndLine = lines.length;
            }
        }
    }

    private extractImports(file: FileDescriptor): void {
        const lines = file.content.split('\n');
        const fileImports: ImportInfo[] = [];

        for (const line of lines) {
            const trimmed = line.trim();
            
            // Skip comments and empty lines
            if (trimmed === '' || trimmed.startsWith('#')) {
                continue;
            }

            // from X import Y, Z
            // from X import Y as Z
            // from .X import Y
            // from ..X import Y
            const fromImportMatch = /^from\s+(\.+[\w.]*|[\w.]+)\s+import\s+(.+)/.exec(trimmed);
            if (fromImportMatch) {
                const moduleName = fromImportMatch[1];
                const importedPart = fromImportMatch[2].split('#')[0].trim(); // Remove inline comments
                
                // Handle parenthesized imports
                let importNames = importedPart;
                if (importedPart.includes('(')) {
                    // Multi-line import - we'll do basic handling
                    importNames = importedPart.replace(/[()]/g, '');
                }

                // Parse imported names
                const items = importNames.split(',').map(item => item.trim()).filter(item => item);
                
                for (const item of items) {
                    if (item === '*') {
                        // Star imports - we'll skip these for now
                        this.warnings.push(`Star import from ${moduleName} in ${file.path} - cannot resolve statically`);
                        continue;
                    }

                    // Handle "as" aliases
                    const parts = item.split(/\s+as\s+/);
                    const originalName = parts[0].trim();
                    const alias = parts.length > 1 ? parts[1].trim() : originalName;

                    const resolvedModule = this.resolveModule(moduleName, file.path);
                    
                    fileImports.push({
                        name: alias,
                        module: resolvedModule,
                        originalName: parts.length > 1 ? originalName : undefined,
                        isRelative: moduleName.startsWith('.')
                    });
                }
                continue;
            }

            // import X
            // import X as Y
            // import X, Y, Z
            const importMatch = /^import\s+(.+)/.exec(trimmed);
            if (importMatch) {
                const importedPart = importMatch[1].split('#')[0].trim();
                const items = importedPart.split(',').map(item => item.trim());
                
                for (const item of items) {
                    const parts = item.split(/\s+as\s+/);
                    const moduleName = parts[0].trim();
                    const alias = parts.length > 1 ? parts[1].trim() : moduleName.split('.').pop()!;

                    const resolvedModule = this.resolveModule(moduleName, file.path);
                    
                    fileImports.push({
                        name: alias,
                        module: resolvedModule,
                        originalName: parts.length > 1 ? moduleName : undefined,
                        isRelative: moduleName.startsWith('.')
                    });
                }
            }
        }

        this.imports.set(file.path, fileImports);
    }

    private resolveModule(moduleName: string, currentFile: string): string {
        // Handle relative imports
        if (moduleName.startsWith('.')) {
            const currentModule = this.fileToModule.get(currentFile)!;
            const currentParts = currentModule.split('.');
            
            // Count leading dots
            let dotCount = 0;
            for (const char of moduleName) {
                if (char === '.') {
                    dotCount++;
                } else {
                    break;
                }
            }
            
            // Get the module name part after dots
            const moduleNamePart = moduleName.substring(dotCount);
            
            // Go up dotCount-1 levels
            const baseParts = currentParts.slice(0, currentParts.length - dotCount);
            
            // Add the module name part
            if (moduleNamePart) {
                baseParts.push(...moduleNamePart.split('.'));
            }
            
            return baseParts.join('.');
        }
        
        // Absolute import
        return moduleName;
    }

    private buildCallGraph(): CallEdge[] {
        const edges: CallEdge[] = [];

        for (const [symbolId, symbol] of this.symbols) {
            // Only analyze function and method bodies
            if (symbol.kind === 'class') {
                continue;
            }

            const file = this.files.get(symbol.file);
            if (!file) {
                continue;
            }

            const lines = file.content.split('\n');
            const bodyLines = lines.slice(symbol.bodyStartLine - 1, symbol.bodyEndLine);
            const bodyContent = bodyLines.join('\n');

            // Get imports for this file
            const fileImports = this.imports.get(symbol.file) || [];

            // Extract decorators
            const decoratorEdges = this.extractDecorators(symbol, lines, fileImports);
            edges.push(...decoratorEdges);

            // Extract function calls from body
            const callEdges = this.extractCalls(symbol, symbolId, bodyContent, fileImports);
            edges.push(...callEdges);
        }

        return edges;
    }

    private extractDecorators(symbol: SymbolDefinition, lines: string[], imports: ImportInfo[]): CallEdge[] {
        const edges: CallEdge[] = [];
        const defLine = symbol.line - 1;

        // Look backwards from the def line to find decorators
        for (let i = defLine - 1; i >= 0; i--) {
            const line = lines[i];
            const trimmed = line.trim();

            if (trimmed === '' || trimmed.startsWith('#')) {
                continue;
            }

            // Check if this is a decorator
            const decoratorMatch = /^@([\w.]+)/.exec(trimmed);
            if (!decoratorMatch) {
                // Not a decorator, stop looking
                break;
            }

            const decoratorName = decoratorMatch[1];
            const parts = decoratorName.split('.');
            const baseName = parts[0];

            // Try to resolve the decorator
            const targetSymbol = this.resolveCallTarget(baseName, symbol.file, symbol.module, imports);
            
            if (targetSymbol) {
                edges.push({
                    from: this.generateSymbolId(symbol),
                    to: this.generateSymbolId(targetSymbol),
                    type: 'decorator',
                    file: symbol.file,
                    line: i + 1,
                    column: line.indexOf(baseName),
                    via: decoratorName
                });
            }
        }

        return edges;
    }

    private extractCalls(
        caller: SymbolDefinition,
        callerId: string,
        bodyContent: string,
        imports: ImportInfo[]
    ): CallEdge[] {
        const edges: CallEdge[] = [];
        const lines = bodyContent.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            if (trimmed === '' || trimmed.startsWith('#')) {
                continue;
            }

            // Match all potential calls in this line
            // Pattern 1: Simple function call: func()
            // Pattern 2: Method call: obj.method()
            // Pattern 3: Class instantiation: MyClass()
            // Pattern 4: Chained calls: obj.attr.method()

            const callPattern = /([\w.]+)\s*\(/g;
            let match;

            while ((match = callPattern.exec(line)) !== null) {
                const fullExpr = match[1];
                const parts = fullExpr.split('.');
                
                // Skip certain built-ins and common methods
                if (this.isBuiltinOrCommonMethod(fullExpr)) {
                    continue;
                }

                // Determine call type and target
                let callType: 'function_call' | 'method_call' | 'constructor_call' = 'function_call';
                let targetName = fullExpr;
                
                if (parts.length > 1) {
                    // This is a method call or chained call
                    callType = 'method_call';
                    targetName = parts[parts.length - 1];
                    
                    // Check if the base is a class (for constructor calls via module.Class())
                    const baseName = parts[0];
                    const target = this.resolveCallTarget(baseName, caller.file, caller.module, imports);
                    if (target && target.kind === 'class') {
                        callType = 'constructor_call';
                        targetName = baseName;
                    }
                } else {
                    // Simple call - could be function or constructor
                    const target = this.resolveCallTarget(targetName, caller.file, caller.module, imports);
                    if (target && target.kind === 'class') {
                        callType = 'constructor_call';
                    }
                }

                // Try to resolve the call target
                const targetSymbol = this.resolveCallTarget(targetName, caller.file, caller.module, imports);
                
                if (targetSymbol) {
                    const lineNumber = caller.bodyStartLine + i;
                    edges.push({
                        from: callerId,
                        to: this.generateSymbolId(targetSymbol),
                        type: callType,
                        file: caller.file,
                        line: lineNumber,
                        column: line.indexOf(fullExpr),
                        via: fullExpr
                    });
                }
            }
        }

        return edges;
    }

    private resolveCallTarget(
        name: string,
        currentFile: string,
        currentModule: string,
        imports: ImportInfo[]
    ): SymbolDefinition | null {
        // 1. Check if it's an imported name
        const importInfo = imports.find(imp => imp.name === name);
        if (importInfo) {
            // Look for symbol in the imported module
            const targetModule = importInfo.module;
            const originalName = importInfo.originalName || name;
            
            const candidates = this.symbolsByModule.get(targetModule) || [];
            for (const candidate of candidates) {
                if (candidate.name === originalName) {
                    return candidate;
                }
            }
            
            // If not found directly, might be in a submodule
            this.warnings.push(`Could not resolve imported symbol '${name}' from module '${targetModule}' in ${currentFile}`);
            return null;
        }

        // 2. Check if it's defined in the same file
        const sameFileSymbols = this.symbolsByModule.get(currentModule) || [];
        for (const symbol of sameFileSymbols) {
            if (symbol.name === name && symbol.file === currentFile) {
                return symbol;
            }
        }

        // 3. Search globally by name (last resort)
        const candidates = this.symbolsByName.get(name);
        if (candidates && candidates.length > 0) {
            // Prefer symbols in the same module
            const sameModule = candidates.find(c => c.module === currentModule);
            if (sameModule) {
                return sameModule;
            }
            
            // If there's only one, return it
            if (candidates.length === 1) {
                return candidates[0];
            }
            
            // Multiple candidates - ambiguous
            this.warnings.push(`Ambiguous call to '${name}' in ${currentFile} - multiple definitions found`);
            return candidates[0]; // Return first one as best guess
        }

        // Not found
        return null;
    }

    private isBuiltinOrCommonMethod(name: string): boolean {
        const builtins = new Set([
            'print', 'len', 'range', 'str', 'int', 'float', 'bool', 'list', 'dict', 'set', 'tuple',
            'abs', 'all', 'any', 'bin', 'chr', 'ord', 'enumerate', 'filter', 'map', 'max', 'min',
            'open', 'round', 'sorted', 'sum', 'zip', 'type', 'isinstance', 'issubclass', 'hasattr',
            'getattr', 'setattr', 'delattr', 'callable', 'dir', 'help', 'id', 'input', 'iter',
            'next', 'repr', 'reversed', 'slice', 'super', 'vars', 'exec', 'eval', 'compile',
            // Common methods
            'append', 'extend', 'insert', 'remove', 'pop', 'clear', 'index', 'count', 'sort',
            'reverse', 'copy', 'get', 'keys', 'values', 'items', 'update', 'join', 'split',
            'strip', 'lstrip', 'rstrip', 'replace', 'find', 'format', 'upper', 'lower', 'capitalize',
            'startswith', 'endswith', 'read', 'write', 'close', 'readline', 'readlines', 'seek',
            // Control flow (shouldn't be matched by pattern but just in case)
            'if', 'for', 'while', 'return', 'yield', 'break', 'continue', 'pass', 'raise', 'assert'
        ]);

        const parts = name.split('.');
        const lastName = parts[parts.length - 1];
        
        return builtins.has(lastName);
    }

    private getIndentation(line: string): number {
        let indent = 0;
        for (const char of line) {
            if (char === ' ') {
                indent++;
            } else if (char === '\t') {
                indent += 4; // Treat tab as 4 spaces
            } else {
                break;
            }
        }
        return indent;
    }

    private generateSymbolId(symbol: SymbolDefinition): string {
        // Create a stable, unique ID
        if (symbol.className) {
            return `${symbol.module}::${symbol.className}.${symbol.name}`;
        }
        return `${symbol.module}::${symbol.name}`;
    }

    private addToIndex(symbol: SymbolDefinition): void {
        // Index by name
        if (!this.symbolsByName.has(symbol.name)) {
            this.symbolsByName.set(symbol.name, []);
        }
        this.symbolsByName.get(symbol.name)!.push(symbol);

        // Index by module
        if (!this.symbolsByModule.has(symbol.module)) {
            this.symbolsByModule.set(symbol.module, []);
        }
        this.symbolsByModule.get(symbol.module)!.push(symbol);
    }

    private symbolsToNodes(): SymbolNode[] {
        const nodes: SymbolNode[] = [];

        for (const [id, symbol] of this.symbols) {
            const node: SymbolNode = {
                id,
                name: symbol.name,
                kind: symbol.kind,
                module: symbol.module,
                file: symbol.file,
                line: symbol.line,
                column: symbol.column
            };

            if (symbol.className) {
                node.class_name = symbol.className;
            }

            if (symbol.enclosingFunction) {
                node.enclosing_function = symbol.enclosingFunction;
            }

            if (symbol.isAsync) {
                node.async = true;
            }

            nodes.push(node);
        }

        return nodes;
    }
}

// Main entry point
export function analyzePythonCallGraph(input: AnalysisInput): CallGraphOutput {
    const analyzer = new PythonCallGraphAnalyzer();
    return analyzer.analyze(input);
}





