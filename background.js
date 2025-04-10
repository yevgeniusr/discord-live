let discordToken = '';
let isEnabled = false;
let statusMappings = [];
let currentStatus = '';
let lastUpdatedTime = 0;
let statusLogs = [];
let periodicUpdateInterval = null;
let lastCheckedUrl = '';
let updateFrequency = 5000; // Default frequency in milliseconds

// Initialize the extension
chrome.runtime.onInstalled.addListener(() => {
    console.log('[Discord Status] Extension installed/updated');
    
    chrome.storage.sync.get(['discordToken', 'isEnabled', 'statusMappings', 'statusLogs', 'updateFrequency'], (result) => {
        discordToken = result.discordToken || '';
        isEnabled = result.isEnabled || false;
        updateFrequency = result.updateFrequency || 5000;
        statusMappings = result.statusMappings || [
            { urlPattern: "youtube.com", status: "Watching YouTube" },
            { urlPattern: "github.com", status: "Working on code" },
            { urlPattern: "netflix.com", status: "Watching Netflix" },
            { urlPattern: "docs.google.com", status: "Working on documents" },
            { urlPattern: "/prompt|ai|gpt|llm/i", status: "Learning AI and ML" }
        ];
        statusLogs = result.statusLogs || [];
        
        // Add installation log
        const installLog = {
            type: 'info',
            message: 'Extension initialized',
            timestamp: new Date().toLocaleTimeString()
        };
        statusLogs.unshift(installLog);
        chrome.storage.sync.set({ statusLogs });
        
        console.log('[Discord Status] Initialization complete');
        if (discordToken) {
            console.log('[Discord Status] Token found in storage');
        } else {
            console.log('[Discord Status] No token found, user needs to configure');
        }
        
        // Start periodic updates if enabled
        if (isEnabled) {
            startPeriodicUpdates();
        }
    });
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
        if (changes.discordToken) {
            discordToken = changes.discordToken.newValue;
        }
        if (changes.isEnabled) {
            isEnabled = changes.isEnabled.newValue;
            
            // Start or stop periodic updates based on enabled state
            if (isEnabled) {
                startPeriodicUpdates();
            } else {
                stopPeriodicUpdates();
            }
        }
        if (changes.statusMappings) {
            statusMappings = changes.statusMappings.newValue;
        }
        if (changes.updateFrequency) {
            updateFrequency = changes.updateFrequency.newValue;
            
            // Restart periodic updates with new frequency if enabled
            if (isEnabled) {
                startPeriodicUpdates();
            }
        }
    }
});

// Start periodic status updates
function startPeriodicUpdates() {
    // Clear any existing interval first
    if (periodicUpdateInterval) {
        clearInterval(periodicUpdateInterval);
    }
    
    console.log(`[Discord Status] Starting periodic updates (every ${updateFrequency/1000} seconds)`);
    
    // Set up the interval to check at the configured frequency
    periodicUpdateInterval = setInterval(() => {
        if (!isEnabled) {
            stopPeriodicUpdates();
            return;
        }
        
        // Get the current active tab
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs.length > 0) {
                const activeTab = tabs[0];
                
                // Only update if the URL has changed since last check
                if (activeTab.url !== lastCheckedUrl) {
                    console.log(`[Discord Status] Periodic check detected URL change: ${lastCheckedUrl} -> ${activeTab.url}`);
                    lastCheckedUrl = activeTab.url;
                    updateDiscordStatus(activeTab.id);
                } else {
                    console.log('[Discord Status] Periodic check: URL unchanged, skipping update');
                }
            }
        });
    }, updateFrequency);
}

// Stop periodic status updates
function stopPeriodicUpdates() {
    if (periodicUpdateInterval) {
        console.log('[Discord Status] Stopping periodic updates');
        clearInterval(periodicUpdateInterval);
        periodicUpdateInterval = null;
    }
}

// Listen for tab changes
chrome.tabs.onActivated.addListener((activeInfo) => {
    if (!isEnabled) return;
    updateDiscordStatus(activeInfo.tabId);
});

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!isEnabled || !changeInfo.url) return;
    updateDiscordStatus(tabId);
});

// Update Discord status based on the current tab
function updateDiscordStatus(tabId) {
    chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError || !tab.url) return;

        const currentUrl = tab.url;
        let matchingMapping = null;
        
        // Check each mapping for a match
        for (const mapping of statusMappings) {
            let isMatch = false;
            
            // Check if the pattern is a regex (starts and ends with /)
            if (mapping.urlPattern.startsWith('/') && mapping.urlPattern.lastIndexOf('/') > 0) {
                try {
                    // Extract the regex pattern and flags
                    const lastSlashIndex = mapping.urlPattern.lastIndexOf('/');
                    const patternBody = mapping.urlPattern.substring(1, lastSlashIndex);
                    const flags = mapping.urlPattern.substring(lastSlashIndex + 1);
                    
                    // Create and test the regex
                    const regex = new RegExp(patternBody, flags);
                    isMatch = regex.test(currentUrl);
                    
                    console.log(`[Discord Status] Testing regex ${mapping.urlPattern} against ${currentUrl}: ${isMatch}`);
                } catch (error) {
                    console.error(`[Discord Status] Invalid regex pattern: ${mapping.urlPattern}`, error);
                }
            } else {
                // Standard substring match for non-regex patterns
                isMatch = currentUrl.includes(mapping.urlPattern);
                console.log(`[Discord Status] Testing pattern ${mapping.urlPattern} against ${currentUrl}: ${isMatch}`);
            }
            
            if (isMatch) {
                matchingMapping = mapping;
                break;
            }
        }

        if (matchingMapping) {
            setDiscordStatus(matchingMapping.status, `Based on your visit to ${new URL(currentUrl).hostname}`);
        } else {
            // Optional: Set a default status when no mappings match
            // setDiscordStatus("Browsing the web", "Default status");
        }
    });
}

