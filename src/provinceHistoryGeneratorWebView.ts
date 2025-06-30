import * as vscode from 'vscode';

interface DateEntry {
    date: string;
    owner: string;
    controller: string;
    cores: string[];
    lifeRating: number;
    colonial: number;
}

interface ProvinceHistory {
    provinceId: string;
    provinceName: string;
    owner: string;
    controller: string;
    cores: string[];
    buildings: { name: string, level: number }[];
    tradeGoods: string;
    lifeRating: number;
    terrain: string;
    colonial: number;
    dateEntries: DateEntry[];
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
                        try {
                            const data = message.data;
                            if (!data || !data.provinces || !Array.isArray(data.provinces)) {
                                vscode.window.showErrorMessage('Invalid data format received.');
                                return;
                            }

                            const provinces = data.provinces;
                            
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
                            const generatedFiles: vscode.Uri[] = []; // Track all generated files
                            
                            for (const province of provinces) {
                                let provinceCode = '';
                                
                                // Add undated owner/controller if specified and no date entries exist
                                if (!province.dateEntries || province.dateEntries.length === 0) {
                                    if (province.owner && province.owner.trim()) {
                                        provinceCode += `owner = ${province.owner}\n`;
                                    }
                                    if (province.controller && province.controller.trim()) {
                                        provinceCode += `controller = ${province.controller}\n`;
                                    }
                                    
                                    // Add undated cores
                                    if (province.cores && province.cores.length > 0) {
                                        for (const core of province.cores) {
                                            if (core.trim()) {
                                                provinceCode += `add_core = ${core}\n`;
                                            }
                                        }
                                    }
                                    
                                    // Add undated life rating
                                    if (province.lifeRating && province.lifeRating > 0) {
                                        provinceCode += `life_rating = ${province.lifeRating}\n`;
                                    }
                                    
                                    // Add undated colonial
                                    if (province.colonial && province.colonial > 0) {
                                        provinceCode += `colonial = ${province.colonial}\n`;
                                    }
                                }
                                
                                // Required fields that are never dated
                                provinceCode += `trade_goods = ${province.tradeGoods}\n`;
                                
                                // Optional terrain (never dated)
                                if (province.terrain && province.terrain.trim()) {
                                    provinceCode += `terrain = ${province.terrain}\n`;
                                }
                                
                                // Add buildings (never dated)
                                if (province.buildings && province.buildings.length > 0) {
                                    for (const building of province.buildings) {
                                        if (building.name.trim() && building.level > 0) {
                                            provinceCode += `${building.name} = ${building.level}\n`;
                                        }
                                    }
                                }
                                
                                // Add date entries
                                if (province.dateEntries && province.dateEntries.length > 0) {
                                    provinceCode += '\n'; // Add blank line before date entries
                                    
                                    for (const dateEntry of province.dateEntries) {
                                        if (dateEntry.date && dateEntry.date.trim()) {
                                            provinceCode += `${dateEntry.date} = {\n`;
                                            
                                            if (dateEntry.owner && dateEntry.owner.trim()) {
                                                provinceCode += `\towner = ${dateEntry.owner}\n`;
                                            }
                                            if (dateEntry.controller && dateEntry.controller.trim()) {
                                                provinceCode += `\tcontroller = ${dateEntry.controller}\n`;
                                            }
                                            
                                            // Add cores for this date
                                            if (dateEntry.cores && dateEntry.cores.length > 0) {
                                                for (const core of dateEntry.cores) {
                                                    if (core.trim()) {
                                                        provinceCode += `\tadd_core = ${core}\n`;
                                                    }
                                                }
                                            }
                                            
                                            // Add life rating for this date
                                            if (dateEntry.lifeRating && dateEntry.lifeRating > 0) {
                                                provinceCode += `\tlife_rating = ${dateEntry.lifeRating}\n`;
                                            }
                                            
                                            // Add colonial for this date
                                            if (dateEntry.colonial && dateEntry.colonial > 0) {
                                                provinceCode += `\tcolonial = ${dateEntry.colonial}\n`;
                                            }
                                            
                                            provinceCode += '}\n';
                                        }
                                    }
                                }
                                
                                // Add to localization
                                localizationContent += `PROV${province.provinceId};${province.provinceName};;;;;;;;;;;;;x\n`;
                                
                                // Save province file
                                const fileName = `${province.provinceId} - ${province.provinceName}.txt`;
                                const fileUri = vscode.Uri.joinPath(targetDir, fileName);
                                await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(provinceCode));
                                generatedFiles.push(fileUri); // Add to list of files to open
                            }
                            
                            // Save localization file
                            const locFilePath = vscode.Uri.joinPath(targetDir, 'province_names.csv');
                            await vscode.workspace.fs.writeFile(locFilePath, new TextEncoder().encode(localizationContent));
                            generatedFiles.push(locFilePath); // Add localization file to list
                            
                            // Open all generated files
                            for (const fileUri of generatedFiles) {
                                const document = await vscode.workspace.openTextDocument(fileUri);
                                await vscode.window.showTextDocument(document, { preview: false });
                            }
                            
