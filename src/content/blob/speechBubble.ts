// src/content/blob/SpeechBubble.ts

export interface SpeechBubbleAction {
  label: string;
  onClick: () => void;
  style?: 'primary' | 'secondary' | 'third';
}

export interface SpeechBubbleOptions {
  title: string;
  message: string;
  actions?: SpeechBubbleAction[];
  showClose?: boolean;
  onClose?: () => void;
  customContent?: HTMLElement;
  persistent?: boolean; // If false, auto-dismisses after delay
  bypassMute?: boolean; // If true, shows even when muted (for manual actions like badge clicks)
}

export class SpeechBubble {
  private bubble: HTMLElement | null = null;
  private isVisible: boolean = false;
  private autoDismissTimeout: number | null = null;
  private hideTimeout: number | null = null;
  private indiBlob: any = null; // Reference to IndiBlob for mute state check

  constructor() {
    this.injectStyles();
  }

  public setIndiBlob(indiBlob: any): void {
    this.indiBlob = indiBlob;
  }

  private injectStyles(): void {
    if (document.getElementById('indi-speech-bubble-styles')) return;

    const styleElement = document.createElement('style');
    styleElement.id = 'indi-speech-bubble-styles';
    styleElement.textContent = `
      .indi-speech-bubble {
        position: fixed;
        bottom: 160px;
        right: 40px;
        background: #fff;
        border-radius: 20px;
        padding: 24px;
        min-width: 320px;
        max-width: 400px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        z-index: 999998;
        opacity: 0;
        transform: translateY(20px);
        transition: all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        pointer-events: none;
      }

      .indi-speech-bubble.visible {
        opacity: 1;
        transform: translateY(0);
        pointer-events: auto;
      }

      .indi-speech-bubble::before {
        content: '';
        position: absolute;
        bottom: -10px;
        right: 40px;
        width: 20px;
        height: 20px;
        background: #fff;
        transform: rotate(45deg);
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      }

      .indi-speech-bubble-inner {
        position: relative;
        z-index: 1;
        direction: ltr;
      }

      .indi-speech-bubble-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 12px;
      }

      .indi-speech-bubble-title {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: #1f2937;
        white-space: pre-line;
        flex: 1;
      }

      .indi-speech-bubble-close {
        background: none;
        border: none;
        font-size: 24px;
        color: #9ca3af;
        cursor: pointer;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: all 0.2s;
        margin-left: 12px;
        flex-shrink: 0;
      }

      .indi-speech-bubble-close:hover {
        background: #f3f4f6;
        color: #1f2937;
      }

      .indi-speech-bubble-message {
        margin: 0 0 16px 0;
        font-size: 14px;
        line-height: 1.6;
        color: #4b5563;
        white-space: pre-line;
        word-wrap: break-word;
        overflow-wrap: break-word;
        max-width: 100%;
        overflow: hidden;
      }

      .indi-speech-bubble-custom-content {
        margin: 0 0 16px 0;
      }

      .indi-speech-bubble-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .indi-speech-bubble-action {
        flex: 1;
        min-width: 120px;
        padding: 12px 24px;
        border: none;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;
      }

      .indi-speech-bubble-action.primary {
        background: linear-gradient(135deg, #8b5cf6, #7c3aed);
        color: #fff;
        box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
      }

      .indi-speech-bubble-action.primary:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(139, 92, 246, 0.4);
      }

      .indi-speech-bubble-action.secondary {
        background: rgba(139, 92, 246, 0.1);
        color: #8b5cf6;
        border: 2px solid rgba(139, 92, 246, 0.2);
      }

      .indi-speech-bubble-action.secondary:hover {
        background: rgba(139, 92, 246, 0.15);
        border-color: rgba(139, 92, 246, 0.3);
      }

      .indi-speech-bubble-action.third {
        background: white;
        color: #8b5cf6;
        border: 2px solid rgba(139, 92, 246, 0.2);
      }

      .indi-speech-bubble-action.third:hover {
        background: pink;
        border-color: rgba(139, 92, 246, 0.3);
      }



      .indi-speech-bubble-action:active {
        transform: translateY(0);
      }
    `;

    document.head.appendChild(styleElement);
  }

  private createBubbleDOM(options: SpeechBubbleOptions): HTMLElement {
    const bubble = document.createElement('div');
    bubble.className = 'indi-speech-bubble';

    const inner = document.createElement('div');
    inner.className = 'indi-speech-bubble-inner';

    // Header with title and optional close button
    const header = document.createElement('div');
    header.className = 'indi-speech-bubble-header';

    const title = document.createElement('h3');
    title.className = 'indi-speech-bubble-title';
    title.textContent = options.title;
    header.appendChild(title);

    if (options.showClose) {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'indi-speech-bubble-close';
      closeBtn.innerHTML = '×';
      closeBtn.addEventListener('click', () => {
        this.hide();
        if (options.onClose) options.onClose();
      });
      header.appendChild(closeBtn);
    }

    inner.appendChild(header);

    // Message
    if (options.message) {
      const message = document.createElement('p');
      message.className = 'indi-speech-bubble-message';
      message.textContent = options.message;
      inner.appendChild(message);
    }

    // Custom content
    if (options.customContent) {
      const customWrapper = document.createElement('div');
      customWrapper.className = 'indi-speech-bubble-custom-content';
      customWrapper.appendChild(options.customContent);
      inner.appendChild(customWrapper);
    }

    // Actions
    if (options.actions && options.actions.length > 0) {
      const actionsContainer = document.createElement('div');
      actionsContainer.className = 'indi-speech-bubble-actions';

      options.actions.forEach((action) => {
        const btn = document.createElement('button');
        btn.className = `indi-speech-bubble-action ${action.style || 'primary'}`;
        btn.textContent = action.label;
        btn.addEventListener('click', () => {
          action.onClick();
        });
        actionsContainer.appendChild(btn);
      });

      inner.appendChild(actionsContainer);
    }

    bubble.appendChild(inner);
    return bubble;
  }

