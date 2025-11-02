/**
 * In-memory job queue manager for processing SVG files
 * Tracks job status, progress, and handles cleanup
 */

import { randomBytes } from 'crypto';

class JobQueue {
  constructor() {
    this.jobs = new Map();
    this.cleanupInterval = 60 * 60 * 1000; // 1 hour in milliseconds

    // Start automatic cleanup
    this.startCleanup();
  }

  /**
   * Create a new job
   * @returns {string} jobId
   */
  createJob(svgContent, config) {
    const jobId = this.generateJobId();

    this.jobs.set(jobId, {
      id: jobId,
      svgContent,
      config,
      status: 'queued',
      progress: {
        processed: 0,
        total: 0,
        percent: 0
      },
      result: null,
      error: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    return jobId;
  }

  /**
   * Get job by ID
   * @param {string} jobId
   * @returns {object|null}
   */
  getJob(jobId) {
    return this.jobs.get(jobId) || null;
  }

  /**
   * Update job progress
   * @param {string} jobId
   * @param {object} progress - { processed, total, percent }
   */
  updateProgress(jobId, progress) {
    const job = this.jobs.get(jobId);
    if (job) {
      job.progress = { ...job.progress, ...progress };
      job.updatedAt = Date.now();
    }
  }

  /**
   * Update job status
   * @param {string} jobId
   * @param {string} status - 'queued'|'processing'|'complete'|'error'|'cancelled'
   */
  updateStatus(jobId, status) {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = status;
      job.updatedAt = Date.now();
    }
  }

  /**
   * Set job result (processed SVG)
   * @param {string} jobId
   * @param {string} result - Processed SVG content
   */
  setResult(jobId, result) {
    const job = this.jobs.get(jobId);
    if (job) {
      job.result = result;
      job.status = 'complete';
      job.updatedAt = Date.now();
    }
  }

  /**
   * Set job error
   * @param {string} jobId
   * @param {string} error - Error message
   */
  setError(jobId, error) {
    const job = this.jobs.get(jobId);
    if (job) {
      job.error = error;
      job.status = 'error';
      job.updatedAt = Date.now();
    }
  }

  /**
   * Delete a job
   * @param {string} jobId
   * @returns {boolean} success
   */
  deleteJob(jobId) {
    return this.jobs.delete(jobId);
  }

  /**
   * Get job status for client polling
   * @param {string} jobId
   * @returns {object|null}
   */
  getStatus(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    return {
      id: job.id,
      status: job.status,
      progress: job.progress,
      error: job.error,
      hasResult: job.result !== null
    };
  }

  /**
   * Generate unique job ID
   * @returns {string}
   */
  generateJobId() {
    return randomBytes(16).toString('hex');
  }

  /**
   * Start automatic cleanup of old jobs
   */
  startCleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [jobId, job] of this.jobs.entries()) {
        // Delete jobs older than 1 hour
        if (now - job.createdAt > this.cleanupInterval) {
          console.log(`[JobQueue] Cleaning up old job: ${jobId}`);
          this.jobs.delete(jobId);
        }
      }
    }, 15 * 60 * 1000); // Check every 15 minutes
  }

  /**
   * Get queue statistics
   * @returns {object}
   */
  getStats() {
    const stats = {
      total: this.jobs.size,
      queued: 0,
      processing: 0,
      complete: 0,
      error: 0,
      cancelled: 0
    };

    for (const job of this.jobs.values()) {
      if (stats[job.status] !== undefined) {
        stats[job.status]++;
      }
    }

    return stats;
  }
}

// Export singleton instance
export const jobQueue = new JobQueue();
