import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface FileNode {
    path: string;
    name: string;
    type: string;
    imports: string[];
    exports: string[];
}

export interface ProjectGraph {
    nodes: FileNode[];
    edges: Array<{ source: string; target: string; type: string }>;
}

export class FileAnalyzer {
    private workspaceRoot: string;
    private fileNodes: Map<string, FileNode> = new Map();
    
    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
    }

    async analyzeProject(): Promise<ProjectGraph> {
        this.fileNodes.clear();
        
        const files = await this.getAllFiles();
        
        // Analyze each file
        for (const file of files) {
            await this.analyzeFile(file);
        }

        // Build graph structure
        const nodes = Array.from(this.fileNodes.values());
        const edges = this.buildEdges();

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
            '**/*.java',
            '**/*.go',
            '**/*.rs',
            '**/*.cpp',
            '**/*.c',
            '**/*.h',
            '**/*.hpp',
            '**/*.cs',
            '**/*.php',
            '**/*.rb',
            '**/*.swift',
            '**/*.kt',
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

    private async analyzeFile(filePath: string): Promise<void> {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const ext = path.extname(filePath);
            const relativePath = path.relative(this.workspaceRoot, filePath);
            
            const imports = this.extractImports(content, ext);
            const exports = this.extractExports(content, ext);

            const node: FileNode = {
                path: relativePath,
                name: path.basename(filePath),
                type: this.getFileType(ext),
                imports,
                exports,
            };

            this.fileNodes.set(relativePath, node);
        } catch (error) {
            console.error(`Error analyzing file ${filePath}:`, error);
        }
    }

    private extractImports(content: string, ext: string): string[] {
        const imports: string[] = [];

        switch (ext) {
            case '.ts':
            case '.tsx':
            case '.js':
            case '.jsx':
                imports.push(...this.extractJavaScriptImports(content));
                break;
            case '.py':
                imports.push(...this.extractPythonImports(content));
                break;
            case '.java':
                imports.push(...this.extractJavaImports(content));
                break;
            case '.go':
                imports.push(...this.extractGoImports(content));
                break;
            case '.rs':
                imports.push(...this.extractRustImports(content));
                break;
            case '.cs':
                imports.push(...this.extractCSharpImports(content));
                break;
            case '.php':
                imports.push(...this.extractPHPImports(content));
                break;
            case '.rb':
                imports.push(...this.extractRubyImports(content));
                break;
        }

        return imports;
    }

    private extractJavaScriptImports(content: string): string[] {
        const imports: string[] = [];
        
        // ES6 imports: import ... from '...'
        const es6ImportRegex = /import\s+(?:[\w\s{},*]*\s+from\s+)?['"]([^'"]+)['"]/g;
        let match;
        while ((match = es6ImportRegex.exec(content)) !== null) {
            imports.push(match[1]);
        }
        
        // CommonJS require: require('...')
        const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
        while ((match = requireRegex.exec(content)) !== null) {
            imports.push(match[1]);
        }
        
        // Dynamic imports: import('...')
        const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
        while ((match = dynamicImportRegex.exec(content)) !== null) {
            imports.push(match[1]);
        }

        return imports.filter(imp => this.isLocalImport(imp));
    }

    private extractPythonImports(content: string): string[] {
        const imports: string[] = [];
        
        // from ... import ...
        const fromImportRegex = /from\s+([\w.]+)\s+import/g;
        let match;
        while ((match = fromImportRegex.exec(content)) !== null) {
            imports.push(match[1]);
        }
        
        // import ...
        const importRegex = /^import\s+([\w.]+)/gm;
        while ((match = importRegex.exec(content)) !== null) {
            imports.push(match[1]);
        }

        return imports.filter(imp => this.isLocalImport(imp));
    }

    private extractJavaImports(content: string): string[] {
        const imports: string[] = [];
        const importRegex = /import\s+([\w.]+);/g;
        let match;
        while ((match = importRegex.exec(content)) !== null) {
            imports.push(match[1]);
        }
        return imports;
    }

    private extractGoImports(content: string): string[] {
        const imports: string[] = [];
        
        // Single import
        const singleImportRegex = /import\s+"([^"]+)"/g;
        let match;
        while ((match = singleImportRegex.exec(content)) !== null) {
            imports.push(match[1]);
        }
        
        // Multi-line imports
        const multiImportRegex = /import\s+\(([\s\S]*?)\)/g;
        while ((match = multiImportRegex.exec(content)) !== null) {
            const lines = match[1].split('\n');
            for (const line of lines) {
                const lineMatch = /"([^"]+)"/.exec(line);
                if (lineMatch) {
                    imports.push(lineMatch[1]);
                }
            }
        }

        return imports.filter(imp => this.isLocalImport(imp));
    }

    private extractRustImports(content: string): string[] {
        const imports: string[] = [];
        const useRegex = /use\s+([\w:]+)/g;
        let match;
        while ((match = useRegex.exec(content)) !== null) {
            imports.push(match[1]);
        }
        return imports;
    }

    private extractCSharpImports(content: string): string[] {
        const imports: string[] = [];
        const usingRegex = /using\s+([\w.]+);/g;
        let match;
        while ((match = usingRegex.exec(content)) !== null) {
            imports.push(match[1]);
        }
        return imports;
    }

    private extractPHPImports(content: string): string[] {
        const imports: string[] = [];
        
        // require/include statements
        const requireRegex = /(?:require|include)(?:_once)?\s*\(?['"]([^'"]+)['"]\)?/g;
        let match;
        while ((match = requireRegex.exec(content)) !== null) {
            imports.push(match[1]);
        }
        
        // use statements
        const useRegex = /use\s+([\w\\]+)/g;
        while ((match = useRegex.exec(content)) !== null) {
            imports.push(match[1]);
        }

        return imports;
    }

    private extractRubyImports(content: string): string[] {
        const imports: string[] = [];
        const requireRegex = /require\s+['"]([^'"]+)['"]/g;
        let match;
        while ((match = requireRegex.exec(content)) !== null) {
            imports.push(match[1]);
        }
        return imports.filter(imp => this.isLocalImport(imp));
    }

    private extractExports(content: string, ext: string): string[] {
        const exports: string[] = [];

        switch (ext) {
            case '.ts':
            case '.tsx':
            case '.js':
            case '.jsx':
                // export function/class/const/let/var
                const exportRegex = /export\s+(?:default\s+)?(?:function|class|const|let|var)\s+([\w]+)/g;
                let match;
                while ((match = exportRegex.exec(content)) !== null) {
                    exports.push(match[1]);
                }
                
                // export { ... }
                const exportBraceRegex = /export\s*{\s*([^}]+)\s*}/g;
                while ((match = exportBraceRegex.exec(content)) !== null) {
                    const names = match[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0].trim());
                    exports.push(...names);
                }
                break;
        }

        return exports;
    }

    private isLocalImport(importPath: string): boolean {
        // Check if it's a relative import (starts with . or ..)
        if (importPath.startsWith('.') || importPath.startsWith('..')) {
            return true;
        }
        
        // For Python, check if it doesn't start with common package names
        // For JS/TS, we already filtered relative imports
        // For other languages, we consider non-package imports as local
        
        return false;
    }

    private getFileType(ext: string): string {
        const typeMap: { [key: string]: string } = {
            '.ts': 'TypeScript',
            '.tsx': 'TypeScript React',
            '.js': 'JavaScript',
            '.jsx': 'JavaScript React',
            '.py': 'Python',
            '.java': 'Java',
            '.go': 'Go',
            '.rs': 'Rust',
            '.cpp': 'C++',
            '.c': 'C',
            '.h': 'C Header',
            '.hpp': 'C++ Header',
            '.cs': 'C#',
            '.php': 'PHP',
            '.rb': 'Ruby',
            '.swift': 'Swift',
            '.kt': 'Kotlin',
        };
        return typeMap[ext] || 'Unknown';
    }

    private buildEdges(): Array<{ source: string; target: string; type: string }> {
        const edges: Array<{ source: string; target: string; type: string }> = [];

        for (const [sourcePath, node] of this.fileNodes) {
            for (const importPath of node.imports) {
                const targetPath = this.resolveImportPath(sourcePath, importPath);
                
                if (targetPath && this.fileNodes.has(targetPath)) {
                    edges.push({
                        source: sourcePath,
                        target: targetPath,
                        type: 'import',
                    });
                }
            }
        }

        return edges;
    }

    private resolveImportPath(sourcePath: string, importPath: string): string | null {
        // If it's a relative import
        if (importPath.startsWith('.')) {
            const sourceDir = path.dirname(sourcePath);
            let resolvedPath = path.join(sourceDir, importPath);
            
            // Try different extensions
            const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rs'];
            for (const ext of extensions) {
                const testPath = resolvedPath + ext;
                if (this.fileNodes.has(testPath)) {
                    return testPath;
                }
                // Check for index files
                const indexPath = path.join(resolvedPath, 'index' + ext);
                if (this.fileNodes.has(indexPath)) {
                    return indexPath;
                }
            }
        }

        return null;
    }
}

