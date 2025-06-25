/**
 * MCP Tool: Simple Live Search
 * Lightweight web search enhancement for LLM responses following OpenAI pattern:
 * User Input → Web Search → Vector Store → Top-K → Enhanced LLM Response
 */
const { db } = require('../../models/db');
const apiKeyService = require('../../services/apiKeyService');
const { UserCancelledError } = require('../../utils/errorUtils'); 
const Model = require('../../models/Model'); 
const Chat = require('../../models/Chat');
const { isCancellationRequested, clearCancellationRequest } = require('../../utils/cancellationManager'); 
const UsageStatsService = require('../../services/usageStatsService'); 
const axios = require('axios');

// Simple web search providers
const searchProviders = {
    async duckduckgo(query, maxResults = 5) {
        try {
            // DuckDuckGo Instant Answer API (free, no key required)
            const response = await axios.get('https://api.duckduckgo.com/', {
                params: {
                    q: query,
                    format: 'json',
                    no_html: '1',
                    skip_disambig: '1'
                },
                timeout: 10000
            });

            const results = [];
            const data = response.data;

            // Add instant answer if available
            if (data.Abstract && data.Abstract.trim()) {
                results.push({
                    title: data.Heading || 'DuckDuckGo Summary',
                    snippet: data.Abstract,
                    url: data.AbstractURL || '',
                    source: 'duckduckgo'
                });
            }

            // Add related topics
            if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
                data.RelatedTopics.slice(0, maxResults - results.length).forEach(topic => {
                    if (topic.Text && topic.FirstURL) {
                        results.push({
                            title: topic.Text.split(' - ')[0] || 'Related Topic',
                            snippet: topic.Text,
                            url: topic.FirstURL,
                            source: 'duckduckgo'
                        });
                    }
                });
            }

            return results.slice(0, maxResults);
        } catch (error) {
            console.error('DuckDuckGo search error:', error.message);
            return [];
        }
    },

    async brave(query, apiKey, maxResults = 5) {
        try {
            const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
                headers: {
                    'X-Subscription-Token': apiKey,
                    'Accept': 'application/json'
                },
                params: {
                    q: query,
                    count: maxResults,
                    search_lang: 'en',
                    country: 'US',
                    safesearch: 'moderate'
                },
                timeout: 10000
            });

            const results = [];
            if (response.data.web && response.data.web.results) {
                response.data.web.results.forEach(result => {
                    results.push({
                        title: result.title,
                        snippet: result.description,
                        url: result.url,
                        source: 'brave'
                    });
                });
            }

            return results;
        } catch (error) {
            console.error('Brave search error:', error.message);
            return [];
        }
    },

    async google(query, apiKey, cx, maxResults = 5) {
        try {
            const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
                params: {
                    key: apiKey,
                    cx: cx,
                    q: query,
                    num: maxResults
                },
                timeout: 10000
            });

            const results = [];
            if (response.data.items) {
                response.data.items.forEach(item => {
                    results.push({
                        title: item.title,
                        snippet: item.snippet,
                        url: item.link,
                        source: 'google'
                    });
                });
            }

            return results;
        } catch (error) {
            console.error('Google search error:', error.message);
            return [];
        }
    }
};

// Simple vector similarity using cosine similarity
function cosineSimilarity(vecA, vecB) {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return dotProduct / (magnitudeA * magnitudeB);
}

// Simple text embedding using TF-IDF-like approach
function simpleTextEmbedding(text, vocabulary = null) {
    const words = text.toLowerCase().match(/\b\w+\b/g) || [];
    const wordCounts = {};
    words.forEach(word => {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
    });

    if (!vocabulary) {
        vocabulary = Object.keys(wordCounts);
    }

    const vector = vocabulary.map(word => wordCounts[word] || 0);
    return { vector, vocabulary };
}