  public show(options: SpeechBubbleOptions): void {
    console.log('🟢 SpeechBubble.show() called with:', options.title, 'bypassMute:', options.bypassMute);

    // Check if Indi is muted - if so, don't show the bubble (unless bypassMute is true)
    if (!options.bypassMute && this.indiBlob && this.indiBlob.getMuteState && this.indiBlob.getMuteState()) {
      console.log('🔇 Indi is muted - speech bubble will not be shown');
      return;
    }

    // If there's already a bubble showing, hide it first and wait
    if (this.bubble && this.isVisible) {
      console.log('🟡 Existing bubble found, hiding it first...');
      this.hideImmediate(); // Use immediate hide, not animated
    }

    // Create and show new bubble
    this.createAndShowBubble(options);
  }

  private createAndShowBubble(options: SpeechBubbleOptions): void {
    console.log('🟢 Creating bubble:', options.title);

    // Clear any pending timeouts
    this.clearTimeouts();

    // Create new bubble
    this.bubble = this.createBubbleDOM(options);
    document.body.appendChild(this.bubble);

    console.log('🟢 Bubble added to DOM');

    // Trigger animation on next frame
    requestAnimationFrame(() => {
      if (this.bubble) {
        this.bubble.classList.add('visible');
        this.isVisible = true;
        console.log('🟢 Bubble animated to visible');
      }
    });

    // Auto-dismiss if not persistent
    if (!options.persistent) {
      console.log('🟡 Setting auto-dismiss (10s)');
      this.autoDismissTimeout = window.setTimeout(() => {
        console.log('⏰ Auto-dismiss triggered');
        this.hide();
        if (options.onClose) options.onClose();
      }, 10000);
    } else {
      console.log('🟢 Bubble is persistent, no auto-dismiss');
    }
  }

  public updatePosition(blobRect: DOMRect): void {
    if (!this.bubble || !this.isVisible) return;

    // Calculate new position relative to blob
    const bubbleRect = this.bubble.getBoundingClientRect();
    
    // Position above blob with some spacing
    const newBottom = window.innerHeight - blobRect.top + 10;
    const newRight = window.innerWidth - blobRect.right + 10;

    this.bubble.style.bottom = `${newBottom}px`;
    this.bubble.style.right = `${newRight}px`;

    console.log('🔄 Speech bubble repositioned:', { newBottom, newRight });
  }

  public hide(): void {
    console.log('🔴 SpeechBubble.hide() called');

    this.clearTimeouts();

    if (!this.bubble) {
      console.log('🟡 No bubble to hide');
      return;
    }

    // Start hide animation
    this.bubble.classList.remove('visible');
    console.log('🔴 Bubble hiding (animated)');

    // Remove from DOM after animation
    this.hideTimeout = window.setTimeout(() => {
      if (this.bubble && this.bubble.parentElement) {
        this.bubble.parentElement.removeChild(this.bubble);
        console.log('🔴 Bubble removed from DOM');
      }
      this.bubble = null;
      this.isVisible = false;
    }, 400); // Match transition duration
  }

// In your SpeechBubble or wherever createIndi() is:
  public createIndi(summary: any): void {
    console.log('🎯 Creating indicator for slow API...', summary);
    const { slowestApi } = summary;

    // ✅ Directly dispatch the event that your content.ts listener handles
    // Pass the complete slowestApi object which includes url and duration
    const event = new CustomEvent('indi-create-indicator', {
      detail: {
        apiUrl: slowestApi.url,
        duration: slowestApi.duration,
        fullSummary: summary // Pass the full summary in case we need more context
      }
    });

  document.dispatchEvent(event);
}

  private hideImmediate(): void {
    console.log('🔴 SpeechBubble.hideImmediate() called');

    this.clearTimeouts();

    if (this.bubble && this.bubble.parentElement) {
      this.bubble.parentElement.removeChild(this.bubble);
      console.log('🔴 Bubble removed immediately (no animation)');
    }

    this.bubble = null;
    this.isVisible = false;
  }

  private clearTimeouts(): void {
    if (this.autoDismissTimeout) {
      clearTimeout(this.autoDismissTimeout);
      this.autoDismissTimeout = null;
    }

    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
  }

  public update(options: Partial<SpeechBubbleOptions>): void {
    if (!this.bubble || !this.isVisible) return;

    // Update title
    if (options.title) {
      const titleEl = this.bubble.querySelector('.indi-speech-bubble-title');
      if (titleEl) titleEl.textContent = options.title;
    }

    // Update message
    if (options.message) {
      const messageEl = this.bubble.querySelector('.indi-speech-bubble-message');
      if (messageEl) messageEl.textContent = options.message;
    }

    // Update actions
    if (options.actions) {
      const actionsContainer = this.bubble.querySelector('.indi-speech-bubble-actions');
      if (actionsContainer) {
        actionsContainer.innerHTML = '';

        options.actions.forEach((action) => {
          const btn = document.createElement('button');
          btn.className = `indi-speech-bubble-action ${action.style || 'primary'}`;
          btn.textContent = action.label;
          btn.addEventListener('click', () => {
            action.onClick();
          });
          actionsContainer.appendChild(btn);
        });
      }
    }
  }

  public isShowing(): boolean {
    return this.isVisible;
  }

  public destroy(): void {
    this.hideImmediate();
  }
}