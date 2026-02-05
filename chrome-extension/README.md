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

## Quick Start

### Development

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
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

### Production Build

```bash
npm run build
npm run package
```

This creates `openclaw-chrome-bridge.zip` ready for Chrome Web Store.

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