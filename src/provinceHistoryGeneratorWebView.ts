import * as vscode from 'vscode';

interface ProvinceHistory {
    provinceId: string;
    provinceName: string;
    owner: string;
    controller: string;
    cores: string[];
    tradeGoods: string;
    lifeRating: number;
    terrain: string;
    colonial: number;
}

export class ProvinceHistoryGeneratorWebview {
    private static panel: vscode.WebviewPanel | undefined;

    static open(context: vscode.ExtensionContext) {
        if (ProvinceHistoryGeneratorWebview.panel) {
            ProvinceHistoryGeneratorWebview.panel.reveal();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'provinceHistoryGenerator',
            'Province History Generator',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        ProvinceHistoryGeneratorWebview.panel = panel;

        panel.webview.html = ProvinceHistoryGeneratorWebview.getWebviewContent();

        panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'generate':
                        const data = message.data;
                        const provinces = data.provinces;
                        
                        // Prompt user to select directory to save files
                        const folderUri = await vscode.window.showOpenDialog({
                            canSelectFiles: false,
                            canSelectFolders: true,
                            canSelectMany: false,
                            openLabel: 'Select Directory to Save Province Files',
                            defaultUri: vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri : undefined
                        });
                        
                        if (!folderUri || folderUri.length === 0) {
                            vscode.window.showInformationMessage('Operation cancelled by user.');
                            return;
                        }
                        
                        const targetDir = folderUri[0];
                        let localizationContent = '';
                        
                        try {
                            // Save individual province files
                            for (const province of provinces) {
                                // Generate province code
                                let provinceCode = '';
                                provinceCode += `owner = ${province.owner || "---"}\n`;
                                provinceCode += `controller = ${province.controller || "---"}\n`;
                                
                                if (province.cores && province.cores.length > 0) {
                                    for (const core of province.cores) {
                                        provinceCode += `add_core = ${core}\n`;
                                    }
                                }
                                
                                provinceCode += `trade_goods = ${province.tradeGoods}\n`;
                                provinceCode += `life_rating = ${province.lifeRating}\n`;
                                provinceCode += `terrain = ${province.terrain}\n`;
                                provinceCode += `colonial = ${province.colonial}\n`;
                                
                                // Add to localization content
                                localizationContent += `PROV${province.provinceId};${province.provinceName};;;;;;;;;;;;;x\n`;
                                
                                // Save province file
                                const fileName = `${province.provinceId} - ${province.provinceName}.txt`;
                                const fileUri = vscode.Uri.joinPath(targetDir, fileName);
                                await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(provinceCode));
                            }
                            
                            // Save localization file
                            const locFilePath = vscode.Uri.joinPath(targetDir, 'province_names.csv');
                            await vscode.workspace.fs.writeFile(locFilePath, new TextEncoder().encode(localizationContent));
                            
                            // Open the localization file
                            const document = await vscode.workspace.openTextDocument(locFilePath);
                            await vscode.window.showTextDocument(document);
                            
                            vscode.window.showInformationMessage(`Successfully generated ${provinces.length} province file(s) and localization file.`);
                        } catch (error) {
                            vscode.window.showErrorMessage(`Error saving files: ${error instanceof Error ? error.message : String(error)}`);
                        }
                        break;
                    case 'error':
                        vscode.window.showErrorMessage(message.message);
                        break;
                }
            },
            undefined,
            context.subscriptions
        );

        panel.onDidDispose(
            () => {
                ProvinceHistoryGeneratorWebview.panel = undefined;
            },
            null,
            context.subscriptions
        );
    }

    private static getWebviewContent(): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Province History Generator</title>
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
                .form-group {
                    margin-bottom: 15px;
                }
                label {
                    display: block;
                    margin-bottom: 5px;
                }
                .input-field {
                    width: 100%;
                    box-sizing: border-box;
                }
                .province-group {
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 3px;
                    margin: 1em 0;
                    background-color: var(--vscode-editor-background);
                }
                .province-group-header {
                    padding: .8em;
                    font-weight: bold;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    cursor: pointer;
                    background-color: var(--vscode-panel-background);
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                .province-group-header:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                .province-group-content {
                    padding: .8em;
                    display: none;
                }
                .province-group.expanded .province-group-content {
                    display: block;
                }
                .province-group-remove {
                    cursor: pointer;
                    color: var(--vscode-errorForeground);
                }
                .province-group-toggle {
                    margin-right: 8px;
                }
                .button-row {
                    display: flex;
                    justify-content: space-between;
                    margin-top: 20px;
                }
                button {
                    cursor: pointer;
                    padding: 8px 16px;
                }
                .primary-button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                }
                .primary-button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                .secondary-button {
                    background-color: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                }
                .info-text {
                    font-style: italic;
                    color: var(--vscode-descriptionForeground);
                    margin-top: 5px;
                }
                .rename-item {
                    margin-bottom: 15px;
                    padding-bottom: 15px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    padding: 15px;
                    border-radius: 3px;
                }
                .rename-item:last-child {
                    border-bottom: none;
                    margin-bottom: 0;
                }
                .rename-item-header {
                    font-weight: 600;
                    margin-bottom: 12px;
                    display: flex;
                    justify-content: space-between;
                    padding-bottom: 8px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    cursor: pointer;
                }
                .rename-item-remove {
                    cursor: pointer;
                    color: var(--vscode-errorForeground);
                }
                .rename-item-toggle {
                    margin-right: 8px;
                }
                .rename-item-content {
                    display: none;
                }
                .rename-item.expanded .rename-item-content {
                    display: block;
                }
            </style>
        </head>
        <body>
            <h1>Province History Generator</h1>
            
            <div class="province-history-container">
                <h2>Provinces</h2>
                <div id="provincesContainer"></div>
                
                <button type="button" id="addProvince" class="secondary-button">
                    Add Province
                </button>
            </div>
            
            <div class="button-row">
                <button type="button" id="generate" class="primary-button">Generate Code</button>
            </div>

            <script>
                (function() {
                    const vscode = acquireVsCodeApi();
                    let provinceGroupCounter = 0;
                    let coreCounter = 0;
                    
                    function addProvinceGroup() {
                        const container = document.getElementById('provincesContainer');
                        const provinceGroupId = provinceGroupCounter++;
                        
                        const provinceGroup = document.createElement('div');
                        provinceGroup.className = 'province-group expanded';
                        provinceGroup.id = 'province-group-' + provinceGroupId;
                        
                        provinceGroup.innerHTML = \`
                            <div class="province-group-header" data-id="\${provinceGroupId}">
                                <span>
                                    <span class="province-group-toggle">-</span>
                                    <span class="province-group-title">New Province</span>
                                </span>
                                <span class="province-group-remove" data-id="\${provinceGroupId}">x</span>
                            </div>
                            <div class="province-group-content">
                                <div class="form-group">
                                    <label for="provinceId-\${provinceGroupId}">Province ID:</label>
                                    <input type="text" id="provinceId-\${provinceGroupId}" class="input-field" 
                                        placeholder="e.g. 300" required>
                                    <div class="info-text">Specify the numeric ID of the province.</div>
                                </div>
                                
                                <div class="form-group">
                                    <label for="provinceName-\${provinceGroupId}">Province Name:</label>
                                    <input type="text" id="provinceName-\${provinceGroupId}" class="input-field" 
                                        placeholder="e.g. London" required>
                                </div>
                                
                                <div class="form-group">
                                    <label for="owner-\${provinceGroupId}">Owner:</label>
                                    <input type="text" id="owner-\${provinceGroupId}" class="input-field" 
                                        placeholder="e.g. ENG">
                                    <div class="info-text">The country tag that owns this province (optional).</div>
                                </div>
                                
                                <div class="form-group">
                                    <label for="controller-\${provinceGroupId}">Controller:</label>
                                    <input type="text" id="controller-\${provinceGroupId}" class="input-field" 
                                        placeholder="e.g. ENG">
                                    <div class="info-text">The country tag that controls this province (optional).</div>
                                </div>
                                
                                <div class="form-group">
                                    <label>Cores:</label>
                                    <div id="cores-list-\${provinceGroupId}">
                                        <!-- Core items will be added here -->
                                    </div>
                                    <button type="button" id="add-core-\${provinceGroupId}" 
                                        class="secondary-button">Add Core</button>
                                    <div class="info-text">Countries that have cores on this province. You can add multiple.</div>
                                </div>
                                
                                <div class="form-group">
                                    <label for="tradeGoods-\${provinceGroupId}">Trade Goods:</label>
                                    <input type="text" id="tradeGoods-\${provinceGroupId}" class="input-field" 
                                        placeholder="e.g. grain" required>
                                    <div class="info-text">The trade good produced in this province.</div>
                                </div>
                                
                                <div class="form-group">
                                    <label for="lifeRating-\${provinceGroupId}">Life Rating:</label>
                                    <input type="number" id="lifeRating-\${provinceGroupId}" class="input-field" 
                                        placeholder="e.g. 35" required min="1" max="100">
                                    <div class="info-text">Life rating for this province (1-100).</div>
                                </div>
                                
                                <div class="form-group">
                                    <label for="terrain-\${provinceGroupId}">Terrain:</label>
                                    <input type="text" id="terrain-\${provinceGroupId}" class="input-field" 
                                        placeholder="e.g. plains" required>
                                    <div class="info-text">Terrain type for this province (plains, farmlands, forest, etc.).</div>
                                </div>
                                
                                <div class="form-group">
                                    <label for="colonial-\${provinceGroupId}">Colonial:</label>
                                    <input type="number" id="colonial-\${provinceGroupId}" class="input-field" 
                                        placeholder="e.g. 2" required min="1" max="3">
                                    <div class="info-text">Colonial value (1-3).</div>
                                </div>
                            </div>
                        \`;
                        
                        container.appendChild(provinceGroup);
                        
                        // Set up event listeners for the new province group
                        provinceGroup.querySelector('.province-group-header').addEventListener('click', function(e) {
                            if (!e.target.classList.contains('province-group-remove')) {
                                const id = this.getAttribute('data-id');
                                toggleProvinceGroup(id);
                            }
                        });
                        
                        provinceGroup.querySelector('.province-group-remove').addEventListener('click', function() {
                            const id = this.getAttribute('data-id');
                            const groupToRemove = document.getElementById('province-group-' + id);
                            groupToRemove.remove();
                        });
                        
                        // Setup core adding functionality
                        const addCoreButton = document.getElementById('add-core-' + provinceGroupId);
                        
                        addCoreButton.addEventListener('click', function() {
                            addCore(provinceGroupId);
                        });
                        
                        // Update province title when ID or name changes
                        const provinceIdInput = document.getElementById('provinceId-' + provinceGroupId);
                        const provinceNameInput = document.getElementById('provinceName-' + provinceGroupId);
                        
                        provinceIdInput.addEventListener('input', function() {
                            updateProvinceTitle(provinceGroupId);
                        });
                        
                        provinceNameInput.addEventListener('input', function() {
                            updateProvinceTitle(provinceGroupId);
                        });
                        
                        return provinceGroup;
                    }
                    
                    function addCore(provinceGroupId) {
                        const coresList = document.getElementById('cores-list-' + provinceGroupId);
                        const coreId = 'core-' + provinceGroupId + '-' + coreCounter++;
                        
                        const coreItem = document.createElement('div');
                        coreItem.className = 'rename-item expanded';
                        coreItem.id = coreId;
                        
                        coreItem.innerHTML = \`
                            <div class="rename-item-header" data-id="\${coreId}">
                                <span>
                                    <span class="rename-item-toggle">-</span>
                                    <span class="rename-item-title">New Core</span>
                                </span>
                                <span class="rename-item-remove" data-id="\${coreId}">x</span>
                            </div>
                            <div class="rename-item-content">
                                <div class="form-group">
                                    <label for="core-value-\${coreId}">Country Tag:</label>
                                    <input type="text" id="core-value-\${coreId}" class="input-field" 
                                        placeholder="e.g. ENG" required>
                                </div>
                            </div>
                        \`;
                        
                        coresList.appendChild(coreItem);
                        
                        // Set up event listeners
                        coreItem.querySelector('.rename-item-remove').addEventListener('click', function(e) {
                            e.stopPropagation();
                            const id = this.getAttribute('data-id');
                            document.getElementById(id).remove();
                        });
                        
                        coreItem.querySelector('.rename-item-header').addEventListener('click', function(e) {
                            if (!e.target.classList.contains('rename-item-remove')) {
                                const id = this.getAttribute('data-id');
                                toggleRenameItem(id);
                            }
                        });
                        
                        coreItem.querySelector('#core-value-' + coreId).addEventListener('input', function() {
                            updateCoreTitle(coreId);
                        });
                        
                        return coreItem;
                    }
                    
                    function toggleProvinceGroup(id) {
                        const group = document.getElementById('province-group-' + id);
                        const isExpanded = group.classList.contains('expanded');
                        const toggle = group.querySelector('.province-group-toggle');
                        
                        if (isExpanded) {
                            group.classList.remove('expanded');
                            toggle.textContent = '+';
                        } else {
                            group.classList.add('expanded');
                            toggle.textContent = '-';
                        }
                    }
                    
                    function toggleRenameItem(id) {
                        const item = document.getElementById(id);
                        if (!item) return;
                        
                        const isExpanded = item.classList.contains('expanded');
                        const toggle = item.querySelector('.rename-item-toggle');
                        
                        if (isExpanded) {
                            item.classList.remove('expanded');
                            toggle.textContent = '+';
                        } else {
                            item.classList.add('expanded');
                            toggle.textContent = '-';
                        }
                    }
                    
                    function updateProvinceTitle(provinceGroupId) {
                        const provinceIdInput = document.getElementById('provinceId-' + provinceGroupId);
                        const provinceNameInput = document.getElementById('provinceName-' + provinceGroupId);
                        
                        const provinceId = provinceIdInput.value.trim();
                        const provinceName = provinceNameInput.value.trim();
                        
                        const titleElement = document.querySelector('#province-group-' + provinceGroupId + ' .province-group-title');
                        
                        if (provinceId && provinceName) {
                            titleElement.textContent = provinceId + ' - ' + provinceName;
                        } else if (provinceId) {
                            titleElement.textContent = 'Province ID: ' + provinceId;
                        } else if (provinceName) {
                            titleElement.textContent = 'Province: ' + provinceName;
                        } else {
                            titleElement.textContent = 'New Province';
                        }
                    }
                    
                    function updateCoreTitle(coreId) {
                        const coreInput = document.getElementById('core-value-' + coreId);
                        const coreValue = coreInput.value.trim();
                        
                        const titleElement = document.querySelector('#' + coreId + ' .rename-item-title');
                        
                        if (coreValue) {
                            titleElement.textContent = 'Core: ' + coreValue;
                        } else {
                            titleElement.textContent = 'New Core';
                        }
                    }
                    
                    function collectData() {
                        const provinceGroups = document.querySelectorAll('.province-group');
                        if (provinceGroups.length === 0) {
                            vscode.postMessage({
                                command: 'error',
                                message: 'At least one province is required'
                            });
                            return null;
                        }
                        
                        const provinces = [];
                        
                        for (const group of provinceGroups) {
                            const groupId = group.id.split('-')[2];
                            
                            const provinceId = document.getElementById('provinceId-' + groupId).value.trim();
                            if (!provinceId) {
                                vscode.postMessage({
                                    command: 'error',
                                    message: 'Province ID is required for all provinces'
                                });
                                return null;
                            }
                            
                            if (!/^\\d+$/.test(provinceId)) {
                                vscode.postMessage({
                                    command: 'error',
                                    message: \`Invalid province ID: \${provinceId}. ID must be numeric.\`
                                });
                                return null;
                            }
                            
                            const provinceName = document.getElementById('provinceName-' + groupId).value.trim();
                            if (!provinceName) {
                                vscode.postMessage({
                                    command: 'error',
                                    message: 'Province Name is required for all provinces'
                                });
                                return null;
                            }
                            
                            const owner = document.getElementById('owner-' + groupId).value.trim();
                            const controller = document.getElementById('controller-' + groupId).value.trim();
                            
                            // Collect cores
                            const coreElements = document.querySelectorAll('#cores-list-' + groupId + ' .rename-item');
                            const cores = [];
                            
                            for (const coreElement of coreElements) {
                                const coreId = coreElement.id;
                                const coreInput = document.getElementById('core-value-' + coreId);
                                
                                if (coreInput && coreInput.value.trim()) {
                                    cores.push(coreInput.value.trim());
                                }
                            }
                            
                            const tradeGoods = document.getElementById('tradeGoods-' + groupId).value.trim();
                            if (!tradeGoods) {
                                vscode.postMessage({
                                    command: 'error',
                                    message: 'Trade Goods is required for all provinces'
                                });
                                return null;
                            }
                            
                            const lifeRatingInput = document.getElementById('lifeRating-' + groupId);
                            const lifeRating = lifeRatingInput.value.trim() ? parseInt(lifeRatingInput.value) : null;
                            if (lifeRating === null || isNaN(lifeRating)) {
                                vscode.postMessage({
                                    command: 'error',
                                    message: 'Life Rating is required and must be a number'
                                });
                                return null;
                            }
                            
                            if (lifeRating < 1 || lifeRating > 100) {
                                vscode.postMessage({
                                    command: 'error',
                                    message: 'Life Rating must be between 1 and 100'
                                });
                                return null;
                            }
                            
                            const terrain = document.getElementById('terrain-' + groupId).value.trim();
                            if (!terrain) {
                                vscode.postMessage({
                                    command: 'error',
                                    message: 'Terrain is required'
                                });
                                return null;
                            }
                            
                            const colonialInput = document.getElementById('colonial-' + groupId);
                            const colonial = colonialInput.value.trim() ? parseInt(colonialInput.value) : null;
                            if (colonial === null || isNaN(colonial)) {
                                vscode.postMessage({
                                    command: 'error',
                                    message: 'Colonial is required and must be a number'
                                });
                                return null;
                            }
                            
                            if (colonial < 1 || colonial > 3) {
                                vscode.postMessage({
                                    command: 'error',
                                    message: 'Colonial must be between 1 and 3'
                                });
                                return null;
                            }
                            
                            provinces.push({
                                provinceId,
                                provinceName,
                                owner,
                                controller,
                                cores,
                                tradeGoods,
                                lifeRating,
                                terrain,
                                colonial
                            });
                        }
                        
                        return { provinces };
                    }
                    
                    // Initialize the first province group
                    addProvinceGroup();
                    
                    // Set up global event listeners
                    document.getElementById('addProvince').addEventListener('click', function() {
                        addProvinceGroup();
                    });
                    
                    document.getElementById('generate').addEventListener('click', function() {
                        const data = collectData();
                        if (data) {
                            vscode.postMessage({
                                command: 'generate',
                                data: data
                            });
                        }
                    });
                })();
            </script>
        </body>
        </html>`;
    }
}