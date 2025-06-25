/**
 * Utility for processing LLM output tokens to filter thinking sections
 * and handle special formatting
 */

const tokenProcessor = {
  inThinkingSection: false,
  buffer: '',
  
  thinkingStartPatterns: [
    '<think>',
    '<thinking>',
    '<|thinking|>',
    'Alright, ',
    'I need to ',
    'I should ',
    'Let me ',
    'The user asked about ',
    'First, I\'ll',
    'I\'ll start by',
    'I need to answer',
    'I know that',
    'But I need to',
    'But wait',
    'I could',
    'should I add',
    'keeping the answer',
    'I\'m going to',
    'Before responding',
    'To answer this',
    'This question asks'
  ],
  
  thinkingEndPatterns: [
    '</think>',
    '</thinking>',
    '</|thinking|>',
    '<|assistant|>',
    'Answer:',
    'Response:'
  ],
  
  specialTags: [
    '<|assistant|>'
  ],
  
  /**
   * Process an incoming token to filter out thinking content
   * @param {string} token - Raw token from the LLM
   * @returns {string|null} Processed token or null if token should be filtered
   */
  processToken: function(token) {
    if (!token) return null;
    
    this.buffer += token;
    
    if (this.buffer.length > 300) {
      this.buffer = this.buffer.substring(this.buffer.length - 300);
    }
    
    for (const tag of this.specialTags) {
      if (this.buffer.includes(tag)) {
        token = token.replace(tag, '');
        if (!token.trim()) return null;
      }
    }
    
    // Check for closing thinking patterns first (to handle cases where both start and end are in same token)
    for (const pattern of this.thinkingEndPatterns) {
      if (this.buffer.includes(pattern) && this.inThinkingSection) {
        this.inThinkingSection = false;
        
        if (pattern === 'Answer:' || pattern === 'Response:') {
          const answerPos = token.indexOf(pattern);
          if (answerPos !== -1) {
            return token.substring(answerPos + pattern.length);
          }
        }
        
        return null;
      }
    }
    
    // After checking for end patterns, check for start patterns
    for (const pattern of this.thinkingStartPatterns) {
      if (this.buffer.includes(pattern) && !this.inThinkingSection) {
        this.inThinkingSection = true;
        
        if (token.includes(pattern)) {
          return null;
        }
        
        // If pattern is in buffer but not in token, it might be split across tokens
        // Return part of token before the thinking starts if we can identify it
        const bufferSuffix = this.buffer.substring(this.buffer.length - token.length - pattern.length);
        const patternPos = bufferSuffix.indexOf(pattern);
        if (patternPos >= 0 && patternPos < token.length) {
          return token.substring(0, patternPos);
        }
        
        return null; 
      }
    }
    
    if (this.inThinkingSection) {
      return null;
    }
    
    return token;
  },
  
  /**
   * Reset the state for a new message
   */
  reset: function() {
    this.inThinkingSection = false;
    this.buffer = '';
  },
  
  /**
   * Process a complete message to remove thinking sections
   * @param {string} message - Complete message from the LLM
   * @returns {string} Processed message with thinking sections removed
   */
  processCompleteMessage: function(message) {
    if (!message) return '';
    
    this.reset();    
    let bestAnswer = '';    
    let processedMessage = message;
    
    for (const tag of this.specialTags) {
      processedMessage = processedMessage.replace(new RegExp(tag, 'g'), '');
    }
    
    processedMessage = processedMessage.replace(/<think>[\s\S]*?<\/think>/g, '');
    processedMessage = processedMessage.replace(/<thinking>[\s\S]*?<\/thinking>/g, '');
    processedMessage = processedMessage.replace(/<\|thinking\|>[\s\S]*?<\/\|thinking\|>/g, '');
    
    const answerMatch = processedMessage.match(/Answer:([\s\S]*)/);
    const responseMatch = processedMessage.match(/Response:([\s\S]*)/);
    
    if (answerMatch) {
      bestAnswer = answerMatch[1].trim();
    } else if (responseMatch) {
      bestAnswer = responseMatch[1].trim();
    }
    
    if (bestAnswer) {
      return bestAnswer;
    }
    
    const paragraphs = processedMessage.split('\n\n').filter(p => p.trim().length > 0);
    
    // If we have multiple paragraphs, check if earlier ones look like thinking
    if (paragraphs.length > 1) {
      const thinkingIndicators = [
        'I need to', 'I should', 'The user', 'Let me', 'I\'ll', 
        'user is asking', 'need to explain', 'think about',
        'alright,', 'but I need', 'but wait', 'I could', 'should I add',
        'keeping the answer', 'I\'m going to', 'before responding',
        'to answer this', 'this question asks'
      ];
      
      let lastThinkingIndex = -1;
      
      for (let i = 0; i < paragraphs.length; i++) {
        const paragraph = paragraphs[i].toLowerCase();
        if (thinkingIndicators.some(indicator => paragraph.includes(indicator.toLowerCase()))) {
          lastThinkingIndex = i;
        }
      }
      
      if (lastThinkingIndex !== -1 && lastThinkingIndex < paragraphs.length - 1) {
        return paragraphs.slice(lastThinkingIndex + 1).join('\n\n').trim();
      }
    }
    
    const lines = processedMessage.split('\n').filter(l => l.trim().length > 0);
    
    if (lines.length >= 2 && 
        (lines[0].includes('?') || lines[0].toLowerCase().includes('user:') || lines[0].toLowerCase().includes('human:'))) {
      return lines[1].trim();
    }
    
    return processedMessage.trim();
  }
};

module.exports = tokenProcessor;
