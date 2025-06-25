const { spawn } = require('child_process');
const path = require('path');
const { db } = require('../models/db');
const Model = require('../models/Model');
const eventBus = require('../utils/eventBus');

class VLLMService {
    constructor() {
        this.vllmProcess = null;
        this.activeModelId = null;
        this.activeModelContextSize = null;
    }

    // Detect model family based on model path/name for family-specific optimizations
    detectModelFamily(modelPath) {
        const modelName = modelPath.toLowerCase();
        
        if (modelName.includes('mistral') && modelName.includes('3.1')) {
            return 'mistral3.1';
        } else if (modelName.includes('mistral')) {
            return 'mistral';
        } else if (modelName.includes('llama') || modelName.includes('meta-llama')) {
            return 'llama';
        } else if (modelName.includes('gemma')) {
            return 'gemma';
        } else if (modelName.includes('deepseek')) {
            return 'deepseek';
        } else if (modelName.includes('phi')) {
            return 'phi';
        }
        
        return 'generic';
    }

    async initialize() {
        console.log('[vLLMService] Initializing vLLM service...');
        
        try {
            await this.killAllVLLMProcesses();
            
            const activeModel = await db.getAsync('SELECT id, name, model_format, model_path FROM models WHERE is_active = 1 AND model_format = "torch" AND is_embedding_model = 0 LIMIT 1');
            
            if (activeModel) {
                const fs = require('fs');
                if (!fs.existsSync(activeModel.model_path)) {
                    console.error(`[vLLMService] Active model path not found: ${activeModel.model_path}. Deactivating.`);
                    await db.runAsync('UPDATE models SET is_active = 0 WHERE id = ?', [activeModel.id]);
                    return;
                }

                console.log(`[vLLMService] Found active model on startup: ${activeModel.name} (ID: ${activeModel.id})`);
                console.log('[vLLMService] Starting model activation in background...');
                
                this.activateModel(activeModel.id).then(() => {
                    console.log(`[vLLMService] Successfully auto-loaded model ${activeModel.name} on startup`);
                }).catch(error => {
                    console.error(`[vLLMService] Failed to auto-load model ${activeModel.name} on startup:`, error);
                    db.runAsync('UPDATE models SET is_active = 0 WHERE id = ?', [activeModel.id]).catch(dbErr => {
                        console.error('[vLLMService] Error clearing active flag after startup failure:', dbErr);
                    });
                });
            } else {
                console.log('[vLLMService] No active torch models found on startup');
            }
            
            console.log('[vLLMService] Service initialization completed');
        } catch (error) {
            console.error('[vLLMService] Error during initialization:', error);
        }
    }

