// Element Identification - Playwright-level robust element locators

import { ElementFingerprint, Locator } from '../../types/flow';

/**
 * ElementIdentifier - Generates multiple locator strategies for bulletproof element finding
 */
export class ElementIdentifier {

  /**
   * THE CRITICAL FUNCTION - Generate multiple locator strategies for an element
   * This is what makes or breaks flow replay reliability
   */
  static captureElement(element: HTMLElement): ElementFingerprint {
    const locators: Locator[] = [];

    // STRATEGY 1: ARIA Role + Name (BEST - 10/10 confidence)
    const role = element.getAttribute('role') || this.getImplicitRole(element);
    const ariaLabel = element.getAttribute('aria-label');
    const ariaLabelledBy = element.getAttribute('aria-labelledby');

    if (role) {
      if (ariaLabel) {
        locators.push({
          priority: 1,
          strategy: 'role-with-name',
          selector: `role=${role}[name="${ariaLabel}"]`,
          confidence: 10
        });
      }

      const textContent = element.textContent?.trim();
      if (textContent && textContent.length < 100) {
        locators.push({
          priority: 2,
          strategy: 'role-with-text',
          selector: `role=${role}[text="${textContent}"]`,
          confidence: 9
        });
      }
    }

    // STRATEGY 2: Test IDs (9/10 confidence)
    if (element.dataset.testid) {
      locators.push({
        priority: 3,
        strategy: 'data-testid',
        selector: `[data-testid="${element.dataset.testid}"]`,
        confidence: 9
      });
    }

    // Check other common test ID patterns
    const testIdAttrs = ['data-test', 'data-test-id', 'data-cy', 'data-qa'];
    for (const attr of testIdAttrs) {
      const value = element.getAttribute(attr);
      if (value) {
        locators.push({
          priority: 3,
          strategy: `test-id-${attr}`,
          selector: `[${attr}="${value}"]`,
          confidence: 9
        });
      }
    }

    // STRATEGY 3: Stable ID (8/10 confidence if not dynamic)
    if (element.id && !this.isDynamicId(element.id)) {
      locators.push({
        priority: 4,
        strategy: 'id',
        selector: `#${element.id}`,
        confidence: 8
      });
    }

    // STRATEGY 4: Name attribute (for form elements - 8/10)
    if (element.getAttribute('name')) {
      locators.push({
        priority: 5,
        strategy: 'name',
        selector: `[name="${element.getAttribute('name')}"]`,
        confidence: 8
      });
    }

    // STRATEGY 5: Text content (7/10 - text can change)
    const text = element.textContent?.trim();
    if (text && text.length > 2 && text.length < 100) {
      const selector = this.buildTextSelector(element, text);
      locators.push({
        priority: 6,
        strategy: 'text-content',
        selector,
        confidence: 7
      });
    }

    // STRATEGY 6: Placeholder (for inputs - 7/10)
    const placeholder = element.getAttribute('placeholder');
    if (placeholder) {
      locators.push({
        priority: 7,
        strategy: 'placeholder',
        selector: `input[placeholder="${placeholder}"]`,
        confidence: 7
      });
    }

    // STRATEGY 6.5: Ant Design specific selectors (7/10)
    if (element.className && (element.className.includes('ant-') || element.closest('.ant-select-dropdown'))) {
      // For Ant Design select options
      if (element.className.includes('ant-select-item')) {
        const optionText = element.textContent?.trim();
        if (optionText && optionText.length < 100) {
          locators.push({
            priority: 7,
            strategy: 'antd-select-option',
            selector: `.ant-select-item:has-text("${optionText}")`,
            confidence: 7
          });
        }
      }
      // For Ant Design buttons
      if (element.className.includes('ant-btn')) {
        const btnText = element.textContent?.trim();
        if (btnText && btnText.length < 100) {
          locators.push({
            priority: 7,
            strategy: 'antd-button',
            selector: `.ant-btn:has-text("${btnText}")`,
            confidence: 7
          });
        }
      }
    }

    // STRATEGY 7: Smart CSS selector (6/10)
    const smartCSS = this.buildSmartCSSSelector(element);
    locators.push({
      priority: 8,
      strategy: 'smart-css',
      selector: smartCSS,
      confidence: 6
    });

    // STRATEGY 8: Position-based (5/10 - fragile but works)
    const positionSelector = this.buildPositionSelector(element);
    locators.push({
      priority: 9,
      strategy: 'position',
      selector: positionSelector,
      confidence: 5
    });

    // STRATEGY 9: XPath (4/10 - last resort)
    const xpath = this.getXPath(element);
    locators.push({
      priority: 10,
      strategy: 'xpath',
      selector: xpath,
      confidence: 4
    });

    // Sort by priority (lower number = higher priority)
    locators.sort((a, b) => a.priority - b.priority);

    console.log(`✅ Generated ${locators.length} locators for ${element.tagName}:`);
    locators.slice(0, 3).forEach(loc => {
      console.log(`  ${loc.priority}. ${loc.strategy} (confidence: ${loc.confidence}/10)`);
      console.log(`     → "${loc.selector.substring(0, 80)}..."`);
    });

    return {
      locators,
      visual: {
        rect: element.getBoundingClientRect(),
        innerHTML: element.innerHTML.substring(0, 200)
      },
      verification: {
        tagName: element.tagName,
        textContent: text,
        role: role || undefined,
        type: element.getAttribute('type') || undefined
      }
    };
  }

