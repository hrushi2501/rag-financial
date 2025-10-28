/**
 * Document Upload UI Logic
 * Handles file selection, drag-and-drop, upload progress, and validation
 */

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_TYPES = ['pdf', 'docx', 'doc', 'txt', 'csv'];
let selectedFiles = [];

/**
 * Initialize upload functionality
 */
function initializeUpload() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const uploadBtn = document.getElementById('uploadBtn');

    // Click to open file picker
    if (uploadArea) {
        uploadArea.addEventListener('click', () => {
            fileInput?.click();
        });

        // Drag and drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');

            const files = Array.from(e.dataTransfer.files);
            handleFileSelection(files);
        });
    }

    // File input change
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            handleFileSelection(files);
        });
    }
}

/**
 * Handle file selection
 * @param {Array} files - Selected files
 */
function handleFileSelection(files) {
    if (!files || files.length === 0) return;

    const fileListDiv = document.getElementById('fileList');
    if (!fileListDiv) return;

    // Clear previous selection
    selectedFiles = [];
    fileListDiv.innerHTML = '';
    fileListDiv.classList.remove('hidden');

    // Validate and display files
    files.forEach((file, index) => {
        const ext = file.name.split('.').pop().toLowerCase();
        const isValid = ACCEPTED_TYPES.includes(ext);
        const isSizeValid = file.size <= MAX_FILE_SIZE;

        const fileCard = document.createElement('div');
        fileCard.className = `file-card ${!isValid || !isSizeValid ? 'invalid' : ''}`;

        fileCard.innerHTML = `
            <div class="file-icon">
                <i class="fas fa-file-${getFileIconClass(ext)}"></i>
            </div>
            <div class="file-info">
                <div class="file-name">${escapeHtml(file.name)}</div>
                <div class="file-size">${formatFileSize(file.size)}</div>
                ${!isValid ? '<div class="file-error">Unsupported file type</div>' : ''}
                ${!isSizeValid ? '<div class="file-error">File too large (max 10MB)</div>' : ''}
            </div>
            <button class="btn-remove" onclick="removeFile(${index})">
                <i class="fas fa-times"></i>
            </button>
        `;

        fileListDiv.appendChild(fileCard);

        if (isValid && isSizeValid) {
            selectedFiles.push(file);
        }
    });

    // Show upload button if valid files exist
    if (selectedFiles.length > 0) {
        showUploadButton();
    }
}

/**
 * Remove file from selection
 * @param {number} index - File index
 */
function removeFile(index) {
    selectedFiles.splice(index, 1);

    // Re-render file list
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.value = '';

    if (selectedFiles.length === 0) {
        document.getElementById('fileList').classList.add('hidden');
        document.getElementById('uploadResults').classList.add('hidden');
    } else {
        handleFileSelection(selectedFiles);
    }
}

/**
 * Show upload button
 */
function showUploadButton() {
    const fileListDiv = document.getElementById('fileList');
    if (!fileListDiv) return;

    let uploadBtn = fileListDiv.querySelector('.upload-btn');
    if (!uploadBtn) {
        uploadBtn = document.createElement('button');
        uploadBtn.className = 'btn btn-primary upload-btn';
        uploadBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Upload All';
        uploadBtn.onclick = uploadAllFiles;
        fileListDiv.appendChild(uploadBtn);
    }
}

/**
 * Upload all selected files
 */
async function uploadAllFiles() {
    if (selectedFiles.length === 0) return;

    const uploadProgress = document.getElementById('uploadProgress');
    const uploadResults = document.getElementById('uploadResults');

    uploadProgress.classList.remove('hidden');
    uploadResults.classList.add('hidden');
    uploadResults.innerHTML = '';

    const results = {
        success: [],
        failed: []
    };

    for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];

        try {
            // Update progress
            updateProgress(i + 1, selectedFiles.length, `Uploading ${file.name}...`);

            // Upload file
            const result = await uploadSingleFile(file, (progress) => {
                updateProgress(i + 1, selectedFiles.length, `Uploading ${file.name}... ${progress}%`);
            });

            results.success.push({ file: file.name, ...result });

        } catch (error) {
            console.error(`Upload failed for ${file.name}:`, error);
            results.failed.push({ file: file.name, error: error.message });
        }
    }

    // Hide progress, show results
    uploadProgress.classList.add('hidden');
    displayUploadResults(results);

    // Clear file selection
    selectedFiles = [];
    document.getElementById('fileInput').value = '';
    document.getElementById('fileList').classList.add('hidden');

    // Refresh documents list if on documents view
    if (typeof loadDocumentsList === 'function') {
        loadDocumentsList();
    }
}

