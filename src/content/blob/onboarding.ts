// src/content/blob/OnboardingFlow.ts

import { SpeechBubble } from './speechBubble';
import { IndiBlob } from './indiBlob';

interface OnboardingState {
  completed: boolean;
  selectedBackendUrl?: string;
  skipped: boolean;
  dismissed: boolean;
}

export class OnboardingFlow {
  private speechBubble: SpeechBubble;
  private indiBlob: IndiBlob;
  private currentStep: number = 0;
  private detectedUrls: string[] = [];
  private selectedUrl: string = '';

  constructor(indiBlob: IndiBlob, speechBubble: SpeechBubble) {
    this.indiBlob = indiBlob;
    this.speechBubble = speechBubble;
  }

  /**
   * Start onboarding with network data from NETWORK_IDLE
   */
  public async startWithNetworkData(networkData: any[]): Promise<void> {
    // Check if already onboarded for this domain
    const state = await this.getOnboardingState();

    if (state.completed) {
      console.log('✅ Onboarding already completed for this domain');
      return;
    }

    // if (state.dismissed) {
    //   console.log('🚫 Onboarding was dismissed by user for this domain');
    //   return;
    // }

    // Extract backend URLs from network data
    this.extractBackendUrls(networkData);

    // Start onboarding flow
    this.showStep1();
  }

  /**
   * Extract unique backend URLs from network data
   */
  private extractBackendUrls(networkData: any[]): void {
    const urls = new Set<string>();
    
    networkData.forEach((call: any) => {
      try {
        const url = new URL(call?.request?.request?.url || call.url || call.request?.url);
        
        // Filter out third-party domains
        if (!this.isThirdParty(url.hostname)) {
          const baseUrl = `${url.protocol}//${url.hostname}`;
          urls.add(baseUrl);
        }
      } catch (e) {
        // Invalid URL, skip
      }
    });

    this.detectedUrls = Array.from(urls);
    console.log('🔍 Detected backend URLs:', this.detectedUrls);
  }

  /**
   * Check if hostname is third-party
   */
  private isThirdParty(hostname: string): boolean {
    const thirdPartyDomains = [
      'google-analytics.com',
      'googletagmanager.com',
      'facebook.com',
      'doubleclick.net',
      'stripe.com',
      'paypal.com',
      'cloudflare.com',
      'googleapis.com',
      'gstatic.com',
      'amazon',
      'jsdelivr',
      'unpkg',
      'cdnjs',
      'chrome'
    ];

    return thirdPartyDomains.some(domain => hostname.includes(domain));
  }

  /**
   * Step 1: Welcome message
   */
  private showStep1(): void {
    this.currentStep = 1;
    this.indiBlob.setEmotion('happy');

    this.speechBubble.show({
      title: '🫧 Hi! I\'m Indi Blob!',
      message: 'Think of me as your API watchdog...\nexcept cuter and way less annoying.',
      actions: [
        {
          label: 'Let\'s Go! 🚀',
          style: 'primary',
          onClick: () => this.showStep2(),
        },
      ],
      showClose: true,
      onClose: () => this.dismissOnboarding(),
      persistent: true,
    });
  }

  /**
   * Step 2: URL selection
   */
  public showStep2(reconfigure?: boolean): void {
    this.currentStep = 2;

    if (this.detectedUrls.length === 0) {
      // No URLs detected
      this.speechBubble.show({
        title: 'Hmm... 🤔',
        message: 'I haven\'t detected any API calls yet.\n\nTry interacting with the site (click buttons, load data), then I\'ll check again!',
        actions: [
          {
            label: 'I Interacted, Check Again',
            style: 'primary',
            onClick: () => {
              // Just wait for next NETWORK_IDLE
              this.speechBubble.hide();
            },
          },
          {
            label: 'Skip for Now',
            style: 'secondary',
            onClick: () => this.showSkipState(),
          },
        ],
        showClose: true,
        onClose: () => this.showSkipState(),
        persistent: true,
      });
      return;
    }

    // Show URL selection
    const urlList = this.createUrlSelectionList(reconfigure);

    this.speechBubble.show({
      title: 'Let me get to know your app:',
      message: 'I detected these API calls on this page.\nWhich one is YOUR backend?',
      customContent: urlList,
      actions: [],
      showClose: false,
    //   onClose: () => this.showSkipState(),
      persistent: true,
    });
  }

  /**
   * Create URL selection list with interactive elements
   */
  private createUrlSelectionList(reconfigure?: boolean): HTMLElement {
    const container = document.createElement('div');
    container.style.marginBottom = '16px';

    this.detectedUrls.forEach((url) => {
      const urlOption = document.createElement('div');
      urlOption.style.cssText = `
        padding: 12px 16px;
        background: #f9fafb;
        border: 2px solid #e5e7eb;
        border-radius: 8px;
        margin-bottom: 8px;
        cursor: pointer;
        font-size: 13px;
        font-family: monospace;
        color: #374151;
        transition: all 0.2s;
        word-break: break-all;
      `;

      urlOption.textContent = url;

      urlOption.addEventListener('click', () => {
        // Deselect all
        container.querySelectorAll('div').forEach((el) => {
          const divEl = el as HTMLElement;
          if (divEl.style.padding) { // Only style URL options
            divEl.style.background = '#f9fafb';
            divEl.style.borderColor = '#e5e7eb';
          }
        });

        // Select this one
        urlOption.style.background = '#f3e8ff';
        urlOption.style.borderColor = '#8b5cf6';
        
        this.selectedUrl = url;
        
        // Auto-advance after selection
        setTimeout(() => {
          this.showStep3();
        }, 300);
      });

      urlOption.addEventListener('mouseenter', () => {
        if (urlOption.style.background !== 'rgb(243, 232, 255)') {
          urlOption.style.background = '#f3f4f6';
          urlOption.style.borderColor = '#d1d5db';
        }
      });

      urlOption.addEventListener('mouseleave', () => {
        if (urlOption.style.background !== 'rgb(243, 232, 255)') {
          urlOption.style.background = '#f9fafb';
          urlOption.style.borderColor = '#e5e7eb';
        }
      });

      container.appendChild(urlOption);
    });

    // Add "Skip for now" button
    const skipButton = document.createElement('button');
    skipButton.textContent = 'Skip for now';
    skipButton.style.cssText = `
      width: 100%;
      padding: 8px;
      margin-top: 8px;
      background: none;
      border: none;
      color: #9ca3af;
      font-size: 13px;
      cursor: pointer;
      text-decoration: underline;
    `;
    skipButton.addEventListener('click', reconfigure ? () => this.speechBubble.hide() : () => this.showSkipState());
    container.appendChild(skipButton);

    return container;
  }

