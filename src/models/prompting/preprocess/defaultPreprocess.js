/**
 * Default Model Preprocessing Instructions
 * 
 * Contains standardized instructions that are added to system prompts
 * for any model types not explicitly covered by specialized processors.
 */

/**
 * Get standardized preprocessing instructions for default models
 * @returns {string} Preprocessing instructions
 */
function getInstructions() {
  return `
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

For all programming languages:
- Use consistent indentation
- Add appropriate line breaks
- Include comments when needed for clarity

For standard Markdown formatting:
- Headers: Use standard hash syntax (e.g., "## Header Title"). Always place a space between the hashes and the header text. Ensure headers start on a new line.
- Lists: Always place a space after the list marker (e.g., "1. Item", "- Item"). Ensure there is a blank line before a list begins, especially after a header. Use consistent indentation for nested lists.
- Tables: Use GitHub Flavored Markdown (GFM) table syntax. Ensure a valid separator line with at least three dashes per column (e.g., |---|---|). Example:
  | Header 1 | Header 2 |
  |----------|----------|
  | Cell 1   | Cell 2   |
`;
}

module.exports = {
  getInstructions
};
