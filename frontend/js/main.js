/**
 * Main Application Logic
 * Handles view switching, initialization, and global UI interactions
 */

// Global state
let currentView = 'upload';

/**
 * Switch between different views
 * @param {string} viewName - Name of the view to show
 */
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

    // Load data for specific views
    if (viewName === 'documents') {
        loadDocumentsList();
    }
}

/**
 * Check system health status
 */
async function checkSystemHealth() {
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');

    try {
        const response = await fetch('/api/health');
        const data = await response.json();

        if (data.status === 'healthy') {
            statusIndicator.className = 'status-indicator online';
            statusText.textContent = 'Online';
        } else {
            statusIndicator.className = 'status-indicator warning';
            statusText.textContent = 'Degraded';
        }
    } catch (error) {
        statusIndicator.className = 'status-indicator offline';
        statusText.textContent = 'Offline';
    }
}

/**
 * Load documents list (from db.js functionality)
 */
async function loadDocumentsList() {
    const documentsList = document.getElementById('documentsList');
    const documentsStats = document.getElementById('documentsStats');

    if (!documentsList) return;

    documentsList.innerHTML = '<div class="loading">Loading documents...</div>';

    try {
        const response = await fetch('/api/docs');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();

        if (!data.success || !data.documents || data.documents.length === 0) {
            documentsList.innerHTML = '<div class="empty-state">No documents uploaded yet</div>';
            if (documentsStats) documentsStats.innerHTML = '';
            return;
        }

        // Display stats
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

        // Display documents
        documentsList.innerHTML = data.documents.map(doc => `
            <div class="document-card">
                <div class="document-icon">
                    <i class="fas fa-file-${getFileIcon(doc.file_type)}"></i>
                </div>
                <div class="document-info">
                    <div class="document-name">${escapeHtml(doc.filename)}</div>
                    <div class="document-meta">
                        <span>${(doc.file_type || 'unknown').toUpperCase()}</span>
                        <span>${doc.total_chunks || 0} chunks</span>
                        <span>${new Date(doc.upload_date).toLocaleDateString()}</span>
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
        documentsList.innerHTML = '<div class="error-state">Failed to load documents</div>';
    }
}

/**
 * Get appropriate icon for file type
 */
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

/**
 * View document details
 */
async function viewDocument(documentId) {
    console.log('Viewing document:', documentId);
    // TODO: Implement document viewer modal
    alert(`Document viewer coming soon!\nDocument ID: ${documentId}`);
}

/**
 * Delete document with confirmation
 */
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

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Show notification (referenced from chat.js)
 */
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

/**
 * Initialize application
 */
function initializeApp() {
    console.log('Initializing Financial RAG System...');

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

    console.log('✓ Application initialized');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}
