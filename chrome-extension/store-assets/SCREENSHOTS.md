# Chrome Web Store Screenshots - OpenClaw Chat Bridge

## Screenshot Requirements

### Chrome Web Store Specifications
- **Minimum:** 1280x800 pixels (16:10 aspect ratio)  
- **Alternative:** 640x400 pixels (16:10 aspect ratio)
- **Format:** PNG or JPEG
- **Maximum file size:** 16MB per image
- **Maximum count:** 5 screenshots
- **Color space:** sRGB

## Required Screenshots

### 1. Pairing Wizard Screen *(Priority: High)*
**Filename:** `01-pairing-wizard.png`
**Dimensions:** 1280x800 px
**Content:**
- Show the step-by-step pairing wizard interface
- Include relay server selection (Hosted/Custom options)
- Display pairing code input field
- Show clear "Connect" or "Pair" button
- Include friendly explanatory text
- Demonstrate the clean, user-friendly setup process

**UI Elements to Capture:**
- Extension popup or full-screen pairing interface
- Radio buttons for relay server selection
- Input field for pairing code
- Status indicators (connection progress)
- Help text explaining the process

### 2. Main Chat Interface *(Priority: High)*
**Filename:** `02-main-chat-ui.png`  
**Dimensions:** 1280x800 px
**Content:**
- Show active conversation with an AI agent
- Display message history (both user and agent messages)
- Include message input field and send button
- Show connection status indicator (online/connected)
- Demonstrate clean, readable chat formatting
- Include timestamp indicators

**UI Elements to Capture:**
- Message bubbles with clear sender identification
- Input field at bottom with send button
- Scroll area with conversation history
- Connection status indicator
- Agent name/identifier clearly visible

### 3. Agent List and Multi-Agent Management *(Priority: High)*
**Filename:** `03-agent-list.png`
**Dimensions:** 1280x800 px  
**Content:**
- Show list of available/connected agents
- Display online/offline status for each agent
- Include "Add Agent" or connection management buttons
- Show agent names and connection details
- Demonstrate multi-agent capability

**UI Elements to Capture:**
- List view of multiple agents
- Status indicators (green for online, gray for offline)
- Agent management buttons (connect/disconnect)
- Clear navigation between different agents
- Connection health indicators

### 4. Extension Popup Overview *(Priority: Medium)*
**Filename:** `04-popup-overview.png`
**Dimensions:** 1280x800 px
**Content:**
- Show the extension popup interface
- Display quick agent status overview
- Include access to main features (chat, settings)
- Show notification badges or activity indicators
- Demonstrate compact, efficient design

**UI Elements to Capture:**
- Chrome extension popup (expanded view for screenshot)
- Quick action buttons
- Agent status summary
- Settings/configuration access
- Clean, minimal design elements

### 5. Settings and Configuration *(Priority: Low)*
**Filename:** `05-settings-config.png`
**Dimensions:** 1280x800 px
**Content:**
- Show configuration options and settings
- Include relay server management
- Display data management options (clear data, etc.)
- Show privacy and security settings
- Demonstrate advanced user controls

**UI Elements to Capture:**
- Settings panel or page
- Configuration options clearly labeled
- Privacy controls
- Data management options
- Save/apply buttons

## Screenshot Creation Guidelines

### Visual Quality
- **High DPI:** Capture on high-resolution displays when possible
- **Clear Text:** Ensure all text is crisp and readable
- **Good Lighting:** Use consistent, professional lighting in UI
- **No Clutter:** Keep browser UI clean, close unnecessary tabs

### Content Guidelines
- **Use Realistic Data:** Include believable example conversations
- **Avoid Personal Info:** No real names, emails, or sensitive data
- **Professional Language:** Keep example messages appropriate and professional
- **Consistent Branding:** Maintain consistent visual style across screenshots

### Browser Setup
- **Clean Browser:** Remove bookmarks bar, unnecessary extensions
- **Standard Zoom:** Use 100% browser zoom level
- **Consistent Window Size:** Maintain consistent browser window dimensions
- **Chrome Theme:** Use default Chrome theme for consistency

## Sample Content for Screenshots

### Example Chat Messages
```
Agent: Hello! I'm ready to help you with your tasks today. What would you like to work on?

User: Can you help me write a summary of the latest project status?

Agent: Of course! I'd be happy to help you create a project status summary. To get started, could you tell me:
1. What project are we summarizing?
2. What time period should the summary cover?
3. Are there specific areas you'd like me to focus on?

User: It's the web redesign project, covering the last two weeks. Focus on progress and any blockers.
```

### Example Agent Names
- "ProjectAssist Pro"
- "DevHelper Assistant" 
- "Research Companion"
- "Writing Assistant"

## File Organization

```
store-assets/
├── screenshots/
│   ├── 01-pairing-wizard.png      (1280x800)
│   ├── 02-main-chat-ui.png        (1280x800)
│   ├── 03-agent-list.png          (1280x800)
│   ├── 04-popup-overview.png      (1280x800)
│   └── 05-settings-config.png     (1280x800)
├── icon/
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-48.png
│   ├── icon-128.png
│   └── icon-512.png
└── SCREENSHOTS.md                  (this file)
```

## Next Steps

1. **Complete Extension Development:** Ensure all UI screens are functional and polished
2. **Set Up Test Environment:** Create test agents and sample data for screenshots
3. **Capture Screenshots:** Follow the guidelines above to create all 5 required images
4. **Review and Optimize:** Check image quality, file sizes, and visual consistency
5. **Upload to Chrome Web Store:** Include screenshots in extension listing

## Notes

- Screenshots will be created after extension testing is complete
- Actual UI may vary slightly from these specifications based on final implementation
- All screenshots should showcase the extension's key value propositions
- Focus on demonstrating ease of use and powerful multi-agent capabilities

---

**Status:** Ready for screenshot creation phase (pending extension testing completion)