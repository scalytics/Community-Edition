/**
 * Filtering Worker Service
 *
 * Manages the lifecycle and communication with the dedicated Python
 * filtering worker process using spaCy (or potentially other libraries later).
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');
const { getSystemSetting } = require('../config/systemConfig'); 

const PYTHON_WORKER_SCRIPT = path.join(__dirname, '../workers/python/filtering_worker.py');
const VENV_PYTHON_PATH = path.join(process.cwd(), 'venv', 'bin', 'python');

class FilteringWorkerService extends EventEmitter {
    constructor() {
        super();
        this.workerProcess = null;
        this.status = 'stopped'; 
        this.modelInfo = null; 
        this.pendingRequests = new Map();
        this.currentRequestId = 0;
        this.readyPromise = null;
        this.resolveReadyPromise = null;
        this.rejectReadyPromise = null;
        this.keepAliveInterval = null;
        this.lastError = null;
        this.restartAttempts = 0;
        this.maxRestarts = 3;
        this.restartDelay = 5000;
    }

    // Initialize and start the worker (called on demand or at startup)
    async initialize() {
        if (this.status === 'ready' || this.status === 'starting') {
            return this.readyPromise || Promise.resolve();
        }
        console.log('[FilterWorker] Initializing...');
        await this.stopWorker(); 
        return this._startWorker();
    }

    _startWorker() {
        if (this.workerProcess || this.status === 'starting') {
            return this.readyPromise || Promise.resolve();
        }

        this.status = 'starting';
        this.lastError = null;
        this.modelInfo = null;
        this.emit('status', this.status);

        // Create a new ready promise
        this.readyPromise = new Promise((resolve, reject) => {
            this.resolveReadyPromise = resolve;
            this.rejectReadyPromise = reject;
        });

        let activeLanguages = ['en']; 
        try {
            const langSetting = getSystemSetting('active_filter_languages', '["en"]');
            try {
                activeLanguages = JSON.parse(langSetting);
                if (!Array.isArray(activeLanguages) || activeLanguages.length === 0) {
                    console.warn('[FilterWorker] Invalid or empty active_filter_languages setting, defaulting to ["en"]. Value:', langSetting);
                    activeLanguages = ['en'];
                }
            } catch (parseError) {
                console.error('[FilterWorker] Error parsing active_filter_languages setting, defaulting to ["en"]. Value:', langSetting, parseError);
                activeLanguages = ['en'];
            }

            if (!fs.existsSync(VENV_PYTHON_PATH)) {
                throw new Error(`Python executable not found: ${VENV_PYTHON_PATH}`);
            }
            if (!fs.existsSync(PYTHON_WORKER_SCRIPT)) {
                throw new Error(`Filtering worker script not found: ${PYTHON_WORKER_SCRIPT}`);
            }

            const workerEnv = {
                ...process.env,
                PYTHONUNBUFFERED: "1"
            };

            console.log(`[FilterWorker] Spawning worker: ${VENV_PYTHON_PATH} ${PYTHON_WORKER_SCRIPT}`);
            this.workerProcess = spawn(VENV_PYTHON_PATH, [PYTHON_WORKER_SCRIPT], {
                env: workerEnv,
                stdio: ['pipe', 'pipe', 'pipe'] 
            });

            this.workerProcess.stdout.setEncoding('utf-8');
            this.workerProcess.stderr.setEncoding('utf-8');

            this.workerProcess.stdout.on('data', (data) => this._handleWorkerMessage(data));
            this.workerProcess.stderr.on('data', (data) => {
                console.error(`[FilterWorker STDERR] ${data.toString().trim()}`);
            });
            this.workerProcess.on('error', (error) => this._handleWorkerError(error));

            const configMessage = { type: 'config', active_languages: activeLanguages };
            this.workerProcess.stdin.write(JSON.stringify(configMessage) + '\n');
            console.log('[FilterWorker] Sent config to worker:', configMessage);

            this.workerProcess.on('exit', (code, signal) => this._handleWorkerExit(code, signal));

            const readyTimeout = setTimeout(() => {
                if (this.status === 'starting') {
                    this._handleWorkerError(new Error('Filtering worker ready timeout (e.g., 60s)'));
                }
            }, 60000); 
            this.readyPromise.finally(() => clearTimeout(readyTimeout));

        } catch (error) {
            this._handleWorkerError(error);
        }
        return this.readyPromise;
    }

    _handleWorkerMessage(data) {
        const messages = data.toString().split('\n');
        for (const messageStr of messages) {
            if (!messageStr) continue;
            try {
                const message = JSON.parse(messageStr);

                if (message.type === 'ready') {
                    if (this.status === 'starting') {
                        this.status = 'ready';
                        this.modelInfo = message.modelInfo || null;
                        this.lastError = null;
                        this.restartAttempts = 0;
                        if (this.resolveReadyPromise) this.resolveReadyPromise();
                        this.emit('status', this.status, this.modelInfo);
                        this._startKeepAlive();
                        console.log('[FilterWorker] Worker is ready.', this.modelInfo);
                    }
                } else if (message.type === 'ner_result') {
                    const request = this.pendingRequests.get(message.requestId);
                    if (request) {
                        clearTimeout(request.timeoutId);
                        request.resolve(message.entities); 
                        this.pendingRequests.delete(message.requestId);
                    }
                } else if (message.type === 'error') {
                    const requestId = message.requestId;
                    const errorMsg = message.error || 'Unknown worker error';
                    if (requestId) {
                        const request = this.pendingRequests.get(requestId);
                        if (request) {
                            clearTimeout(request.timeoutId);
                            request.reject(new Error(errorMsg));
                            this.pendingRequests.delete(requestId);
                        }
                    } else {
                        console.error(`[FilterWorker] Received general error: ${errorMsg}`);
                        this._handleWorkerError(new Error(errorMsg)); 
                    }
                } else if (message.type === 'pong') {
                }

            } catch (error) {
                console.error(`[FilterWorker] Error parsing message: ${error}\nRaw data: ${messageStr}`);
            }
        }
    }

    _handleWorkerError(error) {
        console.error(`[FilterWorker] Worker process error: ${error.message}`);
        this.status = 'error';
        this.lastError = error.message;
        if (this.rejectReadyPromise) this.rejectReadyPromise(error);
        this._rejectAllPendingRequests(`Worker process error: ${error.message}`);
        this.emit('status', this.status, this.lastError);
        this._stopKeepAlive();
        this.workerProcess = null;
        this._attemptRestart(); 
    }

    _handleWorkerExit(code, signal) {
        const reason = signal ? `signal ${signal}` : `code ${code}`;
        console.warn(`[FilterWorker] Worker process exited with ${reason}. Status was: ${this.status}`);
        const wasReady = this.status === 'ready';
        this.status = 'stopped';
        this.lastError = `Worker exited unexpectedly (${reason})`;
        if (this.rejectReadyPromise && !wasReady) this.rejectReadyPromise(new Error(this.lastError));
        this._rejectAllPendingRequests(`Worker process exited unexpectedly (${reason})`);
        this.emit('status', this.status, this.lastError);
        this._stopKeepAlive();
        this.workerProcess = null;

        // Only restart if it exited unexpectedly while it should have been running
        if (code !== 0 && signal !== 'SIGTERM' && signal !== 'SIGINT') {
            this._attemptRestart();
        }
    }

    _attemptRestart() {
        if (this.restartAttempts < this.maxRestarts) {
            this.restartAttempts++;
            console.log(`[FilterWorker] Attempting restart ${this.restartAttempts}/${this.maxRestarts} in ${this.restartDelay}ms...`);
            setTimeout(() => {
                if (this.status !== 'starting' && this.status !== 'ready') {
                    this.initialize(); 
                }
            }, this.restartDelay);
        } else {
            console.error(`[FilterWorker] Max restart attempts reached. Worker will remain stopped.`);
            this.status = 'error';
            this.emit('status', this.status, 'Max restart attempts reached');
        }
    }

    _rejectAllPendingRequests(reason) {
        this.pendingRequests.forEach(request => {
            clearTimeout(request.timeoutId);
            request.reject(new Error(reason));
        });
        this.pendingRequests.clear();
    }

    _startKeepAlive() {
        this._stopKeepAlive();
        this.keepAliveInterval = setInterval(() => {
            if (this.workerProcess && this.status === 'ready') {
                try {
                    this.workerProcess.stdin.write(JSON.stringify({ type: 'ping' }) + '\n');
                } catch (error) {
                    console.error('[FilterWorker] Error sending ping:', error.message);
                    this._handleWorkerError(new Error('Failed to send keep-alive ping'));
                }
            }
        }, 30000); 
    }

    _stopKeepAlive() {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
    }

    async stopWorker() {
        console.log('[FilterWorker] Stopping worker...');
        this._stopKeepAlive();
        if (this.workerProcess) {
            return new Promise((resolve) => {
                this.workerProcess.removeAllListeners(); 
                this.workerProcess.on('exit', () => {
                    console.log('[FilterWorker] Worker process exited.');
                    this.workerProcess = null;
                    this.status = 'stopped';
                    this.emit('status', this.status);
                    resolve();
                });
                this.workerProcess.kill('SIGTERM');
                setTimeout(() => {
                    if (this.workerProcess) {
                        console.warn('[FilterWorker] Worker did not exit cleanly, forcing kill (SIGKILL).');
                        this.workerProcess.kill('SIGKILL');
                    }
                    resolve(); 
                }, 3000); 
            });
        }
        this.status = 'stopped';
        this.emit('status', this.status);
        return Promise.resolve();
    }

    /**
     * Sends text to the Python worker for NER detection for a specific language.
     * @param {string} text - The text to analyze.
     * @param {string[]} entityTypes - Array of entity types to detect (e.g., ['PERSON', 'GPE']).
     * @param {string} language - The language code (e.g., 'en', 'de', 'fr', 'es'). Defaults to 'en'.
     * @returns {Promise<Array>} A promise that resolves with an array of detected entities.
     */
    async detectEntities(text, entityTypes, language = 'en') {
        if (this.status !== 'ready') {
            if (this.status === 'starting' && this.readyPromise) {
                console.log('[FilterWorker] Worker starting, awaiting ready promise...');
                await this.readyPromise; 
                if (this.status !== 'ready') {
                     throw new Error(`Filtering worker failed to become ready. Status: ${this.status}, Error: ${this.lastError}`);
                }
                 console.log('[FilterWorker] Worker now ready, proceeding with request.');
            } else {
                 console.warn(`[FilterWorker] Worker not ready (Status: ${this.status}). Attempting to initialize...`);
                 await this.initialize();
                 if (this.status !== 'ready') {
                     throw new Error(`Filtering worker failed to initialize. Status: ${this.status}, Error: ${this.lastError}`);
                 }
                 console.log('[FilterWorker] Worker initialized, proceeding with request.');
            }
        }
        if (!text || typeof text !== 'string') {
            return []; 
        }

        return new Promise((resolve, reject) => {
            this.currentRequestId++;
            const requestId = this.currentRequestId;
            const message = {
                type: 'ner_detect',
                requestId,
                text,
                entities: entityTypes || [], 
                language: language 
            };

            const timeoutDuration = 30000; 
            const timeoutId = setTimeout(() => {
                if (this.pendingRequests.has(requestId)) {
                    this.pendingRequests.delete(requestId);
                    reject(new Error(`NER detection request ${requestId} timed out after ${timeoutDuration / 1000} seconds.`));
                }
            }, timeoutDuration);

            this.pendingRequests.set(requestId, { resolve, reject, timeoutId });

            try {
                this.workerProcess.stdin.write(JSON.stringify(message) + '\n');
            } catch (error) {
                clearTimeout(timeoutId);
                this.pendingRequests.delete(requestId);
                console.error(`[FilterWorker] Error sending NER request ${requestId}:`, error.message);
                reject(new Error(`Failed to send message to filtering worker: ${error.message}`));
            }
        });
    }

    getStatus() {
        return {
            status: this.status,
            modelInfo: this.modelInfo,
            pid: this.workerProcess?.pid,
            lastError: this.lastError
        };
    }
}

// Singleton instance
const filteringWorkerService = new FilteringWorkerService();

// Optional: Initialize on startup? Or initialize on first request?
// For now, initialize on first request via detectEntities check.
// filteringWorkerService.initialize();

// Graceful shutdown
process.on('SIGINT', async () => { await filteringWorkerService.stopWorker(); process.exit(0); });
process.on('SIGTERM', async () => { await filteringWorkerService.stopWorker(); process.exit(0); });


module.exports = { filteringWorkerService };
