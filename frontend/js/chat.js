// Chat UI: send, render, stream, and small helpers

const API_BASE = '/api';
let conversationId = null;
let isProcessing = false;

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
                const docName = source.documentName || source.document || 'Unknown';
                const chunkInfo = source.chunkIndex !== undefined ? ` (chunk ${source.chunkIndex})` : '';
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
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    // Keep only the welcome message
    const welcomeMessage = chatMessages.querySelector('.chat-message.assistant');
    chatMessages.innerHTML = '';
    if (welcomeMessage) {
        chatMessages.appendChild(welcomeMessage.cloneNode(true));
    }

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
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeChat);
} else {
    initializeChat();
}
