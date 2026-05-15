/**
 * Flow Diagram Visualizer
 * Generates interactive Mermaid diagrams from analysis results
 */

import * as vscode from 'vscode';
import { CodeFlowAnalysisResult, SymbolNode, CallEdge } from './types';

export class FlowDiagramGenerator {
    /**
     * Generate a Mermaid flowchart from analysis results
     */
    static generateMermaidDiagram(result: CodeFlowAnalysisResult, options?: {
        maxNodes?: number;
        highlightedNodes?: string[];
        highlightedEdges?: Array<{ from: string; to: string }>;
        direction?: 'TD' | 'LR' | 'BT' | 'RL';
    }): string {
        const maxNodes = options?.maxNodes || 50;
        const direction = options?.direction || 'TD';
        const highlightedNodes = new Set(options?.highlightedNodes || []);
        const highlightedEdges = new Map<string, Set<string>>();
        
        // Build highlighted edges map
        (options?.highlightedEdges || []).forEach(edge => {
            if (!highlightedEdges.has(edge.from)) {
                highlightedEdges.set(edge.from, new Set());
            }
            highlightedEdges.get(edge.from)!.add(edge.to);
        });

        // If we have execution data, prioritize those nodes
        let nodesToShow: SymbolNode[];
        if (result.execution && result.execution.highlighted_nodes.length > 0) {
            const executedNodeIds = new Set(result.execution.highlighted_nodes);
            nodesToShow = result.nodes.filter(n => executedNodeIds.has(n.id));
            
            // Add some context nodes if we have room
            if (nodesToShow.length < maxNodes) {
                const remaining = maxNodes - nodesToShow.length;
                const contextNodes = result.nodes
                    .filter(n => !executedNodeIds.has(n.id))
                    .slice(0, remaining);
                nodesToShow.push(...contextNodes);
            }
        } else {
            // Show most connected nodes
            nodesToShow = this.getMostConnectedNodes(result, maxNodes);
        }

        const nodeIds = new Set(nodesToShow.map(n => n.id));
        const edges = result.edges.filter(e => nodeIds.has(e.from) && nodeIds.has(e.to));

        // Generate Mermaid diagram
        let mermaid = `flowchart ${direction}\n`;
        
        // Add nodes with styling
        nodesToShow.forEach(node => {
            const nodeKey = this.sanitizeId(node.id);
            const label = this.formatNodeLabel(node);
            const isHighlighted = highlightedNodes.has(node.id);
            
            let nodeDeclaration = `    ${nodeKey}`;
            
            // Choose shape based on node kind
            if (node.kind === 'class') {
                nodeDeclaration += `[["${label}"]]`;  // Rectangle with double borders
            } else if (node.kind === 'method') {
                nodeDeclaration += `["${label}"]`;    // Rectangle
            } else if (node.kind === 'function') {
                nodeDeclaration += `("${label}")`;    // Rounded rectangle
            } else {
                nodeDeclaration += `{{"{label}"}}}`;   // Hexagon for other types
            }
            
            // Add styling for highlighted nodes
            if (isHighlighted) {
                nodeDeclaration += `:::highlighted`;
            }
            
            mermaid += nodeDeclaration + '\n';
        });

        mermaid += '\n';

        // Add edges
        edges.forEach(edge => {
            const fromKey = this.sanitizeId(edge.from);
            const toKey = this.sanitizeId(edge.to);
            const isHighlighted = highlightedEdges.get(edge.from)?.has(edge.to);
            
            let edgeStyle = '-->';
            let label = '';
            
            if (edge.type === 'method_call') {
                label = 'calls';
            } else if (edge.type === 'constructor') {
                label = 'new';
            }
            
            if (isHighlighted) {
                edgeStyle = '==>';  // Thick arrow for highlighted
            }
            
            if (label) {
                mermaid += `    ${fromKey} ${edgeStyle}|${label}| ${toKey}\n`;
            } else {
                mermaid += `    ${fromKey} ${edgeStyle} ${toKey}\n`;
            }
        });

        // Add styling classes
        mermaid += '\n';
        mermaid += '    classDef highlighted fill:#ff6b6b,stroke:#c92a2a,stroke-width:3px,color:#fff\n';
        
        return mermaid;
    }

