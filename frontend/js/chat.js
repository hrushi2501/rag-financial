// Chat UI: send, render, stream, and small helpers


const API_BASE = '/api';
let conversationId = null;
let isProcessing = false;

// Chat session management
const CHAT_HISTORY_KEY = 'finrag_chat_history_v1';
let currentChatId = null;
let chatHistory = {};

function loadChatHistory() {
    try {
        chatHistory = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || '{}');
    } catch {
        chatHistory = {};
    }
}

function saveChatHistory() {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(chatHistory));
}

function deleteChatSession(id) {
    if (!chatHistory[id]) return;
    if (confirm(`Delete "${chatHistory[id].title}"?`)) {
        delete chatHistory[id];
        saveChatHistory();
        // If deleting current chat, switch to another or create new
        if (id === currentChatId) {
            const remaining = Object.keys(chatHistory);
            if (remaining.length > 0) {
                loadChatSession(remaining[0]);
            } else {
                createNewChatSession();
            }
        }
        renderChatHistoryList();
    }
}

function renameChatSession(id) {
    if (!chatHistory[id]) return;
    const newTitle = prompt('Rename chat:', chatHistory[id].title);
    if (newTitle && newTitle.trim()) {
        chatHistory[id].title = newTitle.trim();
        saveChatHistory();
        renderChatHistoryList();
    }
}

function createNewChatSession() {
    const id = 'chat_' + Date.now();
    chatHistory[id] = {
        id,
        title: 'New Chat',
        created: new Date().toISOString(),
        messages: []
    };
    currentChatId = id;
    saveChatHistory();
    renderChatHistoryList();
    loadChatSession(id);
}

function setChatTitle(id, title) {
    if (chatHistory[id]) {
        chatHistory[id].title = title;
        saveChatHistory();
        renderChatHistoryList();
    }
}

function renderChatHistoryList() {
    const list = document.getElementById('chatHistoryList');
    if (!list) return;
    list.innerHTML = '';
    // Sort by most recent
    const items = Object.values(chatHistory).sort((a, b) => new Date(b.created) - new Date(a.created));
    for (const chat of items) {
        const li = document.createElement('li');
        li.className = (chat.id === currentChatId ? 'active' : '');
        li.innerHTML = `
            <i class="fas fa-comments"></i> 
            <span class="chat-title">${chat.title || 'Untitled'}</span>
            <button class="chat-delete-btn" title="Delete chat">
                <i class="fas fa-trash"></i>
            </button>
        `;
        
        // Click to load chat (but not on delete button)
        li.addEventListener('click', (e) => {
            if (!e.target.closest('.chat-delete-btn')) {
                if (chat.id !== currentChatId) {
                    loadChatSession(chat.id);
                }
            }
        });
        
        // Delete button
        const deleteBtn = li.querySelector('.chat-delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteChatSession(chat.id);
            });
        }
        
        // Right-click context menu
        li.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showContextMenu(e.clientX, e.clientY, chat.id);
        });
        
        list.appendChild(li);
    }
}

function showContextMenu(x, y, chatId) {
    const menu = document.getElementById('chatContextMenu');
    if (!menu) return;
    
    // Position menu
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.classList.add('show');
    
    // Handle menu clicks
    const handleMenuClick = (e) => {
        const item = e.target.closest('.chat-context-menu-item');
        if (!item) return;
        
        const action = item.dataset.action;
        if (action === 'rename') {
            renameChatSession(chatId);
        } else if (action === 'delete') {
            deleteChatSession(chatId);
        }
        
        hideContextMenu();
    };
    
    // Remove old listeners and add new
    menu.removeEventListener('click', handleMenuClick);
    menu.addEventListener('click', handleMenuClick);
}

function hideContextMenu() {
    const menu = document.getElementById('chatContextMenu');
    if (menu) {
        menu.classList.remove('show');
    }
}

// Hide context menu when clicking elsewhere
document.addEventListener('click', (e) => {
    if (!e.target.closest('.chat-context-menu')) {
        hideContextMenu();
    }
});

function loadChatSession(id) {
    if (!chatHistory[id]) return;
    currentChatId = id;
    conversationId = null;
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    chatMessages.innerHTML = '';
    // Welcome message
    const welcomeDiv = document.createElement('div');
    welcomeDiv.className = 'chat-message assistant';
    welcomeDiv.innerHTML = `
        <div class="message-avatar"><i class="fas fa-robot"></i></div>
        <div class="message-content"><p>Hello! I'm your financial document assistant. Ask me anything about your uploaded documents.</p></div>
    `;
    chatMessages.appendChild(welcomeDiv);
    // Render chat messages
    for (const msg of chatHistory[id].messages) {
        displayMessage(msg.content, msg.isUser, msg.sources, msg.isError, msg.timestamp);
    }
    renderChatHistoryList();
}

