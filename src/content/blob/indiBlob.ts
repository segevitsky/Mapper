// src/content/blob/IndiBlob.ts

export type EmotionType = 'happy' | 'calm' | 'worried' | 'panic';

interface Position {
  x: number;
  y: number;
}

interface EmotionColors {
  primary: string;
  secondary: string;
  tertiary: string;
}

export class IndiBlob {
  private container: HTMLElement | null = null;
  private iris: HTMLElement | null = null;
  private badge: HTMLElement | null = null;
  private aura: HTMLElement | null = null;
  private mouthPath: SVGPathElement | null = null;
  private zipperMouth: SVGGElement | null = null;
  private eyeContainer: HTMLElement | null = null;
  private colorStop1: SVGStopElement | null = null;
  private colorStop2: SVGStopElement | null = null;
  private colorStop3: SVGStopElement | null = null;

  private emotion: EmotionType = 'happy';
  private notificationCount: number = 0;
  private isDragging: boolean = false;
  private hasDragged: boolean = false;
  private dragOffset: Position = { x: 0, y: 0 };
  private position: Position = { x: 0, y: 0 };
  private blinkInterval: number | null = null;
  private summaryTooltip: HTMLElement | null = null;
  private currentSummary: string | null = null;
  private speechBubble: any = null;
  private currentSummaryData: any = null;
  private tooltipHideTimeout: number | null = null;
  private isMuted: boolean = false;
  private muteButton: HTMLElement | null = null;


  constructor(parentElement: HTMLElement = document.body) {
    this.createBlobDOM(parentElement);
    this.initializeReferences();
    this.init();
    this.setInitialPosition();
  }

  public setSpeechBubble(speechBubble: any): void {
    this.speechBubble = speechBubble;
  }

  // Add this new method to show summary on hover:
  public showSummaryOnHover(summaryHTML: string, summaryData?: any): void {
  this.currentSummary = summaryHTML;
  this.currentSummaryData = summaryData;
  
  if (!this.container) return;

  // Remove existing tooltip if any
  if (this.summaryTooltip) {
    this.summaryTooltip.remove();
    this.summaryTooltip = null;
  }

  // Create tooltip
  this.summaryTooltip = document.createElement('div');
  this.summaryTooltip.className = 'indi-summary-tooltip';
  this.summaryTooltip.innerHTML = summaryHTML;
  this.summaryTooltip.style.cssText = `
    position: fixed;
    bottom: 160px;
    right: 40px;
    background: #fff;
    border-radius: 16px;
    padding: 16px;
    min-width: 280px;
    max-width: 350px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
    z-index: 999997;
    opacity: 0;
    transform: translateY(10px);
    transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    pointer-events: auto;
  `;

  // Add arrow pointing to blob
  const arrow = document.createElement('div');
  arrow.style.cssText = `
    position: absolute;
    bottom: -6px;
    right: 40px;
    width: 12px;
    height: 12px;
    background: #fff;
    transform: rotate(45deg);
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  `;
  this.summaryTooltip.appendChild(arrow);

  document.body.appendChild(this.summaryTooltip);

  // Show tooltip on hover
  this.container.addEventListener('mouseenter', this.showTooltip);
  this.container.addEventListener('mouseleave', this.hideTooltip);

  // Keep tooltip open when hovering over it
  this.summaryTooltip.addEventListener('mouseenter', this.showTooltip);
  this.summaryTooltip.addEventListener('mouseleave', this.hideTooltip);
}

private showTooltip = (): void => {
  // Clear any pending hide timeout
  if (this.tooltipHideTimeout) {
    clearTimeout(this.tooltipHideTimeout);
    this.tooltipHideTimeout = null;
  }

  if (this.summaryTooltip) {
    this.summaryTooltip.style.opacity = '1';
    this.summaryTooltip.style.transform = 'translateY(0)';
  }
};

private hideTooltip = (): void => {
  // Use a small delay to allow mouse to move to tooltip
  this.tooltipHideTimeout = window.setTimeout(() => {
    if (this.summaryTooltip) {
      this.summaryTooltip.style.opacity = '0';
      this.summaryTooltip.style.transform = 'translateY(10px)';
    }
  }, 100);
};