    /**
     * Generate a class diagram for object-oriented code
     */
    static generateClassDiagram(result: CodeFlowAnalysisResult, maxClasses: number = 20): string {
        const classes = result.nodes.filter(n => n.kind === 'class').slice(0, maxClasses);
        const methods = result.nodes.filter(n => n.kind === 'method');
        
        let mermaid = 'classDiagram\n';
        
        classes.forEach(classNode => {
            const className = this.sanitizeId(classNode.name);
            mermaid += `    class ${className} {\n`;
            
            // Add methods for this class
            const classMethods = methods.filter(m => m.parent_symbol === classNode.id);
            classMethods.forEach(method => {
                const visibility = method.visibility === 'private' ? '-' : '+';
                const async = method.async ? 'async ' : '';
                mermaid += `        ${visibility}${async}${method.name}()\n`;
            });
            
            mermaid += '    }\n';
        });
        
        return mermaid;
    }

    /**
     * Generate a sequence diagram showing execution flow
     */
    static generateSequenceDiagram(result: CodeFlowAnalysisResult): string {
        if (!result.execution || !result.execution.steps || result.execution.steps.length === 0) {
            return 'sequenceDiagram\n    Note over User: No execution trace available';
        }

        let mermaid = 'sequenceDiagram\n';
        mermaid += '    participant User\n';
        
        // Extract unique actors from execution steps
        const actors = new Set<string>();
        result.execution.steps.forEach(step => {
            if (step.active_stack && step.active_stack.length > 0) {
                step.active_stack.forEach(frame => {
                    if (frame.symbol_id) {
                        const node = result.nodes.find(n => n.id === frame.symbol_id);
                        if (node) {
                            actors.add(node.name);
                        }
                    }
                });
            }
        });

        // Declare actors
        actors.forEach(actor => {
            mermaid += `    participant ${this.sanitizeId(actor)}\n`;
        });

        mermaid += '\n';

        // Add execution steps
        let previousActor: string | null = null;
        result.execution.steps.slice(0, 30).forEach((step, index) => {  // Limit to 30 steps
            if (step.active_stack && step.active_stack.length > 0) {
                const currentFrame = step.active_stack[step.active_stack.length - 1];
                if (currentFrame.symbol_id) {
                    const node = result.nodes.find(n => n.id === currentFrame.symbol_id);
                    if (node) {
                        const actor = this.sanitizeId(node.name);
                        
                        if (previousActor && previousActor !== actor) {
                            mermaid += `    ${previousActor}->>+${actor}: ${step.description || 'call'}\n`;
                        } else if (!previousActor) {
                            mermaid += `    User->>+${actor}: ${step.description || 'start'}\n`;
                        } else {
                            mermaid += `    Note over ${actor}: ${step.description || 'processing'}\n`;
                        }
                        
                        previousActor = actor;
                    }
                }
            }
        });

        if (previousActor) {
            mermaid += `    ${previousActor}-->>-User: complete\n`;
        }

        return mermaid;
    }

    /**
     * Get nodes with most connections
     */
    private static getMostConnectedNodes(result: CodeFlowAnalysisResult, limit: number): SymbolNode[] {
        const connectionCounts = new Map<string, number>();
        
        result.edges.forEach(edge => {
            connectionCounts.set(edge.from, (connectionCounts.get(edge.from) || 0) + 1);
            connectionCounts.set(edge.to, (connectionCounts.get(edge.to) || 0) + 1);
        });

        return result.nodes
            .map(node => ({ node, connections: connectionCounts.get(node.id) || 0 }))
            .sort((a, b) => b.connections - a.connections)
            .slice(0, limit)
            .map(item => item.node);
    }

    /**
     * Sanitize ID for Mermaid (remove special characters)
     */
    private static sanitizeId(id: string): string {
        return id.replace(/[^a-zA-Z0-9_]/g, '_');
    }

    /**
     * Format node label for display
     */
    private static formatNodeLabel(node: SymbolNode): string {
        let label = node.name;
        
        if (node.kind === 'method' && node.parent_symbol) {
            const parentNode = node.parent_symbol.split(':').pop();
            label = `${parentNode}.${node.name}`;
        }
        
        if (node.async) {
            label = `async ${label}`;
        }
        
        return label;
    }
}

/**
 * Creates a webview panel to display the diagram
 */
