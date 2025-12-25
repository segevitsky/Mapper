# Indi Mapper - Chrome Web Store Listing Description

## Short Description (132 characters max)

Developer tool for QA teams: Map UI elements to API network calls. Debug faster, test smarter, document better.

---

## Detailed Description (16000 characters max)

**⚠️ PROFESSIONAL DEVELOPER TOOL - FOR SOFTWARE DEVELOPERS & QA TEAMS ONLY ⚠️**

Indi Mapper is a powerful Chrome DevTools extension designed specifically for software developers, QA engineers, and development teams who need to debug web applications by understanding the relationship between UI interactions and backend API calls.

---

## 🎯 What Problem Does Indi Mapper Solve?

Have you ever wondered:
- "Which API endpoint does this button actually call?"
- "Why did this form submission fail - what was the actual request/response?"
- "How can I quickly reproduce this bug for my developer?"
- "What network calls happen when I click through this user flow?"

As a QA engineer or developer, you spend hours in Chrome DevTools switching between the Elements panel and Network tab, trying to correlate UI actions with API calls. Indi Mapper eliminates this tedious workflow by automatically mapping UI elements to their associated network requests in real-time.

---

## ✨ Core Features

### 1. **Visual API Mapping (Blobi Indicators)**
Create visual indicators directly on web page elements that show:
- Associated API endpoints
- Request/response status (success, error, pending)
- Response time and payload size
- Full request/response details
- Console errors related to the API call

**How it works:**
1. Click "Create Indicator" in the DevTools panel
2. Click any element on the page (button, link, form, etc.)
3. Indi Mapper captures all API calls triggered by that interaction
4. A visual indicator (Blobi) appears on the element showing API status

### 2. **Network Call Interception & Analysis**
Uses Chrome DevTools Protocol (same as Chrome DevTools) to intercept:
- Fetch requests
- XMLHttpRequest (XHR) calls
- GraphQL queries
- REST API endpoints
- Response bodies and headers
- Precise timing information
- Call stack traces

**View detailed information:**
- Request method, URL, headers, body
- Response status, headers, body
- Response time
- Request initiator (which code triggered it)
- Copy as cURL command for easy testing

### 3. **Console Error Tracking**
Automatically captures console errors, warnings, and logs that occur during API calls:
- JavaScript errors
- Network failures
- CORS issues
- API validation errors
- Stack traces

All console output is associated with the relevant API call, making debugging faster.

### 4. **User Flow Recording & Replay**
Record complete user journeys through your application:
- Capture multi-step workflows (login → browse → checkout)
- See all API calls made during the flow
- Replay flows for regression testing
- Document complex user scenarios
- Share flows with team members

**Free tier includes:** 5 flows per domain

### 5. **Jira Integration** (Coming Soon)
Create Jira tickets directly from captured bugs with:
- Screenshots
- API request/response details
- Console errors
- Reproduction steps

### 6. **Export & Share**
- Copy API calls as cURL commands
- Export flow data for documentation
- Share debugging sessions with team members

---

## 🔧 Perfect For These Use Cases

### **QA Engineers:**
- Quickly identify which API endpoint failed during testing
- Create visual documentation of expected vs. actual API behavior
- Record test flows for regression testing
- Reproduce bugs with exact request/response data
- File detailed bug reports with API evidence

### **Frontend Developers:**
- Debug API integration issues
- Understand legacy code by seeing which APIs it calls
- Test error handling by analyzing failed requests
- Optimize performance by identifying slow API calls
- Document API usage for new team members

### **Backend Developers:**
- See exactly how frontend code is calling your APIs
- Debug request payload issues
- Verify API responses in real user scenarios
- Test API changes in the actual application context

### **Full-Stack Developers:**
- End-to-end debugging from UI click to API response
- Rapid prototyping with clear API visibility
- Integration testing across multiple services

### **Development Teams:**
- Onboard new developers faster with visual API documentation
- Create living documentation of application flows
- Improve collaboration between frontend and backend teams
- Standardize debugging workflows

---

## 💡 Real-World Examples

### **Example 1: Debugging a Failed Form Submission**
**Problem:** User reports "Submit Order button doesn't work"

**Traditional approach:**
1. Open Chrome DevTools
2. Go to Network tab
3. Clear network log
4. Fill out form
5. Click submit
6. Search through 50+ network requests to find the right one
7. Switch to Console tab to check for errors
8. Try to remember which request belonged to which button

**With Indi Mapper:**
1. Click "Create Indicator"
2. Click the "Submit Order" button
3. Instantly see: POST /api/orders returned 400 Bad Request
4. View full request body, response, and any console errors
5. Copy as cURL to test the fix
6. Total time: 30 seconds vs. 5+ minutes

