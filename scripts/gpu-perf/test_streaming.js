#!/usr/bin/env node
/**
 * Streaming Performance Benchmark Tool
 * 
 * This script tests the streaming performance of local LLMs with different batch sizes
 * and reports metrics on token generation speed and reliability.
 * 
 * Usage:
 *   node test_streaming.js --model=/path/to/model.gguf [options]
 * 
 * Options:
 *   --auto-params            Auto-detect optimal parameters for the model (recommended)
 *   --force-detect           Force re-detection of parameters even if cached
 *   --batch-sizes=8,16,32    Specify multiple batch sizes to test (comma-separated)
 *   --batch-size=32          Specify a single batch size to test
 *   --context=2048           Specify context window size to use
 *   --tokens=256             Number of tokens to generate
 *   --threads=8              Number of threads to use for inference
 *   --test-hallucination     Test anti-hallucination capabilities
 * 
 * Examples:
 *   # Automatically detect and use optimal parameters:
 *   node test_streaming.js --model=models/llama-7b.gguf --auto-params
 *
 *   # Test with multiple batch sizes:
 *   node test_streaming.js --model=models/llama-7b.gguf --batch-sizes=16,32,64
 *
 *   # Test with a single batch size:
 *   node test_streaming.js --model=models/llama-7b.gguf --batch-size=32 --context=8192
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { program } = require('commander');
const { getOptimalParameters, detectModelInfo, getCachedParams } = require('./detect_optimal_params'); // Assuming this doesn't read the config file itself

// Define command-line options
program
  .option('-m, --model <path>', 'Path to the model file')
  .option('-b, --batch-sizes <sizes>', 'Comma-separated batch sizes to test (default: 64,128,256,512)', '64,128,256,512')
  .option('--batch-size <size>', 'Single batch size to test (alternative to batch-sizes)')
  .option('-c, --context <size>', 'Context window size (default: 4096)', '4096')
  .option('-t, --tokens <count>', 'Number of tokens to generate (default: 256)', '256')
  .option('--test-hallucination', 'Test anti-hallucination measures', false)
  .option('--threads <count>', 'Number of threads to use (default: 8)', '8')
  .option('--auto-params', 'Auto-detect optimal parameters (overrides batch-sizes and context)', false)
  .option('--force-detect', 'Force re-detection of parameters even if cached', false)
  .parse(process.argv);

const options = program.opts();

// Validate required options
if (!options.model) {
  console.error('Error: Model path is required. Use --model=/path/to/model.gguf');
  process.exit(1);
}

if (!fs.existsSync(options.model)) {
  console.error(`Error: Model file not found at ${options.model}`);
  process.exit(1);
}

// Parse batch sizes to test
let batchSizes;
if (options.batchSize) {
  // If a single batch size is provided, use only that
  const singleBatchSize = parseInt(options.batchSize, 10);
  batchSizes = [singleBatchSize];
  console.log(`Using single batch size: ${singleBatchSize}`);
} else {
  // Otherwise use the comma-separated list
  batchSizes = options.batchSizes.split(',').map(size => parseInt(size.trim(), 10));
}

// Prepare test prompts
const standardPrompt = "Generate a detailed explanation of how transformer-based large language models work, including attention mechanisms and tokenization.";

const hallucinationPromptsWithAnswers = [
  {
    prompt: "Who is Dr. Who and what is his research on quantum teleportation?",
    expectedContains: ["don't have", "not familiar", "no information"]
  },
  {
    prompt: "Tell me about groundbreaking work on neural interface design.",
    expectedContains: ["don't have", "not familiar", "no information"]
  },
  {
    prompt: "Explain the main findings of the 2023 paper by Dr. Alex Chen on artificially conscious neural networks.",
    expectedContains: ["don't have", "not familiar", "no specific information"]
  }
];

// Helper function to measure token generation time
// Added threads parameter
async function benchmarkStreamingPerformance(batchSize, contextSize, tokenCount, threads) {
  console.log(`\nTesting with batch size: ${batchSize}, context: ${contextSize}, tokens: ${tokenCount}, threads: ${threads}`);

  const streamScript = path.join(__dirname, '../stream_model.py');
  const startTime = Date.now();

  let tokensGenerated = 0;
  let firstTokenTime = null;
  let errorOutput = '';

  return new Promise((resolve, reject) => {
    // Create a temporary params file like our stream.js service does
    const paramFile = path.join(require('os').tmpdir(), `test_params_${Date.now()}.json`);
    const modelParams = {
      batch_size: batchSize,
      n_ctx: contextSize,
      max_tokens: tokenCount,
      n_threads: threads, // Use passed threads value
      temperature: 0.7,
      prompt: standardPrompt
    };
    
    // Write params to temporary file
    fs.writeFileSync(paramFile, JSON.stringify(modelParams));
    
    // Use the params file instead of command-line arguments
    const pythonProcess = spawn('python3', [
      streamScript,
      '--model', options.model,
      '--params', paramFile
    ]);
    
    // Track if we need to clean up the temp file
    let fileDeleted = false;

    pythonProcess.stdout.on('data', (data) => {
      const tokens = data.toString();
      tokensGenerated += tokens.length;

      if (firstTokenTime === null) {
        firstTokenTime = Date.now() - startTime;
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      if (text.includes('Error') || text.includes('Failed')) {
        process.stderr.write(text);
      }
    });

    pythonProcess.on('close', (code) => {
      const endTime = Date.now();
      const totalTime = (endTime - startTime) / 1000;

      // Clean up the temporary params file
      if (!fileDeleted) {
        try {
          fs.unlinkSync(paramFile);
          fileDeleted = true;
        } catch (err) {
          console.warn(`Could not delete params file: ${err.message}`);
        }
      }

      if (code !== 0 || tokensGenerated === 0) {
        console.error(`Process exited with code ${code}`);
        console.error(`Detailed Error Output: ${errorOutput}`);
        reject(new Error(`Stream process failed with code ${code}`));
        return;
      }

      resolve({
        batchSize,
        contextSize,
        tokensGenerated,
        totalTimeSeconds: totalTime,
        tokensPerSecond: tokensGenerated / totalTime,
        timeToFirstTokenMs: firstTokenTime || 0
      });
    });
  });
}

// Test anti-hallucination measures
async function testAntiHallucination() {
  console.log('\n🧠 Testing Anti-Hallucination System');
  console.log('======================================');
  
  const results = [];
  
  for (const test of hallucinationPromptsWithAnswers) {
    console.log(`\nTesting prompt: "${test.prompt.substring(0, 60)}..."`);
    
    const streamScript = path.join(__dirname, '../stream_model.py');
    
    // Get optimal parameters for hallucination testing
    let batchSize = 128; // Default fallback
    let contextSize = 4096; // Default fallback
    
    // Try to use optimal parameters if auto-params is enabled
    if (options.autoParams) {
      try {
        const cachedParams = getCachedParams(options.model);
        if (cachedParams && cachedParams.batchSize) {
          batchSize = cachedParams.batchSize;
          contextSize = cachedParams.contextSize || 4096;
        }
      } catch (err) {
        // Silently fall back to defaults
      }
    }
    
    let response = '';
    
    try {
      await new Promise((resolve, reject) => {
        // Create a temporary params file
        const paramFile = path.join(require('os').tmpdir(), `test_params_${Date.now()}.json`);
        const modelParams = {
          batch_size: batchSize,
          n_ctx: contextSize,
          max_tokens: 256, 
          n_threads: parseInt(options.threads, 10),
          temperature: 0.7,
          prompt: test.prompt
        };
        
        // Write params to temporary file
        fs.writeFileSync(paramFile, JSON.stringify(modelParams));
        
        // Use the params file
        const pythonProcess = spawn('python3', [
          streamScript,
          '--model', options.model,
          '--params', paramFile
        ]);
        
        // Flag to track param file deletion
        let fileDeleted = false;
        
        // Collect response
        pythonProcess.stdout.on('data', (data) => {
          response += data.toString();
          process.stdout.write('.');
        });
        
        // Handle process completion
        pythonProcess.on('close', (code) => {
          // Clean up the temporary file
          if (!fileDeleted) {
            try {
              fs.unlinkSync(paramFile);
              fileDeleted = true;
            } catch (err) {
              console.warn(`Could not delete params file: ${err.message}`);
            }
          }
          
          if (code !== 0) {
            reject(new Error(`Process failed with code ${code}`));
          } else {
            resolve();
          }
        });
      });
      
      console.log('\nResponse received, checking for hallucination patterns...');
      
      // Check if the response contains any expected phrases
      const containsExpectedPhrase = test.expectedContains.some(phrase => 
        response.toLowerCase().includes(phrase.toLowerCase())
      );
      
      const result = {
        prompt: test.prompt,
        passed: containsExpectedPhrase,
        response: response.substring(0, 100) + '...' // Truncate for display
      };
      
      results.push(result);
      
      console.log(containsExpectedPhrase 
        ? '✅ PASSED: Model correctly indicated lack of knowledge' 
        : '❌ FAILED: Model may have hallucinated information');
      
    } catch (err) {
      console.error(`Error testing prompt: ${err.message}`);
      results.push({
        prompt: test.prompt,
        passed: false,
        error: err.message
      });
    }
  }
  
  return results;
}

// Main function
async function main() {
  console.log('🚀 Connect Streaming Performance Benchmark');
  console.log('=========================================');
  console.log(`Model: ${path.basename(options.model)}`);
  
  // Auto-detect parameters if requested
  let testBatchSizes = batchSizes; // Use parsed command-line batch sizes initially
  let contextSize = parseInt(options.context, 10);
  let testTokenCount = parseInt(options.tokens, 10);
  let threads = parseInt(options.threads, 10);
  
  // --- Load model_config.json ---
  let baseConfig = {};
  const modelDir = path.dirname(options.model);
  const configPath = path.join(modelDir, 'model_config.json');
  try {
    if (fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, 'utf8');
      baseConfig = JSON.parse(configContent);
      console.log(`\n⚙️ Loaded base config from ${configPath}:`);
      console.log(`   - Batch Size: ${baseConfig.batch_size || 'N/A'}`);
      console.log(`   - Context Size: ${baseConfig.n_ctx || 'N/A'}`);
      console.log(`   - Threads: ${baseConfig.n_threads || 'N/A'}`);
    } else {
      console.log(`\n⚠️ No model_config.json found at ${configPath}, using command-line/defaults.`);
    }
  } catch (err) {
    console.warn(`\n⚠️ Error reading ${configPath}: ${err.message}. Using command-line/defaults.`);
  }
  // --- End Load model_config.json ---

  // Determine final parameters, prioritizing command-line args over config file over defaults
  const finalContextSize = options.context !== '4096' ? parseInt(options.context, 10) : (baseConfig.n_ctx || 4096);
  const finalTokenCount = parseInt(options.tokens, 10);
  const finalThreads = options.threads !== '8' ? parseInt(options.threads, 10) : (baseConfig.n_threads || 8);

  // Determine batch sizes to test: Use command-line if specified, otherwise use config file value if present, else default list
  let finalBatchSizes = testBatchSizes; // Default from command-line parsing
  // Check if the user provided specific batch sizes via either --batch-size or --batch-sizes
  const userSpecifiedBatch = options.batchSize || options.batchSizes !== '64,128,256,512'; 
  
  if (!userSpecifiedBatch && baseConfig.batch_size) {
      // If default batch sizes were used AND config file has a batch size, test only the config value
      finalBatchSizes = [baseConfig.batch_size];
      console.log(`\n🎯 Testing specific batch size from config: ${baseConfig.batch_size}`);
  } else {
      console.log(`\n🎯 Testing batch sizes: ${finalBatchSizes.join(', ')}`);
  }
  console.log(`   Using Context Size: ${finalContextSize}`);
  console.log(`   Using Threads: ${finalThreads}`);
  console.log(`   Generating Tokens: ${finalTokenCount}`);
  
  // Run benchmark for each batch size
  const results = [];
  for (const batchSize of finalBatchSizes) {
    try {
      // Pass the final calculated parameters to the benchmark function
      const result = await benchmarkStreamingPerformance(
        batchSize,
        finalContextSize,
        finalTokenCount,
        finalThreads // Pass final threads value
      );
      results.push(result);
    } catch (err) {
      console.error(`Error testing batch size ${batchSize}: ${err.message}`);
    }
  }
  
  // Print results table
  console.log('\n📊 Performance Results');
  console.log('=====================');
  console.log('Batch Size | Tokens/sec | Time to First Token | Total Time');
  console.log('----------|------------|---------------------|------------');
  
  for (const result of results) {
    console.log(`${result.batchSize.toString().padEnd(10)} | ${result.tokensPerSecond.toFixed(2).padEnd(12)} | ${result.timeToFirstTokenMs}ms${' '.repeat(19 - result.timeToFirstTokenMs.toString().length)} | ${result.totalTimeSeconds.toFixed(2)}s`);
  }
  
  // Find optimal batch size based on tokens/sec
  if (results.length > 0) {
    const optimal = results.reduce((best, current) => 
      current.tokensPerSecond > best.tokensPerSecond ? current : best
    );
    
    console.log(`\n✨ Optimal batch size: ${optimal.batchSize} (${optimal.tokensPerSecond.toFixed(2)} tokens/sec)`);
  }
  
  // Test anti-hallucination if requested
  if (options.testHallucination) {
    const hallucinationResults = await testAntiHallucination();
    
    const passedTests = hallucinationResults.filter(r => r.passed).length;
    const totalTests = hallucinationResults.length;
    
    console.log(`\n🧠 Anti-Hallucination Score: ${passedTests}/${totalTests} (${(passedTests/totalTests*100).toFixed(1)}%)`);
    
    if (passedTests === totalTests) {
      console.log('✅ Perfect score! Anti-hallucination measures are working correctly.');
    } else if (passedTests > 0) {
      console.log('⚠️ Anti-hallucination measures are partially effective.');
    } else {
      console.log('❌ Anti-hallucination measures failed all tests.');
    }
  }
  
  console.log('\n📝 Recommendations:');
  console.log('------------------');
  console.log('1. For general use, select the batch size with the best tokens/sec rate');
  console.log('2. For the smoothest streaming experience, prefer smaller batch sizes (64-128)');
  console.log('3. For the fastest time to first token, choose the batch size with lowest "Time to First Token"');
  console.log('\nTest complete!');
}

// Run the benchmark
main().catch(err => {
  console.error(`Benchmark failed: ${err.message}`);
  process.exit(1);
});
