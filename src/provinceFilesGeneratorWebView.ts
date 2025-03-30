import * as vscode from 'vscode';

export class ProvinceFilesGeneratorWebview {
    private static panel: vscode.WebviewPanel | undefined;

    public static open(context: vscode.ExtensionContext) {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            "provinceFilesGenerator",
            "Province Files Generator",
            vscode.ViewColumn.One,
            {
                enableScripts: true, // Enable JavaScript
                retainContextWhenHidden: true, // Keep state when hidden
            }
        );

        this.panel.webview.html = this.getWebviewContent();

        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage((message) => {
            switch (message.command) {
                case "sendInput":
                    // Process the CSV input
                    this.processInput(message.text);
                    break;
            }
        });

        // Handle panel disposal
        this.panel.onDidDispose(() => {
            this.panel = undefined;
        }, null, context.subscriptions);
    }

    private static getWebviewContent(): string {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Province Generator</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        padding: 20px;
                        color: var(--vscode-foreground);
                        background-color: var(--vscode-editor-background);
                    }
                    input, textarea, button, select {
                        font-family: var(--vscode-font-family);
                        background-color: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border: 1px solid var(--vscode-input-border);
                        padding: 6px 8px;
                        border-radius: 2px;
                    }
                    input:focus, textarea:focus, button:focus, select:focus {
                        outline: 1px solid var(--vscode-focusBorder);
                    }
                </style>
            </head>
            <body>
                <h1>Enter Province Data</h1>
                <textarea id="csvInput" rows="10" cols="50" placeholder="Enter CSV data here (semicolon separated)"></textarea>
                <button id="submitButton">Submit</button>
                <div id="output"></div>

                <script>
                    const vscode = acquireVsCodeApi();

                    document.getElementById("submitButton").addEventListener("click", () => {
                    const csvInput = document.getElementById("csvInput").value.trim();
                    const outputDiv = document.getElementById("output");

                    if (csvInput) {
                        // Split the CSV input by lines
                        const lines = csvInput.split("\\n");
                        let outputHTML = "";

                        // Process each line (skip the header)
                        for (let i = 0; i < lines.length; i++) {
                            const columns = lines[i].split(";");
                            
                            if (columns.length > 1) {
                                const provinceId = columns[0];
                                const red = columns[1];
                                const green = columns[2];
                                const blue = columns[3];
                                const name = columns[4];

                                // Construct HTML for each row
                                outputHTML += \`<p>PROV\${provinceId};\${name};;;;;;;;;;;;;x</p>\`;
                            }
                        }

                        // Insert the output HTML
                        outputDiv.innerHTML = \`<h1>Province Localisation</h1>\` + outputHTML;
                    }
                });
            </script>
        </body>
        </html>
    `;
    }

    // Process the CSV input and extract necessary parts
    private static processInput(input: string): void {
        // Split the input by semicolons
        const parts = input.split(';');

        // Check if the input has the right number of fields
        if (parts.length >= 5) {
            const provinceId = parts[0].trim();
            const red = parts[1].trim();
            const green = parts[2].trim();
            const blue = parts[3].trim();
            const name = parts[4].trim();
            // Optionally capture 'x' if needed
            const x = parts[5]?.trim();

            // Validate numeric values (optional)
            if (!/^\d+$/.test(provinceId)) {
                vscode.window.showErrorMessage("Province ID must be a numeric value.");
                return;
            }

            // Show the extracted data as a message in VSCode
            vscode.window.showInformationMessage(
                `PROV${provinceId};${name};;;;;;;;;;;;;x`
            );

            // You can send this data back to the webview if necessary
            this.panel?.webview.postMessage({
                command: "showResult",
                provinceId,
                name,
                rgb: { red, green, blue },
                x // Include 'x' if needed
            });
        } else {
            vscode.window.showErrorMessage("Invalid input format. Please follow the format: ProvinceID;Red;Green;Blue;Name;x");
        }
    }
}
