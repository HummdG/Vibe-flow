/**
 * Static graph builder - constructs the call graph from analyzed files
 */

import {
    SymbolNode,
    CallEdge,
    FileSummary,
    FileInput,
    Language,
    CodeFlowAnalysisResult
} from '../types';
import { IdGenerator } from '../utils/idGenerator';
import { PathResolver } from '../utils/pathResolver';
import { detectLanguage } from '../utils/languageDetector';
import { AnalyzerFactory } from '../analyzers/AnalyzerFactory';
import { AnalysisContext } from '../analyzers/BaseLanguageAnalyzer';

export class StaticGraphBuilder {
    private idGenerator: IdGenerator;
    private pathResolver: PathResolver;
    private symbolMap: Map<string, SymbolNode>;
    private symbolsByName: Map<string, SymbolNode[]>;
    private symbolsByFile: Map<string, SymbolNode[]>;
    private fileImports: Map<string, Map<string, string>>;
    private fileExports: Map<string, Set<string>>;
    private warnings: string[];

    constructor(workspaceRoot: string = '') {
        this.idGenerator = new IdGenerator();
        this.pathResolver = new PathResolver(workspaceRoot);
        this.symbolMap = new Map();
        this.symbolsByName = new Map();
        this.symbolsByFile = new Map();
        this.fileImports = new Map();
        this.fileExports = new Map();
        this.warnings = [];
    }

    /**
     * Build static call graph from files
     */
    async buildGraph(files: FileInput[]): Promise<{
        nodes: SymbolNode[];
        edges: CallEdge[];
        files: FileSummary[];
        warnings: string[];
    }> {
        // Reset state
        this.reset();

        // Phase 1: Register all files
        for (const file of files) {
            this.pathResolver.registerFile(file.path);
        }

        // Phase 2: Analyze each file
        const unresolvedEdges: Array<{
            edge: CallEdge;
            imports: Map<string, string>;
        }> = [];

        for (const file of files) {
            const result = await this.analyzeFile(file);
            
            // Store symbols
            result.symbols.forEach(symbol => {
                this.symbolMap.set(symbol.id, symbol);
                
                // Index by name
                if (!this.symbolsByName.has(symbol.name)) {
                    this.symbolsByName.set(symbol.name, []);
                }
                this.symbolsByName.get(symbol.name)!.push(symbol);
                
                // Index by file
                if (!this.symbolsByFile.has(symbol.file)) {
                    this.symbolsByFile.set(symbol.file, []);
                }
                this.symbolsByFile.get(symbol.file)!.push(symbol);
            });

            // Store imports and exports
            this.fileImports.set(file.path, result.imports);
            this.fileExports.set(file.path, result.exports as Set<string>);

            // Store unresolved edges for later resolution
            result.edges.forEach(edge => {
                unresolvedEdges.push({ edge, imports: result.imports });
            });
        }

        // Phase 3: Resolve call edges
        const resolvedEdges = this.resolveEdges(unresolvedEdges);

        // Phase 4: Build file summaries
        const fileSummaries = this.buildFileSummaries(files, resolvedEdges);

        return {
            nodes: Array.from(this.symbolMap.values()),
            edges: resolvedEdges,
            files: fileSummaries,
            warnings: this.warnings
        };
    }

    /**
     * Analyze a single file
     */
    private async analyzeFile(file: FileInput) {
        const language = this.detectLanguage(file);
        const analyzer = AnalyzerFactory.getAnalyzer(language);

        const context: AnalysisContext = {
            file: file.path,
            content: file.content,
            language,
            idGenerator: this.idGenerator,
            workspaceRoot: this.pathResolver['workspaceRoot']
        };

        try {
            return analyzer.analyze(context);
        } catch (error) {
            this.warnings.push(`Error analyzing ${file.path}: ${error}`);
            return {
                symbols: [],
                edges: [],
                imports: new Map(),
                exports: new Set()
            };
        }
    }

    /**
     * Resolve call edges from temporary names to actual symbol IDs
     */
    private resolveEdges(unresolvedEdges: Array<{
        edge: CallEdge;
        imports: Map<string, string>;
    }>): CallEdge[] {
        const resolved: CallEdge[] = [];

        for (const { edge, imports } of unresolvedEdges) {
            const callerSymbol = this.symbolMap.get(edge.from);
            if (!callerSymbol) {
                continue; // Skip if caller not found
            }

            // Try to resolve the target
            const targetId = this.resolveTarget(edge.to, callerSymbol, imports);
            
            if (targetId) {
                resolved.push({
                    ...edge,
                    to: targetId
                });
            }
        }

        return resolved;
    }

