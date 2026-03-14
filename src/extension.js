const vscode = require('vscode');

// Create a global Output Channel for the extension
const outputChannel = vscode.window.createOutputChannel("AI Code Reviewer");

/**
 * Function to get API key or prompt the user if missing
 */
async function getApiKey() {
    const config = vscode.workspace.getConfiguration('aiCodeReviewer');
    let apiKey = config.get('apiKey');

    if (!apiKey) {
        apiKey = await vscode.window.showInputBox({
            prompt: "Enter your Gemini API Key",
            ignoreFocusOut: true,
            password: true,
            placeHolder: "Paste your Gemini API key here"
        });

        if (!apiKey) {
            vscode.window.showErrorMessage("Gemini API Key is required to run AI Code Reviewer.");
            return null;
        }

        await config.update(
            "apiKey",
            apiKey,
            vscode.ConfigurationTarget.Global
        );

        vscode.window.showInformationMessage("Gemini API Key saved successfully.");
    }

    return apiKey;
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Congratulations, your extension "ai-code-reviewer-js" is now active!');

    // Register the Sidebar Webview Provider
    const provider = new SidebarProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            "aiCodeReviewer.sidebar",
            provider
        )
    );

    // Register the main Review Command
    let disposable = vscode.commands.registerCommand('aiCodeReviewer.reviewCode', async function () {

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showInformationMessage('No active workspace folder found. Please open a folder.');
            return;
        }

        const projectPath = workspaceFolders[0].uri.fsPath;

        const config = vscode.workspace.getConfiguration('aiCodeReviewer');

        const apiKey = await getApiKey();
        if (!apiKey) return;

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "AI is reviewing your code...",
            cancellable: false
        }, async () => {
            try {

                outputChannel.show(true);

                const { runAgent } = require('./agent');

                const responseText = await runAgent(
                    projectPath,
                    apiKey,
                    outputChannel
                );

                outputChannel.appendLine("\n--- Final Agent Report ---");
                outputChannel.appendLine(responseText);
                outputChannel.appendLine("--------------------------\n");

                vscode.window.showInformationMessage("AI Review Completed! Check the Output panel.");

            } catch (error) {
                vscode.window.showErrorMessage(`AI Code Review Failed: ${error.message}`);
                outputChannel.appendLine(`ERROR: ${error.message}`);
            }
        });
    });

    context.subscriptions.push(disposable);
}

/**
 * Sidebar Webview Provider
 */
class SidebarProvider {
    constructor(extensionUri) {
        this._extensionUri = extensionUri;
    }

    resolveWebviewView(webviewView) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
        };

        webviewView.webview.html = this._getHtmlForWebview();

        webviewView.webview.onDidReceiveMessage((data) => {
            switch (data.type) {
                case "reviewCurrentFile":
                    vscode.commands.executeCommand("aiCodeReviewer.reviewCode");
                    break;
            }
        });
    }

    _getHtmlForWebview() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI Code Reviewer</title>

<style>
body {
    font-family: var(--vscode-font-family);
    padding: 10px;
    color: var(--vscode-editor-foreground);
}

button {
    width: 100%;
    padding: 10px;
    background-color: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    cursor: pointer;
    border-radius: 4px;
    font-size: 14px;
}

button:hover {
    background-color: var(--vscode-button-hoverBackground);
}

p {
    font-size: 13px;
    line-height: 1.4;
    opacity: 0.8;
}
</style>
</head>

<body>

<h2>AI Code Reviewer</h2>

<p>
Click the button below to send the currently active editor to the AI for review.
The results will be displayed in the <b>Output Panel</b>.
</p>

<br/>

<button id="review-btn">Review Current File</button>

<script>
const vscode = acquireVsCodeApi();

document.getElementById('review-btn').addEventListener('click', () => {
    vscode.postMessage({
        type: 'reviewCurrentFile'
    });
});
</script>

</body>
</html>`;
    }
}

function deactivate() { }

module.exports = {
    activate,
    deactivate
};