// Listen for messages from popup.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'updateStatus' && message.status) {
        setDiscordStatus(message.status, 'Manual update from extension');
        sendResponse({ success: true });
    }
    else if (message.action === 'checkActiveTab') {
        // Force an immediate check of the active tab
        console.log('[Discord Status] Forced status check requested from popup');
        
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs.length > 0) {
                const activeTab = tabs[0];
                console.log(`[Discord Status] Checking active tab: ${activeTab.url}`);
                lastCheckedUrl = activeTab.url; // Update this to prevent duplicate checks
                updateDiscordStatus(activeTab.id);
            } else {
                console.log('[Discord Status] No active tab found to check');
            }
        });
    }
    return true; // Indicates async response
});

// Function to update Discord status
function setDiscordStatus(statusText, reason) {
    console.log(`[Discord Status] Attempting to update status to: "${statusText}"`);
    
    if (!discordToken) {
        console.error('[Discord Status] Cannot update Discord status: No token available');
        chrome.runtime.sendMessage({ 
            action: 'statusUpdateLog', 
            type: 'error',
            message: 'No Discord token available'
        });
        return;
    }
    
    // Rate limiting - don't update if last update was less than 3 seconds ago
    // and the status is the same
    const now = Date.now();
    if (statusText === currentStatus && now - lastUpdatedTime < 3000) {
        console.log(`[Discord Status] Skipping update - same status "${statusText}" set less than 3 seconds ago`);
        return;
    }
    
    // Make sure token is valid before attempting to use it
    if (discordToken.length < 50) {
        console.error('[Discord Status] Invalid Discord token format. Token appears too short.');
        chrome.runtime.sendMessage({ 
            action: 'statusUpdateLog', 
            type: 'error',
            message: 'Invalid token format (too short)'
        });
        return;
    }
    
    // Check token structure
    const tokenParts = discordToken.split('.');
    if (tokenParts.length !== 3) {
        console.error('[Discord Status] Invalid Discord token structure. Expected 3 parts separated by periods.');
        chrome.runtime.sendMessage({ 
            action: 'statusUpdateLog', 
            type: 'error',
            message: 'Invalid token structure'
        });
        return;
    }
    
    // Check if third part seems truncated (should be 27+ characters)
    if (tokenParts[2].length < 27) {
        console.warn(`[Discord Status] Warning: Discord token third part appears truncated (${tokenParts[2].length} chars). This may cause API failures.`);
        chrome.runtime.sendMessage({ 
            action: 'statusUpdateLog', 
            type: 'warning',
            message: 'Token may be truncated'
        });
    }
    
    console.log(`[Discord Status] Making API request to update status to "${statusText}"`);
    
    fetch('https://discord.com/api/v9/users/@me/settings', {
        method: 'PATCH',
        headers: {
            'Authorization': discordToken,
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
            // Show notification only if status has changed
            if (statusText !== currentStatus) {
                console.log(`[Discord Status] Successfully updated status to "${statusText}"`);
                showNotification(statusText, reason);
                currentStatus = statusText;
                lastUpdatedTime = now;
                
                chrome.runtime.sendMessage({ 
                    action: 'statusUpdateLog', 
                    type: 'success',
                    message: `Status updated to "${statusText}"`,
                    timestamp: new Date().toLocaleTimeString()
                });
            } else {
                console.log(`[Discord Status] Status "${statusText}" confirmed (no change needed)`);
            }
        } else {
            console.error(`[Discord Status] Failed to update Discord status: ${response.status}`);
            
            // If we get a 401 error, the token might be invalid
            if (response.status === 401) {
                console.error('[Discord Status] Discord token appears to be invalid. Please get a new token.');
                // Show an error notification
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'icons/icon16.png',
                    title: 'Discord Status Error',
                    message: 'Your Discord token appears to be invalid. Please open the extension and update your token.',
                    priority: 2
                });
                
                chrome.runtime.sendMessage({ 
                    action: 'statusUpdateLog', 
                    type: 'error',
                    message: 'Invalid token (401 Unauthorized)',
                    timestamp: new Date().toLocaleTimeString()
                });
            } else {
                chrome.runtime.sendMessage({ 
                    action: 'statusUpdateLog', 
                    type: 'error',
                    message: `API error: ${response.status}`,
                    timestamp: new Date().toLocaleTimeString()
                });
            }
            
            return response.text().then(text => {
                console.error('[Discord Status] Response body:', text);
            });
        }
    })
    .catch(error => {
        console.error('[Discord Status] Error updating Discord status:', error);
        chrome.runtime.sendMessage({ 
            action: 'statusUpdateLog', 
            type: 'error',
            message: `Network error: ${error.message}`,
            timestamp: new Date().toLocaleTimeString()
        });
    });
}

// Function to show notification
function showNotification(statusText, reason) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon16.png',
        title: 'Discord Status Updated',
        message: `Your status has been set to: "${statusText}"`,
        contextMessage: reason || '',
        priority: 0
    });
}