# OpenClaw Chrome Bridge Extension

Chrome Extension (Manifest V3) for connecting to OpenClaw/Clawdbot agents via relay servers.

## Features

- **Multi-Agent Support**: Connect to multiple OpenClaw agents simultaneously
- **Real-time Chat**: WebSocket-based real-time communication
- **Local Scrollback**: 24-hour chat history stored locally with automatic cleanup
- **Chrome Sync**: Tokens and device IDs sync across Chrome profiles
- **Pairing Wizard**: Step-by-step pairing with hosted or custom relay servers
- **Connection Management**: Automatic reconnection and health monitoring
- **Responsive UI**: Works as popup, side panel, or full tab

## Installation

### For Users (Recommended)

**Chrome Web Store:** [Link will be available after publication]

1. Visit the Chrome Web Store listing for "OpenClaw Chat Bridge"
2. Click "Add to Chrome" 
3. Confirm installation when prompted
4. The extension icon will appear in your Chrome toolbar
5. Click the icon to start the pairing wizard

### For Developers

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build extension:**
   ```bash
   npm run build
   ```

3. **Load in Chrome:**
   - Open Chrome Extensions (chrome://extensions/)
   - Enable "Developer mode" (toggle in top-right)
   - Click "Load unpacked"
   - Select the `dist` folder

### Production Build

```bash
npm run build
npm run package
```

This creates `openclaw-chrome-bridge.zip` ready for Chrome Web Store.

## Usage Guide

### Initial Setup

#### Step 1: Launch the Extension
- Click the OpenClaw Chat Bridge icon in your Chrome toolbar
- If this is your first time, the pairing wizard will automatically open
- Alternatively, right-click the icon and select "Open Pairing Wizard"

#### Step 2: Choose Relay Server
- **Hosted Relay (Recommended):** Uses official OpenClaw relay servers
  - Select "Hosted Relay" option
  - No additional configuration needed
- **Custom Relay:** For self-hosted or organization-specific relay servers
  - Select "Custom Relay" option
  - Enter your relay server URL (e.g., `wss://relay.yourcompany.com`)

#### Step 3: Pair with Agent
- Obtain a pairing code from your AI agent service or administrator
- Enter the pairing code in the provided field
- Click "Connect" to establish the connection
- Wait for confirmation (green checkmark indicates success)

### Chatting with Agents

#### Single Agent Chat
1. **Access Chat Interface:**
   - Click the extension icon and select "Open Chat"
   - Or use the side panel option (if enabled)
   - Or open in a full tab for extended conversations

2. **Start Conversation:**
   - Type your message in the input field at the bottom
   - Press Enter or click Send to send your message
   - Agent responses appear in real-time

3. **Chat Features:**
   - **Message History:** 24 hours of local chat history
   - **Connection Status:** Green indicator shows active connection
   - **Auto-Reconnect:** Automatically reconnects if connection drops
   - **Typing Indicators:** See when agents are responding

#### Multi-Agent Management

1. **Add Additional Agents:**
   - Click the "+" button or "Add Agent" option
   - Follow the pairing wizard for each new agent
   - Each agent requires its own pairing code

2. **Switch Between Agents:**
   - Use the agent list/tabs in the chat interface
   - Click on different agent names to switch conversations
   - Each agent maintains its own conversation thread

3. **Manage Connections:**
   - View agent status (online/offline) in the agent list
   - Disconnect specific agents through settings
   - Reconnect agents if connections are lost

### Interface Options

#### Extension Popup
- **Quick Access:** Click toolbar icon for compact interface
- **Agent Overview:** See all connected agents and their status
- **Quick Actions:** Access main features without opening full interface

#### Side Panel (Chrome 114+)
- **Persistent Chat:** Keep chat open while browsing other tabs
- **Easy Access:** Always visible on the side of your browser
- **Enable:** Right-click extension icon → "Open Side Panel"

#### Full Tab Mode
- **Extended Conversations:** Open chat in a dedicated browser tab
- **Maximum Space:** Full screen real estate for complex interactions
- **Multi-Window:** Open multiple tabs for different agents

### Advanced Features

#### Connection Management
- **Health Monitoring:** Automatic connection health checks
- **Retry Logic:** Smart reconnection with exponential backoff
- **Status Notifications:** Desktop notifications for connection events
- **Manual Reconnect:** Force reconnection through settings menu

#### Data Management
- **Local Storage:** All data stored locally in Chrome
- **Chrome Sync:** Settings sync across your Chrome browsers (optional)
- **Data Export:** Export conversation history when needed
- **Privacy Controls:** Clear data anytime through extension settings

#### Troubleshooting
1. **Connection Issues:**
   - Check internet connectivity
   - Verify relay server status
   - Try reconnecting through settings
   - Clear extension data and re-pair if needed

2. **Pairing Problems:**
   - Ensure pairing code is correct and not expired
   - Check relay server URL (for custom relays)
   - Verify agent service is online
   - Contact your system administrator for organization relays

3. **Performance Issues:**
   - Clear old chat history
   - Restart Chrome browser
   - Disable/re-enable extension
   - Check Chrome's extension memory usage

### Best Practices

#### Security
- **Use HTTPS/WSS:** Only connect to secure relay servers
- **Regular Updates:** Keep extension updated for security patches
- **Token Management:** Let extension handle token refresh automatically
- **Private Browsing:** Extension data not available in incognito mode

#### Productivity
- **Multiple Agents:** Connect specialized agents for different tasks
- **Organized Conversations:** Use different agents for different topics
- **Quick Access:** Pin extension icon for easy access
- **Keyboard Shortcuts:** Use Enter to send, Shift+Enter for new line

## Project Structure

```
chrome-extension/
├── src/
│   ├── background/
│   │   ├── service-worker.ts     # Background service worker
│   │   ├── auth.ts              # Authentication & token management
│   │   └── connection.ts        # WebSocket connection management
│   ├── popup/
│   │   ├── popup.html           # Extension popup UI
│   │   ├── popup.ts             # Popup logic
│   │   └── popup.css            # Popup styling
│   ├── pairing/
│   │   ├── pairing.html         # Pairing wizard UI
│   │   ├── pairing.ts           # Pairing logic
│   │   └── pairing.css          # Pairing styling
│   ├── chat/
│   │   ├── chat.html            # Chat interface UI
│   │   ├── chat.ts              # Chat logic
│   │   └── chat.css             # Chat styling
│   ├── lib/
│   │   ├── storage.ts           # Chrome storage helpers
│   │   └── protocol.ts          # Message protocol & validation
│   ├── types.ts                 # TypeScript type definitions
│   └── icons/                   # Extension icons
├── manifest.json                # Chrome extension manifest
├── package.json                 # Dependencies & build scripts
├── tsconfig.json               # TypeScript configuration
├── webpack.config.js           # Build configuration
└── README.md                   # This file
```

## Architecture

### Background Service Worker
- **Connection Management**: Maintains WebSocket connections to relay servers
- **Message Routing**: Routes messages between UI and agents
- **Auth Handling**: Manages token refresh and authentication
- **Health Monitoring**: Periodic connection health checks and reconnection

### Storage Strategy
- **chrome.storage.sync**: Auth tokens, agent configs, device IDs (syncs across devices)
- **chrome.storage.session**: Chat messages, scrollback (expires after 24h or browser close)
- **Automatic Cleanup**: Background alarms clean expired data

### Real-time Protocol
- **WebSocket Transport**: Persistent connections to relay servers
- **Message Correlation**: Request/response matching with unique IDs
- **Presence Updates**: Real-time agent online/offline status
- **Error Handling**: Graceful degradation and retry logic

### UI Components
1. **Popup**: Quick agent overview and actions
2. **Pairing Wizard**: Step-by-step agent pairing flow
3. **Chat Interface**: Full-featured chat with multi-agent support

## Configuration

### Relay Modes
- **Hosted**: Official OpenClaw relay service (default)
- **Custom**: Self-hosted relay server

### Permissions
- `storage`: Local data storage
- `alarms`: Periodic cleanup and health checks
- `sidePanel`: Side panel chat interface
- Host permissions for relay communication

## Development

### Build Scripts
- `npm run dev`: Development build with watch mode
- `npm run build`: Production build
- `npm run clean`: Clean build artifacts
- `npm run package`: Create distribution zip

### Key Technologies
- **TypeScript**: Type-safe development
- **Webpack**: Module bundling and asset processing
- **Zod**: Runtime type validation
- **Chrome Extensions Manifest V3**: Modern extension platform

## Troubleshooting

### Common Issues
1. **Connection Failed**: Check relay URL and network connectivity
2. **Pairing Failed**: Verify pairing code and expiry time
3. **Messages Not Syncing**: Check WebSocket connection status
4. **Storage Issues**: Clear extension data and re-pair

### Debug Tools
- Chrome DevTools: Inspect extension pages
- Background Scripts: Check service worker logs
- Extension Storage: chrome://extensions → Details → "Inspect views"

## Security

- **Token Storage**: Refresh tokens encrypted in Chrome Sync
- **Message Validation**: All messages validated with Zod schemas
- **Rate Limiting**: Built-in protection against message flooding
- **Secure Transport**: HTTPS/WSS only for production

## Contributing

1. Follow TypeScript best practices
2. Use provided type definitions
3. Test all UI states (connected/disconnected/error)
4. Validate message handling edge cases
5. Test on multiple screen sizes