  /**
   * Get implicit ARIA role from element type
   */
  private static getImplicitRole(element: HTMLElement): string | null {
    const tag = element.tagName.toLowerCase();
    const roleMap: Record<string, string> = {
      'button': 'button',
      'a': 'link',
      'input': this.getInputRole(element),
      'textarea': 'textbox',
      'select': 'combobox',
      'h1': 'heading',
      'h2': 'heading',
      'h3': 'heading',
      'img': 'img',
      'nav': 'navigation',
      'main': 'main',
      'header': 'banner',
      'footer': 'contentinfo',
    };

    return roleMap[tag] || null;
  }

  private static getInputRole(element: HTMLElement): string {
    const type = element.getAttribute('type') || 'text';
    const roleMap: Record<string, string> = {
      'checkbox': 'checkbox',
      'radio': 'radio',
      'button': 'button',
      'submit': 'button',
      'text': 'textbox',
      'email': 'textbox',
      'password': 'textbox',
    };
    return roleMap[type] || 'textbox';
  }

  /**
   * Check if ID looks dynamically generated
   * Returns true if the ID is likely to change between sessions
   */
  private static isDynamicId(id: string): boolean {
    const patterns = [
      // Pure numbers (likely auto-incrementing IDs)
      /^\d+$/,

      // Long hex strings (hashes, 8+ characters)
      /^[a-f0-9]{8,}$/i,

      // UUIDs (with or without dashes)
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      /^[0-9a-f]{32}$/i, // UUID without dashes

      // Timestamps (10+ digits, likely Unix timestamps)
      /\d{10,}/,
      /_\d{13,}/, // Underscore + timestamp in milliseconds

      // React IDs (various patterns)
      /:r\w+:/,                      // React 17: :r1:, :r2:
      /^react-\w+$/,                 // react-abc123
      /^__react_\w+$/,               // __react_internal

      // Material-UI IDs
      /mui-\d+/,                     // mui-123
      /^Mui[A-Z]\w+-\w+$/,          // MuiButton-root-123

      // HeadlessUI IDs
      /headlessui-\w+-\d+/,          // headlessui-tabs-1

      // Radix UI IDs
      /radix-\w+-\d+/,               // radix-dialog-1

      // Next.js IDs
      /__next-\w+/,

      // Common dynamic patterns
      /temp|tmp|gen|generated|random|auto/i,

      // IDs with random suffixes
      /-[a-z0-9]{5,}$/i,             // button-abc123
      /_[a-z0-9]{5,}$/i,             // button_abc123

      // Base64-like IDs
      /^[A-Za-z0-9+/]{20,}={0,2}$/,  // Base64 encoded

      // Nano ID patterns (common in modern apps)
      /^[A-Za-z0-9_-]{21}$/,         // Nano ID default length
    ];

    return patterns.some(pattern => pattern.test(id));
  }

