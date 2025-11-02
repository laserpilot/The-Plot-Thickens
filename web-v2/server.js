/**
 * Express server for backend SVG processing
 * Provides API endpoints for job submission, progress polling, and download
 */

import express from 'express';
import cors from 'cors';
import { jobQueue } from './server/job-queue.js';
import { processPathsWithProgress } from './server/processor.js';

const app = express();
const PORT = 3003;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Support large SVG files

/**
 * POST /api/process
 * Submit a new processing job
 * Body: { svg, config, attractors, attractorConfig, viewBox }
 * Returns: { jobId }
 */
app.post('/api/process', async (req, res) => {
  try {
    const { svg, config, attractors, attractorConfig, viewBox } = req.body;

    if (!svg || !svg.paths || !config) {
      return res.status(400).json({
        error: 'Missing required fields: svg, config'
      });
    }

    // Create job
    const jobId = jobQueue.createJob(svg, {
      config,
      attractors: attractors || [],
      attractorConfig: attractorConfig || null,
      viewBox: viewBox || null
    });

    console.log(`[API] Created job ${jobId} with ${svg.paths.length} paths`);

    // Start processing asynchronously
    setImmediate(() => processJob(jobId));

    res.json({ jobId });
  } catch (error) {
    console.error('[API] Error creating job:', error);
    res.status(500).json({
      error: 'Failed to create processing job',
      message: error.message
    });
  }
});

/**
 * GET /api/status/:jobId
 * Get job status and progress
 * Returns: { id, status, progress, error, hasResult }
 */
app.get('/api/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const status = jobQueue.getStatus(jobId);

  if (!status) {
    return res.status(404).json({
      error: 'Job not found'
    });
  }

  res.json(status);
});

/**
 * GET /api/download/:jobId
 * Download processed SVG
 * Returns: SVG file
 */
app.get('/api/download/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobQueue.getJob(jobId);

  if (!job) {
    return res.status(404).json({
      error: 'Job not found'
    });
  }

  if (job.status !== 'complete' || !job.result) {
    return res.status(400).json({
      error: 'Job not complete or result not available',
      status: job.status
    });
  }

  // Send SVG with proper headers
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Content-Disposition', `attachment; filename="${job.result.filename}"`);
  res.send(job.result.svg);

  console.log(`[API] Downloaded job ${jobId}`);
});

/**
 * DELETE /api/job/:jobId
 * Cancel and delete a job
 * Returns: { success }
 */
app.delete('/api/job/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobQueue.getJob(jobId);

  if (!job) {
    return res.status(404).json({
      error: 'Job not found'
    });
  }

  // Mark as cancelled
  jobQueue.updateStatus(jobId, 'cancelled');

  // Delete after a short delay to allow status polling to see cancellation
  setTimeout(() => {
    jobQueue.deleteJob(jobId);
  }, 5000);

  console.log(`[API] Cancelled job ${jobId}`);
  res.json({ success: true });
});

/**
 * GET /api/stats
 * Get queue statistics
 * Returns: { total, queued, processing, complete, error, cancelled }
 */
app.get('/api/stats', (req, res) => {
  res.json(jobQueue.getStats());
});

/**
 * Process a job asynchronously
 * @param {string} jobId
 */
async function processJob(jobId) {
  const job = jobQueue.getJob(jobId);
  if (!job) {
    console.error(`[Processor] Job ${jobId} not found`);
    return;
  }

  try {
    console.log(`[Processor] Starting job ${jobId}`);
    jobQueue.updateStatus(jobId, 'processing');

    const { svgContent, config: jobConfig } = job;
    const { config, attractors, attractorConfig, viewBox } = jobConfig;

    // Progress callback
    const onProgress = (progress) => {
      jobQueue.updateProgress(jobId, progress);

      // Log major milestones
      if (progress.percent === 0 || progress.percent === 100 || progress.processed % 1000 === 0) {
        console.log(`[Processor] Job ${jobId}: ${progress.processed}/${progress.total} paths (${progress.percent}%)`);
      }
    };

    // Process paths with progress tracking
    const processedPaths = processPathsWithProgress(
      svgContent.paths,
      config,
      onProgress,
      attractors,
      attractorConfig,
      viewBox
    );

    // Build SVG output
    const svgString = buildSVG(processedPaths, svgContent.viewBox, config);
    const filename = generateFilename(svgContent.originalFilename || 'processed', config.fillMode);

    // Store result
    jobQueue.setResult(jobId, {
      svg: svgString,
      filename,
      pathCount: processedPaths.length
    });

    console.log(`[Processor] Job ${jobId} complete: ${processedPaths.length} paths generated`);
  } catch (error) {
    console.error(`[Processor] Job ${jobId} failed:`, error);
    jobQueue.setError(jobId, error.message);
  }
}

/**
 * Build SVG string from processed paths
 * @param {Array} paths - Processed paths
 * @param {Object} viewBox - SVG viewBox
 * @param {Object} config - Processing config
 * @returns {string} SVG string
 */
function buildSVG(paths, viewBox, config) {
  const { x, y, width, height } = viewBox;
  const timestamp = new Date().toISOString();

  let svg = '<?xml version="1.0" encoding="UTF-8"?>\n';
  svg += `<!-- Generated by Plotter Line Thickener -->\n`;
  svg += `<!-- Fill mode: ${config.fillMode || 'offset'} -->\n`;
  svg += `<!-- Timestamp: ${timestamp} -->\n`;
  svg += `<!-- Path count: ${paths.length} -->\n`;
  svg += `<svg xmlns="http://www.w3.org/2000/svg" `;
  svg += `viewBox="${x} ${y} ${width} ${height}" `;
  svg += `width="${width}mm" height="${height}mm">\n`;

  // Add all paths
  for (const path of paths) {
    svg += `  <path d="${escapeXml(path.d)}" `;
    svg += `fill="${path.fill || 'none'}" `;
    svg += `stroke="${path.stroke || 'black'}" `;
    svg += `stroke-width="${path.strokeWidth || 0.1}" />\n`;
  }

  svg += '</svg>';
  return svg;
}

/**
 * Generate filename for export
 * @param {string} originalName
 * @param {string} fillMode
 * @returns {string}
 */
function generateFilename(originalName, fillMode) {
  const base = originalName.replace(/\.svg$/i, '');
  const mode = fillMode || 'offset';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  return `${base}-${mode}-${timestamp}.svg`;
}

/**
 * Escape XML special characters
 * @param {string} str
 * @returns {string}
 */
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Plotter Line Thickener API server running on http://localhost:${PORT}`);
  console.log(`   POST   /api/process     - Submit processing job`);
  console.log(`   GET    /api/status/:id  - Get job status`);
  console.log(`   GET    /api/download/:id - Download result`);
  console.log(`   DELETE /api/job/:id     - Cancel job`);
  console.log(`   GET    /api/stats       - Queue statistics\n`);
});
