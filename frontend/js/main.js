// App shell: theme, nav, health, docs list

// Global state
let currentView = 'upload';
const THEME_KEY = 'financial-rag-theme';

// Theme
function initTheme() {
    const saved = localStorage.getItem(THEME_KEY) || 'dark';
    setTheme(saved);
    const btn = document.getElementById('themeToggle');
    if (btn) {
    // sync aria-checked
        btn.setAttribute('aria-checked', document.body.classList.contains('dark') ? 'true' : 'false');
        btn.addEventListener('click', () => {
            const isDark = document.body.classList.contains('dark');
            setTheme(isDark ? 'light' : 'dark');
        });
    }
}

function setTheme(mode) {
    if (mode === 'light') {
        document.body.classList.remove('dark');
        document.body.classList.add('light');
    } else {
        document.body.classList.remove('light');
        document.body.classList.add('dark');
        mode = 'dark';
    }
    localStorage.setItem(THEME_KEY, mode);
    const btn = document.getElementById('themeToggle');
    if (btn) {
    // aria-checked reflects dark mode
        const isDark = mode === 'dark';
        btn.setAttribute('aria-checked', isDark ? 'true' : 'false');
    }
}

// View switcher
function switchView(viewName) {
    // Hide all views
    const views = document.querySelectorAll('.view');
    views.forEach(view => view.classList.remove('active'));

    // Update nav buttons
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => btn.classList.remove('active'));

    // Show selected view
    const selectedView = document.getElementById(`${viewName}View`);
    if (selectedView) {
        selectedView.classList.add('active');
        currentView = viewName;
    }

    // Update active nav button
    const activeBtn = document.querySelector(`[data-view="${viewName}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }

    // Lazy-load per view
    if (viewName === 'documents') {
        loadDocumentsList();
    }
}

// Health
async function checkSystemHealth() {
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');

    try {
        const response = await fetch('/api/health');
        const data = await response.json();

        // Map to Online/Degraded/Offline
        if (data.status === 'healthy') {
            statusIndicator.className = 'status-indicator healthy';
            statusText.textContent = 'Online';
        } else if (data.status === 'degraded' || (data.details && (data.details.embeddings === 'unavailable' || data.details.pinecone === 'unavailable'))) {
            statusIndicator.className = 'status-indicator degraded';
            statusText.textContent = 'Degraded';
        } else {
            statusIndicator.className = 'status-indicator unhealthy';
            statusText.textContent = 'Offline';
        }
    } catch (error) {
        statusIndicator.className = 'status-indicator unhealthy';
        statusText.textContent = 'Offline';
    }
}

// Documents list
async function loadDocumentsList() {
    const documentsList = document.getElementById('documentsList');
    const documentsStats = document.getElementById('documentsStats');

    if (!documentsList) return;

        documentsList.innerHTML = `
            <div class="document-card">
                <div class="skeleton" style="height:16px;width:180px;margin-bottom:12px"></div>
                <div class="skeleton" style="height:12px;width:60%;margin-bottom:8px"></div>
                <div class="skeleton" style="height:12px;width:40%"></div>
            </div>
            <div class="document-card">
                <div class="skeleton" style="height:16px;width:220px;margin-bottom:12px"></div>
                <div class="skeleton" style="height:12px;width:55%;margin-bottom:8px"></div>
                <div class="skeleton" style="height:12px;width:35%"></div>
            </div>
        `;

    try {
        const response = await fetch('/api/docs');
        if (!response.ok) {
            const err = new Error(`HTTP ${response.status}`);
            err.status = response.status;
            throw err;
        }
        const data = await response.json();

        if (!data.success || !data.documents || data.documents.length === 0) {
            documentsList.innerHTML = '<div class="empty-state">No documents uploaded yet</div>';
            if (documentsStats) documentsStats.innerHTML = '';
            return;
        }

        // Stats
        if (documentsStats) {
            const totalChunks = data.documents.reduce((sum, doc) => sum + (doc.total_chunks || 0), 0);

            // Remove Total Size stat for now (backend doesn't provide size yet)
            documentsStats.innerHTML = `
                <div class="stat-card">
                    <i class="fas fa-file"></i>
                    <div>
                        <div class="stat-value">${data.documents.length}</div>
                        <div class="stat-label">Documents</div>
                    </div>
                </div>
                <div class="stat-card">
                    <i class="fas fa-puzzle-piece"></i>
                    <div>
                        <div class="stat-value">${totalChunks}</div>
                        <div class="stat-label">Chunks</div>
                    </div>
                </div>
            `;
        }

        // Cards
        documentsList.innerHTML = data.documents.map(doc => `
            <div class="document-card">
                <div class="document-icon">
                    <i class="fas fa-file-${getFileIcon(doc.file_type)}"></i>
                </div>
                <div class="document-info">
                    <div class="document-name">${escapeHtml(doc.filename)}</div>
                    <div class="document-meta">
                        <span class="chip">${(doc.file_type || 'unknown').toUpperCase()}</span>
                        <span class="chip">${doc.total_chunks || 0} chunks</span>
                        <span class="chip">${new Date(doc.upload_date).toLocaleDateString()}</span>
                    </div>
                </div>
                <div class="document-actions">
                    <button class="btn-icon" onclick="viewDocument('${doc.document_id}')" title="View">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn-icon btn-danger" onclick="deleteDocument('${doc.document_id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading documents:', error);
        const issue = deriveNetworkIssue(error);
        documentsList.innerHTML = `<div class="error-state">Failed to load documents${issue ? ` — ${issue}` : ''}</div>`;
    }
}