### **Example 2: Understanding Legacy Code**
**Problem:** New developer needs to understand which APIs are called during checkout

**With Indi Mapper:**
1. Click "Record Flow"
2. Walk through checkout: Add to cart → Enter shipping → Payment → Confirm
3. See complete timeline of all API calls:
   - POST /api/cart/add
   - GET /api/shipping/calculate
   - POST /api/payment/authorize
   - POST /api/orders/create
   - GET /api/orders/123/confirmation
4. Export flow as documentation for team

### **Example 3: Performance Optimization**
**Problem:** Dashboard loads slowly

**With Indi Mapper:**
1. Create indicators on slow-loading components
2. Instantly see which API calls are taking the longest
3. Identify: GET /api/analytics/dashboard taking 3.2 seconds
4. Optimize that specific endpoint
5. Verify improvement with same indicator

---

## 🔒 Privacy & Security

**We take your privacy seriously:**

✅ **All data stored locally** - Your debugging data never leaves your browser
✅ **No tracking or analytics** - We don't collect usage data
✅ **No server uploads** - Network intercepts are only shown to you
✅ **Transparent permissions** - Clear explanation of why each permission is needed
✅ **Open about limitations** - This is a powerful debugging tool; use responsibly

**Important: This tool is for development/testing environments only. Do not use on production sites you don't own or have permission to debug.**

---

## 🛡️ Permission Justification

Indi Mapper requires elevated permissions because it provides professional debugging functionality. Here's exactly why each permission is necessary:

### **`debugger` Permission** - CRITICAL FOR CORE FUNCTIONALITY
**Why:** To intercept network traffic using Chrome DevTools Protocol (CDP), the same API used by Chrome DevTools itself.

**What it enables:**
- Real-time network request/response capture
- Response body access (not available via standard webRequest API)
- Precise millisecond timing correlation
- Call stack traces
- WebSocket monitoring

**Safety measures:**
- Only activates when you explicitly click "Record" or "Create Indicator"
- Tab-specific - only monitors the tab you're debugging
- Visual indicator shows when active
- Automatically detaches when not in use
- Never runs in background

**Comparable tools using `debugger` permission:**
- Chrome DevTools (official Google tool)
- React Developer Tools (official Facebook/Meta tool)
- Redux DevTools
- Apollo Client DevTools

### **`<all_urls>` Host Permission**
**Why:** Developer tools must work across all development environments.

As a developer, you work on:
- localhost:3000, localhost:8080, 127.0.0.1:5000
- staging.yourcompany.com
- dev.example.com
- test-environment.yourproject.com

Requesting specific domains would require you to manually grant permission for every new project, making the tool impractical.

**Safety:** Tool only monitors pages where you actively create indicators. No passive monitoring.

### **`unlimitedStorage` Permission**
**Why:** Store large API response payloads during debugging.

A single user flow might capture:
- Product catalog API response (500KB)
- Multiple cart operations
- Payment processing logs
- Performance timing data

This easily exceeds Chrome's standard 5MB quota.

**Safety:** All data stored on your local machine. You can delete anytime.

### **`webRequest` Permission**
**Why:** Works with debugger permission to provide comprehensive network monitoring.

### **`desktopCapture` Permission**
**Why:** Optional screen recording feature for creating visual bug reports.
**Usage:** Only when you explicitly start recording. Stored locally.

---

## 🚀 Getting Started

1. **Install Indi Mapper** from Chrome Web Store
2. **Open Chrome DevTools** (F12 or Right-click → Inspect)
3. **Find the "Indi Mapper" tab** in DevTools
4. **Click "Create Indicator"** to start mapping UI elements to APIs
5. **Click any element** on the page to capture its API calls
6. **View the visual indicator** (Blobi) showing API status

**Pro tip:** Start by creating indicators on buttons and forms to understand your application's API flow.

---

## 📋 System Requirements

- Chrome Browser (version 88 or higher)
- Chromium-based browsers (Edge, Brave, Opera) - may work but not officially supported
- Windows, macOS, or Linux

---

## 💼 Pricing

**Free Tier:**
- Unlimited indicator creation
- Full network interception
- Console error tracking
- 5 flows per domain
- All core features

**Indi Mapper Pro** (Coming Soon):
- Unlimited flows
- Team collaboration features
- Advanced Jira integration
- Priority support

---

## 🆘 Support & Resources

**Need Help?**
- Email: segevitsky@gmail.com
- GitHub Issues: (link to your repo if public)
- Documentation: (link if available)

