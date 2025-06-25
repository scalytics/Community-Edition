import BaseModelProcessor from './BaseModelProcessor';

class GeminiProcessor extends BaseModelProcessor {
  constructor() {
    super();
    this.name = 'gemini';
    this.patterns = [
      /<start_of_turn>/g,
      /<end_of_turn>/g,
    ];
  }

  detectModelFamily(content) {
    if (!content) return null;
    
    if (content.includes('<start_of_turn>') || content.includes('<end_of_turn>')) {
      return 'gemini';
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
        code.includes('print(') ||
        (code.includes('=') && code.includes('return'))) {
      return { language: 'python', confidence: 0.7 };
    }
    
    // JavaScript detection
    if (firstLines.match(/^(const|let|var|function|import|export)\s+/m) ||
        firstLines.match(/=>\s*\{/m) ||
        firstLines.match(/^class\s+\w+(\s+extends\s+\w+)?\s*\{/m)) {
      return { language: 'javascript', confidence: 0.6 };
    }
    
    return { language: null, confidence: 0 };
  }
}

export default GeminiProcessor;
