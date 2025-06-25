# Scalytics API Developer Guide

This guide explains how developers can use the Scalytics API to interact programmatically with local models hosted on this Scalytics Connect instance.

## Overview

The Scalytics API provides a `POST /v1/chat/completions` endpoint that mirrors the OpenAI Chat Completions API. This allows you to use existing OpenAI client libraries or standard HTTP requests to:

*   Send chat messages (including conversation history).
*   Specify a local model available on this instance.
*   Receive responses, either as a complete message or a stream of tokens.

**Key Restriction:** This API endpoint **only** works with models designated as "local" by the administrator (i.e., models running directly on the Scalytics Connect server infrastructure). Requests for external models (like those from OpenAI, Anthropic, etc.) will be rejected.

The Scalytics API allows you to interact with the local AI models hosted on this Scalytics Connect instance using external tools, scripts, or development environments that support the OpenAI API format.

You can use the Scalytics API to:

*   Integrate local model access into your own applications or scripts.
*   Use development tools (like code editors with AI plugins) that expect an OpenAI-compatible endpoint, but direct them to use the secure, local models provided here.
*   Experiment with programmatic access to the available local models.

**Important:** The Scalytics API only works with **local models** managed by this instance. It cannot be used to access external services like OpenAI or Anthropic.

## API Key Management

To use the Scalytics API, you first need to generate a personal API key:

1.  Go to your **Settings** page within Scalytics Connect.
2.  Navigate to the **API Keys** section.
3.  Look for the **"Generate Scalytics API Key"** area.
4.  Enter a **Key Name** that helps you remember what you'll use this key for (e.g., "My Laptop Dev Key", "Data Analysis Script").
5.  Click the **"Generate Key"** button.
6.  **Crucial Step:** A new API key (starting with `sk-scalytics-`) will be displayed **only once**. Copy this key immediately and save it somewhere safe, like a password manager. **You will not be able to see this key again.**
7.  Your new key (identified by its name) will appear in your list of personal API keys.

When configuring your external tool or script:

1.  **Endpoint URL:** Set the API endpoint URL to `https://[Your Scalytics Connect URL]/v1/chat/completions`. Replace `[Your Scalytics Connect URL]` with the actual address of this instance.
2.  **API Key:** Provide your generated Scalytics API key (the one starting with `sk-scalytics-`) as the API key or Bearer token. Many tools have a specific field for the API key. If configuring manually, it should be sent in the `Authorization` header like this:
    ```
    Authorization: Bearer YOUR_SCALYTICS_API_KEY
    ```
3.  **Model Name:** You **do not** need to specify a model name in your request. The API automatically uses the single local model configured by the administrator for this service.

As an administrator, you can:

1. View all user API keys across the system
2. Deactivate individual user keys if necessary
3. Delete user keys in case of compromise
4. Override user keys with global keys when needed

## Concurrency and Model Selection

The Scalytics API is designed to handle multiple simultaneous requests efficiently. It achieves this by using a background worker system.

*   **Concurrency:** Incoming API requests are distributed across available worker processes. This allows the system to process several requests in parallel, improving responsiveness under load. The maximum level of concurrency generally depends on the number of available processing units (like GPUs) configured for the active model.
*   **Model Selection:** A crucial point to understand is that the `/v1/chat/completions` endpoint **always** routes requests to the **single local model** that is currently marked as **"Active"** in the Admin Dashboard (under Models -> Local Models). It does not support selecting different local models via the API request itself (e.g., through the `model` parameter in the request body). Ensure the desired model for API access is the one set to active.

## Configuration

Administrators control the global status and rate limiting of the Scalytics API via the Admin Dashboard.