function saveMessageToCurrentChat(content, isUser, sources = null, isError = false) {
    if (!currentChatId || !chatHistory[currentChatId]) return;
    chatHistory[currentChatId].messages.push({
        content,
        isUser,
        sources,
        isError,
        timestamp: new Date().toISOString()
    });
    saveChatHistory();
}

function clearCurrentChat() {
    if (!currentChatId || !chatHistory[currentChatId]) return;
    chatHistory[currentChatId].messages = [];
    saveChatHistory();
    loadChatSession(currentChatId);
}

function setupSidebarToggle() {
    const sidebar = document.getElementById('chatSidebar');
    const toggleBtn = document.getElementById('toggleSidebarBtn');
    const showSidebarBtn = document.getElementById('showSidebarBtn');
    if (sidebar && toggleBtn && showSidebarBtn) {
        toggleBtn.onclick = () => {
            sidebar.classList.add('collapsed');
            // show the floating button immediately so user always has a target
            showSidebarBtn.style.display = 'flex';
        };
        showSidebarBtn.onclick = () => {
            sidebar.classList.remove('collapsed');
            showSidebarBtn.style.display = 'none';
        };
    }
}

// Send a message
async function sendMessage(message) {
    if (!message || message.trim().length === 0) {
        showNotification('Please enter a message', 'warning');
        return;
    }

    if (isProcessing) {
        showNotification('Please wait for the current response', 'warning');
        return;
    }

    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const chatSendBtn = document.getElementById('chatSendBtn');
    const includeContext = document.getElementById('includeContext')?.checked ?? true;
    const topK = parseInt(document.getElementById('contextTopK')?.value || '5');

    try {
        isProcessing = true;

    // Disable input while processing
        if (chatInput) chatInput.disabled = true;
        if (chatSendBtn) chatSendBtn.disabled = true;

    // Show user message
        displayMessage(message, true);
        saveMessageToCurrentChat(message, true);

    // Typing indicator
        showTypingIndicator();

        // Send to API
        const response = await fetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message,
                conversationId,
                topK,
                includeContext
            })
        });

        if (!response.ok) {
            let msg = `HTTP ${response.status}`;
            try {
                const errorData = await response.json();
                msg = errorData.error || msg;
            } catch {}
            const error = new Error(msg);
            error.status = response.status;
            try {
                const errorData = await response.clone().json();
                error.retryable = errorData.retryable;
            } catch {}
            throw error;
        }

        const data = await response.json();

    // Hide typing indicator
        hideTypingIndicator();

        if (data.success) {
            // Show bot response
            displayMessage(data.response || data.answer, false, data.citations || data.sources);
            saveMessageToCurrentChat(data.response || data.answer, false, data.citations || data.sources);

            // Update conversation ID
            if (data.conversationId) {
                conversationId = data.conversationId;
            }

            // Scroll
            scrollChatToBottom();
        } else {
            throw new Error(data.error || 'Failed to get response');
        }

    } catch (error) {
        console.error('Chat error:', error);
        hideTypingIndicator();
        const issue = deriveNetworkIssue(error);
        const retryHint = error.retryable ? ' (retrying...)' : '';
        displayMessage(
            `Sorry, I encountered an error: ${error.message}${issue ? ` — ${issue}` : ''}${retryHint}`,
            false,
            null,
            true
        );
        saveMessageToCurrentChat(
            `Error: ${error.message}`,
            false,
            null,
            true
        );
        if (error.retryable && message) {
            setTimeout(() => {
                console.log('Auto-retrying message...');
                sendMessage(message);
            }, 3000);
        }
    } finally {
        isProcessing = false;
        if (chatInput) {
            chatInput.disabled = false;
            chatInput.focus();
        }
        if (chatSendBtn) chatSendBtn.disabled = false;
    }
}

