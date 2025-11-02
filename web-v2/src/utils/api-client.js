/**
 * API client for backend processing server
 * Provides methods for job submission, status polling, and download
 */

const API_BASE_URL = 'http://localhost:3003/api';

/**
 * Submit a processing job to the backend
 * @param {Object} svg - SVG data with paths and viewBox
 * @param {Object} config - Processing configuration
 * @param {Array} attractors - Optional attractors
 * @param {Object} attractorConfig - Optional attractor configuration
 * @param {Object} viewBox - Optional viewBox for focus blur modes
 * @returns {Promise<string>} jobId
 */
export async function submitJob(svg, config, attractors = [], attractorConfig = null, viewBox = null) {
  const response = await fetch(`${API_BASE_URL}/process`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      svg,
      config,
      attractors,
      attractorConfig,
      viewBox
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to submit job');
  }

  const data = await response.json();
  return data.jobId;
}

/**
 * Poll job status
 * @param {string} jobId
 * @returns {Promise<Object>} { id, status, progress, error, hasResult }
 */
export async function pollStatus(jobId) {
  const response = await fetch(`${API_BASE_URL}/status/${jobId}`);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Job not found');
    }
    const error = await response.json();
    throw new Error(error.message || 'Failed to get job status');
  }

  return response.json();
}

/**
 * Download processed SVG
 * Triggers browser download
 * @param {string} jobId
 * @param {string} filename - Optional custom filename
 */
export async function downloadResult(jobId, filename = null) {
  const response = await fetch(`${API_BASE_URL}/download/${jobId}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to download result');
  }

  // Get filename from Content-Disposition header or use provided name
  let downloadFilename = filename;
  if (!downloadFilename) {
    const disposition = response.headers.get('Content-Disposition');
    if (disposition && disposition.includes('filename=')) {
      downloadFilename = disposition
        .split('filename=')[1]
        .replace(/"/g, '');
    } else {
      downloadFilename = 'processed.svg';
    }
  }

  // Create blob and trigger download
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = downloadFilename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

/**
 * Cancel a job
 * @param {string} jobId
 * @returns {Promise<boolean>} success
 */
export async function cancelJob(jobId) {
  const response = await fetch(`${API_BASE_URL}/job/${jobId}`, {
    method: 'DELETE'
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to cancel job');
  }

  const data = await response.json();
  return data.success;
}

/**
 * Get queue statistics
 * @returns {Promise<Object>} { total, queued, processing, complete, error, cancelled }
 */
export async function getStats() {
  const response = await fetch(`${API_BASE_URL}/stats`);

  if (!response.ok) {
    throw new Error('Failed to get queue stats');
  }

  return response.json();
}

/**
 * Start polling for job status with automatic updates
 * @param {string} jobId
 * @param {Function} onProgress - Called with status updates
 * @param {Function} onComplete - Called when job completes
 * @param {Function} onError - Called on error
 * @param {number} intervalMs - Polling interval (default 500ms)
 * @returns {Function} cleanup function to stop polling
 */
export function startPolling(jobId, onProgress, onComplete, onError, intervalMs = 500) {
  let intervalId = null;
  let stopped = false;

  const poll = async () => {
    if (stopped) return;

    try {
      const status = await pollStatus(jobId);

      // Call progress callback
      if (onProgress) {
        onProgress(status);
      }

      // Check terminal states
      if (status.status === 'complete') {
        stopPolling();
        if (onComplete) {
          onComplete(status);
        }
      } else if (status.status === 'error' || status.status === 'cancelled') {
        stopPolling();
        if (onError) {
          onError(new Error(status.error || `Job ${status.status}`));
        }
      }
    } catch (error) {
      stopPolling();
      if (onError) {
        onError(error);
      }
    }
  };

  const stopPolling = () => {
    stopped = true;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  // Start polling
  intervalId = setInterval(poll, intervalMs);
  poll(); // Immediate first poll

  // Return cleanup function
  return stopPolling;
}
