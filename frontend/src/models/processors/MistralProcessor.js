import BaseModelProcessor from './BaseModelProcessor';

class MistralProcessor extends BaseModelProcessor {
  constructor() {
    super();
    this.name = 'mistral';
    this.patterns = [
      /<\|end_of_text\|>/g,
      /<\|end_of_turn\|>/g,
      /<\|im_start\|>(user|assistant|system)/gi,
      /<\|im_end\|>/g,
      /\[INST\]\s*\[\/INST\]/g, // Empty instruction blocks
      /<s>|<\/s>/g, // BOS/EOS tokens
    ];
    
    // German words commonly used in instruction headers
    this.germanHeaders = [
      'Anleitung',
      'Aufgabe',
      'Beispiel',
      'Beschreibung',
      'Materialien',
      'Übung',
      'Übungsaufgabe',
      'Programmieraufgabe',
      'Hinweise',
      'Lösung'
    ];
  }

  detectModelFamily(content) {
    if (!content) return null;
    
    if (content.includes('<|end_of_text|>') || content.includes('<|im_end|>')) {
      return 'mistral';
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
    
    // Fix Mistral's hash-based headers
    processed = processed.replace(/^(#{2,6})(\d+\.\s+)(.+)$/gm, (match, hashes, number, title) => {
      const level = Math.min(hashes.length, 6);
      return `${'#'.repeat(level)} ${number}${title}`;
    });
    
    // Fix German instruction headers (commonly used in Mistral outputs)
    this.germanHeaders.forEach(header => {
      const pattern = new RegExp(`\\*\\*${header}:\\*\\*\\s*`, 'gi');
      processed = processed.replace(pattern, `**${header}:**\n\n`);
      
      const pattern2 = new RegExp(`^${header}:\\s*$`, 'gim');
      processed = processed.replace(pattern2, `**${header}:**\n\n`);
    });
    
    // Fix common section headers followed by code
    processed = this._fixSectionHeadersWithCode(processed);
    
    // Fix code blocks with language attached to code
    processed = this._fixCodeBlocks(processed);
    
    return processed;
  }
  
  /**
   * Fix section headers like "Script:" that are immediately followed by code blocks
   * This is a common pattern in stored Mistral outputs
   */
  _fixSectionHeadersWithCode(content) {
    if (!content) return content;
    
    // Section headers that are commonly followed by code
    const sectionHeaders = ['Script:', 'Skript:', 'Code:', 'Example:', 'Beispiel:'];
    
    let fixed = content;
    
    // Check for headers that are immediately followed by code without appropriate spacing
    for (const header of sectionHeaders) {
      // Create pattern for headers followed by code blocks
      const headerPattern = new RegExp(header + "\\s*(```[a-z]*)", "g");
      fixed = fixed.replace(headerPattern, header + "\n\n$1");
      
      // Create pattern for headers followed by content without code blocks
      const contentPattern = new RegExp(header + "([^\\s\\n`].*)", "g");
      fixed = fixed.replace(contentPattern, header + "\n\n```\n$1");
    }
    
    return fixed;
  }

  /**
   * Fix code blocks where language tag is attached to first line
   */
  _fixCodeBlocks(content) {
    if (!content || !content.includes('```')) return content;
    
    // Find code blocks and fix them
    return content.replace(/```([a-zA-Z0-9_+#]+)([^\n])/g, (match, language, firstChar) => {
      // Separate language from code with a newline
      return "```" + language + "\n" + firstChar;
    });
  }

