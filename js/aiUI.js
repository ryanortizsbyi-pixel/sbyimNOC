/**
 * SBYIM AI Assistant - Chat Interface Controller
 * 
 * Features:
 * - User and Assistant chat bubbles
 * - Text input with Enter-to-send and Shift+Enter for new line
 * - Ask button with icon & loading spinner
 * - Loading indicator state with disabled buttons
 * - Clear-chat button with reset confirmation
 * - Clickable source badges that open document preview
 * - Readable multiline markdown-rendered answers
 * - Robust error handling
 * - Quick prompt suggestion chips
 * - Category source filtering (All Sources, NOC Requirements, SBYI Code of Conduct)
 * - Approved documents knowledge base inspector
 */

class SBYIM_AI_UI {
  constructor() {
    this.isOpen = false;
    this.isLoading = false;
    this.activeCategory = 'AI Documents'; // Strictly 'AI Documents'
    this.messages = []; // Array of { id, role: 'user'|'assistant', text, sources, timestamp }
  }

  /**
   * Initializes AI Assistant UI components and event bindings
   */
  init() {
    this.bindEvents();
    this.renderWelcomeState();
    this.updateRoleView();
  }

  /**
   * Update UI elements based on user role (Hide knowledge scope and Approved Docs button for SBYIM and Guest)
   */
  updateRoleView() {
    const isDeveloper = window.nocAuth && window.nocAuth.isDeveloper && window.nocAuth.isDeveloper();
    const isGuest = window.nocAuth && window.nocAuth.isGuest();
    const isSBYIM = window.nocAuth && window.nocAuth.isSBYIM();
    const isRestricted = isGuest || isSBYIM;

    // Toggle Floating Action Button (FAB) - Strictly Developer only
    const btnFabAI = document.getElementById('btnFloatingAIAssistant');
    if (btnFabAI) {
      btnFabAI.style.display = isDeveloper ? 'inline-flex' : 'none';
    }

    const btnNavAI = document.getElementById('btnNavAIAssistant');
    if (btnNavAI) {
      btnNavAI.style.display = isDeveloper ? 'inline-flex' : 'none';
    }

    if (!isDeveloper && this.isOpen) {
      this.closeAssistant();
    }

    const categoryBar = document.getElementById('aiCategoryBar');
    if (categoryBar) {
      categoryBar.style.display = isRestricted ? 'none' : 'flex';
    }
    this.activeCategory = 'AI Documents';

    // Hide Approved Docs button from AI Assistant
    const btnAiInspectKB = document.getElementById('btnAiInspectKB');
    if (btnAiInspectKB) {
      btnAiInspectKB.style.display = 'none';
    }

    // Hide active approved documents count badge for SBYIM and Guest users (Admin only)
    const kbStatusBadge = document.getElementById('aiKbStatusBadge');
    if (kbStatusBadge) {
      kbStatusBadge.style.display = isRestricted ? 'none' : 'flex';
    }

    // Close knowledge inspector drawer if open when restricted
    if (isRestricted) {
      const drawer = document.getElementById('aiKbInspectorDrawer');
      if (drawer) drawer.classList.remove('open');
    }
  }

  /**
   * Open the AI Assistant modal
   */
  async openAssistant() {
    const modal = document.getElementById('sbyimAIModal');
    if (modal) {
      modal.classList.add('active');
      this.isOpen = true;
      
      // Update role view (hide knowledge scope if guest)
      this.updateRoleView();

      // Auto-sync knowledge base on open
      if (window.sbyimKnowledgeBase) {
        await window.sbyimKnowledgeBase.syncKnowledgeBase();
        this.updateKnowledgeStatusBadge();
      }

      // Focus input field
      const input = document.getElementById('aiChatInput');
      if (input) {
        setTimeout(() => input.focus(), 200);
      }
    }
  }