  private createBlobDOM(parent: HTMLElement): void {
    const blobHTML = `
      <div class="indi-blob-container happy" id="indiContainer">
        <div class="indi-shadow"></div>

        <div class="indi-blob">
          <div class="indi-aura" id="indiAura"></div>

          <svg class="indi-blob-svg" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="blobGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#a78bfa" id="colorStop1" />
                <stop offset="50%" stop-color="#8b5cf6" id="colorStop2" />
                <stop offset="100%" stop-color="#7c3aed" id="colorStop3" />
              </linearGradient>
            </defs>
            
            <ellipse
              cx="50"
              cy="50"
              rx="40"
              ry="42"
              fill="url(#blobGradient)"
              opacity="0.95"
            />

            <path
              id="mouthPath"
              d="M35,65 Q50,72 65,65"
              fill="none"
              stroke="rgba(0, 0, 0, 0.3)"
              stroke-width="2"
              stroke-linecap="round"
            />

            <!-- Zipper mouth (hidden by default) -->
            <g id="zipperMouth" opacity="0" style="transition: opacity 0.4s ease;">
              <!-- Main zipper line -->
              <line x1="35" y1="68" x2="65" y2="68"
                    stroke="rgba(0, 0, 0, 0.4)"
                    stroke-width="2.5"
                    stroke-linecap="round" />
              <!-- Zipper teeth -->
              <line x1="38" y1="66" x2="38" y2="70" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5" />
              <line x1="42" y1="66" x2="42" y2="70" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5" />
              <line x1="46" y1="66" x2="46" y2="70" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5" />
              <line x1="50" y1="66" x2="50" y2="70" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5" />
              <line x1="54" y1="66" x2="54" y2="70" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5" />
              <line x1="58" y1="66" x2="58" y2="70" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5" />
              <line x1="62" y1="66" x2="62" y2="70" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5" />
            </g>
          </svg>

          <div class="indi-eye-container" id="eyeContainer">
            <div class="indi-eye">
              <div class="indi-iris" id="indiIris">
                <div class="indi-pupil">
                  <div class="indi-highlight"></div>
                </div>
              </div>
            </div>
          </div>

          <div class="indi-blush left"></div>
          <div class="indi-blush right"></div>
          <div class="indi-sweat"></div>
        </div>

        <div class="indi-notification-badge" id="notificationBadge">0</div>

        <div class="indi-mute-button" id="muteButton" title="Mute/Unmute Indi">
          <span class="mute-icon">🔊</span>
        </div>
      </div>
    `;

    parent.insertAdjacentHTML('beforeend', blobHTML);
    this.injectStyles();
  }