1.  **Navigate to Admin Dashboard:** Access the main administrative area.
2.  **Select "Scalytics API" Tab:** Find and click on the "Scalytics API" tab in the admin navigation.
3.  **Enable/Disable API:**
    *   Use the **"Enable Scalytics API Access"** toggle switch.
    *   **Enabled (Default: Disabled):** The `/v1/chat/completions` endpoint is active and will process valid requests.
    *   **Disabled:** The endpoint will return a `503 Service Unavailable` error, effectively disabling the feature globally.
4.  **Configure Rate Limiting:**
    *   **Time Window (Minutes):** Set the duration (in minutes) over which the **total** request limit for the `/v1/chat/completions` endpoint is applied.
    *   **Max Requests per Window:** Set the maximum **total** number of requests allowed across *all users* for the endpoint within the defined time window. Setting this to `0` might disable rate limiting, but it's recommended to keep a reasonable limit to prevent abuse.
    *   This global limit helps protect the overall server resources from being overwhelmed by API usage.
5.  **Save Settings:** Click the "Save Settings" button to apply any changes to the toggle or rate limits.

## Endpoint: Chat Completions

*   **URL:** `/v1/chat/completions` (relative to the Scalytics Connect instance base URL)
*   **Method:** `POST`
*   **Headers:**
    *   `Content-Type: application/json`
    *   `Authorization: Bearer YOUR_SCALYTICS_API_KEY`
*   **Body (JSON):** Follows the OpenAI Chat Completions request schema.

### Request Body Parameters

*   `messages` (array, required): An array of message objects representing the conversation history. Each object must have:
    *   `role` (string): `user`, `assistant`, or `system`.
    *   `content` (string): The message content.
*   `model` (string, **Deprecated**): This parameter is **no longer used** by the Scalytics API. The endpoint automatically uses the single active local model configured by the administrator. Sending this parameter will have no effect.
*   `stream` (boolean, optional, default: `false`): If `true`, the response will be streamed using Server-Sent Events (SSE). If `false`, the full response will be returned once generation is complete.
*   *Other Optional Parameters:* Depending on the underlying `chatService` capabilities, standard OpenAI parameters like `temperature`, `max_tokens`, etc., might be supported. Check with your administrator or test compatibility.

### Example Request (Non-Streaming)

```bash
# Replace YOUR_INSTANCE_URL and YOUR_API_KEY
curl https://YOUR_INSTANCE_URL/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -A "MyTestClient/1.0" \
  -d '{
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Explain the concept of API rate limiting."}
    ],
    "stream": false
  }'
```

### Example Request (Streaming)

```bash
# Replace YOUR_INSTANCE_URL and YOUR_API_KEY
# Use -N to disable buffering and see stream chunks immediately
curl -N https://YOUR_INSTANCE_URL/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: text/event-stream" \
  -A "MyTestClient/1.0" \
  -d '{
    "messages": [
      {"role": "user", "content": "Write a short poem about servers."}
    ],
    "stream": true
  }'
```

### Response Format

*   **Non-Streaming (`stream: false`):** A JSON object matching the standard OpenAI Chat Completion object structure, including `id`, `object`, `created`, `model`, `choices` (with `message` object), and `usage`.
*   **Streaming (`stream: true`):** A stream of Server-Sent Events (SSE). Each event will be `data: {...}` followed by two newlines (`\n\n`). The JSON payload (`{...}`) matches the OpenAI Chat Completion Chunk object structure. The stream ends with `data: [DONE]\n\n`.

## Endpoint: Live Search

Initiates a Live Search task and streams results and progress updates via Server-Sent Events (SSE). This allows for complex, multi-step research on a given query, leveraging web searches, content scraping, vector analysis, and LLM-based reasoning and synthesis.

*   **URL:** `/v1/deepsearch` (relative to the Scalytics Connect instance base URL)
*   **Method:** `POST`
*   **Headers:**
    *   `Content-Type: application/json`
    *   `Authorization: Bearer YOUR_SCALYTICS_API_KEY`
    *   `Accept: text/event-stream` (Important for SSE)
