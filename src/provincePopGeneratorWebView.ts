import * as vscode from 'vscode';

interface PopData {
    type: string;
    culture: string;
    religion: string;
    size: number;
}

interface ProvinceData {
    provinceId: string;
    provinceName: string;
    populationSize: number;
    pops: PopData[];
}

export class PopulationDataGenerator {
    private static panel: vscode.WebviewPanel | undefined;

    static open(context: vscode.ExtensionContext) {
        if (PopulationDataGenerator.panel) {
            PopulationDataGenerator.panel.reveal();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'populationDataGenerator',
            'Population Distribution Tool',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        PopulationDataGenerator.panel = panel;

        panel.webview.html = PopulationDataGenerator.getWebviewContent();

        panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'generate':
                        const data = message.data;
                        const provinces = data.provinces;
                        
                        const fileUri = await vscode.window.showSaveDialog({
                            defaultUri: vscode.Uri.file('province_population.txt'),
                            filters: {
                                'Text files': ['txt']
                            },
                            title: 'Save Population Data File'
                        });
                        
                        if (!fileUri) {
                            vscode.window.showInformationMessage('Operation cancelled by user.');
                            return;
                        }
                        
                        try {
                            let popDataContent = '';
                            
                            for (const province of provinces) {
                                popDataContent += `#${province.provinceName} (${province.populationSize})\n${province.provinceId} = {\n`;
                                
                                for (const pop of province.pops) {
                                    popDataContent += `\t${pop.type} = {\n`;
                                    popDataContent += `\t\tculture = ${pop.culture}\n`;
                                    popDataContent += `\t\treligion = ${pop.religion}\n`;
                                    popDataContent += `\t\tsize = ${pop.size}\n`;
                                    popDataContent += `\t}\n`;
                                }
                                
                                popDataContent += `}\n\n`;
                            }
                            
                            await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(popDataContent));
                            
                            const document = await vscode.workspace.openTextDocument(fileUri);
                            await vscode.window.showTextDocument(document);
                            
                            vscode.window.showInformationMessage(`Successfully generated population data for ${provinces.length} province(s).`);
                        } catch (error) {
                            vscode.window.showErrorMessage(`Error saving file: ${error instanceof Error ? error.message : String(error)}`);
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
                PopulationDataGenerator.panel = undefined;
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
            <title>Population Distribution Tool</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 20px;
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                }
                input, button, select {
                    font-family: var(--vscode-font-family);
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    padding: 6px 8px;
                    border-radius: 2px;
                }
                input:focus, button:focus, select:focus {
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
                .pop-group {
                    margin-bottom: 15px;
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    padding: 12px;
                    border-radius: 5px;
                    border-left: 4px solid var(--vscode-button-background);
                }
                .pop-group[data-locked="true"] {
                    border-left: 4px solid var(--vscode-button-secondaryBackground);
                }
                .pop-group:last-child {
                    margin-bottom: 0;
                }
                .pop-group-header {
                    font-weight: 600;
                    display: flex;
                    justify-content: space-between;
                    padding-bottom: 8px;
                    cursor: pointer;
                }
                .pop-group-remove {
                    cursor: pointer;
                    color: var(--vscode-errorForeground);
                    font-size: 16px;
                    padding: 0 6px;
                }
                .pop-group-toggle {
                    margin-right: 8px;
                }
                .pop-group-content {
                    display: none;
                }
                .pop-group.expanded .pop-group-content {
                    display: block;
                }
                .section-header {
                    margin-top: 15px;
                    font-weight: bold;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    padding-bottom: 5px;
                    margin-bottom: 15px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .size-header {
                    margin-bottom: 8px;
                }
                .size-input-container {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .size-controls {
                    margin-bottom: 12px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .slider-with-controls {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    flex: 1;
                }
                .percentage-input {
                    width: 150px;
                }
                .control-buttons {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    min-width: 80px;
                }
                .size-value {
                    width: 100px;
                    text-align: right;
                }
                .percentage-display {
                    font-weight: bold;
                    color: var(--vscode-button-background);
                    min-width: 45px;
                    text-align: right;
                }
                .lock-label {
                    display: flex;
                    align-items: center;
                    cursor: pointer;
                }
                .lock-icon {
                    display: inline-block;
                    width: 16px;
                    height: 16px;
                    background-color: transparent;
                    border: 2px solid var(--vscode-descriptionForeground);
                    border-radius: 2px;
                    position: relative;
                }
                .pop-lock {
                    position: absolute;
                    opacity: 0;
                }
                .pop-lock:checked + .lock-icon {
                    background-color: var(--vscode-button-secondaryBackground);
                    border-color: var(--vscode-button-secondaryBackground);
                }
                .pop-lock:checked + .lock-icon::after {
                    content: '?';
                    color: var(--vscode-button-secondaryForeground);
                    position: absolute;
                    top: -2px;
                    left: 2px;
                    font-size: 12px;
                }
                .pop-summary {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 5px;
                }
                .pop-summary-item {
                    flex: 1;
                    min-width: 120px;
                    background-color: var(--vscode-input-background);
                    padding: 4px 8px;
                    border-radius: 3px;
                    font-size: 12px;
                    display: flex;
                    flex-direction: column;
                }
                .pop-summary-title {
                    font-weight: bold;
                    margin-bottom: 3px;
                }
                .total-population {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    width: auto;
                }
                
            </style>
        </head>
        <body>
            <h1>Population Distribution Tool</h1>
            
            <div class="province-history-container">
                <h2>Provinces</h2>
                <div id="provincesContainer"></div>
                
                <button type="button" id="addProvince" class="secondary-button">
                    Add Province
                </button>

                <button type="button" id="generate" class="primary-button">Save Population Data</button>
            </div>

            <script>
                (function() {
                    const vscode = acquireVsCodeApi();
                    let provinceGroupCounter = 0;
                    let popCounter = 0;
                    
                    function addProvinceGroup() {
                        try {
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
                                    </div>
                                    
                                    <div class="form-group">
                                        <label for="provinceName-\${provinceGroupId}">Province Name:</label>
                                        <input type="text" id="provinceName-\${provinceGroupId}" class="input-field" 
                                            placeholder="e.g. London" required>
                                    </div>
                                    
                                    <div class="section-header">
                                        <div class="total-population">
                                            <label for="populationSize-\${provinceGroupId}">Total Population:</label>
                                            <input type="number" id="populationSize-\${provinceGroupId}" class="input-field size-value" 
                                                placeholder="Total Population" required min="1">
                                        </div>
                                        <span>Population Data</span>
                                    </div>
                                    
                                    <div id="pop-summary-\${provinceGroupId}" class="pop-summary">
                                    </div>
                                    <div></div>
                                    <div class="form-group">
                                        <label>Population Groups:</label>
                                        <div id="pops-list-\${provinceGroupId}">
                                        </div>
                                        <button type="button" id="add-pop-\${provinceGroupId}" 
                                            class="secondary-button">Add Population Group</button>
                                    </div>
                                </div>
                            \`;
                            
                            container.appendChild(provinceGroup);
                            
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
                            
                            const addPopButton = document.getElementById('add-pop-' + provinceGroupId);
                            addPopButton.addEventListener('click', function() {
                                addPop(provinceGroupId);
                                updateSliderMaxValues(provinceGroupId);
                            });
                            
                            const provinceIdInput = document.getElementById('provinceId-' + provinceGroupId);
                            const provinceNameInput = document.getElementById('provinceName-' + provinceGroupId);
                            const populationSizeInput = document.getElementById('populationSize-' + provinceGroupId);
                            
                            provinceIdInput.addEventListener('input', function() {
                                updateProvinceTitle(provinceGroupId);
                            });
                            
                            provinceNameInput.addEventListener('input', function() {
                                updateProvinceTitle(provinceGroupId);
                            });
                            
                            populationSizeInput.addEventListener('input', function() {
                                let totalPop = parseInt(this.value);
                                if (isNaN(totalPop) || totalPop < 1) {
                                    totalPop = 1;
                                    this.value = "1";
                                }
                                
                                updatePopSizes(provinceGroupId);
                                updatePopSummary(provinceGroupId);
                                updateSliderMaxValues(provinceGroupId);
                            });
                            
                            // Add initial pop
                            addPop(provinceGroupId);
                            
                            // Initialize population summary and slider limits
                            updatePopSummary(provinceGroupId);
                            updateSliderMaxValues(provinceGroupId);
                            
                            return provinceGroup;
                        } catch (error) {
                            console.error("Error in addProvinceGroup:", error);
                            alert("Error adding province: " + error.message);
                        }
                    }
                    
                    function addPop(provinceGroupId) {
                        try {
                            const popsList = document.getElementById('pops-list-' + provinceGroupId);
                            if (!popsList) {
                                console.error("popsList element not found for ID:", 'pops-list-' + provinceGroupId);
                                return null;
                            }
                            
                            const popId = 'pop-' + provinceGroupId + '-' + popCounter++;
                            
                            const popItem = document.createElement('div');
                            popItem.className = 'pop-group expanded';
                            popItem.id = popId;
                            popItem.dataset.provinceId = provinceGroupId;
                            
                            // Default to 100% for the first pop or equal distribution for additional pops
                            const existingPops = popsList.querySelectorAll('.pop-group').length;
                            const defaultPercentage = existingPops === 0 ? 100 : (100 / (existingPops + 1)).toFixed(1);
                            
                            // Adjust existing pops' percentages if this isn't the first pop
                            if (existingPops > 0) {
                                const existingPopElements = popsList.querySelectorAll('.pop-group');
                                existingPopElements.forEach(pop => {
                                    if (!pop.dataset.locked || pop.dataset.locked === 'false') {
                                        const percentageInput = pop.querySelector('.percentage-input');
                                        const percentageDisplay = pop.querySelector('.percentage-display');
                                        const sizeInput = pop.querySelector('.size-value');
                                        const newPercentage = (100 / (existingPops + 1)).toFixed(1);
                                        
                                        percentageInput.value = newPercentage;
                                        percentageDisplay.textContent = newPercentage + '%';
                                        
                                        // Update the size value based on the percentage
                                        const populationSize = document.getElementById('populationSize-' + provinceGroupId).value;
                                        if (populationSize) {
                                            const newSize = Math.round((parseFloat(newPercentage) / 100) * parseInt(populationSize));
                                            sizeInput.value = newSize;
                                        }
                                        
                                        updatePopTitle(pop.id);
                                    }
                                });
                            }
                            
                            popItem.innerHTML = \`
                                <div class="pop-group-header" data-id="\${popId}">
                                    <span>
                                        <span class="pop-group-toggle">-</span>
                                        <span class="pop-group-title">New Population Group</span>
                                    </span>
                                    <span class="pop-group-remove" data-id="\${popId}">x</span>
                                </div>
                                <div class="pop-group-content">
                                    <div class="form-group">
                                        <label for="pop-type-\${popId}">Type:</label>
                                        <input type="text" id="pop-type-\${popId}" class="input-field" 
                                            placeholder="e.g. aristocrats" required>
                                    </div>
                                    
                                    <div class="form-group">
                                        <label for="pop-culture-\${popId}">Culture:</label>
                                        <input type="text" id="pop-culture-\${popId}" class="input-field" 
                                            placeholder="e.g. british" required>
                                    </div>
                                    
                                    <div class="form-group">
                                        <label for="pop-religion-\${popId}">Religion:</label>
                                        <input type="text" id="pop-religion-\${popId}" class="input-field" 
                                            placeholder="e.g. protestant" required>
                                    </div>
                                    
                                    <div class="form-group">
                                        <div class="size-header">
                                            <div class="size-input-container">
                                                <label for="pop-size-\${popId}">Population:</label>
                                                <input type="number" id="pop-size-\${popId}" class="input-field size-value" 
                                                    placeholder="e.g. 5000" min="1" required>
                                            </div>
                                        </div>
                                        <div class="size-controls">
                                            <div class="control-buttons">
                                                <span class="percentage-display">100%</span>
                                                <label class="lock-label">
                                                    <input type="checkbox" id="pop-lock-\${popId}" class="pop-lock">
                                                    <span class="lock-icon"></span>
                                                </label>
                                            </div>
                                            <div class="slider-with-controls">
                                                <input type="range" id="pop-percentage-\${popId}" class="percentage-input"
                                                    min="0.1" max="100" value="100" step="0.1">
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            \`;
                            
                            popsList.appendChild(popItem);
                            
                            popItem.querySelector('.pop-group-header').addEventListener('click', function(e) {
                                if (!e.target.classList.contains('pop-group-remove')) {
                                    const id = this.getAttribute('data-id');
                                    togglePopGroup(id);
                                }
                            });
                            
                            popItem.querySelector('.pop-group-remove').addEventListener('click', function(e) {
                                e.stopPropagation();
                                const id = this.getAttribute('data-id');
                                const popToRemove = document.getElementById(id);
                                const provinceId = popToRemove.dataset.provinceId;
                                
                                popToRemove.remove();
                                
                                redistributePercentages(provinceId);
                                
                                updatePopSummary(provinceId);
                                updateSliderMaxValues(provinceId);
                            });
                            
                            // Set up input handlers for pop properties
                            const typeInput = document.getElementById('pop-type-' + popId);
                            const cultureInput = document.getElementById('pop-culture-' + popId);
                            const religionInput = document.getElementById('pop-religion-' + popId);
                            const sizeInput = document.getElementById('pop-size-' + popId);
                            const percentageInput = document.getElementById('pop-percentage-' + popId);
                            const percentageDisplay = popItem.querySelector('.percentage-display');
                            const lockCheckbox = document.getElementById('pop-lock-' + popId);
                            
                            // Set initial size based on percentage and total population
                            const populationSize = document.getElementById('populationSize-' + provinceGroupId).value;
                            if (populationSize) {
                                sizeInput.value = Math.round((parseFloat(defaultPercentage) / 100) * parseInt(populationSize));
                            } else {
                                sizeInput.value = 0;
                            }
                            
                            // Update percentage display
                            percentageInput.value = defaultPercentage;
                            percentageDisplay.textContent = defaultPercentage + '%';
                            
                            typeInput.addEventListener('input', function() {
                                updatePopTitle(popId);
                            });
                            
                            cultureInput.addEventListener('input', function() {
                                updatePopTitle(popId);
                            });
                            
                            religionInput.addEventListener('input', function() {
                                updatePopTitle(popId);
                            });
                            
                            sizeInput.addEventListener('input', function() {
                                let size = parseInt(this.value);
                                if (size < 1) {
                                    size = 1;
                                    this.value = "1";
                                }
                                
                                const populationSize = document.getElementById('populationSize-' + provinceGroupId).value;
                                
                                if (populationSize && size >= 1) {
                                    if (size > parseInt(populationSize)) {
                                        size = parseInt(populationSize);
                                        this.value = size;
                                    }
                                    
                                    const percentage = (size / parseInt(populationSize)) * 100;
                                    percentageInput.value = percentage.toFixed(1);
                                    percentageDisplay.textContent = percentage.toFixed(1) + '%';
                                    
                                    adjustOtherPops(popId, percentage);
                                }
                                
                                updatePopTitle(popId);
                                updatePopSummary(provinceGroupId);
                                updateSliderMaxValues(provinceGroupId);
                            });
                            
                            percentageInput.addEventListener('input', function() {
                                let percentage = parseFloat(this.value);
                                if (isNaN(percentage) || percentage < 0.1) {
                                    percentage = 0.1;
                                    this.value = "0.1";
                                } else if (percentage > 100) {
                                    percentage = 100;
                                    this.value = "100";
                                }
                                
                                const maxAvailablePercentage = getMaxAvailablePercentage(provinceGroupId, popId);
                                if (percentage > maxAvailablePercentage) {
                                    percentage = maxAvailablePercentage;
                                    this.value = percentage.toString();
                                }
                                
                                percentageDisplay.textContent = percentage.toFixed(1) + '%';
                                
                                const populationSize = document.getElementById('populationSize-' + provinceGroupId).value;
                                if (populationSize) {
                                    const newSize = Math.max(1, Math.round((percentage / 100) * parseInt(populationSize)));
                                    sizeInput.value = newSize;
                                }
                                
                                adjustOtherPops(popId, percentage);
                                
                                updatePopTitle(popId);
                                updatePopSummary(provinceGroupId);
                                updateSliderMaxValues(provinceGroupId);
                            });
                            
                            lockCheckbox.addEventListener('change', function() {
                                popItem.dataset.locked = this.checked.toString();
                                
                                if (this.checked) {
                                    popItem.dataset.lockedSize = sizeInput.value;
                                } else {
                                    delete popItem.dataset.lockedSize;
                                    redistributePercentages(provinceGroupId);
                                }
                                
                                updatePopSummary(provinceGroupId);
                                updateSliderMaxValues(provinceGroupId);
                            });
                            
                            updatePopTitle(popId);
                            return popItem;
                        } catch (error) {
                            console.error("Error in addPop:", error);
                            alert("Error adding population group: " + error.message);
                            return null;
                        }
                    }
                    
                    function getMaxAvailablePercentage(provinceId, currentPopId) {
                        const popsList = document.getElementById('pops-list-' + provinceId);
                        const allPops = popsList.querySelectorAll('.pop-group');
                        
                        let totalOtherLockedPercentage = 0;
                        let minRequiredPercentage = 0;
                        
                        allPops.forEach(pop => {
                            if (pop.id === currentPopId) {
                                return;
                            }
                            
                            if (pop.dataset.locked === 'true') {
                                const percentageInput = pop.querySelector('.percentage-input');
                                totalOtherLockedPercentage += parseFloat(percentageInput.value);
                            } else {
                                minRequiredPercentage += 0.1;
                            }
                        });
                        
                        const maxAvailable = 100 - totalOtherLockedPercentage - minRequiredPercentage;
                        return Math.max(0.1, Math.min(100, maxAvailable));
                    }
                    
                    function updateSliderMaxValues(provinceId) {
                        const popsList = document.getElementById('pops-list-' + provinceId);
                        const allPops = popsList.querySelectorAll('.pop-group');
                        
                        allPops.forEach(pop => {
                            const percentageInput = pop.querySelector('.percentage-input');
                            const maxAvailable = getMaxAvailablePercentage(provinceId, pop.id);
                            
                            percentageInput.max = maxAvailable;
                            
                            if (parseFloat(percentageInput.value) > maxAvailable) {
                                percentageInput.value = maxAvailable;
                                pop.querySelector('.percentage-display').textContent = maxAvailable.toFixed(1) + '%';
                                
                                const populationSize = document.getElementById('populationSize-' + provinceId).value;
                                if (populationSize) {
                                    const newSize = Math.max(1, Math.round((maxAvailable / 100) * parseInt(populationSize)));
                                    pop.querySelector('.size-value').value = newSize;
                                }
                                
                                updatePopTitle(pop.id);
                            }
                        });
                    }
                    
                    function adjustOtherPops(changedPopId, newPercentage) {
                        const changedPop = document.getElementById(changedPopId);
                        const provinceId = changedPop.dataset.provinceId;
                        const popsList = document.getElementById('pops-list-' + provinceId);
                        const allPops = popsList.querySelectorAll('.pop-group');
                        
                        let totalLockedPercentage = 0;
                        let totalUnlockedPercentage = 0;
                        let unlockedPops = [];
                        
                        allPops.forEach(pop => {
                            if (pop.id === changedPopId) {
                                return;
                            }
                            
                            const percentageInput = pop.querySelector('.percentage-input');
                            const percentage = parseFloat(percentageInput.value);
                            
                            if (pop.dataset.locked === 'true') {
                                totalLockedPercentage += percentage;
                            } else {
                                totalUnlockedPercentage += percentage;
                                unlockedPops.push(pop);
                            }
                        });
                        
                        let targetTotal = 100 - newPercentage - totalLockedPercentage;
                        
                        const minPercentageNeeded = unlockedPops.length * 0.1;
                        if (targetTotal < minPercentageNeeded) {
                            targetTotal = minPercentageNeeded;
                        }
                        
                        if (unlockedPops.length > 0 && totalUnlockedPercentage > 0) {
                            unlockedPops.forEach((pop, index) => {
                                const percentageInput = pop.querySelector('.percentage-input');
                                const percentageDisplay = pop.querySelector('.percentage-display');
                                const sizeInput = pop.querySelector('.size-value');
                                const currentPercentage = parseFloat(percentageInput.value);
                                
                                let newPercentageValue;
                                
                                if (index === unlockedPops.length - 1) {
                                    const usedPercentage = unlockedPops.slice(0, -1).reduce((sum, p) => {
                                        return sum + parseFloat(p.querySelector('.percentage-input').value);
                                    }, newPercentage + totalLockedPercentage);
                                    
                                    newPercentageValue = Math.max(0.1, (100 - usedPercentage)).toFixed(1);
                                } else {
                                    const ratio = currentPercentage / totalUnlockedPercentage;
                                    newPercentageValue = Math.max(0.1, (ratio * targetTotal)).toFixed(1);
                                }
                                
                                percentageInput.value = newPercentageValue;
                                percentageDisplay.textContent = newPercentageValue + '%';
                                
                                const populationSize = document.getElementById('populationSize-' + provinceId).value;
                                if (populationSize) {
                                    const newSize = Math.max(1, Math.round((parseFloat(newPercentageValue) / 100) * parseInt(populationSize)));
                                    sizeInput.value = newSize;
                                }
                                
                                updatePopTitle(pop.id);
                            });
                        }
                        
                        updateSliderMaxValues(provinceId);
                    }
                    
                    function redistributePercentages(provinceId) {
                        const popsList = document.getElementById('pops-list-' + provinceId);
                        const remainingPops = popsList.querySelectorAll('.pop-group');
                        
                        if (remainingPops.length === 0) {
                            return;
                        }
                        
                        let totalLockedPercentage = 0;
                        let unlockedPops = [];
                        
                        remainingPops.forEach(pop => {
                            if (pop.dataset.locked === 'true') {
                                const percentageInput = pop.querySelector('.percentage-input');
                                totalLockedPercentage += parseFloat(percentageInput.value);
                            } else {
                                unlockedPops.push(pop);
                            }
                        });
                        
                        if (totalLockedPercentage > 100) {
                            totalLockedPercentage = 100;
                        }
                        
                        const remainingPercentage = 100 - totalLockedPercentage;
                        const minimumNeeded = unlockedPops.length * 0.1;
                        
                        if (unlockedPops.length > 0) {
                            if (remainingPercentage >= minimumNeeded) {
                                const percentagePerPop = (remainingPercentage / unlockedPops.length).toFixed(1);
                                
                                unlockedPops.forEach(pop => {
                                    const percentageInput = pop.querySelector('.percentage-input');
                                    const percentageDisplay = pop.querySelector('.percentage-display');
                                    const sizeInput = pop.querySelector('.size-value');
                                    
                                    percentageInput.value = percentagePerPop;
                                    percentageDisplay.textContent = percentagePerPop + '%';
                                    
                                    const populationSize = document.getElementById('populationSize-' + provinceId).value;
                                    if (populationSize) {
                                        const newSize = Math.max(1, Math.round((parseFloat(percentagePerPop) / 100) * parseInt(populationSize)));
                                        sizeInput.value = newSize;
                                    }
                                    
                                    updatePopTitle(pop.id);
                                });
                            } else {
                                unlockedPops.forEach(pop => {
                                    const percentageInput = pop.querySelector('.percentage-input');
                                    const percentageDisplay = pop.querySelector('.percentage-display');
                                    const sizeInput = pop.querySelector('.size-value');
                                    
                                    percentageInput.value = "0.1";
                                    percentageDisplay.textContent = "0.1%";
                                    sizeInput.value = "1";
                                    
                                    updatePopTitle(pop.id);
                                });
                            }
                        }
                        
                        updateSliderMaxValues(provinceId);
                    }
                    
                    function updatePopSizes(provinceGroupId) {
                        const populationSize = document.getElementById('populationSize-' + provinceGroupId).value;
                        if (!populationSize) return;
                        
                        const totalPop = parseInt(populationSize);
                        if (isNaN(totalPop) || totalPop < 1) return;
                        
                        const popsList = document.getElementById('pops-list-' + provinceGroupId);
                        const pops = popsList.querySelectorAll('.pop-group');
                        
                        let remainingPopulation = totalPop;
                        pops.forEach(pop => {
                            if (pop.dataset.locked === 'true') {
                                const percentageInput = pop.querySelector('.percentage-input');
                                const sizeInput = pop.querySelector('.size-value');
                                
                                const percentage = parseFloat(percentageInput.value);
                                const newSize = Math.max(1, Math.round((percentage / 100) * totalPop));
                                sizeInput.value = newSize;
                                remainingPopulation -= newSize;
                                
                                updatePopTitle(pop.id);
                            }
                        });
                        
                        const unlockedPops = Array.from(pops).filter(pop => pop.dataset.locked !== 'true');
                        if (unlockedPops.length > 0) {
                            let totalUnlockedPercentage = 0;
                            unlockedPops.forEach(pop => {
                                const percentageInput = pop.querySelector('.percentage-input');
                                totalUnlockedPercentage += parseFloat(percentageInput.value);
                            });
                            
                            unlockedPops.forEach((pop, index) => {
                                const percentageInput = pop.querySelector('.percentage-input');
                                const sizeInput = pop.querySelector('.size-value');
                                
                                const percentage = parseFloat(percentageInput.value);
                                let newSize;
                                
                                if (index === unlockedPops.length - 1) {
                                    newSize = Math.max(1, remainingPopulation);
                                } else {
                                    const ratio = percentage / totalUnlockedPercentage;
                                    newSize = Math.max(1, Math.round(ratio * remainingPopulation));
                                    remainingPopulation -= newSize;
                                }
                                
                                sizeInput.value = newSize;
                                updatePopTitle(pop.id);
                            });
                        }
                        
                        updatePopSummary(provinceGroupId);
                        updateSliderMaxValues(provinceGroupId);
                    }
                    
                    function updatePopSummary(provinceGroupId) {
                        const summaryContainer = document.getElementById('pop-summary-' + provinceGroupId);
                        const popsList = document.getElementById('pops-list-' + provinceGroupId);
                        const pops = popsList.querySelectorAll('.pop-group');
                        
                        if (!summaryContainer || pops.length === 0) return;
                        
                        summaryContainer.innerHTML = '';
                        
                        const popsByType = {};
                        pops.forEach(pop => {
                            const typeInput = pop.querySelector('[id^="pop-type-"]');
                            const sizeInput = pop.querySelector('.size-value');
                            
                            if (typeInput && sizeInput) {
                                const type = typeInput.value.trim();
                                const size = parseInt(sizeInput.value) || 0;
                                
                                if (type) {
                                    if (!popsByType[type]) {
                                        popsByType[type] = 0;
                                    }
                                    popsByType[type] += size;
                                }
                            }
                        });
                        
                        for (const [type, size] of Object.entries(popsByType)) {
                            const item = document.createElement('div');
                            item.className = 'pop-summary-item';
                            item.innerHTML = \`
                                <span class="pop-summary-title">\${type}</span>
                                <span>\${size.toLocaleString()}</span>
                            \`;
                            summaryContainer.appendChild(item);
                        }
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
                    
                    function togglePopGroup(id) {
                        const group = document.getElementById(id);
                        if (!group) return;
                        
                        const isExpanded = group.classList.contains('expanded');
                        const toggle = group.querySelector('.pop-group-toggle');
                        
                        if (isExpanded) {
                            group.classList.remove('expanded');
                            toggle.textContent = '+';
                        } else {
                            group.classList.add('expanded');
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
                    
                    function updatePopTitle(popId) {
                        const typeInput = document.getElementById('pop-type-' + popId);
                        const cultureInput = document.getElementById('pop-culture-' + popId);
                        const sizeInput = document.getElementById('pop-size-' + popId);
                        
                        const type = typeInput.value.trim();
                        const culture = cultureInput.value.trim();
                        const size = sizeInput.value.trim();
                        
                        const titleElement = document.querySelector('#' + popId + ' .pop-group-title');
                        
                        if (type && culture && size) {
                            titleElement.textContent = \`\${type} (\${culture}): \${parseInt(size).toLocaleString()}\`;
                        } else if (type) {
                            titleElement.textContent = \`\${type}\`;
                        } else {
                            titleElement.textContent = 'New Population Group';
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
                            
                            const provinceName = document.getElementById('provinceName-' + groupId).value.trim();
                            if (!provinceName) {
                                vscode.postMessage({
                                    command: 'error',
                                    message: 'Province Name is required for all provinces'
                                });
                                return null;
                            }
                            
                            const populationSizeInput = document.getElementById('populationSize-' + groupId);
                            let populationSize = populationSizeInput.value.trim() ? parseInt(populationSizeInput.value) : null;
                            
                            if (populationSize === null || isNaN(populationSize) || populationSize < 1) {
                                vscode.postMessage({
                                    command: 'error',
                                    message: 'Population Size is required and must be a number greater than 0'
                                });
                                return null;
                            }
                            
                            const popElements = document.querySelectorAll('#pops-list-' + groupId + ' .pop-group');
                            if (popElements.length === 0) {
                                vscode.postMessage({
                                    command: 'error',
                                    message: 'Each province must have at least one population group'
                                });
                                return null;
                            }
                            
                            const pops = [];
                            let totalPopSize = 0;
                            
                            for (const popElement of popElements) {
                                const popId = popElement.id;
                                
                                const typeInput = document.getElementById('pop-type-' + popId);
                                const cultureInput = document.getElementById('pop-culture-' + popId);
                                const religionInput = document.getElementById('pop-religion-' + popId);
                                const sizeInput = document.getElementById('pop-size-' + popId);
                                
                                const type = typeInput.value.trim();
                                const culture = cultureInput.value.trim();
                                const religion = religionInput.value.trim();
                                let size = sizeInput.value.trim() ? parseInt(sizeInput.value) : 0;
                                
                                if (!type) {
                                    vscode.postMessage({
                                        command: 'error',
                                        message: 'Population Type is required for all population groups'
                                    });
                                    return null;
                                }
                                
                                if (!culture) {
                                    vscode.postMessage({
                                        command: 'error',
                                        message: 'Population Culture is required for all population groups'
                                    });
                                    return null;
                                }
                                
                                if (!religion) {
                                    vscode.postMessage({
                                        command: 'error',
                                        message: 'Population Religion is required for all population groups'
                                    });
                                    return null;
                                }
                                
                                if (size < 1) {
                                    vscode.postMessage({
                                        command: 'error',
                                        message: 'Population Size must be greater than 0 for all population groups'
                                    });
                                    return null;
                                }
                                
                                totalPopSize += size;
                                
                                pops.push({
                                    type,
                                    culture,
                                    religion,
                                    size
                                });
                            }
                            
                            const popDifference = Math.abs(totalPopSize - populationSize);
                            if (popDifference > pops.length) {
                                const lastPop = pops[pops.length - 1];
                                const adjustment = populationSize - (totalPopSize - lastPop.size);
                                if (adjustment > 0) {
                                    lastPop.size = adjustment;
                                    populationSize = totalPopSize - lastPop.size + adjustment;
                                }
                            }
                            
                            provinces.push({
                                provinceId,
                                provinceName,
                                populationSize,
                                pops
                            });
                        }
                        
                        return { provinces };
                    }
                    
                    // Initialize first province group and set up event listeners
                    try {
                        // Add the first province group
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
                    } catch (error) {
                        console.error("Initialization error:", error);
                        alert("Error initializing the application: " + error.message);
                    }
                })();
            </script>
        </body>
        </html>`;
    }
}