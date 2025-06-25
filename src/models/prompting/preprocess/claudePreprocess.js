/**
 * Claude Model Preprocessing Instructions
 * 
 * Contains standardized instructions that are added to system prompts
 * to ensure consistent formatting of responses, especially code blocks.
 */

/**
 * Get standardized preprocessing instructions for Claude models
 * @param {string} version - Claude version (e.g., 'claude-3', 'claude-3-opus')
 * @returns {string} Preprocessing instructions
 */
function getInstructions(version = 'claude-3') {
  // Base instructions for all Claude models
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

  // Claude-3 specific instructions (could be extended for future versions)
  if (version.includes('claude-3')) {
    return baseInstructions + `

For mathematical content:
- Use LaTeX formatting for equations
- Place inline math between $ symbols
- Place block equations between $$ symbols

For tables:
- Use standard markdown table format with headers
- Align columns properly with spacing`;
  }

  return baseInstructions;
}

module.exports = {
  getInstructions
};