// Render a message
function displayMessage(content, isUser, sources = null, isError = false) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${isUser ? 'user' : 'assistant'} ${isError ? 'error' : ''}`;

    // Avatar
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = isUser ?
        '<i class="fas fa-user"></i>' :
        '<i class="fas fa-robot"></i>';

    // Content
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    // Format message with basic markdown support
    const formattedContent = formatResponse(content);
    contentDiv.innerHTML = `<p>${formattedContent}</p>`;

    // Sources
    if (sources && sources.length > 0) {
        const sourcesDiv = document.createElement('div');
        sourcesDiv.className = 'message-sources';
        sourcesDiv.innerHTML = '<strong>Sources:</strong> ' +
            sources.map(source => {
                // Prefer backend citation fields; gracefully fallback to older shapes
                const docName = (
                    source.filename ||
                    source.documentName ||
                    source.document ||
                    source.name ||
                    source.file ||
                    (source.metadata && (source.metadata.filename || source.metadata.file)) ||
                    'Unknown'
                );
                const idx = (source.chunk_index !== undefined && source.chunk_index !== null)
                    ? source.chunk_index
                    : source.chunkIndex;
                const chunkInfo = (idx !== undefined && idx !== null) ? ` (chunk ${idx})` : '';
                return `<span class="source-chip" title="${docName}">${docName}${chunkInfo}</span>`;
            }).join(' ');
        contentDiv.appendChild(sourcesDiv);
    }

    // Timestamp
    const timestamp = document.createElement('div');
    timestamp.className = 'message-timestamp';
    timestamp.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    contentDiv.appendChild(timestamp);

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);

    scrollChatToBottom();
}

// Basic markdown formatting
function formatResponse(text) {
    if (!text) return '';

    // Escape HTML first
    text = text.replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Bold: **text** or __text__
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__(.*?)__/g, '<strong>$1</strong>');

    // Italic: *text* or _text_
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    text = text.replace(/_(.*?)_/g, '<em>$1</em>');

    // Code: `text`
    text = text.replace(/`(.*?)`/g, '<code>$1</code>');

    // Line breaks
    text = text.replace(/\n/g, '<br>');

    // Bullet points
    text = text.replace(/^[\-\*]\s+(.+)$/gm, '<li>$1</li>');
    if (text.includes('<li>')) {
        text = '<ul>' + text + '</ul>';
    }

    return text;
}

// Typing indicator
function showTypingIndicator() {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    // Remove existing indicator
    const existing = document.getElementById('typingIndicator');
    if (existing) existing.remove();

    const indicatorDiv = document.createElement('div');
    indicatorDiv.id = 'typingIndicator';
    indicatorDiv.className = 'chat-message assistant typing';
    indicatorDiv.innerHTML = `
        <div class="message-avatar">
            <i class="fas fa-robot"></i>
        </div>
        <div class="message-content">
            <div class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;

    chatMessages.appendChild(indicatorDiv);
    scrollChatToBottom();
}

// Hide typing indicator
function hideTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
        indicator.remove();
    }
}

// Scroll to bottom
function scrollChatToBottom() {
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

// Clear chat
function clearChat() {
    clearCurrentChat();
    conversationId = null;
    showNotification('Chat cleared', 'success');
}

// Toast
function showNotification(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <i class="fas fa-${getIconForType(type)}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    // Auto-remove after 3 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Icon map
function getIconForType(type) {
    const icons = {
        success: 'check-circle',
        warning: 'exclamation-triangle',
        error: 'times-circle',
        info: 'info-circle'
    };
    return icons[type] || 'info-circle';
}

// Friendly network explanation
function deriveNetworkIssue(error) {
    if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) {
        return 'Internet disconnected';
    }
    if (error && (error.name === 'TypeError' || /Failed to fetch/i.test(error.message))) {
        return 'Network error or CORS blocked';
    }
    if (error && error.status) {
        const code = error.status;
        if (code === 429) return 'Rate limited by API';
        if (code === 503) return 'Service temporarily unavailable';
        if (code === 500) return 'Server error';
        if (code === 404) return 'Endpoint not found';
        if (code >= 400 && code < 500) return 'Client error';
        if (code >= 500) return 'Server error';
    }
    return '';
}

// Init chat
function initializeChat() {
    const chatInput = document.getElementById('chatInput');
    const chatSendBtn = document.getElementById('chatSendBtn');
    const chatClearBtn = document.getElementById('chatClearBtn');

    // Send button
    if (chatSendBtn) {
        chatSendBtn.addEventListener('click', () => {
            const message = chatInput?.value.trim();
            if (message) {
                sendMessage(message);
                if (chatInput) chatInput.value = '';
            }
        });
    }

    // Enter to send (Shift+Enter = newline)
    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                chatSendBtn?.click();
            }
        });

        // Auto-resize textarea
        chatInput.addEventListener('input', () => {
            chatInput.style.height = 'auto';
            chatInput.style.height = chatInput.scrollHeight + 'px';
        });
    }

    // Clear button
    if (chatClearBtn) {
        chatClearBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to clear the chat history?')) {
                clearChat();
            }
        });
    }

    // New Chat button
    const newChatBtn = document.getElementById('newChatBtn');
    if (newChatBtn) {
        newChatBtn.addEventListener('click', () => {
            createNewChatSession();
        });
    }

    // Sidebar toggle
    setupSidebarToggle();

    // Load chat history and initialize
    loadChatHistory();
    if (Object.keys(chatHistory).length === 0) {
        createNewChatSession();
    } else {
        // Load most recent chat
        const mostRecent = Object.values(chatHistory).sort((a, b) => new Date(b.created) - new Date(a.created))[0];
        loadChatSession(mostRecent.id);
    }
    renderChatHistoryList();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeChat);
} else {
    initializeChat();
}
