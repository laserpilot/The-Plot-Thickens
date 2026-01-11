/**
 * Global progress indicator utility
 * Controls the progress bar in the header
 */

let progressElement = null;
let progressTextElement = null;
let progressBarElement = null;

/**
 * Initialize progress indicator
 */
export function initGlobalProgress() {
  progressElement = document.getElementById('global-progress');
  progressTextElement = document.getElementById('global-progress-text');
  progressBarElement = document.getElementById('global-progress-bar');

  if (!progressElement || !progressTextElement || !progressBarElement) {
    console.warn('[Global Progress] Required elements not found');
  }
}

/**
 * Show progress indicator
 * @param {string} message - Progress message
 * @param {number} percent - Progress percentage (0-100), optional
 */
export function showProgress(message, percent = 0) {
  if (!progressElement) return;

  progressElement.classList.remove('hidden');
  progressTextElement.textContent = message;
  progressBarElement.style.width = `${percent}%`;
}

/**
 * Update progress
 * @param {string} message - Progress message
 * @param {number} percent - Progress percentage (0-100)
 */
export function updateProgress(message, percent) {
  if (!progressElement) return;

  progressTextElement.textContent = message;
  progressBarElement.style.width = `${percent}%`;
}

/**
 * Hide progress indicator
 */
export function hideProgress() {
  if (!progressElement) return;

  // Small delay for smooth transition
  setTimeout(() => {
    progressElement.classList.add('hidden');
    progressBarElement.style.width = '0%';
  }, 300);
}

/**
 * Show completion message briefly then hide
 * @param {string} message - Completion message
 */
export function showComplete(message) {
  if (!progressElement) return;

  progressElement.classList.remove('hidden');
  progressTextElement.textContent = message;
  progressBarElement.style.width = '100%';

  // Hide after 2 seconds
  setTimeout(() => {
    hideProgress();
  }, 2000);
}
