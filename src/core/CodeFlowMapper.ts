/**
 * Main CodeFlowMapper orchestrator
 * 
 * This is the main entry point that coordinates all analysis modes
 */

import {
    AnalysisInput,
    CodeFlowAnalysisResult,
    SymbolNode,
    CallEdge,
    Summary
} from '../types';
import { StaticGraphBuilder } from './StaticGraphBuilder';
import { ChangeDiffAnalyzer } from './ChangeDiffAnalyzer';
import { RuntimeTraceMapper } from './RuntimeTraceMapper';

export class CodeFlowMapper {
    private workspaceRoot: string;

    constructor(workspaceRoot: string = '') {
        this.workspaceRoot = workspaceRoot;
    }

    /**
     * Main analysis entry point
     */
    async analyze(input: AnalysisInput): Promise<CodeFlowAnalysisResult> {
        try {
            switch (input.mode) {
                case 'static':
                    return await this.analyzeStatic(input);
                
                case 'change_diff':
                    return await this.analyzeChangeDiff(input);
                
                case 'runtime':
                    return await this.analyzeRuntime(input);
                
                default:
                    return this.createErrorResult(`Unknown mode: ${input.mode}`);
            }
        } catch (error) {
            return this.createErrorResult(`Analysis failed: ${error}`);
        }
    }

    /**
     * Static analysis mode
     */
    private async analyzeStatic(input: AnalysisInput): Promise<CodeFlowAnalysisResult> {
        const builder = new StaticGraphBuilder(this.workspaceRoot);
        const result = await builder.buildGraph(input.files);

        const summary = this.generateStaticSummary(result.nodes, result.edges, result.files);

        return {
            nodes: result.nodes,
            edges: result.edges,
            files: result.files,
            diff: null,
            execution: null,
            summary,
            warnings: result.warnings
        };
    }

    /**
     * Change diff analysis mode
     */
    private async analyzeChangeDiff(input: AnalysisInput): Promise<CodeFlowAnalysisResult> {
        if (!input.prev_files || input.prev_files.length === 0) {
            return this.createErrorResult('change_diff mode requires prev_files');
        }

        const diffAnalyzer = new ChangeDiffAnalyzer(this.workspaceRoot);
        const diffResult = await diffAnalyzer.analyzeDiff(input.prev_files, input.files);

        // Build file summaries from current version
        const builder = new StaticGraphBuilder(this.workspaceRoot);
        const currentResult = await builder.buildGraph(input.files);

        const summary = this.generateDiffSummary(
            diffResult.currentGraph.nodes,
            diffResult.currentGraph.edges,
            diffResult.diff
        );

        return {
            nodes: diffResult.currentGraph.nodes,
            edges: diffResult.currentGraph.edges,
            files: currentResult.files,
            diff: diffResult.diff,
            execution: null,
            summary,
            warnings: currentResult.warnings
        };
    }

    /**
     * Runtime trace analysis mode
     */
    private async analyzeRuntime(input: AnalysisInput): Promise<CodeFlowAnalysisResult> {
        if (!input.trace_events || input.trace_events.length === 0) {
            return this.createErrorResult('runtime mode requires trace_events');
        }

        // First build static graph
        const builder = new StaticGraphBuilder(this.workspaceRoot);
        const staticResult = await builder.buildGraph(input.files);

        // Map trace onto graph
        const traceMapper = new RuntimeTraceMapper(staticResult.nodes);
        const execution = traceMapper.mapTrace(input.trace_events, staticResult.edges);

        const summary = this.generateRuntimeSummary(
            staticResult.nodes,
            staticResult.edges,
            execution,
            input.trace_events,
            traceMapper
        );

        return {
            nodes: staticResult.nodes,
            edges: staticResult.edges,
            files: staticResult.files,
            diff: null,
            execution,
            summary,
            warnings: staticResult.warnings
        };
    }

    /**
     * Generate summary for static analysis
     */
    private generateStaticSummary(
        nodes: SymbolNode[],
        edges: CallEdge[],
        files: any[]
    ): Summary {
        const functionCount = nodes.filter(n => n.kind === 'function').length;
        const classCount = nodes.filter(n => n.kind === 'class').length;
        const methodCount = nodes.filter(n => n.kind === 'method').length;

        const languages = new Set(nodes.map(n => n.language));
        const languageList = Array.from(languages).join(', ');

        const overview = `Analyzed ${files.length} file(s) across ${languages.size} language(s) (${languageList}). ` +
            `Found ${functionCount} function(s), ${classCount} class(es), ${methodCount} method(s), ` +
            `and ${edges.length} call relationship(s).`;

        // Find notable files (most connections)
        const fileConnectionCount = new Map<string, number>();
        edges.forEach(edge => {
            const fromNode = nodes.find(n => n.id === edge.from);
            if (fromNode) {
                fileConnectionCount.set(
                    fromNode.file,
                    (fileConnectionCount.get(fromNode.file) || 0) + 1
                );
            }
        });

        const notableFiles = Array.from(fileConnectionCount.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([file]) => file);

        // Find notable symbols (most called)
        const symbolCallCount = new Map<string, number>();
        edges.forEach(edge => {
            symbolCallCount.set(edge.to, (symbolCallCount.get(edge.to) || 0) + 1);
        });

        const notableSymbols = Array.from(symbolCallCount.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([id]) => id);

        return {
            static_overview: overview,
            changes_overview: null,
            runtime_overview: null,
            notable_files: notableFiles,
            notable_symbols: notableSymbols
        };
    }