  /**
   * Step 3: Confirmation
   */
  private showStep3(): void {
    this.currentStep = 3;
    this.indiBlob.setEmotion('happy');

    this.speechBubble.show({
      title: 'Got it! ✨',
      message: `Perfect! I'll track:\n${this.selectedUrl}\n\nFrom now on, I'm watching your back:

🔍 Spotting issues before users do
⚡ Catching slow APIs
🔒 Finding security gaps
💡 Suggesting indicators to track
📊 Full insights in the expanded panel`,
      actions: [
        {
          label: 'Start Monitoring! 🎯',
          style: 'primary',
          onClick: () => this.showStep4(),
        },
      ],
      showClose: false,
      persistent: true,
    });
  }

  /**
   * Step 4: Final message
   */
  private showStep4(): void {
    this.currentStep = 4;

    this.speechBubble.show({
      title: 'Ready? Let\'s go! 🚀',
      message: 'If something breaks, I\'ll let you know.\nIf everything\'s good, I\'ll just vibe here. 😎\n\n🫧 Click me anytime for the full view\n📊 Or check DevTools → Indi panel',
      actions: [
        {
          label: 'Got it!',
          style: 'primary',
          onClick: () => this.completeOnboarding(),
        },
      ],
      showClose: false,
      persistent: true,
    });
  }

  /**
   * Dismiss onboarding (user clicked X on welcome)
   */
  private dismissOnboarding(): void {
    console.log('🚫 User dismissed onboarding for this domain');

    this.saveOnboardingState({
      completed: false,
      dismissed: true,
      skipped: false,
    });

    // Reset blob's badge counter and set to happy state
    this.indiBlob.setNotifications(0);
    this.indiBlob.setEmotion('happy');

    this.speechBubble.hide();
  }

  /**
   * Show skip state (user didn't select URL)
   */
  private showSkipState(): void {
    this.indiBlob.setEmotion('calm');

    this.speechBubble.show({
      title: 'I\'m not ready yet 😔',
      message: 'I need to know your backend URL to start monitoring.\nClick me anytime to configure!',
      actions: [
        {
          label: 'Configure Now',
          style: 'primary',
          onClick: () => this.showStep2(),
        },
      ],
      showClose: true,
      onClose: () => this.speechBubble.hide(),
      persistent: true,
    });

    // Save skipped state
    this.saveOnboardingState({
      completed: false,
      skipped: true,
      dismissed: false,
    });
  }

  /**
   * Complete onboarding and save state
   */
  private async completeOnboarding(): Promise<void> {
    // Save completion state
    await this.saveOnboardingState({
      completed: true,
      selectedBackendUrl: this.selectedUrl,
      skipped: false,
      dismissed: false,
    });

    // Hide speech bubble
    this.speechBubble.hide();

    // Send backend URL to background script
    chrome.runtime.sendMessage({
      type: 'SET_BACKEND_URL',
      url: this.selectedUrl,
      domain: window.location.hostname,
    });

    console.log('✅ Onboarding completed! Backend URL:', this.selectedUrl);
  }

  /**
   * Get onboarding state from storage
   */
  private async getOnboardingState(): Promise<OnboardingState> {
    const key = `indi_onboarding_${window.location.hostname}`;

    return new Promise((resolve) => {
      chrome.storage.local.get([key], (result) => {
        resolve(result[key] || { completed: false, skipped: false, dismissed: false });
      });
    });
  }

  /**
   * Save onboarding state to storage
   */
  private async saveOnboardingState(state: Partial<OnboardingState>): Promise<void> {
    const key = `indi_onboarding_${window.location.hostname}`;
    const currentState = await this.getOnboardingState();
    
    return new Promise((resolve) => {
      chrome.storage.local.set(
        {
          [key]: { ...currentState, ...state },
        },
        () => resolve()
      );
    });
  }

  /**
   * Restart onboarding flow
   */
  public async restart(): Promise<void> {
    // Clear onboarding state (including dismissed flag)
    await this.saveOnboardingState({
      completed: false,
      skipped: false,
      dismissed: false,
    });

    // Restart flow
    this.currentStep = 0;
    this.selectedUrl = '';
    this.showStep1();
  }

  /**
   * Update with new network data (if user interacted more)
   */
  public updateNetworkData(networkData: any[]): void {
    const previousCount = this.detectedUrls.length;
    this.extractBackendUrls(networkData);
    
    if (this.detectedUrls.length > previousCount && this.currentStep === 2) {
      // New URLs detected while on step 2, refresh the list
      this.showStep2();
    }
  }
}