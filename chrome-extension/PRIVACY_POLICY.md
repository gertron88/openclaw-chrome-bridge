# Privacy Policy - OpenClaw Chat Bridge

**Last updated:** February 5, 2026

## Overview

OpenClaw Chat Bridge is designed with privacy as a core principle. This extension facilitates communication between you and AI agents through relay servers while minimizing data collection and maximizing your control over your information.

## Data We Collect

### Minimal Required Data
We collect only the essential data necessary for the extension to function:

- **Pairing Tokens**: Secure tokens used to authenticate with relay servers
  - Purpose: Enable connection to your authorized AI agents
  - Storage: Encrypted locally in Chrome storage with sync capability
  - Retention: Until manually disconnected or tokens expire

- **Device Identifiers**: Anonymous device IDs for connection management
  - Purpose: Distinguish your browser sessions for proper message routing
  - Storage: Local Chrome storage
  - Retention: Until extension is uninstalled or data is cleared

- **Relay Server Configurations**: URLs and connection settings for relay servers
  - Purpose: Establish connections to your chosen AI agent services
  - Storage: Local Chrome storage with sync capability
  - Retention: Until manually removed by user

- **Connection Metadata**: Basic connection status and health information
  - Purpose: Maintain stable connections and handle reconnections
  - Storage: Local Chrome session storage (temporary)
  - Retention: Session-based, cleared when browser is closed

## Data We Do NOT Collect

We are committed to protecting your privacy by **NOT collecting**:

- ❌ **Chat Messages or Transcripts**: Your conversations are never stored on our servers
- ❌ **Personal Information**: No names, email addresses, or personal identifiers
- ❌ **Browsing History**: No tracking of websites you visit
- ❌ **Usage Analytics**: No detailed usage statistics or behavioral tracking
- ❌ **Audio or Visual Data**: No access to microphone, camera, or media
- ❌ **File Contents**: No access to your local files or documents

## How Data Is Stored

### Local Storage
- **Primary Location**: All user data is stored locally in your Chrome browser
- **Chrome Storage API**: Uses Chrome's built-in storage system for security
- **Encryption**: Sensitive tokens are encrypted before storage
- **User Control**: You can clear all data through Chrome's extension management

### Chrome Sync (Optional)
- **What Syncs**: Only pairing tokens and relay configurations (not chat messages)
- **Purpose**: Seamless experience across your Chrome browsers
- **Control**: Can be disabled through Chrome sync settings
- **Security**: Encrypted by Chrome's sync infrastructure

### Relay Server Interaction
- **Message Routing**: Messages pass through relay servers but are not stored
- **Token Exchange**: Only authentication tokens are transmitted
- **No Persistence**: Relay servers do not retain conversation data
- **Transport Security**: All communication uses HTTPS/WSS encryption

## Data Processing and Sharing

### No Data Sharing
We do not:
- Sell your data to third parties
- Share your information with advertisers
- Provide data to analytics companies
- Transfer data for marketing purposes

### Service Providers
The only data processing occurs:
- **Locally**: In your Chrome browser
- **In Transit**: Through encrypted relay servers for message routing
- **With AI Agents**: Direct communication as you initiate

### Legal Requirements
We may disclose information only if required by law, but given our minimal data collection, there is typically nothing to disclose.

## Your Rights and Control

### Data Access
- All your data is stored locally and accessible through Chrome's extension management
- You can view stored tokens and configurations at any time

### Data Deletion
- **Individual Agents**: Disconnect specific agents through the extension UI
- **All Data**: Clear all extension data through Chrome settings
- **Automatic Cleanup**: Chat history automatically expires after 24 hours

### Data Portability
- Pairing tokens and configurations can be manually exported
- No vendor lock-in - you can switch to alternative clients

## Security Measures

### Technical Safeguards
- **Encryption**: All sensitive data encrypted at rest and in transit
- **Token Security**: Short-lived tokens with automatic refresh
- **Network Security**: HTTPS/WSS only for all communications
- **Chrome Security**: Leverages Chrome's built-in security features

### Privacy by Design
- **Data Minimization**: Only collect what's absolutely necessary
- **Local Processing**: Keep data on your device whenever possible
- **No Tracking**: No user behavior tracking or profiling
- **Transparent Operations**: Open source for code review

## Third-Party Services

### AI Agent Services
- Your conversations are with AI agents you choose to connect to
- Each AI service has its own privacy policy governing how they handle messages
- We recommend reviewing the privacy policies of AI services you use

### Relay Servers
- Messages pass through relay servers for technical routing
- Relay servers do not store or log conversation content
- Self-hosted relay options available for maximum privacy control

## Children's Privacy

This extension is not intended for children under 13. We do not knowingly collect information from children under 13.

## Changes to This Policy

We may update this privacy policy to reflect changes in our practices or legal requirements. Updates will be posted with the extension update and on our documentation website.

## Contact Information

For privacy questions or concerns:

**Support:** https://github.com/gertron88/openclaw-chrome-bridge/issues
**Email:** gertron88@gmail.com
**Documentation:** https://github.com/gertron88/openclaw-chrome-bridge

## Compliance

This privacy policy is designed to comply with:
- General Data Protection Regulation (GDPR)
- California Consumer Privacy Act (CCPA)
- Chrome Web Store Privacy Requirements

---

*This privacy policy reflects our commitment to protecting your privacy while providing powerful AI communication capabilities.*