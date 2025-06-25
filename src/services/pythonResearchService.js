/**
 * Python Research Service Client
 *
 * Communicates with the Python FastAPI-based Live Search Orchestrator service.
 */
const axios = require('axios');
const EventSource = require('eventsource'); 
// const http = require('http'); // No longer needed for custom agent

const { getSystemSetting } = require('../config/systemConfig');

class PythonResearchService {
    constructor() {
        const serviceBaseUrl = getSystemSetting('PYTHON_LIVE_SEARCH_BASE_URL', 'http://localhost:8001');
        
        this.baseUrl = serviceBaseUrl;

        if (typeof this.baseUrl !== 'string' || !this.baseUrl.startsWith('http')) {
            console.warn(`[PythonResearchService] Invalid or missing base URL from config ('${this.baseUrl}'). Defaulting to http://localhost:8001`);
            this.baseUrl = 'http://localhost:8001';
        }
    }

    /**
     * Initiates a new deep research task with the Python service.
     * @param {object} params - Parameters for the live search request.
     * @returns {Promise<object>} - Resolves with { taskId, streamUrl, cancelUrl }
     */
    async initiateResearch(params) {
        try {
            const response = await axios.post(`${this.baseUrl}/research_tasks`, params, { timeout: 30000 }); // 30-second timeout
            if (response.status === 202 && response.data && response.data.task_id) {
                return response.data; 
            } else {
                throw new Error(`Failed to initiate research task. Status: ${response.status}, Data: ${JSON.stringify(response.data)}`);
            }
        } catch (error) {
            console.error('[PythonResearchService] Error initiating research:', error.response ? error.response.data : error.message);
            throw new Error(`Error initiating research with Python service: ${error.message}`);
        }
    }

    /**
     * Connects to the SSE stream for a given task.
     * @param {string} streamUrl - The full URL for the SSE stream.
     * @param {string} taskId - The ID of the task for logging/context.
     * @param {function} onMessageHandler - Callback for each message: (eventData: object) => void
     * @param {function} onErrorHandler - Callback for stream errors: (error: Error) => void
     * @param {function} onCompleteHandler - Callback when stream closes normally: () => void
     * @returns {EventSource} - The EventSource instance, so it can be closed by the caller.
     */
    connectToStream(streamUrl, taskId, onMessageHandler, onErrorHandler, onCompleteHandler) {
        console.log(`[PythonResearchService:SSE:${taskId}] Creating EventSource for URL: ${streamUrl}`);
        const eventSource = new EventSource(streamUrl);

        let messageTimeout = null;

        eventSource.onopen = () => {
            // console.log(`[PythonResearchService:SSE:${taskId}] EventSource onopen: Connection opened. Setting 30-second message timeout.`);
            // Clear any previous timeout just in case, though unlikely for onopen
            if (messageTimeout) clearTimeout(messageTimeout);
            messageTimeout = setTimeout(() => {
                // This timeout logic implies that if no message is received within 30s of OPENING, it's an error.
                // This is a specific check for initial message, not a general inactivity timeout for the stream.
                console.error(`[PythonResearchService:SSE:${taskId}] EventSource onopen TIMEOUT: No messages received within 30 seconds of stream opening. Closing stream.`);
                if (onErrorHandler) { 
                    onErrorHandler(new Error(`SSE stream ${taskId} stalled: No messages received within 30 seconds of opening.`));
                }
                eventSource.close();
            }, 30000); // 30-second timeout for the first message after open
        };

        const processSseEvent = (event) => {
            if (messageTimeout) {
                // console.log(`[PythonResearchService:SSE:${taskId}] processSseEvent: Clearing onopen messageTimeout.`);
                clearTimeout(messageTimeout);
                messageTimeout = null;
            }

            // Original logic continues
            const eventName = event.type;
            const eventDataString = event.data;

            if (eventName === 'message' && !eventDataString) { 
                return;
            }
            
            try {
                if (eventName === 'heartbeat') {
                    return;
                }

                const parsedData = JSON.parse(eventDataString);
                const messagePayload = {
                    event_type: eventName,
                    payload: parsedData,
                    task_id: taskId
                };
                onMessageHandler(messagePayload);

                if (eventName === 'complete' || eventName === 'error' || eventName === 'cancelled') {
                    eventSource.close();
                }
            } catch (parseError) {
                console.error(`[PythonResearchService:SSE:${taskId}] Error parsing SSE message data for event type '${eventName}':`, parseError, "Raw data:", eventDataString);
            }
        };

        const eventTypesToListenFor = ['progress', 'markdown_chunk', 'complete', 'error', 'cancelled', 'heartbeat'];
        eventTypesToListenFor.forEach(eventType => {
            eventSource.addEventListener(eventType, processSseEvent);
        });

        eventSource.onmessage = processSseEvent;

        eventSource.onerror = (error) => {
            if (messageTimeout) {
                clearTimeout(messageTimeout);
                messageTimeout = null;
            }

            // The eventsource library attempts to reconnect automatically.
            // An 'error' event here is often a temporary network issue.
            // We should only treat it as fatal if the readyState becomes CLOSED.
            if (eventSource.readyState === EventSource.CLOSED) {
                const errorMessage = `[PythonResearchService:SSE:${taskId}] EventSource connection permanently closed.`;
                console.error(errorMessage, error);
                if (onErrorHandler) {
                    onErrorHandler(error || new Error(`SSE connection permanently closed for task ${taskId}.`));
                }
            } else if (eventSource.readyState === EventSource.CONNECTING) {
                console.warn(`[PythonResearchService:SSE:${taskId}] EventSource connection lost, attempting to reconnect...`, error.type);
            } else {
                console.warn(`[PythonResearchService:SSE:${taskId}] Non-fatal EventSource error occurred (State: ${eventSource.readyState}).`, error);
            }
        };
        
        return eventSource;
    }