// Icon per file type
function getFileIcon(fileType) {
    const icons = {
        'pdf': 'pdf',
        'docx': 'word',
        'doc': 'word',
        'txt': 'alt',
        'csv': 'csv'
    };
    return icons[fileType.toLowerCase()] || 'alt';
}

// View document (placeholder)
async function viewDocument(documentId) {
    console.log('Viewing document:', documentId);
    // TODO: Implement document viewer modal
    alert(`Document viewer coming soon!\nDocument ID: ${documentId}`);
}

// Delete document
async function deleteDocument(documentId) {
    if (!confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
        return;
    }

    try {
        const response = await fetch(`/api/docs/${documentId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            showNotification('Document deleted successfully', 'success');
            loadDocumentsList();
        } else {
            throw new Error(data.error || 'Failed to delete document');
        }
    } catch (error) {
        console.error('Delete error:', error);
        showNotification(`Failed to delete document: ${error.message}`, 'error');
    }
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Toast
function showNotification(message, type) {
    const container = document.getElementById('toastContainer');
    if (!container) {
        console.log(`[${type.toUpperCase()}] ${message}`);
        return;
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
        success: 'check-circle',
        error: 'times-circle',
        warning: 'exclamation-triangle',
        info: 'info-circle'
    };

    toast.innerHTML = `
        <i class="fas fa-${icons[type] || 'info-circle'}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Explain network errors briefly
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

// Init
function initializeApp() {
    console.log('Init app');

    // Setup navigation
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.getAttribute('data-view');
            switchView(view);
        });
    });

    // Check system health
    checkSystemHealth();
    setInterval(checkSystemHealth, 60000); // Check every minute

    // Setup refresh button for documents view
    const refreshDocsBtn = document.getElementById('refreshDocsBtn');
    if (refreshDocsBtn) {
        refreshDocsBtn.addEventListener('click', loadDocumentsList);
    }

    // Help modal handling
    const helpBtn = document.getElementById('helpBtn');
    const helpModal = document.getElementById('helpModal');
    if (helpBtn && helpModal) {
        const open = () => { helpModal.classList.remove('hidden'); helpModal.setAttribute('aria-hidden', 'false'); };
        const close = () => { helpModal.classList.add('hidden'); helpModal.setAttribute('aria-hidden', 'true'); };
        helpBtn.addEventListener('click', open);
        helpModal.addEventListener('click', (e) => {
            const target = e.target;
            if ((target.closest && target.closest('[data-close="helpModal"]')) || target.classList.contains('modal-backdrop')) {
                close();
            }
        });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    }

    console.log('App ready');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { initializeApp(); initTheme(); });
} else {
    initializeApp();
    initTheme();
}