  private injectStyles(): void {
    // Check if styles already injected
    if (document.getElementById('indi-blob-styles')) return;

    const styleElement = document.createElement('style');
    styleElement.id = 'indi-blob-styles';
    styleElement.textContent = `
      .indi-blob-container {
        position: fixed;
        width: 100px;
        height: 100px;
        cursor: grab;
        user-select: none;
        z-index: 999999;
      }

      .indi-blob-container.dragging {
        cursor: grabbing;
      }

      .indi-shadow {
        position: absolute;
        bottom: -18px;
        left: 50%;
        transform: translateX(-50%);
        width: 70%;
        height: 14px;
        background: radial-gradient(ellipse, rgba(0, 0, 0, 0.4), transparent);
        filter: blur(8px);
        transition: transform 0.3s ease;
      }

      .indi-blob {
        position: relative;
        width: 100%;
        height: 100%;
        transition: transform 0.3s ease;
      }

      .indi-blob-container:hover .indi-blob {
        transform: scale(1.1);
      }

      .indi-blob-container.dragging .indi-blob {
        transform: scale(1.05);
      }

      .indi-aura {
        position: absolute;
        inset: -20px;
        border-radius: 50%;
        opacity: 0.5;
        animation: indi-gentle-pulse 3s ease-in-out infinite;
        pointer-events: none;
      }

      .indi-blob-container.panic .indi-aura {
        animation: indi-urgent-pulse 1s ease-in-out infinite;
      }

      .indi-blob-svg {
        position: absolute;
        width: 100%;
        height: 100%;
        filter: drop-shadow(0 8px 24px rgba(139, 92, 246, 0.4));
      }

      .indi-eye-container {
        position: absolute;
        top: 35%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 40px;
        height: 40px;
        transition: transform 0.15s ease;
      }

      .indi-eye {
        width: 100%;
        height: 100%;
        background: radial-gradient(circle at 35% 35%, #ffffff, #f5f5f5);
        border-radius: 50%;
        border: 3px solid rgba(255, 255, 255, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.1);
        overflow: hidden;
        position: relative;
      }

      .indi-iris {
        width: 60%;
        height: 60%;
        border-radius: 50%;
        position: relative;
        box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.3);
        transition: transform 0.15s ease-out;
      }

      .indi-pupil {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 50%;
        height: 50%;
        background: radial-gradient(circle at 30% 30%, #2d3748, #000000);
        border-radius: 50%;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
      }

      .indi-highlight {
        position: absolute;
        top: 20%;
        left: 25%;
        width: 40%;
        height: 40%;
        background: radial-gradient(circle, rgba(255, 255, 255, 0.95), transparent 70%);
        border-radius: 50%;
      }

      .indi-blush {
        position: absolute;
        top: 52%;
        width: 14px;
        height: 10px;
        border-radius: 50%;
        background: rgba(255, 182, 193, 0.5);
        filter: blur(3px);
        opacity: 0;
        transition: opacity 0.3s;
      }

      .indi-blush.left { left: 15%; }
      .indi-blush.right { right: 15%; }

      .indi-blob-container:hover .indi-blush {
        opacity: 1;
      }

      .indi-sweat {
        position: absolute;
        top: 25%;
        right: 18%;
        width: 8px;
        height: 12px;
        background: radial-gradient(ellipse at top, #60a5fa, #3b82f6);
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        opacity: 0;
        transition: opacity 0.3s;
      }

      .indi-blob-container.worried .indi-sweat,
      .indi-blob-container.panic .indi-sweat {
        opacity: 1;
      }

      .indi-notification-badge {
        position: absolute;
        top: -8px;
        right: -8px;
        min-width: 34px;
        height: 34px;
        padding: 0 10px;
        background: linear-gradient(135deg, #ff4757 0%, #ff6348 100%);
        border-radius: 17px;
        border: 4px solid white;
        display: none;
        align-items: center;
        justify-content: center;
        font-size: 15px;
        font-weight: 800;
        color: white;
        box-shadow: 0 4px 20px rgba(255, 71, 87, 0.6);
        cursor: pointer;
        z-index: 20;
      }

      .indi-notification-badge.visible {
        display: flex;
      }

      .indi-mute-button {
        position: absolute;
        bottom: -8px;
        right: -8px;
        width: 32px;
        height: 32px;
        background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
        border-radius: 50%;
        border: 3px solid white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
        cursor: pointer;
        z-index: 21;
        transition: all 0.3s ease;
      }

      .indi-mute-button:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 16px rgba(99, 102, 241, 0.6);
      }

      .indi-mute-button.muted {
        background: linear-gradient(135deg, #94a3b8 0%, #64748b 100%);
        box-shadow: 0 4px 12px rgba(100, 116, 139, 0.4);
      }

      .mute-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.3s ease;
      }

      .indi-mute-button:active .mute-icon {
        transform: scale(0.9);
      }

      @keyframes mute-button-press {
        0% { transform: scale(1); }
        50% { transform: scale(0.85) rotate(15deg); }
        100% { transform: scale(1) rotate(0deg); }
      }

      .indi-mute-button.animating {
        animation: mute-button-press 0.4s ease;
      }

      @keyframes indi-gentle-pulse {
        0%, 100% { 
          transform: scale(1); 
          opacity: 0.5; 
        }
        50% { 
          transform: scale(1.1); 
          opacity: 0.7; 
        }
      }

      @keyframes indi-urgent-pulse {
        0%, 100% { 
          transform: scale(1); 
          opacity: 0.7; 
        }
        50% { 
          transform: scale(1.2); 
          opacity: 0.9; 
        }
      }
    `;

    document.head.appendChild(styleElement);
  }