*   **Body (JSON):** `DeepSearchApiRequest` schema.

### Request Body Parameters

Use the `GET /v1/models` endpoint to discover available models. The `name` field from the response should be used for the `reasoningModelName` and `synthesisModelName` parameters below.

*   `query` (string, required): The user's initial search query or topic for the deep research.
*   `reasoningModelName` (string, required): The string `name` of the LLM for planning and intermediate reasoning (e.g., "llama3-8b-8192"). This model must be accessible to the user.
*   `synthesisModelName` (string, required): The string `name` of the LLM for final report synthesis (e.g., "gpt-4o"). This model must be accessible to the user.
*   `search_providers` (array of strings, optional): A list of search providers to use (e.g., `"google"`, `"bing"`, `"brave"`, `"openalex"`, `"wikipedia"`, `"duckduckgo"`). If not provided or empty, a default set (typically DuckDuckGo, OpenAlex, Wikipedia) will be used by the backend.
*   `max_distinct_search_queries` (integer, optional, default: 7): Maximum number of distinct search engine queries the research process will execute.
*   `max_results_per_provider_query` (integer, optional, default: 5): Maximum search results to fetch per search provider for each distinct query.
*   `max_url_exploration_depth` (integer, optional): How many levels deep the research process should explore links found in content (0 for no link exploration beyond initial search results). Defaults are handled by the Python service configuration.
*   `max_hops` (integer, optional): Maximum number of research hops/iterations. Defaults are handled by the Python service configuration.
*   `chunk_size_words` (integer, optional): Target chunk size in words for content processing. Defaults are handled by the Python service configuration.
*   `chunk_overlap_words` (integer, optional): Target word overlap between chunks. Defaults are handled by the Python service configuration.
*   `top_k_retrieval_per_hop` (integer, optional): Number of top-K chunks to retrieve from the vector store for analysis in each hop. Defaults are handled by the Python service configuration.

### Example Request (Streaming SSE)

```bash
# Replace YOUR_INSTANCE_URL and YOUR_API_KEY
# Use -N to disable buffering and see stream chunks immediately
curl -N https://YOUR_INSTANCE_URL/v1/deepsearch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: text/event-stream" \
  -A "MyDeepSearchClient/1.0" \
  -d '{
    "query": "Impact of quantum computing on cryptography",
    "reasoningModelName": "gemini-1.5-flash-latest",
    "synthesisModelName": "gemini-1.5-pro-latest",
    "search_providers": ["openalex", "duckduckgo"],
    "max_distinct_search_queries": 5,
    "max_results_per_provider_query": 3,
    "max_url_exploration_depth": 1,
    "max_hops": 2,
    "top_k_retrieval_per_hop": 10
  }'
```

### Response Format (Server-Sent Events)

The response is a stream of Server-Sent Events (`text/event-stream`). Each event has an `event` type and a `data` payload (JSON string).

Common event types include:

*   **`event: progress`**
    *   `data`: JSON object (`SSEProgressData`) indicating the current stage and a message.
        *   `stage` (string): e.g., "initialization", "planning", "web_search", "scraping", "vector_indexing", "synthesis", "iteration_step", "coverage_update", "completion_check".
        *   `message` (string): User-friendly progress message.
        *   `details` (object, optional): Additional context (e.g., current query, URL being processed).
    *   Example: `event: progress\ndata: {"stage":"web_search","message":"Searching: 'quantum cryptography vulnerabilities'","details":{"query":"quantum cryptography vulnerabilities"}}\n\n`

*   **`event: markdown_chunk`**
    *   `data`: JSON object (`SSEMarkdownChunkData`) containing a piece of the final report.
        *   `chunk_id` (integer): Sequential ID for the chunk.
        *   `content` (string): The markdown content chunk.
        *   `is_final_chunk` (boolean): Indicates if this is the last markdown chunk for the report.
    *   Example: `event: markdown_chunk\ndata: {"chunk_id":0,"content":"## Quantum Computing and Cryptography\\n\\nQuantum computing poses a significant...","is_final_chunk":false}\n\n`

