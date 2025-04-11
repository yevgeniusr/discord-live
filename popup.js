document.addEventListener('DOMContentLoaded', () => {
    // Set up collapsible sections
    setupCollapsibleSections();
    
    // Add toggle debug button handler
    document.getElementById('toggle-debug').addEventListener('click', () => {
        const debugInfo = document.getElementById('debug-info');
        const toggleButton = document.getElementById('toggle-debug');
        
        if (debugInfo.style.display === 'none') {
            debugInfo.style.display = 'block';
            toggleButton.textContent = 'Hide Debug';
        } else {
            debugInfo.style.display = 'none';
            toggleButton.textContent = 'Debug';
        }
    });

    // Toggle password visibility for token field
    const tokenField = document.getElementById('discord-token');
    tokenField.addEventListener('dblclick', () => {
        tokenField.type = tokenField.type === 'password' ? 'text' : 'password';
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

        // Add loading animation
        const saveButton = document.getElementById('save-settings');
        saveButton.disabled = true;
        saveButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

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
            
            saveButton.disabled = false;
            saveButton.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Settings';
            
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
            
            saveButton.disabled = false;
            saveButton.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Settings';
            
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
        
        // Ensure the section is expanded
        const parentCollapsible = document.querySelector('.card .collapsible');
        if (parentCollapsible && !parentCollapsible.classList.contains('expanded')) {
            parentCollapsible.classList.add('expanded');
        }
        
        // Focus the new url pattern input
        setTimeout(() => {
            newMapping.querySelector('.url-pattern').focus();
        }, 100);
        
        // Animate the new mapping
        newMapping.classList.add('fade-in');
    });
    
    // Define individual template mappings
    const templateMappings = {
        empty: [],
        youtube: [
            { urlPattern: "youtube.com", status: "Watching YouTube" }
        ],
        github: [
            { urlPattern: "github.com", status: "Working on code" }
        ],
        netflix: [
            { urlPattern: "netflix.com", status: "Watching Netflix" }
        ],
        twitter: [
            { urlPattern: "twitter.com", status: "Checking Twitter" }
        ],
        ai: [
            { urlPattern: "/prompt|ai|gpt|llm/i", status: "Learning AI and ML" }
        ],
        docs: [
            { urlPattern: "docs.google.com", status: "Working on documents" }
        ],
        productivity: [
            { urlPattern: "docs.google.com", status: "Working on documents" },
            { urlPattern: "github.com", status: "Working on code" },
            { urlPattern: "notion.so", status: "Taking notes" },
            { urlPattern: "trello.com", status: "Managing tasks" },
            { urlPattern: "slack.com", status: "Team communication" }
        ],
        learning: [
            { urlPattern: "/udemy|coursera|edx|pluralsight/i", status: "Taking an online course" },
            { urlPattern: "stackoverflow.com", status: "Solving coding problems" },
            { urlPattern: "wikipedia.org", status: "Researching" },
            { urlPattern: "/medium|dev.to|hashnode/i", status: "Reading tech articles" },
            { urlPattern: "youtube.com/.*tutorial", status: "Learning from tutorials" }
        ]
    };
    
    // Handle template selections
    document.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', () => {
            const templateName = item.getAttribute('data-template');
            const mappings = templateMappings[templateName];
            
            if (mappings) {
                const mappingsContainer = document.getElementById('status-mappings-container');
                
                // For the empty template, don't add anything
                if (templateName === 'empty') {
                    const newMapping = createMappingElement({ urlPattern: '', status: '' });
                    mappingsContainer.appendChild(newMapping);
                    newMapping.classList.add('fade-in');
                    newMapping.querySelector('.url-pattern').focus();
                    return;
                }
                
                // Add each mapping
                mappings.forEach(mapping => {
                    const newMapping = createMappingElement(mapping);
                    mappingsContainer.appendChild(newMapping);
                    newMapping.classList.add('fade-in');
                });
                
                // Ensure the section is expanded
                const parentCollapsible = document.querySelector('.card .collapsible');
                if (parentCollapsible && !parentCollapsible.classList.contains('expanded')) {
                    parentCollapsible.classList.add('expanded');
                }
                
                // Scroll to the new mappings
                setTimeout(() => {
                    const scrollHeight = mappingsContainer.scrollHeight;
                    mappingsContainer.scrollTop = scrollHeight;
                }, 100);
                
                // Show success message
                const saveStatus = document.getElementById('save-status');
                saveStatus.textContent = `Added ${mappings.length} mapping${mappings.length > 1 ? 's' : ''}!`;
                saveStatus.style.display = 'inline-block';
                saveStatus.style.backgroundColor = '#43b581';
                saveStatus.style.color = 'white';
                
                // Hide the message after 3 seconds
                setTimeout(() => {
                    saveStatus.style.display = 'none';
                }, 3000);
            }
        });
    });
    
    // Fetch Discord token
    document.getElementById('fetch-token').addEventListener('click', () => {
        const fetchButton = document.getElementById('fetch-token');
        fetchButton.disabled = true;
        fetchButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Fetching...';
        
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
        const validateButton = document.getElementById('validate-token');
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
        
        // Disable the button and show loading state
        validateButton.disabled = true;
        validateButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Validating...';
        
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
            
            validateButton.disabled = false;
            validateButton.innerHTML = '<i class="fa-solid fa-check-circle"></i> Validate';
            
            if (response.ok) {
                return response.json().then(data => {
                    logDebug(`User data received: ${data.username} (${data.id})`);
                    
                    // Even if validation succeeds, check if token appears complete
                    if (!isTokenComplete(token)) {
                        validationResult.innerHTML = `<span class="badge badge-warning">Valid (${data.username}) - Token may be truncated</span>`;
                    } else {
                        validationResult.innerHTML = `<span class="badge badge-success">Valid (${data.username})</span>`;
                    }
                });
            } else {
                return response.text().then(text => {
                    logDebug(`Error response: ${text}`);
                    validationResult.innerHTML = `<span class="badge badge-error">Invalid token (${response.status})</span>`;
                });
            }
        })
        .catch(error => {
            logDebug(`Error: ${error.message}`);
            console.error('Error validating token:', error);
            validationResult.innerHTML = `<span class="badge badge-error">Error validating</span>`;
            
            validateButton.disabled = false;
            validateButton.innerHTML = '<i class="fa-solid fa-check-circle"></i> Validate';
        });
    });
    
    // Refresh current status
    document.getElementById('refresh-status').addEventListener('click', () => {
        const token = document.getElementById('discord-token').value;
        const refreshButton = document.getElementById('refresh-status');
        
        if (token) {
            refreshButton.disabled = true;
            refreshButton.innerHTML = '<i class="fa-solid fa-rotate fa-spin"></i>';
            
            fetchCurrentStatus(token)
                .finally(() => {
                    setTimeout(() => {
                        refreshButton.disabled = false;
                        refreshButton.innerHTML = '<i class="fa-solid fa-rotate"></i>';
                    }, 1000);
                });
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
            const fetchButton = document.getElementById('fetch-token');
            fetchButton.disabled = false;
            fetchButton.innerHTML = '<i class="fa-solid fa-download"></i> Fetch';
            
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
                
                // Show success message
                const saveStatus = document.getElementById('save-status');
                saveStatus.textContent = 'Token retrieved successfully!';
                saveStatus.style.display = 'inline-block';
                saveStatus.style.backgroundColor = '#43b581';
                saveStatus.style.color = 'white';
                
                setTimeout(() => {
                    saveStatus.style.display = 'none';
                }, 3000);
                
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
        statusContainer.style.backgroundColor = '#40444b';
        
        // Handle special format {userId:token}
        const keyValueMatch = token.match(/^\{(\d+):([^}]+)\}$/);
        if (keyValueMatch && keyValueMatch[2]) {
            token = keyValueMatch[2]; // Extract just the token part
            console.log("Extracted token from key-value format for status fetch");
        }
        
        // Return a promise for better control flow
        return new Promise((resolve, reject) => {
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
                            statusContainer.style.backgroundColor = '#36393f';
                            
                            // Pre-fill the edit field with current status
                            document.getElementById('edit-status').value = data.custom_status.text;
                            resolve(data.custom_status.text);
                        } else {
                            statusContainer.textContent = 'No custom status set';
                            statusContainer.style.backgroundColor = '#36393f';
                            document.getElementById('edit-status').value = '';
                            resolve(null);
                        }
                    });
                } else {
                    statusContainer.textContent = 'Failed to fetch status';
                    statusContainer.style.backgroundColor = '#f04747';
                    reject(new Error(`Failed to fetch status: ${response.status}`));
                }
            })
            .catch(error => {
                console.error('Error fetching Discord status:', error);
                statusContainer.textContent = 'Error fetching status';
                statusContainer.style.backgroundColor = '#f04747';
                reject(error);
            });
        });
    }
    
    // Function to update Discord status
    function updateDiscordStatus(token, statusText) {
        const statusContainer = document.getElementById('current-status');
        const updateButton = document.getElementById('update-status');
        
        // Show loading state
        updateButton.disabled = true;
        updateButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...';
        
        // Handle special format {userId:token}
        const keyValueMatch = token.match(/^\{(\d+):([^}]+)\}$/);
        if (keyValueMatch && keyValueMatch[2]) {
            token = keyValueMatch[2]; // Extract just the token part
            console.log("Extracted token from key-value format for status update");
        }
        
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
                statusContainer.style.backgroundColor = '#36393f';
                updateButton.innerHTML = '<i class="fa-solid fa-check"></i> Updated!';
                
                // Also notify background script to trigger notification
                chrome.runtime.sendMessage({ 
                    action: 'updateStatus', 
                    status: statusText 
                });
                
                setTimeout(() => {
                    updateButton.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Update';
                    updateButton.disabled = false;
                }, 2000);
            } else {
                // Update failed
                updateButton.innerHTML = '<i class="fa-solid fa-exclamation-triangle"></i> Failed';
                setTimeout(() => {
                    updateButton.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Update';
                    updateButton.disabled = false;
                }, 2000);
                console.error('Failed to update Discord status:', response.status);
            }
        })
        .catch(error => {
            updateButton.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Error';
            setTimeout(() => {
                updateButton.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Update';
                updateButton.disabled = false;
            }, 2000);
            console.error('Error updating Discord status:', error);
        });
    }
    
    // Setup collapsible sections
    function setupCollapsibleSections() {
        document.querySelectorAll('.collapsible').forEach(collapsible => {
            // Initially expand status mappings and collapse logs
            if (collapsible.querySelector('.card-header').textContent.includes('Status Mappings')) {
                collapsible.classList.add('expanded');
            }
            
            collapsible.querySelector('.card-header').addEventListener('click', () => {
                collapsible.classList.toggle('expanded');
            });
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
    <div style="display: flex; margin-bottom: 8px;">
      <input type="text" class="url-pattern" placeholder="URL Pattern (e.g., youtube.com or /regex/i)" value="${mapping.urlPattern}" style="flex: 1; margin-right: 8px;">
      <input type="text" class="status-text" placeholder="Status Text" value="${mapping.status}" style="flex: 1;">
    </div>
    <div class="pattern-validation" style="margin-bottom: 5px; font-size: 12px; color: #f04747; display: none;"></div>
    <button class="remove-mapping btn-danger btn-sm"><i class="fa-solid fa-trash-can"></i> Remove</button>
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

    container.querySelector('.remove-mapping').addEventListener('click', (e) => {
        // Add fade-out animation before removing
        container.style.opacity = '0';
        container.style.transform = 'translateX(10px)';
        container.style.transition = 'opacity 0.3s, transform 0.3s';
        
        setTimeout(() => {
            container.remove();
        }, 300);
        
        e.stopPropagation();
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
    logEntry.innerHTML = `<span style="color: #72767d;">[${timestamp}]</span> <span style="color: ${typeColor};">${logData.message}</span>`;
    
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
    
    // Ensure the logs section is expanded when there's new activity
    const logsCollapsible = document.querySelector('.card .collapsible:last-child');
    if (logsCollapsible && !logsCollapsible.classList.contains('expanded')) {
        logsCollapsible.classList.add('expanded');
    }
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
        logsContainer.innerHTML = '<div class="log-entry" style="color: #72767d;">No status updates logged yet</div>';
        
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
            resultDiv.style.backgroundColor = '#40444b';
            resultDiv.style.color = '#dcddde';
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
                resultDiv.style.backgroundColor = '#f04747';
                resultDiv.style.color = 'white';
            }
        }
        
        resultDiv.style.display = 'block';
    });
    
    // Load meme generator settings
    chrome.storage.sync.get([
        'memeEnabled',
        'openaiKey',
        'memeFrequency',
        'autoDownload',
        'memeFolder',
        'lastMemeInfo'
    ], (result) => {
        // Set meme generator settings
        document.getElementById('meme-enabled').checked = result.memeEnabled || false;
        document.getElementById('openai-key').value = result.openaiKey || '';
        
        // Set auto-download option (default to true if not set)
        document.getElementById('auto-download').checked = result.autoDownload !== false;
        
        // Set meme folder (default to "memes")
        document.getElementById('meme-folder').value = result.memeFolder || "memes";
        
        // Set meme frequency if available
        const memeFrequencySelect = document.getElementById('meme-frequency');
        if (result.memeFrequency) {
            memeFrequencySelect.value = result.memeFrequency.toString();
        }
        
        // Display last meme if available
        if (result.lastMemeInfo) {
            displayLastMeme(result.lastMemeInfo);
        }
    });
    
    // Handle meme generator toggle
    document.getElementById('meme-enabled').addEventListener('change', (e) => {
        const memeEnabled = e.target.checked;
        chrome.storage.sync.set({ memeEnabled }, () => {
            console.log(`[Discord Status] Meme generator ${memeEnabled ? 'enabled' : 'disabled'}`);
            
            // Notify background script
            chrome.runtime.sendMessage({ 
                action: 'toggleMemeGenerator', 
                enabled: memeEnabled 
            });
            
            // Add log entry
            addLogEntry({
                type: memeEnabled ? 'info' : 'warning',
                message: `Meme generator ${memeEnabled ? 'enabled' : 'disabled'}`,
                timestamp: new Date().toLocaleTimeString()
            });
        });
    });
    
    // Save OpenAI API key
    document.getElementById('openai-key').addEventListener('blur', (e) => {
        const openaiKey = e.target.value.trim();
        if (openaiKey) {
            chrome.storage.sync.set({ openaiKey }, () => {
                console.log('[Discord Status] OpenAI API key saved');
            });
        }
    });
    
    // Validate OpenAI API key
    document.getElementById('validate-api-key').addEventListener('click', () => {
        const apiKey = document.getElementById('openai-key').value.trim();
        const button = document.getElementById('validate-api-key');
        
        if (!apiKey) {
            alert('Please enter an OpenAI API key');
            return;
        }
        
        // Disable button and show loading state
        button.disabled = true;
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        
        // Send validation request to background script
        chrome.runtime.sendMessage({ 
            action: 'validateOpenAIKey', 
            apiKey: apiKey 
        }, (response) => {
            button.disabled = false;
            
            if (response && response.valid) {
                button.innerHTML = '<i class="fa-solid fa-check"></i>';
                setTimeout(() => {
                    button.innerHTML = '<i class="fa-solid fa-check-circle"></i>';
                }, 2000);
                
                // Add success log
                addLogEntry({
                    type: 'success',
                    message: 'OpenAI API key validated successfully',
                    timestamp: new Date().toLocaleTimeString()
                });
            } else {
                button.innerHTML = '<i class="fa-solid fa-xmark"></i>';
                setTimeout(() => {
                    button.innerHTML = '<i class="fa-solid fa-check-circle"></i>';
                }, 2000);
                
                // Display error message
                alert(`API key validation failed: ${response ? response.error : 'Unknown error'}`);
                
                // Add error log
                addLogEntry({
                    type: 'error',
                    message: `API key validation failed: ${response ? response.error : 'Unknown error'}`,
                    timestamp: new Date().toLocaleTimeString()
                });
            }
        });
    });
    
    // Handle meme frequency change
    document.getElementById('meme-frequency').addEventListener('change', (e) => {
        const memeFrequency = parseInt(e.target.value, 10);
        chrome.storage.sync.set({ memeFrequency }, () => {
            console.log(`[Discord Status] Meme frequency set to ${memeFrequency / 60000} minutes`);
            
            // Notify background script
            chrome.runtime.sendMessage({ 
                action: 'updateMemeFrequency', 
                frequency: memeFrequency 
            });
        });
    });
    
    // Handle auto-download toggle
    document.getElementById('auto-download').addEventListener('change', (e) => {
        const autoDownload = e.target.checked;
        chrome.storage.sync.set({ autoDownload }, () => {
            console.log(`[Discord Status] Auto-download memes ${autoDownload ? 'enabled' : 'disabled'}`);
            
            // Add log entry
            addLogEntry({
                type: 'info',
                message: `Auto-download memes ${autoDownload ? 'enabled' : 'disabled'}`,
                timestamp: new Date().toLocaleTimeString()
            });
        });
    });
    
    // Handle test meme generation
    // Save meme folder when changed
    document.getElementById('meme-folder').addEventListener('blur', (e) => {
        const memeFolder = e.target.value.trim() || "memes";
        chrome.storage.sync.set({ memeFolder }, () => {
            console.log('[Discord Status] Meme folder set to:', memeFolder);
        });
    });
    
    document.getElementById('test-meme').addEventListener('click', () => {
        const button = document.getElementById('test-meme');
        const openaiKey = document.getElementById('openai-key').value.trim();
        const autoDownload = document.getElementById('auto-download').checked;
        const memeFolder = document.getElementById('meme-folder').value.trim() || "memes";
        
        if (!openaiKey) {
            alert('Please enter your OpenAI API key first');
            return;
        }
        
        // Show user what's happening
        alert('The extension will now take a screenshot of your current tab and generate a meme using OpenAI.' + 
              (autoDownload ? ' The meme will be saved to your Downloads folder.' : ' You can download the meme from the popup.'));
        
        // Disable button and show loading state
        button.disabled = true;
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...';
        
        // Save the key, folder, and auto-download setting
        chrome.storage.sync.set({ 
            openaiKey,
            autoDownload,
            memeFolder
        }, () => {
            // Set a timeout to reset the button in case the callback never executes
            const timeout = setTimeout(() => {
                button.disabled = false;
                button.innerHTML = '<i class="fa-solid fa-flask"></i> Generate Test Meme';
                
                alert('The meme generation request timed out. Please check your network connection or try again later.');
                
                addLogEntry({
                    type: 'error',
                    message: 'Meme generation timed out after 30 seconds',
                    timestamp: new Date().toLocaleTimeString()
                });
            }, 30000); // 30 second timeout
            
            // Request test meme generation
            chrome.runtime.sendMessage({ 
                action: 'generateTestMeme'
            }, (response) => {
                // Clear the timeout since we got a response
                clearTimeout(timeout);
                // Reset button state
                button.disabled = false;
                button.innerHTML = '<i class="fa-solid fa-flask"></i> Generate Test Meme';
                
                // Check if we got a valid response
                if (!response) {
                    console.error('[Discord Status] No response received from background script');
                    
                    alert('Failed to generate meme: No response from extension. Please check the console for errors and try reloading the extension.');
                    
                    addLogEntry({
                        type: 'error',
                        message: 'Meme generation failed: No response from background script',
                        timestamp: new Date().toLocaleTimeString()
                    });
                    return;
                }
                
                if (response && response.success) {
                    // Display the new meme
                    displayLastMeme(response.memeInfo);
                    
                    // Add success log
                    addLogEntry({
                        type: 'success',
                        message: 'Test meme generated successfully!' + (autoDownload ? ' Saved to Downloads folder.' : ''),
                        timestamp: new Date().toLocaleTimeString()
                    });
                    
                    // Ensure meme generator toggle is enabled
                    document.getElementById('meme-enabled').checked = true;
                    chrome.storage.sync.set({ memeEnabled: true });
                } else {
                    // Get detailed error message
                    const errorMsg = response ? response.error : 'Unknown error';
                    
                    // Display error message with more details
                    let alertMessage = `Failed to generate test meme: ${errorMsg}`;
                    
                    // Add troubleshooting tips based on error message
                    if (errorMsg.includes('API key')) {
                        alertMessage += '\n\nTroubleshooting tips:\n- Check that your OpenAI API key is correct\n- Make sure your OpenAI account has access to GPT-4 Vision\n- Verify your API key has sufficient credits';
                    } else if (errorMsg.includes('vision')) {
                        alertMessage += '\n\nTroubleshooting tips:\n- Your OpenAI account might not have access to GPT-4 Vision API\n- Make sure your API key has access to the correct models';
                    } else if (errorMsg.includes('timeout') || errorMsg.includes('image')) {
                        alertMessage += '\n\nTroubleshooting tips:\n- The screenshot might be too large\n- Try again with a simpler webpage\n- Check if the page allows screenshots';
                    }
                    
                    alert(alertMessage);
                    
                    // Add detailed error log
                    addLogEntry({
                        type: 'error',
                        message: `Meme generation failed: ${errorMsg}`,
                        timestamp: new Date().toLocaleTimeString()
                    });
                    
                    // Log more details to console for debugging
                    console.error('[Discord Status] Meme generation failed details:', response);
                }
            });
        });
    });
    
    // Handle view memes button
    document.getElementById('view-memes').addEventListener('click', () => {
        // Try to open Downloads folder
        chrome.downloads.showDefaultFolder();
        
        // Alert user where to find memes
        alert('Your memes are saved in your Downloads folder.');
    });
});