    /**
     * Requests cancellation of an active research task.
     * @param {string} cancelUrl - The full URL to cancel the task.
     * @param {string} taskId - The ID of the task for logging.
     * @returns {Promise<object>} - Resolves with cancellation status.
     */
    async cancelResearch(cancelUrl, taskId) {
        try {
            const response = await axios.post(cancelUrl); 
            if (response.status === 200 && response.data) {
                return response.data; 
            } else {
                throw new Error(`Failed to cancel research task ${taskId}. Status: ${response.status}`);
            }
        } catch (error) {
            console.error(`[PythonResearchService] Error cancelling research task ${taskId}:`, error.response ? error.response.data : error.message);
            throw new Error(`Error cancelling research task ${taskId} with Python service: ${error.message}`);
        }
    }

    /**
     * Sends a request to the Python service to ingest documents for a specific task.
     * @param {string} taskId - The ID of the research task.
     * @param {Array<object>} documentsToIngest - Array of document objects. 
     * Each object should match the Python service's DocumentIngestionItem schema:
     * { file_path: string, original_name: string, file_id_from_node: any, file_type?: string, metadata?: object }
     * @returns {Promise<object>} - Resolves with the response from the Python service.
     */
    async ingestDocumentsForTask(taskId, ingestionPayload) { // Changed parameter name for clarity
        try {
            // Pass the entire ingestionPayload, which should include documents, reasoning_model_info, and api_config
            const response = await axios.post(`${this.baseUrl}/tasks/${taskId}/ingest_documents`, ingestionPayload);
            if (response.status === 200 && response.data) {
                return response.data;
            } else {
                throw new Error(`Failed to ingest documents for task ${taskId}. Status: ${response.status}, Data: ${JSON.stringify(response.data)}`);
            }
        } catch (error) {
            console.error(`[PythonResearchService] Error ingesting documents for task ${taskId}:`, error.response ? error.response.data : error.message);
            const pythonErrorMessage = error.response?.data?.detail || error.message;
            throw new Error(`Error ingesting documents with Python service for task ${taskId}: ${pythonErrorMessage}`);
        }
    }
}

const pythonResearchService = new PythonResearchService();

module.exports = { pythonResearchService };
