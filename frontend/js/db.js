/**
 * Database/API Interaction Module
 * Handles document listing, search, and deletion
 */

// Note: Functions are now globally available (no exports needed for plain JS)

// Search debounce timer
let searchTimeout = null;

/**
 * Search documents by query with debouncing
 * @param {string} query - Search query
 */
function searchDocuments(query) {
    clearTimeout(searchTimeout);

    searchTimeout = setTimeout(async () => {
        const searchResults = document.getElementById('searchResults');
        if (!searchResults) return;

        if (!query || query.trim().length === 0) {
            searchResults.innerHTML = '';
            return;
        }

        searchResults.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Searching...</div>';

        try {
            const topK = document.getElementById('topK')?.value || 10;
            const threshold = document.getElementById('threshold')?.value || 0.5;
            const searchType = document.getElementById('searchType')?.value || 'semantic';

            const endpoint = searchType === 'hybrid' ? '/api/search/hybrid' : '/api/search';

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query,
                    topK: parseInt(topK),
                    threshold: parseFloat(threshold)
                })
            });

            if (!response.ok) {
                throw new Error(`Search failed: ${response.status}`);
            }

            const data = await response.json();

            if (!data.success || !data.results || data.results.length === 0) {
                searchResults.innerHTML = '<div class="empty-state">No results found</div>';
                return;
            }

            // Display results
            searchResults.innerHTML = `
                <div class="results-header">
                    <h3>Found ${data.resultsCount} result(s)</h3>
                    <span class="results-time">${data.executionTime}</span>
                </div>
                <div class="results-list">
                    ${data.results.map((result, index) => `
                        <div class="result-card">
                            <div class="result-header">
                                <span class="result-rank">#${result.rank}</span>
                                <span class="result-score">Similarity: ${(result.similarity * 100).toFixed(1)}%</span>
                            </div>
                            <div class="result-content">${escapeHtml(result.content)}</div>
                            <div class="result-meta">
                                <span><i class="fas fa-file"></i> ${escapeHtml(result.documentName)}</span>
                                <span><i class="fas fa-puzzle-piece"></i> Chunk ${result.chunkIndex}</span>
                                ${result.pageNumber ? `<span><i class="fas fa-file-pdf"></i> Page ${result.pageNumber}</span>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;

            // Cache search
            cacheRecentSearch(query);

        } catch (error) {
            console.error('Search error:', error);
            searchResults.innerHTML = `<div class="error-state">Search failed: ${error.message}</div>`;
        }
    }, 500); // 500ms debounce
}

/**
 * Cache recent search query
 * @param {string} query - Search query
 */
function cacheRecentSearch(query) {
    try {
        let searches = JSON.parse(sessionStorage.getItem('recentSearches') || '[]');

        // Add to cache if not already present
        if (!searches.includes(query)) {
            searches.unshift(query);
            searches = searches.slice(0, 10); // Keep only last 10
            sessionStorage.setItem('recentSearches', JSON.stringify(searches));
        }
    } catch (error) {
        console.error('Error caching search:', error);
    }
}

/**
 * Get recent searches
 * @returns {Array} Recent search queries
 */
function getRecentSearches() {
    try {
        return JSON.parse(sessionStorage.getItem('recentSearches') || '[]');
    } catch {
        return [];
    }
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Initialize search functionality
 */
function initializeSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');

    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            const query = searchInput?.value;
            if (query) {
                searchDocuments(query);
            }
        });
    }

    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchBtn?.click();
            }
        });

        // Real-time search as user types (optional)
        // searchInput.addEventListener('input', (e) => {
        //     searchDocuments(e.target.value);
        // });
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSearch);
} else {
    initializeSearch();
}