*   **`event: complete`**
    *   `data`: JSON object (`SSECompleteData`) signaling successful completion.
        *   `message` (string): e.g., "Research completed successfully."
        *   `total_items_processed` (integer, optional)
        *   `total_web_queries` (integer, optional)
        *   `detailed_token_usage` (array of `ModelUsageData`, optional): Provides token counts for LLM calls made during the research.
            *   `ModelUsageData`: `{ "model_id": int, "model_name": str, "prompt_tokens": int, "completion_tokens": int, "total_tokens": int }`
    *   Example: `event: complete\ndata: {"message":"Research completed successfully.","total_items_processed":25,"total_web_queries":5,"detailed_token_usage":[{"model_id":123,"model_name":"gemini-1.5-flash","prompt_tokens":150,"completion_tokens":300,"total_tokens":450}]}\n\n`

*   **`event: error`**
    *   `data`: JSON object (`SSEErrorData`) indicating an error occurred.
        *   `error_message` (string): Description of the error.
        *   `stage_where_error_occurred` (string, optional): The stage where the error happened.
        *   `is_fatal` (boolean): If `true`, the task was terminated.
    *   Example: `event: error\ndata: {"error_message":"Failed to scrape a critical URL.","stage_where_error_occurred":"scraping","is_fatal":false}\n\n`

*   **`event: cancelled`**
    *   `data`: JSON object (`SSECancelledData`) indicating the task was cancelled.
        *   `message` (string): e.g., "Task was cancelled by request."
        *   `reason` (string, optional).
    *   Example: `event: cancelled\ndata: {"message":"Task cancelled by user."}\n\n`

*   **`event: heartbeat`**
    *   `data`: JSON object with a timestamp, sent periodically to keep the connection alive if there are long pauses between other events.
    *   Example: `event: heartbeat\ndata: {"timestamp": 1678886400.123}\n\n`

The stream is terminated when the client disconnects or after a `complete`, fatal `error`, or `cancelled` event is sent by the server and the connection is closed by the server.

## Endpoint: Image Generations

Creates an image given a prompt, utilizing an image generation model configured on the Scalytics Connect instance.

*   **URL:** `/v1/images/generations` (relative to the Scalytics Connect instance base URL)
*   **Method:** `POST`
*   **Headers:**
    *   `Content-Type: application/json`
    *   `Authorization: Bearer YOUR_SCALYTICS_API_KEY`
*   **Body (JSON):**

### Request Body Parameters

*   `model` (string, required): ID of the image generation model to use (e.g., `dall-e-3`, a custom configured local image model). Use `GET /v1/models` to see available models that support image generation.
*   `prompt` (string, required): A text description of the desired image(s).
*   `n` (integer, optional, default: `1`): The number of images to generate. **Currently, only `n=1` is supported by this endpoint.**
*   `size` (string, optional, default: `"1024x1024"`): The size of the generated images. Supported values depend on the model, common examples include `"256x256"`, `"512x512"`, `"1024x1024"`. Some models might support rectangular sizes like `"1792x1024"` or `"1024x1792"`.
*   `response_format` (string, optional, default: `"b64_json"`): The format in which the generated images are returned. Must be one of `url` or `b64_json`.

### Example Request

To generate an image and save it to a file (e.g., `output-image.png`):

**Using `jq` (recommended for robust JSON parsing):**
```bash
# Replace YOUR_INSTANCE_URL, YOUR_API_KEY, and your_model_id
curl -X POST https://YOUR_INSTANCE_URL/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -A "MyImageClient/1.0" \
  -d '{
    "model": "your_model_id",
    "prompt": "A photorealistic image of a cat wearing a small wizard hat, sitting on a stack of ancient books.",
    "n": 1,
    "size": "1024x1024",
    "response_format": "b64_json"
  }' | jq -r '.data[0].b64_json' | base64 --decode > output-image.png
```

