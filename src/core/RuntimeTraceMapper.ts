/**
 * Runtime trace mapper - maps execution traces onto static graph
 */

import { SymbolNode, CallEdge, ExecutionTrace, ExecutionStep, TraceEvent } from '../types';

export class RuntimeTraceMapper {
    private symbolMap: Map<string, SymbolNode>;
    private symbolsByName: Map<string, SymbolNode[]>;
    private symbolsByFile: Map<string, SymbolNode[]>;

    constructor(nodes: SymbolNode[]) {
        this.symbolMap = new Map(nodes.map(n => [n.id, n]));
        
        // Index by name
        this.symbolsByName = new Map();
        nodes.forEach(node => {
            if (!this.symbolsByName.has(node.name)) {
                this.symbolsByName.set(node.name, []);
            }
            this.symbolsByName.get(node.name)!.push(node);
        });

        // Index by file
        this.symbolsByFile = new Map();
        nodes.forEach(node => {
            if (!this.symbolsByFile.has(node.file)) {
                this.symbolsByFile.set(node.file, []);
            }
            this.symbolsByFile.get(node.file)!.push(node);
        });
    }

    /**
     * Map trace events onto the static graph
     */
    mapTrace(traceEvents: TraceEvent[], edges: CallEdge[]): ExecutionTrace {
        const steps: ExecutionStep[] = [];
        const highlightedNodes = new Set<string>();
        const highlightedEdges = new Set<string>();

        for (let i = 0; i < traceEvents.length; i++) {
            const event = traceEvents[i];
            const step = this.mapEvent(event, i, highlightedNodes);
            steps.push(step);

            // Track highlighted edges based on call flow
            if (i > 0 && steps[i - 1].active_stack.length > 0 && step.active_stack.length > 0) {
                const prevSymbolId = steps[i - 1].active_stack[steps[i - 1].active_stack.length - 1].symbol_id;
                const currentSymbolId = step.active_stack[step.active_stack.length - 1].symbol_id;
                
                if (prevSymbolId && currentSymbolId) {
                    highlightedEdges.add(`${prevSymbolId}==>${currentSymbolId}`);
                }
            }
        }

        return {
            steps,
            highlighted_nodes: Array.from(highlightedNodes),
            highlighted_edges: Array.from(highlightedEdges).map(key => {
                const [from, to] = key.split('==>');
                return { from, to };
            })
        };
    }

    /**
     * Map a single trace event to an execution step
     */
    private mapEvent(event: TraceEvent, index: number, highlightedNodes: Set<string>): ExecutionStep {
        const step: ExecutionStep = {
            index,
            timestamp: event.timestamp || null,
            event_type: event.type,
            description: event.description || null,
            file: event.file || null,
            line: event.line || null,
            active_stack: []
        };

        // Try to map to symbols
        if (event.stack && event.stack.length > 0) {
            // Map stack trace
            for (const stackFrame of event.stack) {
                const symbolId = this.resolveSymbol(stackFrame, event.file || null, event.line || null);
                if (symbolId) {
                    step.active_stack.push({ symbol_id: symbolId });
                    highlightedNodes.add(symbolId);
                } else {
                    step.active_stack.push({ symbol_id: null });
                }
            }
        } else if (event.function) {
            // Single function reference
            const symbolId = this.resolveSymbol(event.function, event.file || null, event.line || null);
            if (symbolId) {
                step.active_stack.push({ symbol_id: symbolId });
                highlightedNodes.add(symbolId);
            } else {
                step.active_stack.push({ symbol_id: null });
            }
        } else if (event.file && event.line) {
            // Try to find symbol at this file and line
            const symbolId = this.findSymbolAtLocation(event.file, event.line);
            if (symbolId) {
                step.active_stack.push({ symbol_id: symbolId });
                highlightedNodes.add(symbolId);
            }
        }

        return step;
    }

    /**
     * Resolve a symbol reference (function name or stack frame) to a symbol ID
     */
    private resolveSymbol(reference: string, file: string | null, line: number | null): string | null {
        // Try file + line first (most precise)
        if (file && line) {
            const symbolId = this.findSymbolAtLocation(file, line);
            if (symbolId) {
                return symbolId;
            }
        }

        // Try file + name
        if (file) {
            const symbolsInFile = this.symbolsByFile.get(file) || [];
            const match = symbolsInFile.find(s => s.name === reference);
            if (match) {
                return match.id;
            }
        }

        // Try global name lookup
        const candidates = this.symbolsByName.get(reference) || [];
        if (candidates.length > 0) {
            // If we have file hint, prefer that
            if (file) {
                const inFile = candidates.find(c => c.file === file);
                if (inFile) {
                    return inFile.id;
                }
            }
            
            // Otherwise return first match
            return candidates[0].id;
        }

        return null;
    }

    /**
     * Find symbol at a specific file and line
     */
    private findSymbolAtLocation(file: string, line: number): string | null {
        const symbolsInFile = this.symbolsByFile.get(file) || [];
        
        // Find the symbol that contains this line
        // This is approximate - we assume the symbol at or just before this line
        const candidates = symbolsInFile.filter(s => s.line <= line);
        
        if (candidates.length === 0) {
            return null;
        }

        // Return the closest symbol (by line)
        candidates.sort((a, b) => Math.abs(a.line - line) - Math.abs(b.line - line));
        return candidates[0].id;
    }

    /**
     * Infer user intent from trace events
     */
    inferIntent(traceEvents: TraceEvent[], nodes: SymbolNode[]): string {
        if (traceEvents.length === 0) {
            return 'No execution trace available';
        }

        const descriptions: string[] = [];

        // Analyze entry point
        const firstEvent = traceEvents[0];
        if (firstEvent.function || firstEvent.description) {
            descriptions.push(`Started at ${firstEvent.function || firstEvent.description}`);
        }

        // Count unique functions/files touched
        const uniqueFunctions = new Set<string>();
        const uniqueFiles = new Set<string>();
        
        traceEvents.forEach(event => {
            if (event.function) {
                uniqueFunctions.add(event.function);
            }
            if (event.file) {
                uniqueFiles.add(event.file);
            }
        });

        if (uniqueFunctions.size > 0) {
            descriptions.push(`Executed ${uniqueFunctions.size} function(s)`);
        }

        if (uniqueFiles.size > 0) {
            descriptions.push(`Across ${uniqueFiles.size} file(s)`);
        }

        // Look for patterns
        const eventTypes = traceEvents.map(e => e.type);
        if (eventTypes.includes('http_request') || eventTypes.includes('api_call')) {
            descriptions.push('Handled HTTP/API request');
        }

        if (eventTypes.includes('ui_interaction') || eventTypes.includes('click') || eventTypes.includes('input')) {
            descriptions.push('Responded to user interaction');
        }

        if (eventTypes.includes('error') || eventTypes.includes('exception')) {
            descriptions.push('Encountered error during execution');
        }

        return descriptions.join('. ') || 'Executed code flow';
    }
}

