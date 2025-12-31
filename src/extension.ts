import * as vscode from 'vscode';
import { FileAnalyzer } from './fileAnalyzer';
import { DiagramViewProvider } from './diagramView';

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "vibe-flow" is now active!');

	const diagramProvider = new DiagramViewProvider(context);

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

	context.subscriptions.push(showDiagramCommand, helloWorldCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {}

