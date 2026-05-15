/**
 * VS Code Extension for Code Flow Mapper
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CodeFlowMapper } from './core/CodeFlowMapper';
import { AnalysisInput, FileInput, CodeFlowAnalysisResult } from './types';
import { DebugFlowCapture } from './core/DebugFlowCapture';
import { showFlowDiagram } from './flowDiagramGenerator';

export function activate(context: vscode.ExtensionContext) {
    console.log('Code Flow Mapper extension is now active!');

    // Initialize debug flow capture
    const debugFlowCapture = new DebugFlowCapture();
    context.subscriptions.push(debugFlowCapture);

    // Register static analysis command
    const staticAnalysisCommand = vscode.commands.registerCommand(
        'vibe-flow.analyzeStatic',
        async () => {
            await performStaticAnalysis(context);
        }
    );

    // Register change diff command
    const changeDiffCommand = vscode.commands.registerCommand(
        'vibe-flow.analyzeChangeDiff',
        async () => {
            await performChangeDiffAnalysis(context);
        }
    );

    // Register runtime trace command
    const runtimeTraceCommand = vscode.commands.registerCommand(
        'vibe-flow.analyzeRuntime',
        async () => {
            await performRuntimeAnalysis(context);
        }
    );

    // Register custom input command
    const customInputCommand = vscode.commands.registerCommand(
        'vibe-flow.analyzeCustom',
        async () => {
            await performCustomAnalysis(context);
        }
    );

    // NEW: Auto-capture runtime flow - Start
    const startAutoCaptureCommand = vscode.commands.registerCommand(
        'vibe-flow.startAutoCapture',
        async () => {
            await startAutoCapture(context, debugFlowCapture);
        }
    );

    // NEW: Auto-capture runtime flow - Stop and Analyze
    const stopAutoCaptureCommand = vscode.commands.registerCommand(
        'vibe-flow.stopAutoCapture',
        async () => {
            await stopAutoCapture(context, debugFlowCapture);
        }
    );

    // NEW: Auto-capture runtime flow - Start with current debug session
    const captureCurrentDebugCommand = vscode.commands.registerCommand(
        'vibe-flow.captureCurrentDebug',
        async () => {
            await captureCurrentDebugSession(context, debugFlowCapture);
        }
    );

    // NEW: Show flow diagram
    const showDiagramCommand = vscode.commands.registerCommand(
        'vibe-flow.showFlowDiagram',
        async () => {
            await showFlowDiagramCommand(context);
        }
    );

    context.subscriptions.push(
        staticAnalysisCommand,
        changeDiffCommand,
        runtimeTraceCommand,
        customInputCommand,
        startAutoCaptureCommand,
        stopAutoCaptureCommand,
        captureCurrentDebugCommand,
        showDiagramCommand
    );
}

/**
 * Perform static analysis on current workspace
 */
async function performStaticAnalysis(context: vscode.ExtensionContext) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder is open.');
        return;
    }

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Code Flow Mapper: Static Analysis',
            cancellable: false
        },
        async (progress) => {
            try {
                progress.report({ increment: 0, message: 'Scanning files...' });
                
                const workspaceRoot = workspaceFolders[0].uri.fsPath;
                const files = await collectWorkspaceFiles(workspaceRoot);
                
                if (files.length === 0) {
                    vscode.window.showWarningMessage('No supported files found in workspace.');
                    return;
                }

                progress.report({ increment: 30, message: `Analyzing ${files.length} files...` });

                const input: AnalysisInput = {
                    mode: 'static',
                    files
                };

                const mapper = new CodeFlowMapper(workspaceRoot);
                const result = await mapper.analyze(input);

                progress.report({ increment: 90, message: 'Generating output...' });

                await showResult(result, 'Static Analysis Result', context);

                progress.report({ increment: 100, message: 'Done!' });
                
                vscode.window.showInformationMessage(
                    `Analysis complete! Found ${result.nodes.length} symbols and ${result.edges.length} connections.`
                );
            } catch (error) {
                vscode.window.showErrorMessage(`Analysis failed: ${error}`);
                console.error('Error during analysis:', error);
            }
        }
    );
}

/**
 * Perform change diff analysis using git
 */
