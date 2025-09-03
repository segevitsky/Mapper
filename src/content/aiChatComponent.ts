// aiChatComponent.ts - Simple AI chat interface for your extension
export function createAIChatInterface(): HTMLElement {
  const aiContainer = document.createElement('div');
  aiContainer.className = 'indi-ai-chat';
  aiContainer.innerHTML = `
    <style>
      .indi-ai-chat {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 320px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.1);
        border: 1px solid #e1e5e9;
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        display: none;
      }
      
      .indi-ai-header {
        background: linear-gradient(135deg, #ec4899, #f43f5e);
        color: white;
        padding: 16px;
        border-radius: 12px 12px 0 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .indi-ai-title {
        font-weight: 600;
        font-size: 14px;
      }
      
      .indi-ai-close {
        background: none;
        border: none;
        color: white;
        font-size: 18px;
        cursor: pointer;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
      }
      
      .indi-ai-close:hover {
        background: rgba(255,255,255,0.2);
      }
      
      .indi-ai-messages {
        height: 200px;
        overflow-y: auto;
        padding: 16px;
        background: #f8fafc;
      }
      
      .indi-ai-message {
        margin-bottom: 12px;
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 13px;
        line-height: 1.4;
      }
      
      .indi-ai-message.user {
        background: #3b82f6;
        color: white;
        margin-left: 20px;
      }
      
      .indi-ai-message.ai {
        background: white;
        border: 1px solid #e1e5e9;
        margin-right: 20px;
      }
      
      .indi-ai-input-container {
        padding: 16px;
        border-top: 1px solid #e1e5e9;
        display: flex;
        gap: 8px;
      }
      
      .indi-ai-input {
        flex: 1;
        padding: 8px 12px;
        border: 1px solid #e1e5e9;
        border-radius: 6px;
        font-size: 13px;
        outline: none;
      }
      
      .indi-ai-input:focus {
        border-color: #3b82f6;
      }
      
      .indi-ai-send {
        background: #3b82f6;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
      }
      
      .indi-ai-send:hover {
        background: #2563eb;
      }
      
      .indi-ai-send:disabled {
        background: #94a3b8;
        cursor: not-allowed;
      }
      
      .indi-ai-suggestions {
        padding: 0 16px 16px;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      
      .indi-ai-suggestion {
        background: #f1f5f9;
        border: 1px solid #e2e8f0;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 11px;
        cursor: pointer;
        color: #475569;
      }
      
      .indi-ai-suggestion:hover {
        background: #e2e8f0;
      }
      
      .indi-ai-toggle {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: linear-gradient(135deg, #ec4899, #f43f5e);
        border: none;
        color: white;
        font-size: 24px;
        cursor: pointer;
        box-shadow: 0 4px 16px rgba(236, 72, 153, 0.3);
        z-index: 10001;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .indi-ai-toggle:hover {
        transform: scale(1.05);
      }
    </style>
    
    <div class="indi-ai-header">
      <div class="indi-ai-title">🤖 Indi AI Assistant</div>
      <button class="indi-ai-close">×</button>
    </div>
    
    <div class="indi-ai-messages" id="indi-ai-messages">
      <div class="indi-ai-message ai">
        Hi! I'm your AI assistant for API monitoring. Ask me about your API performance, errors, or any questions about your network data.
      </div>
    </div>
    
    <div class="indi-ai-suggestions">
      <div class="indi-ai-suggestion" data-question="What's the slowest API call?">Slowest API</div>
      <div class="indi-ai-suggestion" data-question="Are there any errors?">Check errors</div>
      <div class="indi-ai-suggestion" data-question="Summarize API health">API health</div>
    </div>
    
    <div class="indi-ai-input-container">
      <input type="text" class="indi-ai-input" placeholder="Ask about your APIs..." maxlength="200">
      <button class="indi-ai-send">Send</button>
    </div>
  `;

  // Create toggle button
  const toggleButton = document.createElement('button');
  toggleButton.className = 'indi-ai-toggle';
  toggleButton.innerHTML = '🤖';
  toggleButton.onclick = () => {
    const isVisible = aiContainer.style.display !== 'none';
    aiContainer.style.display = isVisible ? 'none' : 'block';
    toggleButton.style.display = isVisible ? 'flex' : 'none';
  };

  // Setup event listeners
  const closeButton = aiContainer.querySelector('.indi-ai-close') as HTMLButtonElement;
  const input = aiContainer.querySelector('.indi-ai-input') as HTMLInputElement;
  const sendButton = aiContainer.querySelector('.indi-ai-send') as HTMLButtonElement;
  const messagesContainer = aiContainer.querySelector('#indi-ai-messages') as HTMLElement;
  const suggestions = aiContainer.querySelectorAll('.indi-ai-suggestion');

  closeButton.onclick = () => {
    aiContainer.style.display = 'none';
    toggleButton.style.display = 'flex';
  };

  suggestions.forEach(suggestion => {
    suggestion.addEventListener('click', (e) => {
      const question = (e.target as HTMLElement).dataset.question;
      if (question) {
        sendQuestion(question);
      }
    });
  });

  async function sendQuestion(question: string) {
    if (!question.trim()) return;

    // Add user message
    addMessage(question, 'user');
    input.value = '';
    sendButton.disabled = true;

    try {
      // Get context data
      const context = {
        currentUrl: window.location.href,
        totalCalls: (window as any).allNetworkCalls?.length || 0,
        // Add more context as needed
      };

      // Send to background script
      const response = await chrome.runtime.sendMessage({
        type: "ASK_AI_QUESTION",
        question: question,
        context: context
      });

      if (response.success) {
        addMessage(response.answer, 'ai');
      } else {
        addMessage('Sorry, I encountered an error: ' + response.error, 'ai');
      }
    } catch (error) {
      addMessage('Sorry, I\'m having trouble connecting to the AI service.', 'ai');
    } finally {
      sendButton.disabled = false;
    }
  }

  function addMessage(text: string, sender: 'user' | 'ai') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `indi-ai-message ${sender}`;
    messageDiv.textContent = text;
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  sendButton.onclick = () => sendQuestion(input.value);
  input.onkeypress = (e) => {
    if (e.key === 'Enter') {
      sendQuestion(input.value);
    }
  };

  // Append both elements to document
  document.body.appendChild(toggleButton);
  document.body.appendChild(aiContainer);

  return aiContainer;
}

// Auto-initialize when the script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createAIChatInterface);
} else {
  createAIChatInterface();
}