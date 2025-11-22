#!/usr/bin/env node

/**
 * Cursor Hook: afterShellCommand
 * Logs every command executed by the agent
 */

const fs = require('fs');
const path = require('path');

// Get project root directory
const projectRoot = process.cwd();
const logDir = path.join(projectRoot, '.cursor', 'logs');
const logFile = path.join(logDir, 'agent-commands.log');

// Ensure log directory exists
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Read command data from stdin
let input = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  input += chunk;
});

process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const command = data.command || 'unknown';
    const exitCode = data.exitCode || 0;
    const timestamp = new Date().toISOString();
    const workingDir = data.workingDir || process.cwd();
    
    // Format log entry
    const logEntry = {
      timestamp: timestamp,
      command: command,
      exitCode: exitCode,
      workingDir: workingDir,
      success: exitCode === 0
    };
    
    // Write to log file
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
    
    // Also write a human-readable format
    const humanReadable = `[${timestamp}] ${exitCode === 0 ? '✓' : '✗'} ${command} (cwd: ${workingDir})\n`;
    fs.appendFileSync(logFile.replace('.log', '-readable.log'), humanReadable);
    
    // Output success response
    console.log(JSON.stringify({ logged: true, timestamp: timestamp }));
    
  } catch (error) {
    // Log the error but don't fail
    const errorLog = path.join(logDir, 'hook-errors.log');
    fs.appendFileSync(errorLog, `${new Date().toISOString()} - Error in log-command.js: ${error.message}\n`);
    console.log(JSON.stringify({ logged: false, error: error.message }));
  }
  
  process.exit(0);
});