async function performChangeDiffAnalysis(context: vscode.ExtensionContext) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder is open.');
        return;
    }

    // Ask user for commit/branch to compare against
    const compareRef = await vscode.window.showInputBox({
        prompt: 'Enter git ref to compare against (e.g., HEAD, main, commit hash)',
        value: 'HEAD~1',
        placeHolder: 'HEAD~1'
    });

    if (!compareRef) {
        return;
    }

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Code Flow Mapper: Change Diff Analysis',
            cancellable: false
        },
        async (progress) => {
            try {
                progress.report({ increment: 0, message: 'Loading files...' });
                
                const workspaceRoot = workspaceFolders[0].uri.fsPath;
                const currentFiles = await collectWorkspaceFiles(workspaceRoot);
                
                progress.report({ increment: 20, message: 'Loading previous version...' });
                
                // For now, just use current files as both versions
                // In production, you'd use git to get previous versions
                const prevFiles = currentFiles; // TODO: Implement git integration
                
                vscode.window.showWarningMessage(
                    'Git integration not yet implemented. Showing same version comparison as demo.'
                );

                progress.report({ increment: 50, message: 'Analyzing changes...' });

                const input: AnalysisInput = {
                    mode: 'change_diff',
                    files: currentFiles,
                    prev_files: prevFiles
                };

                const mapper = new CodeFlowMapper(workspaceRoot);
                const result = await mapper.analyze(input);

                progress.report({ increment: 90, message: 'Generating output...' });

                await showResult(result, 'Change Diff Analysis Result', context);

                progress.report({ increment: 100, message: 'Done!' });
            } catch (error) {
                vscode.window.showErrorMessage(`Analysis failed: ${error}`);
                console.error('Error during analysis:', error);
            }
        }
    );
}

/**
 * Perform runtime trace analysis
 */
async function performRuntimeAnalysis(context: vscode.ExtensionContext) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder is open.');
        return;
    }

    // Ask user for trace file
    const traceFileUri = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
            'JSON Files': ['json'],
            'All Files': ['*']
        },
        title: 'Select trace events file'
    });

    if (!traceFileUri || traceFileUri.length === 0) {
        return;
    }

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Code Flow Mapper: Runtime Trace Analysis',
            cancellable: false
        },
        async (progress) => {
            try {
                progress.report({ increment: 0, message: 'Loading trace file...' });
                
                const traceContent = fs.readFileSync(traceFileUri[0].fsPath, 'utf-8');
                const traceEvents = JSON.parse(traceContent);

                progress.report({ increment: 20, message: 'Scanning files...' });
                
                const workspaceRoot = workspaceFolders[0].uri.fsPath;
                const files = await collectWorkspaceFiles(workspaceRoot);

                progress.report({ increment: 50, message: 'Mapping trace to code...' });

                const input: AnalysisInput = {
                    mode: 'runtime',
                    files,
                    trace_events: traceEvents
                };

                const mapper = new CodeFlowMapper(workspaceRoot);
                const result = await mapper.analyze(input);

                progress.report({ increment: 90, message: 'Generating output...' });

                await showResult(result, 'Runtime Trace Analysis Result', context);

                progress.report({ increment: 100, message: 'Done!' });
            } catch (error) {
                vscode.window.showErrorMessage(`Analysis failed: ${error}`);
                console.error('Error during analysis:', error);
            }
        }
    );
}

/**
 * Perform analysis with custom JSON input
 */
async function performCustomAnalysis(context: vscode.ExtensionContext) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder is open.');
        return;
    }

    // Ask user for input file
    const inputFileUri = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
            'JSON Files': ['json'],
            'All Files': ['*']
        },
        title: 'Select analysis input file'
    });

    if (!inputFileUri || inputFileUri.length === 0) {
        return;
    }

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Code Flow Mapper: Custom Analysis',
            cancellable: false
        },
        async (progress) => {
            try {
                progress.report({ increment: 0, message: 'Loading input file...' });
                
                const inputContent = fs.readFileSync(inputFileUri[0].fsPath, 'utf-8');
                const input: AnalysisInput = JSON.parse(inputContent);

                progress.report({ increment: 30, message: 'Performing analysis...' });

                const workspaceRoot = workspaceFolders[0].uri.fsPath;
                const mapper = new CodeFlowMapper(workspaceRoot);
                const result = await mapper.analyze(input);

                progress.report({ increment: 90, message: 'Generating output...' });

                await showResult(result, 'Custom Analysis Result', context);

                progress.report({ increment: 100, message: 'Done!' });
            } catch (error) {
                vscode.window.showErrorMessage(`Analysis failed: ${error}`);
                console.error('Error during analysis:', error);
            }
        }
    );
}