export async function showFlowDiagram(
    context: vscode.ExtensionContext,
    result: CodeFlowAnalysisResult,
    diagramType: 'flowchart' | 'class' | 'sequence' = 'flowchart'
): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
        'flowDiagram',
        'Flow Diagram',
        vscode.ViewColumn.Two,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    let mermaidCode: string;
    
    if (diagramType === 'flowchart') {
        mermaidCode = FlowDiagramGenerator.generateMermaidDiagram(result, {
            maxNodes: 50,
            highlightedNodes: result.execution?.highlighted_nodes,
            highlightedEdges: result.execution?.highlighted_edges
        });
    } else if (diagramType === 'class') {
        mermaidCode = FlowDiagramGenerator.generateClassDiagram(result);
    } else {
        mermaidCode = FlowDiagramGenerator.generateSequenceDiagram(result);
    }

    panel.webview.html = getWebviewContent(mermaidCode, result);
}

function getWebviewContent(mermaidCode: string, result: CodeFlowAnalysisResult): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Flow Diagram</title>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
        }
        .container {
            max-width: 100%;
            overflow-x: auto;
        }
        .diagram {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
        }
        .controls {
            position: fixed;
            top: 10px;
            right: 10px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 10px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            z-index: 1000;
        }
        button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            margin: 4px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .stats {
            background: var(--vscode-editor-inactiveSelectionBackground);
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .stats h3 {
            margin-top: 0;
            color: var(--vscode-foreground);
        }
        .stat-item {
            display: flex;
            justify-content: space-between;
            margin: 8px 0;
            padding: 4px 0;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .stat-label {
            font-weight: bold;
        }
        .stat-value {
            color: var(--vscode-textLink-foreground);
        }
        h1 {
            color: var(--vscode-foreground);
            margin-bottom: 10px;
        }
        .summary {
            background: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-textLink-foreground);
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <div class="controls">
        <button onclick="zoomIn()">🔍 Zoom In</button>
        <button onclick="zoomOut()">🔍 Zoom Out</button>
        <button onclick="resetZoom()">↺ Reset</button>
        <button onclick="downloadSVG()">⬇ Download</button>
    </div>

    <h1>🎨 Flow Diagram</h1>
    
    <div class="stats">
        <h3>📊 Analysis Summary</h3>
        <div class="stat-item">
            <span class="stat-label">Total Symbols:</span>
            <span class="stat-value">${result.nodes.length}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Total Connections:</span>
            <span class="stat-value">${result.edges.length}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Files Analyzed:</span>
            <span class="stat-value">${result.files.length}</span>
        </div>
        ${result.execution ? `
        <div class="stat-item">
            <span class="stat-label">Execution Steps:</span>
            <span class="stat-value">${result.execution.steps.length}</span>
        </div>
        ` : ''}
    </div>

    ${result.summary?.static_overview || result.summary?.runtime_overview ? `
    <div class="summary">
        <h3>💡 Overview</h3>
        <p>${result.summary.static_overview || result.summary.runtime_overview || 'No summary available'}</p>
    </div>
    ` : ''}

    <div class="container">
        <div class="diagram">
            <div class="mermaid" id="diagram">
${mermaidCode}
            </div>
        </div>
    </div>

    <script>
        mermaid.initialize({ 
            startOnLoad: true,
            theme: 'dark',
            flowchart: {
                useMaxWidth: true,
                htmlLabels: true,
                curve: 'basis'
            }
        });

        let currentZoom = 1;
        
        function zoomIn() {
            currentZoom += 0.2;
            document.getElementById('diagram').style.transform = \`scale(\${currentZoom})\`;
            document.getElementById('diagram').style.transformOrigin = 'top left';
        }

        function zoomOut() {
            currentZoom = Math.max(0.2, currentZoom - 0.2);
            document.getElementById('diagram').style.transform = \`scale(\${currentZoom})\`;
            document.getElementById('diagram').style.transformOrigin = 'top left';
        }

        function resetZoom() {
            currentZoom = 1;
            document.getElementById('diagram').style.transform = 'scale(1)';
        }

        function downloadSVG() {
            const svg = document.querySelector('.mermaid svg');
            if (svg) {
                const svgData = new XMLSerializer().serializeToString(svg);
                const blob = new Blob([svgData], {type: 'image/svg+xml'});
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'flow-diagram.svg';
                link.click();
                URL.revokeObjectURL(url);
            }
        }
    </script>
</body>
</html>`;
}



