import BaseModelProcessor from './BaseModelProcessor';

class ClaudeProcessor extends BaseModelProcessor {
  constructor() {
    super();
    this.name = 'claude';
    this.patterns = [
      /Human:\s*/g,
      /Assistant:\s*/g,
      /\[END_OF_TURN\]/g,
    ];
  }

  detectModelFamily(content) {
    if (!content) return null;
    
    if (content.includes('Human:') || content.includes('Assistant:') || 
        content.includes('[END_OF_TURN]')) {
      return 'claude';
    }
    return null;
  }

  applyModelSpecificPatterns(token) {
    let result = token;
    for (const pattern of this.patterns) {
      result = result.replace(pattern, '');
    }
    return result;
  }

  applyModelSpecificMessageProcessing(message) {
    let processed = message;
    
    // Apply patterns
    for (const pattern of this.patterns) {
      processed = processed.replace(pattern, '');
    }
    
    return processed;
  }

  detectCodeLanguage(code) {
    if (!code || code.length < 10) {
      return { language: null, confidence: 0 };
    }
    
    const firstLines = code.split('\n').slice(0, 3).join('\n');
    
    // Python detection
    if (firstLines.match(/^(def|class|import|from)\s+/m) ||
        firstLines.match(/^if\s+__name__\s*==\s*('|")__main__('|"):/m) ||
        code.includes('import ') || 
        (code.includes('=') && code.includes('return'))) {
      return { language: 'python', confidence: 0.7 };
    }
    
    // JavaScript/TypeScript detection
    if (firstLines.match(/^(const|let|var|function|import|export)\s+/m) ||
        firstLines.match(/=>\s*\{/m) ||
        firstLines.match(/^class\s+\w+(\s+extends\s+\w+)?\s*\{/m)) {
      const isTypeScript = firstLines.includes('type ') || 
                          firstLines.includes('interface ') || 
                          firstLines.includes(': string') || 
                          firstLines.includes(': number') || 
                          firstLines.includes(': boolean');
      return { 
        language: isTypeScript ? 'typescript' : 'javascript', 
        confidence: 0.7 
      };
    }
    
    return { language: null, confidence: 0 };
  }
}

export default ClaudeProcessor;
