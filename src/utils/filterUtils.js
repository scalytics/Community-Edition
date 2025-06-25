/**
 * Filters potential Personally Identifiable Information (PII) from a given text.
 * Currently targets email addresses and common phone number patterns.
 * This is a best-effort approach and may not catch all variations or formats.
 *
 * @param {string} text - The input text to filter.
 * @returns {string} - The text with identified PII patterns replaced by placeholders.
 */
function filterPii(text) {
  if (!text) {
    return '';
  }

  let filteredText = text;

  // Basic email regex (covers common formats)
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  filteredText = filteredText.replace(emailRegex, '[EMAIL_REDACTED]');

  // Basic phone number regex (covers various formats with spaces, dashes, parentheses)
  // This is intentionally broad and might catch non-phone numbers. Refine if needed.
  const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g;
  filteredText = filteredText.replace(phoneRegex, '[PHONE_REDACTED]');

  // Add more regex patterns here for other PII types if needed in the future

  return filteredText;
}

/**
 * Aggregates search results into a single text block for AI processing,
 * applying PII filtering to snippets.
 *
 * @param {Array<Array<{title: string, snippet: string, link: string}>>} resultsArrays - An array containing arrays of search results from different sources.
 * @returns {string} - A single string containing filtered titles and snippets.
 */
function aggregateAndFilterResults(resultsArrays) {
    let combinedText = '';
    resultsArrays.forEach(results => {
        if (results && Array.isArray(results)) {
            results.forEach(result => {
                if (result) {
                    combinedText += `Title: ${result.title || 'N/A'}\n`;
                    // Filter PII only from the snippet, as titles/links are less likely to contain sensitive info
                    // and filtering them might break context.
                    combinedText += `Snippet: ${filterPii(result.snippet || 'N/A')}\n`;
                    combinedText += `Link: ${result.link || 'N/A'}\n\n`;
                }
            });
        }
    });
    return combinedText.trim();
}


module.exports = { filterPii, aggregateAndFilterResults };
