import * as vscode from 'vscode';
import { FileAnalyzer } from './fileAnalyzer';
import { DiagramViewProvider } from './diagramView';
import { FunctionAnalyzer } from './functionAnalyzer';
import { FunctionDiagramViewProvider } from './functionDiagramView';
import { activate as activateCodeFlowMapper } from './codeFlowExtension';

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "vibe-flow" is now active!');

	// Activate Code Flow Mapper
	activateCodeFlowMapper(context);

	const diagramProvider = new DiagramViewProvider(context);
	const functionDiagramProvider = new FunctionDiagramViewProvider(context);

	// Register the project diagram command
	let showDiagramCommand = vscode.commands.registerCommand('vibe-flow.showProjectDiagram', async () => {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		
		if (!workspaceFolders || workspaceFolders.length === 0) {
			vscode.window.showErrorMessage('No workspace folder is open. Please open a project folder first.');
			return;
		}

		// Show progress notification
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: 'Analyzing project structure...',
			cancellable: false
		}, async (progress) => {
			try {
				progress.report({ increment: 0, message: 'Scanning files...' });
				
				const workspaceRoot = workspaceFolders[0].uri.fsPath;
				const analyzer = new FileAnalyzer(workspaceRoot);
				
				progress.report({ increment: 50, message: 'Analyzing dependencies...' });
				const graph = await analyzer.analyzeProject();
				
				if (graph.nodes.length === 0) {
					vscode.window.showWarningMessage('No supported source files found in the workspace.');
					return;
				}
				
				progress.report({ increment: 90, message: 'Generating diagram...' });
				await diagramProvider.showDiagram(graph);
				
				progress.report({ increment: 100, message: 'Done!' });
				vscode.window.showInformationMessage(
					`Project diagram generated! Found ${graph.nodes.length} files with ${graph.edges.length} connections.`
				);
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to generate diagram: ${error}`);
				console.error('Error generating diagram:', error);
			}
		});
	});

	// Register the hello world command (kept for reference)
	let helloWorldCommand = vscode.commands.registerCommand('vibe-flow.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from Vibe Flow!');
	});

	// Register the function call graph command
	let showFunctionGraphCommand = vscode.commands.registerCommand('vibe-flow.showFunctionCallGraph', async () => {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		
		if (!workspaceFolders || workspaceFolders.length === 0) {
			vscode.window.showErrorMessage('No workspace folder is open. Please open a project folder first.');
			return;
		}

		// Show progress notification
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: 'Analyzing function calls...',
			cancellable: false
		}, async (progress) => {
			try {
				progress.report({ increment: 0, message: 'Scanning files...' });
				
				const workspaceRoot = workspaceFolders[0].uri.fsPath;
				const analyzer = new FunctionAnalyzer(workspaceRoot);
				
				progress.report({ increment: 30, message: 'Extracting functions...' });
				const graph = await analyzer.analyzeProject();
				
				console.log('Function analysis complete:', {
					functions: graph.nodes.length,
					edges: graph.edges.length
				});
				
				if (graph.nodes.length === 0) {
					vscode.window.showWarningMessage('No functions found in the workspace.');
					return;
				}
				
				progress.report({ increment: 80, message: 'Building call graph...' });
				await functionDiagramProvider.showDiagram(graph);
				
				progress.report({ increment: 100, message: 'Done!' });
				
				const message = graph.edges.length > 0 
					? `Function call graph generated! Found ${graph.nodes.length} functions with ${graph.edges.length} connections.`
					: `Found ${graph.nodes.length} functions, but no connections detected. Check the Output panel (View > Output > select "Extension Host") for debug info.`;
				
				vscode.window.showInformationMessage(message);
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to generate function graph: ${error}`);
				console.error('Error generating function graph:', error);
			}
		});
	});

	context.subscriptions.push(showDiagramCommand, helloWorldCommand, showFunctionGraphCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {}

