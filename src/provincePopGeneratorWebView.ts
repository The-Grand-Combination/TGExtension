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
                console.log('Received message from webview:', message);
                try {
                    switch (message.command) {
                        case 'generate':
                            console.log('Processing generate command...');
                            const data = message.data;
                            if (!data || !data.provinces || !Array.isArray(data.provinces)) {
                                vscode.window.showErrorMessage('Invalid data format received.');
                                console.error('Invalid data format:', data);
                                return;
                            }

                            console.log('Data validation passed, provinces count:', data.provinces.length);
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
                                console.log('Save dialog cancelled');
                                return;
                            }
                            
                            console.log('Save location selected:', fileUri.fsPath);
                            let popDataContent = '';
                            
                            for (const province of provinces) {
                                if (!province.provinceId || !province.provinceName || !province.pops) {
                                    vscode.window.showErrorMessage(`Invalid province data: missing required fields.`);
                                    console.error('Invalid province data:', province);
                                    return;
                                }

                                console.log('Processing province:', province.provinceName);
                                popDataContent += `#${province.provinceName} (${province.populationSize})\n${province.provinceId} = {\n`;
                                
                                for (const pop of province.pops) {
                                    if (!pop.type || !pop.culture || !pop.religion || typeof pop.size !== 'number') {
                                        vscode.window.showErrorMessage(`Invalid population data in province ${province.provinceName}.`);
                                        console.error('Invalid pop data:', pop);
                                        return;
                                    }

                                    popDataContent += `\t${pop.type} = {\n`;
                                    popDataContent += `\t\tculture = ${pop.culture}\n`;
                                    popDataContent += `\t\treligion = ${pop.religion}\n`;
                                    popDataContent += `\t\tsize = ${pop.size}\n`;
                                    popDataContent += `\t}\n`;
                                }
                                
                                popDataContent += `}\n\n`;
                            }
                            
                            console.log('Generated content length:', popDataContent.length);
                            console.log('Generated content preview:', popDataContent.substring(0, 200));
                            
                            await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(popDataContent));
                            console.log('File written successfully');
                            
                            const document = await vscode.workspace.openTextDocument(fileUri);
                            await vscode.window.showTextDocument(document);
                            
                            vscode.window.showInformationMessage(`Successfully generated population data for ${provinces.length} province(s).`);
                            console.log('Generation completed successfully');
                            break;
                        case 'error':
                            vscode.window.showErrorMessage(message.message || 'An unknown error occurred.');
                            break;
                        default:
                            console.warn('Unknown message command:', message.command);
                    }
                } catch (error) {
                    console.error('Error in message handler:', error);
                    vscode.window.showErrorMessage(`Error processing request: ${error instanceof Error ? error.message : String(error)}`);
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
                .pop-group {
                    margin-bottom: 15px;
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    padding: 12px;
                    border-radius: 5px;
                    border-left: 4px solid var(--vscode-button-background);
                }
                .pop-group[data-locked="true"] input:disabled {
                    background-color: var(--vscode-input-background);
                    opacity: 0.7;
                    cursor: not-allowed;
                }
                .pop-group[data-locked="true"] .percentage-input:disabled {
                    opacity: 0.7;
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
                .combined-size-controls {
                    display: flex;
                    align-items: center;
                    gap: 15px;
                    margin-bottom: 12px;
                    width: 100%;
                }
                .size-input-container {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    min-width: 200px;
                    flex-shrink: 0;
                }
                .slider-with-controls {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .percentage-display {
                    font-weight: bold;
                    color: var(--vscode-button-background);
                    min-width: 45px;
                }
                .percentage-input {
                    width: 250px;
                }
                .lock-label {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    cursor: pointer;
                    white-space: nowrap;
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
                .pop-lock:checked + .lock-icon::before {
                    content: '';
                    position: absolute;
                    left: 5px;
                    top: 2px;
                    width: 5px;
                    height: 10px;
                    border: solid var(--vscode-button-secondaryForeground);
                    border-width: 0 2px 2px 0;
                    transform: rotate(45deg);
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
                .error-message {
                    color: var(--vscode-errorForeground);
                    background-color: var(--vscode-inputValidation-errorBackground);
                    border: 1px solid var(--vscode-inputValidation-errorBorder);
                    padding: 8px;
                    border-radius: 3px;
                    margin: 10px 0;
                    display: none;
                }
            </style>
        </head>
        <body>
            <h1>Population Distribution Tool</h1>
            
            <div id="errorContainer" class="error-message"></div>
            
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
                    
                    function showError(message) {
                        const errorContainer = document.getElementById('errorContainer');
                        if (errorContainer) {
                            errorContainer.textContent = message;
                            errorContainer.style.display = 'block';
                            setTimeout(() => {
                                errorContainer.style.display = 'none';
                            }, 5000);
                        }
                    }
                    
                    function safeParseFloat(value, defaultValue = 0) {
                        const parsed = parseFloat(value);
                        return isNaN(parsed) ? defaultValue : parsed;
                    }
                    
                    function safeParseInt(value, defaultValue = 0) {
                        const parsed = parseInt(value);
                        return isNaN(parsed) ? defaultValue : parsed;
                    }
                    
                    function roundToTwoDecimals(num) {
                        return Math.round((num + Number.EPSILON) * 100) / 100;
                    }
                    
                    function getElementById(id) {
                        const element = document.getElementById(id);
                        if (!element) {
                            console.warn('Element with ID "' + id + '" not found');
                        }
                        return element;
                    }
                    
                    function addProvinceGroup() {
                        try {
                            const container = getElementById('provincesContainer');
                            if (!container) {
                                throw new Error('Provinces container not found');
                            }
                            
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
                                        '<label for="provinceId-' + provinceGroupId + '">Province ID:</label>' +
                                        '<input type="text" id="provinceId-' + provinceGroupId + '" class="input-field" ' +
                                            'placeholder="e.g. 300" required>' +
                                    '</div>' +
                                    '<div class="form-group">' +
                                        '<label for="provinceName-' + provinceGroupId + '">Province Name:</label>' +
                                        '<input type="text" id="provinceName-' + provinceGroupId + '" class="input-field" ' +
                                            'placeholder="e.g. London" required>' +
                                    '</div>' +
                                    '<div class="section-header">' +
                                        '<div class="total-population">' +
                                            '<label for="populationSize-' + provinceGroupId + '">Total Population:</label>' +
                                            '<input type="number" id="populationSize-' + provinceGroupId + '" class="input-field size-value" ' +
                                                'placeholder="Total Population" required min="1">' +
                                        '</div>' +
                                        '<span>Population Data</span>' +
                                    '</div>' +
                                    '<div id="pop-summary-' + provinceGroupId + '" class="pop-summary">' +
                                    '</div>' +
                                    '<div></div>' +
                                    '<div class="form-group">' +
                                        '<label>Population Groups:</label>' +
                                        '<div id="pops-list-' + provinceGroupId + '">' +
                                        '</div>' +
                                        '<button type="button" id="add-pop-' + provinceGroupId + '" ' +
                                            'class="secondary-button">Add Population Group</button>' +
                                    '</div>' +
                                '</div>';
                            
                            container.appendChild(provinceGroup);
                            
                            const header = provinceGroup.querySelector('.province-group-header');
                            const removeButton = provinceGroup.querySelector('.province-group-remove');
                            const addPopButton = getElementById('add-pop-' + provinceGroupId);
                            const provinceIdInput = getElementById('provinceId-' + provinceGroupId);
                            const provinceNameInput = getElementById('provinceName-' + provinceGroupId);
                            const populationSizeInput = getElementById('populationSize-' + provinceGroupId);
                            
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
                                    const groupToRemove = getElementById('province-group-' + id);
                                    if (groupToRemove) {
                                        groupToRemove.remove();
                                    }
                                });
                            }
                            
                            if (addPopButton) {
                                addPopButton.addEventListener('click', function() {
                                    addPop(provinceGroupId);
                                    updateSliderMaxValues(provinceGroupId);
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
                            
                            if (populationSizeInput) {
                                populationSizeInput.addEventListener('input', function() {
                                    let totalPop = safeParseInt(this.value, 1);
                                    if (totalPop < 1) {
                                        totalPop = 1;
                                        this.value = "1";
                                    }
                                    
                                    updatePopSizes(provinceGroupId);
                                    updatePopSummary(provinceGroupId);
                                    updateSliderMaxValues(provinceGroupId);
                                });
                            }
                            
                            addPop(provinceGroupId);
                            updatePopSummary(provinceGroupId);
                            updateSliderMaxValues(provinceGroupId);
                            
                            return provinceGroup;
                        } catch (error) {
                            console.error("Error in addProvinceGroup:", error);
                            showError("Error adding province: " + error.message);
                            return null;
                        }
                    }
                    
                    function addPop(provinceGroupId) {
                        try {
                            const popsList = getElementById('pops-list-' + provinceGroupId);
                            if (!popsList) {
                                throw new Error("Population list container not found for province " + provinceGroupId);
                            }
                            
                            const popId = 'pop-' + provinceGroupId + '-' + popCounter++;
                            
                            const popItem = document.createElement('div');
                            popItem.className = 'pop-group expanded';
                            popItem.id = popId;
                            popItem.dataset.provinceId = provinceGroupId;
                            
                            const existingPops = popsList.querySelectorAll('.pop-group').length;
                            const defaultPercentage = existingPops === 0 ? 100 : 0.01; // New pops start at 0.01%
                            
                            if (existingPops > 0) {
                                redistributeExistingPops(popsList, existingPops, provinceGroupId);
                            }
                            
                            const removeSymbol = String.fromCharCode(215); // × symbol
                            
                            popItem.innerHTML = 
                                '<div class="pop-group-header" data-id="' + popId + '">' +
                                    '<span>' +
                                        '<span class="pop-group-toggle">-</span>' +
                                        '<span class="pop-group-title">New Population Group</span>' +
                                    '</span>' +
                                    '<span class="pop-group-remove" data-id="' + popId + '">' + removeSymbol + '</span>' +
                                '</div>' +
                                '<div class="pop-group-content">' +
                                    '<div class="form-group">' +
                                        '<label for="pop-type-' + popId + '">Type:</label>' +
                                        '<input type="text" id="pop-type-' + popId + '" class="input-field" ' +
                                            'placeholder="Check your poptypes/ folder - Vanilla: farmers, labourers, soldiers, artisans, craftsmen, slaves, aristocrats, bureaucrats, capitalists, clergymen, clerks, officers. Common in mods: serfs. Rare in mods: pioneers, post_revolt_bureau, tribals [...]" required>' +
                                    '</div>' +
                                    '<div class="form-group">' +
                                        '<label for="pop-culture-' + popId + '">Culture:</label>' +
                                        '<input type="text" id="pop-culture-' + popId + '" class="input-field" ' +
                                            'placeholder="Check your common/cultures.txt file - e.g. british, irish, scottish, [...]" required>' +
                                    '</div>' +
                                    '<div class="form-group">' +
                                        '<label for="pop-religion-' + popId + '">Religion:</label>' +
                                        '<input type="text" id="pop-religion-' + popId + '" class="input-field" ' +
                                            'placeholder="Check your common/religion.txt file - e.g. catholic, protestant, mormon, orthodox, coptic, jewish, animist, sunni, shiite, ibadi, druze, bektashi, yazidi, mahayana, gelugpa, theravada, hindu, shinto, sikh, confucian [...]" required>' +
                                    '</div>' +
                                    '<div class="form-group">' +
                                        '<div class="combined-size-controls">' +
                                            '<div class="size-input-container">' +
                                                '<label for="pop-size-' + popId + '">Population:</label>' +
                                                '<input type="number" id="pop-size-' + popId + '" class="input-field size-value" ' +
                                                    'placeholder="e.g. 5000" min="1" required>' +
                                            '</div>' +
                                            '<div class="slider-with-controls">' +
                                                '<span class="percentage-display">100%</span>' +
                                                '<input type="range" id="pop-percentage-' + popId + '" class="percentage-input"' +
                                                    'min="0.1" max="100" value="100" step="0.1">' +
                                                '<label class="lock-label">' +
                                                    'Lock: &nbsp;<input type="checkbox" id="pop-lock-' + popId + '" class="pop-lock">' +
                                                    '<span class="lock-icon"></span>' +
                                                '</label>' +
                                            '</div>' +
                                        '</div>' +
                                    '</div>' +
                                '</div>';
                            
                            popsList.appendChild(popItem);
                            
                            setupPopEventListeners(popItem, popId, provinceGroupId, defaultPercentage);
                            
                            return popItem;
                        } catch (error) {
                            console.error("Error in addPop:", error);
                            showError("Error adding population group: " + error.message);
                            return null;
                        }
                    }
                    
                    function redistributeExistingPops(popsList, existingPops, provinceGroupId) {
                        // New approach: take 0.01% from existing unlocked pops proportionally
                        const existingPopElements = popsList.querySelectorAll('.pop-group');
                        let totalUnlockedPercentage = 0;
                        let unlockedPops = [];
                        
                        // First, calculate total percentage of unlocked pops
                        existingPopElements.forEach(pop => {
                            if (!pop.dataset.locked || pop.dataset.locked === 'false') {
                                const percentageInput = pop.querySelector('.percentage-input');
                                if (percentageInput) {
                                    const currentPercentage = safeParseFloat(percentageInput.value);
                                    totalUnlockedPercentage += currentPercentage;
                                    unlockedPops.push({
                                        element: pop,
                                        currentPercentage: currentPercentage,
                                        percentageInput: percentageInput,
                                        percentageDisplay: pop.querySelector('.percentage-display'),
                                        sizeInput: pop.querySelector('.size-value')
                                    });
                                }
                            }
                        });
                        
                        // Only redistribute if there are unlocked pops and total is > 0.01%
                        if (unlockedPops.length > 0 && totalUnlockedPercentage > 0.01) {
                            const newPopPercentage = 0.01;
                            const reductionFactor = (totalUnlockedPercentage - newPopPercentage) / totalUnlockedPercentage;
                            
                            unlockedPops.forEach(popData => {
                                const newPercentage = roundToTwoDecimals(popData.currentPercentage * reductionFactor);
                                const finalPercentage = Math.max(0.01, newPercentage); // Ensure minimum 0.01%
                                
                                if (popData.percentageInput && popData.percentageDisplay && popData.sizeInput) {
                                    popData.percentageInput.value = finalPercentage;
                                    popData.percentageDisplay.textContent = finalPercentage + '%';
                                    
                                    const populationSizeInput = getElementById('populationSize-' + provinceGroupId);
                                    if (populationSizeInput && populationSizeInput.value) {
                                        const newSize = Math.round((finalPercentage / 100) * safeParseInt(populationSizeInput.value));
                                        popData.sizeInput.value = Math.max(1, newSize);
                                    }
                                    
                                    updatePopTitle(popData.element.id);
                                }
                            });
                        }
                    }
                    
                    function setupPopEventListeners(popItem, popId, provinceGroupId, defaultPercentage) {
                        const header = popItem.querySelector('.pop-group-header');
                        const removeButton = popItem.querySelector('.pop-group-remove');
                        const typeInput = getElementById('pop-type-' + popId);
                        const cultureInput = getElementById('pop-culture-' + popId);
                        const religionInput = getElementById('pop-religion-' + popId);
                        const sizeInput = getElementById('pop-size-' + popId);
                        const percentageInput = getElementById('pop-percentage-' + popId);
                        const percentageDisplay = popItem.querySelector('.percentage-display');
                        const lockCheckbox = getElementById('pop-lock-' + popId);
                        
                        if (header) {
                            header.addEventListener('click', function(e) {
                                if (!e.target.classList.contains('pop-group-remove')) {
                                    const id = this.getAttribute('data-id');
                                    togglePopGroup(id);
                                }
                            });
                        }
                        
                        if (removeButton) {
                            removeButton.addEventListener('click', function(e) {
                                e.stopPropagation();
                                const id = this.getAttribute('data-id');
                                const popToRemove = getElementById(id);
                                if (popToRemove) {
                                    const provinceId = popToRemove.dataset.provinceId;
                                    popToRemove.remove();
                                    redistributePercentages(provinceId);
                                    updatePopSummary(provinceId);
                                    updateSliderMaxValues(provinceId);
                                }
                            });
                        }
                        
                        // Set initial values
                        const populationSizeInput = getElementById('populationSize-' + provinceGroupId);
                        if (populationSizeInput && populationSizeInput.value && sizeInput) {
                            sizeInput.value = Math.max(1, Math.round((defaultPercentage / 100) * safeParseInt(populationSizeInput.value)));
                        } else if (sizeInput) {
                            sizeInput.value = 1;
                        }
                        
                        if (percentageInput && percentageDisplay) {
                            percentageInput.value = defaultPercentage;
                            percentageDisplay.textContent = defaultPercentage + '%';
                        }
                        
                        // Input event listeners
                        [typeInput, cultureInput, religionInput].forEach(input => {
                            if (input) {
                                input.addEventListener('input', () => updatePopTitle(popId));
                            }
                        });
                        
                        if (sizeInput) {
                            sizeInput.addEventListener('input', function() {
                                let size = Math.max(1, safeParseInt(this.value, 1));
                                this.value = size;
                                
                                const populationSizeInput = getElementById('populationSize-' + provinceGroupId);
                                if (populationSizeInput && populationSizeInput.value) {
                                    const totalPop = safeParseInt(populationSizeInput.value);
                                    if (size > totalPop) {
                                        size = totalPop;
                                        this.value = size;
                                    }
                                    
                                    const percentage = roundToTwoDecimals((size / totalPop) * 100);
                                    if (percentageInput && percentageDisplay) {
                                        percentageInput.value = percentage;
                                        percentageDisplay.textContent = percentage + '%';
                                    }
                                    
                                    adjustOtherPops(popId, percentage);
                                }
                                
                                updatePopTitle(popId);
                                updatePopSummary(provinceGroupId);
                                updateSliderMaxValues(provinceGroupId);
                            });
                        }
                        
                        if (percentageInput) {
                            percentageInput.addEventListener('input', function() {
                                let percentage = Math.max(0.01, Math.min(100, safeParseFloat(this.value, 0.01)));
                                
                                const maxAvailablePercentage = getMaxAvailablePercentage(provinceGroupId, popId);
                                if (percentage > maxAvailablePercentage) {
                                    percentage = maxAvailablePercentage;
                                }
                                
                                this.value = percentage;
                                if (percentageDisplay) {
                                    percentageDisplay.textContent = roundToTwoDecimals(percentage) + '%';
                                }
                                
                                const populationSizeInput = getElementById('populationSize-' + provinceGroupId);
                                if (populationSizeInput && populationSizeInput.value && sizeInput) {
                                    const newSize = Math.max(1, Math.round((percentage / 100) * safeParseInt(populationSizeInput.value)));
                                    sizeInput.value = newSize;
                                }
                                
                                adjustOtherPops(popId, percentage);
                                updatePopTitle(popId);
                                updatePopSummary(provinceGroupId);
                                updateSliderMaxValues(provinceGroupId);
                            });
                        }
                        
                        if (lockCheckbox) {
                            lockCheckbox.addEventListener('change', function() {
                                popItem.dataset.locked = this.checked.toString();
                                
                                const inputs = [typeInput, cultureInput, religionInput, sizeInput, percentageInput];
                                inputs.forEach(input => {
                                    if (input) {
                                        input.disabled = this.checked;
                                    }
                                });
                                
                                if (this.checked && sizeInput) {
                                    popItem.dataset.lockedSize = sizeInput.value;
                                } else {
                                    delete popItem.dataset.lockedSize;
                                    redistributePercentages(provinceGroupId);
                                }
                                
                                updatePopSummary(provinceGroupId);
                                updateSliderMaxValues(provinceGroupId);
                            });
                        }
                        
                        updatePopTitle(popId);
                    }
                    
                    function getMaxAvailablePercentage(provinceId, currentPopId) {
                        const popsList = getElementById('pops-list-' + provinceId);
                        if (!popsList) return 100;
                        
                        const allPops = popsList.querySelectorAll('.pop-group');
                        let totalOtherLockedPercentage = 0;
                        let minRequiredPercentage = 0;
                        
                        allPops.forEach(pop => {
                            if (pop.id === currentPopId) return;
                            
                            if (pop.dataset.locked === 'true') {
                                const percentageInput = pop.querySelector('.percentage-input');
                                if (percentageInput) {
                                    totalOtherLockedPercentage += safeParseFloat(percentageInput.value);
                                }
                            } else {
                                minRequiredPercentage += 0.01;
                            }
                        });
                        
                        const maxAvailable = 100 - totalOtherLockedPercentage - minRequiredPercentage;
                        return Math.max(0.01, Math.min(100, maxAvailable));
                    }
                    
                    function updateSliderMaxValues(provinceId) {
                        const popsList = getElementById('pops-list-' + provinceId);
                        if (!popsList) return;
                        
                        const allPops = popsList.querySelectorAll('.pop-group');
                        
                        allPops.forEach(pop => {
                            const percentageInput = pop.querySelector('.percentage-input');
                            if (!percentageInput) return;
                            
                            const maxAvailable = getMaxAvailablePercentage(provinceId, pop.id);
                            percentageInput.max = maxAvailable;
                            
                            if (safeParseFloat(percentageInput.value) > maxAvailable) {
                                percentageInput.value = maxAvailable;
                                const percentageDisplay = pop.querySelector('.percentage-display');
                                if (percentageDisplay) {
                                    percentageDisplay.textContent = roundToTwoDecimals(maxAvailable) + '%';
                                }
                                
                                const populationSizeInput = getElementById('populationSize-' + provinceId);
                                const sizeInput = pop.querySelector('.size-value');
                                if (populationSizeInput && populationSizeInput.value && sizeInput) {
                                    const newSize = Math.max(1, Math.round((maxAvailable / 100) * safeParseInt(populationSizeInput.value)));
                                    sizeInput.value = newSize;
                                }
                                
                                updatePopTitle(pop.id);
                            }
                        });
                    }
                    
                    function adjustOtherPops(changedPopId, newPercentage) {
                        const changedPop = getElementById(changedPopId);
                        if (!changedPop) return;
                        
                        const provinceId = changedPop.dataset.provinceId;
                        const popsList = getElementById('pops-list-' + provinceId);
                        if (!popsList) return;
                        
                        const allPops = popsList.querySelectorAll('.pop-group');
                        let totalLockedPercentage = 0;
                        let totalUnlockedPercentage = 0;
                        let unlockedPops = [];
                        
                        allPops.forEach(pop => {
                            if (pop.id === changedPopId) return;
                            
                            const percentageInput = pop.querySelector('.percentage-input');
                            if (!percentageInput) return;
                            
                            const percentage = safeParseFloat(percentageInput.value);
                            
                            if (pop.dataset.locked === 'true') {
                                totalLockedPercentage += percentage;
                            } else {
                                totalUnlockedPercentage += percentage;
                                unlockedPops.push(pop);
                            }
                        });
                        
                        let targetTotal = 100 - newPercentage - totalLockedPercentage;
                        const minPercentageNeeded = unlockedPops.length * 0.01;
                        if (targetTotal < minPercentageNeeded) {
                            targetTotal = minPercentageNeeded;
                        }
                        
                        if (unlockedPops.length > 0 && totalUnlockedPercentage > 0) {
                            let remainingPercentage = targetTotal;
                            
                            unlockedPops.forEach((pop, index) => {
                                const percentageInput = pop.querySelector('.percentage-input');
                                const percentageDisplay = pop.querySelector('.percentage-display');
                                const sizeInput = pop.querySelector('.size-value');
                                
                                if (!percentageInput || !percentageDisplay || !sizeInput) return;
                                
                                let newPercentageValue;
                                
                                if (index === unlockedPops.length - 1) {
                                    newPercentageValue = Math.max(0.01, remainingPercentage);
                                } else {
                                    const currentPercentage = safeParseFloat(percentageInput.value);
                                    const ratio = totalUnlockedPercentage > 0 ? currentPercentage / totalUnlockedPercentage : 1 / unlockedPops.length;
                                    newPercentageValue = Math.max(0.01, ratio * targetTotal);
                                    remainingPercentage -= newPercentageValue;
                                }
                                
                                newPercentageValue = roundToTwoDecimals(newPercentageValue);
                                percentageInput.value = newPercentageValue;
                                percentageDisplay.textContent = newPercentageValue + '%';
                                
                                const populationSizeInput = getElementById('populationSize-' + provinceId);
                                if (populationSizeInput && populationSizeInput.value) {
                                    const newSize = Math.max(1, Math.round((newPercentageValue / 100) * safeParseInt(populationSizeInput.value)));
                                    sizeInput.value = newSize;
                                }
                                
                                updatePopTitle(pop.id);
                            });
                        }
                        
                        updateSliderMaxValues(provinceId);
                    }
                    
                    function redistributePercentages(provinceId) {
                        const popsList = getElementById('pops-list-' + provinceId);
                        if (!popsList) return;
                        
                        const remainingPops = popsList.querySelectorAll('.pop-group');
                        if (remainingPops.length === 0) return;
                        
                        let totalLockedPercentage = 0;
                        let unlockedPops = [];
                        
                        remainingPops.forEach(pop => {
                            if (pop.dataset.locked === 'true') {
                                const percentageInput = pop.querySelector('.percentage-input');
                                if (percentageInput) {
                                    totalLockedPercentage += safeParseFloat(percentageInput.value);
                                }
                            } else {
                                unlockedPops.push(pop);
                            }
                        });
                        
                        totalLockedPercentage = Math.min(totalLockedPercentage, 100);
                        const remainingPercentage = 100 - totalLockedPercentage;
                        const minimumNeeded = unlockedPops.length * 0.01;
                        
                        if (unlockedPops.length > 0) {
                            const percentagePerPop = remainingPercentage >= minimumNeeded ? 
                                roundToTwoDecimals(remainingPercentage / unlockedPops.length) : 0.01;
                            
                            unlockedPops.forEach(pop => {
                                const percentageInput = pop.querySelector('.percentage-input');
                                const percentageDisplay = pop.querySelector('.percentage-display');
                                const sizeInput = pop.querySelector('.size-value');
                                
                                if (percentageInput && percentageDisplay && sizeInput) {
                                    percentageInput.value = percentagePerPop;
                                    percentageDisplay.textContent = percentagePerPop + '%';
                                    
                                    const populationSizeInput = getElementById('populationSize-' + provinceId);
                                    if (populationSizeInput && populationSizeInput.value) {
                                        const newSize = Math.max(1, Math.round((percentagePerPop / 100) * safeParseInt(populationSizeInput.value)));
                                        sizeInput.value = newSize;
                                    }
                                    
                                    updatePopTitle(pop.id);
                                }
                            });
                        }
                        
                        updateSliderMaxValues(provinceId);
                    }
                    
                    function updatePopSizes(provinceGroupId) {
                        const populationSizeInput = getElementById('populationSize-' + provinceGroupId);
                        if (!populationSizeInput || !populationSizeInput.value) return;
                        
                        const totalPop = safeParseInt(populationSizeInput.value);
                        if (totalPop < 1) return;
                        
                        const popsList = getElementById('pops-list-' + provinceGroupId);
                        if (!popsList) return;
                        
                        const pops = popsList.querySelectorAll('.pop-group');
                        let remainingPopulation = totalPop;
                        let totalLockedPopulation = 0;
                        
                        // Handle locked populations first
                        pops.forEach(pop => {
                            if (pop.dataset.locked === 'true') {
                                const sizeInput = pop.querySelector('.size-value');
                                if (sizeInput) {
                                    const lockedSize = safeParseInt(sizeInput.value);
                                    totalLockedPopulation += lockedSize;
                                    
                                    const percentageInput = pop.querySelector('.percentage-input');
                                    const percentageDisplay = pop.querySelector('.percentage-display');
                                    if (percentageInput && percentageDisplay) {
                                        const newPercentage = roundToTwoDecimals((lockedSize / totalPop) * 100);
                                        percentageInput.value = newPercentage;
                                        percentageDisplay.textContent = newPercentage + '%';
                                    }
                                    
                                    updatePopTitle(pop.id);
                                }
                            }
                        });
                        
                        remainingPopulation = Math.max(0, totalPop - totalLockedPopulation);
                        
                        const unlockedPops = Array.from(pops).filter(pop => pop.dataset.locked !== 'true');
                        if (unlockedPops.length > 0) {
                            let distributedPopulation = 0;
                            
                            unlockedPops.forEach((pop, index) => {
                                const percentageInput = pop.querySelector('.percentage-input');
                                const percentageDisplay = pop.querySelector('.percentage-display');
                                const sizeInput = pop.querySelector('.size-value');
                                
                                if (!percentageInput || !percentageDisplay || !sizeInput) return;
                                
                                let newSize;
                                if (index === unlockedPops.length - 1) {
                                    // Last pop gets remaining population
                                    newSize = Math.max(1, remainingPopulation - distributedPopulation);
                                } else {
                                    // Distribute proportionally
                                    const percentage = safeParseFloat(percentageInput.value);
                                    newSize = Math.max(1, Math.round((percentage / 100) * totalPop));
                                    distributedPopulation += newSize;
                                }
                                
                                sizeInput.value = newSize;
                                
                                const newPercentage = roundToTwoDecimals((newSize / totalPop) * 100);
                                percentageInput.value = newPercentage;
                                percentageDisplay.textContent = newPercentage + '%';
                                
                                updatePopTitle(pop.id);
                            });
                        }
                        
                        updatePopSummary(provinceGroupId);
                        updateSliderMaxValues(provinceGroupId);
                    }
                    
                    function updatePopSummary(provinceGroupId) {
                        const summaryContainer = getElementById('pop-summary-' + provinceGroupId);
                        const popsList = getElementById('pops-list-' + provinceGroupId);
                        
                        if (!summaryContainer || !popsList) return;
                        
                        const pops = popsList.querySelectorAll('.pop-group');
                        if (pops.length === 0) {
                            summaryContainer.innerHTML = '';
                            return;
                        }
                        
                        const popsByType = {};
                        pops.forEach(pop => {
                            const typeInput = pop.querySelector('[id^="pop-type-"]');
                            const sizeInput = pop.querySelector('.size-value');
                            
                            if (typeInput && sizeInput) {
                                const type = typeInput.value.trim() || 'Unnamed';
                                const size = safeParseInt(sizeInput.value);
                                
                                if (!popsByType[type]) {
                                    popsByType[type] = 0;
                                }
                                popsByType[type] += size;
                            }
                        });
                        
                        summaryContainer.innerHTML = '';
                        
                        for (const type in popsByType) {
                            const size = popsByType[type];
                            const item = document.createElement('div');
                            item.className = 'pop-summary-item';
                            item.innerHTML = 
                                '<span class="pop-summary-title">' + type + '</span>' +
                                '<span>' + size.toLocaleString() + '</span>';
                            summaryContainer.appendChild(item);
                        }
                    }
                    
                    function toggleProvinceGroup(id) {
                        const group = getElementById('province-group-' + id);
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
                    
                    function togglePopGroup(id) {
                        const group = getElementById(id);
                        if (!group) return;
                        
                        const isExpanded = group.classList.contains('expanded');
                        const toggle = group.querySelector('.pop-group-toggle');
                        
                        if (isExpanded) {
                            group.classList.remove('expanded');
                            if (toggle) toggle.textContent = '+';
                        } else {
                            group.classList.add('expanded');
                            if (toggle) toggle.textContent = '-';
                        }
                    }
                    
                    function updateProvinceTitle(provinceGroupId) {
                        const provinceIdInput = getElementById('provinceId-' + provinceGroupId);
                        const provinceNameInput = getElementById('provinceName-' + provinceGroupId);
                        const titleElement = document.querySelector('#province-group-' + provinceGroupId + ' .province-group-title');
                        
                        if (!titleElement) return;
                        
                        const provinceId = provinceIdInput ? provinceIdInput.value.trim() : '';
                        const provinceName = provinceNameInput ? provinceNameInput.value.trim() : '';
                        
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
                        const typeInput = getElementById('pop-type-' + popId);
                        const cultureInput = getElementById('pop-culture-' + popId);
                        const sizeInput = getElementById('pop-size-' + popId);
                        const titleElement = document.querySelector('#' + popId + ' .pop-group-title');
                        
                        if (!titleElement) return;
                        
                        const type = typeInput ? typeInput.value.trim() : '';
                        const culture = cultureInput ? cultureInput.value.trim() : '';
                        const size = sizeInput ? sizeInput.value.trim() : '';
                        
                        if (type && culture && size) {
                            const formattedSize = safeParseInt(size).toLocaleString();
                            titleElement.textContent = type + ' (' + culture + '): ' + formattedSize;
                        } else if (type) {
                            titleElement.textContent = type;
                        } else {
                            titleElement.textContent = 'New Population Group';
                        }
                    }
                    
                    function collectData() {
                        console.log('Starting data collection...');
                        
                        try {
                            const provinceGroups = document.querySelectorAll('.province-group');
                            console.log('Found province groups:', provinceGroups.length);
                            
                            if (provinceGroups.length === 0) {
                                throw new Error('At least one province is required');
                            }
                            
                            const provinces = [];
                            
                            for (let i = 0; i < provinceGroups.length; i++) {
                                const group = provinceGroups[i];
                                console.log('Processing province group:', i, group.id);
                                
                                const groupId = group.id.split('-')[2];
                                if (!groupId) {
                                    throw new Error('Invalid province group ID for group ' + i);
                                }
                                
                                const provinceIdInput = document.getElementById('provinceId-' + groupId);
                                const provinceNameInput = document.getElementById('provinceName-' + groupId);
                                const populationSizeInput = document.getElementById('populationSize-' + groupId);
                                
                                console.log('Province inputs found:', {
                                    id: !!provinceIdInput,
                                    name: !!provinceNameInput,
                                    size: !!populationSizeInput
                                });
                                
                                const provinceId = provinceIdInput ? provinceIdInput.value.trim() : '';
                                const provinceName = provinceNameInput ? provinceNameInput.value.trim() : '';
                                const populationSize = populationSizeInput ? safeParseInt(populationSizeInput.value) : 0;
                                
                                console.log('Province data:', { provinceId, provinceName, populationSize });
                                
                                if (!provinceId) {
                                    throw new Error('Province ID is required for province ' + (i + 1));
                                }
                                
                                if (!provinceName) {
                                    throw new Error('Province Name is required for province ' + (i + 1));
                                }
                                
                                if (populationSize < 1) {
                                    throw new Error('Population Size must be greater than 0 for province ' + (i + 1));
                                }
                                
                                const popsList = document.getElementById('pops-list-' + groupId);
                                if (!popsList) {
                                    throw new Error('Population list not found for province ' + provinceName);
                                }
                                
                                const popElements = popsList.querySelectorAll('.pop-group');
                                console.log('Found pop elements for province ' + provinceName + ':', popElements.length);
                                
                                if (popElements.length === 0) {
                                    throw new Error('Province "' + provinceName + '" must have at least one population group');
                                }
                                
                                const pops = [];
                                let totalPopSize = 0;
                                
                                for (let j = 0; j < popElements.length; j++) {
                                    const popElement = popElements[j];
                                    const popId = popElement.id;
                                    console.log('Processing pop:', popId);
                                    
                                    // Find inputs within this pop element directly
                                    const typeInput = popElement.querySelector('[id^="pop-type-"]');
                                    const cultureInput = popElement.querySelector('[id^="pop-culture-"]');
                                    const religionInput = popElement.querySelector('[id^="pop-religion-"]');
                                    const sizeInput = popElement.querySelector('[id^="pop-size-"]');
                                    
                                    console.log('Pop inputs found:', {
                                        type: !!typeInput,
                                        culture: !!cultureInput,
                                        religion: !!religionInput,
                                        size: !!sizeInput
                                    });
                                    
                                    if (typeInput) console.log('Type input ID:', typeInput.id);
                                    if (cultureInput) console.log('Culture input ID:', cultureInput.id);
                                    if (religionInput) console.log('Religion input ID:', religionInput.id);
                                    if (sizeInput) console.log('Size input ID:', sizeInput.id);
                                    
                                    const type = typeInput ? typeInput.value.trim() : '';
                                    const culture = cultureInput ? cultureInput.value.trim() : '';
                                    const religion = religionInput ? religionInput.value.trim() : '';
                                    const size = sizeInput ? safeParseInt(sizeInput.value) : 0;
                                    
                                    console.log('Pop data:', { type, culture, religion, size });
                                    
                                    if (!type) {
                                        throw new Error('Population Type is required for population group ' + (j + 1) + ' in province "' + provinceName + '"');
                                    }
                                    
                                    if (!culture) {
                                        throw new Error('Population Culture is required for population group ' + (j + 1) + ' in province "' + provinceName + '"');
                                    }
                                    
                                    if (!religion) {
                                        throw new Error('Population Religion is required for population group ' + (j + 1) + ' in province "' + provinceName + '"');
                                    }
                                    
                                    if (size < 1) {
                                        throw new Error('Population Size must be greater than 0 for population group ' + (j + 1) + ' in province "' + provinceName + '"');
                                    }
                                    
                                    totalPopSize += size;
                                    
                                    pops.push({
                                        type: type,
                                        culture: culture,
                                        religion: religion,
                                        size: size
                                    });
                                }
                                
                                console.log('Total pop size calculated:', totalPopSize, 'vs expected:', populationSize);
                                
                                provinces.push({
                                    provinceId: provinceId,
                                    provinceName: provinceName,
                                    populationSize: populationSize,
                                    pops: pops
                                });
                                
                                console.log('Added province to list:', provinceName);
                            }
                            
                            console.log('Data collection successful. Provinces:', provinces.length);
                            return { provinces: provinces };
                            
                        } catch (error) {
                            console.error('Error collecting data:', error);
                            showError('Data collection error: ' + error.message);
                            throw error;
                        }
                    }
                    
                    // Initialize the application
                    try {
                        console.log('Initializing application...');
                        addProvinceGroup();
                        
                        console.log('Looking for buttons...');
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
                        } else {
                            console.error('Add Province button not found!');
                        }
                        
                        if (generateBtn) {
                            generateBtn.addEventListener('click', function() {
                                console.log('Generate button clicked');
                                
                                // First, let's do a quick validation check
                                const provinces = document.querySelectorAll('.province-group');
                                console.log('Quick check - provinces found:', provinces.length);
                                
                                if (provinces.length === 0) {
                                    showError('No provinces found. Please add at least one province.');
                                    return;
                                }
                                
                                // Check the first province for basic data
                                const firstProvince = provinces[0];
                                const groupId = firstProvince.id.split('-')[2];
                                const nameInput = document.getElementById('provinceName-' + groupId);
                                const idInput = document.getElementById('provinceId-' + groupId);
                                const sizeInput = document.getElementById('populationSize-' + groupId);
                                
                                console.log('First province basic inputs:', {
                                    name: nameInput ? nameInput.value : 'NOT FOUND',
                                    id: idInput ? idInput.value : 'NOT FOUND',
                                    size: sizeInput ? sizeInput.value : 'NOT FOUND'
                                });
                                
                                if (!nameInput || !nameInput.value.trim()) {
                                    showError('Please fill in the Province Name for the first province.');
                                    if (nameInput) nameInput.focus();
                                    return;
                                }
                                
                                if (!idInput || !idInput.value.trim()) {
                                    showError('Please fill in the Province ID for the first province.');
                                    if (idInput) idInput.focus();
                                    return;
                                }
                                
                                if (!sizeInput || !sizeInput.value.trim() || parseInt(sizeInput.value) < 1) {
                                    showError('Please set a valid Total Population (greater than 0) for the first province.');
                                    if (sizeInput) sizeInput.focus();
                                    return;
                                }
                                
                                try {
                                    console.log('Basic validation passed, calling collectData...');
                                    const data = collectData();
                                    
                                    if (data && data.provinces && data.provinces.length > 0) {
                                        console.log('Data collected successfully, sending to VSCode:', data);
                                        vscode.postMessage({
                                            command: 'generate',
                                            data: data
                                        });
                                        console.log('Message sent to VSCode');
                                    } else {
                                        throw new Error('No valid province data collected');
                                    }
                                } catch (error) {
                                    console.error('Error in generate button handler:', error);
                                    showError('Error: ' + error.message);
                                }
                            });
                        } else {
                            console.error('Generate button not found!');
                        }
                        
                        console.log('Application initialized successfully');
                    } catch (error) {
                        console.error("Initialization error:", error);
                        showError("Error initializing the application: " + error.message);
                    }
                })();
            </script>
        </body>
        </html>`;
    }
}