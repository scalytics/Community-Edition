/**
 * Base model processor
 * 
 * This class provides the foundation for all model-specific processors.
 * It defines common methods and utilities that can be overridden by
 * specific implementations.
 */
class BaseModelProcessor {
  constructor() {
    this.name = 'base';
    
    // Common patterns for thinking/reasoning sections
    this.thinkingPatterns = [
      '<think>',
      '<thinking>',
      '<|thinking|>',
      'I need to think',
      'Let me think',
      'Let\'s think',
      'Thinking:'
    ];
    
    this.endThinkingPatterns = [
      '</think>',
      '</thinking>',
      '</|thinking|>',
      '<|assistant|>', 
      'Answer:',
      'Response:'
    ];
    
    // State for processing
    this.buffer = '';
    this.inThinkingSection = false;
    this.inCodeBlock = false;
    this.codeBlockLanguage = null;
    this.pendingCodeBlock = '';
  }

  /**
   * Detect which model family a piece of content belongs to
   * 
   * @param {string} content - Text content to analyze
   * @returns {string|null} - Model family name or null if not detected
   */
  detectModelFamily(content) {
    // Base implementation returns null - specific processors should override
    return null;
  }

  /**
   * Process a token for streaming display
   * 
   * @param {string} token - Raw token from model
   * @returns {string|null} - Processed token (minimal filtering for streaming)
   */
  processToken(token) {
    // Re-introducing thinking tag filtering for streaming, but keeping other processing minimal.
    if (!token) return null;

    // Add to buffer for pattern matching thinking tags
    this.buffer += token;
    if (this.buffer.length > 500) { // Keep buffer reasonable
      this.buffer = this.buffer.substring(this.buffer.length - 500);
    }

    // Process thinking sections - This was the necessary part for filtering
    const thinkingResult = this._processThinkingSections(token);
    if (thinkingResult !== undefined) {
      // thinkingResult will be null if token is part of thinking, or the token itself (or part of it) if not.
      return thinkingResult; 
    }

    // If not part of a thinking section, return the token as is.
    // No code block batching or other pattern filtering during streaming here.
    return token;
  }

  /**
   * Process a complete message
   * 
   * @param {string} message - Complete message from model
   * @returns {string} - Processed message
   */
  processCompleteMessage(message) {
    if (!message) return '';
    
    this.reset();
    
    let processedMessage = message;
    
    // Remove thinking blocks
    processedMessage = processedMessage.replace(/<think>[\s\S]*?<\/think>/gs, '');
    processedMessage = processedMessage.replace(/<thinking>[\s\S]*?<\/thinking>/gs, '');
    processedMessage = processedMessage.replace(/<\|thinking\|>[\s\S]*?<\/\|thinking\|>/gs, '');
    
    // Apply common patterns
    processedMessage = this._applyCommonMessagePatterns(processedMessage);
    
    // Apply model-specific processing
    processedMessage = this.applyModelSpecificMessageProcessing(processedMessage);
    
    // Final cleanup and return
    return processedMessage.trim();
  }

  /**
   * Reset processing state
   */
  reset() {
    this.inThinkingSection = false;
    this.inCodeBlock = false;
    this.codeBlockLanguage = null;
    this.pendingCodeBlock = '';
    this.buffer = '';
  }

  /**
   * Apply model-specific patterns to a token
   * (To be overridden by specific processors)
   * 
   * @param {string} token - Token to process
   * @returns {string} - Processed token
   */
  applyModelSpecificPatterns(token) {
    // Base implementation returns token unchanged
    return token;
  }

  /**
   * Apply model-specific processing to a complete message
   * (To be overridden by specific processors)
   * 
   * @param {string} message - Message to process
   * @returns {string} - Processed message
   */
  applyModelSpecificMessageProcessing(message) {
    // Base implementation returns message unchanged
    return message;
  }

  /**
   * Attempt to detect the language of a code block
   * 
   * @param {string} code - Code content to analyze
   * @returns {object} - Language detection result {language, confidence}
   */
  detectCodeLanguage(code) {
    // Base implementation returns no detection
    return { language: null, confidence: 0 };
  }

  /**
   * Format code according to best practices for the model and language
   * 
   * @param {string} code - Raw code to format
   * @param {string} language - Detected language
   * @returns {string} - Formatted code
   */
  formatCode(code, language) {
    // Base implementation returns code unchanged
    return code;
  }

