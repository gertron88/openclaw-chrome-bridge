# OpenClaw Chrome Bridge - Installation Guide

## Quick Install (Sideloading for Hackathon/Testing)

### Step 1: Download
Download the latest release: `openclaw-chrome-bridge-v0.1.0.zip`

**From GitHub Releases:**
```
https://github.com/gertron88/openclaw-chrome-bridge/releases
```

### Step 2: Extract
1. Unzip the downloaded file to a folder you'll keep (e.g., `Documents/openclaw-chrome-bridge`)
2. You should see files like: `manifest.json`, `popup.html`, `service-worker.js`, etc.

### Step 3: Load in Chrome
1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **"Load unpacked"**
4. Select the folder where you extracted the files
5. The extension should appear with the OpenClaw icon

### Step 4: Pair with Your Agent
1. Click the extension icon in Chrome toolbar
2. Click **"Add Agent"** or **"Pair"**
3. Enter the pairing code provided by your agent/relay server
4. Once connected, you'll see a green status indicator

---

## Chrome Web Store (Coming Soon)
Once published, installation will be one-click:
1. Visit the Chrome Web Store listing
2. Click **"Add to Chrome"**
3. Done!

---

## Troubleshooting

### "Failed to load extension" Error
- Make sure you selected the folder containing `manifest.json`
- Check that all files were extracted properly

### Extension Not Appearing
- Refresh the `chrome://extensions` page
- Make sure Developer mode is enabled

### Connection Issues
- Verify your pairing code is correct
- Check that the relay server is running
- Ensure you have internet connectivity

---

## For Developers

### Building from Source
```bash
cd chrome-extension
npm install
npm run build
```
Built files will be in the `dist/` folder.

### Development Mode
```bash
npm run dev
```
Watches for changes and rebuilds automatically.
