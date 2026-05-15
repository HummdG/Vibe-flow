/**
 * Change diff analyzer - compares two versions and highlights differences
 */

import { SymbolNode, CallEdge, DiffInfo, FileInput } from '../types';
import { StaticGraphBuilder } from './StaticGraphBuilder';

export class ChangeDiffAnalyzer {
    private workspaceRoot: string;

    constructor(workspaceRoot: string = '') {
        this.workspaceRoot = workspaceRoot;
    }

    /**
     * Analyze differences between two versions
     */
    async analyzeDiff(
        prevFiles: FileInput[],
        currentFiles: FileInput[]
    ): Promise<{
        prevGraph: { nodes: SymbolNode[]; edges: CallEdge[] };
        currentGraph: { nodes: SymbolNode[]; edges: CallEdge[] };
        diff: DiffInfo;
    }> {
        // Build graphs for both versions
        const prevBuilder = new StaticGraphBuilder(this.workspaceRoot);
        const currentBuilder = new StaticGraphBuilder(this.workspaceRoot);

        const prevResult = await prevBuilder.buildGraph(prevFiles);
        const currentResult = await currentBuilder.buildGraph(currentFiles);

        // Compute diff
        const diff = this.computeDiff(
            prevResult.nodes,
            prevResult.edges,
            currentResult.nodes,
            currentResult.edges
        );

        return {
            prevGraph: {
                nodes: prevResult.nodes,
                edges: prevResult.edges
            },
            currentGraph: {
                nodes: currentResult.nodes,
                edges: currentResult.edges
            },
            diff
        };
    }

    /**
     * Compute structural diff between two graphs
     */
    private computeDiff(
        prevNodes: SymbolNode[],
        prevEdges: CallEdge[],
        currentNodes: SymbolNode[],
        currentEdges: CallEdge[]
    ): DiffInfo {
        // Build maps for quick lookup
        const prevNodeMap = new Map(prevNodes.map(n => [this.getNodeKey(n), n]));
        const currentNodeMap = new Map(currentNodes.map(n => [this.getNodeKey(n), n]));
        
        const prevEdgeSet = new Set(prevEdges.map(e => this.getEdgeKey(e)));
        const currentEdgeSet = new Set(currentEdges.map(e => this.getEdgeKey(e)));

        // Find added nodes
        const addedNodes: SymbolNode[] = [];
        for (const [key, node] of currentNodeMap) {
            if (!prevNodeMap.has(key)) {
                addedNodes.push(node);
            }
        }

        // Find removed nodes
        const removedNodes: SymbolNode[] = [];
        for (const [key, node] of prevNodeMap) {
            if (!currentNodeMap.has(key)) {
                removedNodes.push(node);
            }
        }

        // Find modified nodes
        const modifiedNodes: Array<{
            before: SymbolNode;
            after: SymbolNode;
            changes: string[];
        }> = [];

        for (const [key, currentNode] of currentNodeMap) {
            const prevNode = prevNodeMap.get(key);
            if (prevNode) {
                const changes = this.findNodeChanges(prevNode, currentNode);
                if (changes.length > 0) {
                    modifiedNodes.push({
                        before: prevNode,
                        after: currentNode,
                        changes
                    });
                }
            }
        }

        // Find added edges
        const addedEdges: CallEdge[] = [];
        for (const edge of currentEdges) {
            const key = this.getEdgeKey(edge);
            if (!prevEdgeSet.has(key)) {
                addedEdges.push(edge);
            }
        }

        // Find removed edges
        const removedEdges: CallEdge[] = [];
        for (const edge of prevEdges) {
            const key = this.getEdgeKey(edge);
            if (!currentEdgeSet.has(key)) {
                removedEdges.push(edge);
            }
        }

        return {
            added_nodes: addedNodes,
            removed_nodes: removedNodes,
            modified_nodes: modifiedNodes,
            added_edges: addedEdges,
            removed_edges: removedEdges
        };
    }

    /**
     * Generate a unique key for a node (based on file and name, not line)
     */
    private getNodeKey(node: SymbolNode): string {
        return `${node.file}::${node.kind}::${node.name}`;
    }

    /**
     * Generate a unique key for an edge
     */
    private getEdgeKey(edge: CallEdge): string {
        return `${edge.from}==>${edge.to}`;
    }

    /**
     * Find what changed in a node
     */
    private findNodeChanges(before: SymbolNode, after: SymbolNode): string[] {
        const changes: string[] = [];

        if (before.line !== after.line) {
            changes.push(`line: ${before.line} -> ${after.line}`);
        }

        if (before.visibility !== after.visibility) {
            changes.push(`visibility: ${before.visibility} -> ${after.visibility}`);
        }

        if (before.async !== after.async) {
            changes.push(`async: ${before.async} -> ${after.async}`);
        }

        if (before.parent_symbol !== after.parent_symbol) {
            changes.push(`parent: ${before.parent_symbol} -> ${after.parent_symbol}`);
        }

        return changes;
    }
}

