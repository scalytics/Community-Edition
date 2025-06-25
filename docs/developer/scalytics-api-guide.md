# Scalytics API Developer Guide

This guide provides comprehensive documentation for developers using the Scalytics API. The API allows for programmatic interaction with the local AI models and services hosted on your Scalytics Connect instance.

## 1. Introduction

The Scalytics API is designed to be compatible with the OpenAI API format, making it easy to integrate with existing tools and libraries. The primary features include:

-   **Chat Completions**: Interact with the active local language model.
-   **Live Search**: Initiate and stream results from the advanced research agent.
-   **Image Generation**: Create images using configured local image models.
-   **Vector Service**: Manage and search a vector store for Retrieval-Augmented Generation (RAG).

**Key Restriction**: The API is designed to work exclusively with **local models** managed by the Scalytics Connect instance. It does not provide access to external, third-party model providers like OpenAI or Anthropic.

## 2. Getting Started

### For Developers: Generating Your API Key

1.  Log in to your Scalytics Connect account.
2.  Navigate to **Settings** > **API Keys**.
3.  In the **"Generate Scalytics API Key"** section, provide a descriptive name for your key (e.g., "My Local Dev Key").
4.  Click **"Generate Key"**.
5.  **Important**: Your new API key (prefixed with `sk-scalytics-`) will be displayed **only once**. Copy and store it in a secure location immediately.

### For Administrators: Enabling the API

1.  Navigate to **Admin Dashboard** > **Scalytics API**.
2.  Use the **"Enable Scalytics API Access"** toggle to activate or deactivate the API globally.
3.  Configure the **Time Window** and **Max Requests per Window** to set the global rate limit.

## 3. Authentication

All API requests must be authenticated using a personal Scalytics API key. Provide your API key as a Bearer token in the `Authorization` header of your requests:

```
Authorization: Bearer sk-scalytics-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## 4. Core Concepts

### Model Selection

The Scalytics API operates on a single-active-model principle for its core endpoints.

-   **/v1/chat/completions**: This endpoint automatically uses the one local model that is currently marked as "Active" in the Admin Dashboard. The `model` parameter in the request body is ignored.
-   **/v1/live-search**: This endpoint requires you to specify the `reasoningModelName` and `synthesisModelName` in the request body. You can use the `GET /v1/models` endpoint to discover available models.
-   **/v1/images/generations**: This endpoint requires a `model` parameter specifying which configured image generation model to use.

### Rate Limiting

The API is subject to a global rate limit configured by the administrator. This limit is shared across all users and keys. If the limit is exceeded, the API will return a `429 Too Many Requests` error.

### Concurrency

The Scalytics API is designed to handle multiple simultaneous requests efficiently by using a background worker system. Incoming API requests are distributed across available worker processes, allowing the system to process several requests in parallel.

## 5. API Endpoints

### Chat Completions

This endpoint allows you to interact with the active local language model.

-   **URL:** `/v1/chat/completions`
-   **Method:** `POST`
-   **Request Body:** Follows the OpenAI Chat Completions schema.
    -   `messages` (array, required): Conversation history.
    -   `stream` (boolean, optional): Set to `true` for Server-Sent Events (SSE) streaming.
-   **Response:** Standard OpenAI Chat Completion object or an SSE stream.

#### Example: Non-Streaming Request

```bash
curl https://YOUR_INSTANCE_URL/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "messages": [
      {"role": "user", "content": "Explain the concept of API rate limiting."}
    ]
  }'
```

### Live Search

Initiates a Live Search task and streams progress and results.

-   **URL:** `/v1/live-search`
-   **Method:** `POST`
-   **Headers:** `Accept: text/event-stream`
-   **Request Body:** See the `DeepSearchApiRequest` schema for all available parameters.
    -   `query` (string, required): The research query.
    -   `reasoningModelName` (string, required): The name of the model for reasoning tasks.
    -   `synthesisModelName` (string, required): The name of the model for the final synthesis.
-   **Response:** A stream of Server-Sent Events.

#### Example: Live Search Request

```bash
curl -N https://YOUR_INSTANCE_URL/v1/live-search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: text/event-stream" \
  -d '{
    "query": "Impact of quantum computing on cryptography",
    "reasoningModelName": "gemini-1.5-flash-latest",
    "synthesisModelName": "gemini-1.5-pro-latest"
  }'
```

### Image Generation

Creates an image from a text prompt.

-   **URL:** `/v1/images/generations`
-   **Method:** `POST`
-   **Request Body:**
    -   `model` (string, required): The ID of the image generation model.
    -   `prompt` (string, required): The text description of the image.
    -   `n` (integer, optional, default: 1): Number of images. Only `n=1` is currently supported.
    -   `size` (string, optional, default: "1024x1024"): Image dimensions.
    -   `response_format` (string, optional, default: "b64_json"): `url` or `b64_json`.
-   **Response:** A JSON object containing the image data in the specified format.

### Vector Service

Endpoints for managing and searching the vector store.

-   **Generate Embeddings:** `POST /v1/vector/embeddings`
-   **Add Documents:** `POST /v1/vector/documents`
-   **Search Documents:** `POST /v1/vector/search`
-   **Delete Document Group:** `POST /v1/vector/groups/delete`

## 6. Administration

This section is for system administrators managing the API.

### Managing API Keys

-   **Global Keys**: Administrators can set up global API keys for external providers (e.g., OpenAI, Anthropic) under **Admin > Integrations > API Keys**. These keys will be used by all users.
-   **User Keys**: While administrators cannot view the content of user-generated Scalytics API keys, they can see a list of them and delete them if necessary to revoke access.

### Connecting to a Remote Scalytics Instance

You can configure this instance to use the models from another Scalytics Connect instance.

1.  **On the remote instance**, generate a Scalytics API key.
2.  **On the current instance**, navigate to **Admin > Providers** and add a new provider.
    -   **Name**: A descriptive name (e.g., "Remote Prod Instance").
    -   **API URL**: The base URL of the remote instance.
3.  **On the current instance**, go to **Admin > Integrations > Global API Keys** and add a new global key.
    -   **Provider**: Select the provider you just created.
    -   **API Key**: Paste the key generated from the remote instance.

## 7. Troubleshooting

-   **`401 Unauthorized`**: Your API key is missing, invalid, or has been deleted.
-   **`403 Forbidden`**: The Scalytics API is globally disabled by the administrator. This can also be caused by a blocked `User-Agent` header; try setting a custom one (e.g., `User-Agent: MyClient/1.0`).
-   **`429 Too Many Requests`**: The global rate limit has been exceeded.
-   **`500 Internal Server Error`**: A server-side error occurred, often because no local model is active.
-   **`503 Service Unavailable`**: The API is globally disabled.
