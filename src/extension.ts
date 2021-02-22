// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import * as vscode from 'vscode';
import { getVSCodeDownloadUrl } from 'vscode-test/out/util';
import { Makefile } from "./makefile";


let mk: Makefile;

// https://github.com/microsoft/vscode-makefile-tools
// https://code.visualstudio.com/api

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	let makefilePath = vscode.window.activeTextEditor?.document.fileName
	if (makefilePath != undefined && fs.existsSync(makefilePath)) {
		mk = new Makefile(makefilePath);
	}

	let DocumentSelector = { scheme: 'file', language: 'makefile' };

	vscode.workspace.onDidSaveTextDocument(() => {
		let makefilePath = vscode.window.activeTextEditor?.document.fileName
		if (makefilePath != undefined && fs.existsSync(makefilePath)) {
			mk = new Makefile(makefilePath);
		}
	});

	let disposable = vscode.languages.registerDefinitionProvider(DocumentSelector, new GoDefinitionProvider());
	context.subscriptions.push(disposable);

	disposable = vscode.languages.registerHoverProvider(DocumentSelector, new HoverProvider());
	context.subscriptions.push(disposable);

}

// this method is called when your extension is deactivated
export function deactivate() { }

export class HoverProvider implements vscode.HoverProvider {
	provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
		const variable = document.getText(document.getWordRangeAtPosition(position, /(\w+)/g));

		return mk.getHover(variable, position, document);
	}
}

export class GoDefinitionProvider implements vscode.DefinitionProvider {

	public provideDefinition(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken
	): vscode.ProviderResult<vscode.Definition> {
		const variable = document.getText(document.getWordRangeAtPosition(position, /(\w+)/g));
		// console.log("Call go to definition: " + variable + " at " + document.fileName + " position: " + position.character);

		return mk.getDefinition(variable);
	}
}