/**
 * Gemini Model Preprocessing Instructions
 * 
 * Contains standardized instructions that are added to system prompts
 * to ensure consistent formatting of responses, especially code blocks.
 */

/**
 * Get standardized preprocessing instructions for Gemini models
 * @param {boolean} isMultimodal - Whether the model accepts multimodal input
 * @returns {string} Preprocessing instructions
 */
function getInstructions(isMultimodal = true) {
  // Base instructions for all Gemini models
  const baseInstructions = `
When showing code examples, always format them properly with the following precise structure:
1. On the first line, write the language name with triple backticks: \`\`\`python (or \`\`\`javascript, \`\`\`go, etc.)
2. Then add a newline
3. Write your code with proper indentation
4. End with triple backticks on their own line

For example:

\`\`\`python
def hello_world():
    print("Hello, world!")
\`\`\`

NOT like this (no spacing between language and code):

\`\`\`pythonprint("Hello, world!")\`\`\`

For Go code, always place the package declaration on its own line:

\`\`\`go
package main

import (
    "fmt"
)
\`\`\`

Format all programming languages with consistent indentation and appropriate line breaks.`;

  // Additional instructions for multimodal Gemini models
  if (isMultimodal) {
    return baseInstructions + `

For image descriptions:
- Clearly separate observations from interpretations
- Structure image analysis in logical sections
- When referring to specific parts of an image, be precise about location`;
  }

  return baseInstructions;
}

module.exports = {
  getInstructions
};
