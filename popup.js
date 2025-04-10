document.addEventListener('DOMContentLoaded', () => {
    // Add toggle debug button handler
    document.getElementById('toggle-debug').addEventListener('click', () => {
        const debugInfo = document.getElementById('debug-info');
        const toggleButton = document.getElementById('toggle-debug');
        
        if (debugInfo.style.display === 'none') {
            debugInfo.style.display = 'block';
            toggleButton.textContent = 'Hide Debug';
        } else {
            debugInfo.style.display = 'none';
            toggleButton.textContent = 'Show Debug';
        }
    });
    
    // Load saved settings
    chrome.storage.sync.get(['discordToken', 'isEnabled', 'statusMappings', 'statusLogs', 'updateFrequency'], (result) => {
        document.getElementById('discord-token').value = result.discordToken || '';
        document.getElementById('enabled').checked = result.isEnabled || false;
        
        // Set update frequency select
        const frequencySelect = document.getElementById('update-frequency');
        if (result.updateFrequency) {
            frequencySelect.value = result.updateFrequency.toString();
        }

        const mappings = result.statusMappings || [
            { urlPattern: "youtube.com", status: "Watching YouTube" },
            { urlPattern: "github.com", status: "Working on code" },
            { urlPattern: "netflix.com", status: "Watching Netflix" },
            { urlPattern: "docs.google.com", status: "Working on documents" },
            { urlPattern: "/prompt|ai|gpt|llm/i", status: "Learning AI and ML" }
        ];

        renderStatusMappings(mappings);
        
        // Load and display status logs
        const logs = result.statusLogs || [];
        const logsContainer = document.getElementById('status-logs');
        
        if (logs.length > 0) {
            logsContainer.innerHTML = '';
            // Display most recent logs first
            logs.slice(0, 20).forEach(log => {
                addLogEntry(log);
            });
        }
        
        // If token exists, fetch current status
        if (result.discordToken) {
            fetchCurrentStatus(result.discordToken);
        }
    });

    // Save settings
    document.getElementById('save-settings').addEventListener('click', () => {
        const discordToken = document.getElementById('discord-token').value;
        const isEnabled = document.getElementById('enabled').checked;
        const updateFrequency = parseInt(document.getElementById('update-frequency').value, 10);
        const saveStatus = document.getElementById('save-status');

        // Collect all mappings from UI and validate patterns
        const statusMappings = [];
        const mappingContainers = document.querySelectorAll('.status-mapping');
        let hasInvalidPatterns = false;

        mappingContainers.forEach(container => {
            const patternInput = container.querySelector('.url-pattern');
            const urlPattern = patternInput.value;
            const status = container.querySelector('.status-text').value;
            const validationMessage = container.querySelector('.pattern-validation');

            // Skip empty mappings
            if (!urlPattern || !status) {
                return;
            }
            
            // Validate regex patterns
            const result = validateRegexPattern(urlPattern);
            if (!result.valid) {
                hasInvalidPatterns = true;
                validationMessage.textContent = `Invalid regex: ${result.error}`;
                validationMessage.style.display = 'block';
                patternInput.style.borderColor = '#f04747';
                patternInput.focus();
                return;
            }
            
            statusMappings.push({ urlPattern, status });
        });

        // Don't save if there are invalid patterns
        if (hasInvalidPatterns) {
            saveStatus.textContent = 'Fix invalid patterns first';
            saveStatus.style.display = 'inline-block';
            saveStatus.style.backgroundColor = '#f04747';
            saveStatus.style.color = 'white';
            
            setTimeout(() => {
                saveStatus.style.display = 'none';
            }, 3000);
            return;
        }

        // Show saving indicator
        saveStatus.textContent = 'Saving...';
        saveStatus.style.display = 'inline-block';
        saveStatus.style.backgroundColor = '#f0f0f0';
        saveStatus.style.color = '#333';

        // Save to storage
        chrome.storage.sync.set({ discordToken, isEnabled, statusMappings, updateFrequency }, () => {
            // Show success message
            saveStatus.textContent = 'Settings saved!';
            saveStatus.style.backgroundColor = '#43b581';
            saveStatus.style.color = 'white';
            
            // Hide the message after 3 seconds
            setTimeout(() => {
                saveStatus.style.display = 'none';
            }, 3000);
            
            // Add a log entry
            addLogEntry({
                type: 'info',
                message: `Settings saved (${statusMappings.length} pattern mappings)`,
                timestamp: new Date().toLocaleTimeString()
            });
            
            // Refresh current status with new token
            if (discordToken) {
                fetchCurrentStatus(discordToken);
                
                // Force an immediate status check if enabled
                if (isEnabled) {
                    // Send message to background script to check current active tab
                    chrome.runtime.sendMessage({ 
                        action: 'checkActiveTab'
                    });
                }
            }
        });
    });

    // Add new mapping
    document.getElementById('add-mapping').addEventListener('click', () => {
        const mappingsContainer = document.getElementById('status-mappings-container');
        const newMapping = createMappingElement({ urlPattern: '', status: '' });
        mappingsContainer.appendChild(newMapping);
    });
    
    // Fetch Discord token
    document.getElementById('fetch-token').addEventListener('click', () => {
        // First check if Discord is already open in any tab
        chrome.tabs.query({ url: "*://*.discord.com/*" }, (tabs) => {
            if (tabs && tabs.length > 0) {
                // Use the first found Discord tab
                executeTokenFetch(tabs[0].id);
            } else {
                // If no Discord tab is open, create one
                chrome.tabs.create({ url: 'https://discord.com/channels/@me' }, (tab) => {
                    // Wait for the page to load before trying to fetch the token
                    const checkTabLoaded = setInterval(() => {
                        chrome.tabs.get(tab.id, (updatedTab) => {
                            if (updatedTab.status === 'complete' && updatedTab.url.includes('discord.com')) {
                                clearInterval(checkTabLoaded);
                                // Give some extra time for the Discord app to initialize
                                setTimeout(() => {
                                    executeTokenFetch(tab.id, true);
                                }, 3000);
                            }
                        });
                    }, 1000);
                });
            }
        });
    });
    
    // Validate Discord token
    document.getElementById('validate-token').addEventListener('click', () => {
        let token = document.getElementById('discord-token').value;
        const validationResult = document.getElementById('validation-result');
        const debugContainer = document.getElementById('debug-info') || document.createElement('div');
        
        // Create debug container if it doesn't exist
        if (!document.getElementById('debug-info')) {
            debugContainer.id = 'debug-info';
            debugContainer.style.marginTop = '10px';
            debugContainer.style.padding = '8px';
            debugContainer.style.backgroundColor = '#f8f9fa';
            debugContainer.style.borderRadius = '4px';
            debugContainer.style.fontSize = '12px';
            debugContainer.style.fontFamily = 'monospace';
            debugContainer.style.whiteSpace = 'pre-wrap';
            debugContainer.style.wordBreak = 'break-all';
            debugContainer.style.maxHeight = '150px';
            debugContainer.style.overflowY = 'auto';
            debugContainer.style.display = 'none'; // Hidden by default
            document.querySelector('.form-group').appendChild(debugContainer);
        }
        
        // Function to log debug info
        function logDebug(message) {
            console.log(message);
            debugContainer.textContent += message + '\n';
            debugContainer.style.display = 'block'; // Show when there's content
        }
        
        // Clear previous debug info
        debugContainer.textContent = '';
        
        if (!token) {
            validationResult.textContent = 'Please enter a token first';
            validationResult.style.color = '#ff0000';
            return;
        }
        
        // Log token length and format
        logDebug(`Token length: ${token.length}`);
        logDebug(`Token format check: ${token.includes('.') ? 'Has dots' : 'No dots'}`);
        
        // Log token parts to help diagnose truncation
        const tokenParts = token.split('.');
        if (tokenParts.length === 3) {
            logDebug(`Token structure: 3 parts [${tokenParts[0].length}chars].[${tokenParts[1].length}chars].[${tokenParts[2].length}chars]`);
            
            // Check if third part seems truncated
            if (tokenParts[2].length < 27) {
                logDebug(`WARNING: Third token part seems truncated! (${tokenParts[2].length} chars)`);
            }
            
            // Mask and log token parts safely
            const maskedToken = `${tokenParts[0].substring(0, 4)}...${tokenParts[0].substring(tokenParts[0].length-4)}.` +
                              `${tokenParts[1].substring(0, 2)}...${tokenParts[1].substring(tokenParts[1].length-2)}.` +
                              `${tokenParts[2].substring(0, 4)}...${tokenParts[2].substring(Math.min(tokenParts[2].length-4, tokenParts[2].length))}`;
            logDebug(`Token sample: ${maskedToken}`);
        } else {
            logDebug(`Token doesn't have 3 parts (found ${tokenParts.length} parts)`);
        }
        
        // Show loading state
        validationResult.textContent = 'Validating...';
        validationResult.style.color = '#5865F2';
        
        // Handle special format {userId:token}
        const keyValueMatch = token.match(/^\{(\d+):([^}]+)\}$/);
        if (keyValueMatch && keyValueMatch[2]) {
            const userId = keyValueMatch[1];
            token = keyValueMatch[2]; // Extract just the token part
            logDebug(`Extracted token from key-value format. User ID: ${userId}`);
            logDebug(`New token length: ${token.length}`);
            
            // Update the input field with the cleaned token
            document.getElementById('discord-token').value = token;
        }
        
        // Check token format with updated pattern for longer tokens
        const tokenFormatValid = /(mfa\.[a-zA-Z0-9_-]{84}|[a-zA-Z0-9_-]{24}\.[a-zA-Z0-9_-]{6}\.[a-zA-Z0-9_-]{27,40})/.test(token);
        logDebug(`Token format valid: ${tokenFormatValid}`);
        
        // Additional check for completeness
        const tokenComplete = isTokenComplete(token);
        logDebug(`Token appears complete: ${tokenComplete}`);
        if (!tokenComplete) {
            logDebug("WARNING: Token may be truncated or incomplete!");
            
            const parts = token.split('.');
            if (parts.length === 3 && parts[2].length < 27) {
                logDebug(`Third part length (${parts[2].length}) is shorter than expected (27+ chars)`);
            }
        }
        
        // Format the token correctly if needed
        if (!token.startsWith('Bot ') && !token.startsWith('Bearer ')) {
            // For user tokens, we need to ensure they are properly formatted
            // Discord's API expects user tokens without a prefix
            token = token.trim();
            logDebug('Token trimmed');
        }
        
        // Call Discord API to validate the token
        logDebug(`Making API request to validate token...`);
        
        fetch('https://discord.com/api/v9/users/@me', {
            method: 'GET',
            headers: {
                'Authorization': token
            }
        })
        .then(response => {
            logDebug(`API response status: ${response.status}`);
            
            if (response.ok) {
                return response.json().then(data => {
                    logDebug(`User data received: ${data.username} (${data.id})`);
                    
                    // Even if validation succeeds, check if token appears complete
                    if (!isTokenComplete(token)) {
                        validationResult.textContent = `Valid (${data.username}) - Warning: Token appears truncated`;
                        validationResult.style.color = '#e67e22'; // Orange warning color
                    } else {
                        validationResult.textContent = `Valid (${data.username})`;
                        validationResult.style.color = '#43b581';
                    }
                });
            } else {
                return response.text().then(text => {
                    logDebug(`Error response: ${text}`);
                    validationResult.textContent = `Invalid token (${response.status})`;
                    validationResult.style.color = '#ff0000';
                });
            }
        })
        .catch(error => {
            logDebug(`Error: ${error.message}`);
            console.error('Error validating token:', error);
            validationResult.textContent = 'Error validating';
            validationResult.style.color = '#ff0000';
        });
    });
    
    // Refresh current status
    document.getElementById('refresh-status').addEventListener('click', () => {
        const token = document.getElementById('discord-token').value;
        if (token) {
            fetchCurrentStatus(token);
        } else {
            alert('Please enter a Discord token first');
        }
    });
    
    // Update status
    document.getElementById('update-status').addEventListener('click', () => {
        const token = document.getElementById('discord-token').value;
        const newStatus = document.getElementById('edit-status').value;
        
        if (!token) {
            alert('Please enter a Discord token first');
            return;
        }
        
        if (!newStatus.trim()) {
            alert('Please enter a status message');
            return;
        }
        
        updateDiscordStatus(token, newStatus);
    });
    
    // Add Enter key support for updating status
    document.getElementById('edit-status').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            const token = document.getElementById('discord-token').value;
            const newStatus = document.getElementById('edit-status').value;
            
            if (token && newStatus.trim()) {
                updateDiscordStatus(token, newStatus);
            }
        }
    });
    
    // Helper function to execute token fetching
    function executeTokenFetch(tabId, closeTabAfter = false) {
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            function: fetchDiscordToken
        }, (results) => {
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError.message);
                alert(`Error: ${chrome.runtime.lastError.message}`);
                return;
            }
            
            if (results && results[0] && results[0].result) {
                let token = results[0].result;
                
                // Add token structure check for debugging
                if (token.includes('.') && token.split('.').length === 3) {
                    const parts = token.split('.');
                    console.log(`[Token Debug] Found token with structure: ${parts[0].length}chars.${parts[1].length}chars.${parts[2].length}chars`);
                    if (parts[2].length < 27) {
                        console.log('[Token Debug] Warning: Third part of token appears truncated');
                    }
                }
                
                // Check if this is a debug log (long string with newlines)
                if (token.includes('\n') && token.length > 100) {
                    console.log("Received debug logs instead of token:", token);
                    
                    // Create or get debug container
                    const debugContainer = document.getElementById('debug-info') || document.createElement('div');
                    if (!document.getElementById('debug-info')) {
                        debugContainer.id = 'debug-info';
                        debugContainer.style.marginTop = '10px';
                        debugContainer.style.padding = '8px';
                        debugContainer.style.backgroundColor = '#f8f9fa';
                        debugContainer.style.borderRadius = '4px';
                        debugContainer.style.fontSize = '12px';
                        debugContainer.style.fontFamily = 'monospace';
                        debugContainer.style.whiteSpace = 'pre-wrap';
                        debugContainer.style.wordBreak = 'break-all';
                        debugContainer.style.maxHeight = '150px';
                        debugContainer.style.overflowY = 'auto';
                        document.querySelector('.form-group').appendChild(debugContainer);
                    }
                    
                    // Display debug logs
                    debugContainer.textContent = token;
                    debugContainer.style.display = 'block';
                    
                    if (closeTabAfter) {
                        chrome.tabs.remove(tabId);
                    }
                    
                    alert('Failed to retrieve Discord token. Debug information has been displayed below the token field.');
                    return;
                }
                
                // Handle special format {userId:token}
                // const keyValueMatch = token.match(/^\{(\d+):([^}]+)\}$/);
                // if (keyValueMatch && keyValueMatch[2]) {
                //     token = keyValueMatch[2]; // Extract just the token part
                //     console.log("Extracted token from key-value format");
                //     console.log(keyValueMatch)
                // }
                
                // Ensure we have the complete token by using the parts
                if (token.includes('.') && token.split('.').length === 3) {
                    const parts = token.split('.');
                    // Check that we have enough characters in each part
                    if (parts[0].length >= 24 && parts[1].length >= 6 && parts[2].length < 27) {
                        console.log('[Token Debug] Asking user to manually validate token');
                    }
                }
                
                document.getElementById('discord-token').value = token;
                if (closeTabAfter) {
                    chrome.tabs.remove(tabId);
                }
                alert('Discord token successfully retrieved!');
                // Fetch current status with the new token
                fetchCurrentStatus(token);
            } else {
                alert('Failed to retrieve Discord token. Please make sure you\'re logged into Discord and try again.');
            }
        });
    }
    
    // Function to fetch current Discord status
    function fetchCurrentStatus(token) {
        const statusContainer = document.getElementById('current-status');
        
        // Show loading state
        statusContainer.textContent = 'Loading...';
        statusContainer.style.backgroundColor = '#f0f0f0';
        
        // Handle special format {userId:token}
        const keyValueMatch = token.match(/^\{(\d+):([^}]+)\}$/);
        if (keyValueMatch && keyValueMatch[2]) {
            token = keyValueMatch[2]; // Extract just the token part
            console.log("Extracted token from key-value format for status fetch");
        }
        
        // Call Discord API to get user settings
        fetch('https://discord.com/api/v9/users/@me/settings', {
            method: 'GET',
            headers: {
                'Authorization': token
            }
        })
        .then(response => {
            if (response.ok) {
                return response.json().then(data => {
                    if (data.custom_status && data.custom_status.text) {
                        statusContainer.textContent = data.custom_status.text;
                        statusContainer.style.backgroundColor = '#e3f2fd';
                        
                        // Pre-fill the edit field with current status
                        document.getElementById('edit-status').value = data.custom_status.text;
                    } else {
                        statusContainer.textContent = 'No custom status set';
                        statusContainer.style.backgroundColor = '#f5f5f5';
                        document.getElementById('edit-status').value = '';
                    }
                });
            } else {
                statusContainer.textContent = 'Failed to fetch status';
                statusContainer.style.backgroundColor = '#ffebee';
            }
        })
        .catch(error => {
            console.error('Error fetching Discord status:', error);
            statusContainer.textContent = 'Error fetching status';
            statusContainer.style.backgroundColor = '#ffebee';
        });
    }
    
    // Function to update Discord status
    function updateDiscordStatus(token, statusText) {
        const statusContainer = document.getElementById('current-status');
        const updateButton = document.getElementById('update-status');
        
        // Show loading state
        updateButton.disabled = true;
        updateButton.textContent = 'Updating...';
        
        // Handle special format {userId:token}
        const keyValueMatch = token.match(/^\{(\d+):([^}]+)\}$/);
        if (keyValueMatch && keyValueMatch[2]) {
            token = keyValueMatch[2]; // Extract just the token part
            console.log("Extracted token from key-value format for status update");
        }
        
        // Two approaches to update status:
        // 1. Direct API call from popup
        // 2. Send message to background script to handle update and notification
        
        // First approach: direct API call
        fetch('https://discord.com/api/v9/users/@me/settings', {
            method: 'PATCH',
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                custom_status: {
                    text: statusText
                }
            })
        })
        .then(response => {
            if (response.ok) {
                // Update was successful
                statusContainer.textContent = statusText;
                statusContainer.style.backgroundColor = '#e3f2fd';
                updateButton.textContent = 'Updated!';
                
                // Also notify background script to trigger notification
                chrome.runtime.sendMessage({ 
                    action: 'updateStatus', 
                    status: statusText 
                });
                
                setTimeout(() => {
                    updateButton.textContent = 'Update';
                    updateButton.disabled = false;
                }, 2000);
            } else {
                // Update failed
                updateButton.textContent = 'Failed';
                setTimeout(() => {
                    updateButton.textContent = 'Update';
                    updateButton.disabled = false;
                }, 2000);
                console.error('Failed to update Discord status:', response.status);
            }
        })
        .catch(error => {
            updateButton.textContent = 'Error';
            setTimeout(() => {
                updateButton.textContent = 'Update';
                updateButton.disabled = false;
            }, 2000);
            console.error('Error updating Discord status:', error);
        });
    }
});

