import BaseModelProcessor from './BaseModelProcessor';

class PhiProcessor extends BaseModelProcessor {
  constructor() {
    super();
    this.name = 'phi';
    this.patterns = [
      /<\|system\|>\s*/g,   // System role tag
      /<\|user\|>\s*/g,     // User role tag  
      /<\|assistant\|>\s*/g, // Assistant role tag
      /<\|end\|>\s*/g,      // End tag
      /````(`*)/g,          // Fix excessive backticks
      /Instruct:/g,         // Old Phi-2 format
      /Output:/g,           // Old Phi-2 format
    ];
    
    // Common language patterns for code formatting
    this.languagePatterns = {
      go: /^package\s+(\w+)/,
      python: /^(import|from|def|class)/,
      javascript: /^(import|export|const|let|var|function|class)/,
      typescript: /^(import|export|type|interface|class|const|let|var|function)/,
      java: /^(package|import|public|class|interface)/,
      rust: /^(use|fn|struct|enum|impl|pub)/,
      cpp: /^(#include|using|class|void|int|template)/
    };
  }

  detectModelFamily(content) {
    if (!content) return null;
    
    if (content.includes('Instruct:') || content.includes('Output:') || 
       (content.includes('<|') && content.includes('|>') && content.includes('<|end|>'))) {
      return 'phi';
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
    
    // Fix Phi's tendency to use excessive backticks
    processed = processed.replace(/```````+/g, '```');
    
    // Fix Phi's code blocks with language attached to first line
    processed = this._fixCodeBlocks(processed);
    
    return processed;
  }

  /**
   * Fix code blocks where language is attached to first line
   * Finds patterns like ```golangpackage main and fixes them
   */
  _fixCodeBlocks(content) {
    if (!content || !content.includes('```')) return content;
    
    let fixed = content;
    
    // Fix standard triple backtick code blocks with language tag attached to code
    fixed = fixed.replace(/```([a-zA-Z0-9_+#]+)([^\n])/g, (match, language, firstChar) => {
      // Separate language from code with a newline
      return "```" + language + "\n" + firstChar;
    });
    
  // Fix edge case where single letter appears before package in Go code
  // This handles the "o\npackage main" pattern we're seeing
  fixed = fixed.replace(/([a-z])\npackage\s+main/g, language => {
    // Remove single letter and ensure proper package declaration
    return "package main";
  });
  
  // Fix the specific case of gopackage that appears in stored messages 
  fixed = fixed.replace(/go(package\s+main)/g, "go\n$1");
  
  // Fix package immediately followed by import without newline
  fixed = fixed.replace(/(package\s+main)(import)/g, "$1\n$2");
  
  // Fix the specific case where a single letter 'o' appears before package declaration
  fixed = fixed.replace(/^o\s*\n(package\s+main)/m, "$1");
  
  // Fix issues with line breaks in function declarations
  fixed = fixed.replace(/(func\s+\w+\s*\([^)]*\))\s*{/g, "$1 {");
  fixed = fixed.replace(/(func\s+\w+)\s*\(/g, "$1(");
  
  // Fix main function with missing spaces
  fixed = fixed.replace(/func\s+main\(\)\s*{([^\n])/g, "func main() {\n  $1");
    
    // Fix Go code specifically (common pattern in Phi models)
    fixed = fixed.replace(/(```go|```golang)package\s+main/g, "$1\npackage main");
    
    // Fix imported code blocks that may have a vertical bar prefix
    fixed = fixed.replace(/\|```([a-zA-Z0-9_+#]+)([^\n])/g, (match, language, firstChar) => {
      return "|```" + language + "\n" + firstChar;
    });
    
    return fixed;
  }

  detectCodeLanguage(code) {
    if (!code || code.length < 10) {
      return { language: null, confidence: 0 };
    }
    
    // Check if code starts with a language-specific pattern
    const firstLines = code.split('\n').slice(0, 3).join('\n');
    
    // Go detection - higher priority since it's in the example
    if (firstLines.match(/package\s+main/) || 
        firstLines.match(/import\s+\(/) ||
        firstLines.match(/func\s+\w+\(/)) {
      return { language: 'go', confidence: 0.9 };
    }
    
    // Python detection (common in Phi outputs)
    if (firstLines.match(/^(def|class|import|from)\s+/m) ||
        firstLines.match(/^if\s+__name__\s*==\s*('|")__main__('|"):/m) ||
        code.includes('import ') || 
        code.includes('print(') ||
        (code.includes('=') && code.includes('return'))) {
      return { language: 'python', confidence: 0.8 };
    }
    
    // JavaScript detection
    if (firstLines.match(/^(const|let|var|function|import|export)\s+/m) ||
        firstLines.match(/=>\s*\{/m) ||
        firstLines.match(/^class\s+\w+(\s+extends\s+\w+)?\s*\{/m)) {
      return { language: 'javascript', confidence: 0.7 };
    }
    
    return { language: null, confidence: 0 };
  }

  formatCode(code, language) {
    if (!language || !code) {
      return code;
    }
    
    let formattedCode = code;
    
    // Fix excessive newlines
    formattedCode = formattedCode.replace(/\n\s*\n\s*\n/g, '\n\n');
    
    // Fix Phi's tendency to use too many backticks
    formattedCode = formattedCode.replace(/````(`*)/g, '```');
    
    // Language-specific formatting
    if (language === 'go') {
      // Fix imports formatting
      formattedCode = formattedCode.replace(/import\s*\(\s*([^)]+)\)/g, (match, imports) => {
        // Format each import on its own line with proper indentation
        const importLines = imports.trim().split(/\s*[\n,]\s*/).filter(Boolean);
        if (importLines.length <= 1) return match; // No need to format single import
        
        const formattedImports = importLines.map(imp => {
          // Ensure proper quoting if missing
          if (!imp.startsWith('"') && !imp.endsWith('"')) {
            return `\t"${imp.replace(/"/g, '')}"`;
          }
          return `\t${imp}`;
        }).join('\n');
        
        return `import (\n${formattedImports}\n)`;
      });
      
      // Add newline after package declaration if missing
      formattedCode = formattedCode.replace(/(package\s+\w+)([^\n])/g, '$1\n$2');
    }
    
    return formattedCode;
  }

  /**
   * Override the _handleCodeBlock method from BaseModelProcessor
   * to better handle Phi's specific code block formatting issues
   */
  _formatCodeBlock(codeBlock) {
    // First use the base class formatter
    let formattedBlock = super._formatCodeBlock(codeBlock);
    
    // Check if language tag is attached to code without a newline
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
    
    // Apply language-specific formatting
    if (this.codeBlockLanguage) {
      if (this.codeBlockLanguage === 'go' || this.codeBlockLanguage === 'golang') {
        formattedBlock = this._formatGoCode(formattedBlock);
      }
    }
    
    return formattedBlock;
  }
  
  /**
   * Special formatting for Go code - common in Phi outputs
   */
  _formatGoCode(codeBlock) {
    // Fix missing newline after package declaration
    let formatted = codeBlock.replace(/(package\s+\w+)([^\n])/g, '$1\n$2');
    
    // Ensure proper import formatting
    formatted = formatted.replace(/import\s*\(\s*"([^"]+)"\s*"([^"]+)"/g, 
      'import (\n  "$1"\n  "$2"');
    
    return formatted;
  }
}

export default PhiProcessor;
