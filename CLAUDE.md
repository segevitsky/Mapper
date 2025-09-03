# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is "Indi - Mapper", a Chrome browser extension (Manifest V3) that maps UI elements to API calls for debugging and development purposes. The extension intercepts network requests, allows users to associate them with page elements, and provides visual indicators showing API call status.

## Development Commands

```bash
# Install dependencies
npm install

# Development mode with hot reload
npm run dev

# Build the extension for production
npm run build

# Lint the code
npm run lint

# Preview the built extension
npm run preview
```

## Extension Architecture

### Core Components

The extension follows the standard Chrome extension architecture with these key parts:

- **Background Script** (`src/background/background.ts`): Service worker that handles network interception using Chrome debugger API
- **Content Script** (`src/content/content.ts`): Injected into web pages to handle UI interactions and element detection
- **DevTools Panel** (`src/panel/`): React-based UI for managing mappings and viewing network calls
- **Floating Window** (`src/indicatorFloatingWindow/`): Standalone window for displaying API indicators

### Key Directories

- `src/background/` - Background service worker logic
- `src/content/` - Content script and related services
- `src/panel/` - DevTools panel React application
- `src/indicatorFloatingWindow/` - Floating window React application
- `src/services/` - Shared services (Firebase, Jira integration)
- `src/types/` - TypeScript type definitions
- `src/utils/` - Utility functions

### Build Configuration

The project uses Vite for building with custom configuration in `vite.config.ts`:
- Multiple entry points for different extension components
- Source maps enabled for debugging
- Custom output naming for Chrome extension compatibility

### Key Data Types

- `IndicatorData`: Core data structure for API-to-element mappings
- `NetworkCall`: Represents intercepted network requests
- `ApiMapping`: Links UI elements to API endpoints

### State Management

- Uses Chrome storage API for persistence
- React hooks for component state (`useNetworkCalls`, `useMappings`)
- Background-content script communication via Chrome runtime messaging

### Development Notes

- Extension requires debugging permissions to intercept network traffic
- Uses Chrome debugger API for network monitoring
- Firebase integration for data persistence
- Jira integration for ticket creation
- TypeScript with strict mode enabled
- ESLint for code quality

### Extension Permissions

The extension requires extensive permissions including:
- `debugger` - For network interception
- `storage` - For local data persistence
- `activeTab`, `tabs` - For tab management
- `webRequest` - For request monitoring
- `<all_urls>` - For operation on any website

### Testing

No specific test commands are configured. Manual testing is done by loading the extension in Chrome developer mode after building.