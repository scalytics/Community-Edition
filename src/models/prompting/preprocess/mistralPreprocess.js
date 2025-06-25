/**
 * Mistral Model Preprocessing Instructions
 * 
 * Contains standardized instructions that are added to system prompts
 * to ensure consistent formatting of responses, especially code blocks
 * and foreign language content.
 */

/**
 * Get standardized preprocessing instructions for Mistral models
 * @param {boolean} isMixtral - Whether the model is a Mixtral variant
 * @returns {string} Preprocessing instructions
 */
function getInstructions(isMixtral = false) {
  // Base instructions for all Mistral models
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

For Python code indentation:
- Always use 4 spaces for indentation
- Ensure proper indentation after if/for/while/def statements
- Don't forget the newline after each code block declaration

For standard Markdown formatting:
- Headers: Use standard hash syntax (e.g., "## Header Title"). Always place a space between the hashes and the header text. Ensure headers start on a new line.
- Lists: Always place a space after the list marker (e.g., "1. Item", "- Item"). Ensure there is a blank line before a list begins, especially after a header. Use consistent indentation for nested lists.
- Tables: Use GitHub Flavored Markdown (GFM) table syntax. Ensure a valid separator line with at least three dashes per column (e.g., |---|---|). Example:
  | Header 1 | Header 2 |
  |----------|----------|
  | Cell 1   | Cell 2   |

For content in German or other languages:
- Format headings like "Anleitung:", "Aufgabe:", etc. with proper spacing and ensure they follow standard Markdown header rules if applicable.
- Make sure to add a blank line after headings before subsequent content like lists or paragraphs.
- When using numbered lists in German, ensure there's a space after the number
- Format all section headings consistently`;

  // Add specific instructions for Mixtral models if needed
  if (isMixtral) {
    return baseInstructions + `

For complex mathematical content:
- Use proper formatting for equations
- Place inline math inside single $ symbols
- Place block equations inside double $$ symbols`;
  }

  return baseInstructions;
}

module.exports = {
  getInstructions
};
