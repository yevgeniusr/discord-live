let discordToken = '';
let isEnabled = false;
let statusMappings = [];
let currentStatus = '';
let lastUpdatedTime = 0;
let statusLogs = [];
let periodicUpdateInterval = null;
let lastCheckedUrl = '';
let updateFrequency = 5000; // Default frequency in milliseconds

// Meme generator variables
let memeEnabled = false;
let openaiKey = '';
let memeFrequency = 300000; // Default: every 5 minutes
let autoDownload = true;
let memeFolder = "memes"; // Default folder name
let lastMemeInfo = null;
let memeGeneratorInterval = null;
let lastScreenshotUrl = '';

// Initialize the extension
chrome.runtime.onInstalled.addListener(() => {
    console.log('[Discord Status] Extension installed/updated');
    
    chrome.storage.sync.get([
        'discordToken', 
        'isEnabled', 
        'statusMappings', 
        'statusLogs', 
        'updateFrequency',
        'memeEnabled',
        'openaiKey',
        'memeFrequency',
        'memeFolder',
        'autoDownload',
        'lastMemeInfo'
    ], (result) => {
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
        
        // Load meme generator settings
        memeEnabled = result.memeEnabled || false;
        openaiKey = result.openaiKey || '';
        memeFrequency = result.memeFrequency || 300000;
        autoDownload = result.autoDownload !== false; // Default to true
        memeFolder = result.memeFolder || "memes"; // Default to "memes"
        lastMemeInfo = result.lastMemeInfo || null;
        
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
        
        // Start meme generator if enabled
        if (memeEnabled && openaiKey && memeFolder) {
            startMemeGenerator();
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
        
        // Meme generator settings
        if (changes.memeEnabled) {
            memeEnabled = changes.memeEnabled.newValue;
            
            // Start or stop meme generator
            if (memeEnabled && openaiKey && memeFolder) {
                startMemeGenerator();
            } else if (!memeEnabled) {
                stopMemeGenerator();
            }
        }
        if (changes.openaiKey) {
            openaiKey = changes.openaiKey.newValue;
            
            // Restart meme generator if enabled
            if (memeEnabled && openaiKey && memeFolder) {
                startMemeGenerator();
            }
        }
        if (changes.memeFrequency) {
            memeFrequency = changes.memeFrequency.newValue;
            
            // Restart meme generator with new frequency if enabled
            if (memeEnabled && openaiKey && memeFolder) {
                startMemeGenerator();
            }
        }
        if (changes.autoDownload !== undefined) {
            autoDownload = changes.autoDownload.newValue;
        }
        if (changes.lastMemeInfo) {
            lastMemeInfo = changes.lastMemeInfo.newValue;
        }
        if (changes.memeFolder) {
            memeFolder = changes.memeFolder.newValue;
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
    else if (message.action === 'toggleMemeGenerator') {
        console.log(`[Discord Status] Meme generator ${message.enabled ? 'enabled' : 'disabled'}`);
        
        if (message.enabled && openaiKey && memeFolder) {
            startMemeGenerator();
            sendResponse({ success: true });
        } else if (!message.enabled) {
            stopMemeGenerator();
            sendResponse({ success: true });
        } else {
            sendResponse({ 
                success: false,
                error: 'OpenAI API key or meme folder not set'
            });
        }
    }
    else if (message.action === 'updateMemeFrequency') {
        memeFrequency = message.frequency;
        
        if (memeEnabled && openaiKey && memeFolder) {
            startMemeGenerator(); // This will restart with the new frequency
            sendResponse({ success: true });
        } else {
            sendResponse({ success: true });
        }
    }
    else if (message.action === 'validateOpenAIKey') {
        validateOpenAIKey(message.apiKey)
            .then(valid => {
                sendResponse({
                    valid: valid,
                    error: valid ? null : 'Invalid API key or API error'
                });
            })
            .catch(error => {
                sendResponse({
                    valid: false,
                    error: error.message
                });
            });
            
        return true; // Indicate async response
    }
    else if (message.action === 'generateTestMeme') {
        if (!openaiKey) {
            sendResponse({
                success: false,
                error: 'OpenAI API key not set'
            });
            return true;
        }
        
        // For testing, use Downloads folder if no custom folder is set
        if (!memeFolder) {
            memeFolder = "memes";
            // Update storage with default folder
            chrome.storage.sync.set({ memeFolder });
        }
        
        console.log('[Discord Status] Generating test meme with folder:', memeFolder);
        
        // Generate a test meme
        generateMeme(true)
            .then(memeInfo => {
                console.log('[Discord Status] Test meme generated:', memeInfo);
                sendResponse({
                    success: true,
                    memeInfo: memeInfo
                });
            })
            .catch(error => {
                console.error('[Discord Status] Test meme generation failed:', error);
                sendResponse({
                    success: false,
                    error: error.message
                });
            });
            
        return true; // This is crucial - indicates we'll respond asynchronously
    }
    else if (message.action === 'openMemeFolder') {
        // Try to open the meme folder (may not work in all browsers)
        try {
            window.open('file://' + message.folder);
            sendResponse({ success: true });
        } catch (error) {
            sendResponse({
                success: false,
                error: 'Could not open folder: ' + error.message
            });
        }
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

// Start the meme generator
function startMemeGenerator() {
    // Clear any existing interval first
    stopMemeGenerator();
    
    console.log(`[Discord Status] Starting meme generator (every ${memeFrequency/60000} minutes)`);
    
    // Set up the interval to check at the configured frequency
    memeGeneratorInterval = setInterval(() => {
        if (!memeEnabled || !openaiKey || !memeFolder) {
            stopMemeGenerator();
            return;
        }
        
        // Generate a meme
        generateMeme()
            .then(memeInfo => {
                console.log('[Discord Status] Meme generated successfully:', memeInfo.path);
                
                // Show notification
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'icons/icon16.png',
                    title: 'New Meme Generated',
                    message: `A new meme has been saved to: ${memeInfo.path}`,
                    priority: 0
                });
                
                // Send log message to popup
                chrome.runtime.sendMessage({ 
                    action: 'statusUpdateLog', 
                    type: 'success',
                    message: `Meme generated from ${memeInfo.source}`,
                    timestamp: new Date().toLocaleTimeString()
                });
            })
            .catch(error => {
                console.error('[Discord Status] Error generating meme:', error);
                
                // Send error log to popup
                chrome.runtime.sendMessage({ 
                    action: 'statusUpdateLog', 
                    type: 'error',
                    message: `Meme generation failed: ${error.message}`,
                    timestamp: new Date().toLocaleTimeString()
                });
            });
    }, memeFrequency);
    
    // Also generate one immediately after enabling
    setTimeout(() => {
        generateMeme()
            .catch(error => console.error('[Discord Status] Error generating initial meme:', error));
    }, 1000);
}

// Stop the meme generator
function stopMemeGenerator() {
    if (memeGeneratorInterval) {
        console.log('[Discord Status] Stopping meme generator');
        clearInterval(memeGeneratorInterval);
        memeGeneratorInterval = null;
    }
}

// Validate OpenAI API key
async function validateOpenAIKey(apiKey) {
    try {
        const response = await fetch('https://api.openai.com/v1/models', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });
        
        return response.ok;
    } catch (error) {
        console.error('[Discord Status] API key validation error:', error);
        return false;
    }
}

// Helper function to create an image bitmap from a data URL
// This is a wrapper around the native createImageBitmap to handle errors better
async function createImageBitmapFromDataUrl(dataUrl) {
    try {
        console.log('[Discord Status] Creating image bitmap from data URL');
        
        // Convert dataUrl to blob
        const fetchResponse = await fetch(dataUrl);
        if (!fetchResponse.ok) {
            throw new Error(`Failed to fetch data URL: ${fetchResponse.status}`);
        }
        
        const blob = await fetchResponse.blob();
        console.log('[Discord Status] Created blob from data URL, size:', blob.size);
        
        // Create ImageBitmap
        return await self.createImageBitmap(blob);
    } catch (error) {
        console.error('[Discord Status] Error creating image bitmap:', error);
        throw new Error(`Failed to create image bitmap: ${error.message}`);
    }
}

// Generate a meme
async function generateMeme(isTest = false) {
    console.log('[Discord Status] Attempting to generate a meme');
    console.log('[Discord Status] Meme folder:', memeFolder);
    console.log('[Discord Status] OpenAI key length:', openaiKey ? openaiKey.length : 0);
    
    try {
        // Check if we have the necessary permissions
        try {
            console.log('[Discord Status] Checking permissions');
            const permissions = await chrome.permissions.getAll();
            console.log('[Discord Status] Current permissions:', permissions);
            
            if (!permissions.permissions.includes('tabs')) {
                console.log('[Discord Status] Requesting tabs permission');
                const granted = await chrome.permissions.request({
                    permissions: ['tabs']
                });
                
                if (!granted) {
                    throw new Error('The extension needs permission to access tabs to generate memes');
                }
            }
        } catch (permError) {
            console.error('[Discord Status] Permission check error:', permError);
            // Continue anyway - permission might be granted at the manifest level
        }
        
        // Validate required configuration
        if (!openaiKey) {
            throw new Error('OpenAI API key is not configured');
        }
        
        if (!memeFolder) {
            console.log('[Discord Status] No meme folder specified, using default');
            memeFolder = "memes";
        }
        
        // Get current active tab
        console.log('[Discord Status] Querying for active tab');
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        console.log('[Discord Status] Active tabs found:', tabs ? tabs.length : 0);
        
        if (!tabs || tabs.length === 0) {
            throw new Error('No active tab found');
        }
        
        const activeTab = tabs[0];
        
        // Skip if URL hasn't changed and this isn't a test
        if (activeTab.url === lastScreenshotUrl && !isTest) {
            throw new Error('URL unchanged, skipping meme generation');
        }
        
        // Take a screenshot of the active tab
        let screenshot;
        try {
            console.log('[Discord Status] Taking screenshot of active tab');
            screenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
            console.log('[Discord Status] Screenshot taken successfully, length:', screenshot.length);
            lastScreenshotUrl = activeTab.url;
        } catch (screenshotError) {
            console.error('[Discord Status] Error taking screenshot:', screenshotError);
            throw new Error(`Failed to take screenshot: ${screenshotError.message}. This might be due to security restrictions or an incognito window.`);
        }
        
        // Get a trimmed version of the URL for source display
        const urlObj = new URL(activeTab.url);
        const source = urlObj.hostname;
        
        // Generate a timestamp-based filename
        const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
        const filename = `meme_${timestamp}.png`;
        
        console.log('[Discord Status] Preparing to generate meme with filename:', filename);
        
        // Send to OpenAI API to generate a meme
        const memeText = await generateMemeTextWithAI(screenshot, activeTab.url, activeTab.title);
        console.log('[Discord Status] Generated meme text:', memeText);
        
        // Create the meme image
        const memeImageUrl = await createMemeImage(screenshot, memeText);
        console.log('[Discord Status] Created meme image data URL');
        
        // Save meme info
        const memeInfo = {
            path: filename,
            dataUrl: memeImageUrl,
            source: source,
            originalUrl: activeTab.url,
            memeText: memeText,
            timestamp: new Date().toISOString()
        };
        
        // Save to storage (but trim the dataUrl to avoid exceeding storage limits)
        const storageInfo = {...memeInfo};
        delete storageInfo.dataUrl; // Remove large data URL from storage
        lastMemeInfo = memeInfo;
        chrome.storage.sync.set({ lastMemeInfo: storageInfo });
        
        // If auto-download is enabled or this is a test, save the file
        if (autoDownload || isTest) {
            try {
                console.log('[Discord Status] Saving meme to downloads folder');
                const downloadId = await chrome.downloads.download({
                    url: memeImageUrl,
                    filename: filename,
                    saveAs: false
                });
                console.log('[Discord Status] Meme saved with download ID:', downloadId);
            } catch (e) {
                console.error('[Discord Status] Error saving meme to downloads:', e);
                // We'll still keep the dataUrl for display
            }
        } else {
            console.log('[Discord Status] Auto-download disabled, meme not saved to disk');
        }
        
        return memeInfo;
    } catch (error) {
        console.error('[Discord Status] Meme generation error:', error);
        throw error;
    }
}

// Function to generate meme text with OpenAI API
async function generateMemeTextWithAI(screenshot, url, title) {
    console.log('[Discord Status] Generating meme text with OpenAI API');
    console.log('[Discord Status] URL:', url);
    console.log('[Discord Status] Title:', title);
    console.log('[Discord Status] Screenshot available:', !!screenshot);
    
    if (!openaiKey) {
        console.error('[Discord Status] OpenAI API key is missing');
        throw new Error('OpenAI API key is not configured');
    }
    
    try {
        // Convert base64 image to more manageable size
        console.log('[Discord Status] Resizing image...');
        const resizedImage = await resizeImage(screenshot, 800);
        
        // Format the prompt message for OpenAI
        const promptText = "RESPOND WITH A SINGLE MEME CAPTION ONLY. NO EXPLANATIONS. NO PREFIXES. NO QUOTES. JUST THE PLAIN TEXT CAPTION.";
        
        // Call OpenAI API with the new format supporting image passing
        console.log('[Discord Status] Calling OpenAI API with image...');
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${openaiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "o1-2024-12-17",
                messages: [
                    {
                        role: "system",
                        content: "You are a direct meme caption generator. Only output the caption text itself. No formatting, no explanations, no quotes. Keep captions UNDER 10 words, funny, and engaging. NEVER explain your reasoning or add any prefixes/suffixes to your response."
                    },
                    {
                        role: "user",
                        content: [
                            { type: "text", text: promptText },
                            {
                                type: "image_url",
                                image_url: {
                                    url: resizedImage
                                }
                            }
                        ]
                    }
                ],
                max_completion_tokens: 5000
            })
        });
        
        console.log('[Discord Status] OpenAI API response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('[Discord Status] API error:', errorText);
            throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        console.log('[Discord Status] API response received');
        
        if (!data || !data.choices || !data.choices[0]) {
            console.error('[Discord Status] Invalid response format:', data);
            throw new Error('Invalid response format from OpenAI API');
        }
        
        // Extract the generated text and do detailed debugging
        try {
            console.log('[Discord Status] Full API response:', JSON.stringify(data));
            
            // Check if the response has the expected structure
            if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                console.error('[Discord Status] Unexpected API response structure:', data);
                return "API response missing message content";
            }
            
            const messageContent = data.choices[0].message.content;
            if (messageContent === undefined || messageContent === null) {
                console.error('[Discord Status] Message content is null or undefined');
                return "Error: No message content";
            }
            
            let memeText = messageContent.trim();
            console.log('[Discord Status] Raw generated meme text:', memeText);
            
            // Basic cleaning without being too aggressive
            // Remove only quotes that appear at the beginning and end
            memeText = memeText.replace(/^["']|["']$/g, '');
            
            // Extract just the caption if the response has explanation text
            const captionMatch = memeText.match(/["']([^"']+)["']/);
            if (captionMatch && captionMatch[1]) {
                console.log('[Discord Status] Found caption in quotes:', captionMatch[1]);
                memeText = captionMatch[1];
            }
            
            // If still empty, try alternate extractors
            if (!memeText || memeText.trim() === '') {
                console.log('[Discord Status] No text after initial cleaning, trying alternatives');
                
                // Try to extract the first line if there are multiple lines
                const lines = messageContent.split('\n').filter(line => line.trim() !== '');
                if (lines.length > 0) {
                    memeText = lines[0].trim();
                    console.log('[Discord Status] Using first line:', memeText);
                }
            }
            
            // Final fallback
            if (!memeText || memeText.trim() === '') {
                memeText = "When the screenshot is too good for words";
                console.log('[Discord Status] No valid text extracted, using fallback');
            }
            
            // Ensure reasonable length
            if (memeText.length > 100) {
                memeText = memeText.substring(0, 97) + '...';
            }
            
            console.log('[Discord Status] Final meme text after processing:', memeText);
            return memeText;
        } catch (error) {
            console.error('[Discord Status] Error processing API response:', error);
            return "Error processing meme text";
        }
    } catch (error) {
        console.error('[Discord Status] Error generating meme text:', error);
        throw new Error(`Failed to generate meme text: ${error.message}`);
    }
}

// Function to create a meme image with text overlay
async function createMemeImage(originalImage, memeText) {
    console.log('[Discord Status] Creating meme image with text');
    
    try {
        // Try using OffscreenCanvas API which is better for service workers
        if (typeof OffscreenCanvas !== 'undefined') {
            console.log('[Discord Status] Using OffscreenCanvas for meme creation');
            
            // Convert dataUrl to ImageBitmap
            const imageBitmap = await createImageBitmapFromDataUrl(originalImage);
            
            console.log('[Discord Status] Created ImageBitmap, dimensions:', imageBitmap.width, 'x', imageBitmap.height);
            
            // Create an OffscreenCanvas with extra space for text
            const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height + 240); // Even more space for text
            const ctx = canvas.getContext('2d');
            
            // Fill background
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Draw image
            ctx.drawImage(imageBitmap, 0, 0);
            
            // Add text area with a semi-transparent background for better readability
            ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'; // Very light gray background
            ctx.fillRect(0, imageBitmap.height, canvas.width, 240);
            
            // Add text with debug info
            console.log('[Discord Status] Meme text to render:', memeText);
            
            // Make sure we have text to render
            if (!memeText || memeText.trim() === '') {
                memeText = "Sample meme text";
                console.log('[Discord Status] No text received, using placeholder');
            }
            
            // Set up text properties
            ctx.textAlign = 'center';
            // Fixed large font size
            const fontSize = 60; // Large fixed size
            ctx.font = `bold ${fontSize}px Arial, sans-serif`;
            
            // Wrap text - with fewer words per line for bigger text
            const words = memeText.split(' ');
            const lines = [];
            let currentLine = words[0] || "";
            
            for (let i = 1; i < words.length; i++) {
                const testLine = currentLine + ' ' + words[i];
                const metrics = ctx.measureText(testLine);
                const testWidth = metrics.width;
                
                if (testWidth > canvas.width - 80) { // Wider margins for bigger text
                    lines.push(currentLine);
                    currentLine = words[i];
                } else {
                    currentLine = testLine;
                }
            }
            if (currentLine) {
                lines.push(currentLine);
            }
            
            console.log('[Discord Status] Text split into', lines.length, 'lines:', lines);
            
            // Draw text with high contrast
            const lineHeight = fontSize + 10; // Proper spacing for larger text
            const startY = imageBitmap.height + 80; // Start a bit lower
            
            console.log('[Discord Status] Drawing meme text with', lines.length, 'lines');
            
            lines.forEach((line, i) => {
                const y = startY + (i * lineHeight);
                
                // First draw thick black outline for contrast
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 10; // Thick outline
                ctx.strokeText(line, canvas.width / 2, y);
                
                // Then draw white text
                ctx.fillStyle = '#ffffff';
                ctx.fillText(line, canvas.width / 2, y);
                
                console.log(`[Discord Status] Drew line "${line}" at y=${y}`);
            });
            
            // Convert to blob
            const resultBlob = await canvas.convertToBlob({ type: 'image/png' });
            
            // Convert blob to data URL
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const memeImageUrl = reader.result;
                    console.log('[Discord Status] Meme image created, length:', memeImageUrl.length);
                    resolve(memeImageUrl);
                };
                reader.onerror = () => reject(new Error('Failed to convert meme image blob to data URL'));
                reader.readAsDataURL(resultBlob);
            });
            
        } else {
            // Fallback to the traditional approach
            console.log('[Discord Status] Falling back to traditional approach for meme creation');
            
            // Convert dataUrl to ImageBitmap
            const imageBitmap = await createImageBitmapFromDataUrl(originalImage);
            
            console.log('[Discord Status] Created ImageBitmap, dimensions:', imageBitmap.width, 'x', imageBitmap.height);
            
            // Create a temporary offscreen document
            const offscreenDocument = new DOMParser().parseFromString('<!DOCTYPE html><html><body></body></html>', 'text/html');
            const canvas = offscreenDocument.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Set canvas dimensions with extra space for text
            canvas.width = imageBitmap.width;
            canvas.height = imageBitmap.height + 240; // Even more space for text
            
            // Draw image
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(imageBitmap, 0, 0);
            
            // Add text area with a semi-transparent background for better readability
            ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'; // Very light gray background
            ctx.fillRect(0, imageBitmap.height, canvas.width, 240);
            
            // Add text with debug info
            console.log('[Discord Status] Meme text to render:', memeText);
            
            // Make sure we have text to render
            if (!memeText || memeText.trim() === '') {
                memeText = "Sample meme text";
                console.log('[Discord Status] No text received, using placeholder');
            }
            
            // Set up text properties
            ctx.textAlign = 'center';
            // Fixed large font size
            const fontSize = 60; // Large fixed size
            ctx.font = `bold ${fontSize}px Arial, sans-serif`;
            
            // Wrap text - with fewer words per line for bigger text
            const words = memeText.split(' ');
            const lines = [];
            let currentLine = words[0] || "";
            
            for (let i = 1; i < words.length; i++) {
                const testLine = currentLine + ' ' + words[i];
                const metrics = ctx.measureText(testLine);
                const testWidth = metrics.width;
                
                if (testWidth > canvas.width - 80) { // Wider margins for bigger text
                    lines.push(currentLine);
                    currentLine = words[i];
                } else {
                    currentLine = testLine;
                }
            }
            if (currentLine) {
                lines.push(currentLine);
            }
            
            console.log('[Discord Status] Text split into', lines.length, 'lines:', lines);
            
            // Draw text with high contrast
            const lineHeight = fontSize + 10; // Proper spacing for larger text
            const startY = imageBitmap.height + 80; // Start a bit lower
            
            console.log('[Discord Status] Drawing meme text with', lines.length, 'lines');
            
            lines.forEach((line, i) => {
                const y = startY + (i * lineHeight);
                
                // First draw thick black outline for contrast
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 10; // Thick outline
                ctx.strokeText(line, canvas.width / 2, y);
                
                // Then draw white text
                ctx.fillStyle = '#ffffff';
                ctx.fillText(line, canvas.width / 2, y);
                
                console.log(`[Discord Status] Drew line "${line}" at y=${y}`);
            });
            
            // Convert to data URL
            const memeImageUrl = canvas.toDataURL('image/png');
            console.log('[Discord Status] Meme image created, length:', memeImageUrl.length);
            return memeImageUrl;
        }
    } catch (error) {
        console.error('[Discord Status] Error in createMemeImage:', error);
        throw new Error(`Meme image creation failed: ${error.message}`);
    }
}

