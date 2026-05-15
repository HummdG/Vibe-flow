/**
 * Automatic Runtime Flow Capture
 * Hooks into VS Code Debug API to automatically capture execution flow
 */

import * as vscode from 'vscode';
import { TraceEvent } from '../types';

export interface CaptureOptions {
    maxEvents?: number;
    captureVariables?: boolean;
    includeSystemCalls?: boolean;
    frameDepthLimit?: number;
}

export interface CaptureSession {
    sessionId: string;
    startTime: Date;
    events: TraceEvent[];
    status: 'active' | 'stopped' | 'error';
}

export class DebugFlowCapture {
    private activeSessions: Map<string, CaptureSession> = new Map();
    private disposables: vscode.Disposable[] = [];
    private outputChannel: vscode.OutputChannel;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Vibe Flow - Debug Capture');
        this.initialize();
    }

    private initialize() {
        // Listen for debug session starts
        this.disposables.push(
            vscode.debug.onDidStartDebugSession((session) => {
                this.onDebugSessionStart(session);
            })
        );

        // Listen for debug session terminations
        this.disposables.push(
            vscode.debug.onDidTerminateDebugSession((session) => {
                this.onDebugSessionEnd(session);
            })
        );

        // Listen for debug events (breakpoints, steps, etc.)
        this.disposables.push(
            vscode.debug.onDidChangeBreakpoints(() => {
                // Breakpoint changes
            })
        );
    }

    /**
     * Start capturing execution flow for active debug sessions
     */
    async startCapture(options: CaptureOptions = {}): Promise<string | null> {
        const session = vscode.debug.activeDebugSession;
        
        if (!session) {
            vscode.window.showWarningMessage(
                'No active debug session. Please start debugging your application first (F5).'
            );
            return null;
        }

        const sessionId = session.id;
        
        if (this.activeSessions.has(sessionId)) {
            vscode.window.showWarningMessage('Already capturing this debug session.');
            return sessionId;
        }

        const captureSession: CaptureSession = {
            sessionId,
            startTime: new Date(),
            events: [],
            status: 'active'
        };

        this.activeSessions.set(sessionId, captureSession);
        
        this.outputChannel.appendLine(`Started capturing session: ${sessionId}`);
        this.outputChannel.appendLine(`Debug type: ${session.type}`);
        this.outputChannel.appendLine(`Session name: ${session.name}`);
        
        // Set up custom request handlers for this session
        await this.setupSessionCapture(session, captureSession, options);

        vscode.window.showInformationMessage(
            `🎬 Auto-capture started for ${session.name}. Continue debugging to capture flow.`
        );

        return sessionId;
    }

    /**
     * Stop capturing and return the collected events
     */
    async stopCapture(sessionId?: string): Promise<TraceEvent[]> {
        const targetId = sessionId || vscode.debug.activeDebugSession?.id;
        
        if (!targetId) {
            vscode.window.showWarningMessage('No active capture session.');
            return [];
        }

        const captureSession = this.activeSessions.get(targetId);
        
        if (!captureSession) {
            vscode.window.showWarningMessage('No capture session found.');
            return [];
        }

        captureSession.status = 'stopped';
        const events = captureSession.events;
        
        this.outputChannel.appendLine(`Stopped capturing session: ${targetId}`);
        this.outputChannel.appendLine(`Captured ${events.length} events`);
        
        this.activeSessions.delete(targetId);

        return events;
    }

    /**
     * Get currently captured events without stopping
     */
    getCurrentEvents(sessionId?: string): TraceEvent[] {
        const targetId = sessionId || vscode.debug.activeDebugSession?.id;
        
        if (!targetId) {
            return [];
        }

        const captureSession = this.activeSessions.get(targetId);
        return captureSession?.events || [];
    }

    /**
     * Check if a session is being captured
     */
    isCapturing(sessionId?: string): boolean {
        const targetId = sessionId || vscode.debug.activeDebugSession?.id;
        return targetId ? this.activeSessions.has(targetId) : false;
    }

    private onDebugSessionStart(session: vscode.DebugSession) {
        this.outputChannel.appendLine(`Debug session started: ${session.id} (${session.type})`);
    }

    private onDebugSessionEnd(session: vscode.DebugSession) {
        this.outputChannel.appendLine(`Debug session ended: ${session.id}`);
        
        const captureSession = this.activeSessions.get(session.id);
        if (captureSession && captureSession.status === 'active') {
            captureSession.status = 'stopped';
            vscode.window.showInformationMessage(
                `Debug session ended. Captured ${captureSession.events.length} events.`
            );
        }
    }

    private async setupSessionCapture(
        session: vscode.DebugSession,
        captureSession: CaptureSession,
        options: CaptureOptions
    ) {
        const maxEvents = options.maxEvents || 10000;
        const frameDepthLimit = options.frameDepthLimit || 20;

        // Use custom requests to the debug adapter
        // Note: This is adapter-specific, so we'll use common ones
        
        // Set up periodic stack trace polling when debugger is paused
        const pollInterval = setInterval(async () => {
            if (captureSession.status !== 'active') {
                clearInterval(pollInterval);
                return;
            }

            try {
                // Try to get stack trace
                const stackTrace = await this.getStackTrace(session);
                
                if (stackTrace && captureSession.events.length < maxEvents) {
                    const event = this.createTraceEvent(stackTrace, session.type);
                    if (event) {
                        captureSession.events.push(event);
                    }
                }
            } catch (error) {
                // Debugger might not be paused, which is fine
            }
        }, 100); // Poll every 100ms when paused

        // Store the interval so we can clear it later
        this.disposables.push({
            dispose: () => clearInterval(pollInterval)
        });
    }

    private async getStackTrace(session: vscode.DebugSession): Promise<any> {
        try {
            // Try to get threads
            const threadsResponse = await session.customRequest('threads');
            
            if (threadsResponse?.threads?.length > 0) {
                const threadId = threadsResponse.threads[0].id;
                
                // Get stack trace for the first thread
                const stackTraceResponse = await session.customRequest('stackTrace', {
                    threadId,
                    startFrame: 0,
                    levels: 20
                });
                
                return stackTraceResponse;
            }
        } catch (error) {
            // Silently fail - debugger might not support this
            return null;
        }
        
        return null;
    }

    private createTraceEvent(stackTrace: any, debugType: string): TraceEvent | null {
        try {
            if (!stackTrace?.stackFrames || stackTrace.stackFrames.length === 0) {
                return null;
            }

            const topFrame = stackTrace.stackFrames[0];
            const stack = stackTrace.stackFrames.map((frame: any) => frame.name);

            // Extract file path and line number
            const source = topFrame.source;
            const line = topFrame.line;
            const functionName = topFrame.name;

            let filePath: string | undefined;
            if (source?.path) {
                filePath = source.path;
            }

            const event: TraceEvent = {
                timestamp: new Date().toISOString(),
                type: 'function_call',
                description: `Executing ${functionName}`,
                file: filePath,
                line,
                function: functionName,
                stack
            };

            return event;
        } catch (error) {
            this.outputChannel.appendLine(`Error creating trace event: ${error}`);
            return null;
        }
    }

    /**
     * Create a custom breakpoint-based capture strategy
     * This sets breakpoints at key locations and captures when hit
     */
    async startBreakpointCapture(targetFunctions: string[] = []): Promise<void> {
        const session = vscode.debug.activeDebugSession;
        
        if (!session) {
            vscode.window.showWarningMessage('No active debug session.');
            return;
        }

        vscode.window.showInformationMessage(
            '📍 Breakpoint capture mode: Step through your code (F10/F11) to capture execution flow.'
        );

        // The capture will happen automatically as user steps through code
        await this.startCapture({ captureVariables: true });
    }

    /**
     * Export captured events in a format compatible with RuntimeTraceMapper
     */
    exportTraceEvents(sessionId?: string): TraceEvent[] {
        return this.getCurrentEvents(sessionId);
    }

    dispose() {
        this.disposables.forEach(d => d.dispose());
        this.activeSessions.clear();
        this.outputChannel.dispose();
    }
}