  /**
   * Bind all user interactions
   */
  bindEvents() {
    // 1. Top Navbar Button Launcher
    const btnNavAI = document.getElementById('btnNavAIAssistant');
    if (btnNavAI) {
      btnNavAI.addEventListener('click', () => this.openAssistant());
    }

    // 2. Floating Action Button (FAB)
    const btnFabAI = document.getElementById('btnFloatingAIAssistant');
    if (btnFabAI) {
      btnFabAI.addEventListener('click', () => this.toggleAssistant());
    }

    // 3. Modal Close Buttons
    const btnCloseModal = document.getElementById('btnCloseAIModal');
    const btnCloseFooter = document.getElementById('btnCloseAIFooter');
    if (btnCloseModal) btnCloseModal.addEventListener('click', () => this.closeAssistant());
    if (btnCloseFooter) btnCloseFooter.addEventListener('click', () => this.closeAssistant());

    // 4. Modal Backdrop Click
    const modalOverlay = document.getElementById('sbyimAIModal');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) this.closeAssistant();
      });
    }

    // 5. Ask Button & Form Submission
    const btnAsk = document.getElementById('btnAiAsk');
    const inputArea = document.getElementById('aiChatInput');
    const chatForm = document.getElementById('aiChatForm');

    if (chatForm) {
      chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSendQuery();
      });
    }

    if (btnAsk) {
      btnAsk.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleSendQuery();
      });
    }

    // 6. Enter-to-send support (Shift+Enter for newline)
    if (inputArea) {
      inputArea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handleSendQuery();
        }
      });

      // Auto-resize input height on typing
      inputArea.addEventListener('input', () => {
        inputArea.style.height = 'auto';
        inputArea.style.height = Math.min(inputArea.scrollHeight, 140) + 'px';
      });
    }

    // 7. Clear Chat Button
    const btnClearChat = document.getElementById('btnAiClearChat');
    if (btnClearChat) {
      btnClearChat.addEventListener('click', () => this.clearChat());
    }

    // 8. Category Filter Buttons
    const catButtons = document.querySelectorAll('.ai-cat-filter-btn');
    catButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        catButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeCategory = btn.getAttribute('data-cat') || 'all';
        this.updateCategoryBadge();
      });
    });

    // 9. Knowledge Inspector Button
    const btnInspectKB = document.getElementById('btnAiInspectKB');
    if (btnInspectKB) {
      btnInspectKB.addEventListener('click', () => this.toggleKnowledgeInspector());
    }

    // 10. Global Keyboard Shortcut (Ctrl+Space / Alt+A)
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey && e.code === 'Space') || (e.altKey && (e.key === 'a' || e.key === 'A'))) {
        const isDeveloper = window.nocAuth && window.nocAuth.isDeveloper && window.nocAuth.isDeveloper();
        if (!isDeveloper) return;
        e.preventDefault();
        this.toggleAssistant();
      }
    });
  }

  /**
   * Open the AI Assistant modal
   */
  async openAssistant() {
    const isDeveloper = window.nocAuth && window.nocAuth.isDeveloper && window.nocAuth.isDeveloper();
    if (!isDeveloper) {
      return;
    }
    const modal = document.getElementById('sbyimAIModal');
    if (modal) {
      modal.classList.add('active');
      this.isOpen = true;
      
      // Auto-sync knowledge base on open
      if (window.sbyimKnowledgeBase) {
        await window.sbyimKnowledgeBase.syncKnowledgeBase();
        this.updateKnowledgeStatusBadge();
      }

      // Focus input field
      const input = document.getElementById('aiChatInput');
      if (input) {
        setTimeout(() => input.focus(), 200);
      }
    }
  }

  /**
   * Close the AI Assistant modal
   */
  closeAssistant() {
    const modal = document.getElementById('sbyimAIModal');
    if (modal) {
      modal.classList.remove('active');
      this.isOpen = false;
    }
  }

  /**
   * Toggle the AI Assistant open/close state
   */
  toggleAssistant() {
    const isDeveloper = window.nocAuth && window.nocAuth.isDeveloper && window.nocAuth.isDeveloper();
    if (!isDeveloper) {
      return;
    }
    if (this.isOpen) {
      this.closeAssistant();
    } else {
      this.openAssistant();
    }
  }

  /**
   * Update the Knowledge Base Status Badge in Header (Admin only)
   */
  updateKnowledgeStatusBadge() {
    const badge = document.getElementById('aiKbStatusBadge');
    if (!badge || !window.sbyimKnowledgeBase) return;

    const isGuest = window.nocAuth && window.nocAuth.isGuest();
    const isSBYIM = window.nocAuth && window.nocAuth.isSBYIM();
    const isRestricted = isGuest || isSBYIM;

    badge.style.display = isRestricted ? 'none' : 'flex';

    const docs = window.sbyimKnowledgeBase.getApprovedDocuments();
    badge.innerHTML = `
      <span class="ai-status-pulse"></span>
      <span>${docs.length} Approved AI ${docs.length === 1 ? 'Document' : 'Documents'} Active</span>
    `;
  }

  /**
   * Update category indicator
   */
  updateCategoryBadge() {
    const filterNotice = document.getElementById('aiActiveFilterNotice');
    if (!filterNotice) return;
    filterNotice.textContent = 'Grounded strictly in approved AI Documents';
  }

  /**
   * Handles user submission of a query
   */
  async handleSendQuery() {
    if (this.isLoading) return;

    const input = document.getElementById('aiChatInput');
    if (!input) return;

    const query = input.value.trim();
    if (!query) return;

    // 1. Append User Message
    this.addMessage({
      id: 'msg_' + Date.now(),
      role: 'user',
      text: query,
      timestamp: new Date()
    });

    // Reset input
    input.value = '';
    input.style.height = 'auto';

    // 2. Set Loading State
    this.setLoading(true);

    try {
      // 3. Process Query with Strict Grounded RAG Engine
      const result = await window.sbyimAIEngine.ask(query, this.activeCategory);

      // Brief natural reading delay for smooth UX
      await new Promise(r => setTimeout(r, 450));

      // 4. Append Assistant Response
      this.addMessage({
        id: 'msg_asst_' + Date.now(),
        role: 'assistant',
        text: result.answerText,
        isFound: result.isFound,
        sources: result.sources || [],
        timestamp: new Date()
      });
    } catch (err) {
      console.error('SBYIM AI Query Error:', err);
      this.addMessage({
        id: 'msg_err_' + Date.now(),
        role: 'assistant',
        text: "I could not find this information in the approved documents.",
        isFound: false,
        sources: [],
        timestamp: new Date()
      });
    } finally {
      this.setLoading(false);
      const inputRefocus = document.getElementById('aiChatInput');
      if (inputRefocus) inputRefocus.focus();
    }
  }

  /**
   * Adds a message to state and DOM
   */
  addMessage(msg) {
    this.messages.push(msg);

    const streamContainer = document.getElementById('aiMessageStream');
    if (!streamContainer) return;

    // Remove empty welcome placeholder if present
    const emptyState = document.getElementById('aiEmptyState');
    if (emptyState) emptyState.remove();

    const msgEl = document.createElement('div');
    msgEl.className = `ai-message-row ${msg.role}`;
    msgEl.id = msg.id;

    const timeString = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

    if (msg.role === 'user') {
      msgEl.innerHTML = `
        <div class="ai-msg-bubble user">
          <div class="ai-msg-content">${this.escapeHTML(msg.text)}</div>
          <div class="ai-msg-time">${timeString}</div>
        </div>
        <div class="ai-avatar user" title="You">👤</div>
      `;
    } else {
      // Assistant Message
      const formattedHTML = this.formatMarkdown(msg.text);

      msgEl.innerHTML = `
        <div class="ai-avatar assistant" title="SBYIM AI Assistant">
          <img src="assets/sbyim_logo.jpg" alt="AI" class="ai-avatar-img">
        </div>
        <div class="ai-msg-bubble assistant ${msg.isFound === false ? 'not-found' : ''}">
          <div class="ai-msg-header">
            <span class="ai-msg-author">SBYIM AI Assistant</span>
            <span class="ai-msg-shield-badge">🛡️ Verified Approved Source</span>
          </div>
          <div class="ai-msg-content">${formattedHTML}</div>
          <div class="ai-msg-footer">
            <div class="ai-msg-time">${timeString}</div>
            <button type="button" class="ai-copy-btn" title="Copy answer to clipboard" onclick="window.sbyimAIUI.copyMessageText('${msg.id}')">
              📋 Copy
            </button>
          </div>
        </div>
      `;
    }

    streamContainer.appendChild(msgEl);
    this.scrollToBottom();
  }

  /**
   * Renders clickable source badges (disabled to keep answers clean)
   */
  renderSourceBadges(sources) {
    return '';
  }

  /**
   * Open the clicked source document in the portal's in-app document viewer
   */
  async openSourceDocument(docId, filename, category) {
    try {
      const docList = await window.nocDB.getAiDocs();
      const docIdx = (docList || []).findIndex(d => d.id === docId || d.name === filename);

      if (docList && docList.length > 0 && docIdx !== -1) {
        window.docViewer.open(docList, docIdx, `AI Documents - ${filename}`, { allowFullPages: true });
      } else {
        window.showToast(`Document "${filename}" is verified in the approved AI Documents.`, 'info');
      }
    } catch (e) {
      console.warn('Error opening source document:', e);
      window.showToast(`Viewing approved source: ${filename}`, 'info');
    }
  }

  /**
   * Sets loading spinner state and disables input/ask button
   */
  setLoading(loading) {
    this.isLoading = loading;
    const btnAsk = document.getElementById('btnAiAsk');
    const inputArea = document.getElementById('aiChatInput');
    const streamContainer = document.getElementById('aiMessageStream');

    if (loading) {
      if (btnAsk) {
        btnAsk.disabled = true;
        btnAsk.innerHTML = `
          <span class="ai-spinner"></span>
          <span>Searching...</span>
        `;
      }
      if (inputArea) {
        inputArea.disabled = true;
      }

      // Add temporary typing indicator
      const typingEl = document.createElement('div');
      typingEl.className = 'ai-message-row assistant ai-typing-row';
      typingEl.id = 'aiTypingIndicator';
      typingEl.innerHTML = `
        <div class="ai-avatar assistant">
          <img src="assets/sbyim_logo.jpg" alt="AI" class="ai-avatar-img">
        </div>
        <div class="ai-msg-bubble assistant typing">
          <div class="ai-typing-dots">
            <span></span><span></span><span></span>
          </div>
          <span class="ai-typing-text">Retrieving approved knowledge...</span>
        </div>
      `;
      if (streamContainer) {
        streamContainer.appendChild(typingEl);
        this.scrollToBottom();
      }
    } else {
      if (btnAsk) {
        btnAsk.disabled = false;
        btnAsk.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
          <span>Ask</span>
        `;
      }
      if (inputArea) {
        inputArea.disabled = false;
      }

      const typingEl = document.getElementById('aiTypingIndicator');
      if (typingEl) typingEl.remove();
    }
  }

  /**
   * Clear entire chat conversation
   */
  clearChat() {
    this.messages = [];
    const streamContainer = document.getElementById('aiMessageStream');
    if (streamContainer) {
      streamContainer.innerHTML = '';
      this.renderWelcomeState();
    }
    const input = document.getElementById('aiChatInput');
    if (input) {
      input.value = '';
      input.style.height = 'auto';
    }
  }

  /**
   * Renders the initial welcome banner
   */
  renderWelcomeState() {
    const streamContainer = document.getElementById('aiMessageStream');
    if (!streamContainer) return;

    streamContainer.innerHTML = `
      <div class="ai-empty-state" id="aiEmptyState">
        <div class="ai-welcome-card">
          <div class="ai-welcome-header">
            <div class="ai-welcome-logo-box">
              <img src="assets/sbyim_logo.jpg" alt="SBYIM" class="ai-welcome-logo">
            </div>
            <div>
              <h3 class="ai-welcome-title">SBYIM AI Assistant</h3>
              <p class="ai-welcome-subtitle">Official Q&A Assistant grounded strictly in Approved AI Documents</p>
            </div>
          </div>

          <div class="ai-rule-callout">
            <div class="ai-rule-badge">🔒 CORE RULE &amp; STRICT GROUNDING</div>
            <p>
              The AI answers user questions using <strong>ONLY</strong> information retrieved from documents uploaded and approved under 
              <strong>AI Documents</strong>. No file outside the uploaded and approved AI Documents is used.
            </p>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Pre-fills and sends a suggested question
   */
  askSuggested(question) {
    const input = document.getElementById('aiChatInput');
    if (input) {
      input.value = question;
      this.handleSendQuery();
    }
  }

  /**
   * Copy message text to user clipboard
   */
  async copyMessageText(msgId) {
    const msg = this.messages.find(m => m.id === msgId);
    if (!msg) return;

    try {
      await navigator.clipboard.writeText(msg.text);
      window.showToast('Response copied to clipboard!', 'success');
    } catch (e) {
      window.showToast('Could not copy text.', 'error');
    }
  }

  /**
   * Toggles the Approved Documents Knowledge Inspector view
   */
  toggleKnowledgeInspector() {
    const drawer = document.getElementById('aiKbInspectorDrawer');
    if (!drawer) return;

    if (drawer.classList.contains('active')) {
      drawer.classList.remove('active');
    } else {
      drawer.classList.add('active');
      this.renderKnowledgeInspectorList();
    }
  }

  /**
   * Renders the list of approved documents inside the inspector
   */
  renderKnowledgeInspectorList() {
    const container = document.getElementById('aiKbDocsList');
    if (!container || !window.sbyimKnowledgeBase) return;

    const docs = window.sbyimKnowledgeBase.getApprovedDocuments();

    if (!docs || docs.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:1.5rem; color:var(--text-muted); font-size:0.85rem;">
          No approved AI Documents found. Upload documents via the "AI Documents" button in the top navigation bar.
        </div>
      `;
      return;
    }

    container.innerHTML = docs.map(d => {
      return `
        <div class="ai-inspector-doc-card">
          <div class="ai-inspector-doc-badge aidoc" style="background:#EEF2FF; color:#4F46E5; border-color:#C7D2FE;">
            🤖 AI Documents
          </div>
          <div class="ai-inspector-doc-name">${this.escapeHTML(d.name)}</div>
          <div class="ai-inspector-doc-meta">
            <span>Status: <strong style="color:var(--accent-green);">Approved & Active</strong></span>
            <span>•</span>
            <span>Source: ${this.escapeHTML(d.source || 'Approved AI Document')}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Enhanced and secure markdown to HTML converter preserving exact original document layout
   * Reduces line spacing and eliminates forced bullet points
   */
  formatMarkdown(text) {
    if (!text) return '';
    let html = this.escapeHTML(text);

    // Bold (**text**)
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Italic (*text*)
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Inline code (`text`)
    html = html.replace(/`(.*?)`/g, '<code>$1</code>');

    // Headings (### Title and #### Subtitle)
    html = html.replace(/^###\s+(.*?)$/gm, '<h4 class="ai-ans-h4">$1</h4>');
    html = html.replace(/^####\s+(.*?)$/gm, '<h5 class="ai-ans-h5">$1</h5>');

    // Callout quotes (> Note)
    html = html.replace(/^>\s*(.*?)$/gm, '<div class="ai-ans-callout">$1</div>');

    // Horizontal rules (---)
    html = html.replace(/^\s*---\s*$/gm, '<hr class="ai-msg-divider">');

    // Paragraph breaks (double newlines to compact paragraph tag)
    html = html.replace(/\n\n+/g, '</p><p class="ai-ans-p">');
    // Single newlines to line breaks without bullet discs
    html = html.replace(/\n/g, '<br>');

    // Clean up empty paragraphs around headings, dividers, and callouts
    html = html.replace(/<p class="ai-ans-p">\s*<\/p>/g, '');
    html = html.replace(/<p class="ai-ans-p">\s*(<h[45][^>]*>.*?<\/h[45]>)\s*<\/p>/g, '$1');
    html = html.replace(/<p class="ai-ans-p">\s*(<div class="ai-ans-callout">.*?<\/div>)\s*<\/p>/g, '$1');
    html = html.replace(/<p class="ai-ans-p">\s*(<hr[^>]*>)\s*<\/p>/g, '$1');

    return `<div class="ai-formatted-body"><p class="ai-ans-p">${html}</p></div>`;
  }

  /**
   * Escape HTML special characters
   */
  escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Smoothly scroll message container to bottom
   */
  scrollToBottom() {
    const stream = document.getElementById('aiMessageStream');
    if (stream) {
      setTimeout(() => {
        stream.scrollTop = stream.scrollHeight;
      }, 50);
    }
  }
}

window.SBYIM_AI_UI = SBYIM_AI_UI;
window.sbyimAIUI = new SBYIM_AI_UI();