async function* runSimpleLiveSearchTool(args, context) {
    const { query: originalUserQuery, max_results = 5 } = args;
    const { userId, chatId } = context;
    const stringChatId = String(chatId);

    clearCancellationRequest(stringChatId);

    try {
        // Update chat title
        try {
            if (originalUserQuery) {
                const truncatedQuery = originalUserQuery.substring(0, 25) + (originalUserQuery.length > 25 ? '...' : '');
                const newChatTitle = `Live Search: ${truncatedQuery}`;
                await Chat.update(chatId, { title: newChatTitle });
            }
        } catch (titleError) {
            console.error(`[Simple Live Search ${chatId}] Failed to auto-update chat title:`, titleError);
        }

        yield { type: 'progress_update', payload: { content: '🔍 Searching the web for current information...' } };

        // Get available search providers and API keys
        const searchResults = [];
        
        // Try Brave Search first (if API key available)
        try {
            const braveKey = await apiKeyService.getBestApiKey(userId, 'Brave Search');
            if (braveKey && braveKey.key) {
                yield { type: 'progress_update', payload: { content: '📡 Querying Brave Search...' } };
                const braveResults = await searchProviders.brave(originalUserQuery, braveKey.key, max_results);
                searchResults.push(...braveResults);
            }
        } catch (error) {
            console.warn(`[Simple Live Search] Brave search failed: ${error.message}`);
        }

        // Try Google Search if Brave didn't provide enough results
        if (searchResults.length < max_results) {
            try {
                const googleKey = await apiKeyService.getBestApiKey(userId, 'Google Search');
                if (googleKey && googleKey.key) {
                    let cx = null;
                    if (googleKey.extra_config) {
                        try {
                            const extra = JSON.parse(googleKey.extra_config);
                            cx = extra.cx;
                        } catch (e) { /* ignore */ }
                    }
                    
                    if (cx) {
                        yield { type: 'progress_update', payload: { content: '🌐 Querying Google Search...' } };
                        const googleResults = await searchProviders.google(originalUserQuery, googleKey.key, cx, max_results - searchResults.length);
                        searchResults.push(...googleResults);
                    }
                }
            } catch (error) {
                console.warn(`[Simple Live Search] Google search failed: ${error.message}`);
            }
        }

        // Fallback to DuckDuckGo (free, no API key required)
        if (searchResults.length < max_results) {
            yield { type: 'progress_update', payload: { content: '🦆 Querying DuckDuckGo...' } };
            const duckResults = await searchProviders.duckduckgo(originalUserQuery, max_results - searchResults.length);
            searchResults.push(...duckResults);
        }

        if (searchResults.length === 0) {
            yield { type: 'progress_update', payload: { content: '⚠️ No search results found. Proceeding without web context.' } };
            yield { type: 'final_data', payload: { 
                full_content: `I couldn't find current web information for "${originalUserQuery}". Please try rephrasing your query or check if search providers are configured.`,
                sources: []
            }};
            return;
        }

        yield { type: 'progress_update', payload: { content: `✅ Found ${searchResults.length} relevant results. Processing...` } };

        // Simple relevance ranking using text similarity
        const queryEmbedding = simpleTextEmbedding(originalUserQuery);
        const rankedResults = searchResults.map(result => {
            const resultText = `${result.title} ${result.snippet}`;
            const resultEmbedding = simpleTextEmbedding(resultText, queryEmbedding.vocabulary);
            const similarity = cosineSimilarity(queryEmbedding.vector, resultEmbedding.vector);
            return { ...result, relevanceScore: similarity };
        }).sort((a, b) => b.relevanceScore - a.relevanceScore);

        // Take top-k most relevant results
        const topResults = rankedResults.slice(0, Math.min(max_results, 3));

        yield { type: 'progress_update', payload: { content: '🧠 Synthesizing web information...' } };

        // Create enhanced context for LLM
        let webContext = "**Current Web Information:**\n\n";
        const sources = [];

        topResults.forEach((result, index) => {
            webContext += `**${index + 1}. ${result.title}**\n`;
            webContext += `${result.snippet}\n`;
            if (result.url) {
                webContext += `Source: ${result.url}\n`;
            }
            webContext += `\n`;

            sources.push({
                title: result.title,
                url: result.url,
                snippet: result.snippet,
                source: result.source,
                relevanceScore: result.relevanceScore
            });
        });

        // Create the enhanced response
        const enhancedResponse = `${webContext}\n**Answer based on current information:**\n\nBased on the latest web search results, here's what I found about "${originalUserQuery}":\n\n${topResults.map(r => `• ${r.snippet}`).join('\n')}\n\nThis information is current as of ${new Date().toLocaleDateString()} and sourced from ${[...new Set(topResults.map(r => r.source))].join(', ')}.`;

        // Record usage stats
        try {
            await UsageStatsService.recordTokens({
                userId: userId,
                chatId: chatId,
                modelId: null, // No specific model used for search
                promptTokens: originalUserQuery.length / 4, // Rough estimate
                completionTokens: enhancedResponse.length / 4, // Rough estimate
                totalTokens: (originalUserQuery.length + enhancedResponse.length) / 4,
                source: 'simple_live_search_tool'
            });
        } catch (tokenLogError) {
            console.error(`[Simple Live Search] Failed to log usage stats:`, tokenLogError);
        }

        yield { type: 'final_data', payload: { 
            full_content: enhancedResponse,
            sources: sources
        }};

    } catch (error) {
        console.error(`[Simple Live Search ${chatId}] Error in tool execution:`, error);
        yield { type: 'progress_update', payload: { content: `❌ Error: ${error.message}` } };
        throw error;
    } finally {
        clearCancellationRequest(stringChatId);
    }
}

module.exports = {
    run: runSimpleLiveSearchTool,
    schema: {
        name: "simple-live-search",
        description: "Lightweight web search enhancement for LLM responses. Quickly searches the web and provides relevant, current information to enhance answers.",
        input_schema: {
            type: "object",
            properties: {
                query: { 
                    type: "string", 
                    description: "The search query to find current web information about." 
                },
                max_results: {
                    type: "integer",
                    description: "Maximum number of search results to process.",
                    default: 5,
                    minimum: 1,
                    maximum: 10
                }
            },
            required: ["query"]
        },
        output_schema: {
            type: "object",
            properties: {
                full_content: { 
                    type: "string", 
                    description: "Enhanced response with current web information." 
                },
                sources: { 
                    type: "array", 
                    items: { type: "object" }, 
                    description: "Array of web sources used." 
                }
            },
            required: ["full_content"]
        }
    }
};