  private initializeReferences(): void {
    this.container = document.getElementById('indiContainer');
    this.iris = document.getElementById('indiIris');
    this.badge = document.getElementById('notificationBadge');
    this.aura = document.getElementById('indiAura');
    this.mouthPath = document.getElementById('mouthPath') as unknown as SVGPathElement;
    this.zipperMouth = document.getElementById('zipperMouth') as unknown as SVGGElement;
    this.eyeContainer = document.getElementById('eyeContainer');
    this.colorStop1 = document.getElementById('colorStop1') as unknown as SVGStopElement;
    this.colorStop2 = document.getElementById('colorStop2') as unknown as SVGStopElement;
    this.colorStop3 = document.getElementById('colorStop3') as unknown as SVGStopElement;
    this.muteButton = document.getElementById('muteButton');
  }

  private init(): void {
    if (!this.container) return;

    // Eye follow cursor on hover
    this.container.addEventListener('mouseenter', () => {
      document.addEventListener('mousemove', this.followCursor);
    });

    this.container.addEventListener('mouseleave', () => {
      document.removeEventListener('mousemove', this.followCursor);
      if (this.iris) {
        this.iris.style.transform = 'translate(0, 0)';
      }
    });

    // Dragging
    this.container.addEventListener('mousedown', this.startDrag);
    document.addEventListener('mousemove', this.drag);
    document.addEventListener('mouseup', this.stopDrag);

    // Blinking
    this.blinkInterval = window.setInterval(() => {
      if (!this.isDragging) {
        this.blink();
      }
    }, 4000 + Math.random() * 2000);

    // Click handler
    this.container.addEventListener('click', () => {
      if (!this.isDragging && !this.hasDragged) {
        this.handleClick();
      }
    });

      if (this.badge) {
    this.badge.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent triggering container click
      if (!this.isDragging && !this.hasDragged) {
        this.handleBadgeClick();
      }
    });
  }

  // Mute button
  if (this.muteButton) {
    this.muteButton.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent triggering container click
      this.toggleMute();
    });
  }

  // Load mute state from storage
  this.loadMuteState();
  }

  private handleBadgeClick(): void {
  console.log('🔔 Notification badge clicked!');

  // Dispatch custom event with the issue count and summary data
  const event = new CustomEvent('indi-badge-clicked', {
    detail: {
      count: this.notificationCount,
      summaryData: this.currentSummaryData
    }
  });
  document.dispatchEvent(event);
}

  private setInitialPosition(): void {
    // Position in bottom-right corner
    const x = window.innerWidth - 150;
    const y = window.innerHeight - 150;
    this.setPosition(x, y);
  }

  private setPosition(x: number, y: number): void {
    if (!this.container) return;

    this.position = { x, y };
    this.container.style.left = `${x}px`;
    this.container.style.top = `${y}px`;
  }

  private followCursor = (e: MouseEvent): void => {
    if (!this.container || !this.iris) return;

    const rect = this.container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const deltaX = e.clientX - centerX;
    const deltaY = e.clientY - centerY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    const maxMove = 5;
    const scale = Math.min(maxMove / (distance / 80), 1);

    const moveX = (deltaX / distance) * maxMove * scale;
    const moveY = (deltaY / distance) * maxMove * scale;

    this.iris.style.transform = `translate(${moveX}px, ${moveY}px)`;
  };

  private startDrag = (e: MouseEvent): void => {
    if (!this.container) return;

    this.isDragging = true;
    this.hasDragged = false;
    this.container.classList.add('dragging');

    const rect = this.container.getBoundingClientRect();
    this.dragOffset = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    e.preventDefault();
  };

  private drag = (e: MouseEvent): void => {
    if (!this.isDragging) return;
    this.hasDragged = true;

    const x = e.clientX - this.dragOffset.x;
    const y = e.clientY - this.dragOffset.y;
    this.setPosition(x, y);
  };

  private stopDrag = (): void => {
    if (!this.isDragging || !this.container) return;

    this.isDragging = false;
    this.container.classList.remove('dragging');
    this.updateBubblePositions();
    // Save position to storage
    this.savePosition();

      setTimeout(() => {
    this.hasDragged = false;
  }, 100);
  };

  private updateBubblePositions(): void {
  if (!this.container) return;

  const blobRect = this.container.getBoundingClientRect();

  // Update speech bubble position if it exists and is visible
  if (this.speechBubble && this.speechBubble.isShowing()) {
    this.speechBubble.updatePosition(blobRect);
  }

  // Update summary tooltip position
  if (this.summaryTooltip) {
    this.updateSummaryTooltipPosition(blobRect);
  }
}

