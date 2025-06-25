import processors from './processors';

class ModelProcessingService {
  constructor() {
    this.processors = processors;
    this.defaultProcessor = this.processors.base;
    this.lastDetectedFamily = null;
  }

  detectModelFamily(content) {
    if (!content) return null;
    
    for (const [family, processor] of Object.entries(this.processors)) {
      if (family === 'base') continue;
      
      const detected = processor.detectModelFamily(content);
      if (detected) return detected;
    }
    
    return null;
  }

  processToken(token, modelFamily = null) {
    const family = modelFamily || this.lastDetectedFamily || this.detectModelFamily(token);
    if (family) this.lastDetectedFamily = family;
    
    const processor = family ? this.processors[family] : this.defaultProcessor;
    return processor.processToken(token);
  }

  processCompleteMessage(message, modelFamily = null) {
    const family = modelFamily || this.detectModelFamily(message);
    const processor = family ? this.processors[family] : this.defaultProcessor;
    
    // Apply model-specific message processing
    let processed = processor.processCompleteMessage(message);
    return processed;
  }
  
  /**
   * Ensure code blocks in loaded messages have proper formatting
   * @param {string} content - Message content
   * @returns {string} - Content with minimally fixed code blocks
   */
  ensureMinimalCodeBlockFormatting(contentInput) {
    const content = String(contentInput || ''); // Ensure content is a string
    if (!content || !content.includes('```')) return content;
    
    let fixed = content;
    
    // Add two newlines after language identifier for visual spacing
    fixed = fixed.replace(/```([a-zA-Z0-9_+-]+)\s*\n/g, (match, language) => {
      // Ensure two newlines follow the language identifier
      return "```" + language + "\n\n"; 
    });
    
    // Fix 1: Ensure opening ``` are on their own line if followed by non-whitespace
    // Adjust this regex slightly to account for the change above, ensuring it doesn't match the language line itself
    fixed = fixed.replace(/```([^\n]*\S+)/g, (match, codeContent) => {
      if (!match.includes("=======")) { // Skip if we already processed it above
        return "```\n" + codeContent.trim();
      }
      return match;
    });
    
    // Fix 2: Ensure closing ``` are on their own line if preceded by non-whitespace
    fixed = fixed.replace(/([^\n\s]+)```/g, (match, codeContent) => {
      return codeContent + "\n```";
    });
    
    return fixed;
  }
  
  /**
   * Protect inline code references in explanations from being modified
   */
  _protectInlineCodeReferences(content) {
    if (!content) return content;
    
    let processed = content;
    
    const inlineCodeRegex = /([^`])`([^`]+)`([^`])/g;
    processed = processed.replace(inlineCodeRegex, (match, before, code, after) => {
      return before + '`' + code + '`' + after;
    });
    
    return processed;
  }

  detectCodeLanguage(code) {
    if (!code) return { language: null, confidence: 0 };
    
    let bestMatch = { language: null, confidence: 0 };
    
    for (const processor of Object.values(this.processors)) {
      const result = processor.detectCodeLanguage(code);
      if (result.confidence > bestMatch.confidence) {
        bestMatch = result;
      }
    }
    
    return bestMatch;
  }

  formatCode(code, language) {
    if (!code || !language) return code;
    
    const modelFamily = this.lastDetectedFamily;
    if (modelFamily && this.processors[modelFamily]) {
      const formatted = this.processors[modelFamily].formatCode(code, language);
      if (formatted !== code) return formatted;
    }
    
    for (const processor of Object.values(this.processors)) {
      const formatted = processor.formatCode(code, language);
      if (formatted !== code) return formatted;
    }
    
    return code;
  }

  reset() {
    this.lastDetectedFamily = null;
    for (const processor of Object.values(this.processors)) {
      processor.reset();
    }
  }

  // Integration points for backend systems
  async formatPrompt(modelId, messages) {
    return `User: ${messages[messages.length - 1].content}`;
  }

  async sanitizeResponse(modelId, response, options = {}) {
    return this.processCompleteMessage(response);
  }
}

// Create instance first, then export, to avoid anonymous default export warning
const modelProcessingService = new ModelProcessingService();
export default modelProcessingService;