  /**
   * Filter common unwanted patterns from a token
   * 
   * @private
   * @param {string} token - Token to filter
   * @returns {string} - Filtered token
   */
  _filterCommonPatterns(token) {
    // Common markers across models
    return token
      .replace(/<\|assistant\|>/g, '')
      .replace(/<\|im_start\|>assistant/g, '')
      .replace(/<\|im_end\|>/g, '');
  }

  /**
   * Apply common processing to complete messages
   * 
   * @private
   * @param {string} message - Message to process
   * @returns {string} - Processed message
   */
  _applyCommonMessagePatterns(message) {
    // Fix common markdown header issues
    let processed = message;
    
    // --- DISABLED Markdown Header Fixes ---
    // // Fix 1: Correct headers without proper spacing
    // processed = processed.replace(/(\w+)(#{1,6})(\s*[A-Za-z0-9])/g, (match, text, hashes, afterHash) => {
    //   return `${text}\n${hashes}${afterHash}`;
    // });
    
    // // Fix 2: Ensure headers have proper spacing and begin on their own line
    // processed = processed.replace(/([^\n])(\s*)(#{1,6}\s+\S)/g, (match, prevChar, space, header) => {
    //   return `${prevChar}\n${header}`;
    // });
    
    // // Fix 3: Headers without spaces after the hash
    // processed = processed.replace(/^(#{2,6})([^#\s].+)$/gm, (match, hashes, content) => {
    //   const level = Math.min(hashes.length, 6);
    //   return `${'#'.repeat(level)} ${content}`;
    // });
    // --- END DISABLED ---
    
    // Fix common error patterns
    processed = processed.replace(/\(Note: The system did not recognize.*?\)/gi, '');
    processed = processed.replace(/Error: model is not defined/gi, '');
    
    // Extract after Answer:/Response: if present
    const answerMatch = processed.match(/(?:Answer:|Response:)([\s\S]*)/i);
    if (answerMatch && answerMatch[1]) {
      return answerMatch[1].trim();
    }
    
    return processed;
  }

  /**
   * Process thinking section markers in streaming
   * 
   * @private
   * @param {string} token - Token to process
   * @returns {string|null|undefined} - Processed token, null to filter, or undefined to continue
   */
  _processThinkingSections(token) {
    // Check for closing thinking patterns
    for (const pattern of this.endThinkingPatterns) {
      if (this.buffer.includes(pattern) && this.inThinkingSection) {
        this.inThinkingSection = false;
        if (pattern === 'Answer:' || pattern === 'Response:') {
          const answerPos = token.indexOf(pattern);
          if (answerPos !== -1) return token.substring(answerPos + pattern.length);
        }
        return null; // Filter token with end tag
      }
    }
    
    // Check for thinking start patterns
    for (const pattern of this.thinkingPatterns) {
      if (this.buffer.includes(pattern) && !this.inThinkingSection) {
        this.inThinkingSection = true;
        const patternPos = token.indexOf(pattern);
        if (patternPos !== -1) {
          const beforePattern = token.substring(0, patternPos);
          return beforePattern.trim() ? beforePattern : null;
        }
        return null; // Filter token with start tag
      }
    }
    
    // If we're in a thinking section, filter the token
    if (this.inThinkingSection) {
      return null;
    }
    
    // Not related to thinking sections, continue processing
    return undefined;
  }