  /**
   * Build smart CSS selector - shortest unique path
   */
  private static buildSmartCSSSelector(element: HTMLElement): string {
    const path: string[] = [];
    let current: HTMLElement | null = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();

      // Add stable class if exists
      const stableClass = this.getStableClass(current);
      if (stableClass) {
        selector += `.${stableClass}`;
      }

      // Add nth-of-type if needed for uniqueness
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          el => el.tagName === current!.tagName
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }

      path.unshift(selector);

      // Test if current path is unique
      if (document.querySelectorAll(path.join(' > ')).length === 1) {
        break;
      }

      current = current.parentElement;
    }

    return path.join(' > ');
  }

  /**
   * Get stable class (ignore dynamic/utility classes)
   */
  private static getStableClass(element: HTMLElement): string | null {
    const classList = Array.from(element.classList);

    // Filter out dynamic/utility classes
    const stableClasses = classList.filter(cls => {
      return !cls.match(/^(css-|MuiBox-|hover:|focus:|active:|md:|lg:|sm:|xl:)/);
    });

    return stableClasses[0] || null;
  }

  /**
   * Build text-based selector
   */
  private static buildTextSelector(element: HTMLElement, text: string): string {
    const tag = element.tagName.toLowerCase();

    // Escape quotes in text
    const escapedText = text.replace(/"/g, '\\"');

    // For links and buttons, we can be more specific
    if (tag === 'a') {
      return `a:has-text("${escapedText}")`;
    }
    if (tag === 'button') {
      return `button:has-text("${escapedText}")`;
    }

    return `${tag}:has-text("${escapedText}")`;
  }

  /**
   * Build position-based selector
   */
  private static buildPositionSelector(element: HTMLElement): string {
    const path: string[] = [];
    let current: HTMLElement | null = element;

    while (current && current !== document.body) {
      const parent = current.parentElement;
      if (parent) {
        const index = Array.from(parent.children).indexOf(current) + 1;
        path.unshift(`*:nth-child(${index})`);
      }
      current = current.parentElement;
    }

    return 'body > ' + path.join(' > ');
  }

  /**
   * Get XPath
   */
  private static getXPath(element: HTMLElement): string {
    if (element.id && !this.isDynamicId(element.id)) {
      return `//*[@id="${element.id}"]`;
    }

    const path: string[] = [];
    let current: HTMLElement | null = element;

    while (current && current !== document.body) {
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          el => el.tagName === current!.tagName
        );
        const index = siblings.indexOf(current) + 1;
        path.unshift(`${current.tagName.toLowerCase()}[${index}]`);
      }
      current = current.parentElement;
    }

    return '//' + path.join('/');
  }
}

/**
 * ElementFinder - Find elements during playback using captured fingerprints
 */
export class ElementFinder {