    async activateModel(modelId, providedActivationId = null) {
        const activationId = providedActivationId || `activation-${modelId}-${Date.now()}`;
        
        if (this.vllmProcess) {
            await this.deactivateCurrentModel();
        }

        const model = await Model.findById(modelId);
        if (!model || model.model_format !== 'torch') {
            throw new Error('Cannot activate a non-torch model with vLLM.');
        }

        eventBus.publish('activation:start', activationId, {
            modelId,
            modelName: model.name,
            progress: 0,
            message: 'Preparing model activation...',
            step: 'preparation'
        });

        const onDiskConfig = model.model_path ? require('../utils/vramCalculator').readModelConfig(model.model_path) : null;

        let dbConfig = {};
        if (model.config) {
            try {
                dbConfig = JSON.parse(model.config);
            } catch (e) {
                console.error(`[vLLMService] Error parsing DB config for ${model.name}:`, e);
            }
        }

        const finalConfig = { ...onDiskConfig, ...dbConfig };

        console.log(`[vLLMService] Activating model ${model.name} (ID: ${modelId}) with merged configuration:`);
        console.log(`[vLLMService] - Model path: ${model.model_path}`);
        console.log(`[vLLMService] - On-disk config found:`, !!onDiskConfig);
        console.log(`[vLLMService] - Final merged config:`, finalConfig);

        const onDiskQuantization = model.quantization_method || 'none';
        const desiredPrecision = finalConfig.model_precision || 'auto';
        const onDiskDtype = finalConfig.torch_dtype || 'auto';

        let quantizationArg = 'none';
        let dtypeArg = onDiskDtype; 

        if (onDiskQuantization && onDiskQuantization !== 'none') {
            quantizationArg = onDiskQuantization;
            dtypeArg = 'auto'; 
            console.log(`[vLLMService] Using on-disk quantization: ${quantizationArg}`);
        }
        else if (desiredPrecision && desiredPrecision !== 'auto') {
            switch (desiredPrecision) {
                case 'fp8':
                    quantizationArg = 'fp8';
                    dtypeArg = 'auto'; 
                    break;
                case 'int8': 
                case 'fp16':
                case 'bfloat16':
                    dtypeArg = desiredPrecision;
                    quantizationArg = 'none';
                    break;
                case 'int4':
                    // CRITICAL: vLLM does not support on-the-fly int4 quantization.
                    // It requires a pre-quantized model (like AWQ).
                    // If user selected 'int4' for a non-AWQ model, it's an invalid request.
                    // We log a warning and fall back to the on-disk dtype to prevent a crash.
                    console.warn(`[vLLMService] WARNING: 'int4' precision was selected for a non-quantized model. This is not supported for on-the-fly quantization in vLLM. Falling back to on-disk dtype '${onDiskDtype}'.`);
                    quantizationArg = 'none';
                    dtypeArg = onDiskDtype;
                    break;
                default:
                    dtypeArg = desiredPrecision;
                    quantizationArg = 'none';
            }
            console.log(`[vLLMService] Using user-selected precision '${desiredPrecision}', resulting in: quantization='${quantizationArg}', dtype='${dtypeArg}'`);
        }

        console.log(`[vLLMService] - Effective Quantization Arg: ${quantizationArg}`);
        console.log(`[vLLMService] - Effective DType Arg: ${dtypeArg}`);

        // Calculate context window first
        const requestedContext = model.context_window ? parseInt(model.context_window) : 16384;
        let actualContext = requestedContext;

        // Detect model family and apply optimizations
        const modelFamily = this.detectModelFamily(model.model_path);
        console.log(`[vLLMService] Detected model family: ${modelFamily}`);
        
        // Apply family-specific optimizations (vLLM 0.9.1 stable flags only)
        let familyOptimizations = {};
        switch (modelFamily) {
            case 'mistral3.1':
                familyOptimizations = {
                    dtype: dtypeArg === 'auto' ? 'bfloat16' : dtypeArg,
                    quantization: quantizationArg === 'none' ? 'bitsandbytes' : quantizationArg,
                    gpu_memory_utilization: 0.8,
                    max_model_len: Math.min(actualContext, 32768), // Cap at 32K for vLLM 0.9.1
                    max_num_seqs: finalConfig.max_num_seqs || 1,
                    trust_remote_code: true
                };
                console.log(`[vLLMService] Applied Mistral 3.1 optimizations: dtype=bfloat16, quantization=bitsandbytes`);
                break;
                
            case 'llama':
                familyOptimizations = {
                    trust_remote_code: true, // Required for Llama 3
                    dtype: dtypeArg === 'auto' ? 'auto' : dtypeArg,
                    gpu_memory_utilization: 0.8,
                    max_model_len: Math.min(actualContext, 32768),
                    max_num_seqs: finalConfig.max_num_seqs || 2
                };
                console.log(`[vLLMService] Applied Llama optimizations: trust_remote_code=true`);
                break;
                
            case 'gemma':
                familyOptimizations = {
                    trust_remote_code: true,
                    dtype: 'float16',
                    gpu_memory_utilization: 0.8,
                    max_model_len: Math.min(actualContext, 32768),
                    max_num_seqs: finalConfig.max_num_seqs || 1
                };
                console.log(`[vLLMService] Applied Gemma optimizations: dtype=float16`);
                break;
                
            case 'deepseek':
                familyOptimizations = {
                    dtype: dtypeArg === 'auto' ? 'auto' : dtypeArg,
                    quantization: quantizationArg === 'none' ? 'bitsandbytes' : quantizationArg,
                    gpu_memory_utilization: 0.8,
                    max_model_len: Math.min(actualContext, 32768),
                    max_num_seqs: finalConfig.max_num_seqs || 1,
                    trust_remote_code: true
                };
                console.log(`[vLLMService] Applied DeepSeek optimizations with bitsandbytes`);
                break;
                
            case 'phi':
                familyOptimizations = {
                    trust_remote_code: true,
                    dtype: dtypeArg === 'auto' ? 'auto' : dtypeArg,
                    gpu_memory_utilization: 0.7, // More conservative for Phi
                    max_num_seqs: finalConfig.max_num_seqs || 1,
                    max_model_len: Math.min(actualContext, 32768),
                    max_num_batched_tokens: 16384 // Smaller batches for Phi
                };
                console.log(`[vLLMService] Applied Phi optimizations: conservative memory and batch settings`);
                break;
                
            default:
                familyOptimizations = {
                    gpu_memory_utilization: 0.8,
                    max_model_len: Math.min(actualContext, 32768), // Always cap at 32K for vLLM 0.9.1
                    trust_remote_code: true
                };
                console.log(`[vLLMService] Using generic optimizations with 32K context cap`);
        }

        // Override with family optimizations while preserving user config
        const optimizedConfig = { ...finalConfig, ...familyOptimizations };
        
        // Update variables with optimized values
        if (familyOptimizations.dtype) {
            dtypeArg = familyOptimizations.dtype;
        }
        if (familyOptimizations.quantization && familyOptimizations.quantization !== quantizationArg) {
            quantizationArg = familyOptimizations.quantization;
        }
        actualContext = familyOptimizations.max_model_len;

        const pythonWrapperPath = path.join(__dirname, '../../scripts/python-wrapper.sh');
        const vllmScriptPath = path.join(__dirname, '../../scripts/start_vllm.py');
        
        const tensorParallelSize = optimizedConfig.tensor_parallel_size ? String(optimizedConfig.tensor_parallel_size) : '1';
        console.log(`[vLLMService] DEBUG: tensorParallelSize variable = '${tensorParallelSize}'`);
        
        const args = [
            vllmScriptPath,
            '--model', model.model_path,
            '--port', '8003',
            '--tensor-parallel-size', tensorParallelSize,
            '--served-model-name', String(model.id),
            '--gpu-memory-utilization', '0.95',
            '--block-size', '16',
            '--swap-space', '4'
        ];

        if (finalConfig.enable_prefix_caching) {
            args.push('--enable-prefix-caching');
        }
        if (finalConfig.max_num_seqs) {
            args.push('--max-num-seqs', String(finalConfig.max_num_seqs));
        }
        if (finalConfig.max_num_prefill_tokens) {
            args.push('--max-num-prefill-tokens', String(finalConfig.max_num_prefill_tokens));
        }
        if (finalConfig.serializer_workers) {
            args.push('--serializer-workers', String(finalConfig.serializer_workers));
        }
        const downloadDir = path.join(__dirname, '../../models/hf_cache');
        args.push('--download-dir', downloadDir);
        if (optimizedConfig.trust_remote_code) {
            args.push('--trust-remote-code');
        }
        
        const tpSize = parseInt(tensorParallelSize);
        if (tpSize >= 4) {
            args.push('--disable-custom-all-reduce');
            console.log(`[vLLMService] Using disable-custom-all-reduce for ${tpSize} GPUs`);
        }
        
        // Use optimized context from family optimizations
        let maxBatchedTokens;
        
        if (tpSize >= 2) {
            // Keep the family-optimized actualContext for multi-GPU setups
            console.log(`[vLLMService] Using family-optimized context ${actualContext} with ${tpSize} GPUs`);
        } else {
            if (actualContext > 32768) {
                actualContext = 32768;
                console.log(`[vLLMService] Reducing context from ${requestedContext} to ${actualContext} for single GPU efficiency`);
            }
        }
        
        // Apply family-specific batched tokens first, then fall back to context-based calculation
        if (familyOptimizations.max_num_batched_tokens) {
            maxBatchedTokens = familyOptimizations.max_num_batched_tokens;
            console.log(`[vLLMService] Using family-optimized max-num-batched-tokens: ${maxBatchedTokens}`);
        } else {
            if (actualContext <= 8192) {
                maxBatchedTokens = Math.max(8192, actualContext * 2); 
            } else if (actualContext <= 32768) {
                maxBatchedTokens = actualContext; 
            } else {
                maxBatchedTokens = Math.min(65536, actualContext); 
            }
        }
        
        args.push('--max-num-batched-tokens', String(maxBatchedTokens));
        console.log(`[vLLMService] Setting max-num-batched-tokens to ${maxBatchedTokens} for context window ${actualContext}`);
        
        console.log(`[vLLMService] DEBUG: Full args array:`, args);

        if (actualContext && actualContext > 0) {
            args.push('--max-model-len', String(actualContext));
            console.log(`[vLLMService] Setting max model length to ${actualContext}`);
        }

        if (quantizationArg && quantizationArg !== 'none') {
            args.push('--quantization', quantizationArg);
            console.log(`[vLLMService] Setting quantization to ${quantizationArg}.`);
        }
        
        if (dtypeArg && dtypeArg !== 'auto') {
            args.push('--dtype', dtypeArg);
            console.log(`[vLLMService] Setting dtype to ${dtypeArg}`);
        }

        // Note: config-format and tokenizer-mode flags are only available in vLLM nightly builds
        // These optimizations are handled internally by vLLM 0.9.1 stable

        // Update GPU memory utilization with family-specific value
        if (familyOptimizations.gpu_memory_utilization) {
            // Replace the default value
            const memUtilIndex = args.indexOf('--gpu-memory-utilization');
            if (memUtilIndex !== -1) {
                args[memUtilIndex + 1] = String(familyOptimizations.gpu_memory_utilization);
                console.log(`[vLLMService] Setting family-optimized GPU memory utilization to ${familyOptimizations.gpu_memory_utilization}`);
            }
        }

        console.log(`[vLLMService] vLLM command: ${pythonWrapperPath} ${args.join(' ')}`);

        this.vllmProcess = spawn(pythonWrapperPath, args, { 
            detached: false, 
            stdio: ['ignore', 'pipe', 'pipe'] 
        });
        this.activeModelId = modelId;
        this.activeModelContextSize = actualContext;

        // Enhanced progress tracking function
        const parseVLLMProgress = (logLine, fromStderr = false) => {
            const line = logLine.trim();
            
            let logLevel = 'INFO';
            if (line.includes('ERROR') || line.includes('FAILED') || line.includes('FATAL')) {
                logLevel = 'ERROR';
            } else if (line.includes('WARNING') || line.includes('WARN')) {
                logLevel = 'WARNING';
            } else if (line.includes('PERF') || line.includes('Maximum concurrency') || line.includes('# cpu blocks') || line.includes('# GPU blocks')) {
                logLevel = 'PERF';
            } else if (fromStderr && (line.includes('Loading safetensors') || line.includes('Completed |') || line.includes('%'))) {
                logLevel = 'INFO';
            } else if (fromStderr) {
                logLevel = 'WARNING';
            }
            
            eventBus.publish('activation:debug', activationId, {
                level: logLevel,
                message: line,
                timestamp: new Date().toISOString()
            });

            if (line.includes('Loading safetensors checkpoint shards')) {
                eventBus.publish('activation:progress', activationId, {
                    progress: 25,
                    message: 'Loading model weights from disk...',
                    step: 'loading_weights'
                });
            } else if (line.includes('Loading weights took')) {
                eventBus.publish('activation:progress', activationId, {
                    progress: 40,
                    message: 'Model weights loaded successfully',
                    step: 'weights_loaded'
                });
            } else if (line.includes('init engine') || line.includes('profile, create kv cache, warmup model')) {
                eventBus.publish('activation:progress', activationId, {
                    progress: 60,
                    message: 'Initializing vLLM engine and KV cache...',
                    step: 'engine_init'
                });
            } else if (line.includes('Starting vLLM API server')) {
                eventBus.publish('activation:progress', activationId, {
                    progress: 80,
                    message: 'Starting API server...',
                    step: 'server_start'
                });
            } else if (line.includes('Available routes are:')) {
                eventBus.publish('activation:progress', activationId, {
                    progress: 90,
                    message: 'API server routes initialized',
                    step: 'routes_ready'
                });
            } else if (line.includes('Automatically detected platform')) {
                eventBus.publish('activation:progress', activationId, {
                    progress: 15,
                    message: 'Detecting hardware platform...',
                    step: 'platform_detection'
                });
            } else if (line.includes('Maximum concurrency')) {
                const match = line.match(/Maximum concurrency.*?(\d+\.\d+)x/);
                const concurrency = match ? match[1] : 'unknown';
                eventBus.publish('activation:progress', activationId, {
                    progress: 75,
                    message: `Engine ready - Max concurrency: ${concurrency}x`,
                    step: 'engine_ready'
                });
            }

            if (line.includes('GPU memory utilization') || line.includes('blocks:')) {
                eventBus.publish('activation:debug', activationId, {
                    level: 'PERF',
                    message: line,
                    timestamp: new Date().toISOString()
                });
            }

            if (line.includes('WARNING') || line.includes('WARN')) {
                eventBus.publish('activation:debug', activationId, {
                    level: 'WARNING',
                    message: line,
                    timestamp: new Date().toISOString()
                });
            }
        };

        this.vllmProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log(`[vLLM stdout] ${output.trim()}`);
            
            const lines = output.split('\n');
            lines.forEach(line => {
                if (line.trim()) {
                    parseVLLMProgress(line.trim(), false);
                }
            });
        });

        this.vllmProcess.stderr.on('data', (data) => {
            const output = data.toString();
            console.error(`[vLLM stderr] ${output.trim()}`);
            
            const lines = output.split('\n');
            lines.forEach(line => {
                if (line.trim()) {
                    parseVLLMProgress(line.trim(), true);
                }
            });
        });

        this.vllmProcess.on('exit', async (code, signal) => {
            console.log(`[vLLMService] vLLM process exited with code ${code} and signal ${signal}`);
            
            if (this.activeModelId) {
                try {
                    await db.runAsync('UPDATE models SET is_active = 0 WHERE id = ?', [this.activeModelId]);
                    console.log(`[vLLMService] Cleaned up database for model ${this.activeModelId}`);
                } catch (dbErr) {
                    console.error('[vLLMService] Error cleaning up database:', dbErr);
                }
            }
            
            this.vllmProcess = null;
            this.activeModelId = null;
        });

        this.vllmProcess.on('error', async (err) => {
            console.error('[vLLMService] Error spawning vLLM process:', err);
            
            if (this.activeModelId) {
                try {
                    await db.runAsync('UPDATE models SET is_active = 0 WHERE id = ?', [this.activeModelId]);
                } catch (dbErr) {
                    console.error('[vLLMService] Error cleaning up database after spawn error:', dbErr);
                }
            }
            
            this.vllmProcess = null;
            this.activeModelId = null;
        });

        console.log(`[vLLMService] vLLM process for model ${model.name} spawned. Waiting for it to become ready...`);
        
        try {
            await this.waitForReady(300000, 10000, activationId);
            
            console.log(`[vLLMService] Updating database - deactivating other models and activating model ${modelId}`);
            await db.runAsync('UPDATE models SET is_active = 0 WHERE is_embedding_model = 0');
            const updateResult = await db.runAsync('UPDATE models SET is_active = 1 WHERE id = ?', [modelId]);
            
            const updatedModel = await db.getAsync('SELECT id, name, is_active FROM models WHERE id = ?', [modelId]);
            console.log(`[vLLMService] Database update result: affected ${updateResult.changes} rows`);
            console.log(`[vLLMService] Model ${modelId} database status: is_active = ${updatedModel?.is_active}`);
            
            console.log(`[vLLMService] Model ${model.name} is now ready and marked as active in database.`);
            
            eventBus.publish('activation:complete', activationId, {
                progress: 100,
                message: `Model ${model.name} is ready for inference!`,
                step: 'ready',
                modelId: modelId,
                modelName: model.name
            });
            
            eventBus.publish('active-model-changed', { modelId: modelId });
            eventBus.publish('worker-status-changed', { workers: { '0': { status: 'ready', gpuIndex: 0 } } });
            
            return { success: true, message: `vLLM server is ready with model ${model.name}`, activationId };
        } catch (error) {
            console.error(`[vLLMService] Error waiting for vLLM server to become ready: ${error.message}`);
            
            eventBus.publish('activation:error', activationId, {
                error: error.message,
                modelId: modelId,
                modelName: model.name
            });
            
            await this.forceCleanup(); 
            throw error; 
        }
    }

    async waitForReady(timeout = 300000, interval = 10000, activationId) { 
        const startTime = Date.now();
        const healthCheckUrl = `${this.getVllmApiUrl()}/v1/models`;
        let lastError = null;
        let consecutiveFailures = 0;

        console.log(`[vLLMService] Waiting for vLLM server at ${healthCheckUrl} (timeout: ${timeout/1000}s)`);

        while (Date.now() - startTime < timeout) {
            if (!this.vllmProcess || this.vllmProcess.killed) {
                await this.forceCleanup();
                throw new Error('vLLM process died during startup');
            }

            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 8000); 
                
                const response = await fetch(healthCheckUrl, { 
                    signal: controller.signal,
                    headers: { 'Accept': 'application/json' }
                });
                
                clearTimeout(timeoutId);
                consecutiveFailures = 0; 
                
                console.log(`[vLLMService] Health check response: ${response.status}`);
                
                if (response.ok) {
                    const data = await response.json();
                    console.log(`[vLLMService] Models available:`, data);
                    
                    if (data.data && data.data.length > 0) {
                        console.log(`[vLLMService] Server is ready with ${data.data.length} model(s)`);
                        return; 
                    }
                } else {
                    lastError = `HTTP ${response.status}: ${response.statusText}`;
                }
            } catch (error) {
                consecutiveFailures++;
                lastError = error.message;
                
                if ((Date.now() - startTime) % 30000 < interval) {
                    const elapsed = Math.round((Date.now() - startTime)/1000);
                    console.log(`[vLLMService] Still waiting... (${elapsed}s elapsed, ${consecutiveFailures} consecutive failures, last error: ${error.message})`);
                }
                
                if (activationId && error.message !== 'The user aborted a request.') {
                    eventBus.publish('activation:debug', activationId, {
                        level: 'INFO',
                        message: `Health check attempt ${consecutiveFailures}: ${error.message}`,
                        timestamp: new Date().toISOString()
                    });
                }
                
                const elapsed = Date.now() - startTime;
                if (elapsed > 240000 && consecutiveFailures > 20) { 
                    console.log('[vLLMService] Model appears stuck after 4+ minutes, initiating automatic cleanup...');
                    await this.forceCleanup();
                    throw new Error('vLLM model loading appears stuck - automatic cleanup initiated');
                }
            }
            
            await new Promise(resolve => setTimeout(resolve, interval));
        }

        console.log(`[vLLMService] TIMEOUT: Model failed to load in ${timeout/1000} seconds - performing automatic cleanup`);
        await this.forceCleanup();
        throw new Error(`vLLM server timeout after ${timeout/1000} seconds. Automatic cleanup performed. Last error: ${lastError || 'No response'}`);
    }

    async deactivateCurrentModel() {
        if (this.vllmProcess) {
            console.log('[vLLMService] Deactivating current vLLM model...');
            this.vllmProcess.kill('SIGTERM');
            
            await new Promise(resolve => {
                if (this.vllmProcess) {
                    this.vllmProcess.on('exit', resolve);
                    setTimeout(() => {
                        if (this.vllmProcess) {
                            console.log('[vLLMService] Force killing vLLM process...');
                            this.vllmProcess.kill('SIGKILL');
                        }
                        resolve();
                    }, 10000);
                } else {
                    resolve();
                }
            });
            
            this.vllmProcess = null;
            
            if (this.activeModelId) {
                await db.runAsync('UPDATE models SET is_active = 0 WHERE id = ?', [this.activeModelId]);
                console.log(`[vLLMService] Model ${this.activeModelId} marked as inactive in database.`);
            }
            
            this.activeModelId = null;
        }
        
        await this.killAllVLLMProcesses();
    }

    async killAllVLLMProcesses() {
        console.log('[vLLMService] Killing all vLLM processes...');
        const { exec } = require('child_process');
        const util = require('util');
        const execAsync = util.promisify(exec);

        const commands = [
            'pkill -TERM -f "vllm.entrypoints.openai.api_server"',
            'pkill -KILL -f "vllm.entrypoints.openai.api_server"',
            'lsof -ti:8003 | xargs -r kill -9'
        ];

        for (const command of commands) {
            try {
                await execAsync(command);
                console.log(`[vLLMService] Successfully executed: ${command}`);
                await new Promise(resolve => setTimeout(resolve, 1000)); 
            } catch (error) {
                if (error.code !== 1 && error.signal !== 'SIGTERM') {
                     console.log(`[vLLMService] Command failed as expected (no processes found) or with a minor error for '${command}': ${error.message}`);
                }
            }
        }

        try {
            const { stdout } = await execAsync('ps aux | grep "vllm.entrypoints.openai.api_server" | grep -v grep');
            if (stdout.trim()) {
                console.log('[vLLMService] WARNING: Some vLLM processes may still be running:');
                console.log(stdout);
            } else {
                console.log('[vLLMService] All vLLM processes successfully killed');
            }
        } catch (e) {
            console.log('[vLLMService] Process cleanup verification completed, no processes found.');
        }
    }

    async forceCleanup() {
        console.log('[vLLMService] Performing force cleanup...');
        
        if (this.vllmProcess) {
            try {
                this.vllmProcess.kill('SIGKILL');
            } catch (err) {
                console.error('[vLLMService] Error force killing process:', err);
            }
            this.vllmProcess = null;
        }
        
        await this.killAllVLLMProcesses();
        
        if (this.activeModelId) {
            try {
                await db.runAsync('UPDATE models SET is_active = 0 WHERE id = ?', [this.activeModelId]);
                console.log(`[vLLMService] Force cleaned database for model ${this.activeModelId}`);
            } catch (dbErr) {
                console.error('[vLLMService] Error in force cleanup database:', dbErr);
            }
        }
        
        this.activeModelId = null;
        
        console.log('[vLLMService] Force cleanup completed');
    }

    getVllmApiUrl() {
        return 'http://localhost:8003';
    }

    async shutdown() {
        console.log('[vLLMService] Shutting down vLLM service...');
        await this.deactivateCurrentModel();
    }
}

const vllmService = new VLLMService();
module.exports = vllmService;