  /**
   * Handle code block processing in streaming
   * 
   * @private
   * @param {string} token - Token containing code block markers
   * @returns {string|null} - Processed token or null to filter
   */
  _handleCodeBlock(token) {
    // Check for inline code (```code```)
    const firstBackticks = token.indexOf('```');
    const secondBackticks = token.indexOf('```', firstBackticks + 3);
    
    if (firstBackticks !== -1 && secondBackticks !== -1 && 
        token.substring(firstBackticks, secondBackticks).indexOf('\n') === -1 &&
        !this.inCodeBlock) {
      // Inline code - return unchanged
      return token;
    }
    
    if (!this.inCodeBlock) {
      // Starting a code block
      const codeStart = token.indexOf('```');
      const lineEnd = token.indexOf('\n', codeStart);
      const nextTripleBackticks = token.indexOf('```', codeStart + 3);
      
      // If another ``` on same line with no newlines, it's inline code
      if (nextTripleBackticks !== -1 && 
          (lineEnd === -1 || nextTripleBackticks < lineEnd)) {
        return token;
      }
      
      // It's a real code block
      this.inCodeBlock = true;
      
      // Special handling for code blocks that follow section headers like "Skript:"
      const codeBlockSectionHeaders = ['Script:', 'Skript:', 'Code:', 'Example:', 'Beispiel:'];
      let precedingText = token.substring(0, codeStart).trim();
      
      if (codeBlockSectionHeaders.some(header => precedingText.endsWith(header))) {
        // If we just found a section header, make sure it's separated from the code block
        const beforeCode = token.substring(0, codeStart);
        if (!beforeCode.endsWith('\n\n')) {
          // Ensure a double newline between header and code block
          const headerEnd = Math.max(...codeBlockSectionHeaders.map(h => 
            precedingText.endsWith(h) ? beforeCode.lastIndexOf(h) + h.length : -1
          ));
          
          if (headerEnd !== -1) {
            const updatedBeforeCode = beforeCode.substring(0, headerEnd) + '\n\n' + 
                                      beforeCode.substring(headerEnd).trim();
            this.pendingCodeBlock = token.substring(codeStart);
            return updatedBeforeCode;
          }
        }
      }
      
      // Extract language if present
      if (lineEnd > codeStart) {
        const langPart = token.substring(codeStart + 3, lineEnd).trim();
        
        // Check if this might be a language tag attached to code
        if (langPart.length > 0) {
          // Look for language identifier followed immediately by code
          const langCodeMatch = langPart.match(/^([a-zA-Z0-9_+#]+)([a-zA-Z0-9{(#!].*)$/);
          
          if (langCodeMatch) {
            // We've found a language tag immediately followed by code
            const lang = langCodeMatch[1];
            const codeStart = langCodeMatch[2];
            
            // Store just the language part
            this.codeBlockLanguage = lang;
            
            // Restructure token with proper newline after language
            const beforeCode = token.substring(0, firstBackticks);
            this.pendingCodeBlock = "```" + lang + "\n" + codeStart;
            
            return beforeCode.trim() ? beforeCode : null;
          } else {
            // Normal language tag
            this.codeBlockLanguage = langPart;
          }
        } else {
          this.codeBlockLanguage = null;
        }
        
        // Split at the code block start
        const beforeCode = token.substring(0, codeStart);
        this.pendingCodeBlock = token.substring(codeStart);
        
        return beforeCode.trim() ? beforeCode : null;
      } else {
        // No newline yet, accumulate
        this.pendingCodeBlock = token;
        return null;
      }
    } else {
      // Already in a code block, accumulate and check for ending
      this.pendingCodeBlock += token;
      
      // If we found closing backticks, format and return the block
      if (token.includes('```') && token.indexOf('```') !== 0) {
        const formattedBlock = this._formatCodeBlock(this.pendingCodeBlock);
        
        // Reset code block state
        this.inCodeBlock = false;
        this.codeBlockLanguage = null;
        this.pendingCodeBlock = '';
        
        return formattedBlock;
      }
      
      return null; // Still accumulating code block
    }
  }

  /**
   * Format a complete code block
   * 
   * @private
   * @param {string} codeBlock - Complete code block with markdown backticks
   * @returns {string} - Formatted code block
   */
  _formatCodeBlock(codeBlock) {
    // Check if language tag is attached to code without a newline
    let formattedBlock = codeBlock;
    
    // Fix common language formatting issue where language is attached to code
    const codeBlockStartMatch = formattedBlock.match(/```([a-zA-Z0-9_+#]+)([^\n])/);
    if (codeBlockStartMatch) {
      const language = codeBlockStartMatch[1];
      const firstChar = codeBlockStartMatch[2];
      
      // If we found attached content, separate it with a newline
      formattedBlock = formattedBlock.replace(
        new RegExp(`\`\`\`${language}${firstChar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), 
        `\`\`\`${language}\n${firstChar}`
      );
      
      // Set the language for future reference
      this.codeBlockLanguage = language;
    }
    
    // Ensure proper closing
    formattedBlock = formattedBlock.replace(/```\s*$/, '\n```');
    
    return formattedBlock;
  }

  /**
   * Fix markdown code blocks with special attention to headers
   * 
   * @private
   * @param {string} text - Text to fix
   * @returns {string} - Fixed text
   */
  _fixMarkdownCodeBlocks(text) {
    if (!text) return '';
    
    // Make sure code blocks with headers after them get proper spacing
    let fixedText = text.replace(/```\s*\n?(#{1,6}\s+)/g, '```\n\n$1');
    
    // Ensure blank line before headers
    fixedText = fixedText.replace(/([^\n])\n(#{1,6}\s+)/g, '$1\n\n$2');
    
    return fixedText;
  }
}

export default BaseModelProcessor;