// Helper function to validate a regex pattern
function validateRegexPattern(pattern) {
    // Check if it looks like a regex pattern (starts and ends with /)
    if (pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
        try {
            const lastSlashIndex = pattern.lastIndexOf('/');
            const patternBody = pattern.substring(1, lastSlashIndex);
            const flags = pattern.substring(lastSlashIndex + 1);
            
            // Test if it's a valid regex
            new RegExp(patternBody, flags);
            return { valid: true };
        } catch (error) {
            return { 
                valid: false, 
                error: error.message 
            };
        }
    }
    
    // Not a regex pattern, so it's valid
    return { valid: true };
}

// Create a UI element for a status mapping
function createMappingElement(mapping) {
    const container = document.createElement('div');
    container.className = 'status-mapping';

    container.innerHTML = `
    <div style="display: flex; margin-bottom: 5px;">
      <input type="text" class="url-pattern" placeholder="URL Pattern (e.g., youtube.com or /regex/i)" value="${mapping.urlPattern}" style="flex: 1; margin-right: 5px;">
      <input type="text" class="status-text" placeholder="Status Text" value="${mapping.status}" style="flex: 1;">
    </div>
    <div class="pattern-validation" style="margin-bottom: 5px; font-size: 12px; color: #f04747; display: none;"></div>
    <button class="remove-mapping" style="background-color: #f04747;">Remove</button>
  `;

    // Add validation for regex patterns
    const patternInput = container.querySelector('.url-pattern');
    const validationMessage = container.querySelector('.pattern-validation');
    
    patternInput.addEventListener('blur', () => {
        const pattern = patternInput.value;
        const result = validateRegexPattern(pattern);
        
        if (!result.valid) {
            validationMessage.textContent = `Invalid regex: ${result.error}`;
            validationMessage.style.display = 'block';
            patternInput.style.borderColor = '#f04747';
        } else {
            validationMessage.style.display = 'none';
            patternInput.style.borderColor = '';
            
            // If it's a valid regex, add a subtle indicator
            if (pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
                patternInput.style.borderColor = '#43b581';
            }
        }
    });

    container.querySelector('.remove-mapping').addEventListener('click', () => {
        container.remove();
    });

    return container;
}