// Resize an image to reduce size for API calls
async function resizeImage(dataUrl, maxWidth) {
    if (!dataUrl) {
        console.error('[Discord Status] No dataUrl provided for resizing');
        throw new Error('No image data provided for resizing');
    }
    
    console.log('[Discord Status] Resizing image, source length:', dataUrl.length);
    
    try {
        // Try using OffscreenCanvas API which is better for service workers
        if (typeof OffscreenCanvas !== 'undefined') {
            console.log('[Discord Status] Using OffscreenCanvas for image resizing');
            
            // Convert dataUrl to ImageBitmap
            const imageBitmap = await createImageBitmapFromDataUrl(dataUrl);
            
            console.log('[Discord Status] Created ImageBitmap, dimensions:', imageBitmap.width, 'x', imageBitmap.height);
            
            // Calculate new dimensions
            let width = imageBitmap.width;
            let height = imageBitmap.height;
            
            if (width > maxWidth) {
                const ratio = maxWidth / width;
                width = maxWidth;
                height = height * ratio;
            }
            
            console.log('[Discord Status] Resizing to dimensions:', width, 'x', height);
            
            // Create an OffscreenCanvas
            const canvas = new OffscreenCanvas(width, height);
            const ctx = canvas.getContext('2d');
            
            // Draw resized image
            ctx.drawImage(imageBitmap, 0, 0, width, height);
            
            // Convert to blob
            const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
            
            // Convert blob to data URL
            const reader = new FileReader();
            return new Promise((resolve, reject) => {
                reader.onloadend = () => {
                    const resizedDataUrl = reader.result;
                    console.log('[Discord Status] Resized image, result length:', resizedDataUrl.length);
                    resolve(resizedDataUrl);
                };
                reader.onerror = () => reject(new Error('Failed to convert blob to data URL'));
                reader.readAsDataURL(blob);
            });
        } else {
            // Fallback to using a regular canvas with createImageBitmap
            console.log('[Discord Status] Falling back to traditional canvas for image resizing');
            
            // Convert dataUrl to ImageBitmap
            const imageBitmap = await createImageBitmapFromDataUrl(dataUrl);
            
            console.log('[Discord Status] Created ImageBitmap, dimensions:', imageBitmap.width, 'x', imageBitmap.height);
            
            // Calculate new dimensions
            let width = imageBitmap.width;
            let height = imageBitmap.height;
            
            if (width > maxWidth) {
                const ratio = maxWidth / width;
                width = maxWidth;
                height = height * ratio;
            }
            
            // Create a temporary offscreen document
            const offscreenDocument = new DOMParser().parseFromString('<!DOCTYPE html><html><body></body></html>', 'text/html');
            const canvas = offscreenDocument.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            canvas.width = width;
            canvas.height = height;
            
            // Draw resized image
            ctx.drawImage(imageBitmap, 0, 0, width, height);
            
            // Convert to data URL
            const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
            console.log('[Discord Status] Resized image, result length:', resizedDataUrl.length);
            return resizedDataUrl;
        }
    } catch (error) {
        console.error('[Discord Status] Error in resize function:', error);
        throw new Error(`Image resizing failed: ${error.message}`);
    }
}