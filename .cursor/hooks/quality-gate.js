#!/usr/bin/env node

/**
 * Cursor Hook: afterFileEdit
 * Automated quality gates based on coding_guidelines.md
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = process.cwd();
const guidelinesPath = path.join(projectRoot, 'prompts', 'coding_guidelines.md');

// Read command data from stdin
let input = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  input += chunk;
});

process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const filePath = data.file || data.path || '';
    
    if (!filePath || !fs.existsSync(filePath)) {
      console.log(JSON.stringify({ allow: true, reason: 'File not found or path not provided' }));
      process.exit(0);
    }
    
    const fullPath = path.resolve(projectRoot, filePath);
    
    // Block editing files outside project root
    if (!fullPath.startsWith(projectRoot)) {
      const error = {
        error: 'Cannot edit files outside project context.',
        file: filePath,
        resolvedPath: fullPath,
        projectRoot: projectRoot,
        blocked: true
      };
      console.error(JSON.stringify(error));
      process.exit(1);
    }
    
    // Block editing .env files (additional safety check)
    if (filePath.includes('.env') && !filePath.includes('.env.example')) {
      const error = {
        error: 'Editing .env files containing sensitive data is not allowed.',
        file: filePath,
        blocked: true
      };
      console.error(JSON.stringify(error));
      process.exit(1);
    }
    const fileContent = fs.readFileSync(fullPath, 'utf8');
    const lines = fileContent.split('\n');
    const issues = [];
    const warnings = [];
    
    // Quality Gate 1: File Size Check (max 150 lines per coding guidelines)
    if (lines.length > 150) {
      warnings.push({
        rule: 'File Size',
        message: `File exceeds 150 lines (${lines.length} lines). Consider breaking it down into smaller modules.`,
        severity: 'warning',
        lineCount: lines.length
      });
    }
    
    // Quality Gate 2: TypeScript Guidelines
    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
      // Check for 'any' type usage
      const anyMatches = fileContent.match(/\bany\b/g);
      if (anyMatches && anyMatches.length > 0) {
        issues.push({
          rule: 'TypeScript: Avoid any type',
          message: `Found ${anyMatches.length} usage(s) of 'any' type. Use specific types or 'unknown' instead.`,
          severity: 'error',
          count: anyMatches.length
        });
      }
      
      // Check for non-null assertion operator
      const nonNullMatches = fileContent.match(/[^!]![\s\.,;\)\]\}]/g);
      if (nonNullMatches && nonNullMatches.length > 0) {
        warnings.push({
          rule: 'TypeScript: Avoid non-null assertion',
          message: `Found ${nonNullMatches.length} usage(s) of non-null assertion operator (!). Handle null/undefined explicitly.`,
          severity: 'warning',
          count: nonNullMatches.length
        });
      }
      
      // Check for missing type annotations in function parameters
      const functionParamPattern = /function\s+\w+\s*\([^)]*\)/g;
      const matches = fileContent.match(functionParamPattern);
      if (matches) {
        matches.forEach((match, index) => {
          if (!match.includes(':')) {
            warnings.push({
              rule: 'TypeScript: Type annotations',
              message: 'Function parameters should have explicit type annotations.',
              severity: 'warning',
              location: `Function ${index + 1}`
            });
          }
        });
      }
    }
    
    // Quality Gate 3: Code Clarity - Check for TODO comments
    const todoMatches = fileContent.match(/TODO|FIXME|XXX/gi);
    if (todoMatches && todoMatches.length > 0) {
      warnings.push({
        rule: 'Code Clarity: TODO comments',
        message: `Found ${todoMatches.length} TODO/FIXME comment(s). Please resolve before committing.`,
        severity: 'warning',
        count: todoMatches.length
      });
    }
    
    // Quality Gate 4: Error Handling - Check for try-catch blocks in async functions
    const asyncFunctions = fileContent.match(/async\s+function|\basync\s+\w+\s*\(/g);
    if (asyncFunctions) {
      const hasTryCatch = fileContent.includes('try') && fileContent.includes('catch');
      if (!hasTryCatch && asyncFunctions.length > 0) {
        warnings.push({
          rule: 'Error Handling',
          message: 'Async functions should have proper error handling with try-catch blocks.',
          severity: 'warning'
        });
      }
    }
    
    // Quality Gate 5: Run ESLint if available
    try {
      if (filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
        const eslintConfig = path.join(projectRoot, '.eslintrc.json');
        if (fs.existsSync(eslintConfig)) {
          try {
            execSync(`npx eslint "${fullPath}" --format json`, { 
              encoding: 'utf8',
              stdio: 'pipe',
              cwd: projectRoot,
              timeout: 10000
            });
          } catch (eslintError) {
            // ESLint found issues
            const eslintOutput = eslintError.stdout || eslintError.stderr || '';
            try {
              const eslintResults = JSON.parse(eslintOutput);
              if (eslintResults && eslintResults.length > 0 && eslintResults[0].messages) {
                const errorCount = eslintResults[0].messages.filter(m => m.severity === 2).length;
                const warningCount = eslintResults[0].messages.filter(m => m.severity === 1).length;
                
                if (errorCount > 0 || warningCount > 0) {
                  warnings.push({
                    rule: 'ESLint',
                    message: `ESLint found ${errorCount} error(s) and ${warningCount} warning(s).`,
                    severity: 'warning',
                    errors: errorCount,
                    warnings: warningCount
                  });
                }
              }
            } catch (parseError) {
              // Couldn't parse ESLint output, but that's okay
            }
          }
        }
      }
    } catch (error) {
      // ESLint not available or error running it, continue
    }
    
    // Quality Gate 6: Check for unused imports (basic check)
    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
      const importLines = lines.filter(line => line.trim().startsWith('import '));
      // This is a basic check - a full implementation would require AST parsing
      warnings.push({
        rule: 'Code Hygiene',
        message: `Found ${importLines.length} import statement(s). Ensure all imports are used.`,
        severity: 'info',
        count: importLines.length
      });
    }
    
    // Prepare response
    const response = {
      allow: issues.length === 0, // Block if there are errors
      file: filePath,
      issues: issues,
      warnings: warnings,
      qualityScore: calculateQualityScore(issues, warnings, lines.length)
    };
    
    if (issues.length > 0) {
      console.error(JSON.stringify(response));
      process.exit(1);
    } else {
      console.log(JSON.stringify(response));
      process.exit(0);
    }
    
  } catch (error) {
    // On error, allow the edit but log it
    const logDir = path.join(projectRoot, '.cursor', 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const errorLog = path.join(logDir, 'hook-errors.log');
    fs.appendFileSync(errorLog, `${new Date().toISOString()} - Error in quality-gate.js: ${error.message}\n`);
    
    console.log(JSON.stringify({
      allow: true,
      warning: 'Quality gate check error, allowing edit',
      error: error.message
    }));
    process.exit(0);
  }
});

function calculateQualityScore(issues, warnings, lineCount) {
  let score = 100;
  
  // Deduct points for errors
  score -= issues.length * 20;
  
  // Deduct points for warnings
  score -= warnings.length * 5;
  
  // Deduct points for large files
  if (lineCount > 150) {
    score -= Math.min(10, (lineCount - 150) / 10);
  }
  
  return Math.max(0, Math.min(100, score));
}


