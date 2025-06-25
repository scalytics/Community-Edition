/**
 * Llama model processor
 * 
 * Specialized processor for the Llama family of models. 
 * Handles the unique formatting patterns and code generation styles.
 */
import BaseModelProcessor from './BaseModelProcessor';

class LlamaProcessor extends BaseModelProcessor {
  constructor() {
    super();
    this.name = 'llama';
    
    // Llama-specific patterns to clean
    this.patterns = [
      /<\/?s>/g,                                  // BOS/EOS tokens
      /<<\/?SYS>>\s*/g,                           // System message markers
      /\[\/?INST\]\s*/g,                          // Instruction markers
      /<\|im_start\|>system\s*/g,                 // System message start
      /<\|im_start\|>user\s*/g,                   // User message start
      /\[\/INST\]\]\s*/g,                         // Double closing instruction marker
      /\|\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s*$/gm, // Timestamp pattern
      /^\d+\|\s*/gm,                              // Message ID at line start
    ];
    
    // Llama3 specific bracket patterns
    this.bracketPatterns = [
      /^\]\s*(?!\n)/,                             // Leading bracket at beginning of line
      /^\]\s*\n+/,                                // Leading bracket with newlines
      /\n+\s*\[$/,                                // Trailing bracket at end
      /^\s*\]\s*$/,                               // Standalone bracket line
      /^\s*\[\s*$/,                               // Standalone opening bracket line
      /\s\]$/,                                    // Space followed by bracket
      /!\s*\]$/,                                  // Exclamation followed by bracket
      /\?\s*\]$/,                                 // Question mark followed by bracket
      /\.\s*\]$/,                                 // Period followed by bracket
      /\]\s*$/,                                   // Any closing bracket at end of text
      /([a-zA-Z0-9!?.,:;'")\]}]+)\s*\]$/          // Any sentence ending with bracket
    ];
  }

  /**
   * Detect if content is from Llama model family
   * 
   * @param {string} content - Content to analyze
   * @returns {string|null} - 'llama' if detected, null otherwise
   */
  detectModelFamily(content) {
    if (!content) return null;
    
    if (content.includes('[INST]') || 
        content.includes('[/INST]') || 
        content.match(/\]\s*$/) ||
        content.match(/^\s*\]\s*/)) {
      return 'llama';
    }
    return null;
  }

  /**
   * Apply Llama-specific pattern cleaning to a token
   * 
   * @param {string} token - Token to process
   * @returns {string} - Cleaned token
   */
  applyModelSpecificPatterns(token) {
    let result = token;
    
    // Apply base patterns
    for (const pattern of this.patterns) {
      result = result.replace(pattern, '');
    }
    
    // Apply bracket patterns
    for (const pattern of this.bracketPatterns) {
      result = result.replace(pattern, '');
    }
    
    return result;
  }

  /**
   * Process complete message with Llama-specific cleaning
   * 
   * @param {string} message - Complete message to process
   * @returns {string} - Processed message
   */
  applyModelSpecificMessageProcessing(message) {
    let processedMessage = message;
    
    // Apply all patterns
    for (const pattern of this.patterns) {
      processedMessage = processedMessage.replace(pattern, '');
    }
    
    // Special handling for Llama3 style brackets
    
    // Handle brackets at the start
    if (processedMessage.trim().startsWith(']')) {
      processedMessage = processedMessage.replace(/^\s*\]\s*/, '');
    }
    
    // Final cleanup for any trailing brackets
    processedMessage = processedMessage.replace(/\]\s*$/, '');
    
    // Handle cases where bracket is at the end of the trimmed content
    if (processedMessage.trim().endsWith(']')) {
      processedMessage = processedMessage.substring(0, processedMessage.lastIndexOf(']'));
    }
    
    // Handle timestamps and message IDs
    processedMessage = processedMessage.replace(/\|\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s*$/gm, '');
    processedMessage = processedMessage.replace(/^\d+\|\s*/gm, '');
    
    // Fix double closing instruction pattern
    processedMessage = processedMessage.replace(/\[\/INST\]\]/g, '');

    // Apply Llama ** WORD fix - Trim spaces around **
    processedMessage = processedMessage.replace(/\*\*\s+/g, '**').replace(/\s+\*\*/g, '**');
    
    return processedMessage;
  }

  /**
   * Detect code language from Llama generation
   * 
   * @param {string} code - Code to analyze
   * @returns {object} - Detection result {language, confidence}
   */
  detectCodeLanguage(code) {
    if (!code || code.length < 10) {
      return { language: null, confidence: 0 };
    }
    
    const firstLines = code.split('\n').slice(0, 3).join('\n');
    
    // Bash script detection - Llama is especially prone to generating bash scripts
    if (firstLines.includes('#!/bin/bash') ||
        firstLines.match(/^INPUT=$\d+/m) || 
        ((firstLines.includes('echo')) && ((firstLines.includes('$')) || (firstLines.includes('-e')))) ||
        code.match(/for\s+\w+\s+in\s+[$("]/m) ||
        ((code.includes('if')) && (code.includes('then')) && (code.includes('fi'))) ||
        (code.match(/\$\{.*?\}/)) ||
        ((code.includes('./')) && (code.includes('.sh')))) {
      return { language: 'bash', confidence: 0.8 };
    }
    
    // Python detection
    if (firstLines.match(/^(def|class|import|from)\s+/m) ||
        firstLines.match(/^if\s+__name__\s*==\s*('|")__main__('|"):/m) ||
        firstLines.match(/^#.*?Python/im) ||
        code.match(/random\.(randint|choice|random)/m) ||
        code.match(/^\s*for\s+\w+\s+in\s+/m) ||
        code.match(/=\s*input\(/m) ||
        code.includes('print(f"') || 
        (code.includes('=') && (code.includes('return') || code.includes('assert')))) {
      return { language: 'python', confidence: 0.7 };
    }
    
    // JavaScript/TypeScript detection
    if (firstLines.match(/^(const|let|var|function|import|export)\s+/m) ||
        firstLines.match(/=>\s*\{/m) ||
        firstLines.match(/^class\s+\w+(\s+extends\s+\w+)?\s*\{/m)) {
      return { 
        language: firstLines.includes('type ') || firstLines.includes('interface ') ? 'typescript' : 'javascript', 
        confidence: 0.7 
      };
    }
    
    return { language: null, confidence: 0 };
  }

  /**
   * Format code according to Llama's generation patterns
   * 
   * @param {string} code - Code to format
   * @param {string} language - Detected language
   * @returns {string} - Formatted code
   */
  formatCode(code, language) {
    if (!language || !code) {
      return code;
    }
    
    let formattedCode = code;
    
    // Bash script formatting (common in Llama outputs)
    if (language === 'bash' || language === 'sh') {
      // Fix shebang line spacing and broken shebang lines
      if (formattedCode.includes('#!/bin/bash') || (formattedCode.includes('#') && formattedCode.includes('/bin/bash'))) {
        // Fix standard shebang spacing
        formattedCode = formattedCode.replace(/^(#!\/bin\/bash)([^\n])/m, '$1\n$2');
        
        // Fix broken shebang lines (common in stored Llama outputs)
        formattedCode = formattedCode.replace(/^#\s*\n!\//m, '#!/');
        formattedCode = formattedCode.replace(/^#\s*\n\s*!\//m, '#!/');
        formattedCode = formattedCode.replace(/^#\n!\//m, '#!/');
      }
      
      // Fix completely broken shebang lines (specifically for stored messages)
      formattedCode = formattedCode.replace(/^#\n!\/bin\/bash/m, '#!/bin/bash');
      
      // Alternative fix for shebang issue - this is specifically from raw database content format
      formattedCode = formattedCode.replace(/bash#!\/bin\/bash/g, 'bash\n#!/bin/bash');
      
      // Fix missing newlines after variable assignments
      formattedCode = formattedCode.replace(/^([A-Z_]+=.+)([^\n])/gm, '$1\n$2');
      
      // Fix function definitions with missing newlines
      formattedCode = formattedCode.replace(/(for\s+\w+\s+in.+)([^\n;])/g, '$1\n$2');
      
      // Fix missing newlines in if statements
      formattedCode = formattedCode.replace(/(if\s+.+then)([^\n])/g, '$1\n$2');
      formattedCode = formattedCode.replace(/(then)([^\n;])/g, '$1\n$2');
      formattedCode = formattedCode.replace(/(else)([^\n;])/g, '$1\n$2');
      formattedCode = formattedCode.replace(/(fi)([^\n;])/g, '$1\n$2');
      
      // Fix indentation for lines following if/for/while
      formattedCode = formattedCode.replace(/^(if|for|while)(.+\n)([^\s])/gm, 
        (match, keyword, rest, nextLine) => `${keyword}${rest}  ${nextLine}`);
      
      // Fix missing spaces around command substitution
      formattedCode = formattedCode.replace(/\$\(([^)]+)\)/g, '$($1)');
    }
    
    return formattedCode;
  }

  /**
   * Handle code block processing with Llama-specific improvements
   *
   * @param {string} codeBlock - Complete code block
   * @returns {string} - Formatted code block
   */
  _formatCodeBlock(codeBlock) {
    let formattedBlock = super._formatCodeBlock(codeBlock);
    
    // Handle cases where language tag is attached to code without space
    // Example: ```bashecho "Hello"
    if (this.codeBlockLanguage) {
      const languageMarker = '```' + this.codeBlockLanguage;
      const firstLineBreak = formattedBlock.indexOf('\n', formattedBlock.indexOf(languageMarker));
      
      if (firstLineBreak === -1) {
        // No line break found, likely the language is attached directly to code
        const langMatch = formattedBlock.match(new RegExp(`${languageMarker}([A-Z]|[a-z{(#!].*)`));
        
        if (langMatch) {
          // Restructure to separate language from code
          formattedBlock = formattedBlock.replace(
            new RegExp(`${languageMarker}([A-Z]|[a-z{(#!].*)`), 
            `${languageMarker}\n$1`
          );
        }
      }
      
      // Handle Bash scripts specifically - fix common pattern in Llama outputs
      if (this.codeBlockLanguage.toLowerCase() === 'bash' || 
          this.codeBlockLanguage.toLowerCase() === 'sh') {
        // Apply bash-specific formatting from the formatCode method
        formattedBlock = this.formatCode(formattedBlock, 'bash');
      }
    }
    
    return formattedBlock;
  }
}

export default LlamaProcessor;