// Add this new method
private updateSummaryTooltipPosition(blobRect: DOMRect): void {
  if (!this.summaryTooltip) return;

  // Keep tooltip in same relative position to blob
  this.summaryTooltip.style.bottom = `${window.innerHeight - blobRect.top + 10}px`;
  this.summaryTooltip.style.right = `${window.innerWidth - blobRect.right + 10}px`;

  // Update arrow position
  const arrow = this.summaryTooltip.querySelector('div') as HTMLElement;
  if (arrow) {
    arrow.style.right = '40px';
  }
}

  private blink(): void {
    if (!this.eyeContainer) return;

    this.eyeContainer.style.transform = 'translate(-50%, -50%) scaleY(0.1)';
    setTimeout(() => {
      if (this.eyeContainer) {
        this.eyeContainer.style.transform = 'translate(-50%, -50%)';
      }
    }, 150);
  }

  private handleClick(): void {
    // This will be used to open the expanded panel
    console.log('Indi blob clicked!');
    // TODO: Dispatch custom event for panel opening
    const event = new CustomEvent('indi-blob-clicked');
    document.dispatchEvent(event);
  }

  public setEmotion(emotion: EmotionType): void {
    if (!this.container) return;

    this.emotion = emotion;
    this.container.className = `indi-blob-container ${emotion}`;

    const colors = this.getEmotionColors(emotion);
    
    if (this.colorStop1) this.colorStop1.setAttribute('stop-color', colors.primary);
    if (this.colorStop2) this.colorStop2.setAttribute('stop-color', colors.secondary);
    if (this.colorStop3) this.colorStop3.setAttribute('stop-color', colors.tertiary);

    if (this.aura) {
      this.aura.style.background = `radial-gradient(circle, ${colors.primary}50 0%, transparent 70%)`;
    }

    if (this.iris) {
      this.iris.style.background = `radial-gradient(circle at 35% 35%, ${colors.secondary}dd, ${colors.tertiary}aa)`;
    }

    this.updateMouth(emotion);
  }

  private getEmotionColors(emotion: EmotionType): EmotionColors {
    const colorMap: Record<EmotionType, EmotionColors> = {
      happy: { primary: '#a78bfa', secondary: '#8b5cf6', tertiary: '#7c3aed' },
      calm: { primary: '#60a5fa', secondary: '#3b82f6', tertiary: '#2563eb' },
      worried: { primary: '#fbbf24', secondary: '#f59e0b', tertiary: '#d97706' },
      panic: { primary: '#f87171', secondary: '#ef4444', tertiary: '#dc2626' },
    };
    return colorMap[emotion];
  }

  private updateMouth(emotion: EmotionType): void {
    if (!this.mouthPath || !this.zipperMouth) return;

    // If muted, show zipper mouth instead of normal mouth
    if (this.isMuted) {
      this.mouthPath.setAttribute('opacity', '0');
      this.zipperMouth.setAttribute('opacity', '1');
      return;
    }

    // Normal mouth behavior - show emotion-based mouth
    this.mouthPath.setAttribute('opacity', '1');
    this.zipperMouth.setAttribute('opacity', '0');

    const mouthShapes: Record<EmotionType, string> = {
      happy: 'M35,65 Q50,72 65,65',
      calm: 'M40,68 L60,68',
      worried: 'M35,70 Q50,67 65,70',
      panic: 'M40,65 Q50,72 60,65',
    };

    this.mouthPath.setAttribute('d', mouthShapes[emotion]);
  }

  public setNotifications(count: number): void {
    this.notificationCount = count;

    if (!this.badge) return;

    if (count > 0) {
      this.badge.textContent = count.toString();
      this.badge.classList.add('visible');

      // Auto-set emotion based on count
      if (count >= 6) {
        this.setEmotion('panic');
      } else if (count >= 3) {
        this.setEmotion('worried');
      } else {
        this.setEmotion('calm');
      }
    } else {
      this.badge.classList.remove('visible');
      this.setEmotion('happy');
    }
  };

  public setNetworkCallsPerPage(count: number): void {
    this.notificationCount = count;
    if (count <= 5) {
      this.setEmotion('happy');
    } else if (count <= 15) {
        this.setEmotion('calm');
    } else if (count <= 30) {
        this.setEmotion('worried');
    } else {
        this.setEmotion('panic');
    }
  };

  private savePosition(): void {
    const domainKey = `indi_position_${window.location.hostname}`;
    chrome.storage.local.set({
      [domainKey]: this.position,
    });
  }

  public async loadPosition(): Promise<void> {
    const domainKey = `indi_position_${window.location.hostname}`;
    
    return new Promise((resolve) => {
      chrome.storage.local.get([domainKey], (result) => {
        if (result[domainKey]) {
          const savedPosition = result[domainKey] as Position;
          this.setPosition(savedPosition.x, savedPosition.y);
        }
        resolve();
      });
    });
  }

  // ========== MUTE FUNCTIONALITY ==========

  private async loadMuteState(): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.get(['indi_global_mute'], (result) => {
        this.isMuted = result.indi_global_mute || false;
        this.updateMuteUI();
        console.log('🔇 Loaded mute state:', this.isMuted);
        resolve();
      });
    });
  }

  private toggleMute(): void {
    this.isMuted = !this.isMuted;

    // Save to storage
    chrome.storage.local.set({
      indi_global_mute: this.isMuted,
    });

    // Trigger button press animation
    if (this.muteButton) {
      this.muteButton.classList.add('animating');
      setTimeout(() => {
        this.muteButton?.classList.remove('animating');
      }, 400);
    }

    this.updateMuteUI();

    console.log('🔇 Mute toggled:', this.isMuted);
  }

  private updateMuteUI(): void {
    if (!this.muteButton) return;

    const muteIcon = this.muteButton.querySelector('.mute-icon') as HTMLElement;
    if (!muteIcon) return;

    if (this.isMuted) {
      this.muteButton.classList.add('muted');
      muteIcon.textContent = '🔇';
      this.muteButton.title = 'Unmute Indi';
    } else {
      this.muteButton.classList.remove('muted');
      muteIcon.textContent = '🔊';
      this.muteButton.title = 'Mute Indi';
    }

    // Update mouth to show zipper when muted
    this.updateMouth(this.emotion);
  }

  public getMuteState(): boolean {
    return this.isMuted;
  }

    public destroy(): void {
    // Clean up
    if (this.blinkInterval) {
        clearInterval(this.blinkInterval);
    }

    // Clear tooltip timeout
    if (this.tooltipHideTimeout) {
        clearTimeout(this.tooltipHideTimeout);
        this.tooltipHideTimeout = null;
    }

    // Remove tooltip
    if (this.summaryTooltip) {
        this.summaryTooltip.removeEventListener('mouseenter', this.showTooltip);
        this.summaryTooltip.removeEventListener('mouseleave', this.hideTooltip);
        this.summaryTooltip.remove();
        this.summaryTooltip = null;
    }

    // Remove event listeners
    if (this.container) {
        this.container.removeEventListener('mouseenter', this.showTooltip);
        this.container.removeEventListener('mouseleave', this.hideTooltip);
    }

    document.removeEventListener('mousemove', this.followCursor);
    document.removeEventListener('mousemove', this.drag);
    document.removeEventListener('mouseup', this.stopDrag);

    if (this.container && this.container.parentElement) {
        this.container.parentElement.removeChild(this.container);
    }
    }
}