**Alternative using `grep`, `sed`, `cut` (if `jq` is not available):**
```bash
# Replace YOUR_INSTANCE_URL, YOUR_API_KEY, and your_model_id
curl -X POST https://YOUR_INSTANCE_URL/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -A "MyImageClient/1.0" \
  -d '{
    "model": "your_model_id",
    "prompt": "A photorealistic image of a cat wearing a small wizard hat, sitting on a stack of ancient books.",
    "n": 1,
    "size": "1024x1024",
    "response_format": "b64_json"
  }' | grep -o '"b64_json":"[^"]*"' | sed 's/"b64_json":"//;s/"$//' | base64 --decode > output-image.png
```

**Note on the pipeline:**
*   The `curl` command sends the request.
*   `jq -r '.data[0].b64_json'` extracts the raw base64 string from the JSON response. (The `grep/sed/cut` alternative does the same, less robustly).
*   `base64 --decode` decodes the base64 string.
*   `> output-image.png` saves the decoded binary data to a file. You can change `output-image.png` to your desired filename. The `suggested_filename` field in the JSON response can also be used to name the file.
*   If `response_format` is `"url"`, the pipeline would be different (e.g., using `jq -r '.data[0].url'` and then `curl` or `wget` to download the URL).

### Response Format

A JSON object containing:
*   `created` (integer): Unix timestamp of when the image(s) were created.
*   `data` (array of objects): A list containing the generated image data. For `n=1`, this array will contain one object.
    *   Each object in the `data` array will have one of the following properties based on `response_format`:
        *   `b64_json` (string): The base64-encoded JSON of the generated image.
        *   `url` (string): The URL of the generated image. (Note: URLs might be temporary depending on the provider).

### Example Success Response (`response_format: "b64_json"`)
```json
{
  "created": 1678886400,
  "data": [
    {
      "b64_json": "iVBORw0KGgoAAAANSUhEUgAA...",
      "suggested_filename": "a-photorealistic-image-of-a-cat-1678886400.png"
    }
  ]
}
```

### Example Success Response (`response_format: "url"`)
```json
{
  "created": 1678886401,
  "data": [
    {
      "url": "https://example-provider.com/generated-images/image123.png",
      "suggested_filename": "a-photorealistic-image-of-a-cat-1678886401.png"
    }
  ]
}
```

### Error Handling (Specific to Image Generation)
In addition to common API errors:
*   `400 Bad Request`:
    *   Model does not support image generation.
    *   Invalid parameters (e.g., unsupported `size` for the model, `n` not equal to 1).
*   `404 Not Found`: Specified `model` ID not found or not configured.
*   `501 Not Implemented`: The provider configured for the specified model does not have image generation capabilities implemented in Scalytics Connect.

---

## Endpoints: Vector Service

The Vector Service API provides endpoints for managing and utilizing vector embeddings. These operations are typically performed on a vector store managed by the Python backend service. All vector service endpoints are protected by the standard Scalytics API key authentication.

### Endpoint: Generate Embeddings

Generates vector embeddings for a list of input text strings using the configured local embedding model.

*   **URL:** `/v1/vector/embeddings`
*   **Method:** `POST`
*   **Headers:**
    *   `Content-Type: application/json`
    *   `Authorization: Bearer YOUR_SCALYTICS_API_KEY`
*   **Body (JSON):** `EmbedTextsApiRequest` schema.
    *   `texts` (array of strings, required): A list of text strings to be embedded.
    *   `model_identifier` (string, optional): Optional identifier (e.g., ID or name) of the embedding model to use. If not provided, the service's default local embedding model will be used.

#### Example Request