/**
 * Start auto-capture when debugging
 */
async function startAutoCapture(
    context: vscode.ExtensionContext,
    debugFlowCapture: DebugFlowCapture
) {
    if (!vscode.debug.activeDebugSession) {
        const choice = await vscode.window.showInformationMessage(
            'No active debug session. Would you like to start debugging?',
            'Start Debugging',
            'Cancel'
        );
        
        if (choice === 'Start Debugging') {
            vscode.window.showInformationMessage(
                'Please start debugging (F5), then run this command again.'
            );
        }
        return;
    }

    const sessionId = await debugFlowCapture.startCapture({
        maxEvents: 10000,
        captureVariables: false,
        frameDepthLimit: 20
    });

    if (sessionId) {
        vscode.window.showInformationMessage(
            '🎬 Auto-capture started! Step through your code (F10/F11) or continue (F5) to capture execution flow. Use "Stop Auto-Capture" when done.'
        );
    }
}

/**
 * Stop auto-capture and analyze the captured flow
 */
async function stopAutoCapture(
    context: vscode.ExtensionContext,
    debugFlowCapture: DebugFlowCapture
) {
    if (!debugFlowCapture.isCapturing()) {
        vscode.window.showWarningMessage('No active capture session. Use "Start Auto-Capture" first.');
        return;
    }

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Processing captured execution flow...',
            cancellable: false
        },
        async (progress) => {
            try {
                progress.report({ increment: 0, message: 'Stopping capture...' });
                
                const traceEvents = await debugFlowCapture.stopCapture();
                
                if (traceEvents.length === 0) {
                    vscode.window.showWarningMessage(
                        'No events captured. Make sure to step through your code while capture is active.'
                    );
                    return;
                }

                progress.report({ increment: 20, message: `Processing ${traceEvents.length} events...` });

                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders || workspaceFolders.length === 0) {
                    vscode.window.showErrorMessage('No workspace folder is open.');
                    return;
                }

                const workspaceRoot = workspaceFolders[0].uri.fsPath;
                const files = await collectWorkspaceFiles(workspaceRoot);

                progress.report({ increment: 50, message: 'Mapping to code structure...' });

                const input: AnalysisInput = {
                    mode: 'runtime',
                    files,
                    trace_events: traceEvents
                };

                const mapper = new CodeFlowMapper(workspaceRoot);
                const result = await mapper.analyze(input);

                progress.report({ increment: 90, message: 'Generating output...' });

                await showResult(result, 'Auto-Captured Runtime Flow', context);

                progress.report({ increment: 100, message: 'Done!' });

                vscode.window.showInformationMessage(
                    `✅ Captured ${traceEvents.length} execution events! Found ${result.nodes.length} symbols and ${result.edges.length} connections.`
                );
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to process capture: ${error}`);
                console.error('Error processing capture:', error);
            }
        }
    );
}

/**
 * Capture and analyze the current debug session immediately
 */
async function captureCurrentDebugSession(
    context: vscode.ExtensionContext,
    debugFlowCapture: DebugFlowCapture
) {
    if (!vscode.debug.activeDebugSession) {
        vscode.window.showWarningMessage(
            'No active debug session. Start debugging (F5) first.'
        );
        return;
    }

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Capturing current debug session...',
            cancellable: false
        },
        async (progress) => {
            try {
                progress.report({ increment: 0, message: 'Starting capture...' });
                
                // Start capture
                await debugFlowCapture.startCapture({
                    maxEvents: 5000,
                    captureVariables: false
                });

                progress.report({ increment: 20, message: 'Capturing execution state...' });

                // Give it a moment to capture current state
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Stop and get events
                const traceEvents = await debugFlowCapture.stopCapture();

                if (traceEvents.length === 0) {
                    vscode.window.showInformationMessage(
                        'Debug session captured but no events recorded. The debugger may be at a breakpoint. Continue execution (F5) or step through code (F10/F11) to capture events.'
                    );
                    return;
                }

                progress.report({ increment: 50, message: `Processing ${traceEvents.length} events...` });

                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders || workspaceFolders.length === 0) {
                    vscode.window.showErrorMessage('No workspace folder is open.');
                    return;
                }

                const workspaceRoot = workspaceFolders[0].uri.fsPath;
                const files = await collectWorkspaceFiles(workspaceRoot);

                progress.report({ increment: 70, message: 'Mapping to code structure...' });

                const input: AnalysisInput = {
                    mode: 'runtime',
                    files,
                    trace_events: traceEvents
                };

                const mapper = new CodeFlowMapper(workspaceRoot);
                const result = await mapper.analyze(input);

                progress.report({ increment: 90, message: 'Generating output...' });

                await showResult(result, 'Debug Session Snapshot', context);

                progress.report({ increment: 100, message: 'Done!' });

                vscode.window.showInformationMessage(
                    `✅ Captured debug session with ${traceEvents.length} events!`
                );
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to capture session: ${error}`);
                console.error('Error capturing session:', error);
            }
        }
    );
}

