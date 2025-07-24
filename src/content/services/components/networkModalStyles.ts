export const modalStyles = `
  /* Modal V5 Styles */
  .api-modal-overlay {
    position: fixed;
    direction: ltr;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(8px);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 999999;
    // animation: modalFadeIn 0.4s ease-out;
    pointer-events: auto;
  }

  @keyframes modalFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .api-modal-content {
    background: white;
    border-radius: 24px;
    box-shadow: 
      0 32px 64px rgba(0, 0, 0, 0.2),
      0 0 0 1px rgba(255, 255, 255, 0.1),
      inset 0 1px 0 rgba(255, 255, 255, 0.4);
    width: 90%;
    max-width: 800px;
    max-height: 85vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    animation: modalSlideIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
    position: relative;
    pointer-events: auto;
    z-index: 1000000;
  }

  @keyframes modalSlideIn {
    from { 
      opacity: 0;
      transform: translateY(-50px) scale(0.9);
    }
    to { 
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .api-modal-content::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 200px;
    background: radial-gradient(ellipse at top, rgba(255, 129, 119, 0.1) 0%, transparent 70%);
    pointer-events: none;
    z-index: 1;
  }

  .api-modal-header {
    background: linear-gradient(135deg, #ff8177 0%, #ff8a80 21%, #f9919d 52%, #cf556c 78%, #b12a5b 100%);
    padding: 32px 24px;
    color: white;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-shadow: 
      0 8px 32px rgba(207, 85, 108, 0.4),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
    position: relative;
    z-index: 2;
    overflow: hidden;
  }

  .api-modal-header::before {
    content: '';
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background: repeating-linear-gradient(
      45deg,
      transparent,
      transparent 2px,
      rgba(255, 255, 255, 0.05) 2px,
      rgba(255, 255, 255, 0.05) 4px
    );
    animation: shimmer 3s linear infinite;
    pointer-events: none;
  }

  @keyframes shimmer {
    0% { transform: translateX(-100%) translateY(-100%); }
    100% { transform: translateX(100%) translateY(100%); }
  }

  .api-modal-title {
    font-size: 24px;
    font-weight: 700;
    margin-bottom: 8px;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    letter-spacing: -0.5px;
    margin: 0;
  }

  .api-modal-subtitle {
    color: rgba(255, 255, 255, 0.9);
    font-size: 14px;
    font-weight: 400;
    margin: 4px 0 0 0;
  }

  .api-modal-close {
    background: rgba(255, 255, 255, 0.15);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: white;
    cursor: pointer;
    padding: 8px;
    border-radius: 12px;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    backdrop-filter: blur(10px);
    position: relative;
    z-index: 3;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .api-modal-close:hover {
    background: rgba(255, 255, 255, 0.25);
    transform: scale(1.1) rotate(90deg);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
  }

  .api-modal-search-section {
    padding: 24px;
    border-bottom: 1px solid #f0f0f0;
    background: linear-gradient(135deg, #fff8f4 0%, #fef7f0 100%);
  }

  .api-modal-search-container {
    position: relative;
    margin-bottom: 16px;
  }

  .api-modal-search-container::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(45deg, #ff8177, #f97316, #eab308, #10b981);
    border-radius: 12px;
    padding: 2px;
    z-index: -1;
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .api-modal-search-container.focused::before {
    opacity: 1;
  }

  .api-modal-search-input {
    width: 100%;
    padding: 16px 16px 16px 48px;
    border: 2px solid transparent;
    border-radius: 12px;
    font-size: 14px;
    outline: none;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    background: white;
    box-shadow: 
      0 4px 12px rgba(0, 0, 0, 0.05),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
    box-sizing: border-box;
  }

  .api-modal-search-input:focus {
    border-color: transparent;
    box-shadow: 
      0 8px 25px rgba(255, 129, 119, 0.2),
      0 0 0 4px rgba(255, 129, 119, 0.1);
    transform: translateY(-2px);
  }

  .api-modal-search-icon {
    position: absolute;
    left: 16px;
    top: 50%;
    transform: translateY(-50%);
    color: #ff8177;
    width: 20px;
    height: 20px;
    transition: all 0.3s ease;
    pointer-events: none;
  }

  .api-modal-search-container.focused .api-modal-search-icon {
    color: #cf556c;
    transform: translateY(-50%) scale(1.1);
  }

  .api-modal-results-count {
    font-size: 14px;
    color: #6b7280;
  }

  .api-modal-calls-list {
    flex: 1;
    overflow-y: auto;
    max-height: 400px;
  }

  .api-call-item {
    padding: 20px 24px;
    border-bottom: 1px solid #f8fafc;
    cursor: pointer;
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    background: white;
  }

  .api-call-item::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    width: 4px;
    height: 100%;
    background: linear-gradient(135deg, #ff8177 0%, #cf556c 100%);
    transform: scaleY(0);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    transform-origin: bottom;
  }

  .api-call-item:hover {
    background: linear-gradient(135deg, rgba(255, 129, 119, 0.03) 0%, rgba(255, 247, 240, 0.8) 50%, #fff 100%);
    transform: translateX(8px);
    box-shadow: 
      0 8px 25px rgba(255, 129, 119, 0.1),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }

  .api-call-item:hover::before {
    transform: scaleY(1);
    transform-origin: top;
  }

  .api-call-item:active {
    transform: translateX(4px) scale(0.98);
  }

  .api-call-content {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .api-call-info {
    flex: 1;
    min-width: 0;
  }

  .api-call-badges {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
  }

  .api-call-badge {
    padding: 6px 16px;
    border-radius: 50px;
    font-size: 12px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 2px solid;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .api-call-badge:hover {
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .api-call-badge-get {
    color: #ff8177;
    background: linear-gradient(135deg, #fff8f4 0%, #fef7f0 100%);
    border-color: #ff8177;
  }

  .api-call-badge-post {
    color: #f97316;
    background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%);
    border-color: #f97316;
  }

  .api-call-badge-success {
    color: #059669;
    background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
    border-color: #059669;
  }

  .api-call-badge-error {
    color: #dc2626;
    background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
    border-color: #dc2626;
  }

  .api-call-url-main {
    font-size: 15px;
    font-weight: 600;
    color: #111827;
    margin-bottom: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: color 0.3s ease;
  }

  .api-call-item:hover .api-call-url-main {
    color: #ff8177;
  }

  .api-call-url-full {
    font-size: 12px;
    color: #6b7280;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-bottom: 8px;
  }

  .api-call-status-indicator {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    margin-left: 16px;
    position: relative;
    transition: all 0.3s ease;
  }

  .api-call-status-indicator::before {
    content: '';
    position: absolute;
    top: -2px;
    left: -2px;
    right: -2px;
    bottom: -2px;
    border-radius: 50%;
    background: inherit;
    opacity: 0.3;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 0.3; }
    50% { transform: scale(1.3); opacity: 0; }
  }

  .api-call-item:hover .api-call-status-indicator {
    transform: scale(1.2);
  }

  .api-call-status-success {
    background: linear-gradient(135deg, #059669 0%, #10b981 100%);
    box-shadow: 0 2px 8px rgba(5, 150, 105, 0.3);
  }

  .api-call-status-error {
    background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%);
    box-shadow: 0 2px 8px rgba(220, 38, 38, 0.3);
  }

  .api-modal-empty-state {
    text-align: center;
    padding: 48px 24px;
    color: #6b7280;
  }

  .api-modal-empty-icon {
    width: 48px;
    height: 48px;
    margin: 0 auto 16px;
    color: #d1d5db;
  }

  .api-modal-form-section {
    padding: 24px;
    background: linear-gradient(135deg, #fff8f4 0%, #fef7f0 100%);
    border-top: 1px solid #f0f0f0;
    display: none;
  }

  .api-modal-form-section.show {
    display: block;
    animation: slideDown 0.3s ease-out;
  }

  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-20px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .api-modal-form-input,
  .api-modal-form-textarea {
    width: 100%;
    padding: 12px 16px;
    border: 2px solid #f0f0f0;
    border-radius: 8px;
    font-size: 14px;
    outline: none;
    transition: all 0.3s ease;
    margin-bottom: 16px;
    box-sizing: border-box;
  }

  .api-modal-form-input:focus,
  .api-modal-form-textarea:focus {
    border-color: #ff8177;
    box-shadow: 0 0 0 3px rgba(255, 129, 119, 0.1);
  }

  .api-modal-form-textarea {
    resize: vertical;
    min-height: 80px;
  }

  .api-modal-form-buttons {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }

  .api-modal-btn {
    padding: 12px 24px;
    border: none;
    border-radius: 25px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    font-size: 14px;
  }

  .api-modal-btn-primary {
    background: linear-gradient(135deg, #ff8177 0%, #cf556c 100%);
    color: white;
  }

  .api-modal-btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(255, 129, 119, 0.3);
  }

  .api-modal-btn-secondary {
    background: transparent;
    color: #6b7280;
    border: 2px solid #e5e7eb;
  }

  .api-modal-btn-secondary:hover {
    border-color: #ff8177;
    color: #ff8177;
  }
`;