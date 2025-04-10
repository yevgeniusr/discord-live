# Discord Status Updater

A browser extension that automatically updates your Discord custom status based on your active browser tabs.

## Features

- Automatically updates your Discord status based on the websites you're browsing
- Supports custom URL pattern mapping for personalized status messages
- Allows manual status updates from the popup interface
- Configurable update frequency

## Installation

### Chrome/Edge/Brave

1. Download or clone this repository
2. Open your browser and navigate to `chrome://extensions/`
3. Enable "Developer mode" by toggling the switch in the top-right corner
4. Click "Load unpacked" and select the extension directory
5. The extension icon should now appear in your browser toolbar

### Firefox

1. Download or clone this repository
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on" and select any file in the extension directory
4. The extension icon should now appear in your browser toolbar

## Usage

1. Click on the extension icon in your browser toolbar to open the popup
2. The extension will automatically fetch your Discord token if you have Discord open in a browser tab
3. Configure your custom URL patterns and status messages if desired
4. The extension will automatically update your Discord status based on your active tabs

### Token Management

**Important:** Your Discord token provides full access to your Discord account and is handled securely.

- The extension can automatically fetch your token from an open Discord browser tab
- Your token is stored securely in your browser's local storage and never shared with any third parties
- Manual token entry is also available if automatic detection fails

## Contributing

Contributions are welcome! Here are some tips for contributors:

1. Fork the repository
2. Create a feature branch: `git checkout -b my-new-feature`
3. Make your changes and test thoroughly
4. Commit your changes: `git commit -am 'Add some feature'`
5. Push to the branch: `git push origin my-new-feature`
6. Submit a pull request

### Development Tips

- The extension uses vanilla JavaScript without frameworks
- `background.js` handles the core functionality of monitoring tabs and updating status
- `popup.js` manages the user interface logic
- Use the browser's developer tools to debug - background script logs can be viewed in the extension's management page

### Code Style Guidelines

- Use consistent indentation (2 spaces)
- Add meaningful comments for complex logic
- Follow camelCase naming convention for variables and functions
- Keep functions small and focused on a single responsibility

## License

This project is licensed under the MIT License - see the LICENSE file for details.