```bash
# Replace YOUR_INSTANCE_URL and YOUR_API_KEY
curl https://YOUR_INSTANCE_URL/v1/vector/embeddings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -A "MyVectorClient/1.0" \
  -d '{
    "texts": ["This is the first document.", "This is the second document for embedding."],
    "model_identifier": "sentence-transformers/all-MiniLM-L6-v2" # Optional
  }'
```

#### Response Format

A JSON object (`EmbedTextsApiSuccessResponse`) containing:
*   `success` (boolean): `true` if successful.
*   `data` (object - `EmbedTextsApiResponseData`):
    *   `embeddings` (array of array of floats): The generated embedding vectors.
    *   `model_used` (string): Identifier of the embedding model actually used.
    *   `dimension` (integer): The dimensionality of the embeddings.

Common error responses include 400, 401, 403, 429, 500, 503.

---

### Endpoint: Add Documents

Adds a list of documents to the vector store, associating them with a specific `group_id`. Each document's `text_content` will be chunked and embedded by the backend service.

*   **URL:** `/v1/vector/documents`
*   **Method:** `POST`
*   **Headers:**
    *   `Content-Type: application/json`
    *   `Authorization: Bearer YOUR_SCALYTICS_API_KEY`
*   **Body (JSON):** `AddDocumentsApiRequest` schema.
    *   `documents` (array of `DocumentItemInput` objects, required):
        *   `DocumentItemInput`:
            *   `id` (string, optional): Your custom ID for the document.
            *   `text_content` (string, required): The text content of the document.
            *   `metadata` (object, optional): Arbitrary key-value pairs associated with the document.
    *   `group_id` (string, required): An identifier to group these documents (e.g., a user ID, session ID, or a specific collection name).

#### Example Request

```bash
# Replace YOUR_INSTANCE_URL and YOUR_API_KEY
curl https://YOUR_INSTANCE_URL/v1/vector/documents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -A "MyVectorClient/1.0" \
  -d '{
    "group_id": "user_123_collection_alpha",
    "documents": [
      {
        "id": "doc1",
        "text_content": "The first document is about apples and oranges.",
        "metadata": {"category": "fruits", "source_date": "2023-01-15"}
      },
      {
        "text_content": "The second document discusses bananas and grapes.",
        "metadata": {"category": "fruits", "processed": true}
      }
    ]
  }'
```

#### Response Format

A JSON object (`GeneralApiResponse`) containing:
*   `success` (boolean): Indicates if the operation was successful.
*   `message` (string): A message describing the outcome.
*   `details` (object, optional): Additional details, e.g., number of items processed.

Common error responses include 400, 401, 403, 429, 500, 503.

---

### Endpoint: Search Documents

Searches the vector store for documents relevant to a given `query_text`. The search can be scoped by `group_id`.

*   **URL:** `/v1/vector/search`
*   **Method:** `POST`
*   **Headers:**
    *   `Content-Type: application/json`
    *   `Authorization: Bearer YOUR_SCALYTICS_API_KEY`
*   **Body (JSON):** `VectorSearchApiRequest` schema.
    *   `query_text` (string, required): The text to search for.
    *   `group_id` (string, optional): If provided, scopes the search to this group.
    *   `top_k` (integer, optional, default: 5): The maximum number of results to return.

#### Example Request

```bash
# Replace YOUR_INSTANCE_URL and YOUR_API_KEY
curl https://YOUR_INSTANCE_URL/v1/vector/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -A "MyVectorClient/1.0" \
  -d '{
    "query_text": "information about tropical fruits",
    "group_id": "user_123_collection_alpha",
    "top_k": 3
  }'
```

#### Response Format

A JSON object (`VectorSearchApiResponse`) containing:
*   `success` (boolean): Indicates if the search was successful.
*   `message` (string): A message describing the outcome.
*   `results` (array of `VectorSearchResultItemApi` objects): The list of search results.
    *   `VectorSearchResultItemApi`:
        *   `id` (string, optional): ID of the original document item.
        *   `text_content` (string): Text content of the matching chunk.
        *   `metadata` (object): Metadata of the original document.
        *   `distance` (float, optional): Distance score.
        *   `similarity` (float, optional): Similarity score.