// Function to display the last generated meme
function displayLastMeme(memeInfo) {
    if (!memeInfo) return;
    
    const container = document.getElementById('last-meme-container');
    const image = document.getElementById('last-meme-image');
    const info = document.getElementById('last-meme-info');
    const placeholder = document.getElementById('last-meme-placeholder');
    
    // Show the container
    container.style.display = 'block';
    
    if (memeInfo.path) {
        // Format timestamp
        const timestamp = new Date(memeInfo.timestamp).toLocaleString();
        
        // Update info text
        info.textContent = `Generated: ${timestamp} | Source: ${memeInfo.source || 'Unknown'}`;
        info.textContent += ` | Text: "${memeInfo.memeText?.substring(0, 50)}${memeInfo.memeText?.length > 50 ? '...' : ''}"`;
        
        // Show image if available
        if (memeInfo.dataUrl) {
            // Show the image
            image.src = memeInfo.dataUrl;
            image.style.display = 'block';
            placeholder.style.display = 'none';
            
            // Add download button if not already present
            if (!document.getElementById('download-meme-button')) {
                const downloadButton = document.createElement('button');
                downloadButton.id = 'download-meme-button';
                downloadButton.className = 'btn-success';
                downloadButton.style.marginTop = '8px';
                downloadButton.style.width = '100%';
                downloadButton.innerHTML = '<i class="fa-solid fa-download"></i> Download Meme';
                
                downloadButton.addEventListener('click', () => {
                    // Generate filename with timestamp
                    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
                    const filename = `meme_${timestamp}.png`;
                    
                    // Create download link
                    const a = document.createElement('a');
                    a.href = memeInfo.dataUrl;
                    a.download = filename;
                    a.style.display = 'none';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    
                    // Show success message
                    alert('Meme downloaded to your Downloads folder');
                    
                    // Add log entry
                    addLogEntry({
                        type: 'success',
                        message: 'Meme manually downloaded',
                        timestamp: new Date().toLocaleTimeString()
                    });
                });
                
                // Add the button after the image
                image.parentNode.insertBefore(downloadButton, image.nextSibling);
            }
        } else {
            // When loaded from storage, dataUrl isn't available due to size
            console.log('[Discord Status] No dataUrl for meme, showing placeholder');
            image.style.display = 'none';
            placeholder.textContent = 'Meme was saved to your Downloads folder';
            placeholder.style.display = 'block';
            
            // Remove download button if present
            const downloadButton = document.getElementById('download-meme-button');
            if (downloadButton) {
                downloadButton.remove();
            }
        }
    } else {
        // No meme available
        image.style.display = 'none';
        placeholder.style.display = 'block';
        
        // Remove download button if present
        const downloadButton = document.getElementById('download-meme-button');
        if (downloadButton) {
            downloadButton.remove();
        }
    }
}

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