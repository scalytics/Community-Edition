const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const PYTHON_WRAPPER_PATH = path.join(PROJECT_ROOT, 'scripts', 'python-wrapper.sh');
const UPDATE_SCRIPT_PATH = path.join(PROJECT_ROOT, 'scripts', 'update_domain_trust_scores.py');
const LOG_DIR = path.join(PROJECT_ROOT, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'domain_trust_update.log');

const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000;
const TARGET_HOUR_UTC = 3; // 3 AM UTC

let jobInterval = null;

function ensureLogDirectoryExists() {
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
    }
}

function runUpdateScript() {
    ensureLogDirectoryExists();
    const timestamp = new Date().toISOString();
    console.log(`[TrustScoreScheduler] [${timestamp}] Running daily domain trust score update...`);
    
    const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
    logStream.write(`\n[${timestamp}] Starting domain_trust_update.py execution...\n`);

    try {
        const pythonProcess = spawn(PYTHON_WRAPPER_PATH, [UPDATE_SCRIPT_PATH], {
            cwd: PROJECT_ROOT,
            shell: true,
            detached: true, // Allow parent to exit if needed, though Node will keep running
            stdio: 'pipe' // Capture stdio
        });

        pythonProcess.stdout.on('data', (data) => {
            const output = `[${new Date().toISOString()}] [Python STDOUT] ${data.toString()}`;
            console.log(output.trim());
            logStream.write(output);
        });

        pythonProcess.stderr.on('data', (data) => {
            const errorOutput = `[${new Date().toISOString()}] [Python STDERR] ${data.toString()}`;
            console.error(errorOutput.trim());
            logStream.write(errorOutput);
        });

        pythonProcess.on('close', (code) => {
            const closeTimestamp = new Date().toISOString();
            const closeMessage = `[TrustScoreScheduler] [${closeTimestamp}] Python script update_domain_trust_scores.py finished with code ${code}.\n`;
            console.log(closeMessage.trim());
            logStream.write(closeMessage);
            logStream.end();
        });

        pythonProcess.on('error', (err) => {
            const errorTimestamp = new Date().toISOString();
            const errorMessage = `[TrustScoreScheduler] [${errorTimestamp}] Failed to start Python script: ${err.message}\n`;
            console.error(errorMessage.trim());
            logStream.write(errorMessage);
            logStream.end();
        });
        // Unref to allow Node.js to exit if this is the only thing running (not usually the case for a server)
        pythonProcess.unref();

    } catch (error) {
        const errorTimestamp = new Date().toISOString();
        const errorMessage = `[TrustScoreScheduler] [${errorTimestamp}] Exception when trying to spawn Python script: ${error.message}\n`;
        console.error(errorMessage.trim());
        logStream.write(errorMessage);
        logStream.end();
    }
}

function scheduleDomainTrustUpdate() {
    if (jobInterval) {
        console.log('[TrustScoreScheduler] Job already scheduled.');
        return;
    }

    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setUTCHours(TARGET_HOUR_UTC, 0, 0, 0); // Set to 3:00:00.000 AM UTC

    if (now.getUTCHours() >= TARGET_HOUR_UTC) {
        // If current time is past 3 AM UTC, schedule for 3 AM UTC tomorrow
        nextRun.setUTCDate(now.getUTCDate() + 1);
    }

    const delayUntilNextRun = nextRun.getTime() - now.getTime();

    console.log(`[TrustScoreScheduler] Initial run scheduled for: ${nextRun.toISOString()}. Delay: ${delayUntilNextRun / 1000 / 60} minutes.`);

    setTimeout(() => {
        runUpdateScript(); // Run immediately
        // Then schedule subsequent runs every 24 hours
        jobInterval = setInterval(runUpdateScript, DAILY_INTERVAL_MS);
        console.log(`[TrustScoreScheduler] Daily job scheduled to run every 24 hours. Next run around ${new Date(Date.now() + DAILY_INTERVAL_MS).toISOString()}`);
    }, delayUntilNextRun);
}

// Optional: function to stop the scheduler if needed
function stopScheduledJob() {
    if (jobInterval) {
        clearInterval(jobInterval);
        jobInterval = null;
        console.log('[TrustScoreScheduler] Daily domain trust update job stopped.');
    }
}

module.exports = { scheduleDomainTrustUpdate, stopScheduledJob };
