# Integrating Scalytics Connect with Coding Tools & Chatbots

Scalytics Connect provides a powerful API that can be integrated into various developer tools, IDE extensions, and chatbots to leverage its AI capabilities directly within your workflow. This guide explains how to connect external tools using the OpenAI-compatible endpoint.

**Important Note:** While Scalytics Connect offers an OpenAI-compatible API endpoint for broad compatibility, its current implementation focuses on robust **text-based interactions**. Features like direct image or audio processing via the API are not supported at this time. This focus ensures a secure and controlled environment suitable for enterprise use cases centered around code generation, text analysis, and data processing. Future updates may expand modality support.

## OpenAI-Compatible Endpoint

Scalytics Connect exposes an endpoint compatible with the OpenAI API standard. This makes it easy to integrate with tools that already support connecting to OpenAI or other compatible services.

**Endpoint URL:** `https://YOUR_SCALYTICS_CONNECT_URL/v1`

Replace `YOUR_SCALYTICS_CONNECT_URL` with the actual base URL of your Scalytics Connect instance.

## Authentication

Authentication is handled via API Keys generated within Scalytics Connect.

1.  Navigate to the API Key management section in the Scalytics Connect admin interface.
2.  Generate a new API key specifically for your tool or integration.
3.  Use this key as the `Bearer` token in the `Authorization` header of your API requests, or input it into the appropriate API Key field in your tool's configuration.

## Example: Integrating with Cline

[Cline](https://cline.bot/enterprise) is an AI coding assistant available as a VS Code extension (search for "Cline" in the VS Code Marketplace) that can be configured to use Scalytics Connect as its backend.

**Configuration Steps (within Cline VS Code Extension Settings):**

1.  **Provider:** Select `OpenAI compatible`.
2.  **BaseURL:** Enter your Scalytics Connect API endpoint: `https://YOUR_SCALYTICS_CONNECT_URL/v1`
3.  **API Key:** Paste the API key you generated in Scalytics Connect.
4.  **Model ID:** Specify the model name you want Cline to use (in case you have multiple models under an advanced enterprise license), as configured in Scalytics Connect (e.g., `deepseek-ai/deepseek-coder-6.7b-instruct`, `mistralai/Mistral-7B-Instruct-v0.3`, etc.). You can find the model name in the Scalytics Connect chat panel when you create a new chat.
**Note**: If only one model is active, the API will use the default model and ignore any incorrect model names.
   
5.  **Model Configuration:**
- **Supports Images:** Uncheck this box.
- **Context Window:** Set this to match the context window configured for the selected model in Scalytics Connect (e.g., `65536`, `32768`, `128000`, etc.). Using the correct context window size ensures optimal performance and prevents errors.
- **Max Output Tokens:** Leave it at `-1`, or set it to a value you feel comfortable with.
- **Temperature:** Leave it at `0` for debug purposes and deterministic code suggestions. Values of `5` and higher are great for brainstorming and quick prototyping.

Once configured, Cline will use your self-hosted Scalytics Connect instance for code generation, analysis, and other AI-assisted tasks directly within VS Code.

## Tips for AI-Supported Coding via API

*   **Clear Instructions:** Provide detailed and specific instructions (prompts) to the AI. The more context you give, the better the results.
*   **Context is Key:** Include relevant code snippets, file context, error messages, or project details in your requests to help the AI understand the task.
*   **Iterative Refinement:** Don't expect perfect results on the first try. Use the AI's output as a starting point and refine your prompts or the generated code iteratively.
*   **Specify the Model:** Always ensure your tool is configured to use the specific Scalytics Connect model ID that best suits your task (e.g., coding-focused models for code generation). Be mindful of the model's size and your hardware capabilities, as this impacts performance and functionality:

    | Model Size Parameter Count | Typical Local Capabilities                                     |
    | :------------------------- | :----------------------------------------------------------- |
    | ~7 Billion (7B)            | Basic coding assistance, limited complex reasoning/tool use. |
    | ~14 Billion (14B)          | Better coding ability, potentially unstable tool use.        |
    | ~32 Billion (32B)          | Good coding performance, tool use may be inconsistent.       |
    | ~70 Billion (70B+)         | Best local performance, but requires significant GPU RAM.    |

    *Note: Running larger models locally requires substantial hardware resources (especially VRAM). Even with capable hardware, local models may not match the performance of large, cloud-based models.*

*   **Temperature and Parameters:** If your tool allows, experiment with API parameters like `temperature` (controls randomness/creativity) to fine-tune the output style. Lower temperatures (e.g., 0.2) produce more deterministic, focused output, while higher temperatures (e.g., 0.8) yield more creative results.
*   **Keep Tasks Simple:** Break down complex problems into smaller, focused tasks for the AI. This often yields better, more manageable results.
*   **Save Frequently:** When working with AI tools that can generate significant code changes, save your work often to avoid losing progress.
*   **Review and Test:** Always review code generated by AI before integrating it. Test it thoroughly to ensure correctness, security, and performance.

By integrating Scalytics Connect with tools like Cline, you can create a powerful, customized, and secure AI-assisted development environment.
