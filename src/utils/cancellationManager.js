/**
 * Manages cancellation requests for long-running asynchronous workflows,
 * typically identified by a chatId.
 */

const cancellationRequests = new Map();

/**
 * Signals a request to cancel a workflow associated with a specific ID (e.g., chatId).
 * @param {number|string} id - The identifier of the workflow to cancel.
 */
function requestCancellation(id) {
    if (id === null || id === undefined) {
        console.warn('[CancellationManager] Attempted to request cancellation with null/undefined ID.');
        return;
    }
    cancellationRequests.set(String(id), true);
}

/**
 * Checks if cancellation has been requested for a specific workflow ID.
 * @param {number|string} id - The identifier of the workflow.
 * @returns {boolean} - True if cancellation has been requested, false otherwise.
 */
function isCancellationRequested(id) {
     if (id === null || id === undefined) {
        return false;
    }
    return cancellationRequests.get(String(id)) === true;
}

/**
 * Clears a cancellation request flag for a specific workflow ID.
 * Should be called when the workflow completes or handles the cancellation.
 * @param {number|string} id - The identifier of the workflow.
 */
function clearCancellationRequest(id) {
     if (id === null || id === undefined) {
        return;
    }
    cancellationRequests.delete(String(id));
}

module.exports = {
    requestCancellation,
    isCancellationRequested,
    clearCancellationRequest
};