  /**
   * Find element using fingerprint - try all locators in priority order
   */
  static async findElement(
    fingerprint: ElementFingerprint,
    timeout: number = 5000
  ): Promise<HTMLElement | null> {

    const startTime = Date.now();
    console.log(`🔍 Attempting to find element with ${fingerprint.locators.length} strategies, timeout: ${timeout}ms`);

    const attemptedStrategies = new Set<string>();

    while (Date.now() - startTime < timeout) {
      // Try each locator in priority order
      for (const locator of fingerprint.locators) {
        // Log each unique strategy attempt only once
        if (!attemptedStrategies.has(locator.strategy)) {
          console.log(`  🎯 Trying: ${locator.strategy} - "${locator.selector.substring(0, 60)}${locator.selector.length > 60 ? '...' : ''}"`);
          attemptedStrategies.add(locator.strategy);
        }

        const element = await this.tryLocator(locator);

        if (element) {
          const verified = this.verifyElement(element, fingerprint.verification);
          if (verified) {
            console.log(`✅ Found element using: ${locator.strategy} (confidence: ${locator.confidence}/10)`);
            return element;
          } else {
            console.log(`  ⚠️ Found element but verification failed (tag/text mismatch)`);
          }
        }
      }

      // Wait a bit before retrying (element might not be loaded yet)
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.error('❌ Element not found with any strategy after timeout');
    console.error('   Tried strategies:', Array.from(attemptedStrategies).join(', '));
    console.error('   Expected element:', fingerprint.verification);
    return null;
  }

  /**
   * Try a single locator strategy
   */
  private static async tryLocator(locator: Locator): Promise<HTMLElement | null> {
    try {
      switch (locator.strategy) {
        case 'role-with-name':
        case 'role-with-text':
          return this.findByRole(locator.selector);

        case 'data-testid':
        case 'test-id-data-test':
        case 'test-id-data-test-id':
        case 'test-id-data-cy':
        case 'test-id-data-qa':
        case 'id':
        case 'name':
        case 'placeholder':
        case 'smart-css':
        case 'position': {
          const el = document.querySelector(locator.selector);
          // Ensure we return HTMLElement or null
          if (el && el instanceof HTMLElement) {
            return el;
          }
          return null;
        }

        case 'text-content':
        case 'antd-select-option':
        case 'antd-button':
          return this.findByText(locator.selector);

        case 'xpath':
          return this.findByXPath(locator.selector);

        default:
          return null;
      }
    } catch (e) {
      // Locator failed, try next one
      console.log(`    ⚠️ Locator strategy ${locator.strategy} threw error:`, e);
      return null;
    }
  }

  /**
   * Verify we found the correct element (double-check)
   */
  private static verifyElement(
    element: HTMLElement,
    verification: ElementFingerprint['verification']
  ): boolean {
    // Tag must match
    if (element.tagName !== verification.tagName) {
      console.log(`    ⚠️ Tag mismatch: expected ${verification.tagName}, got ${element.tagName}`);
      return false;
    }

    // Text verification with fuzzy matching
    // Only fail if text is significantly different
    if (verification.textContent && verification.textContent.length > 3) {
      const elementText = element.textContent?.trim() || '';

      // Skip verification if text is too short (might be just whitespace or icons)
      if (elementText.length < 2) {
        return true; // Trust the locator strategy
      }

      const similarity = this.stringSimilarity(elementText, verification.textContent);

      // Fuzzy verification: fail only if text is quite different (< 0.7)
      // This handles whitespace differences, extra spaces, minor typos
      if (similarity < 0.7) {
        console.log(`    ⚠️ Text mismatch - similarity: ${similarity.toFixed(2)}`);
        console.log(`       Expected: "${verification.textContent.substring(0, 50)}..."`);
        console.log(`       Got: "${elementText.substring(0, 50)}..."`);
        return false;
      }

      if (similarity < 1.0) {
        console.log(`    ℹ️ Text similar but not identical - similarity: ${similarity.toFixed(2)}`);
      }
    }

    return true;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private static levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix: number[][] = [];

    // Initialize matrix
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Normalize text for comparison (lowercase, trim, normalize whitespace)
   */
  private static normalizeText(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')           // Normalize whitespace
      .replace(/[^\w\s]/g, '');       // Remove punctuation
  }

  /**
   * Calculate string similarity ratio using Levenshtein distance
   * Returns value between 0 (completely different) and 1 (identical)
   */
  private static stringSimilarity(a: string, b: string): number {
    if (a === b) return 1.0;
    if (a.length === 0 || b.length === 0) return 0.0;

    // Normalize both strings
    const normA = this.normalizeText(a);
    const normB = this.normalizeText(b);

    // Exact match after normalization
    if (normA === normB) return 1.0;

    // Contains check (high confidence)
    if (normA.includes(normB) || normB.includes(normA)) {
      return 0.85;
    }

    // Calculate Levenshtein similarity
    const distance = this.levenshteinDistance(normA, normB);
    const maxLen = Math.max(normA.length, normB.length);
    const similarity = 1 - (distance / maxLen);

    return similarity;
  }

  /**
   * Fuzzy match two strings with configurable threshold
   */
  private static fuzzyMatch(a: string, b: string, threshold: number = 0.75): boolean {
    const similarity = this.stringSimilarity(a, b);
    return similarity >= threshold;
  }

  /**
   * Find element by ARIA role and name/text
   */
  private static findByRole(selector: string): HTMLElement | null {
    // Parse: role=button[name="Submit"] or role=button[text="Submit"]
    const match = selector.match(/role=(\w+)\[(?:name|text)="(.+)"\]/);
    if (!match) return null;

    const [_, role, text] = match;

    // Build list of candidates: explicit role attributes + implicit role elements
    const candidates: HTMLElement[] = [];

    // 1. Find elements with explicit role attribute
    const explicitElements = document.querySelectorAll(`[role="${role}"]`);
    candidates.push(...Array.from(explicitElements) as HTMLElement[]);

    // 2. Find elements with implicit roles (e.g., <button> has implicit role="button")
    const tagMap: Record<string, string[]> = {
      'button': ['button', 'input[type="button"]', 'input[type="submit"]'],
      'link': ['a[href]'],
      'textbox': ['input[type="text"]', 'input[type="email"]', 'input[type="password"]', 'input:not([type])', 'textarea'],
      'checkbox': ['input[type="checkbox"]'],
      'radio': ['input[type="radio"]'],
      'combobox': ['select'],
      'heading': ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
      'img': ['img'],
      'navigation': ['nav'],
      'main': ['main'],
      'banner': ['header'],
      'contentinfo': ['footer']
    };

    const tags = tagMap[role];
    if (tags) {
      tags.forEach(tagSelector => {
        const implicitElements = document.querySelectorAll(tagSelector);
        candidates.push(...Array.from(implicitElements) as HTMLElement[]);
      });
    }

    // 3. Search through all candidates for matching text (with fuzzy matching)
    for (const el of candidates) {
      const ariaLabel = el.getAttribute('aria-label');
      const textContent = el.textContent?.trim();

      // Try exact match first (fastest)
      if (ariaLabel === text || textContent === text) {
        return el;
      }

      // Try fuzzy match (handles whitespace, punctuation, case differences)
      if (ariaLabel && this.fuzzyMatch(ariaLabel, text, 0.8)) {
        console.log(`  ✅ Found by fuzzy matching aria-label: "${ariaLabel}" ≈ "${text}"`);
        return el;
      }

      if (textContent && this.fuzzyMatch(textContent, text, 0.8)) {
        console.log(`  ✅ Found by fuzzy matching text content: "${textContent}" ≈ "${text}"`);
        return el;
      }
    }

    return null;
  }

  /**
   * Find element by text content
   */
  private static findByText(selector: string): HTMLElement | null {
    // Parse: button:has-text("Submit") OR .ant-select-item:has-text("Three Months")
    const tagMatch = selector.match(/^(\w+):has-text\("(.+)"\)$/);
    const classMatch = selector.match(/^(\.[\w-]+):has-text\("(.+)"\)$/);

    let searchSelector: string;
    let text: string;

    if (tagMatch) {
      const [_, tag, txt] = tagMatch;
      searchSelector = tag;
      text = txt;
    } else if (classMatch) {
      const [_, className, txt] = classMatch;
      searchSelector = className;
      text = txt;
    } else {
      return null;
    }

    // Search ALL matching elements in the document (including portals at body end)
    const elements = document.querySelectorAll(searchSelector);

    // Try exact match first
    let found = Array.from(elements).find(
      el => el.textContent?.trim() === text
    );

    // If not found, try fuzzy match
    if (!found) {
      found = Array.from(elements).find(
        el => {
          const elText = el.textContent?.trim() || '';

          // Check if element's DIRECT text content matches (not children)
          const directText = Array.from(el.childNodes)
            .filter(node => node.nodeType === Node.TEXT_NODE)
            .map(node => node.textContent?.trim())
            .join(' ');

          // Exact match
          if (elText === text || directText === text) {
            return true;
          }

          // Contains match
          if (elText.includes(text) || directText.includes(text)) {
            return true;
          }

          // Fuzzy match (handles whitespace, punctuation, case differences)
          if (this.fuzzyMatch(elText, text, 0.8) || this.fuzzyMatch(directText, text, 0.8)) {
            console.log(`  ✅ Found by fuzzy text matching: "${elText}" ≈ "${text}"`);
            return true;
          }

          return false;
        }
      );
    }

    // Ensure we return HTMLElement or null
    if (found && found instanceof HTMLElement) {
      return found;
    }
    return null;
  }

  /**
   * Find element by XPath
   */
  private static findByXPath(xpath: string): HTMLElement | null {
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );

    const node = result.singleNodeValue;

    // Ensure we return HTMLElement or null
    if (node && node instanceof HTMLElement) {
      return node;
    }
    return null;
  }
}