/**
 * Upload single file with progress tracking
 * @param {File} file - File to upload
 * @param {Function} progressCallback - Progress callback
 * @returns {Promise} Upload result
 */
function uploadSingleFile(file, progressCallback) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', file);

        const xhr = new XMLHttpRequest();

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                const percent = Math.round((event.loaded / event.total) * 100);
                progressCallback(percent);
            }
        };

        xhr.onload = () => {
            if (xhr.status === 200) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    resolve(response);
                } catch (error) {
                    reject(new Error('Invalid server response'));
                }
            } else {
                try {
                    const error = JSON.parse(xhr.responseText);
                    reject(new Error(error.message || 'Upload failed'));
                } catch {
                    reject(new Error(`Upload failed with status ${xhr.status}`));
                }
            }
        };

        xhr.onerror = () => {
            reject(new Error('Network error during upload'));
        };

        xhr.open('POST', '/api/upload');
        xhr.send(formData);
    });
}

/**
 * Update upload progress display
 * @param {number} current - Current file number
 * @param {number} total - Total files
 * @param {string} message - Status message
 */
function updateProgress(current, total, message) {
    const uploadProgress = document.getElementById('uploadProgress');
    if (!uploadProgress) return;

    const percent = Math.round((current / total) * 100);

    uploadProgress.innerHTML = `
        <div class="progress-header">
            <span>${message}</span>
            <span>${current} / ${total}</span>
        </div>
        <div class="progress-bar">
            <div class="progress-fill" style="width: ${percent}%"></div>
        </div>
    `;
}

/**
 * Display upload results
 * @param {Object} results - Upload results
 */
function displayUploadResults(results) {
    const uploadResults = document.getElementById('uploadResults');
    if (!uploadResults) return;

    uploadResults.classList.remove('hidden');

    let html = '<h3>Upload Results</h3>';

    if (results.success.length > 0) {
        html += '<div class="results-success">';
        html += '<h4><i class="fas fa-check-circle"></i> Successfully Uploaded</h4>';
        results.success.forEach(item => {
            html += `
                <div class="result-item success">
                    <i class="fas fa-file"></i>
                    <span>${escapeHtml(item.file)}</span>
                    <span class="result-meta">${item.document.chunksProcessed} chunks in ${item.document.processingTime}</span>
                </div>
            `;
        });
        html += '</div>';
    }

    if (results.failed.length > 0) {
        html += '<div class="results-error">';
        html += '<h4><i class="fas fa-times-circle"></i> Failed</h4>';
        results.failed.forEach(item => {
            html += `
                <div class="result-item error">
                    <i class="fas fa-file"></i>
                    <span>${escapeHtml(item.file)}</span>
                    <span class="result-meta">${escapeHtml(item.error)}</span>
                </div>
            `;
        });
        html += '</div>';
    }

    uploadResults.innerHTML = html;

    // Show notification
    if (typeof showNotification === 'function') {
        if (results.failed.length === 0) {
            showNotification(`${results.success.length} file(s) uploaded successfully`, 'success');
        } else if (results.success.length === 0) {
            showNotification('All uploads failed', 'error');
        } else {
            showNotification(`${results.success.length} succeeded, ${results.failed.length} failed`, 'warning');
        }
    }
}

/**
 * Get file icon class
 * @param {string} ext - File extension
 * @returns {string} Icon class
 */
function getFileIconClass(ext) {
    const icons = {
        'pdf': 'pdf',
        'docx': 'word',
        'doc': 'word',
        'txt': 'alt',
        'csv': 'csv'
    };
    return icons[ext] || 'alt';
}

/**
 * Format file size
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted size
 */
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeUpload);
} else {
    initializeUpload();
}