// Render all status mappings
function renderStatusMappings(mappings) {
    const container = document.getElementById('status-mappings-container');
    container.innerHTML = '';

    mappings.forEach(mapping => {
        container.appendChild(createMappingElement(mapping));
    });
}

// Helper function to check if a token appears complete
function isTokenComplete(token) {
    if (!token || typeof token !== 'string' || !token.includes('.')) {
        return false;
    }
    
    const parts = token.split('.');
    if (parts.length !== 3) {
        return false;
    }
    
    // Discord tokens typically have these part lengths
    const firstPartLength = parts[0].length;
    const secondPartLength = parts[1].length;
    const thirdPartLength = parts[2].length;
    
    // Check if the token has expected structure
    return (
        firstPartLength >= 24 && // First part is usually 24+ chars
        secondPartLength >= 6 &&  // Second part is usually 6+ chars
        thirdPartLength >= 27     // Third part is usually 27+ chars
    );
}

// Function to add log entry to the status logs container
function addLogEntry(logData) {
    const logsContainer = document.getElementById('status-logs');
    
    // Clear the "No logs yet" message if it's the only entry
    if (logsContainer.children.length === 1 && 
        logsContainer.children[0].textContent === 'No status updates logged yet') {
        logsContainer.innerHTML = '';
    }
    
    // Create the log entry element
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    
    // Set log entry style based on type
    let typeColor = '#888'; // Default gray
    switch(logData.type) {
        case 'success':
            typeColor = '#43b581'; // Green
            break;
        case 'error':
            typeColor = '#f04747'; // Red
            break;
        case 'warning':
            typeColor = '#faa61a'; // Orange
            break;
        case 'info':
            typeColor = '#7289da'; // Discord blue
            break;
    }
    
    // Format with timestamp
    const timestamp = logData.timestamp || new Date().toLocaleTimeString();
    logEntry.innerHTML = `<span style="color: #666;">[${timestamp}]</span> <span style="color: ${typeColor};">${logData.message}</span>`;
    
    // Add to container (at the top)
    logsContainer.insertBefore(logEntry, logsContainer.firstChild);
    
    // Limit log entries to 50
    while (logsContainer.children.length > 50) {
        logsContainer.removeChild(logsContainer.lastChild);
    }
    
    // Store log in persistent storage (limited to last 50 entries)
    chrome.storage.sync.get(['statusLogs'], (result) => {
        const logs = result.statusLogs || [];
        
        // Add the new log at the beginning
        logs.unshift({
            type: logData.type,
            message: logData.message,
            timestamp: timestamp
        });
        
        // Keep only the last 50 logs
        if (logs.length > 50) {
            logs.length = 50;
        }
        
        // Save back to storage
        chrome.storage.sync.set({ statusLogs: logs });
    });
}