                            vscode.window.showInformationMessage(`Successfully generated ${provinces.length} province file(s) and localization file.`);
                        } catch (error) {
                            console.error('Error in generate command:', error);
                            vscode.window.showErrorMessage(`Error saving files: ${error instanceof Error ? error.message : String(error)}`);
                        }
                        break;
                    case 'error':
                        vscode.window.showErrorMessage(message.message || 'An unknown error occurred.');
                        break;
                    default:
                        console.warn('Unknown message command:', message.command);
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
                    font-size: 16px;
                    padding: 0 4px;
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
                    font-size: 16px;
                    padding: 0 4px;
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
                .two-col-input {
                    display: flex;
                    gap: 10px;
                }
                .two-col-input > div {
                    flex: 1;
                }
                .three-col-input {
                    display: flex;
                    gap: 10px;
                }
                .three-col-input > div {
                    flex: 1;
                }
                .section-divider {
                    border-top: 2px solid var(--vscode-panel-border);
                    margin: 20px 0;
                    padding-top: 15px;
                }
                .section-title {
                    font-size: 1.1em;
                    font-weight: bold;
                    margin-bottom: 10px;
                    color: var(--vscode-button-background);
                }
                .optional-label {
                    color: var(--vscode-descriptionForeground);
                    font-size: 0.9em;
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
                    let buildingCounter = 0;
                    let dateEntryCounter = 0;
                    
                    function addProvinceGroup() {
                        const container = document.getElementById('provincesContainer');
                        const provinceGroupId = provinceGroupCounter++;
                        
                        const provinceGroup = document.createElement('div');
                        provinceGroup.className = 'province-group expanded';
                        provinceGroup.id = 'province-group-' + provinceGroupId;
                        
                        const removeSymbol = String.fromCharCode(215); // × symbol
                        
                        provinceGroup.innerHTML = 
                            '<div class="province-group-header" data-id="' + provinceGroupId + '">' +
                                '<span>' +
                                    '<span class="province-group-toggle">-</span>' +
                                    '<span class="province-group-title">New Province</span>' +
                                '</span>' +
                                '<span class="province-group-remove" data-id="' + provinceGroupId + '">' + removeSymbol + '</span>' +
                            '</div>' +
                            '<div class="province-group-content">' +
                                '<div class="form-group">' +
                                    '<label for="provinceId-' + provinceGroupId + '">Province ID: <span style="color: red;">*</span></label>' +
                                    '<input type="text" id="provinceId-' + provinceGroupId + '" class="input-field" ' +
                                        'placeholder="e.g. 300" required>' +
                                '</div>' +
                                '<div class="form-group">' +
                                    '<label for="provinceName-' + provinceGroupId + '">Province Name: <span style="color: red;">*</span></label>' +
                                    '<input type="text" id="provinceName-' + provinceGroupId + '" class="input-field" ' +
                                        'placeholder="e.g. London" required>' +
                                '</div>' +
                                '<div class="section-divider">' +
                                    '<div class="section-title">Basic Province Data</div>' +
                                '</div>' +
                                '<div class="two-col-input">' +
                                    '<div class="form-group">' +
                                        '<label for="owner-' + provinceGroupId + '">Owner: <span class="optional-label">(optional if using dates)</span></label>' +
                                        '<input type="text" id="owner-' + provinceGroupId + '" class="input-field" ' +
                                            'placeholder="e.g. ENG">' +
                                    '</div>' +
                                    '<div class="form-group">' +
                                        '<label for="controller-' + provinceGroupId + '">Controller: <span class="optional-label">(optional if using dates)</span></label>' +
                                        '<input type="text" id="controller-' + provinceGroupId + '" class="input-field" ' +
                                            'placeholder="e.g. ENG">' +
                                    '</div>' +
                                '</div>' +
                                '<div class="form-group">' +
                                    '<label>Cores: <span class="optional-label">(optional, can also be added in dates)</span></label>' +
                                    '<div id="cores-list-' + provinceGroupId + '"></div>' +
                                    '<button type="button" id="add-core-' + provinceGroupId + '" ' +
                                        'class="secondary-button">Add Core</button>' +
                                '</div>' +
                                '<div class="two-col-input">' +
                                    '<div class="form-group">' +
                                        '<label for="tradeGoods-' + provinceGroupId + '">Trade Goods: <span style="color: red;">*</span></label>' +
                                        '<input type="text" id="tradeGoods-' + provinceGroupId + '" class="input-field" ' +
                                            'placeholder="e.g. grain" required>' +
                                    '</div>' +
                                    '<div class="form-group">' +
                                        '<label for="lifeRating-' + provinceGroupId + '">Life Rating: <span class="optional-label">(optional if using dates)</span></label>' +
                                        '<input type="number" id="lifeRating-' + provinceGroupId + '" class="input-field" ' +
                                            'placeholder="e.g. 35">' +
                                    '</div>' +
                                '</div>' +
                                '<div class="two-col-input">' +
                                    '<div class="form-group">' +
                                        '<label for="terrain-' + provinceGroupId + '">Terrain: <span class="optional-label">(optional)</span></label>' +
                                        '<input type="text" id="terrain-' + provinceGroupId + '" class="input-field" ' +
                                            'placeholder="e.g. plains">' +
                                    '</div>' +
                                    '<div class="form-group">' +
                                        '<label for="colonial-' + provinceGroupId + '">Colonial: <span class="optional-label">(optional, 1-3, can also be set in dates)</span></label>' +
                                        '<input type="number" id="colonial-' + provinceGroupId + '" class="input-field" ' +
                                            'placeholder="e.g. 2" min="1" max="3">' +
                                    '</div>' +
                                '</div>' +
                                '<div class="form-group">' +
                                    '<label>Buildings: <span class="optional-label">(optional)</span></label>' +
                                    '<div id="buildings-list-' + provinceGroupId + '"></div>' +
                                    '<button type="button" id="add-building-' + provinceGroupId + '" ' +
                                        'class="secondary-button">Add Building</button>' +
                                '</div>' +
                                '<div class="section-divider">' +
                                    '<div class="section-title">Historical Changes <span class="optional-label">(optional)</span></div>' +
                                    '<div class="info-text">Add dated entries to change ownership/control over time. Leave empty if owner/controller never change.</div>' +
                                '</div>' +
                                '<div class="form-group">' +
                                    '<label>Date Entries:</label>' +
                                    '<div id="date-entries-list-' + provinceGroupId + '"></div>' +
                                    '<button type="button" id="add-date-entry-' + provinceGroupId + '" ' +
                                        'class="secondary-button">Add Date Entry</button>' +
                                '</div>' +
                            '</div>';
                        
                        container.appendChild(provinceGroup);
                        
                        // Set up event listeners
                        const header = provinceGroup.querySelector('.province-group-header');
                        const removeButton = provinceGroup.querySelector('.province-group-remove');
                        const addCoreButton = document.getElementById('add-core-' + provinceGroupId);
                        const addBuildingButton = document.getElementById('add-building-' + provinceGroupId);
                        const addDateEntryButton = document.getElementById('add-date-entry-' + provinceGroupId);
                        const provinceIdInput = document.getElementById('provinceId-' + provinceGroupId);
                        const provinceNameInput = document.getElementById('provinceName-' + provinceGroupId);
                        
                        if (header) {
                            header.addEventListener('click', function(e) {
                                if (!e.target.classList.contains('province-group-remove')) {
                                    const id = this.getAttribute('data-id');
                                    toggleProvinceGroup(id);
                                }
                            });
                        }
                        
                        if (removeButton) {
                            removeButton.addEventListener('click', function(e) {
                                e.stopPropagation();
                                const id = this.getAttribute('data-id');
                                const groupToRemove = document.getElementById('province-group-' + id);
                                if (groupToRemove) {
                                    groupToRemove.remove();
                                }
                            });
                        }
                        
                        if (addCoreButton) {
                            addCoreButton.addEventListener('click', function() {
                                addCore(provinceGroupId);
                            });
                        }
                        
                        if (addBuildingButton) {
                            addBuildingButton.addEventListener('click', function() {
                                addBuilding(provinceGroupId);
                            });
                        }
                        
                        if (addDateEntryButton) {
                            addDateEntryButton.addEventListener('click', function() {
                                addDateEntry(provinceGroupId);
                            });
                        }
                        
                        if (provinceIdInput) {
                            provinceIdInput.addEventListener('input', function() {
                                updateProvinceTitle(provinceGroupId);
                            });
                        }
                        
                        if (provinceNameInput) {
                            provinceNameInput.addEventListener('input', function() {
                                updateProvinceTitle(provinceGroupId);
                            });
                        }
                        
                        return provinceGroup;
                    }
                    
                    function addCore(provinceGroupId) {
                        const coresList = document.getElementById('cores-list-' + provinceGroupId);
                        const coreId = 'core-' + provinceGroupId + '-' + coreCounter++;
                        
                        const coreItem = document.createElement('div');
                        coreItem.className = 'rename-item expanded';
                        coreItem.id = coreId;
                        
                        const removeSymbol = String.fromCharCode(215); // × symbol
                        
                        coreItem.innerHTML = 
                            '<div class="rename-item-header" data-id="' + coreId + '">' +
                                '<span>' +
                                    '<span class="rename-item-toggle">-</span>' +
                                    '<span class="rename-item-title">New Core</span>' +
                                '</span>' +
                                '<span class="rename-item-remove" data-id="' + coreId + '">' + removeSymbol + '</span>' +
                            '</div>' +
                            '<div class="rename-item-content">' +
                                '<div class="form-group">' +
                                    '<label for="core-value-' + coreId + '">Country Tag:</label>' +
                                    '<input type="text" id="core-value-' + coreId + '" class="input-field" ' +
                                        'placeholder="e.g. ENG" required>' +
                                '</div>' +
                            '</div>';
                        
                        coresList.appendChild(coreItem);
                        
                        const header = coreItem.querySelector('.rename-item-header');
                        const removeButton = coreItem.querySelector('.rename-item-remove');
                        const valueInput = document.getElementById('core-value-' + coreId);
                        
                        if (header) {
                            header.addEventListener('click', function(e) {
                                if (!e.target.classList.contains('rename-item-remove')) {
                                    const id = this.getAttribute('data-id');
                                    toggleRenameItem(id);
                                }
                            });
                        }
                        
                        if (removeButton) {
                            removeButton.addEventListener('click', function(e) {
                                e.stopPropagation();
                                const id = this.getAttribute('data-id');
                                const elementToRemove = document.getElementById(id);
                                if (elementToRemove) {
                                    elementToRemove.remove();
                                }
                            });
                        }
                        
                        if (valueInput) {
                            valueInput.addEventListener('input', function() {
                                updateCoreTitle(coreId);
                            });
                        }
                        
                        return coreItem;
                    }
                    
                    function addBuilding(provinceGroupId) {
                        const buildingsList = document.getElementById('buildings-list-' + provinceGroupId);
                        const buildingId = 'building-' + provinceGroupId + '-' + buildingCounter++;
                        
                        const buildingItem = document.createElement('div');
                        buildingItem.className = 'rename-item expanded';
                        buildingItem.id = buildingId;
                        
                        const removeSymbol = String.fromCharCode(215); // × symbol
                        
                        buildingItem.innerHTML = 
                            '<div class="rename-item-header" data-id="' + buildingId + '">' +
                                '<span>' +
                                    '<span class="rename-item-toggle">-</span>' +
                                    '<span class="rename-item-title">New Building</span>' +
                                '</span>' +
                                '<span class="rename-item-remove" data-id="' + buildingId + '">' + removeSymbol + '</span>' +
                            '</div>' +
                            '<div class="rename-item-content">' +
                                '<div class="two-col-input">' +
                                    '<div class="form-group">' +
                                        '<label for="building-name-' + buildingId + '">Building Name:</label>' +
                                        '<input type="text" id="building-name-' + buildingId + '" class="input-field" ' +
                                            'placeholder="Check your common/buildings.txt file, e.g. railroad, fort, naval_base, bank, university, [...]">' +
                                    '</div>' +
                                    '<div class="form-group">' +
                                        '<label for="building-level-' + buildingId + '">Level:</label>' +
                                        '<input type="number" id="building-level-' + buildingId + '" class="input-field" ' +
                                            'placeholder="e.g. 1" required min="1" value="1">' +
                                    '</div>' +
                                '</div>' +
                            '</div>';
                        
                        buildingsList.appendChild(buildingItem);
                        
                        const header = buildingItem.querySelector('.rename-item-header');
                        const removeButton = buildingItem.querySelector('.rename-item-remove');
                        const buildingNameInput = document.getElementById('building-name-' + buildingId);
                        const buildingLevelInput = document.getElementById('building-level-' + buildingId);
                        
                        if (header) {
                            header.addEventListener('click', function(e) {
                                if (!e.target.classList.contains('rename-item-remove')) {
                                    const id = this.getAttribute('data-id');
                                    toggleRenameItem(id);
                                }
                            });
                        }
                        
                        if (removeButton) {
                            removeButton.addEventListener('click', function(e) {
                                e.stopPropagation();
                                const id = this.getAttribute('data-id');
                                const elementToRemove = document.getElementById(id);
                                if (elementToRemove) {
                                    elementToRemove.remove();
                                }
                            });
                        }
                        
                        const updateBuildingTitle = function() {
                            const name = buildingNameInput ? buildingNameInput.value.trim() : '';
                            const level = buildingLevelInput ? buildingLevelInput.value.trim() : '';
                            
                            const titleElement = buildingItem.querySelector('.rename-item-title');
                            
                            if (name && level) {
                                titleElement.textContent = name + ' (Level ' + level + ')';
                            } else if (name) {
                                titleElement.textContent = 'Building: ' + name;
                            } else {
                                titleElement.textContent = 'New Building';
                            }
                        };
                        
                        if (buildingNameInput) {
                            buildingNameInput.addEventListener('input', updateBuildingTitle);
                        }
                        if (buildingLevelInput) {
                            buildingLevelInput.addEventListener('input', updateBuildingTitle);
                        }
                        
                        return buildingItem;
                    }
                    
                    function addDateEntry(provinceGroupId) {
                        const dateEntriesList = document.getElementById('date-entries-list-' + provinceGroupId);
                        const dateEntryId = 'date-entry-' + provinceGroupId + '-' + dateEntryCounter++;
                        
                        const dateEntryItem = document.createElement('div');
                        dateEntryItem.className = 'rename-item expanded';
                        dateEntryItem.id = dateEntryId;
                        
                        const removeSymbol = String.fromCharCode(215); // × symbol
                        
                        dateEntryItem.innerHTML = 
                            '<div class="rename-item-header" data-id="' + dateEntryId + '">' +
                                '<span>' +
                                    '<span class="rename-item-toggle">-</span>' +
                                    '<span class="rename-item-title">New Date Entry</span>' +
                                '</span>' +
                                '<span class="rename-item-remove" data-id="' + dateEntryId + '">' + removeSymbol + '</span>' +
                            '</div>' +
                            '<div class="rename-item-content">' +
                                '<div class="form-group">' +
                                    '<label for="date-value-' + dateEntryId + '">Date:</label>' +
                                    '<input type="text" id="date-value-' + dateEntryId + '" class="input-field" ' +
                                        'placeholder="e.g. 1815.8.1 or 1836.1.1" required>' +
                                    '<div class="info-text">Format: YYYY.M.D (e.g., 1815.8.1 for August 1st, 1815)</div>' +
                                '</div>' +
                                '<div class="two-col-input">' +
                                    '<div class="form-group">' +
                                        '<label for="date-owner-' + dateEntryId + '">Owner:</label>' +
                                        '<input type="text" id="date-owner-' + dateEntryId + '" class="input-field" ' +
                                            'placeholder="e.g. TUR">' +
                                    '</div>' +
                                    '<div class="form-group">' +
                                        '<label for="date-controller-' + dateEntryId + '">Controller:</label>' +
                                        '<input type="text" id="date-controller-' + dateEntryId + '" class="input-field" ' +
                                            'placeholder="e.g. TUR">' +
                                    '</div>' +
                                '</div>' +
                                '<div class="form-group">' +
                                    '<label>Cores to Add on This Date:</label>' +
                                    '<div id="date-cores-list-' + dateEntryId + '"></div>' +
                                    '<button type="button" id="add-date-core-' + dateEntryId + '" ' +
                                        'class="secondary-button">Add Core</button>' +
                                '</div>' +
                                '<div class="two-col-input">' +
                                    '<div class="form-group">' +
                                        '<label for="date-life-rating-' + dateEntryId + '">Life Rating:</label>' +
                                        '<input type="number" id="date-life-rating-' + dateEntryId + '" class="input-field" ' +
                                            'placeholder="e.g. 40">' +
                                    '</div>' +
                                    '<div class="form-group">' +
                                        '<label for="date-colonial-' + dateEntryId + '">Colonial:</label>' +
                                        '<input type="number" id="date-colonial-' + dateEntryId + '" class="input-field" ' +
                                            'placeholder="e.g. 2" min="1" max="3">' +
                                    '</div>' +
                                '</div>' +
                            '</div>';
                        
                        dateEntriesList.appendChild(dateEntryItem);
                        
                        const header = dateEntryItem.querySelector('.rename-item-header');
                        const removeButton = dateEntryItem.querySelector('.rename-item-remove');
                        const addDateCoreButton = document.getElementById('add-date-core-' + dateEntryId);
                        const dateInput = document.getElementById('date-value-' + dateEntryId);
                        const ownerInput = document.getElementById('date-owner-' + dateEntryId);
                        const controllerInput = document.getElementById('date-controller-' + dateEntryId);
                        const lifeRatingInput = document.getElementById('date-life-rating-' + dateEntryId);
                        const colonialInput = document.getElementById('date-colonial-' + dateEntryId);
                        
                        if (header) {
                            header.addEventListener('click', function(e) {
                                if (!e.target.classList.contains('rename-item-remove')) {
                                    const id = this.getAttribute('data-id');
                                    toggleRenameItem(id);
                                }
                            });
                        }
                        
                        if (removeButton) {
                            removeButton.addEventListener('click', function(e) {
                                e.stopPropagation();
                                const id = this.getAttribute('data-id');
                                const elementToRemove = document.getElementById(id);
                                if (elementToRemove) {
                                    elementToRemove.remove();
                                }
                            });
                        }
                        
                        if (addDateCoreButton) {
                            addDateCoreButton.addEventListener('click', function() {
                                addDateCore(dateEntryId);
                            });
                        }
                        
                        const updateDateEntryTitle = function() {
                            const date = dateInput ? dateInput.value.trim() : '';
                            const owner = ownerInput ? ownerInput.value.trim() : '';
                            const controller = controllerInput ? controllerInput.value.trim() : '';
                            const lifeRating = lifeRatingInput ? lifeRatingInput.value.trim() : '';
                            const colonial = colonialInput ? colonialInput.value.trim() : '';
                            
                            const titleElement = dateEntryItem.querySelector('.rename-item-title');
                            
                            if (date) {
                                let title = date;
                                const changes = [];
                                
                                if (owner && controller && owner === controller) {
                                    changes.push(owner);
                                } else {
                                    if (owner) changes.push('O:' + owner);
                                    if (controller) changes.push('C:' + controller);
                                }
                                
                                if (lifeRating) changes.push('LR:' + lifeRating);
                                if (colonial) changes.push('Col:' + colonial);
                                
                                if (changes.length > 0) {
                                    title += ' (' + changes.join(', ') + ')';
                                }
                                
                                titleElement.textContent = title;
                            } else {
                                titleElement.textContent = 'New Date Entry';
                            }
                        };
                        
                        if (dateInput) {
                            dateInput.addEventListener('input', updateDateEntryTitle);
                        }
                        if (ownerInput) {
                            ownerInput.addEventListener('input', updateDateEntryTitle);
                        }
                        if (controllerInput) {
                            controllerInput.addEventListener('input', updateDateEntryTitle);
                        }
                        if (lifeRatingInput) {
                            lifeRatingInput.addEventListener('input', updateDateEntryTitle);
                        }
                        if (colonialInput) {
                            colonialInput.addEventListener('input', updateDateEntryTitle);
                        }
                        
                        return dateEntryItem;
                    }
                    
                    function addDateCore(dateEntryId) {
                        const dateCorsList = document.getElementById('date-cores-list-' + dateEntryId);
                        const dateCoreId = 'date-core-' + dateEntryId + '-' + coreCounter++;
                        
                        const dateCoreItem = document.createElement('div');
                        dateCoreItem.className = 'rename-item expanded';
                        dateCoreItem.id = dateCoreId;
                        
                        const removeSymbol = String.fromCharCode(215); // × symbol
                        
                        dateCoreItem.innerHTML = 
                            '<div class="rename-item-header" data-id="' + dateCoreId + '">' +
                                '<span>' +
                                    '<span class="rename-item-toggle">-</span>' +
                                    '<span class="rename-item-title">New Core</span>' +
                                '</span>' +
                                '<span class="rename-item-remove" data-id="' + dateCoreId + '">' + removeSymbol + '</span>' +
                            '</div>' +
                            '<div class="rename-item-content">' +
                                '<div class="form-group">' +
                                    '<label for="date-core-value-' + dateCoreId + '">Country Tag:</label>' +
                                    '<input type="text" id="date-core-value-' + dateCoreId + '" class="input-field" ' +
                                        'placeholder="e.g. ENG" required>' +
                                '</div>' +
                            '</div>';
                        
                        dateCorsList.appendChild(dateCoreItem);
                        
                        const header = dateCoreItem.querySelector('.rename-item-header');
                        const removeButton = dateCoreItem.querySelector('.rename-item-remove');
                        const valueInput = document.getElementById('date-core-value-' + dateCoreId);
                        
                        if (header) {
                            header.addEventListener('click', function(e) {
                                if (!e.target.classList.contains('rename-item-remove')) {
                                    const id = this.getAttribute('data-id');
                                    toggleRenameItem(id);
                                }
                            });
                        }
                        
                        if (removeButton) {
                            removeButton.addEventListener('click', function(e) {
                                e.stopPropagation();
                                const id = this.getAttribute('data-id');
                                const elementToRemove = document.getElementById(id);
                                if (elementToRemove) {
                                    elementToRemove.remove();
                                }
                            });
                        }
                        
                        if (valueInput) {
                            valueInput.addEventListener('input', function() {
                                updateDateCoreTitle(dateCoreId);
                            });
                        }
                        
                        return dateCoreItem;
                    }
                    
                    function updateDateCoreTitle(dateCoreId) {
                        const coreInput = document.getElementById('date-core-value-' + dateCoreId);
                        const coreValue = coreInput ? coreInput.value.trim() : '';
                        
                        const titleElement = document.querySelector('#' + dateCoreId + ' .rename-item-title');
                        
                        if (titleElement) {
                            if (coreValue) {
                                titleElement.textContent = 'Core: ' + coreValue;
                            } else {
                                titleElement.textContent = 'New Core';
                            }
                        }
                    }
                    
                    function toggleProvinceGroup(id) {
                        const group = document.getElementById('province-group-' + id);
                        if (!group) return;
                        
                        const isExpanded = group.classList.contains('expanded');
                        const toggle = group.querySelector('.province-group-toggle');
                        
                        if (isExpanded) {
                            group.classList.remove('expanded');
                            if (toggle) toggle.textContent = '+';
                        } else {
                            group.classList.add('expanded');
                            if (toggle) toggle.textContent = '-';
                        }
                    }
                    
                    function toggleRenameItem(id) {
                        const item = document.getElementById(id);
                        if (!item) return;
                        
                        const isExpanded = item.classList.contains('expanded');
                        const toggle = item.querySelector('.rename-item-toggle');
                        
                        if (isExpanded) {
                            item.classList.remove('expanded');
                            if (toggle) toggle.textContent = '+';
                        } else {
                            item.classList.add('expanded');
                            if (toggle) toggle.textContent = '-';
                        }
                    }
                    
                    function updateProvinceTitle(provinceGroupId) {
                        const provinceIdInput = document.getElementById('provinceId-' + provinceGroupId);
                        const provinceNameInput = document.getElementById('provinceName-' + provinceGroupId);
                        
                        const provinceId = provinceIdInput ? provinceIdInput.value.trim() : '';
                        const provinceName = provinceNameInput ? provinceNameInput.value.trim() : '';
                        
                        const titleElement = document.querySelector('#province-group-' + provinceGroupId + ' .province-group-title');
                        
                        if (titleElement) {
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
                    }
                    
                    function updateCoreTitle(coreId) {
                        const coreInput = document.getElementById('core-value-' + coreId);
                        const coreValue = coreInput ? coreInput.value.trim() : '';
                        
                        const titleElement = document.querySelector('#' + coreId + ' .rename-item-title');
                        
                        if (titleElement) {
                            if (coreValue) {
                                titleElement.textContent = 'Core: ' + coreValue;
                            } else {
                                titleElement.textContent = 'New Core';
                            }
                        }
                    }
                    
                    function collectData() {
                        console.log('collectData function called');
                        try {
                            const provinceGroups = document.querySelectorAll('.province-group');
                            console.log('Found province groups:', provinceGroups.length);
                            
                            if (provinceGroups.length === 0) {
                                console.error('No province groups found');
                                vscode.postMessage({
                                    command: 'error',
                                    message: 'At least one province is required'
                                });
                                return null;
                            }
                            
                            const provinces = [];
                            
                            for (let i = 0; i < provinceGroups.length; i++) {
                                const group = provinceGroups[i];
                                console.log('Processing province group:', i, group.id);
                                
                                const groupId = group.id.split('-')[2];
                                console.log('Group ID:', groupId);
                                
                                // Required fields
                                const provinceIdInput = document.getElementById('provinceId-' + groupId);
                                const provinceNameInput = document.getElementById('provinceName-' + groupId);
                                const tradeGoodsInput = document.getElementById('tradeGoods-' + groupId);
                                
                                console.log('Input elements found:', {
                                    provinceId: !!provinceIdInput,
                                    provinceName: !!provinceNameInput,
                                    tradeGoods: !!tradeGoodsInput
                                });
                                
                                const provinceId = provinceIdInput ? provinceIdInput.value.trim() : '';
                                const provinceName = provinceNameInput ? provinceNameInput.value.trim() : '';
                                const tradeGoods = tradeGoodsInput ? tradeGoodsInput.value.trim() : '';
                                
                                console.log('Field values:', { provinceId, provinceName, tradeGoods });
                                
                                if (!provinceId) {
                                    console.error('Province ID missing for group', i);
                                    vscode.postMessage({
                                        command: 'error',
                                        message: 'Province ID is required for all provinces'
                                    });
                                    return null;
                                }
                                
                                if (!/^\\d+$/.test(provinceId)) {
                                    console.error('Invalid province ID:', provinceId);
                                    vscode.postMessage({
                                        command: 'error',
                                        message: 'Invalid province ID: ' + provinceId + '. ID must be numeric.'
                                    });
                                    return null;
                                }
                                
                                if (!provinceName) {
                                    console.error('Province name missing for group', i);
                                    vscode.postMessage({
                                        command: 'error',
                                        message: 'Province Name is required for all provinces'
                                    });
                                    return null;
                                }
                                
                                if (!tradeGoods) {
                                    console.error('Trade goods missing for group', i);
                                    vscode.postMessage({
                                        command: 'error',
                                        message: 'Trade Goods is required for all provinces'
                                    });
                                    return null;
                                }
                                
                                // Continue with the rest of the processing...
                                console.log('Basic validation passed for province', provinceName);
                                
                                // Optional fields that can also be in date entries
                                const ownerInput = document.getElementById('owner-' + groupId);
                                const controllerInput = document.getElementById('controller-' + groupId);
                                const terrainInput = document.getElementById('terrain-' + groupId);
                                const lifeRatingInput = document.getElementById('lifeRating-' + groupId);
                                const colonialInput = document.getElementById('colonial-' + groupId);
                                
                                const owner = ownerInput ? ownerInput.value.trim() : '';
                                const controller = controllerInput ? controllerInput.value.trim() : '';
                                const terrain = terrainInput ? terrainInput.value.trim() : '';
                                const lifeRating = lifeRatingInput ? parseInt(lifeRatingInput.value.trim() || '0') : 0;
                                const colonial = colonialInput ? parseInt(colonialInput.value.trim() || '0') : 0;
                                
                                // Validate colonial if provided
                                if (colonial > 0 && (colonial < 1 || colonial > 3)) {
                                    vscode.postMessage({
                                        command: 'error',
                                        message: 'Colonial must be between 1 and 3 (or empty)'
                                    });
                                    return null;
                                }
                                
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
                                
                                console.log('Cores collected:', cores);
                                
                                // Collect buildings
                                const buildingElements = document.querySelectorAll('#buildings-list-' + groupId + ' .rename-item');
                                const buildings = [];
                                
                                for (const buildingElement of buildingElements) {
                                    const buildingId = buildingElement.id;
                                    const buildingNameInput = document.getElementById('building-name-' + buildingId);
                                    const buildingLevelInput = document.getElementById('building-level-' + buildingId);
                                    
                                    const buildingName = buildingNameInput ? buildingNameInput.value.trim() : '';
                                    const buildingLevel = buildingLevelInput ? parseInt(buildingLevelInput.value.trim() || '0') : 0;
                                    
                                    if (buildingName && buildingLevel > 0) {
                                        buildings.push({
                                            name: buildingName,
                                            level: buildingLevel
                                        });
                                    }
                                }
                                
                                console.log('Buildings collected:', buildings);
                                
                                // Collect date entries
                                const dateEntryElements = document.querySelectorAll('#date-entries-list-' + groupId + ' .rename-item');
                                const dateEntries = [];
                                
                                console.log('Date entry elements found:', dateEntryElements.length);
                                
                                for (const dateEntryElement of dateEntryElements) {
                                    const dateEntryId = dateEntryElement.id;
                                    const dateInput = document.getElementById('date-value-' + dateEntryId);
                                    const ownerInput = document.getElementById('date-owner-' + dateEntryId);
                                    const controllerInput = document.getElementById('date-controller-' + dateEntryId);
                                    const lifeRatingInput = document.getElementById('date-life-rating-' + dateEntryId);
                                    const colonialInput = document.getElementById('date-colonial-' + dateEntryId);
                                    
                                    const date = dateInput ? dateInput.value.trim() : '';
                                    const dateOwner = ownerInput ? ownerInput.value.trim() : '';
                                    const dateController = controllerInput ? controllerInput.value.trim() : '';
                                    const dateLifeRating = lifeRatingInput ? parseInt(lifeRatingInput.value.trim() || '0') : 0;
                                    const dateColonial = colonialInput ? parseInt(colonialInput.value.trim() || '0') : 0;
                                    
                                    // Collect cores for this date
                                    const dateCoreElements = document.querySelectorAll('#date-cores-list-' + dateEntryId + ' .rename-item');
                                    const dateCores = [];
                                    
                                    for (const dateCoreElement of dateCoreElements) {
                                        const dateCoreId = dateCoreElement.id;
                                        const dateCoreInput = document.getElementById('date-core-value-' + dateCoreId);
                                        
                                        if (dateCoreInput && dateCoreInput.value.trim()) {
                                            dateCores.push(dateCoreInput.value.trim());
                                        }
                                    }
                                    
                                    // Validate colonial if provided
                                    if (dateColonial > 0 && (dateColonial < 1 || dateColonial > 3)) {
                                        vscode.postMessage({
                                            command: 'error',
                                            message: 'Colonial in date entries must be between 1 and 3 (or empty)'
                                        });
                                        return null;
                                    }
                                    
                                    if (date && (dateOwner || dateController || dateCores.length > 0 || dateLifeRating > 0 || dateColonial > 0)) {
                                        dateEntries.push({
                                            date: date,
                                            owner: dateOwner,
                                            controller: dateController,
                                            cores: dateCores,
                                            lifeRating: dateLifeRating,
                                            colonial: dateColonial
                                        });
                                    }
                                }
                                
                                console.log('Date entries collected:', dateEntries);
                                
                                // Validation: If using date entries, check for conflicts
                                if (dateEntries.length > 0) {
                                    // Check if any date entry has life rating or colonial, then undated versions should be empty
                                    const hasDateLifeRating = dateEntries.some(entry => entry.lifeRating > 0);
                                    const hasDateColonial = dateEntries.some(entry => entry.colonial > 0);
                                    const hasDateCores = dateEntries.some(entry => entry.cores.length > 0);
                                    const hasDateOwnership = dateEntries.some(entry => entry.owner || entry.controller);
                                    
                                    if (hasDateOwnership && (owner || controller)) {
                                        vscode.postMessage({
                                            command: 'error',
                                            message: 'Province "' + provinceName + '": Cannot have both undated owner/controller and date entries with owner/controller. Use either undated fields OR date entries, not both.'
                                        });
                                        return null;
                                    }
                                    
                                    if (hasDateLifeRating && lifeRating > 0) {
                                        vscode.postMessage({
                                            command: 'error',
                                            message: 'Province "' + provinceName + '": Cannot have both undated life rating and date entries with life rating. Use either undated field OR date entries, not both.'
                                        });
                                        return null;
                                    }
                                    
                                    if (hasDateColonial && colonial > 0) {
                                        vscode.postMessage({
                                            command: 'error',
                                            message: 'Province "' + provinceName + '": Cannot have both undated colonial and date entries with colonial. Use either undated field OR date entries, not both.'
                                        });
                                        return null;
                                    }
                                    
                                    if (hasDateCores && cores.length > 0) {
                                        vscode.postMessage({
                                            command: 'error',
                                            message: 'Province "' + provinceName + '": Cannot have both undated cores and date entries with cores. Use either undated cores OR date entries with cores, not both.'
                                        });
                                        return null;
                                    }
                                } else {
                                    // If no date entries, ensure at least life rating is provided somewhere
                                    if (lifeRating === 0 || isNaN(lifeRating)) {
                                        vscode.postMessage({
                                            command: 'error',
                                            message: 'Province "' + provinceName + '": Life Rating is required either as an undated field or in a date entry.'
                                        });
                                        return null;
                                    }
                                }
                                
                                const provinceData = {
                                    provinceId: provinceId,
                                    provinceName: provinceName,
                                    owner: owner,
                                    controller: controller,
                                    cores: cores,
                                    buildings: buildings,
                                    tradeGoods: tradeGoods,
                                    lifeRating: lifeRating,
                                    terrain: terrain,
                                    colonial: colonial,
                                    dateEntries: dateEntries
                                };
                                
                                console.log('Province data created:', provinceData);
                                provinces.push(provinceData);
                            }
                            
                            console.log('All provinces processed. Total:', provinces.length);
                            const result = { provinces: provinces };
                            console.log('Returning result:', result);
                            return result;
                        } catch (error) {
                            console.error('Error collecting data:', error);
                            console.error('Error stack:', error.stack);
                            vscode.postMessage({
                                command: 'error',
                                message: 'Error collecting data: ' + error.message
                            });
                            return null;
                        }
                    }
                    
                    // Initialize
                    console.log('Initializing Province History Generator...');
                    addProvinceGroup();
                    
                    const addProvinceBtn = document.getElementById('addProvince');
                    const testBtn = document.getElementById('testButton');
                    const generateBtn = document.getElementById('generate');
                    
                    console.log('Buttons found:', {
                        addProvince: !!addProvinceBtn,
                        test: !!testBtn,
                        generate: !!generateBtn
                    });
                    
                    if (addProvinceBtn) {
                        addProvinceBtn.addEventListener('click', function() {
                            console.log('Add province button clicked');
                            addProvinceGroup();
                        });
                    }
                    
                    if (generateBtn) {
                        generateBtn.addEventListener('click', function() {
                            console.log('Generate button clicked!');
                            try {
                                console.log('Calling collectData...');
                                const data = collectData();
                                console.log('collectData returned:', data);
                                
                                if (data) {
                                    console.log('Sending message to VSCode with data:', data);
                                    vscode.postMessage({
                                        command: 'generate',
                                        data: data
                                    });
                                    console.log('Message sent to VSCode');
                                } else {
                                    console.error('collectData returned null or undefined');
                                }
                            } catch (error) {
                                console.error('Error in generate click handler:', error);
                                alert('Error: ' + error.message);
                            }
                        });
                    } else {
                        console.error('Generate button not found!');
                    }
                })();
            </script>
        </body>
        </html>`;
    }
}