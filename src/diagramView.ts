import * as vscode from 'vscode';
import { ProjectGraph } from './fileAnalyzer';

export class DiagramViewProvider {
    private panel: vscode.WebviewPanel | undefined;
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    public async showDiagram(graph: ProjectGraph) {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'projectDiagram',
                'Project Dependency Diagram',
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
                        await this.openFile(message.filePath);
                        break;
                    case 'showFileInfo':
                        this.showFileInfo(message.node);
                        break;
                }
            }
        );
    }

    private async openFile(relativePath: string) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return;
        }

        const filePath = vscode.Uri.joinPath(workspaceFolders[0].uri, relativePath);
        try {
            const document = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(document);
        } catch (error) {
            vscode.window.showErrorMessage(`Could not open file: ${relativePath}`);
        }
    }

    private showFileInfo(node: any) {
        const message = `
**File:** ${node.name}
**Type:** ${node.type}
**Imports:** ${node.imports.length}
**Exports:** ${node.exports.length}

**Import List:**
${node.imports.length > 0 ? node.imports.map((imp: string) => `- ${imp}`).join('\n') : 'None'}

**Export List:**
${node.exports.length > 0 ? node.exports.map((exp: string) => `- ${exp}`).join('\n') : 'None'}
        `.trim();

        vscode.window.showInformationMessage(message, { modal: true });
    }

    private getWebviewContent(graph: ProjectGraph): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Project Dependency Diagram</title>
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

        #info {
            position: absolute;
            top: 10px;
            right: 10px;
            z-index: 1000;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            padding: 15px;
            border-radius: 6px;
            max-width: 300px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }

        #info h3 {
            margin-bottom: 10px;
            color: var(--vscode-foreground);
            font-size: 14px;
        }

        #info p {
            margin: 5px 0;
            font-size: 12px;
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

        .node:hover circle {
            fill: var(--vscode-button-hoverBackground);
            r: 12;
        }

        .node text {
            font-size: 11px;
            fill: var(--vscode-editor-foreground);
            pointer-events: none;
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
            r: 12;
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

        .legend-color {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            margin-right: 8px;
            border: 2px solid var(--vscode-button-foreground);
        }
    </style>
</head>
<body>
    <div id="controls">
        <button id="zoomIn">Zoom In</button>
        <button id="zoomOut">Zoom Out</button>
        <button id="resetView">Reset View</button>
        <button id="centerView">Center</button>
    </div>

    <div id="stats">
        <strong>Project Statistics</strong><br>
        Files: <span id="fileCount">0</span><br>
        Connections: <span id="connectionCount">0</span>
    </div>

    <div id="legend">
        <strong>File Types</strong>
        <div id="legendContent"></div>
    </div>

    <svg id="diagram"></svg>

    <script>
        const vscode = acquireVsCodeApi();
        const graphData = ${JSON.stringify(graph)};

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
            .attr('refX', 20)
            .attr('refY', 0)
            .attr('orient', 'auto')
            .attr('markerWidth', 8)
            .attr('markerHeight', 8)
            .append('svg:path')
            .attr('d', 'M 0,-5 L 10 ,0 L 0,5')
            .attr('fill', 'var(--vscode-editorLineNumber-foreground)')
            .style('stroke', 'none');

        // Update stats
        document.getElementById('fileCount').textContent = graphData.nodes.length;
        document.getElementById('connectionCount').textContent = graphData.edges.length;

        // Create legend
        const fileTypes = [...new Set(graphData.nodes.map(n => n.type))];
        const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
        
        const legendContent = document.getElementById('legendContent');
        fileTypes.forEach((type, i) => {
            const item = document.createElement('div');
            item.className = 'legend-item';
            item.innerHTML = \`
                <div class="legend-color" style="background-color: \${colorScale(type)}"></div>
                <span>\${type}</span>
            \`;
            legendContent.appendChild(item);
        });

        // Create force simulation
        const simulation = d3.forceSimulation(graphData.nodes)
            .force('link', d3.forceLink(graphData.edges)
                .id(d => d.path)
                .distance(100))
            .force('charge', d3.forceManyBody().strength(-300))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide().radius(40));

        // Create links
        const link = g.append('g')
            .selectAll('path')
            .data(graphData.edges)
            .enter()
            .append('path')
            .attr('class', 'link')
            .attr('stroke-width', 1.5);

        // Create nodes
        const node = g.append('g')
            .selectAll('g')
            .data(graphData.nodes)
            .enter()
            .append('g')
            .attr('class', 'node')
            .call(d3.drag()
                .on('start', dragStarted)
                .on('drag', dragged)
                .on('end', dragEnded))
            .on('click', (event, d) => {
                vscode.postMessage({
                    command: 'openFile',
                    filePath: d.path
                });
            })
            .on('mouseover', (event, d) => {
                highlightConnections(d);
            })
            .on('mouseout', () => {
                resetHighlight();
            });

        node.append('circle')
            .attr('r', 8)
            .style('fill', d => colorScale(d.type));

        node.append('text')
            .attr('dx', 12)
            .attr('dy', 4)
            .text(d => d.name);

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
            connectedNodes.add(d.path);

            link.classed('highlighted', l => {
                if (l.source.path === d.path || l.target.path === d.path) {
                    connectedNodes.add(l.source.path);
                    connectedNodes.add(l.target.path);
                    return true;
                }
                return false;
            }).classed('dimmed', l => l.source.path !== d.path && l.target.path !== d.path);

            node.classed('highlighted', n => n.path === d.path)
                .classed('dimmed', n => !connectedNodes.has(n.path));
        }

        function resetHighlight() {
            link.classed('highlighted', false).classed('dimmed', false);
            node.classed('highlighted', false).classed('dimmed', false);
        }

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