// Listen for status update logs from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'statusUpdateLog') {
        addLogEntry(message);
    }
    return true;
});

// Add clear logs button handler
document.addEventListener('DOMContentLoaded', () => {
    // Clear logs button
    document.getElementById('clear-logs').addEventListener('click', () => {
        const logsContainer = document.getElementById('status-logs');
        logsContainer.innerHTML = '<div class="log-entry" style="color: #888;">No status updates logged yet</div>';
        
        // Clear logs in storage
        chrome.storage.sync.set({ statusLogs: [] }, () => {
            console.log('[Discord Status] Logs cleared');
        });
    });
    
    // Regex test functionality
    document.getElementById('test-regex').addEventListener('click', () => {
        const patternInput = document.getElementById('test-pattern');
        const urlInput = document.getElementById('test-url');
        const resultDiv = document.getElementById('test-result');
        
        const pattern = patternInput.value.trim();
        const url = urlInput.value.trim();
        
        if (!pattern || !url) {
            resultDiv.textContent = 'Please enter both a pattern and a URL to test';
            resultDiv.style.display = 'block';
            resultDiv.style.backgroundColor = '#f8f9fa';
            resultDiv.style.color = '#333';
            return;
        }
        
        let isMatch = false;
        let isRegex = false;
        let error = null;
        
        // Check if it's a regex pattern
        if (pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
            isRegex = true;
            try {
                const lastSlashIndex = pattern.lastIndexOf('/');
                const patternBody = pattern.substring(1, lastSlashIndex);
                const flags = pattern.substring(lastSlashIndex + 1);
                
                const regex = new RegExp(patternBody, flags);
                isMatch = regex.test(url);
            } catch (e) {
                error = e.message;
            }
        } else {
            // Simple substring match
            isMatch = url.includes(pattern);
        }
        
        // Display result
        if (error) {
            resultDiv.textContent = `Error in regex pattern: ${error}`;
            resultDiv.style.backgroundColor = '#f04747';
            resultDiv.style.color = 'white';
        } else {
            if (isMatch) {
                resultDiv.textContent = `${isRegex ? 'Regex' : 'Pattern'} matches URL! ${isRegex ? 'Regex would apply.' : 'Standard match would apply.'}`;
                resultDiv.style.backgroundColor = '#43b581';
                resultDiv.style.color = 'white';
            } else {
                resultDiv.textContent = `${isRegex ? 'Regex' : 'Pattern'} does NOT match URL.`;
                resultDiv.style.backgroundColor = '#ff7f50';
                resultDiv.style.color = 'white';
            }
        }
        
        resultDiv.style.display = 'block';
    });
});

