/**
 * Teuken response filter and context manager.
 * Inherits token counting and context management from the default filter.
 * TODO: Verify and update if Teuken models require specific filtering or tokenization.
 */
const defaultFilter = require('./defaultFilter');

/**
 * Teuken response sanitizer.
 * @param {string} response - Raw response from the model
 * @param {object} [options] - Additional options
 * @param {string} [options.lastUserMessage] - The last user message for echo detection
 * @returns {string} Cleaned response
 */
function sanitize(response, options = {}) {
  if (!response) return '';
  let cleanedResponse = response;

  // Basic echo removal
  if (options.lastUserMessage) {
    const escapedUserMessage = options.lastUserMessage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const userEchoPattern = new RegExp(`^\\s*${escapedUserMessage}\\s*`, 'i');
    cleanedResponse = cleanedResponse.replace(userEchoPattern, '');
  }

  // TODO: Add Teuken-specific tag removal if necessary

  // Attempt to extract JSON from markdown code blocks or directly
  // This is crucial for internal calls from Python services expecting JSON
  const jsonRegex = /```json\s*([\s\S]*?)\s*```|```\s*([\s\S]*?)\s*```/;
  const jsonMatch = cleanedResponse.match(jsonRegex);
  
  let potentialJsonString = null;

  if (jsonMatch) { // Markdown code block
    potentialJsonString = (jsonMatch[1] || jsonMatch[2] || '').trim();
  } else {
    // No markdown code block, try to find first '{' or '[' and its balanced counterpart
    const firstBraceIdx = cleanedResponse.indexOf('{');
    const firstBracketIdx = cleanedResponse.indexOf('[');
    let startIndex = -1;

    if (firstBraceIdx !== -1 && (firstBracketIdx === -1 || firstBraceIdx < firstBracketIdx)) {
      startIndex = firstBraceIdx;
    } else if (firstBracketIdx !== -1) {
      startIndex = firstBracketIdx;
    }

    if (startIndex !== -1) {
      const openChar = cleanedResponse[startIndex];
      const closeChar = openChar === '{' ? '}' : ']';
      let balance = 0;
      let endIndex = -1;

      for (let i = startIndex; i < cleanedResponse.length; i++) {
        if (cleanedResponse[i] === openChar) {
          balance++;
        } else if (cleanedResponse[i] === closeChar) {
          balance--;
        }
        if (balance === 0 && i >= startIndex) {
          endIndex = i;
          break;
        }
      }

      if (endIndex !== -1) {
        potentialJsonString = cleanedResponse.substring(startIndex, endIndex + 1).trim();
      }
    }
  }

  if (potentialJsonString) {
    // Attempt to strip JS-style comments before parsing
    let parsableJsonString = potentialJsonString;
    // Remove single-line comments (//...)
    parsableJsonString = parsableJsonString.replace(/\/\/[^\n\r]*/g, '');
    // Remove multi-line comments (/*...*/)
    // This regex is a bit simplified and might have issues with nested comments or comments in strings,
    // but should work for most common cases.
    parsableJsonString = parsableJsonString.replace(/\/\*[\s\S]*?\*\//g, '');
    
    // Attempt to remove trailing commas
    // Matches a comma followed by optional whitespace and then a closing brace or bracket
    parsableJsonString = parsableJsonString.replace(/,\s*([\}\]])/g, '$1');
    
    parsableJsonString = parsableJsonString.trim(); // Trim again after all cleaning

    try {
      // Validate the cleaned string as JSON
      JSON.parse(parsableJsonString);
      return parsableJsonString; // Return the clean, parsable JSON string
    } catch (e) {
      // console.warn(`[TeukenFilter] Cleaned string failed JSON.parse: "${parsableJsonString.substring(0,100)}..."`, e.message);
      // If parsing still fails, but we identified a potential JSON block, return that block.
      // This is better than returning the whole original response with prefixes.
      return potentialJsonString; // Return the originally identified JSON-like block
    }
  }

  // General cleanup if NO potential JSON block was identified at all.
  cleanedResponse = cleanedResponse.replace(/\[INST\].*?\[\/INST\]/gs, '');
  cleanedResponse = cleanedResponse.replace(/<<SYS>>.*?<<\/SYS>>/gs, '');
  cleanedResponse = cleanedResponse.replace(/<start_of_turn>.*?<end_of_turn>/gs, '');
  cleanedResponse = cleanedResponse.replace(/<\|.*?\|>/g, ''); // Generic tag removal

  // Remove common start/end tokens
  cleanedResponse = cleanedResponse.replace(/<\/?s>/g, '');
  cleanedResponse = cleanedResponse.replace(/<bos>/g, '');
  cleanedResponse = cleanedResponse.replace(/<eos>/g, '');

  return cleanedResponse.trim();
}

// Delegate all token and context functions to the default filter
module.exports = {
  sanitize,
  countTokens: defaultFilter.countTokens,
  validateContext: defaultFilter.validateContext,
  truncateHistory: defaultFilter.truncateHistory
};