    /**
     * Generate summary for diff analysis
     */
    private generateDiffSummary(
        nodes: SymbolNode[],
        edges: CallEdge[],
        diff: any
    ): Summary {
        const addedCount = diff.added_nodes.length;
        const removedCount = diff.removed_nodes.length;
        const modifiedCount = diff.modified_nodes.length;
        const addedEdgesCount = diff.added_edges.length;
        const removedEdgesCount = diff.removed_edges.length;

        const changesOverview = 
            `Code changes detected: ${addedCount} symbol(s) added, ${removedCount} removed, ${modifiedCount} modified. ` +
            `Call graph changes: ${addedEdgesCount} new connection(s), ${removedEdgesCount} removed connection(s).`;

        // Find files with most changes
        const fileChangeCounts = new Map<string, number>();
        
        [...diff.added_nodes, ...diff.removed_nodes, ...diff.modified_nodes.map((m: any) => m.after)].forEach((node: SymbolNode) => {
            fileChangeCounts.set(node.file, (fileChangeCounts.get(node.file) || 0) + 1);
        });

        const notableFiles = Array.from(fileChangeCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([file]) => file);

        // Notable changed symbols
        const notableSymbols = [
            ...diff.added_nodes.slice(0, 5).map((n: SymbolNode) => n.id),
            ...diff.modified_nodes.slice(0, 5).map((m: any) => m.after.id)
        ];

        return {
            static_overview: null,
            changes_overview: changesOverview,
            runtime_overview: null,
            notable_files: notableFiles,
            notable_symbols: notableSymbols
        };
    }

    /**
     * Generate summary for runtime analysis
     */
    private generateRuntimeSummary(
        nodes: SymbolNode[],
        edges: CallEdge[],
        execution: any,
        traceEvents: any[],
        traceMapper: RuntimeTraceMapper
    ): Summary {
        const intent = traceMapper.inferIntent(traceEvents, nodes);
        
        const highlightedCount = execution.highlighted_nodes.length;
        const stepCount = execution.steps.length;

        const runtimeOverview = 
            `${intent}. ` +
            `Execution trace contains ${stepCount} step(s) touching ${highlightedCount} symbol(s) in the codebase.`;

        // Files touched during execution
        const touchedFiles = new Set<string>();
        execution.highlighted_nodes.forEach((nodeId: string) => {
            const node = nodes.find(n => n.id === nodeId);
            if (node) {
                touchedFiles.add(node.file);
            }
        });

        return {
            static_overview: null,
            changes_overview: null,
            runtime_overview: runtimeOverview,
            notable_files: Array.from(touchedFiles),
            notable_symbols: execution.highlighted_nodes.slice(0, 10)
        };
    }

    /**
     * Create an error result
     */
    private createErrorResult(message: string): CodeFlowAnalysisResult {
        return {
            nodes: [],
            edges: [],
            files: [],
            diff: null,
            execution: null,
            summary: {
                static_overview: null,
                changes_overview: null,
                runtime_overview: null,
                notable_files: [],
                notable_symbols: []
            },
            warnings: [message]
        };
    }
}

/**
 * Main entry function - accepts JSON input and returns JSON output
 */
export async function analyzeCodeFlow(inputJson: string, workspaceRoot: string = ''): Promise<string> {
    try {
        const input: AnalysisInput = JSON.parse(inputJson);
        const mapper = new CodeFlowMapper(workspaceRoot);
        const result = await mapper.analyze(input);
        return JSON.stringify(result, null, 2);
    } catch (error) {
        const errorResult: CodeFlowAnalysisResult = {
            nodes: [],
            edges: [],
            files: [],
            diff: null,
            execution: null,
            summary: {
                static_overview: null,
                changes_overview: null,
                runtime_overview: null,
                notable_files: [],
                notable_symbols: []
            },
            warnings: [`Failed to parse input or process analysis: ${error}`]
        };
        return JSON.stringify(errorResult, null, 2);
    }
}