*   `details` (object, optional): Additional details.

Common error responses include 400, 401, 403, 429, 500, 503.

---

### Endpoint: Delete Document Group

Deletes all vector documents associated with a specific `group_id` from the vector store.

*   **URL:** `/v1/vector/groups/delete`
*   **Method:** `POST` (Note: While `DELETE /v1/vector/groups/{group_id}` might be more RESTful, `POST` is used here to align with the Python backend's current endpoint for simplicity of forwarding).
*   **Headers:**
    *   `Content-Type: application/json`
    *   `Authorization: Bearer YOUR_SCALYTICS_API_KEY`
*   **Body (JSON):** `DeleteVectorGroupApiRequest` schema.
    *   `group_id` (string, required): The ID of the group whose vector documents should be deleted.

#### Example Request

```bash
# Replace YOUR_INSTANCE_URL and YOUR_API_KEY
curl https://YOUR_INSTANCE_URL/v1/vector/groups/delete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -A "MyVectorClient/1.0" \
  -d '{
    "group_id": "user_123_collection_alpha_to_delete"
  }'
```

#### Response Format

A JSON object (`GeneralApiResponse`) containing:
*   `success` (boolean): Indicates if the deletion request was processed successfully.
*   `message` (string): A message describing the outcome.
*   `details` (object, optional): Additional details.

Common error responses include 400, 401, 403, 429, 500, 503.

---

## Security and Troubleshooting

*   **Key Security:** Remind users that Scalytics API keys should be treated like passwords and kept confidential. Deleting a user's key is the way to revoke their specific access.
*   **Rate Limiting:** Monitor overall API usage patterns (e.g., via logs or system monitoring) and adjust the global rate limits as necessary to balance usability and protect server resources.
*   **Global Toggle:** Use the global disable switch when the API feature needs to be temporarily or permanently deactivated for maintenance or security reasons.
*   **System Prompts:** Note that the Scalytics API endpoint (`/v1/chat/completions`) does **not** automatically apply any system prompts or profiles configured for the local model within the main Scalytics Connect UI. For API usage, any desired system prompt must be explicitly included by the client application as the first message in the `messages` array with `role: "system"`. This ensures compatibility with standard OpenAI client behavior.
*   `400 Bad Request`: Invalid request body (e.g., missing `messages` field).
*   `401 Unauthorized`: Missing, invalid, or inactive API key.
*   `403 Forbidden`: The Scalytics API feature might be globally disabled by the administrator.
*   `429 Too Many Requests`: Rate limit exceeded.
*   `500 Internal Server Error`: An unexpected error occurred on the server (e.g., no active local model configured).
*   `503 Service Unavailable`: The API is globally disabled by the administrator.
Check the `error` object in the JSON response body for more details.
*   **403 Forbidden Error:** If you receive a `403 Forbidden` error (potentially directly from Nginx), it might be due to the User-Agent header in your request. The server configuration may block requests from default User-Agents associated with tools like `curl`, `wget`, or basic Python HTTP clients.

## Connecting to a Remote Scalytics Instance

You can configure this Scalytics Connect instance to use the models hosted on *another* Scalytics Connect instance. This is achieved by treating the remote instance's Scalytics API as an external provider and using a Global API Key.

**Prerequisites:**

*   Access to the *remote* Scalytics Connect instance.
*   An API key generated on the *remote* instance (via Settings -> API Keys -> Generate Scalytics API Key).
*   The base URL of the *remote* instance (e.g., `https://remote-scalytics.yourcompany.com`).

**Steps:**

1.  **Generate Remote API Key:**
    *   Log in to the *remote* Scalytics instance.
    *
