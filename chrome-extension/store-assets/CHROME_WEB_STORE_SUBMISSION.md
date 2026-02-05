# Chrome Web Store Submission Checklist

## Prerequisites
- [ ] Google Developer Account ($5 one-time fee)
  - Sign up at: https://chrome.google.com/webstore/devconsole

## Required Assets

### 1. Extension Package ✅
- [x] `openclaw-chrome-bridge-v0.1.0.zip` (33KB)
- Located in: `chrome-extension/`

### 2. Store Listing Text ✅
- [x] Extension name: "OpenClaw Chat Bridge"
- [x] Short description (132 chars): "Connect to AI agents through a secure relay"
- [x] Detailed description: See `STORE_LISTING.md`
- [x] Category: Productivity
- [x] Language: English

### 3. Privacy Policy ✅
- [x] Privacy policy document: `PRIVACY_POLICY.md`
- [ ] Host privacy policy at public URL (required for submission)
  - Option A: GitHub Pages (free)
  - Option B: Project website
  - Option C: Raw GitHub link

### 4. Screenshots (NEEDED)
Required: At least 1-5 screenshots (1280x800 or 640x400)

- [ ] Screenshot 1: Popup view showing connected agent
- [ ] Screenshot 2: Side panel chat interface
- [ ] Screenshot 3: Pairing wizard
- [ ] Screenshot 4: Multi-agent view (if applicable)

**To create screenshots:**
1. Load the extension in Chrome
2. Use Chrome DevTools device mode for consistent sizing
3. Or use a screenshot tool at 1280x800 resolution

### 5. Promotional Images (OPTIONAL but recommended)

- [ ] Small promo tile: 440x280 PNG
- [ ] Large promo tile: 920x680 PNG (for featured placement)
- [ ] Marquee promo tile: 1400x560 PNG (for top placement)

### 6. Icon Assets ✅
- [x] 128x128 PNG icon (in extension package)

---

## Submission Steps

### Step 1: Create Developer Account
1. Go to https://chrome.google.com/webstore/devconsole
2. Sign in with Google account (gertron88@gmail.com)
3. Pay $5 registration fee
4. Agree to developer agreement

### Step 2: Upload Extension
1. Click "New Item"
2. Upload `openclaw-chrome-bridge-v0.1.0.zip`
3. Wait for automated checks

### Step 3: Fill Store Listing
1. **Product details tab:**
   - Name: OpenClaw Chat Bridge
   - Summary: Connect to AI agents through a secure relay
   - Description: (copy from STORE_LISTING.md)
   - Category: Productivity
   - Language: English

2. **Graphic assets tab:**
   - Upload screenshots
   - Upload promotional images (optional)

3. **Privacy practices tab:**
   - Single purpose description: "Enables real-time chat communication with AI agents through WebSocket relay servers"
   - Host permissions justification: "Required to connect to relay servers for agent communication"
   - Data usage declarations:
     - ✓ Stores authentication tokens locally
     - ✓ Uses Chrome sync for settings
     - ✗ Does not collect analytics
     - ✗ Does not track users
   - Privacy policy URL: [need to set up]

### Step 4: Submit for Review
1. Review all sections show green checkmarks
2. Click "Submit for review"
3. Wait 1-3 business days for review

---

## Post-Submission

### If Rejected
- Read rejection reason carefully
- Common issues:
  - Missing privacy policy URL
  - Insufficient permission justification
  - Screenshots don't match functionality
- Fix issues and resubmit

### If Approved
- Extension goes live immediately
- Share link: `https://chrome.google.com/webstore/detail/[extension-id]`
- Monitor reviews and respond to users

---

## Quick Commands

**Rebuild extension:**
```bash
cd chrome-extension
npm run build
```

**Create new zip package:**
```powershell
Compress-Archive -Path "dist\*" -DestinationPath "openclaw-chrome-bridge-v0.1.0.zip" -Force
```

---

## Timeline Estimate
- Developer account setup: 5 minutes
- Asset preparation: 30 minutes (screenshots)
- Form filling: 15 minutes
- Review period: 1-3 business days
- **Total to live: ~2-4 days**
