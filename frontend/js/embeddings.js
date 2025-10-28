// frontend/js/embeddings.js

/**
 * Embedding stats and optional 2D visualization (for admin/debug).
 * Uses Chart.js for t-SNE/plotted scatter if available.
 */

// DOM
const embeddingStatsZone = document.getElementById('embeddingStatsZone');
const embeddingCanvas = document.getElementById('embeddingCanvas');

// Show embedding/document statistics
function displayEmbeddingStats(stats) {
    if (!embeddingStatsZone || !stats) return;
    embeddingStatsZone.innerHTML = `
    <div class="stat-card bg-gray-900 text-white p-4 rounded mb-2">
      <strong>Total Documents:</strong> ${stats.docCount}<br />
      <strong>Total Chunks:</strong> ${stats.chunkCount}<br />
      <strong>Avg Chunks/Doc:</strong> ${stats.avgChunks}<br />
    </div>
  `;
}

// Optional: Visualize embedding vectors (scatter plot with t-SNE)
function visualizeEmbeddings(embeddings2d) {
    if (!embeddingCanvas || !window.Chart) return;
    const ctx = embeddingCanvas.getContext('2d');
    const scatterData = {
        datasets: [
            {
                label: 'Chunks',
                data: embeddings2d.map(pt => ({ x: pt[0], y: pt[1] })),
                backgroundColor: 'rgba(107, 114, 128, 0.7)' // Tailwind gray-500
            }
        ]
    };
    new Chart(ctx, {
        type: 'scatter',
        data: scatterData,
        options: {
            scales: {
                x: { type: 'linear', position: 'bottom', grid: { color: '#4B5563' } },
                y: { type: 'linear', position: 'left', grid: { color: '#4B5563' } }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

// Hook into admin/stat panel
export { displayEmbeddingStats, visualizeEmbeddings };
