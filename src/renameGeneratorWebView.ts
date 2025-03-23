import * as vscode from 'vscode';

interface RenameCondition {
    provinceIds: string[];
    provinceConditions: string;
    ownerConditions: string;
    newName: string;
    renameRegion: boolean;
    regionName: string;
}

export class RenameGeneratorWebview {
    private static panel: vscode.WebviewPanel | undefined;

    static open(context: vscode.ExtensionContext) {
        if (RenameGeneratorWebview.panel) {
            RenameGeneratorWebview.panel.reveal();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'renameGenerator',
            'Province Rename Generator',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        RenameGeneratorWebview.panel = panel;

        panel.webview.html = RenameGeneratorWebview.getWebviewContent();

        panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'generate':
                        const code = RenameGeneratorWebview.generateRenameCode(message.data);
                        await RenameGeneratorWebview.showGeneratedCode(code);
                        break;
                }
            },
            undefined,
            context.subscriptions
        );

        panel.onDidDispose(
            () => {
                RenameGeneratorWebview.panel = undefined;
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
            <title>Province Rename Generator</title>
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
                .card {
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 3px;
                    margin: 1em 0;
                    background-color: var(--vscode-editor-background);
                }
                .card-header {
                    padding: .8em;
                    font-weight: bold;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    cursor: pointer;
                    background-color: var(--vscode-panel-background);
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                .card-header:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                .card-content {
                    padding: .8em;
                    display: none;
                }
                .card.expanded .card-content {
                    display: block;
                }
                .card-remove {
                    cursor: pointer;
                    color: var(--vscode-errorForeground);
                }
                .card-toggle {
                    margin-right: 8px;
                }
                .region-rename {
                    margin-top: 10px;
                    display: none;
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
                .rename-conditions {
                    margin-top: 20px;
                }
                .info-text {
                    font-style: italic;
                    color: var(--vscode-descriptionForeground);
                    margin-top: 5px;
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
                .condition-buttons {
                    margin-bottom: 8px;
                    display: flex;
                    flex-wrap: wrap;
                    gap: 5px;
                }
                .condition-button {
                    display: inline-block;
                    padding: 2px 6px;
                    background-color: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                    border-radius: 3px;
                    font-size: 0.9em;
                    cursor: pointer;
                    user-select: none;
                }
                .condition-button:hover {
                    background-color: var(--vscode-button-secondaryHoverBackground);
                }
            </style>
        </head>
        <body>
            <h1>Province Rename Generator</h1>
            
            <div class="rename-conditions">
                <h2>Provinces to Rename</h2>
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
                    let renameCounter = 0;
                    
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
                                
                                <div id="rename-items-\${provinceGroupId}" class="rename-items">
                                </div>
                                
                                <button type="button" class="add-rename secondary-button" data-province-id="\${provinceGroupId}">
                                    Add Rename Condition
                                </button>
                            </div>
                        \`;
                        
                        container.appendChild(provinceGroup);
                        
                        addRenameItem(provinceGroupId);
                        
                        provinceGroup.querySelector('.province-group-header').addEventListener('click', function(e) {
                            if (!e.target.classList.contains('province-group-remove')) {
                                toggleProvinceGroup(provinceGroupId);
                            }
                        });
                        
                        provinceGroup.querySelector('.add-rename').addEventListener('click', function() {
                            const provinceId = this.getAttribute('data-province-id');
                            addRenameItem(provinceId);
                        });
                        
                        provinceGroup.querySelector('.province-group-remove').addEventListener('click', function() {
                            const id = this.getAttribute('data-id');
                            const groupToRemove = document.getElementById('province-group-' + id);
                            groupToRemove.remove();
                            updateProvinceGroupTitles();
                        });
                        
                        provinceGroup.querySelector('#provinceId-' + provinceGroupId).addEventListener('input', function() {
                            updateProvinceGroupTitles();
                        });
                    }
                    
                    function addRenameItem(provinceGroupId) {
                        const container = document.getElementById('rename-items-' + provinceGroupId);
                        const renameId = renameCounter++;
                        
                        const renameItem = document.createElement('div');
                        renameItem.className = 'rename-item expanded';
                        renameItem.id = 'rename-item-' + renameId;
                        renameItem.setAttribute('data-province-group', provinceGroupId);
                        
                        renameItem.innerHTML = \`
                            <div class="rename-item-header" data-id="\${renameId}">
                                <span>
                                    <span class="rename-item-toggle">-</span>
                                    <span class="rename-item-title">New Rename</span>
                                </span>
                                <span class="rename-item-remove" data-id="\${renameId}">x</span>
                            </div>
                            <div class="rename-item-content">
                                <div class="form-group">
                                    <label for="newName-\${renameId}">New Province Name:</label>
                                    <input type="text" id="newName-\${renameId}" class="input-field" 
                                        placeholder="e.g. London" required>
                                </div>
                                
                                <div class="form-group">
                                    <label for="provinceConditions-\${renameId}">Province Conditions:</label>
                                    <div class="condition-buttons">
                                        <span class="condition-button" data-target="provinceConditions-\${renameId}" data-text="NOT = {  }" data-cursor-offset="2">NOT = { }</span>
                                        <span class="condition-button" data-target="provinceConditions-\${renameId}" data-text="OR = {  }" data-cursor-offset="2">OR = { }</span>
                                        <span class="condition-button" data-target="provinceConditions-\${renameId}" data-text="AND = {  }" data-cursor-offset="2">AND = { }</span>
                                    </div>
                                    <textarea id="provinceConditions-\${renameId}" class="input-field" 
                                        placeholder="e.g. is_capital = yes" rows="2"></textarea>
                                    <div class="info-text">Conditions that must be met by the province (leave empty for no conditions)</div>
                                </div>
                                
                                <div class="form-group">
                                    <label for="ownerConditions-\${renameId}">Owner Conditions:</label>
                                    <div class="condition-buttons">
                                        <span class="condition-button" data-target="ownerConditions-\${renameId}" data-text="NOT = {  }" data-cursor-offset="2">NOT = { }</span>
                                        <span class="condition-button" data-target="ownerConditions-\${renameId}" data-text="OR = {  }" data-cursor-offset="2">OR = { }</span>
                                        <span class="condition-button" data-target="ownerConditions-\${renameId}" data-text="AND = {  }" data-cursor-offset="2">AND = { }</span>
                                        <span class="condition-button" data-target="ownerConditions-\${renameId}" data-text="primary_culture = ">primary_culture = </span>
                                        <span class="condition-button" data-target="ownerConditions-\${renameId}" data-text="tag = ">tag = </span>
                                        <span class="condition-button" data-target="ownerConditions-\${renameId}" data-text="has_country_flag = ">has_country_flag = </span>
                                        <span class="condition-button" data-target="ownerConditions-\${renameId}" data-text="is_culture_group = ">is_culture_group = </span>
                                    </div>
                                    <textarea id="ownerConditions-\${renameId}" class="input-field" 
                                        placeholder="e.g. tag = ENG" rows="2"></textarea>
                                    <div class="info-text">Conditions that must be met by the province owner (leave empty for no conditions)</div>
                                </div>
                                
                                <div class="form-group">
                                    <label>
                                        <input type="checkbox" id="renameRegion-\${renameId}" class="rename-region-checkbox">
                                        Rename Region
                                    </label>
                                    
                                    <div id="regionNameGroup-\${renameId}" class="region-rename">
                                        <label for="regionName-\${renameId}">New Region Name:</label>
                                        <input type="text" id="regionName-\${renameId}" class="input-field" 
                                            placeholder="e.g. South East England">
                                    </div>
                                </div>
                            </div>
                        \`;
                        
                        container.appendChild(renameItem);
                        
                        renameItem.querySelector('#renameRegion-' + renameId).addEventListener('change', function() {
                            const regionNameGroup = document.getElementById('regionNameGroup-' + renameId);
                            regionNameGroup.style.display = this.checked ? 'block' : 'none';
                        });
                        
                        renameItem.querySelector('.rename-item-remove').addEventListener('click', function(e) {
                            e.stopPropagation();
                            const id = this.getAttribute('data-id');
                            const itemToRemove = document.getElementById('rename-item-' + id);
                            itemToRemove.remove();
                            updateProvinceGroupTitles();
                        });
                        
                        renameItem.querySelector('.rename-item-header').addEventListener('click', function(e) {
                            if (!e.target.classList.contains('rename-item-remove')) {
                                const id = this.getAttribute('data-id');
                                toggleRenameItem(id);
                            }
                        });
                        
                        renameItem.querySelector('#newName-' + renameId).addEventListener('input', function() {
                            updateProvinceGroupTitles();
                        });
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
                        const item = document.getElementById('rename-item-' + id);
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
                    
                    function setupConditionButtons(container = document) {
                        // First remove any existing event listeners by cloning and replacing elements
                        container.querySelectorAll('.condition-button').forEach(button => {
                            const newButton = button.cloneNode(true);
                            button.parentNode.replaceChild(newButton, button);
                            
                            newButton.addEventListener('click', function() {
                                const targetId = this.getAttribute('data-target');
                                const textToInsert = this.getAttribute('data-text');
                                const cursorOffset = parseInt(this.getAttribute('data-cursor-offset') || '0');
                                
                                const textarea = document.getElementById(targetId);
                                if (textarea) {
                                    const startPos = textarea.selectionStart;
                                    const endPos = textarea.selectionEnd;
                                    const text = textarea.value;
                                    
                                    // Add a space if the cursor is not at the beginning and the last character is not a space
                                    const needsSpace = startPos > 0 && text.charAt(startPos - 1) !== ' ' && text.charAt(startPos - 1) !== '\\n';
                                    const prefix = needsSpace ? ' ' : '';
                                    
                                    // Insert the text
                                    textarea.value = text.substring(0, startPos) + prefix + textToInsert + text.substring(endPos);
                                    
                                    // Set cursor position
                                    if (cursorOffset > 0) {
                                        // For logical operators, place cursor inside brackets
                                        const newPosition = startPos + prefix.length + textToInsert.length - cursorOffset;
                                        textarea.setSelectionRange(newPosition, newPosition);
                                    } else {
                                        // For condition operators, place cursor at the end
                                        const newPosition = startPos + prefix.length + textToInsert.length;
                                        textarea.setSelectionRange(newPosition, newPosition);
                                    }
                                    
                                    // Focus the textarea
                                    textarea.focus();
                                }
                            });
                        });
                    }
                    
                    function updateProvinceGroupTitles() {
                        const provinceGroups = document.querySelectorAll('.province-group');
                        
                        provinceGroups.forEach((group) => {
                            const groupId = group.id.split('-')[2];
                            const provinceIdInput = document.getElementById('provinceId-' + groupId);
                            
                            if (!provinceIdInput) return;
                            
                            const provinceId = provinceIdInput.value.trim() || 'New Province';
                            
                            const renameNames = [];
                            const renameItems = group.querySelectorAll('.rename-item');
                            
                            renameItems.forEach((item) => {
                                const itemId = item.id.split('-')[2];
                                const nameInput = document.getElementById('newName-' + itemId);
                                
                                if (nameInput && nameInput.value.trim()) {
                                    renameNames.push(nameInput.value.trim());
                                }
                            });
                            
                            const titleElement = group.querySelector('.province-group-title');
                            if (renameNames.length > 0) {
                                titleElement.textContent = provinceId + ' - ' + renameNames.join(', ');
                            } else {
                                titleElement.textContent = 'Province ID: ' + provinceId;
                            }
                            
                            renameItems.forEach((item) => {
                                const itemId = item.id.split('-')[2];
                                const nameInput = document.getElementById('newName-' + itemId);
                                const newName = nameInput && nameInput.value.trim() ? nameInput.value.trim() : 'Unnamed';
                                
                                const headerTitle = item.querySelector('.rename-item-title');
                                headerTitle.textContent = 'Rename to: ' + newName;
                            });
                        });
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
                        
                        const renameConditions = [];
                        
                        provinceGroups.forEach((group) => {
                            const groupId = group.id.split('-')[2];
                            
                            const provinceId = document.getElementById('provinceId-' + groupId).value.trim();
                            if (!provinceId) {
                                vscode.postMessage({
                                    command: 'error',
                                    message: 'Province ID is required'
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
                            
                            const renameItems = group.querySelectorAll('.rename-item');
                            
                            if (renameItems.length === 0) {
                                vscode.postMessage({
                                    command: 'error',
                                    message: \`Province \${provinceId} needs at least one rename option\`
                                });
                                return null;
                            }
                            
                            renameItems.forEach((item) => {
                                const itemId = item.id.split('-')[2];
                                
                                const newName = document.getElementById('newName-' + itemId).value.trim();
                                if (!newName) {
                                    vscode.postMessage({
                                        command: 'error',
                                        message: 'All new province names are required'
                                    });
                                    return null;
                                }
                                
                                const provinceConditions = document.getElementById('provinceConditions-' + itemId).value || "";
                                const ownerConditions = document.getElementById('ownerConditions-' + itemId).value || "";
                                
                                const renameRegion = document.getElementById('renameRegion-' + itemId).checked;
                                let regionName = '';
                                
                                if (renameRegion) {
                                    regionName = document.getElementById('regionName-' + itemId).value.trim();
                                    if (!regionName) {
                                        vscode.postMessage({
                                            command: 'error',
                                            message: 'Region name is required when "Rename Region" is checked'
                                        });
                                        return null;
                                    }
                                }
                                
                                renameConditions.push({
                                    provinceIds: [provinceId],
                                    provinceConditions,
                                    ownerConditions,
                                    newName,
                                    renameRegion,
                                    regionName
                                });
                            });
                        });
                        
                        return {
                            renameConditions
                        };
                    }
                    
                    // Initialize the first province group
                    addProvinceGroup();
                    
                    // Set up global event listeners
                    document.getElementById('addProvince').addEventListener('click', function() {
                        addProvinceGroup();
                        // Setup condition buttons after adding a new province group
                        setupConditionButtons();
                    });
                    
                    document.getElementById('generate').addEventListener('click', function() {
                        const data = collectData();
                        if (data) {
                            vscode.postMessage({
                                command: 'generate',
                                data
                            });
                        }
                    });
                    
                    // Initialize condition buttons for the first time
                    setupConditionButtons();
                })();
            </script>
        </body>
        </html>`;
    }

    private static generateRenameCode(data: any): string {
        const conditions = data.renameConditions;
        let code = '';

        for (const condition of conditions) {
            const provinceIds = condition.provinceIds;

            for (const provinceId of provinceIds) {
                let codeSnippet = 'any_land_province = { limit = { province_id = ' + provinceId;
                
                if (condition.provinceConditions.trim()) {
                    codeSnippet += ' ' + condition.provinceConditions.trim();
                }
                
                if (condition.ownerConditions.trim()) {
                    codeSnippet += ' owner = { ' + condition.ownerConditions.trim() + ' }';
                }
                
                codeSnippet += ' } change_province_name = "' + condition.newName + '"';
                
                if (condition.renameRegion) {
                    codeSnippet += ' state_scope = { change_region_name = "' + condition.regionName + '" }';
                }
                
                codeSnippet += ' }';
                
                code += codeSnippet + '\n';
            }
        }

        return code.trim();
    }

    private static async showGeneratedCode(code: string): Promise<void> {
        const document = await vscode.workspace.openTextDocument({
            content: code,
            language: 'paradox'
        });
        
        await vscode.window.showTextDocument(document);
    }
}