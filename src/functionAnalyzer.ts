import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface FunctionNode {
    name: string;
    file: string;
    filePath: string;
    startLine: number;
    type: 'function' | 'class' | 'method';
    calls: string[]; // Names of functions this function calls
    imports: Map<string, string>; // Maps imported name to module path
}

export interface FunctionGraph {
    nodes: FunctionNode[];
    edges: Array<{ 
        source: string; // function key: file::name
        target: string; // function key: file::name
        sourceFile: string;
        targetFile: string;
    }>;
}

export class FunctionAnalyzer {
    private workspaceRoot: string;
    private functions: Map<string, FunctionNode> = new Map();
    private functionsByFile: Map<string, string[]> = new Map();
    private functionsByName: Map<string, FunctionNode[]> = new Map();
    
    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
    }

    async analyzeProject(): Promise<FunctionGraph> {
        this.functions.clear();
        this.functionsByFile.clear();
        this.functionsByName.clear();
        
        const files = await this.getAllFiles();
        
        // First pass: Extract all function definitions
        for (const file of files) {
            await this.extractFunctions(file);
        }

        // Build index of function names
        for (const [key, func] of this.functions) {
            if (!this.functionsByName.has(func.name)) {
                this.functionsByName.set(func.name, []);
            }
            this.functionsByName.get(func.name)!.push(func);
        }

        // Second pass: Build function call edges
        const edges = this.buildFunctionCallGraph();

        // Convert imports Map to plain object for serialization
        const nodes = Array.from(this.functions.values()).map(node => ({
            ...node,
            imports: Object.fromEntries(node.imports) as any
        }));
        
        return { nodes, edges };
    }

    private async getAllFiles(): Promise<string[]> {
        const files: string[] = [];
        const excludePatterns = [
            '**/node_modules/**',
            '**/dist/**',
            '**/out/**',
            '**/build/**',
            '**/.git/**',
            '**/vendor/**',
            '**/venv/**',
            '**/__pycache__/**',
            '**/.*',
        ];

        const filePatterns = [
            '**/*.ts',
            '**/*.js',
            '**/*.tsx',
            '**/*.jsx',
            '**/*.py',
        ];

        for (const pattern of filePatterns) {
            const foundFiles = await vscode.workspace.findFiles(
                pattern,
                `{${excludePatterns.join(',')}}`
            );
            files.push(...foundFiles.map(uri => uri.fsPath));
        }

        return files;
    }

    private async extractFunctions(filePath: string): Promise<void> {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const ext = path.extname(filePath);
            const relativePath = path.relative(this.workspaceRoot, filePath);
            const fileName = path.basename(filePath);

            // Extract imports
            const imports = this.extractImports(content, ext, relativePath);

            let extractedFunctions: FunctionNode[] = [];

            switch (ext) {
                case '.ts':
                case '.tsx':
                case '.js':
                case '.jsx':
                    extractedFunctions = this.extractJavaScriptFunctions(content, fileName, relativePath, imports);
                    break;
                case '.py':
                    extractedFunctions = this.extractPythonFunctions(content, fileName, relativePath, imports);
                    break;
            }

            // Store functions
            const functionNames: string[] = [];
            for (const func of extractedFunctions) {
                const uniqueKey = `${relativePath}::${func.name}`;
                this.functions.set(uniqueKey, func);
                functionNames.push(func.name);
            }
            
            this.functionsByFile.set(relativePath, functionNames);
        } catch (error) {
            console.error(`Error extracting functions from ${filePath}:`, error);
        }
    }

    private extractImports(content: string, ext: string, currentFile: string): Map<string, string> {
        const imports = new Map<string, string>();

        switch (ext) {
            case '.ts':
            case '.tsx':
            case '.js':
            case '.jsx':
                // import { func1, func2 } from './module'
                const namedImportRegex = /import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]([^'"]+)['"]/g;
                let match;
                while ((match = namedImportRegex.exec(content)) !== null) {
                    const names = match[1].split(',').map(n => n.trim().split(/\s+as\s+/).pop()!.trim());
                    const modulePath = this.resolveModulePath(match[2], currentFile);
                    names.forEach(name => imports.set(name, modulePath));
                }
                
                // import defaultFunc from './module'
                const defaultImportRegex = /import\s+(\w+)\s+from\s*['"]([^'"]+)['"]/g;
                while ((match = defaultImportRegex.exec(content)) !== null) {
                    const modulePath = this.resolveModulePath(match[2], currentFile);
                    imports.set(match[1], modulePath);
                }
                break;

            case '.py':
                // from .module import func1, func2 (relative import with .)
                // from ..module import func1, func2 (relative import with ..)
                // from module import func1, func2 (absolute import)
                const pyFromImportRegex = /from\s+(\.+[\w.]*|[\w.]+)\s+import\s+([^\n#]+)/g;
                while ((match = pyFromImportRegex.exec(content)) !== null) {
                    const moduleName = match[1];
                    const importedItems = match[2].replace(/\([^)]*\)/g, '').trim();
                    const importedNames = importedItems.split(',').map(n => {
                        const parts = n.trim().split(/\s+as\s+/);
                        return parts[parts.length - 1].trim();
                    }).filter(n => n && n !== '*' && n !== '(' && n !== ')');
                    
                    const modulePath = this.resolvePythonModule(moduleName, currentFile);
                    importedNames.forEach(name => {
                        imports.set(name, modulePath);
                    });
                }
                
                // import module or import module as alias
                const pyImportRegex = /^import\s+(\.+[\w.]*|[\w.]+)(?:\s+as\s+(\w+))?/gm;
                while ((match = pyImportRegex.exec(content)) !== null) {
                    const moduleName = match[1];
                    const alias = match[2] || moduleName.split('.').pop()!;
                    const modulePath = this.resolvePythonModule(moduleName, currentFile);
                    imports.set(alias, modulePath);
                }
                break;
        }

        return imports;
    }

    private resolveModulePath(importPath: string, currentFile: string): string {
        if (importPath.startsWith('.')) {
            // Relative import - resolve relative to current file
            const currentDir = path.dirname(currentFile);
            return path.normalize(path.join(currentDir, importPath)).replace(/\\/g, '/');
        }
        // Absolute import from project root
        return importPath.replace(/\\/g, '/');
    }

    private resolvePythonModule(moduleName: string, currentFile: string): string {
        // Handle relative imports (. and ..)
        if (moduleName.startsWith('.')) {
            const currentDir = path.dirname(currentFile);
            
            // Count the dots to determine how many levels to go up
            let dotCount = 0;
            for (const char of moduleName) {
                if (char === '.') {
                    dotCount++;
                } else {
                    break;
                }
            }
            
            // Remove the dots to get the module name part
            const moduleNamePart = moduleName.substring(dotCount);
            
            // Start from current directory and go up (dotCount - 1) times
            let resolvedDir = currentDir;
            for (let i = 1; i < dotCount; i++) {
                resolvedDir = path.dirname(resolvedDir);
            }
            
            // If there's a module name part, append it
            if (moduleNamePart) {
                const modulePath = moduleNamePart.replace(/\./g, '/');
                return path.join(resolvedDir, modulePath).replace(/\\/g, '/');
            } else {
                // Just '.' or '..' without module name - refers to the package itself
                return resolvedDir.replace(/\\/g, '/');
            }
        }
        
        // Absolute import from project root
        const modulePath = moduleName.replace(/\./g, '/');
        return modulePath;
    }

    private extractJavaScriptFunctions(content: string, fileName: string, filePath: string, imports: Map<string, string>): FunctionNode[] {
        const functions: FunctionNode[] = [];

        // Regular function declarations
        const funcRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g;
        let match;
        while ((match = funcRegex.exec(content)) !== null) {
            const lineNumber = content.substring(0, match.index).split('\n').length;
            const funcBody = this.extractFunctionBody(content, match.index);
            functions.push({
                name: match[1],
                file: fileName,
                filePath: filePath,
                startLine: lineNumber,
                type: 'function',
                calls: this.extractFunctionCalls(funcBody),
                imports: new Map(imports)
            });
        }

        // Arrow functions
        const arrowRegex = /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g;
        while ((match = arrowRegex.exec(content)) !== null) {
            const lineNumber = content.substring(0, match.index).split('\n').length;
            const funcBody = this.extractFunctionBody(content, match.index);
            functions.push({
                name: match[1],
                file: fileName,
                filePath: filePath,
                startLine: lineNumber,
                type: 'function',
                calls: this.extractFunctionCalls(funcBody),
                imports: new Map(imports)
            });
        }

        return functions;
    }

    private extractPythonFunctions(content: string, fileName: string, filePath: string, imports: Map<string, string>): FunctionNode[] {
        const functions: FunctionNode[] = [];
        
        // Python function definitions
        const funcRegex = /^[ \t]*def\s+(\w+)\s*\(/gm;
        let match;
        while ((match = funcRegex.exec(content)) !== null) {
            const lineNumber = content.substring(0, match.index).split('\n').length;
            const funcBody = this.extractPythonFunctionBody(content, match.index);
            functions.push({
                name: match[1],
                file: fileName,
                filePath: filePath,
                startLine: lineNumber,
                type: 'function',
                calls: this.extractFunctionCalls(funcBody),
                imports: new Map(imports)
            });
        }

        return functions;
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

    private extractPythonFunctionBody(content: string, startIndex: number): string {
        const lines = content.substring(startIndex).split('\n');
        const defLine = lines[0];
        const defIndent = defLine.search(/\S/);
        
        let bodyLines = [defLine];
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            const lineIndent = line.search(/\S/);
            
            if (line.trim() === '') {
                bodyLines.push(line);
                continue;
            }
            
            if (lineIndent <= defIndent) {
                break;
            }
            
            bodyLines.push(line);
        }
        
        return bodyLines.join('\n');
    }

    private extractFunctionCalls(functionBody: string): string[] {
        const calls: string[] = [];
        
        // Match simple function calls: functionName(
        const simpleFuncCallRegex = /(\w+)\s*\(/g;
        let match;
        while ((match = simpleFuncCallRegex.exec(functionBody)) !== null) {
            const funcName = match[1];
            calls.push(funcName);
        }
        
        // Match method calls: object.method(
        const methodCallRegex = /\.(\w+)\s*\(/g;
        while ((match = methodCallRegex.exec(functionBody)) !== null) {
            const methodName = match[1];
            calls.push(methodName);
        }
        
        return [...new Set(calls)]; // Remove duplicates
    }

    private buildFunctionCallGraph(): Array<{ source: string; target: string; sourceFile: string; targetFile: string }> {
        const edges: Array<{ source: string; target: string; sourceFile: string; targetFile: string }> = [];
        const debugLog: string[] = [];

        for (const [funcKey, func] of this.functions) {
            for (const calledFuncName of func.calls) {
                // Filter out common built-ins and keywords
                const builtins = [
                    'if', 'for', 'while', 'switch', 'catch', 'return', 'print', 'console', 
                    'typeof', 'instanceof', 'new', 'await', 'async', 'yield', 'throw',
                    'len', 'range', 'str', 'int', 'float', 'bool', 'list', 'dict', 'set',
                    'tuple', 'super', 'self', 'isinstance', 'hasattr', 'getattr', 'setattr',
                    'min', 'max', 'abs', 'sum', 'map', 'filter', 'zip', 'enumerate',
                    'open', 'round', 'sorted', 'reversed', 'all', 'any', 'ord', 'chr',
                    'join', 'split', 'append', 'extend', 'insert', 'remove', 'pop',
                    'get', 'keys', 'values', 'items', 'update', 'clear', 'copy'
                ];
                
                if (builtins.includes(calledFuncName)) {
                    continue;
                }
                
                let targetFunc: FunctionNode | null = null;

                // 1. Check if this is an imported function
                if (func.imports.has(calledFuncName)) {
                    const importModule = func.imports.get(calledFuncName)!;
                    targetFunc = this.findFunctionInModule(calledFuncName, importModule);
                    
                    if (targetFunc) {
                        debugLog.push(`✓ Found imported: ${func.name} -> ${calledFuncName} (from ${importModule})`);
                    } else {
                        debugLog.push(`✗ Import not found: ${func.name} -> ${calledFuncName} (looking in ${importModule})`);
                    }
                }
                
                // 2. Check if it's in the same file
                if (!targetFunc) {
                    const sameFileKey = `${func.filePath}::${calledFuncName}`;
                    if (this.functions.has(sameFileKey)) {
                        targetFunc = this.functions.get(sameFileKey)!;
                        debugLog.push(`✓ Found in same file: ${func.name} -> ${calledFuncName}`);
                    }
                }
                
                // 3. Search globally by name (last resort)
                if (!targetFunc) {
                    const matches = this.functionsByName.get(calledFuncName);
                    if (matches && matches.length > 0) {
                        // Prefer functions in related directories
                        const funcDir = path.dirname(func.filePath);
                        const related = matches.find(m => path.dirname(m.filePath) === funcDir);
                        targetFunc = related || matches[0];
                        debugLog.push(`✓ Found globally: ${func.name} -> ${calledFuncName} (in ${targetFunc.filePath})`);
                    }
                }

                if (targetFunc) {
                    edges.push({
                        source: funcKey,
                        target: `${targetFunc.filePath}::${targetFunc.name}`,
                        sourceFile: func.filePath,
                        targetFile: targetFunc.filePath
                    });
                }
            }
        }

        // Log debugging information
        console.log('=== Function Call Graph Debug ===');
        console.log(`Total functions: ${this.functions.size}`);
        console.log(`Total edges: ${edges.length}`);
        console.log('\nConnection attempts:');
        debugLog.forEach(log => console.log(log));

        return edges;
    }

    private findFunctionInModule(funcName: string, modulePath: string): FunctionNode | null {
        // Normalize the path
        modulePath = modulePath.replace(/\\/g, '/');
        
        // Try different variations of the module path
        const variations = [
            modulePath + '.py',
            modulePath + '.ts',
            modulePath + '.tsx',
            modulePath + '.js',
            modulePath + '.jsx',
            modulePath + '/__init__.py',
            modulePath + '/index.ts',
            modulePath + '/index.js',
        ];

        // First, try exact matches
        for (const variation of variations) {
            const key = `${variation}::${funcName}`;
            if (this.functions.has(key)) {
                return this.functions.get(key)!;
            }
        }

        // For Python packages, if we're looking at __init__.py, 
        // the function might be in a sibling module that's imported
        // Check sibling modules in the same directory
        const lastSlash = modulePath.lastIndexOf('/');
        if (lastSlash !== -1) {
            const parentDir = modulePath.substring(0, lastSlash);
            
            // Look for the function in any file in the parent directory
            for (const [key, func] of this.functions) {
                if (func.name === funcName) {
                    const funcDir = path.dirname(func.filePath).replace(/\\/g, '/');
                    if (funcDir === parentDir) {
                        return func;
                    }
                }
            }
        }

        // Search all functions with this name and pick the most relevant one
        const matches = this.functionsByName.get(funcName);
        if (matches && matches.length > 0) {
            // Look for one in the module path
            for (const match of matches) {
                const matchPath = match.filePath.replace(/\\/g, '/');
                if (matchPath.includes(modulePath) || modulePath.includes(matchPath.replace('.py', ''))) {
                    return match;
                }
            }
            
            // If no exact match, return the first one (fallback)
            // This handles cases where functions are defined elsewhere but imported
            return matches[0];
        }

        return null;
    }
}
