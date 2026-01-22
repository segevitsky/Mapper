# Privacy Policy for Indi Mapper

**Last Updated:** December 18, 2024

## Overview
Indi Mapper is a developer tool designed for software developers and QA teams to debug web applications by mapping UI elements to API network calls.

## What Data We Collect

### 1. Network Traffic Data (Local Storage Only)
- **What:** API endpoints, request/response data, timing information, console logs
- **Why:** To map UI interactions to API calls for debugging
- **Storage:** Stored locally in your browser using Chrome's storage API
- **Retention:** Until you manually delete flows or clear extension data
- **Sharing:** Never shared with anyone

### 2. User Flows (Local Storage Only)
- **What:** Recorded sequences of user interactions and associated API calls
- **Why:** To replay and test user workflows
- **Storage:** Stored locally in your browser
- **Retention:** Until you manually delete flows (max 5 flows per domain on free plan)
- **Sharing:** Never shared with anyone

### 3. Email Address (Optional - Only for Upgrade Interest)
- **What:** Your email address if you express interest in Indi Mapper Pro
- **Why:** To notify you when premium features become available
- **Storage:** Sent to our notification service (Web3Forms)
- **Retention:** Until you request deletion or product launch
- **Sharing:** Not shared with third parties
- **Opt-out:** You can request deletion by emailing segevitsky@gmail.com

## What Data We DO NOT Collect

- ❌ Browsing history
- ❌ Personal information from websites you visit
- ❌ Passwords or sensitive form data
- ❌ Credit card information
- ❌ Analytics or tracking data
- ❌ User accounts or authentication data

## How We Use Data

1. **Network Interception:** We use Chrome's debugger API to intercept network requests **only** to display them to you for debugging purposes.
2. **Local Processing:** All data processing happens locally in your browser.
3. **No Server Upload:** Your captured network data and flows are **never** sent to our servers.
4. **Console Monitoring:** We capture console logs (errors, warnings, etc.) for debugging - all stored locally.

## Third-Party Services

### Web3Forms
- **Purpose:** Email collection for product updates (only if you opt-in for upgrade notifications)
- **Data:** Email address, domain name, timestamp
- **Privacy Policy:** https://web3forms.com/privacy

## Required Permissions Explained

### `debugger` Permission ⚠️
**Why:** Core functionality - intercepts network traffic to map API calls to UI elements. This is the same permission used by Chrome DevTools.

**Usage:** Only active when you explicitly start recording or create indicators. Never runs in background without your action.

**Important:** This is a powerful permission. We use it exclusively for network monitoring to help you debug. We recommend only installing this extension on development/testing browsers.

### `<all_urls>` Host Permission
**Why:** Developer tool must work on any website during development/testing (localhost, staging, production environments).

**Usage:** Only monitors pages where you actively use the tool. Does not track or monitor websites you're not debugging.

### `storage` & `unlimitedStorage`
**Why:** Store your flows, indicators, and captured network data locally in your browser.

**Usage:** All data stays on your device. We use unlimited storage to ensure large network payloads can be saved for debugging.

### `desktopCapture`
**Why:** Optional screen recording feature for creating bug reports with video.

**Usage:** Only activates when you explicitly start screen recording. Recordings are stored locally.

### `webRequest`
**Why:** Monitor network activity for API mapping.

**Usage:** Works in conjunction with debugger permission for comprehensive network analysis.

## Your Rights

You have the right to:
- **Access:** View all data stored by the extension in Chrome DevTools → Application → Storage → Extension
- **Delete:** Remove all data by uninstalling the extension or using Chrome's "Clear extension data" option
- **Opt-out:** Don't provide email for upgrade notifications
- **Request deletion:** Email segevitsky@gmail.com to delete any upgrade interest data we have

## Data Security

- All local data is protected by Chrome's built-in storage encryption
- No sensitive data (passwords, credit cards, authentication tokens) is ever stored
- Debugger permission is only used for intended network monitoring
- We never transmit your debugging data to our servers

## Children's Privacy

Indi Mapper is a developer tool not intended for use by children under 13.

## Changes to This Policy

We will update this policy as needed. Check the "Last Updated" date at the top. Continued use after changes constitutes acceptance of the new policy.

## Contact Us

Questions about privacy?
- Email: segevitsky@gmail.com

## Developer Transparency

**This is a developer tool for professionals.** We are transparent about our permissions:

- The `debugger` permission is **required** for our core functionality - intercepting network calls to map them to UI elements
- This is the **same permission** used by Chrome DevTools, React DevTools, and Redux DevTools
- We do **not** use it for tracking, analytics, data collection, or any purpose other than displaying network data to you for debugging

### Recommendations for Users:
1. Only install on developer/testing browsers (not your personal browsing browser)
2. Disable or remove when not actively debugging
3. Review what data is being stored using Chrome DevTools
4. Only use on applications you own or have permission to debug

---

**By installing and using Indi Mapper, you agree to this Privacy Policy.**