// Function to extract Discord token from local storage
function fetchDiscordToken() {
    // Array to collect debug messages
    const debugLogs = [];
    
    function logDebug(message) {
        console.log(`[Token Fetch] ${message}`);
        debugLogs.push(message);
    }
    
    try {
        logDebug("Starting token fetch process");
        
        // Discord tokens follow a specific format
        // This matches user tokens which are needed for this extension
        // Also handles potential key-value format {userId:token}
        // Updated pattern to capture longer tokens properly
        const tokenRegex = /(mfa\.[a-zA-Z0-9_-]{84}|[a-zA-Z0-9_-]{24}\.[a-zA-Z0-9_-]{6}\.[a-zA-Z0-9_-]{27,40})/;

        // Modern Discord web app storage - check this first
        const webpackChunks = window.webpackChunkdiscord_app;
        if (webpackChunks) {
            logDebug("Found webpack chunks, trying webpack method");
            try {
                // Get modules from webpack
                const modules = {};
                webpackChunks.push([
                    [Math.random()], 
                    {}, 
                    req => {
                        for (const m of Object.values(req.c)) {
                            if (m?.exports?.default?.getToken) {
                                modules.token = m.exports.default.getToken();
                                logDebug("Found token via webpack getToken()");
                            }
                        }
                    }
                ]);
                webpackChunks.pop();
                
                if (modules.token) {
                    logDebug(`Webpack token found (length: ${modules.token.length})`);
                    
                    const match = modules.token.match(tokenRegex);
                    if (match && match[1]) {
                        logDebug("Token matches expected format, returning");
                        return match[1];
                    } else {
                        logDebug("Token doesn't match expected format");
                    }
                } else {
                    logDebug("No token found in webpack modules");
                }
            } catch (e) {
                logDebug(`Webpack method failed: ${e.message}`);
                // Continue to other methods
            }
        } else {
            logDebug("No webpack chunks found, skipping webpack method");
        }

        // First check for token in localStorage directly
        logDebug("Checking localStorage for 'token' key");
        const token = localStorage.getItem('token');
        if (token) {
            logDebug(`Found direct token in localStorage (length: ${token.length})`);
            const match = token.match(tokenRegex);
            if (match && match[1]) {
                logDebug("Direct token matches format, returning");
                return match[1];
            }
            
            // Try to parse it if it's JSON
            try {
                logDebug("Trying to parse as JSON");
                const parsed = JSON.parse(token);
                if (parsed && parsed.token) {
                    logDebug("Found token property in parsed JSON");
                    const tokenMatch = parsed.token.match(tokenRegex);
                    if (tokenMatch && tokenMatch[1]) {
                        logDebug("Token from JSON matches format, returning");
                        return tokenMatch[1];
                    }
                }
            } catch(e) {
                logDebug("Not valid JSON, continuing to other methods");
                // Not JSON, continue
            }
        } else {
            logDebug("No 'token' key found in localStorage");
        }
        
        // Check all localStorage items
        logDebug(`Scanning all localStorage keys (${localStorage.length} items)`);
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const value = localStorage.getItem(key);
            
            // Skip empty values
            if (!value || typeof value !== 'string') continue;
            
            logDebug(`Checking localStorage key: ${key} (value length: ${value.length})`);
            
            // Check for key-value pair format first {userId:token}
            const keyValueMatch = value.match(/\{(\d+):([^}]+)\}/);
            if (keyValueMatch && keyValueMatch[2]) {
                const userId = keyValueMatch[1];
                const possibleToken = keyValueMatch[2];
                logDebug(`Found key-value pair format. User ID: ${userId}, token length: ${possibleToken.length}`);
                
                if (possibleToken.match(tokenRegex)) {
                    logDebug("Token from key-value pair matches format, returning");
                    return possibleToken;
                } else {
                    logDebug("Token from key-value pair doesn't match expected format");
                }
            }
            
            // Direct match for token format in value
            const directMatch = value.match(tokenRegex);
            if (directMatch && directMatch[1]) {
                logDebug(`Found direct token match in key: ${key}`);
                return directMatch[1];
            }
            
            // Check for Discord's localStorage structure
            if (key && (key.includes('token') || key.includes('Token'))) {
                logDebug(`Found key with 'token' in name: ${key}`);
                // Try to parse as JSON
                try {
                    const parsed = JSON.parse(value);
                    if (parsed && parsed.token) {
                        logDebug("Found token property in parsed JSON");
                        const tokenMatch = String(parsed.token).match(tokenRegex);
                        if (tokenMatch && tokenMatch[1]) {
                            logDebug("Token from JSON property matches format, returning");
                            return tokenMatch[1];
                        }
                    }
                } catch (e) {
                    // Not valid JSON, check the raw value
                    logDebug("Not valid JSON, checking raw value");
                    if (value.length > 40) {
                        const tokenMatch = value.match(tokenRegex);
                        if (tokenMatch && tokenMatch[1]) {
                            logDebug("Raw value matches token format, returning");
                            return tokenMatch[1];
                        }
                    }
                }
            }
        }
        
        // Check for token in Discord's web context
        logDebug("Checking Discord context object");
        if (window.__DISCORD_CONTEXT__ && window.__DISCORD_CONTEXT__.token) {
            logDebug("Found token in __DISCORD_CONTEXT__");
            const contextToken = window.__DISCORD_CONTEXT__.token;
            const match = contextToken.match(tokenRegex);
            if (match && match[1]) {
                logDebug("Context token matches format, returning");
                return match[1];
            } else {
                logDebug("Context token doesn't match expected format");
            }
        } else {
            logDebug("No Discord context object found");
        }
        
        // Note: We can't directly use IndexedDB in this function because it's asynchronous
        // Instead, we log the token if found for debugging
        try {
            logDebug("Checking for user ID based token");
            // Look for the newer Discord token location in localStorage (keyed by user ID)
            const localStorageKeys = Object.keys(localStorage);
            const userIdKey = localStorageKeys.find(key => key.match(/^user_id_cache/));
            if (userIdKey) {
                logDebug(`Found user ID cache key: ${userIdKey}`);
                try {
                    const userId = localStorage.getItem(userIdKey);
                    if (userId) {
                        logDebug(`Found user ID: ${userId}`);
                        const tokenKey = `token_${userId}`;
                        const tokenValue = localStorage.getItem(tokenKey);
                        if (tokenValue) {
                            logDebug(`Found token for user ID (length: ${tokenValue.length})`);
                            const match = tokenValue.match(tokenRegex);
                            if (match && match[1]) {
                                logDebug("User ID token matches format, returning");
                                return match[1];
                            } else {
                                logDebug("User ID token doesn't match expected format");
                            }
                        } else {
                            logDebug(`No token found for key: ${tokenKey}`);
                        }
                    }
                } catch (e) {
                    logDebug(`User ID method failed: ${e.message}`);
                }
            } else {
                logDebug("No user ID cache key found");
            }
        } catch (e) {
            logDebug(`Additional token lookup methods failed: ${e.message}`);
        }
        
        // Check document.cookie
        logDebug("Checking cookies");
        const cookies = document.cookie.split(';');
        if (cookies.length > 0) {
            logDebug(`Found ${cookies.length} cookies`);
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i];
                const parts = cookie.trim().split('=');
                if (parts.length >= 2) {
                    const key = parts[0];
                    const value = parts[1];
                    logDebug(`Checking cookie: ${key} (value length: ${value.length})`);
                    if (value && value.length > 40) {
                        const match = value.match(tokenRegex);
                        if (match && match[1]) {
                            logDebug(`Found token in cookie: ${key}`);
                            return match[1];
                        }
                    }
                }
            }
            logDebug("No token found in cookies");
        } else {
            logDebug("No cookies found");
        }
        
        // Could not find token
        logDebug("All methods exhausted, unable to find Discord token");
        return debugLogs.join('\n'); // Return debug logs for display
    } catch (error) {
        const errorMsg = `Error fetching Discord token: ${error.message}`;
        console.error(errorMsg);
        debugLogs.push(errorMsg);
        return debugLogs.join('\n'); // Return debug logs for display
    }
}