    /**
     * Resolve a target function/method name to its symbol ID
     */
    private resolveTarget(
        targetName: string,
        callerSymbol: SymbolNode,
        imports: Map<string, string>
    ): string | null {
        // Strategy 1: Check if it's an imported symbol
        if (imports.has(targetName)) {
            const modulePath = imports.get(targetName)!;
            const resolvedPath = this.resolveModulePath(modulePath, callerSymbol.file, callerSymbol.language);
            
            if (resolvedPath) {
                // Look for the symbol in that file
                const symbolsInFile = this.symbolsByFile.get(resolvedPath) || [];
                const match = symbolsInFile.find(s => s.name === targetName);
                if (match) {
                    return match.id;
                }
            }
        }

        // Strategy 2: Check in the same file
        const sameFileSymbols = this.symbolsByFile.get(callerSymbol.file) || [];
        const sameFileMatch = sameFileSymbols.find(s => s.name === targetName);
        if (sameFileMatch) {
            return sameFileMatch.id;
        }

        // Strategy 3: Check in parent class (for methods)
        if (callerSymbol.parent_symbol) {
            const parentSymbol = this.symbolMap.get(callerSymbol.parent_symbol);
            if (parentSymbol) {
                // Look for methods in the same parent
                const siblingMethods = Array.from(this.symbolMap.values()).filter(
                    s => s.parent_symbol === callerSymbol.parent_symbol && s.name === targetName
                );
                if (siblingMethods.length > 0) {
                    return siblingMethods[0].id;
                }
            }
        }

        // Strategy 4: Global search by name (prefer same directory)
        const candidates = this.symbolsByName.get(targetName) || [];
        if (candidates.length > 0) {
            // Prefer symbols in the same directory
            const callerDir = callerSymbol.file.substring(0, callerSymbol.file.lastIndexOf('/'));
            const sameDir = candidates.find(c => c.file.startsWith(callerDir));
            if (sameDir) {
                return sameDir.id;
            }
            
            // Otherwise, return first match
            return candidates[0].id;
        }

        return null;
    }

    /**
     * Resolve a module path to an actual file path
     */
    private resolveModulePath(modulePath: string, currentFile: string, language: Language): string | null {
        switch (language) {
            case 'JavaScript':
            case 'TypeScript':
            case 'TypeScript React':
                return this.pathResolver.resolveJavaScriptImport(modulePath, currentFile);
            case 'Python':
                return this.pathResolver.resolvePythonImport(modulePath, currentFile);
            case 'Java':
                return this.pathResolver.resolveJavaImport(modulePath);
            case 'Go':
                return this.pathResolver.resolveGoImport(modulePath);
            case 'Rust':
                return this.pathResolver.resolveRustImport(modulePath, currentFile);
            case 'C#':
                return this.pathResolver.resolveCSharpImport(modulePath);
            case 'PHP':
                return this.pathResolver.resolvePHPImport(modulePath, currentFile);
            default:
                return null;
        }
    }

    /**
     * Build file summaries
     */
    private buildFileSummaries(files: FileInput[], edges: CallEdge[]): FileSummary[] {
        const summaries: FileSummary[] = [];

        for (const file of files) {
            const language = this.detectLanguage(file);
            const symbols = this.symbolsByFile.get(file.path) || [];
            const defines = symbols.map(s => s.id);

            // Find files this file calls out to
            const callsOutTo = new Set<string>();
            edges.forEach(edge => {
                const fromSymbol = this.symbolMap.get(edge.from);
                const toSymbol = this.symbolMap.get(edge.to);
                
                if (fromSymbol && toSymbol && fromSymbol.file === file.path && toSymbol.file !== file.path) {
                    callsOutTo.add(toSymbol.file);
                }
            });

            summaries.push({
                path: file.path,
                language,
                defines,
                reads_from_files: [], // Would need more sophisticated analysis
                writes_to_files: [], // Would need more sophisticated analysis
                calls_out_to_files: Array.from(callsOutTo)
            });
        }

        return summaries;
    }

    /**
     * Detect language from file
     */
    private detectLanguage(file: FileInput): Language {
        // Use provided language if available
        if (file.language) {
            return file.language as Language;
        }
        
        // Otherwise detect from filename and content
        return detectLanguage(file.path, file.content);
    }

    /**
     * Reset internal state
     */
    private reset(): void {
        this.idGenerator.reset();
        this.symbolMap.clear();
        this.symbolsByName.clear();
        this.symbolsByFile.clear();
        this.fileImports.clear();
        this.fileExports.clear();
        this.warnings = [];
    }
}