  detectCodeLanguage(code) {
    if (!code || code.length < 10) {
      return { language: null, confidence: 0 };
    }
    
    const firstLines = code.split('\n').slice(0, 3).join('\n');
    
    // Python detection (common in Mistral outputs)
    if (firstLines.match(/^(def|class|import|from)\s+/m) ||
        firstLines.match(/^if\s+__name__\s*==\s*('|")__main__('|"):/m) ||
        firstLines.match(/^#.*?Python/im) ||
        code.match(/random\.(randint|choice|random)/m) ||
        code.match(/^\s*for\s+\w+\s+in\s+/m) ||
        code.match(/=\s*input\(/m) ||
        code.includes('print(f"') || 
        (code.includes('=') && (code.includes('return') || code.includes('assert')))) {
      return { language: 'python', confidence: 0.9 };
    }
    
    return { language: null, confidence: 0 };
  }

  /**
   * Override the _formatCodeBlock method from BaseModelProcessor
   * to better handle Mistral-specific code block formatting issues
   */
  _formatCodeBlock(codeBlock) {
    // First use the base class formatter
    let formattedBlock = super._formatCodeBlock(codeBlock);
    
    // Additional Mistral-specific formatting
    if (this.codeBlockLanguage === 'python') {
      formattedBlock = this._formatPythonCode(formattedBlock);
    } else if (this.codeBlockLanguage === 'bash' || this.codeBlockLanguage === 'sh') {
      formattedBlock = this._formatBashCode(formattedBlock);
    }
    
    return formattedBlock;
  }
  
  /**
   * Special formatting for Bash code in Mistral responses
   */
  _formatBashCode(code) {
    let formatted = code;
    
    // Fix missing newlines in bash commands
    formatted = formatted.replace(/^(#[^\n]+)([^#\n])/gm, '$1\n$2');
    
    // Fix function blocks in shell scripts (commonly missing newlines)
    formatted = formatted.replace(/\(\)\s*{([^\n])/g, '() {\n$1');
    
    // Fix broken if statements
    formatted = formatted.replace(/(if\s+\[\s+.*\s+\];\s*then)([^\n;])/g, '$1\n$2');
    formatted = formatted.replace(/(if\s+\[\s+.*\s+\])\s*then([^\n;])/g, '$1 then\n$2');
    
    // Fix broken for loops
    formatted = formatted.replace(/(for\s+.*\s+do)([^\n;])/g, '$1\n$2');
    
    // Fix missing indentation in for loops
    formatted = formatted.replace(/(for\s+.*\n)([^\s])/g, '$1  $2');
    
    // Fix missing fi/done/etc closures with proper indentation
    formatted = formatted.replace(/(fi|done)([^\n;])/g, '$1\n$2');
    
    // Fix function declarations
    formatted = formatted.replace(/(function\s+\w+)\s*\(\)\s*{([^\n])/g, '$1() {\n  $2');
    
    // Fix smooth_temperature style function syntax that's common in Mistral outputs
    formatted = formatted.replace(/(\w+_\w+)\(\)\s*{([^\n])/g, '$1() {\n  $2');
    
    // Fix variable assignments followed directly by command
    formatted = formatted.replace(/^([A-Z_][A-Z0-9_]*=\S+)([^\n=])/gm, '$1\n$2');
    
    return formatted;
  }

  formatCode(code, language) {
    if (!language || !code) {
      return code;
    }
    
    let formattedCode = code;
    
    // Python formatting
    if (language === 'python') {
      formattedCode = this._formatPythonCode(formattedCode);
    }
    
    return formattedCode;
  }

  /**
   * Special formatting for Python code from Mistral
   */
  _formatPythonCode(code) {
    let formatted = code;
    
    // Fix Mistral's hash-based headers that look like Python comments
    formatted = formatted.replace(/^####\d+\.\s+(.+)$/gm, '# $1');

    // Fix missing space after # in comments
    formatted = formatted.replace(/(```python)#/g, '$1\n#');
    formatted = formatted.replace(/^#([a-zA-Z0-9])/gm, '# $1');
    
    // Fix broken indentation in control structures
    const lines = formatted.split('\n');
    const fixedLines = [];
    let prevIndent = 0;
    let insideControlBlock = false;
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      
      // Handle if/for/def statements that need indentation in the next line
      if (line.match(/^\s*(if|for|def|while|with|class)\s+.*:$/) && 
          i < lines.length - 1 && !lines[i+1].match(/^\s+/)) {
        insideControlBlock = true;
        fixedLines.push(line);
        prevIndent = line.match(/^\s*/)[0].length;
        continue;
      }
      
      // Apply indentation to body of control structures
      if (insideControlBlock && line.trim() && !line.match(/^\s+/)) {
        line = ' '.repeat(prevIndent + 4) + line;
        insideControlBlock = false;
      }
      
      fixedLines.push(line);
    }
    
    formatted = fixedLines.join('\n');
    
    // Fix common Python syntax issues
    // Fix missing indentation after function definition
    formatted = formatted.replace(/^(def\s+\w+\([^)]*\):)\s*\n([^\s#])/gm, 
      function(match, funcDef, bodyLine) {
        return `${funcDef}\n    ${bodyLine}`;
      });
    
    // Fix broken for loops
    formatted = formatted.replace(/(for\s+\w+\s+in\s+.*:)\s*\n([^\s#])/gm,
      function(match, forLine, bodyLine) {
        return `${forLine}\n    ${bodyLine}`;
      });
      
    // Fix broken if statements
    formatted = formatted.replace(/(if\s+.*:)\s*\n([^\s#])/gm,
      function(match, ifLine, bodyLine) {
        return `${ifLine}\n    ${bodyLine}`;
      });
    
    return formatted;
  }
}

export default MistralProcessor;
