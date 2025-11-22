#!/usr/bin/env node

/**
 * Cursor Hook: beforeReadFile
 * Prevents reading .env files containing sensitive data
 * Also prevents reading files outside project context
 */

const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();

// Read command data from stdin
let input = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  input += chunk;
});

process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const filePath = data.file || data.path || data.uri || '';
    
    if (!filePath) {
      console.log(JSON.stringify({ allow: true, reason: 'No file path provided' }));
      process.exit(0);
    }
    
    // Normalize the path
    let normalizedPath = filePath;
    if (filePath.startsWith('file://')) {
      normalizedPath = filePath.replace('file://', '');
    }
    
    const fullPath = path.resolve(projectRoot, normalizedPath);
    
    // Block reading .env files (except .env.example)
    if (normalizedPath.includes('.env') && !normalizedPath.includes('.env.example')) {
      const error = {
        error: 'Reading .env files containing sensitive data is not allowed.',
        file: normalizedPath,
        blocked: true
      };
      console.error(JSON.stringify(error));
      process.exit(1);
    }
    
    // Block reading files outside project root
    if (!fullPath.startsWith(projectRoot)) {
      const error = {
        error: 'Cannot read files outside project context.',
        file: normalizedPath,
        resolvedPath: fullPath,
        projectRoot: projectRoot,
        blocked: true
      };
      console.error(JSON.stringify(error));
      process.exit(1);
    }
    
    // Allow reading the file
    console.log(JSON.stringify({
      allow: true,
      file: normalizedPath
    }));
    process.exit(0);
    
  } catch (error) {
    // On error, allow the read but log it
    const logDir = path.join(projectRoot, '.cursor', 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const errorLog = path.join(logDir, 'hook-errors.log');
    fs.appendFileSync(errorLog, `${new Date().toISOString()} - Error in prevent-env-access.js: ${error.message}\n`);
    
    console.log(JSON.stringify({
      allow: true,
      warning: 'Pre-read check error, allowing read',
      error: error.message
    }));
    process.exit(0);
  }
});


