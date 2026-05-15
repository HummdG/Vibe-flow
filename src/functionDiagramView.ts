import * as vscode from 'vscode';
import { FunctionGraph } from './functionAnalyzer';

export class FunctionDiagramViewProvider {
    private panel: vscode.WebviewPanel | undefined;
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    public async showDiagram(graph: FunctionGraph) {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'functionDiagram',
                'Function Call Graph',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: []
                }
            );

            this.panel.onDidDispose(() => {
                this.panel = undefined;
            });
        }

        this.panel.webview.html = this.getWebviewContent(graph);

        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'openFile':
                        await this.openFile(message.filePath, message.line);
                        break;
                    case 'showFunctionInfo':
                        this.showFunctionInfo(message.node);
                        break;
                }
            }
        );
    }

    private async openFile(relativePath: string, line: number = 1) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return;
        }

        const filePath = vscode.Uri.joinPath(workspaceFolders[0].uri, relativePath);
        try {
            const document = await vscode.workspace.openTextDocument(filePath);
            const editor = await vscode.window.showTextDocument(document);
            const position = new vscode.Position(line - 1, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
        } catch (error) {
            vscode.window.showErrorMessage(`Could not open file: ${relativePath}`);
        }
    }

    private showFunctionInfo(node: any) {
        const message = `
**Function:** ${node.name}
**Type:** ${node.type}
**File:** ${node.file}
**Line:** ${node.startLine}
**Calls:** ${node.calls.length} functions

**Called Functions:**
${node.calls.length > 0 ? node.calls.map((call: string) => `- ${call}`).join('\n') : 'None'}
        `.trim();

        vscode.window.showInformationMessage(message, { modal: true });
    }

    private getWebviewContent(graph: FunctionGraph): string {
        // Group functions by file for better visualization
        const fileGroups = new Map<string, any[]>();
        for (const node of graph.nodes) {
            if (!fileGroups.has(node.filePath)) {
                fileGroups.set(node.filePath, []);
            }
            fileGroups.get(node.filePath)!.push(node);
        }

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Function Call Graph</title>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            overflow: hidden;
        }

        #controls {
            position: absolute;
            top: 10px;
            left: 10px;
            z-index: 1000;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            padding: 15px;
            border-radius: 6px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }

        #controls button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            margin: 4px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            transition: background 0.2s;
        }

        #controls button:hover {
            background: var(--vscode-button-hoverBackground);
        }

        #controls input {
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 6px 10px;
            margin: 4px;
            border-radius: 4px;
            width: 200px;
        }

        #stats {
            position: absolute;
            bottom: 10px;
            left: 10px;
            z-index: 1000;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            padding: 10px 15px;
            border-radius: 6px;
            font-size: 12px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }

        #legend {
            position: absolute;
            bottom: 10px;
            right: 10px;
            z-index: 1000;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            padding: 10px 15px;
            border-radius: 6px;
            font-size: 11px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }

        .legend-item {
            margin: 5px 0;
            display: flex;
            align-items: center;
        }

        .legend-shape {
            width: 20px;
            height: 20px;
            margin-right: 8px;
            border: 2px solid var(--vscode-button-foreground);
        }

        #diagram {
            width: 100vw;
            height: 100vh;
        }

        .node {
            cursor: pointer;
            transition: all 0.3s;
        }

        .node circle {
            fill: var(--vscode-button-background);
            stroke: var(--vscode-button-foreground);
            stroke-width: 2px;
        }

        .node.function circle {
            fill: #4CAF50;
        }

        .node.method circle {
            fill: #2196F3;
        }

        .node.class circle {
            fill: #FF9800;
        }

        .node:hover circle {
            stroke-width: 3px;
            r: 10;
        }

        .node text {
            font-size: 10px;
            fill: var(--vscode-editor-foreground);
            pointer-events: none;
        }

        .file-label {
            font-size: 9px;
            fill: var(--vscode-descriptionForeground);
            font-style: italic;
        }

        .link {
            stroke: var(--vscode-editorLineNumber-foreground);
            stroke-opacity: 0.6;
            stroke-width: 1.5px;
            fill: none;
            marker-end: url(#arrowhead);
        }

        .link:hover {
            stroke: var(--vscode-focusBorder);
            stroke-opacity: 1;
            stroke-width: 2.5px;
        }

        .node.highlighted circle {
            fill: var(--vscode-focusBorder);
            r: 10;
            stroke-width: 3px;
        }

        .link.highlighted {
            stroke: var(--vscode-focusBorder);
            stroke-opacity: 1;
            stroke-width: 2.5px;
        }

        .link.dimmed {
            stroke-opacity: 0.1;
        }

        .node.dimmed circle {
            opacity: 0.3;
        }

        .node.dimmed text {
            opacity: 0.3;
        }
    </style>
</head>
<body>
    <div id="controls">
        <button id="zoomIn">Zoom In</button>
        <button id="zoomOut">Zoom Out</button>
        <button id="resetView">Reset View</button>
        <button id="centerView">Center</button>
        <br>
        <input type="text" id="search" placeholder="Search function...">
    </div>

    <div id="stats">
        <strong>Function Call Graph</strong><br>
        Functions: <span id="functionCount">0</span><br>
        Connections: <span id="connectionCount">0</span><br>
        Files: <span id="fileCount">0</span>
    </div>

    <div id="legend">
        <strong>Function Types</strong>
        <div class="legend-item">
            <div class="legend-shape" style="background-color: #4CAF50; border-radius: 50%;"></div>
            <span>Function</span>
        </div>
        <div class="legend-item">
            <div class="legend-shape" style="background-color: #2196F3; border-radius: 50%;"></div>
            <span>Method</span>
        </div>
        <div class="legend-item">
            <div class="legend-shape" style="background-color: #FF9800; border-radius: 50%;"></div>
            <span>Class</span>
        </div>
    </div>

    <svg id="diagram"></svg>

    <script>
        const vscode = acquireVsCodeApi();
        const graphData = ${JSON.stringify(graph)};

        // Transform node IDs to include file path
        const nodeMap = new Map();
        graphData.nodes.forEach(node => {
            const id = node.filePath + '::' + node.name;
            nodeMap.set(id, {
                id: id,
                name: node.name,
                file: node.file,
                filePath: node.filePath,
                startLine: node.startLine,
                type: node.type,
                calls: node.calls
            });
        });

        const nodes = Array.from(nodeMap.values());
        const edges = graphData.edges;

        // Set up SVG
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        const svg = d3.select('#diagram')
            .attr('width', width)
            .attr('height', height);

        // Add zoom behavior
        const g = svg.append('g');
        
        const zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
            });

        svg.call(zoom);

        // Define arrow marker
        svg.append('defs').append('marker')
            .attr('id', 'arrowhead')
            .attr('viewBox', '-0 -5 10 10')
            .attr('refX', 15)
            .attr('refY', 0)
            .attr('orient', 'auto')
            .attr('markerWidth', 8)
            .attr('markerHeight', 8)
            .append('svg:path')
            .attr('d', 'M 0,-5 L 10 ,0 L 0,5')
            .attr('fill', 'var(--vscode-editorLineNumber-foreground)')
            .style('stroke', 'none');

        // Update stats
        document.getElementById('functionCount').textContent = nodes.length;
        document.getElementById('connectionCount').textContent = edges.length;
        const uniqueFiles = new Set(nodes.map(n => n.filePath));
        document.getElementById('fileCount').textContent = uniqueFiles.size;

        // Create force simulation
        const simulation = d3.forceSimulation(nodes)
            .force('link', d3.forceLink(edges)
                .id(d => d.id)
                .distance(150))
            .force('charge', d3.forceManyBody().strength(-400))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide().radius(50));

        // Create links
        const link = g.append('g')
            .selectAll('path')
            .data(edges)
            .enter()
            .append('path')
            .attr('class', 'link')
            .attr('stroke-width', 1.5);

        // Create nodes
        const node = g.append('g')
            .selectAll('g')
            .data(nodes)
            .enter()
            .append('g')
            .attr('class', d => 'node ' + d.type)
            .call(d3.drag()
                .on('start', dragStarted)
                .on('drag', dragged)
                .on('end', dragEnded))
            .on('click', (event, d) => {
                vscode.postMessage({
                    command: 'openFile',
                    filePath: d.filePath,
                    line: d.startLine
                });
            })
            .on('mouseover', (event, d) => {
                highlightConnections(d);
            })
            .on('mouseout', () => {
                resetHighlight();
            });

        node.append('circle')
            .attr('r', 7);

        node.append('text')
            .attr('dx', 10)
            .attr('dy', -5)
            .text(d => d.name);

        node.append('text')
            .attr('class', 'file-label')
            .attr('dx', 10)
            .attr('dy', 5)
            .text(d => d.file);

        // Simulation tick
        simulation.on('tick', () => {
            link.attr('d', d => {
                const dx = d.target.x - d.source.x;
                const dy = d.target.y - d.source.y;
                const dr = Math.sqrt(dx * dx + dy * dy);
                return \`M\${d.source.x},\${d.source.y}A\${dr},\${dr} 0 0,1 \${d.target.x},\${d.target.y}\`;
            });

            node.attr('transform', d => \`translate(\${d.x},\${d.y})\`);
        });

        // Drag functions
        function dragStarted(event, d) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        }

        function dragged(event, d) {
            d.fx = event.x;
            d.fy = event.y;
        }

        function dragEnded(event, d) {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }

        // Highlight connections
        function highlightConnections(d) {
            const connectedNodes = new Set();
            connectedNodes.add(d.id);

            link.classed('highlighted', l => {
                if (l.source.id === d.id || l.target.id === d.id) {
                    connectedNodes.add(l.source.id);
                    connectedNodes.add(l.target.id);
                    return true;
                }
                return false;
            }).classed('dimmed', l => l.source.id !== d.id && l.target.id !== d.id);

            node.classed('highlighted', n => n.id === d.id)
                .classed('dimmed', n => !connectedNodes.has(n.id));
        }

        function resetHighlight() {
            link.classed('highlighted', false).classed('dimmed', false);
            node.classed('highlighted', false).classed('dimmed', false);
        }

        // Search functionality
        document.getElementById('search').addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            
            if (!searchTerm) {
                resetHighlight();
                return;
            }

            const matchingNodes = nodes.filter(n => 
                n.name.toLowerCase().includes(searchTerm) ||
                n.file.toLowerCase().includes(searchTerm)
            );

            if (matchingNodes.length > 0) {
                const matchingIds = new Set(matchingNodes.map(n => n.id));
                node.classed('highlighted', n => matchingIds.has(n.id))
                    .classed('dimmed', n => !matchingIds.has(n.id));
                link.classed('dimmed', true);
            } else {
                resetHighlight();
            }
        });

        // Control buttons
        document.getElementById('zoomIn').addEventListener('click', () => {
            svg.transition().call(zoom.scaleBy, 1.3);
        });

        document.getElementById('zoomOut').addEventListener('click', () => {
            svg.transition().call(zoom.scaleBy, 0.7);
        });

        document.getElementById('resetView').addEventListener('click', () => {
            svg.transition().call(zoom.transform, d3.zoomIdentity);
        });

        document.getElementById('centerView').addEventListener('click', () => {
            const bounds = g.node().getBBox();
            const fullWidth = bounds.width;
            const fullHeight = bounds.height;
            const midX = bounds.x + fullWidth / 2;
            const midY = bounds.y + fullHeight / 2;
            
            const scale = 0.8 / Math.max(fullWidth / width, fullHeight / height);
            const translate = [width / 2 - scale * midX, height / 2 - scale * midY];
            
            svg.transition()
                .duration(750)
                .call(zoom.transform, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale));
        });

        // Initial center
        setTimeout(() => {
            document.getElementById('centerView').click();
        }, 1000);
    </script>
</body>
</html>`;
    }
}





