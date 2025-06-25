/**
 * Anti-hallucination prompt templates and utilities for local models
 * 
 * This module provides prompt prefixes and instructions to reduce hallucinations
 * and confabulation in local LLMs.
 */

// Base anti-hallucination system prompt for all models
const BASE_SYSTEM_PROMPT = `You are a helpful, harmless, and honest AI assistant. If you don't know the answer to a question, just say that you don't know. DO NOT try to make up an answer. If the question is nonsensical, or factually unclear, explain why instead of answering something that might not be what the user wants to know. Be brief and concise.`;

// Anti-hallucination prompt extensions for different model families
const MODEL_SPECIFIC_EXTENSIONS = {
  'deepseek': `If I ask about a person you don't definitely know exists, or events, places, or facts you're not sure about, respond with "I don't have specific information about [topic]" rather than potentially making up information. Never invent facts, research, or people that you're not 100% sure exist. If asked about non-existent people like Dr. Zoi Kouadis, admit you don't have information rather than making up details.`,
  
  'mistral': `When asked about specific people, entities, or events, only provide information that you're confident is factual. If you don't have information about something specific like "Dr. Mirko Keampf" or similar entities, simply state that you don't have information about them rather than creating fictional details. Never pretend to know specifics about real people, places, or events that you're uncertain about.`,
  
  'phi': `Always be clear about the limitations of your knowledge. If you are asked to provide information about people, events, or topics that you haven't been specifically trained on, acknowledge this limitation. Never fabricate academic papers, research findings, or credentials for individuals. If someone asks about a person like "Dr. Zoi Kouadis" and you're not certain they exist, simply state that you don't have information about them.`,
  
  'llama': `You will answer questions factually and will refuse to fabricate or hallucinate information. When asked about a specific person, organization, or event that you don't have clear information about, always respond with "I don't have specific information about this" rather than generating details that might be incorrect. For example, if asked about "Dr. Mirko Keampf" and you don't have verified information, simply state that you don't have information about this person.`,
  
  'default': `When you don't know something, simply admit you don't know rather than making up information. If asked about specific people, organizations, or facts that you're not confident about, always clarify that you don't have that information instead of potentially providing fabricated details.`
};

// Event cues that might trigger hallucination
const HALLUCINATION_TRIGGERS = [
  "Who is Dr.",
  "Tell me about Dr.",
  "What do you know about Professor",
  "What is the research of",
  "What are the findings of",
  "What did Dr.",
  "Tell me about the work of",
  "according to the research of",
  "as shown in the study by",
  "as demonstrated by the experiments of"
];

/**
 * Generate an anti-hallucination system prompt for a specific model
 * 
 * @param {string} modelPath - Path to the model file (used to detect model family)
 * @returns {string} - Appropriate system prompt to reduce hallucinations
 */
function generateAntiHallucinationPrompt(modelPath) {
  const modelName = modelPath ? require('path').basename(modelPath).toLowerCase() : '';
  
  // Find the appropriate model family
  let modelFamily = 'default';
  Object.keys(MODEL_SPECIFIC_EXTENSIONS).forEach(family => {
    if (modelName.includes(family)) {
      modelFamily = family;
    }
  });
  
  // Combine base prompt with model-specific extensions
  return `${BASE_SYSTEM_PROMPT}\n\n${MODEL_SPECIFIC_EXTENSIONS[modelFamily]}`;
}

/**
 * Check if a user query might trigger hallucination
 * 
 * @param {string} query - The user's query
 * @returns {boolean} - Whether this query might trigger hallucination
 */
function mightTriggerHallucination(query) {
  if (!query) return false;
  
  // Convert to lowercase for case-insensitive matching
  const lowercaseQuery = query.toLowerCase();
  
  return HALLUCINATION_TRIGGERS.some(trigger => 
    lowercaseQuery.includes(trigger.toLowerCase())
  );
}

/**
 * Apply anti-hallucination protection to a user query if needed
 * 
 * @param {string} query - The user's original query
 * @returns {string} - Potentially modified query with anti-hallucination guards
 */
function applyAntiHallucinationGuard(query) {
  if (!mightTriggerHallucination(query)) {
    return query; // No modifications needed
  }
  
  // Add a warning to the query to help the model avoid hallucinating
  return `${query}\n\nIMPORTANT: If you don't have specific information about this person, organization, or topic, please just say so rather than potentially making up information. Only provide information you're confident is accurate.`;
}

module.exports = {
  generateAntiHallucinationPrompt,
  mightTriggerHallucination,
  applyAntiHallucinationGuard,
  BASE_SYSTEM_PROMPT
};

// Command line testing
if (require.main === module) {
  const modelPath = process.argv[2];
  const query = process.argv[3];
  
  if (!modelPath || !query) {
    console.error('Usage: node anti_hallucination_prompt.js <model_path> "<query>"');
    process.exit(1);
  }
  
  console.log('\nAnti-hallucination system prompt:');
  console.log('------------------------------------');
  console.log(generateAntiHallucinationPrompt(modelPath));
  console.log('------------------------------------\n');
  
  const mightHallucinate = mightTriggerHallucination(query);
  console.log(`Query might trigger hallucination: ${mightHallucinate}`);
  
  if (mightHallucinate) {
    console.log('\nModified query:');
    console.log('------------------------------------');
    console.log(applyAntiHallucinationGuard(query));
    console.log('------------------------------------');
  }
}
