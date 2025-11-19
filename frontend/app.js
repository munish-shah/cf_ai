// Main frontend controller for the developer assistant
// Handles WebSocket connections, UI updates, and code display
class DeveloperAssistant {
  constructor() {
    this.ws = null;
    this.conversationId = null;
    this.isGenerating = false;
    // Use deployed worker URL directly in local dev (since Durable Objects aren't connected locally)
    this.workerUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'https://cf-ai-developer-assistant.munish-shah04.workers.dev'
      : '';
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.connectWebSocket();
  }

  setupEventListeners() {
    const sendBtn = document.getElementById('sendBtn');
    const messageInput = document.getElementById('messageInput');
    const codeGenBtn = document.getElementById('codeGenBtn');
    const clearBtn = document.getElementById('clearBtn');
    const closeCodePanel = document.getElementById('closeCodePanel');
    const quickActionBtns = document.querySelectorAll('.quick-action-btn');

    sendBtn.addEventListener('click', () => this.sendMessage());
    codeGenBtn.addEventListener('click', () => this.generateCode());
    clearBtn.addEventListener('click', () => this.clearChat());
    closeCodePanel.addEventListener('click', () => this.closeCodePanel());

    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    messageInput.addEventListener('input', (e) => {
      e.target.style.height = 'auto';
      e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
    });

    quickActionBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const prompt = btn.getAttribute('data-prompt');
        messageInput.value = prompt;
        messageInput.focus();
        this.sendMessage();
      });
    });
  }

  // Establish WebSocket connection for real-time communication
  // Falls back to HTTP if WebSocket fails
  connectWebSocket() {
    // In local dev, connect directly to deployed worker
    if (this.workerUrl) {
      const wsUrl = this.workerUrl.replace('https://', 'wss://').replace('http://', 'ws://') + '/agent';
      this.connectWebSocketToUrl(wsUrl);
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/agent`;
      this.connectWebSocketToUrl(wsUrl);
    }
  }
  
  connectWebSocketToUrl(wsUrl) {
    try {
      console.log('Connecting to WebSocket:', wsUrl);
      this.ws = new WebSocket(wsUrl);
      
      let connected = false;
      
      this.ws.onopen = () => {
        connected = true;
        console.log('WebSocket connected');
      };
      
      this.ws.onmessage = (event) => {
        this.handleWebSocketMessage(JSON.parse(event.data));
      };
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        if (!connected) {
          // If we never connected, fall back to HTTP immediately
          this.ws = null;
        }
      };
      
      // Auto-reconnect on close, but only if we were connected
      this.ws.onclose = () => {
        console.log('WebSocket closed');
        if (connected) {
          // Only reconnect if we were previously connected
          setTimeout(() => this.connectWebSocket(), 3000);
        } else {
          // If we never connected, don't keep trying
          this.ws = null;
        }
      };
      
      // Timeout: if WebSocket doesn't connect within 2 seconds, fall back to HTTP
      setTimeout(() => {
        if (!connected && this.ws && this.ws.readyState === WebSocket.CONNECTING) {
          console.log('WebSocket connection timeout, falling back to HTTP');
          this.ws.close();
          this.ws = null;
        }
      }, 2000);
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      this.ws = null;
    }
  }

  async sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    
    if (!message || this.isGenerating) return;
    
    this.addMessage('user', message);
    input.value = '';
    input.style.height = 'auto';
    
    this.isGenerating = true;
    this.showThinking();
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'chat',
        message,
        conversationId: this.conversationId
      }));
    } else {
      await this.sendMessageHTTP(message);
    }
  }

  async generateCode() {
    const input = document.getElementById('messageInput');
    const prompt = input.value.trim();
    
    if (!prompt) {
      alert('Please describe what you want to build');
      return;
    }
    
    if (this.isGenerating) return;
    
    this.addMessage('user', `Generate code: ${prompt}`);
    input.value = '';
    input.style.height = 'auto';
    
    this.isGenerating = true;
    this.showThinking();
    this.openCodePanel();
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'generate',
        prompt,
        projectType: 'workers'
      }));
    } else {
      await this.generateCodeHTTP(prompt);
    }
  }

  async sendMessageHTTP(message) {
    try {
      const url = this.workerUrl ? `${this.workerUrl}/agent/chat` : '/agent/chat';
      console.log('Sending message to:', url);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          conversationId: this.conversationId
        })
      });
      
      console.log('Response status:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }
      
      const data = await response.json();
      console.log('Response data:', data);
      
      this.hideThinking();
      this.addMessage('assistant', data.message || data.error || 'No response received');
      this.conversationId = data.conversationId;
      this.isGenerating = false;
    } catch (error) {
      console.error('Error sending message:', error);
      this.hideThinking();
      const errorMsg = error.message || 'Failed to send message. Please try again.';
      this.showError(errorMsg);
      this.isGenerating = false;
    }
  }

  async generateCodeHTTP(prompt) {
    try {
      const url = this.workerUrl ? `${this.workerUrl}/agent/generate` : '/agent/generate';
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, projectType: 'workers' })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      this.hideThinking();
      this.displayGeneratedCode(data);
      this.isGenerating = false;
    } catch (error) {
      console.error('Error generating code:', error);
      this.hideThinking();
      this.showError('Failed to generate code. Please try again.');
      this.isGenerating = false;
    }
  }

  handleWebSocketMessage(data) {
    if (data.type === 'thinking') {
      this.showThinking(data.message);
    } else if (data.type === 'response') {
      this.hideThinking();
      this.addMessage('assistant', data.message);
      this.conversationId = data.conversationId;
      this.isGenerating = false;
    } else if (data.type === 'progress') {
      this.showThinking(data.message);
    } else if (data.type === 'complete') {
      this.hideThinking();
      this.displayGeneratedCode(data);
      this.isGenerating = false;
    } else if (data.type === 'error') {
      this.hideThinking();
      this.showError(data.message);
      this.isGenerating = false;
    }
  }

  addMessage(role, content) {
    const messagesContainer = document.getElementById('chatMessages');
    const welcomeMessage = messagesContainer.querySelector('.welcome-message');
    if (welcomeMessage) {
      welcomeMessage.remove();
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? '👤' : '🤖';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    const formattedContent = this.formatMessage(content);
    contentDiv.innerHTML = formattedContent;
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentDiv);
    messagesContainer.appendChild(messageDiv);
    
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    this.highlightCode(contentDiv);
  }

  // Format markdown-like content for display
  // Converts code blocks and inline code to HTML
  formatMessage(content) {
    let formatted = content.replace(/\n/g, '<br>');
    
    // Handle code blocks
    const codeBlockRegex = /```(\w+)?\n?([\s\S]*?)```/g;
    formatted = formatted.replace(codeBlockRegex, (match, lang, code) => {
      return `<pre><code class="language-${lang || 'typescript'}">${this.escapeHtml(code.trim())}</code></pre>`;
    });
    
    // Handle inline code
    const inlineCodeRegex = /`([^`]+)`/g;
    formatted = formatted.replace(inlineCodeRegex, '<code>$1</code>');
    
    return `<p>${formatted}</p>`;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  highlightCode(container) {
    const codeBlocks = container.querySelectorAll('pre code');
    codeBlocks.forEach(block => {
      const copyBtn = document.createElement('button');
      copyBtn.className = 'copy-btn';
      copyBtn.textContent = 'Copy';
      copyBtn.onclick = () => this.copyToClipboard(block.textContent);
      
      const pre = block.parentElement;
      pre.style.position = 'relative';
      pre.appendChild(copyBtn);
    });
  }

  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      const event = new CustomEvent('copied');
      document.dispatchEvent(event);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }

  showThinking(message = 'Thinking...') {
    const messagesContainer = document.getElementById('chatMessages');
    let thinkingDiv = messagesContainer.querySelector('.thinking');
    
    if (!thinkingDiv) {
      thinkingDiv = document.createElement('div');
      thinkingDiv.className = 'thinking';
      messagesContainer.appendChild(thinkingDiv);
    }
    
    thinkingDiv.innerHTML = `
      <span>${message}</span>
      <div class="thinking-dots">
        <div class="thinking-dot"></div>
        <div class="thinking-dot"></div>
        <div class="thinking-dot"></div>
      </div>
    `;
    
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  hideThinking() {
    const thinkingDiv = document.querySelector('.thinking');
    if (thinkingDiv) {
      thinkingDiv.remove();
    }
  }

  displayGeneratedCode(data) {
    const panelContent = document.getElementById('codePanelContent');
    panelContent.innerHTML = '';
    
    if (data.explanation) {
      const explanationDiv = document.createElement('div');
      explanationDiv.className = 'explanation';
      explanationDiv.textContent = data.explanation;
      panelContent.appendChild(explanationDiv);
    }
    
    if (data.code && data.code.length > 0) {
      data.code.forEach((block, index) => {
        const codeBlockDiv = document.createElement('div');
        codeBlockDiv.className = 'code-block';
        
        const header = document.createElement('div');
        header.className = 'code-block-header';
        
        const title = document.createElement('div');
        title.className = 'code-block-title';
        title.innerHTML = `<span>📄</span> <span>${block.filename || `file${index + 1}.${block.language === 'typescript' ? 'ts' : 'js'}`}</span>`;
        
        const actions = document.createElement('div');
        actions.className = 'code-block-actions';
        
        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-btn';
        copyBtn.textContent = 'Copy';
        copyBtn.onclick = () => this.copyToClipboard(block.code);
        
        actions.appendChild(copyBtn);
        header.appendChild(title);
        header.appendChild(actions);
        
        const content = document.createElement('div');
        content.className = 'code-block-content';
        const pre = document.createElement('pre');
        pre.textContent = block.code;
        content.appendChild(pre);
        
        codeBlockDiv.appendChild(header);
        codeBlockDiv.appendChild(content);
        panelContent.appendChild(codeBlockDiv);
      });
    }
    
    if (data.config) {
      const configBlock = document.createElement('div');
      configBlock.className = 'code-block';
      
      const header = document.createElement('div');
      header.className = 'code-block-header';
      header.innerHTML = '<div class="code-block-title"><span>⚙️</span> <span>wrangler.toml</span></div>';
      
      const content = document.createElement('div');
      content.className = 'code-block-content';
      const pre = document.createElement('pre');
      pre.textContent = data.config;
      content.appendChild(pre);
      
      const copyBtn = document.createElement('button');
      copyBtn.className = 'copy-btn';
      copyBtn.textContent = 'Copy';
      copyBtn.onclick = () => this.copyToClipboard(data.config);
      copyBtn.style.marginLeft = 'auto';
      
      header.appendChild(copyBtn);
      configBlock.appendChild(header);
      configBlock.appendChild(content);
      panelContent.appendChild(configBlock);
    }
    
    if (panelContent.children.length === 0) {
      panelContent.innerHTML = '<div class="empty-state"><p>No code generated</p></div>';
    }
    
    this.openCodePanel();
  }

  openCodePanel() {
    const panel = document.getElementById('codePanel');
    panel.classList.add('open');
  }

  closeCodePanel() {
    const panel = document.getElementById('codePanel');
    panel.classList.remove('open');
  }

  clearChat() {
    const messagesContainer = document.getElementById('chatMessages');
    messagesContainer.innerHTML = `
      <div class="welcome-message">
        <div class="welcome-icon">✨</div>
        <h2>Welcome to Cloudflare Developer Assistant</h2>
        <p>Ask me anything about Cloudflare Workers, or describe a project you want to build.</p>
        <div class="quick-actions">
          <button class="quick-action-btn" data-prompt="How do I create a Cloudflare Worker with D1 database?">
            <span>💾</span>
            <span>D1 Database Setup</span>
          </button>
          <button class="quick-action-btn" data-prompt="Generate a Workers API that stores data in R2 and serves images">
            <span>🖼️</span>
            <span>R2 Image API</span>
          </button>
          <button class="quick-action-btn" data-prompt="Create a real-time chat app using Durable Objects">
            <span>💬</span>
            <span>Durable Objects Chat</span>
          </button>
          <button class="quick-action-btn" data-prompt="Build a RAG application with Vectorize and Workers AI">
            <span>🔍</span>
            <span>RAG with Vectorize</span>
          </button>
        </div>
      </div>
    `;
    
    this.conversationId = null;
    this.setupEventListeners();
  }

  showError(message) {
    const messagesContainer = document.getElementById('chatMessages');
    const welcomeMessage = messagesContainer.querySelector('.welcome-message');
    if (welcomeMessage) {
      welcomeMessage.remove();
    }
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'message assistant';
    errorDiv.innerHTML = `
      <div class="message-avatar">⚠️</div>
      <div class="message-content" style="border-color: var(--error); background: rgba(245, 101, 101, 0.1);">
        <p><strong>Error:</strong> ${message}</p>
        <p style="font-size: 0.85em; margin-top: 0.5rem; opacity: 0.8;">Check the browser console (F12) for more details.</p>
      </div>
    `;
    messagesContainer.appendChild(errorDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new DeveloperAssistant();
});