/**
 * Collect files from workspace
 */
async function collectWorkspaceFiles(workspaceRoot: string): Promise<FileInput[]> {
    const files: FileInput[] = [];
    
    const excludePatterns = [
        '**/node_modules/**',
        '**/dist/**',
        '**/out/**',
        '**/build/**',
        '**/.git/**',
        '**/vendor/**',
        '**/venv/**',
        '**/__pycache__/**',
        '**/.*'
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
        '**/*.kt',
        '**/*.swift'
    ];

    for (const pattern of filePatterns) {
        const foundFiles = await vscode.workspace.findFiles(
            pattern,
            `{${excludePatterns.join(',')}}`
        );
        
        for (const fileUri of foundFiles) {
            const content = fs.readFileSync(fileUri.fsPath, 'utf-8');
            const relativePath = path.relative(workspaceRoot, fileUri.fsPath).replace(/\\/g, '/');
            
            files.push({
                path: relativePath,
                language: '', // Will be auto-detected
                content
            });
        }
    }

    return files;
}

/**
 * Show analysis result
 */
async function showResult(result: CodeFlowAnalysisResult, title: string, context: vscode.ExtensionContext) {
    // Create a new untitled document with the result
    const doc = await vscode.workspace.openTextDocument({
        content: JSON.stringify(result, null, 2),
        language: 'json'
    });

    await vscode.window.showTextDocument(doc, {
        preview: false,
        viewColumn: vscode.ViewColumn.Beside
    });

    // Also save to file
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
        const outputPath = path.join(
            workspaceFolders[0].uri.fsPath,
            'code-flow-analysis-result.json'
        );
        
        fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
        
        vscode.window.showInformationMessage(
            `Result saved to: code-flow-analysis-result.json`,
            'Open File',
            'Show Diagram'
        ).then(selection => {
            if (selection === 'Open File') {
                vscode.workspace.openTextDocument(outputPath).then(doc => {
                    vscode.window.showTextDocument(doc);
                });
            } else if (selection === 'Show Diagram') {
                showFlowDiagram(context, result, 'flowchart');
            }
        });
    }
}

/**
 * Show flow diagram for last analysis result
 */
async function showFlowDiagramCommand(context: vscode.ExtensionContext) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder is open.');
        return;
    }

    const resultPath = path.join(
        workspaceFolders[0].uri.fsPath,
        'code-flow-analysis-result.json'
    );

    if (!fs.existsSync(resultPath)) {
        vscode.window.showWarningMessage(
            'No analysis result found. Run an analysis first.',
            'Run Static Analysis'
        ).then(selection => {
            if (selection === 'Run Static Analysis') {
                vscode.commands.executeCommand('vibe-flow.analyzeStatic');
            }
        });
        return;
    }

    try {
        const content = fs.readFileSync(resultPath, 'utf-8');
        const result: CodeFlowAnalysisResult = JSON.parse(content);

        // Ask user which diagram type they want
        const diagramType = await vscode.window.showQuickPick([
            { label: '📊 Flowchart', value: 'flowchart', description: 'Show function call flow' },
            { label: '🏛️ Class Diagram', value: 'class', description: 'Show class relationships' },
            { label: '⏱️ Sequence Diagram', value: 'sequence', description: 'Show execution timeline' }
        ], {
            placeHolder: 'Select diagram type'
        });

        if (!diagramType) {
            return;
        }

        await showFlowDiagram(context, result, diagramType.value as any);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to load analysis result: ${error}`);
    }
}

export function deactivate() {
    console.log('Code Flow Mapper extension deactivated');
}