**Feature Requests:**
We're actively developing Indi Mapper. Have an idea? Email us!

---

## ⚠️ Important Notes

1. **For Professional Use Only:** This is a developer tool with powerful debugging capabilities. Only use on applications you own or have permission to debug.

2. **Development Environments:** We recommend installing this extension only on browsers you use for development/testing, not your personal browsing browser.

3. **Sensitive Data:** Be cautious when debugging production applications. Indi Mapper will capture API responses including any sensitive data returned by your APIs.

4. **Performance:** When actively recording, the debugger permission may slightly slow page load times. This is expected behavior and only occurs during active debugging.

5. **Browser Restart:** If you see "Another debugger is attached" message, close and reopen the tab, or disable other debugging extensions.

---

## 🎓 Who Should Use Indi Mapper?

**Perfect for:**
✅ QA Engineers testing web applications
✅ Frontend developers debugging API integrations
✅ Backend developers verifying API usage
✅ Full-stack developers building features
✅ Development teams needing better collaboration tools
✅ Anyone who spends time in Chrome DevTools Network tab

**Not suitable for:**
❌ General web browsing
❌ Non-technical users
❌ Casual internet usage

---

## 🔄 Comparison to Chrome DevTools

**Chrome DevTools Network Tab:**
- Shows all network requests
- Requires manually correlating requests to UI actions
- No visual indicators on page elements
- Doesn't persist across sessions
- No flow recording

**Indi Mapper:**
- Shows only relevant API calls for specific UI elements
- Automatically correlates UI clicks to API requests
- Visual indicators directly on page elements
- Persists indicators and flows for future testing
- Records complete user journeys
- Associates console errors with API calls
- Copy as cURL with one click

**Think of it as:** Chrome DevTools Network tab + automatic UI correlation + visual indicators + flow recording + better developer experience.

---

## 📊 What Makes Indi Mapper Different?

**Other API debugging tools:**
- Postman: Test APIs in isolation (not in application context)
- Chrome DevTools: Manual correlation, no persistence
- Charles Proxy / Fiddler: External tools, complex setup
- React DevTools: Component-focused, not API-focused

**Indi Mapper:**
- In-browser, no external tools needed
- Automatic UI-to-API correlation
- Visual indicators on actual page elements
- Works with any web framework (React, Vue, Angular, vanilla JS)
- Persistent debugging data
- Built specifically for QA and development workflows

---

## 🏗️ Technical Implementation

Indi Mapper is built with:
- **Chrome Extension Manifest V3** (latest standard)
- **Chrome DevTools Protocol** for network interception
- **TypeScript** for type safety
- **React** for UI components
- **Local Storage API** for data persistence

**Architecture:**
- Background service worker handles network interception
- Content script manages visual indicators
- DevTools panel provides debugging interface
- All processing happens locally in your browser

---

## 🔮 Roadmap

**Coming Soon:**
- Jira integration for bug reporting
- Export flows as documentation
- Team sharing and collaboration
- Performance analytics
- GraphQL query analysis
- API mocking and testing
- Automated regression testing

**Have suggestions?** We'd love to hear from you: segevitsky@gmail.com

---

## 📝 Version History

**v1.1.0** (Current)
- Added console error tracking
- Improved performance with tab visibility optimization
- Added copy as cURL functionality
- Flow limit (5 flows per domain on free tier)
- Upgrade interest collection for Pro version

**v1.0.0**
- Initial release
- Core indicator creation
- Network interception
- DevTools panel
- Flow recording

---

## 🙏 Thank You

Thank you for considering Indi Mapper for your development workflow. We built this tool because we experienced the same frustrations you face every day: trying to debug complex web applications, correlate UI actions with API calls, and communicate bugs effectively to team members.

We're committed to making Indi Mapper the best developer debugging tool available. Your feedback helps us improve.

**Install Indi Mapper today and debug faster, test smarter, and ship better software.**

---

**Keywords:** developer tools, API debugging, network debugging, QA testing, web development, Chrome DevTools, API mapping, network interception, debugging tool, developer productivity, testing tools, bug reporting, API monitoring, frontend development, backend development

**Category:** Developer Tools

**Target Audience:** Software Developers, QA Engineers, DevOps Teams, Full-Stack Developers

**Contact:** segevitsky@gmail.com
**Version:** 1.1.0
**Extension Name:** Indi Mapper - Developer Tool

---

*This is a professional developer tool. Use responsibly and only on applications you own or have permission to debug. See Privacy Policy for details on data handling and permissions.*
