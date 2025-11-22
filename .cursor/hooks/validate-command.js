#!/usr/bin/env node

/**
 * Cursor Hook: beforeShellCommand
 * Prevents dangerous operations:
 * - rm -rf and variations
 * - Changing directory outside project context
 * - Accessing .env files
 */

const fs = require('fs');
const path = require('path');

// Get project root directory
const projectRoot = process.cwd();

// Read command from stdin (Cursor passes JSON)
let input = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  input += chunk;
});

process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const command = data.command || '';
    
    // Block rm -rf and variations
    const rmPatterns = [
      /rm\s+-rf/i,
      /rm\s+-r\s+-f/i,
      /rm\s+.*-rf/i,
      /rm\s+.*-r.*-f/i,
      /rm\s+-r\s+.*-f/i,
      /rm\s+-f\s+-r/i,
      /rm\s+.*-f.*-r/i,
      /rm\s+.*-r.*-f/i,
      /rm\s+--recursive\s+--force/i,
      /rm\s+--force\s+--recursive/i,
      /rm\s+-rf\s+/i,
      /rm\s+-rf$/i,
    ];
    
    for (const pattern of rmPatterns) {
      if (pattern.test(command)) {
        const error = {
          error: 'Command blocked: rm -rf and variations are not allowed for safety reasons.',
          command: command,
          blocked: true
        };
        console.error(JSON.stringify(error));
        process.exit(1);
      }
    }
    
    // Block changing directory to root, home, or outside project
    const cdPatterns = [
      /cd\s+\/$/,
      /cd\s+\/home/,
      /cd\s+\/root/,
      /cd\s+~$/,
      /cd\s+\.\.\/\.\.\/\.\./,
      /cd\s+\.\.\/\.\.\/\.\.\/\.\./,
    ];
    
    for (const pattern of cdPatterns) {
      if (pattern.test(command)) {
        const error = {
          error: 'Command blocked: Changing directory outside project context is not allowed.',
          command: command,
          blocked: true
        };
        console.error(JSON.stringify(error));
        process.exit(1);
      }
    }
    
    // Check for cd commands that go outside project root
    const cdMatch = command.match(/cd\s+(.+)/);
    if (cdMatch) {
      const targetPath = cdMatch[1].trim().replace(/['"]/g, '');
      const resolvedPath = path.resolve(projectRoot, targetPath);
      
      // Check if resolved path is outside project root
      if (!resolvedPath.startsWith(projectRoot)) {
        const error = {
          error: 'Command blocked: Cannot change directory outside project context.',
          command: command,
          targetPath: targetPath,
          resolvedPath: resolvedPath,
          projectRoot: projectRoot,
          blocked: true
        };
        console.error(JSON.stringify(error));
        process.exit(1);
      }
    }
    
    // Block access to .env files
    const envPatterns = [
      /cat\s+.*\.env/i,
      /less\s+.*\.env/i,
      /more\s+.*\.env/i,
      /head\s+.*\.env/i,
      /tail\s+.*\.env/i,
      /grep\s+.*\.env/i,
      /view\s+.*\.env/i,
      /vim\s+.*\.env/i,
      /nano\s+.*\.env/i,
      /code\s+.*\.env/i,
      /open\s+.*\.env/i,
      /read\s+.*\.env/i,
    ];
    
    for (const pattern of envPatterns) {
      if (pattern.test(command)) {
        const error = {
          error: 'Command blocked: Accessing .env files containing sensitive data is not allowed.',
          command: command,
          blocked: true
        };
        console.error(JSON.stringify(error));
        process.exit(1);
      }
    }
    
    // Check for file operations on .env files
    if (command.includes('.env') && (
      command.includes('cat') ||
      command.includes('less') ||
      command.includes('more') ||
      command.includes('head') ||
      command.includes('tail') ||
      command.includes('grep') ||
      command.includes('view') ||
      command.includes('vim') ||
      command.includes('nano') ||
      command.includes('code') ||
      command.includes('open') ||
      command.includes('read')
    )) {
      const error = {
        error: 'Command blocked: Accessing .env files containing sensitive data is not allowed.',
        command: command,
        blocked: true
      };
      console.error(JSON.stringify(error));
      process.exit(1);
    }
    
    // Allow the command
    const response = {
      allow: true,
      command: command
    };
    console.log(JSON.stringify(response));
    process.exit(0);
    
  } catch (error) {
    // If JSON parsing fails, allow the command (fail open, but log)
    const logPath = path.join(projectRoot, '.cursor', 'logs', 'hook-errors.log');
    const logDir = path.dirname(logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    fs.appendFileSync(logPath, `${new Date().toISOString()} - Error in validate-command.js: ${error.message}\n`);
    
    const response = {
      allow: true,
      warning: 'Hook validation error, allowing command',
      error: error.message
    };
    console.log(JSON.stringify(response));
    process.exit(0);
  }
});



