#!/usr/bin/env node

/**
 * Helper script to view Cursor hook logs
 * Usage: node .cursor/hooks/view-logs.js [type]
 * Types: commands, errors, all
 */

const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();
const logDir = path.join(projectRoot, '.cursor', 'logs');
const type = process.argv[2] || 'all';

function viewLogs() {
  if (!fs.existsSync(logDir)) {
    console.log('No logs directory found. Hooks will create it when they run.');
    return;
  }
  
  if (type === 'commands' || type === 'all') {
    const readableLog = path.join(logDir, 'agent-commands-readable.log');
    if (fs.existsSync(readableLog)) {
      console.log('\n=== Command Log (Readable) ===');
      const content = fs.readFileSync(readableLog, 'utf8');
      console.log(content || '(empty)');
    } else {
      console.log('\n=== Command Log (Readable) ===');
      console.log('(no commands logged yet)');
    }
    
    const jsonLog = path.join(logDir, 'agent-commands.log');
    if (fs.existsSync(jsonLog)) {
      const lines = fs.readFileSync(jsonLog, 'utf8').trim().split('\n').filter(l => l);
      console.log(`\n=== Command Log Summary (${lines.length} entries) ===`);
      const recent = lines.slice(-10);
      recent.forEach((line, idx) => {
        try {
          const entry = JSON.parse(line);
          const status = entry.success ? '✓' : '✗';
          console.log(`${status} [${entry.timestamp}] ${entry.command}`);
        } catch (e) {
          console.log(`  ${line}`);
        }
      });
      if (lines.length > 10) {
        console.log(`\n... and ${lines.length - 10} more entries`);
      }
    }
  }
  
  if (type === 'errors' || type === 'all') {
    const errorLog = path.join(logDir, 'hook-errors.log');
    if (fs.existsSync(errorLog)) {
      console.log('\n=== Hook Errors ===');
      const content = fs.readFileSync(errorLog, 'utf8');
      console.log(content || '(no errors)');
    } else {
      console.log('\n=== Hook Errors ===');
      console.log('(no errors logged)');
    }
  }
  
  if (type !== 'commands' && type !== 'errors' && type !== 'all') {
    console.log('Usage: node .cursor/hooks/view-logs.js [commands|errors|all]');
  }
}

viewLogs();



