"""
LLM Reasoning and Synthesis Module
Handles LLM calls via litellm for reasoning, synthesis, and summarization tasks.
"""
import os
os.environ['LITELLM_DISABLE_TELEMETRY'] = '1'

import asyncio
import traceback
import json
import openai # Add openai import
import random
import re
from typing import Dict, List, Optional, Any, Union, Literal, Tuple, Mapping, Set
import contextlib
import sys
import numpy as np
from transformers import AutoTokenizer

import aiohttp
import litellm
litellm.suppress_debug_info = True

from langchain.chains.summarize import load_summarize_chain
from langchain_core.documents import Document
from langchain_core.language_models.llms import LLM
from langchain_core.callbacks.manager import AsyncCallbackManagerForLLMRun, CallbackManagerForLLMRun
from langchain_core.outputs import LLMResult, Generation


from ..utils import setup_logger
from .. import config as app_config
from .. import models

logger = setup_logger(__name__, level=app_config.settings.LOG_LEVEL)

try:
    import logging
    loggers_to_silence = ["litellm", "litellm.utils", "litellm.cost_calculator", "LiteLLM", "LiteLLM.utils", "LiteLLM.cost_calculator"]
    for logger_name in loggers_to_silence:
        current_logger = logging.getLogger(logger_name)
        if current_logger:
            current_logger.setLevel(logging.WARNING)

    litellm.set_verbose = False
except Exception as e_log:
    pass

class LiteLLMWrapper(LLM):
    model_info: Dict[str, Any]
    api_config: Dict[str, Any]
    settings: app_config.Settings
    llm_reasoning_instance: 'LLMReasoning'

    @property
    def _llm_type(self) -> str:
        return "litellm_wrapper"

    async def _agenerate(
        self,
        prompts: List[str],
        stop: Optional[List[str]] = None,
        run_manager: Optional[AsyncCallbackManagerForLLMRun] = None,
        user_id_for_internal_call: Optional[str] = None, 
        **kwargs: Any,
    ) -> LLMResult:
        generations_batch = []
        total_prompt_tokens = 0
        total_completion_tokens = 0
        total_tokens = 0
        

        for prompt_text in prompts:
            current_prompt_generations: List[Generation] = []

            temp_model_info = {
                "name": self.model_info.get('name'),
                "external_model_id": self.model_info.get('external_model_id'),
                "provider_name": self.model_info.get('provider_name'),
                "temperature": self.model_info.get("temperature", self.settings.LIVE_SEARCH_REASONING_DEFAULT_TEMP),
            }

            try:
                result_data = await self.llm_reasoning_instance._execute_llm_call(
                    request_type="langchain_wrapper_agenerate",
                    prompt=prompt_text,
                    model_info=temp_model_info,
                    api_config=self.api_config,
                    user_id_for_internal_call=user_id_for_internal_call, 
                    expected_output_format="text" 
                    # is_cancelled_flag=kwargs.get('is_cancelled_flag') # If we could pass it
                )

                text_output = result_data.get("output", "")
                if result_data.get("error"):
                    text_output = f"[Error: {result_data.get('error')}]"

                current_prompt_generations.append(Generation(text=text_output))

                usage = result_data.get("usage", {})
                prompt_tokens_custom = usage.get('prompt_tokens', 0)
                completion_tokens_custom = usage.get('completion_tokens', 0)

                total_prompt_tokens += prompt_tokens_custom
                total_completion_tokens += completion_tokens_custom
                total_tokens += (prompt_tokens_custom + completion_tokens_custom)

            except Exception as e:
                current_prompt_generations.append(Generation(text=f"Error: {e}"))

            generations_batch.append(current_prompt_generations)

        llm_output_data = {
            "token_usage": {
                 "prompt_tokens": total_prompt_tokens,
                 "completion_tokens": total_completion_tokens,
                 "total_tokens": total_tokens,
            },
            "model_name": self.model_info.get('external_model_id') or self.model_info.get('name')
        }
        return LLMResult(generations=generations_batch, llm_output=llm_output_data)

    @property
    def _identifying_params(self) -> Mapping[str, Any]:
        return {
            "model_name": self.model_info.get('external_model_id') or self.model_info.get('name'),
            "temperature": self.model_info.get("temperature", self.settings.LIVE_SEARCH_REASONING_DEFAULT_TEMP),
        }

    def _call(
        self,
        prompt: str,
        stop: Optional[List[str]] = None,
        run_manager: Optional[CallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> str:
        logger.warning("LiteLLMWrapper._call (sync) is not fully implemented to use the main _execute_llm_call. Using direct litellm.completion.")

        model_name = self.model_info.get('external_model_id') or self.model_info.get('name')
        provider_name = self.model_info.get('provider_name', '').lower()
        model_arg_for_litellm = model_name

        api_key = None
        api_base_url = None

        if provider_name == 'local':
            api_base_url = self.settings.LOCAL_LLM_API_BASE
            model_arg_for_litellm = model_name
            if isinstance(self.api_config, dict):
                api_key = self.api_config.get("llm_local_apiKey")
        elif provider_name == 'google':
            if not model_name.startswith('gemini/'): model_arg_for_litellm = f"gemini/{model_name}"
            if isinstance(self.api_config, dict): api_key = self.api_config.get("llm_Google_apiKey")
        elif provider_name == 'mistral':
            if not model_name.startswith('mistral/'): model_arg_for_litellm = f"mistral/{model_name}"
            if isinstance(self.api_config, dict):
                api_key = self.api_config.get("llm_Mistral_apiKey")
                api_base_url = self.api_config.get("llm_Mistral_apiBase")

        litellm_params_custom = {
            "model": model_arg_for_litellm,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": self.model_info.get("temperature", self.settings.LIVE_SEARCH_REASONING_DEFAULT_TEMP),
            "stop": stop,
        }
        if api_key:
            litellm_params_custom["api_key"] = api_key
        if api_base_url:
             litellm_params_custom["api_base"] = api_base_url

        litellm_params_custom = {k: v for k, v in {**litellm_params_custom, **kwargs}.items() if v is not None}

        text_output = ""
        try:
            with contextlib.redirect_stdout(sys.stderr):
                response_obj_custom = litellm.completion(**litellm_params_custom)

            text_output = response_obj_custom.choices[0].message.content if response_obj_custom and response_obj_custom.choices else ""
        except Exception as e:
            logger.error(f"LiteLLMWrapper _call error: {e}", exc_info=True)
            text_output = f"[Error in LiteLLMWrapper _call: {e}]"
            if run_manager: run_manager.on_llm_error(e)
        return text_output


class LLMReasoning:
    def __init__(self, settings: app_config.Settings):
        self.settings = settings
        self.call_cache: Dict[str, Any] = {}
        self.tokenizer_cache: Dict[str, Any] = {}

    def _count_tokens(self, text: str, model_info: Dict[str, Any]) -> int:
        """Counts tokens using litellm's token_counter."""
        model_name = model_info.get('external_model_id') or model_info.get('name')
        if not model_name:
            # Fallback for safety, though model_name should always be present
            return len(text.split())
        try:
            return litellm.token_counter(model=model_name, text=text)
        except Exception as e:
            logger.warning(f"LiteLLM token_counter failed for model {model_name}: {e}. Falling back to word count.")
            return len(text.split())

    def _calculate_dynamic_max_tokens(self, prompt: str, model_info: Dict[str, Any], safety_buffer: int = 200) -> int:
        """Calculates the max tokens for a completion, respecting the model's context window."""
        model_name = model_info.get('external_model_id') or model_info.get('name')
        if not model_name:
            # Fallback for safety
            return 1024 
        
        # Per user instruction, we no longer use litellm.get_max_tokens.
        # We rely on the context_window defined in our database for the model.
        model_max_context = model_info.get("context_window", 8192) # Fallback to a safe default.

        prompt_tokens = self._count_tokens(prompt, model_info)
        
        available_tokens = model_max_context - prompt_tokens - safety_buffer
        
        # Ensure we request at least a minimum number of tokens for the completion
        return max(100, available_tokens)

    def _calculate_cosine_similarity(self, vec1, vec2):
        if vec1 is None or vec2 is None:
            return 0.0
        vec1 = np.array(vec1)
        vec2 = np.array(vec2)
        if vec1.shape != vec2.shape or np.linalg.norm(vec1) == 0 or np.linalg.norm(vec2) == 0:
            return 0.0
        return np.dot(vec1, vec2) / (np.linalg.norm(vec1) * np.linalg.norm(vec2))

    def _deduplicate_chunks_by_content_similarity(self, chunks: List[models.ContentChunk], similarity_threshold: float = 0.95) -> List[models.ContentChunk]:
        unique_chunks = []
        
        try:
            embeddings = [chunk.vector_metadata.get("embedding") for chunk in chunks if chunk.vector_metadata]
        except Exception:
            embeddings = []

        if len(embeddings) != len(chunks):
            logger.warning("Could not get all embeddings for deduplication, falling back to text-based dedupe.")
            seen_content = set()
            for chunk in chunks:
                if chunk.text_content not in seen_content:
                    unique_chunks.append(chunk)
                    seen_content.add(chunk.text_content)
            return unique_chunks

        to_remove = set()
        for i in range(len(chunks)):
            if i in to_remove:
                continue
            for j in range(i + 1, len(chunks)):
                if j in to_remove:
                    continue
                similarity = self._calculate_cosine_similarity(embeddings[i], embeddings[j])
                if similarity > similarity_threshold:
                    if len(chunks[j].text_content) < len(chunks[i].text_content):
                        to_remove.add(j)
                    else:
                        to_remove.add(i)
                        break 
        
        for i, chunk in enumerate(chunks):
            if i not in to_remove:
                unique_chunks.append(chunk)
                
        return unique_chunks

    def calculate_chunk_quality_score(self, chunk: models.ContentChunk, query: str) -> float:
        """Calculate comprehensive quality score for vector ranking"""
        
        base_score = chunk.vector_metadata.get("trust_score", 0.5) if chunk.vector_metadata else 0.5
        semantic_score = chunk.vector_metadata.get("similarity_score", 0.5) if chunk.vector_metadata else 0.5
        content_length_score = min(len(chunk.text_content) / 1000, 1.0)
        
        quality_penalties = 0
        low_quality_patterns = [
            "click here", "read more", "sign up", "subscribe", 
            "advertisement", "cookie policy", "terms of service"
        ]
        
        content_lower = chunk.text_content.lower()
        for pattern in low_quality_patterns:
            if pattern in content_lower:
                quality_penalties += 0.1
        
        source_score = 1.0
        if chunk.original_url:
            try:
                domain = chunk.original_url.split('/')[2]
                high_quality_domains = ['.edu', '.gov', '.org', 'nytimes', 'reuters', 'bloomberg']
                if any(domain.endswith(tld) for tld in high_quality_domains):
                    source_score = 1.2
                elif 'wiki' in domain:
                    source_score = 1.1
            except IndexError:
                source_score = 1.0
        
        final_score = (
            base_score * 0.3 +
            semantic_score * 0.4 +
            content_length_score * 0.2 +
            source_score * 0.1
        ) - quality_penalties
        
        return max(0.0, min(1.0, final_score))

    async def cluster_chunks_semantically(
        self, 
        chunks: List[models.ContentChunk],
        max_clusters: int = 5
    ) -> Dict[str, List[models.ContentChunk]]:
        """Group semantically similar chunks to avoid redundancy"""
        
        try:
            embeddings = [chunk.vector_metadata.get("embedding") for chunk in chunks if chunk.vector_metadata]
        except Exception:
            embeddings = []

        if len(embeddings) != len(chunks):
            logger.warning("Some chunks missing embeddings, clustering may be suboptimal.")
            return {f"cluster_{i}": [chunk] for i, chunk in enumerate(chunks)}

        clusters = {}
        used_chunks = set()
        
        for i, chunk in enumerate(chunks):
            if chunk.chunk_id in used_chunks:
                continue
                
            cluster_key = f"cluster_{len(clusters)}"
            clusters[cluster_key] = [chunk]
            used_chunks.add(chunk.chunk_id)
            
            for j, other_chunk in enumerate(chunks[i+1:], i+1):
                if other_chunk.chunk_id in used_chunks:
                    continue
                    
                similarity = self._calculate_cosine_similarity(
                    embeddings[i], embeddings[j]
                )
                
                if similarity > 0.85:
                    clusters[cluster_key].append(other_chunk)
                    used_chunks.add(other_chunk.chunk_id)
            
            if len(clusters) >= max_clusters:
                break
        
        return clusters

    async def select_best_from_clusters(
        self,
        clustered_chunks: Dict[str, List[models.ContentChunk]],
        max_chunks: int = 15
    ) -> List[models.ContentChunk]:
        """Select the highest quality representative from each cluster"""
        
        selected_chunks = []
        
        for cluster_name, cluster_chunks in clustered_chunks.items():
            cluster_chunks.sort(key=lambda x: (
                x.vector_metadata.get("trust_score", 0.5) if x.vector_metadata else 0.5,
                len(x.text_content),
                -x.text_content.lower().count("click here"),
            ), reverse=True)
            
            if cluster_chunks:
                selected_chunks.append(cluster_chunks[0])
                
                if (len(cluster_chunks) > 1 and 
                    (cluster_chunks[0].vector_metadata.get("trust_score", 0) if cluster_chunks[0].vector_metadata else 0) > 0.8):
                    selected_chunks.append(cluster_chunks[1])
        
        return selected_chunks[:max_chunks]

    async def synthesize_reasoning_step(
        self,
        reasoning_step: str,
        focused_chunks: List[models.ContentChunk],
        model_info: Dict[str, Any],
        api_config: Dict[str, Any],
        user_id: str,
        request_id: str
    ) -> Dict[str, Any]:
        if not focused_chunks:
            return {"output": f"No information found for: {reasoning_step}", "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}}

        formatted_chunks = "\n\n".join([f"--- Source: {chunk.original_url} ---\n{chunk.text_content}" for chunk in focused_chunks])
        
        prompt = f"""You are a research analyst. Your task is to write a concise paragraph answering a specific research question, based ONLY on the provided source material.

    Research Question: "{reasoning_step}"

    Source Material:
    ---
    {formatted_chunks}
    ---

    Based on the source material, write a concise, factual paragraph that directly answers the research question. Cite your sources inline using [ref: URL] format for every piece of information.

    Answer:
    """
        synthesis_model_info = model_info.copy()

        return await self._execute_llm_call(
            request_type="synthesize_reasoning_step",
            prompt=prompt,
            model_info=synthesis_model_info,
            api_config=api_config,
            user_id_for_internal_call=user_id,
            request_id=request_id,
            expected_output_format="text"
        )

    async def assemble_final_report(
        self,
        original_query: str,
        synthesis_parts: List[Dict[str, Any]],
        model_info: Dict[str, Any],
        api_config: Dict[str, Any],
        user_id: str,
        request_id: str
    ) -> Dict[str, Any]:
        
        formatted_parts = ""
        for part in synthesis_parts:
            formatted_parts += f"## {part['step']}\n\n{part['content']}\n\n"

        prompt = f"""You are an editor assembling a final research report from several synthesized parts.

    Original User Query: "{original_query}"

    Synthesized Sections:
    ---
    {formatted_parts}
    ---

        Your task is to assemble these sections into a single, coherent report.
        1. Write a brief executive summary (1-2 paragraphs) that encapsulates the main findings from all sections.
        2. Assemble the sections in a logical order.
        3. Ensure smooth transitions between sections.
        4. Add a concluding paragraph.
        5. Maintain a professional, objective tone.

    Final Report:
    """
        assembly_model_info = model_info.copy()

        # Add explicit answer framing to the prompt
        framing_instruction = """
CRITICAL INSTRUCTION: You are a fact-based reasoner. Your primary goal is to construct a report based on verified information.
- **Prioritize Resolved Facts:** The 'Resolved Facts for Report Construction' section contains the most reliable information. Use it as your primary source of truth.
- **Critically Evaluate Sources:** The 'Excerpts from relevant source materials' are for context and supplemental information. If a source excerpt is irrelevant, low-quality, or contradicts a resolved fact, you MUST ignore it.
- **Controlled Synthesis:** Do not invent or infer information. Stick to the facts provided. Your task is to synthesize, not to create.
"""
        prompt = framing_instruction + prompt

        return await self._execute_llm_call(
            request_type="assemble_final_report",
            prompt=prompt,
            model_info=assembly_model_info,
            api_config=api_config,
            user_id_for_internal_call=user_id,
            request_id=request_id,
            expected_output_format="text"
        )

    async def _call_xai_directly_async(
        self,
        model_name: str,
        messages: List[Dict[str, str]],
        api_key: str,
        api_base: str,
        temperature: float,
        max_tokens: Optional[int], # Keep for now to avoid breaking calls, but it won't be used
        user_id: Optional[str], # For the 'user' parameter in OpenAI SDK
        response_format_type: Optional[Literal["text", "json_object"]], # For response_format
        request_id: Optional[str] = None, # For logging
        is_cancelled_flag: Optional[asyncio.Event] = None,
    ) -> Dict[str, Any]:
        log_prefix = f"[LLMReasoning:{request_id or 'N/A'}:_call_xai_directly_async]"
        
        # FIX: Ensure the base URL includes /v1 for OpenAI SDK compatibility with xAI
        corrected_api_base = api_base
        if corrected_api_base.endswith('/'):
            corrected_api_base = corrected_api_base.rstrip('/')
        
        if not corrected_api_base.endswith('/v1'):
            if "api.x.ai" in corrected_api_base: 
                 corrected_api_base = corrected_api_base + '/v1'

        client = openai.AsyncOpenAI(api_key=api_key, base_url=corrected_api_base)
        call_params = {
            "model": model_name, 
            "messages": messages,
            "temperature": temperature,
        }
        # The max_tokens parameter is intentionally not added here to rely on prompt engineering.
        if user_id:
            call_params["user"] = user_id
        if response_format_type == "json_object": 
            call_params["response_format"] = {"type": "json_object"}
        
        # Filter out None values from call_params before passing to SDK
        sdk_call_params = {k: v for k, v in call_params.items() if v is not None}

        try:
            if is_cancelled_flag and is_cancelled_flag.is_set():
                return {"output": None, "error": "Operation cancelled.", "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}}

            response = await client.chat.completions.create(**sdk_call_params)
            
            output_content = None
            if response.choices and response.choices[0].message:
                output_content = response.choices[0].message.content

            usage_data = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
            if response.usage:
                usage_data["prompt_tokens"] = response.usage.prompt_tokens or 0
                usage_data["completion_tokens"] = response.usage.completion_tokens or 0
                usage_data["total_tokens"] = response.usage.total_tokens or 0
            
            if output_content is None:
                 logger.warning(f"{log_prefix} xAI direct call: Response content is None/empty.")
                 return {"output": None, "error": "xAI response content empty.", "usage": usage_data}

            if response_format_type == "json_object":
                try:
                    # Attempt to fix trailing commas before parsing
                    cleaned_output = re.sub(r",\s*([\}\]])", r"\1", output_content.strip())
                    parsed_output = json.loads(cleaned_output)
                    return {"output": parsed_output, "usage": usage_data, "error": None}
                except json.JSONDecodeError as e_json:
                    logger.error(f"{log_prefix} Failed to parse JSON response from xAI: {e_json}. Raw content: {output_content[:500]}...")
                    return {"output": None, "error": f"JSON parsing failed: {e_json}", "usage": usage_data}
            else:
                return {"output": output_content, "usage": usage_data, "error": None}

        except openai.APIError as e:
            logger.error(f"{log_prefix} xAI API Error (direct call): {type(e).__name__} - {e}", exc_info=True)
            error_detail = str(e)
            if hasattr(e, 'status_code'):
                error_detail = f"Status {e.status_code}: {error_detail}"
            return {"output": None, "error": f"xAI API Error: {error_detail}", "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}}
        except Exception as e:
            logger.error(f"{log_prefix} Unexpected error in _call_xai_directly_async: {type(e).__name__} - {e}", exc_info=True)
            return {"output": None, "error": f"Unexpected error during direct xAI call: {str(e)}", "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}}

    def _resolve_placeholders(
        self,
        text_with_placeholders: str,
        data_points: List[Dict[str, Any]],
        max_depth: int = 5, 
        _current_depth: int = 0 
    ) -> str:
        if not text_with_placeholders or not data_points or '[' not in text_with_placeholders:
            return text_with_placeholders

        if _current_depth >= max_depth:
            logger.warning(f"[LLMReasoning:_resolve_placeholders] Max recursion depth ({max_depth}) reached. Returning text as is: '{text_with_placeholders}'")
            return text_with_placeholders 

        resolved_text = text_with_placeholders
        placeholder_pattern = re.compile(r"\[([\w-]+)(?:\.([\w-]+))?\]")
        dp_map = {dp.get("id"): dp for dp in data_points if dp.get("id")}
        made_a_change_in_this_pass = True 
        passes_for_this_depth = 0
        max_passes_per_depth = 10 

        while made_a_change_in_this_pass and passes_for_this_depth < max_passes_per_depth:
            made_a_change_in_this_pass = False
            passes_for_this_depth += 1
            current_text_before_pass = resolved_text
            matches = list(placeholder_pattern.finditer(resolved_text))
            if not matches: break

            for match in reversed(matches): 
                full_match_text = match.group(0)
                dp_id_to_lookup = match.group(1)
                attribute_name = match.group(2) if match.group(2) else "value" 
                replacement_value_str: Optional[str] = None
                
                if any(marker_prefix in dp_id_to_lookup for marker_prefix in ["UNRESOLVED_DP_ID_", "VALUE_IS_NONE_FOR_", "UNRESOLVED_ATTRIBUTE_"]):
                    continue

                if dp_id_to_lookup in dp_map:
                    dp_data = dp_map[dp_id_to_lookup]
                    raw_replacement_value = dp_data.get(attribute_name)

                    if raw_replacement_value is not None:
                        replacement_value_str = str(raw_replacement_value)
                        if '[' in replacement_value_str and ']' in replacement_value_str and replacement_value_str != full_match_text:
                            replacement_value_str = self._resolve_placeholders(
                                replacement_value_str, data_points, max_depth, _current_depth + 1
                            )
                    else: 
                        replacement_value_str = f"[VALUE_IS_NONE_FOR_{dp_id_to_lookup}.{attribute_name}]" 
                else: 
                    replacement_value_str = f"[UNRESOLVED_DP_ID_{dp_id_to_lookup}]" 
                
                if replacement_value_str is not None and replacement_value_str != full_match_text :
                    resolved_text = resolved_text[:match.start()] + replacement_value_str + resolved_text[match.end():]
                    made_a_change_in_this_pass = True
            
            if not made_a_change_in_this_pass and current_text_before_pass == resolved_text: break 
        
        if passes_for_this_depth >= max_passes_per_depth:
            logger.warning(f"[LLMReasoning:_resolve_placeholders] Max passes ({max_passes_per_depth}) reached at depth {_current_depth} for text: '{text_with_placeholders}'. Returning current state: '{resolved_text}'")

        if _current_depth == 0: 
            final_text = resolved_text
            final_text = re.sub(r"\[(UNRESOLVED_DP_ID_[\w-]+|VALUE_IS_NONE_FOR_[\w.-]+|UNRESOLVED_ATTRIBUTE_[\w-]+)\]", "[Information not found]", final_text)
            
            # This regex looks for [non-whitespace_without_brackets_or_dots] or [non-whitespace.non-whitespace]
            return final_text
                
        return resolved_text

    async def _execute_llm_call(
        self,
        request_type: str,
        prompt: str,
        model_info: Dict[str, Any],
        api_config: Dict[str, Any], 
        user_id_for_internal_call: Optional[str], 
        request_id: Optional[str] = None,
        expected_output_format: Literal["json", "text"] = "text",
        is_cancelled_flag: Optional[asyncio.Event] = None, 
    ) -> Dict[str, Any]:
        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"output": None, "error": "Operation cancelled.", "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}}

        if not prompt or not model_info:
            raise ValueError(f"Prompt and modelInfo are required for {request_type} step.")

        model_name_for_cache = model_info.get('external_model_id') or model_info.get('name', 'unknown_model')
        cache_key_parts = [
            request_type,
            prompt,
            model_name_for_cache,
            str(model_info.get("temperature", self.settings.LIVE_SEARCH_REASONING_DEFAULT_TEMP)),
            expected_output_format
        ]
        cache_key = "::".join(cache_key_parts)

        if cache_key in self.call_cache:
            return self.call_cache[cache_key]

        model_name = model_info.get('external_model_id') or model_info.get('name')
        if not model_name:
            raise ValueError(f"Could not determine model name/ID from modelInfo for {request_type}.")

        provider_name_raw = model_info.get('provider_name', '')
        provider_name = provider_name_raw.lower().strip() 
        log_prefix = f"[LLMReasoning:{request_id or 'N/A'}:{request_type}]"
        

        effective_provider_name = provider_name
        if provider_name == 'local':
            effective_provider_name = 'local_active_model_node_api'
        
        # Ensure user_id_for_internal_call is available if needed for local models
        # This check is now specific to the 'local_active_model_node_api' block

        common_llm_params = { 
            "temperature": model_info.get("temperature", self.settings.LIVE_SEARCH_REASONING_DEFAULT_TEMP),
        }
        
        # Define a minimum required token count for the completion, and a safety buffer
        MIN_COMPLETION_TOKENS = 1024
        SAFETY_BUFFER = 200
        
        try:
            if provider_name == 'local' and model_name not in litellm.model_cost:
                context_window = model_info.get("context_window", 8192) 
                
                model_registration_config = {
                    model_name: {
                        "max_input_tokens": context_window,
                        "max_output_tokens": context_window, 
                        "litellm_params": {
                            "model": model_name, 
                            "api_base": self.settings.LOCAL_LLM_API_BASE,
                            "custom_llm_provider": "openai"
                        }
                    }
                }
                
                litellm.register_model(model_registration_config)
                # logger.info(f"{log_prefix} Dynamically registered local model '{model_name}' with litellm. Context: {context_window}")

            model_max_context = litellm.get_max_tokens(model_name)
            if not model_max_context:
                model_max_context = model_info.get("context_window", 4096)

            max_prompt_tokens = model_max_context - MIN_COMPLETION_TOKENS - SAFETY_BUFFER

            messages_for_trimming = [{"role": "user", "content": prompt}]
            trimmed_messages = litellm.utils.trim_messages(
                messages=messages_for_trimming,
                model=model_name,
                max_tokens=max_prompt_tokens
            )
            prompt = trimmed_messages[0]["content"]

        except Exception as e_trim:
            logger.error(f"{log_prefix} Error during litellm.prompt_trimming: {e_trim}. Falling back to manual truncation.")
            model_max_context = model_info.get("context_window", 4096)
            prompt_tokens = self._count_tokens(prompt, model_info)
            if prompt_tokens >= (model_max_context - MIN_COMPLETION_TOKENS):
                max_prompt_chars = (model_max_context - MIN_COMPLETION_TOKENS - SAFETY_BUFFER) * 3
                prompt = prompt[:max_prompt_chars]

        max_retries = self.settings.LLM_CALL_MAX_RETRIES if hasattr(self.settings, 'LLM_CALL_MAX_RETRIES') and isinstance(self.settings.LLM_CALL_MAX_RETRIES, int) else 2
        base_delay = 1.0 

        if provider_name == 'xai':
            api_key = None
            api_base_url = None
            if isinstance(api_config, dict):
                api_key = api_config.get("llm_xAI_apiKey")
                api_base_url = api_config.get("llm_xAI_apiBase")

            if not api_key:
                return {"output": None, "error": "xAI API key not found in api_config.", "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}}
            if not api_base_url: 
                return {"output": None, "error": "xAI API base URL not found in api_config.", "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}}

            error_message_for_return_xai = "Max retries reached for direct xAI call."
            xai_result = None
            for attempt in range(max_retries + 1):
                if is_cancelled_flag and is_cancelled_flag.is_set():
                    error_message_for_return_xai = "Operation cancelled during xAI retry."
                    break
                
                xai_response_format_type = "json_object" if expected_output_format == "json" else "text"

                xai_result = await self._call_xai_directly_async(
                    model_name=model_name, 
                    messages=[{"role": "user", "content": prompt}],
                    api_key=api_key,
                    api_base=api_base_url,
                    temperature=common_llm_params["temperature"],
                    user_id=user_id_for_internal_call,
                    response_format_type=xai_response_format_type,
                    request_id=request_id,
                    is_cancelled_flag=is_cancelled_flag
                )
                if not xai_result.get("error"):
                    error_message_for_return_xai = None
                    break # Success
                else:
                    error_message_for_return_xai = xai_result.get("error", "Unknown error from direct xAI call.")
                    logger.warning(f"{log_prefix} Direct xAI call attempt {attempt + 1}/{max_retries + 1} failed: {error_message_for_return_xai}")
                    if attempt < max_retries:
                        delay = (base_delay * (2 ** attempt)) + random.uniform(0, 0.5)
                        await asyncio.sleep(delay)
                        continue
                    else: 
                        break 
            
            if error_message_for_return_xai:
                return {"output": None, "error": error_message_for_return_xai, "usage": xai_result.get("usage") if xai_result else {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}}
            
            if xai_result and not xai_result.get("error"):
                 self.call_cache[cache_key] = xai_result 
            return xai_result if xai_result else {"output": None, "error": "Direct xAI call returned unexpected None result.", "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}}

        elif effective_provider_name == 'local_active_model_node_api':
            if not user_id_for_internal_call:
                logger.error(f"{log_prefix} User ID not provided for internal Node.js API call (provider: {effective_provider_name}).")
                return {"output": None, "error": "User ID missing for internal API call.", "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}}

            internal_api_url = f"{self.settings.INTERNAL_NODE_API_BASE_URL.rstrip('/')}/{self.settings.INTERNAL_NODE_API_ENDPOINT_PATH.lstrip('/')}"
            headers = {"Content-Type": "application/json"}
            messages_payload = [{"role": "user", "content": prompt}]
            
            payload = {"messages": messages_payload, "stream": True, "user_id": user_id_for_internal_call, **common_llm_params}

            payload = {k: v for k, v in payload.items() if v is not None}

            accumulated_content = ""
            final_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
            error_message_for_return = "Max retries reached for Node API call."

            if not user_id_for_internal_call: 
                logger.error(f"{log_prefix} User ID not provided for internal Node.js API call (provider: {effective_provider_name}).")
                return {"output": None, "error": "User ID missing for internal API call.", "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}}

            for attempt in range(max_retries + 1):
                if is_cancelled_flag and is_cancelled_flag.is_set():
                    error_message_for_return = "Operation cancelled during retry."
                    break
                current_accumulated_content = ""
                current_final_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
                
                # logger.info(f"{log_prefix} (Attempt {attempt+1}/{max_retries+1}) Starting Node API request to: {internal_api_url}")
                # logger.info(f"{log_prefix} Payload keys: {list(payload.keys())}, user_id: {payload.get('user_id')}")
                
                try:
                    # Use longer timeouts and separate connect/read timeouts
                    timeout = aiohttp.ClientTimeout(
                        total=300,  # 5 minutes total
                        connect=30,  # 30 seconds to connect
                        sock_read=60  # 60 seconds between reads
                    )
                    
                    async with aiohttp.ClientSession(timeout=timeout) as session:
                        # logger.info(f"{log_prefix} Session created, making POST request...")
                        
                        async with session.post(internal_api_url, json=payload, headers=headers) as response:
                            # logger.info(f"{log_prefix} Response received with status: {response.status}")
                            # logger.info(f"{log_prefix} Response headers: {dict(response.headers)}")
                            
                            if response.status != 200:
                                error_text = await response.text()
                                logger.error(f"{log_prefix} Node API Error {response.status} (Attempt {attempt+1}/{max_retries+1}): {error_text}")
                                if response.status in [500, 502, 503, 504] and attempt < max_retries:
                                    delay = (base_delay * (2 ** attempt)) + random.uniform(0, 0.5)
                                    await asyncio.sleep(delay)
                                    continue
                                else:
                                    error_message_for_return = f"Internal Node API Error {response.status}: {error_text}"
                                    break

                            # logger.info(f"{log_prefix} Starting to read SSE stream...")
                            
                            # Use a more robust approach for SSE stream handling
                            buffer = ""
                            chunk_count = 0
                            content_tokens_received = 0
                            
                            try:
                                async for chunk_bytes in response.content.iter_chunked(8192):
                                    chunk_count += 1
                                    
                                    if is_cancelled_flag and is_cancelled_flag.is_set():
                                        logger.warning(f"{log_prefix} Operation cancelled during stream at chunk {chunk_count}")
                                        error_message_for_return = "Operation cancelled during stream."
                                        raise asyncio.CancelledError("Node API stream cancelled")
                                    
                                    # Decode and add to buffer
                                    chunk_str = chunk_bytes.decode('utf-8', errors='ignore')
                                    buffer += chunk_str
                                    
                                    # if chunk_count <= 5 or chunk_count % 50 == 0:
                                    #     logger.debug(f"{log_prefix} Chunk {chunk_count}: received {len(chunk_bytes)} bytes, buffer size: {len(buffer)}")
                                    
                                    # Process complete lines from buffer
                                    lines_processed = 0
                                    while '\n' in buffer:
                                        line, buffer = buffer.split('\n', 1)
                                        line = line.strip()
                                        lines_processed += 1
                                        
                                        if not line:
                                            continue
                                            
                                        if line.startswith('data: '):
                                            data_json_str = line[len('data: '):].strip()
                                            if not data_json_str: 
                                                continue
                                            if data_json_str == '[DONE]': 
                                                logger.info(f"{log_prefix} Received [DONE] signal, ending stream")
                                                break
                                            try:
                                                chunk_data = json.loads(data_json_str)
                                                if chunk_data.get("choices") and isinstance(chunk_data["choices"], list) and len(chunk_data["choices"]) > 0:
                                                    delta = chunk_data["choices"][0].get("delta", {})
                                                    content_token = delta.get("content")
                                                    if content_token: 
                                                        current_accumulated_content += content_token
                                                        content_tokens_received += 1
                                                        # if content_tokens_received <= 5 or content_tokens_received % 100 == 0:
                                                        #     logger.debug(f"{log_prefix} Content token {content_tokens_received}: '{content_token[:50]}...'")
                                                if chunk_data.get("usage"): 
                                                    current_final_usage.update(chunk_data["usage"])
                                                    # logger.info(f"{log_prefix} Received usage data: {chunk_data['usage']}")
                                            except json.JSONDecodeError as e:
                                                logger.warning(f"{log_prefix} Failed to parse JSON from SSE line: {data_json_str[:100]}... Error: {e}")
                                    
                                    # if lines_processed > 0 and (chunk_count <= 5 or chunk_count % 50 == 0):
                                    #     logger.debug(f"{log_prefix} Processed {lines_processed} lines from chunk {chunk_count}")
                                        
                                # logger.info(f"{log_prefix} Stream completed. Total chunks: {chunk_count}, content tokens: {content_tokens_received}, total content length: {len(current_accumulated_content)}")
                                
                            except asyncio.TimeoutError as e_timeout:
                                logger.error(f"{log_prefix} Timeout during stream reading after {chunk_count} chunks. Error: {e_timeout}")
                                raise
                            except Exception as e_stream:
                                logger.error(f"{log_prefix} Error during stream reading at chunk {chunk_count}: {type(e_stream).__name__}: {e_stream}")
                                raise
                            
                            if error_message_for_return == "Operation cancelled during stream.": 
                                break 

                            accumulated_content = current_accumulated_content
                            final_usage = current_final_usage
                            error_message_for_return = None 
                            # logger.info(f"{log_prefix} Successfully completed Node API call. Content length: {len(accumulated_content)}, usage: {final_usage}")
                            break
                except asyncio.CancelledError:
                    error_message_for_return = "Operation cancelled."
                    break
                except (aiohttp.ClientError, asyncio.TimeoutError) as e_http:
                    logger.error(f"{log_prefix} (Attempt {attempt+1}/{max_retries+1}) HTTP/Timeout Error (Node API): {e_http}", exc_info=True)
                    error_message_for_return = f"HTTP/Timeout Error (Node API): {e_http}"
                    if attempt < max_retries:
                        delay = (base_delay * (2 ** attempt)) + random.uniform(0, 0.5)
                        await asyncio.sleep(delay); continue
                except Exception as e_node_call:
                    logger.error(f"{log_prefix} (Attempt {attempt+1}/{max_retries+1}) Unexpected error (Node API): {e_node_call}", exc_info=True)
                    error_message_for_return = f"Node.js API call failed: {e_node_call}"
                    if attempt < max_retries:
                        delay = (base_delay * (2 ** attempt)) + random.uniform(0, 0.5)
                        await asyncio.sleep(delay); continue

                if error_message_for_return and attempt == max_retries:
                    break
            
            if error_message_for_return and "cancelled" in error_message_for_return.lower(): 
                 return {"output": None, "error": error_message_for_return, "usage": final_usage}


            if error_message_for_return:
                return {"output": None, "error": error_message_for_return, "usage": final_usage}

            llm_response_content = accumulated_content
            if expected_output_format == "json":
                try:
                    # First, strip markdown fences if they exist
                    json_match = re.search(r"```(json)?\s*(\{.*\}|\[.*\])\s*```", llm_response_content, re.DOTALL)
                    if json_match:
                        llm_response_content = json_match.group(2)

                    # Aggressively find the first '{' or '[' and the last '}' or ']'
                    first_brace = llm_response_content.find('{')
                    first_bracket = llm_response_content.find('[')
                    
                    start_index = -1
                    if first_brace != -1 and (first_bracket == -1 or first_brace < first_bracket):
                        start_index = first_brace
                        end_char = '}'
                    elif first_bracket != -1:
                        start_index = first_bracket
                        end_char = ']'
                    
                    if start_index != -1:
                        last_end_char = llm_response_content.rfind(end_char)
                        if last_end_char > start_index:
                            cleaned_json_str = llm_response_content[start_index : last_end_char+1]
                        else:
                            raise json.JSONDecodeError("Mismatched JSON brackets/braces.", llm_response_content, 0)
                    else:
                        raise json.JSONDecodeError("No JSON object found.", llm_response_content, 0)

                    # Attempt to fix trailing commas, a common LLM error
                    cleaned_json_str = re.sub(r",\s*([\}\]])", r"\1", cleaned_json_str)
                    
                    parsed_json = json.loads(cleaned_json_str)
                    if not isinstance(parsed_json, (dict, list)): raise json.JSONDecodeError("Parsed JSON not dict/list", cleaned_json_str,0)
                    llm_response_content = parsed_json
                except json.JSONDecodeError as e_json:
                    logger.error(f"{log_prefix} Failed to parse JSON from Node API. Error: {e_json}. Resp: '{llm_response_content}'")
                    return {"output": {}, "error": "Failed to parse JSON from Node.js API response after retry.", "usage": final_usage}
            
            if final_usage.get("completion_tokens", 0) == 0 and isinstance(llm_response_content, str) and final_usage.get("prompt_tokens", 0) > 0:
                final_usage["completion_tokens"] = len(llm_response_content.split())
                final_usage["total_tokens"] = final_usage.get("prompt_tokens",0) + final_usage["completion_tokens"]

            result_to_return = {"output": llm_response_content, "usage": final_usage, "error": None}
            if not result_to_return.get("error"):
                self.call_cache[cache_key] = result_to_return
            return result_to_return

            if final_usage.get("completion_tokens", 0) == 0 and isinstance(llm_response_content, str) and final_usage.get("prompt_tokens", 0) > 0:
                final_usage["completion_tokens"] = len(llm_response_content.split())
                final_usage["total_tokens"] = final_usage.get("prompt_tokens",0) + final_usage["completion_tokens"]

            result_to_return = {"output": llm_response_content, "usage": final_usage, "error": None}
            if not result_to_return.get("error"):
                self.call_cache[cache_key] = result_to_return
            return result_to_return

        else:
            model_arg_for_litellm = model_name
            api_key = None
            api_base_url = None
            custom_llm_provider = None

            if provider_name == 'local': # This case is actually handled by local_active_model_node_api now, but keep for safety/future
                api_base_url = self.settings.LOCAL_LLM_API_BASE 
                custom_llm_provider = "openai" 
                if isinstance(api_config, dict): api_key = api_config.get("llm_local_apiKey")
            elif provider_name == 'google':
                if not model_name.startswith('gemini/'): model_arg_for_litellm = f"gemini/{model_name}"
                if isinstance(api_config, dict): api_key = api_config.get("llm_Google_apiKey")
            elif provider_name == 'mistral':
                if not model_name.startswith('mistral/'): model_arg_for_litellm = f"mistral/{model_name}"
                if isinstance(api_config, dict):
                    api_key = api_config.get("llm_Mistral_apiKey")
                    api_base_url = api_config.get("llm_Mistral_apiBase")
            elif provider_name: # Catches other non-xAI, non-local, non-google, non-mistral providers
                provider_name_cap = model_info.get('provider_name', '') 
                if provider_name_cap and isinstance(api_config, dict):
                    api_key = api_config.get(f"llm_{provider_name_cap}_apiKey")
                    api_base_url = api_config.get(f"llm_{provider_name_cap}_apiBase")
                    # LiteLLM usually infers provider from model string.
                    # If specific custom_llm_provider is needed for other providers, it can be set here.
                    # as example, if provider_name_cap is 'AzureOpenAI', custom_llm_provider = 'azure'.
                    # custom_llm_provider = provider_name_cap # Example, adjust if needed

            litellm_params = {"model": model_arg_for_litellm, "messages": [{"role": "user", "content": prompt}], **common_llm_params}
            
            if api_key:
                litellm_params["api_key"] = api_key
            if api_base_url: 
                litellm_params["api_base"] = api_base_url
            if custom_llm_provider: 
                litellm_params["custom_llm_provider"] = custom_llm_provider

            if expected_output_format == "json":
                # Apply JSON mode for OpenAI/GPT-like models.
                # Check custom_llm_provider first, then provider_name from model_info (already lowercased)
                resolved_provider_for_litellm = custom_llm_provider or provider_name 
                if resolved_provider_for_litellm == "openai" or \
                   (isinstance(model_arg_for_litellm, str) and "gpt-" in model_arg_for_litellm.lower()):
                    litellm_params["response_format"] = {"type": "json_object"}
            
            if "user" not in litellm_params and user_id_for_internal_call:
                litellm_params["user"] = str(user_id_for_internal_call)
            elif "user" not in litellm_params:
                litellm_params["user"] = f"deep_search_task_{request_id or 'unknown_task'}"

            final_litellm_params = {k: v for k, v in litellm_params.items() if v is not None}
            
            # Ensure api_key is correctly passed if it was set but then final_litellm_params didn't pick it up
            if "api_key" not in final_litellm_params and api_key is not None:
                 final_litellm_params["api_key"] = api_key
            # Remove api_key from params if it's None (some providers might error if api_key=None is passed)
            elif "api_key" in final_litellm_params and final_litellm_params["api_key"] is None:
                 del final_litellm_params["api_key"]

            llm_response_content_litellm: Optional[Union[str, Dict]] = None
            response_obj_litellm = None
            error_message_for_return_litellm = "Max retries reached for LiteLLM call."
            base_delay_litellm = 1.0

            for attempt in range(max_retries + 1):
                if is_cancelled_flag and is_cancelled_flag.is_set():
                    error_message_for_return_litellm = "Operation cancelled during retry."
                    break
                response_obj_litellm = None
                try:
                    call_start_time = asyncio.get_event_loop().time()
                    with contextlib.redirect_stdout(sys.stderr):
                        response_obj_litellm = await litellm.acompletion(**final_litellm_params)
                    call_duration = asyncio.get_event_loop().time() - call_start_time

                    raw_content = None
                    if response_obj_litellm and response_obj_litellm.choices and response_obj_litellm.choices[0].message:
                        raw_content = response_obj_litellm.choices[0].message.content
                    
                    # Specific check for Gemini-like finish_reason='length' but content is None
                    if raw_content is None and response_obj_litellm and response_obj_litellm.choices and response_obj_litellm.choices[0].finish_reason == 'length':
                        logger.error(f"{log_prefix} (LiteLLM) Attempt {attempt + 1}: LLM (likely Gemini) reported finish_reason='length' but returned no content. Model: {final_litellm_params.get('model')}")
                        error_message_for_return_litellm = "LLM finished due to length but returned no content."
                        break 

                    if not raw_content:
                        specific_empty_reason = "LLM raw_content is empty."
                        if error_message_for_return_litellm and "LLM finished due to length but returned no content" in error_message_for_return_litellm:
                             specific_empty_reason = error_message_for_return_litellm
                        
                        logger.warning(f"{log_prefix} (LiteLLM) Attempt {attempt + 1}: {specific_empty_reason}")
                        error_message_for_return_litellm = specific_empty_reason 
                        if attempt < max_retries:
                            delay = (base_delay_litellm * (2 ** attempt)) + random.uniform(0, 0.5)
                            await asyncio.sleep(delay)
                            continue
                        else:
                            break 

                    if expected_output_format == "json":
                        try:
                            # First, strip markdown fences if they exist
                            json_match = re.search(r"```(json)?\s*(\{.*\}|\[.*\])\s*```", raw_content, re.DOTALL)
                            if json_match:
                                raw_content = json_match.group(2)
                                
                            # Aggressively find the first '{' or '[' and the last '}' or ']'
                            first_brace = raw_content.find('{')
                            first_bracket = raw_content.find('[')
                            
                            start_index = -1
                            if first_brace != -1 and (first_bracket == -1 or first_brace < first_bracket):
                                start_index = first_brace
                                end_char = '}'
                            elif first_bracket != -1:
                                start_index = first_bracket
                                end_char = ']'
                            
                            if start_index != -1:
                                last_end_char = raw_content.rfind(end_char)
                                if last_end_char > start_index:
                                    cleaned_json_str = raw_content[start_index : last_end_char+1]
                                else:
                                    raise json.JSONDecodeError("Mismatched JSON brackets/braces.", raw_content, 0)
                            else:
                                raise json.JSONDecodeError("No JSON object found.", raw_content, 0)

                            # Attempt to fix trailing commas, a common LLM error
                            cleaned_json_str = re.sub(r",\s*([\}\]])", r"\1", cleaned_json_str)
                            
                            parsed_json = json.loads(cleaned_json_str)
                            if not isinstance(parsed_json, (dict, list)):
                                raise json.JSONDecodeError("Parsed JSON not dict/list", cleaned_json_str, 0)
                            
                            llm_response_content_litellm = parsed_json
                            error_message_for_return_litellm = None 
                            break 
                        except json.JSONDecodeError as e_json_main:
                            error_message_for_return_litellm = f"LLM output not valid JSON (initial parse): {e_json_main}"
                            logger.warning(f"{log_prefix} (LiteLLM) JSON parsing failed. Raw: '{raw_content[:500]}...'. Error: {e_json_main}.")
                            if attempt < max_retries:
                                delay = (base_delay_litellm * (2**attempt)) + random.uniform(0,0.5)
                                await asyncio.sleep(delay)
                                continue
                            else:
                                break
                    else: 
                        llm_response_content_litellm = raw_content
                        error_message_for_return_litellm = None 
                        break 

                except (litellm.exceptions.APIConnectionError, litellm.exceptions.Timeout, litellm.exceptions.ServiceUnavailableError, litellm.exceptions.APIError) as e_transient:
                    logger.warning(f"{log_prefix} (LiteLLM) Attempt {attempt + 1}/{max_retries + 1}: Transient Error ({type(e_transient).__name__}): {e_transient}", exc_info=True)
                    error_message_for_return_litellm = f"LLM Transient Error: {e_transient}"
                    if attempt < max_retries:
                        delay = (base_delay_litellm * (2 ** attempt)) + random.uniform(0, 0.5)
                        await asyncio.sleep(delay)
                        continue 
                except litellm.RateLimitError as e_rate_limit: 
                    logger.warning(f"{log_prefix} (LiteLLM) Attempt {attempt + 1}/{max_retries + 1}: Rate Limit Error: {e_rate_limit}", exc_info=False)
                    error_message_for_return_litellm = f"LLM Rate Limit Error: {e_rate_limit}"
                    if attempt < max_retries:
                        retry_after_seconds = base_delay_litellm * (2 ** attempt)
                        try:
                            if hasattr(e_rate_limit, 'response') and hasattr(e_rate_limit.response, 'headers'):
                                retry_after_header_val = e_rate_limit.response.headers.get("Retry-After")
                                if retry_after_header_val:
                                    parsed_retry_after = int(retry_after_header_val)
                                    retry_after_seconds = max(parsed_retry_after, retry_after_seconds)
                        except Exception: pass
                        await asyncio.sleep(retry_after_seconds + random.uniform(0, 0.5))
                        continue 
                except Exception as e_llm_call: 
                    logger.error(f"{log_prefix} (LiteLLM) Attempt {attempt + 1}/{max_retries + 1}: Unexpected Error: {e_llm_call}", exc_info=True)
                    error_message_for_return_litellm = f"LLM call failed: {e_llm_call}"
                    if attempt < max_retries:
                        delay = (base_delay_litellm * (2 ** attempt)) + random.uniform(0, 0.5)
                        await asyncio.sleep(delay)
                        continue 
                break 

            usage_data_litellm = getattr(response_obj_litellm, 'usage', None)
            prompt_tokens_litellm = getattr(usage_data_litellm, 'prompt_tokens', 0) if usage_data_litellm else 0
            completion_tokens_litellm = getattr(usage_data_litellm, 'completion_tokens', 0) if usage_data_litellm else 0
            total_tokens_litellm = getattr(usage_data_litellm, 'total_tokens', 0) if usage_data_litellm else (prompt_tokens_litellm + completion_tokens_litellm)

        if error_message_for_return_litellm or llm_response_content_litellm is None:
            final_error_message = error_message_for_return_litellm or "LLM response content empty/unparsable after all retries."
            logger.error(f"{log_prefix} (LiteLLM) Final failure after all retries. Error: {final_error_message}. Params used: {json.dumps(final_litellm_params, default=str)}")
            default_output = {} if expected_output_format == "json" else ""
            result_to_return = {"output": default_output, "usage": {"prompt_tokens": prompt_tokens_litellm, "completion_tokens": completion_tokens_litellm, "total_tokens": total_tokens_litellm}, "error": final_error_message}
        else:
            result_to_return = {"output": llm_response_content_litellm, "usage": {"prompt_tokens": prompt_tokens_litellm, "completion_tokens": completion_tokens_litellm, "total_tokens": total_tokens_litellm}}

        if not result_to_return.get("error"):
            self.call_cache[cache_key] = result_to_return
        return result_to_return

    async def extract_research_plan(
        self,
        original_query: str,
        model_info: Dict[str, Any],
        api_config: Dict[str, Any],
        user_id: Optional[str], 
        request_id: Optional[str] = None,
        existing_sources_summary: Optional[str] = None,
        task_date_context: Optional[str] = None,
        is_cancelled_flag: Optional[asyncio.Event] = None 
    ) -> Dict[str, Any]:
        """
        Uses the "Research Extractor" prompt to break down the user's query into
        required data points and plan retrieval strategies.
        """
        sources_instruction = ""
        if existing_sources_summary:
            sources_instruction = f"""
You have access to the following existing source information. Try to extract answers from this first:
---
{existing_sources_summary[:2000]}
---
"""
        else:
            sources_instruction = "No initial sources provided. All data points will likely need retrieval planning."

        date_context_instruction = ""
        if task_date_context:
            date_context_instruction = f"""
IMPORTANT TEMPORAL CONTEXT: All research and information gathering should be performed as if the current date is within or relevant to: {task_date_context}.
This means terms like "current," "recent," or "now" in your generated queries and analysis should refer to this specific timeframe.
For example, if the context is "the year 2010," a query for "current smartphone technology" should seek information about smartphone technology as it was in 2010.
"""

        prompt = f"""CRITICAL: Your output MUST be a single, valid JSON object and nothing else. Do not add any explanatory text before or after the JSON.

You are an investigative reporter specializing in discovering hidden links and meticulously planning research. Your job is to take the user’s question and generate a comprehensive research plan.
{date_context_instruction}
User's Question: "{original_query}"

{sources_instruction}

Follow these steps to construct your JSON output:

1.  **List Required Data Points:**
    *   Break the question into a numbered list of every atomic piece of information you’ll need to answer it.
    *   **Pay special attention to identifying and listing distinct:**
        *   **Entities:** People, organizations, products, concepts, etc. (e.g., "Mayor of Austin", "Kirk Watson's birth city").
        *   **Event Dates & Timeframes:** Specific dates, years, ranges (e.g., "1990s", "2000s", "Jan 6, 1995").
        *   **Locations:** Cities, countries, specific places (e.g., "Austin, Texas", "[Birth City]").
        *   **Numeric Values & Metrics:** Quantities, populations, financial figures, version numbers, etc. (e.g., "2000 census population", "version 2.0").
        *   **Constraints & Conditions:** Any specific limitations or conditions mentioned in the query (e.g., "only 21st-century mayor", "also served in 1990s").
        *   **Calculations or Transformations:** Steps like rounding, summing, comparing (e.g., "Round population to nearest thousand").
    *   For each item:
        *   Give it a unique, descriptive 'id' (e.g., "dp1_mayor_name", "dp2_birth_city").
        *   Provide a 'name' (e.g., "Name of 21st-century Austin mayor also serving in 1990s").
        *   Assign a 'confidence' score (0.0-1.0) based on how clearly this data point is defined by the question and how likely it is to be retrievable.
    *   Identify 'dependent_data_point_ids' if a data point relies on the value of another.

2.  **Extract or Plan Retrieval & Verification:**
    *   For each data point, determine its 'status', 'retrieval_action', and optionally a 'preferred_provider_type':
      a) **From Source:** If directly extractable from 'Provided Sources', set 'status': "EXTRACTED_FROM_SOURCE", provide 'value', 'source_citation', and 'preferred_provider_type': "none".
      b) **LLM Knowledge (Needs Verification):** If it's a specific, knowable fact the LLM might know, set 'status': "PROPOSED_FROM_LLM_KNOWLEDGE", 'retrieval_action': "ASK_LLM: [Precise question, e.g., 'What is the birth city of Kirk Watson?']", 'preferred_provider_type': "none". **Crucially, you MUST then create a subsequent, separate data point with 'status': "NEEDS_VERIFICATION_WEB" for this proposed fact, its 'retrieval_action' should be a precise web query designed to verify the LLM's proposed answer (e.g., "Birth city of [previous_dp.value] [proposed_answer_from_ASK_LLM]"), and suggest an appropriate 'preferred_provider_type' (e.g., "encyclopedia" or "general_web"). Do NOT use 'ASK_LLM' for tasks that require analyzing external documents or summarizing unknown concepts; these should start with a 'NEEDS_RETRIEVAL_WEB' step.**
      c) **Entity Overview (Needs Attribute Extraction & Verification):** If it requires broader info about a core entity's attributes, set 'status': "NEEDS_RETRIEVAL_ENTITY_OVERVIEW", identify 'core_entity_for_overview', list 'attributes_for_overview'. 'retrieval_action' can be a general query for the entity, and 'preferred_provider_type' would likely be "general_web" or "encyclopedia". Subsequent data points will be needed to extract and verify each attribute.
      d) **Direct Web Search:** If it requires a general web search, set 'status': "NEEDS_RETRIEVAL_WEB", 'retrieval_action': "[Precise web search query]", and suggest a 'preferred_provider_type' (e.g., "movie_database", "financial_data_source", "news_archive", "scientific_journal_database", or "general_web"). **If the query seems too broad, refine it or suggest a more precise rephrasing directly within the 'retrieval_action' string.**
      e) **Internal Calculation:** If it's a calculation, set 'status': "NEEDS_CALCULATION", 'retrieval_action': "NO_SEARCH_NEEDED", 'preferred_provider_type': "none".
      f) **Missing:** If unanswerable/too ambiguous, set 'status': "MISSING", 'retrieval_action': "NONE", 'preferred_provider_type': "none".
    *   **Preferred Provider Types:** Use one of: "encyclopedia", "movie_database", "financial_data_source", "scientific_journal_database", "news_archive", "general_web", "none".

3.  **Overall Strategy Assessment:**
    *   Include 'overall_query_strategy': "fact_centric" or "general_research".
    *   If "fact_centric", include 'overall_core_entity' and 'overall_target_attributes'.

4.  **Identify Hidden Links/Implications (Optional):**
    *   Include a 'potential_hidden_links' list: ["string describing potential non-obvious connection or implication", ...]. This is for connections *between* the identified data points or their broader context.

5.  **Construct Timeline (Optional):**
    *   If multiple dates/events are involved, include a 'chronological_timeline' list: [{{{{ "date_or_event": "string", "description": "string" }}}} , ...].

Output ONLY a single JSON object with the following structure:
{{{{
  "overall_query_strategy": "string",
  "overall_core_entity": "string_or_null",
  "overall_target_attributes": ["list_of_strings_or_empty"],
  "required_data_points": [
    {{{{
      "id": "string", "name": "string", "confidence": float, "status": "string",
      "retrieval_action": "string", "preferred_provider_type": "string_or_null",
      "core_entity_for_overview": "string_or_null", "attributes_for_overview": [],
      "dependent_data_point_ids": [], "value": "any_or_null", "source_citation": "string_or_null"
    }}}}
  ],
  "potential_hidden_links": ["list_of_strings_or_empty"],
  "chronological_timeline": ["list_of_objects_or_empty"]
}}}}

Example for "2000 population of the birth city of the only 21st-century mayor of Austin, Texas who also served as mayor in the 1990s? Round to nearest thousand.":
{{{{
  "overall_query_strategy": "fact_centric",
  "overall_core_entity": "Relevant Austin Mayor",
  "overall_target_attributes": ["birth city", "2000 population of birth city", "rounded population"],
  "required_data_points": [
    {{"id": "dp1_mayor", "name": "Identify Austin mayor (21st century and 1990s)", "confidence": 0.9, "status": "NEEDS_RETRIEVAL_WEB", "retrieval_action": "Austin mayor served 1990s and 2000s", "preferred_provider_type": "encyclopedia", "core_entity_for_overview": null, "attributes_for_overview": [], "dependent_data_point_ids": [], "value": null, "source_citation": null}},
    {{"id": "dp2_birth_city_ask", "name": "Birth city of [dp1_mayor.value] - LLM Proposal", "confidence": 0.7, "status": "PROPOSED_FROM_LLM_KNOWLEDGE", "retrieval_action": "ASK_LLM: What is the birth city of [dp1_mayor.value]?", "preferred_provider_type": "none", "core_entity_for_overview": null, "attributes_for_overview": [], "dependent_data_point_ids": ["dp1_mayor"], "value": null, "source_citation": null}},
    {{"id": "dp2_birth_city_verify", "name": "Verify birth city of [dp1_mayor.value]", "confidence": 0.9, "status": "NEEDS_VERIFICATION_WEB", "retrieval_action": "Birth city of [dp1_mayor.value] [dp2_birth_city_ask.value]", "preferred_provider_type": "encyclopedia", "core_entity_for_overview": null, "attributes_for_overview": [], "dependent_data_point_ids": ["dp1_mayor", "dp2_birth_city_ask"], "value": null, "source_citation": null}},
    {{"id": "dp3_population_ask", "name": "2000 census population of [dp2_birth_city_verify.value] - LLM Proposal", "confidence": 0.6, "status": "PROPOSED_FROM_LLM_KNOWLEDGE", "retrieval_action": "ASK_LLM: What was the 2000 census population of [dp2_birth_city_verify.value]?", "preferred_provider_type": "none", "core_entity_for_overview": null, "attributes_for_overview": [], "dependent_data_point_ids": ["dp2_birth_city_verify"], "value": null, "source_citation": null}},
    {{"id": "dp3_population_verify", "name": "Verify 2000 census population of [dp2_birth_city_verify.value]", "confidence": 0.9, "status": "NEEDS_VERIFICATION_WEB", "retrieval_action": "2000 census population [dp2_birth_city_verify.value] [dp3_population_ask.value]", "preferred_provider_type": "general_web", "core_entity_for_overview": null, "attributes_for_overview": [], "dependent_data_point_ids": ["dp2_birth_city_verify", "dp3_population_ask"], "value": null, "source_citation": null}},
    {{"id": "dp4_rounded_population", "name": "Round [dp3_population_verify.value] to nearest thousand", "confidence": 1.0, "status": "NEEDS_CALCULATION", "retrieval_action": "NO_SEARCH_NEEDED", "preferred_provider_type": "none", "core_entity_for_overview": null, "attributes_for_overview": [], "dependent_data_point_ids": ["dp3_population_verify"], "value": null, "source_citation": null}},
    {{"id": "country", "name": "Country of the user", "confidence": 1.0, "status": "PROVIDED_BY_SYSTEM", "retrieval_action": "NONE", "preferred_provider_type": "none", "core_entity_for_overview": null, "attributes_for_overview": [], "dependent_data_point_ids": [], "value": "United States", "source_citation": "System Information"}}
  ],
  "potential_hidden_links": ["The mayor's birth city population might have influenced their policies towards Austin."],
  "chronological_timeline": []
}}}}

CRITICAL REMINDER: Your entire response must be ONLY the JSON object described above. Do not include any other text, markdown, or explanations.
"""
        plan_model_info = model_info.copy()
        plan_model_info["temperature"] = model_info.get("temperature_for_planning", 0.1)


        result = await self._execute_llm_call(
            request_type="extract_research_plan",
            prompt=prompt,
            model_info=plan_model_info,
            api_config=api_config,
            user_id_for_internal_call=user_id, 
            request_id=request_id,
            expected_output_format="json",
            is_cancelled_flag=is_cancelled_flag 
        )
        
        if is_cancelled_flag and is_cancelled_flag.is_set(): 
            return {"error": "Operation cancelled during research plan extraction."}

        output_data = result.get("output")
        usage_data = result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0})
        error_data = result.get("error")

        default_error_return = {
            "required_data_points": [],
            "overall_query_strategy": "general_research",
            "usage": usage_data,
            "error": "Failed to generate research plan."
        }

        if error_data:
            logger.error(f"[LLMReasoning:{request_id}] Error in _execute_llm_call for extract_research_plan: {error_data}")
            default_error_return["error"] = error_data
            return default_error_return

        # Replace the validation section with this:
        if isinstance(output_data, dict):
            required_data_points = output_data.get("required_data_points")
            
            if isinstance(required_data_points, list):
                return {
                    "required_data_points": required_data_points,
                    "overall_query_strategy": output_data.get("overall_query_strategy", "general_research"),
                    "overall_core_entity": output_data.get("overall_core_entity"),
                    "overall_target_attributes": output_data.get("overall_target_attributes", []),
                    "potential_hidden_links": output_data.get("potential_hidden_links", []),
                    "chronological_timeline": output_data.get("chronological_timeline", []),
                    "usage": usage_data,
                    "error": None
                }
            else:
                logger.error(f"[LLMReasoning:{request_id}] required_data_points validation failed. Type: {type(required_data_points)}, Value: {str(required_data_points)[:500]}...") # Log part of the value
                default_error_return["error"] = f"required_data_points validation failed. Type: {type(required_data_points)}"
                return default_error_return
        else:
            logger.error(f"[LLMReasoning:{request_id}] output_data validation failed. Type: {type(output_data)}, Value: {str(output_data)[:500]}...") # Log part of the value
            default_error_return["error"] = f"output_data validation failed. Type: {type(output_data)}"
            return default_error_return

    async def decompose_initial_query(
        self,
        original_query: str,
        model_info: Dict[str, Any],
        api_config: Dict[str, Any],
        user_id: Optional[str], 
        request_id: Optional[str] = None,
        document_context_summary: Optional[str] = None,
        is_document_focused_query: bool = False,
        task_date_context: Optional[str] = None,
        is_cancelled_flag: Optional[asyncio.Event] = None 
    ) -> Dict[str, Any]:

        plan_result = await self.extract_research_plan(
            original_query=original_query,
            model_info=model_info,
            api_config=api_config,
            user_id=user_id, 
            request_id=request_id,
            existing_sources_summary=document_context_summary,
            task_date_context=task_date_context,
            is_cancelled_flag=is_cancelled_flag 
        )

        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"error": "Operation cancelled during initial query decomposition."}

        if plan_result.get("error"):
            logger.warning(f"[LLMReasoning:{request_id}] extract_research_plan failed, falling back to simpler decompose. Error: {plan_result.get('error')}")
            return {
                "table_of_contents": [original_query],
                "seed_queries": [original_query],
                "query_strategy": "general_research",
                "core_entity": None,
                "target_attributes": [],
                "usage": plan_result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}),
                "error": f"extract_research_plan failed: {plan_result.get('error')}, used basic fallback."
            }

        full_plan_output_for_research_flow = {
            "required_data_points": plan_result.get("required_data_points", []),
            "potential_hidden_links": plan_result.get("potential_hidden_links", []),
            "chronological_timeline": plan_result.get("chronological_timeline", []),
            "overall_query_strategy": plan_result.get("overall_query_strategy", "general_research"),
            "overall_core_entity": plan_result.get("overall_core_entity"),
            "overall_target_attributes": plan_result.get("overall_target_attributes", [])
        }

        table_of_contents = [dp.get("name", "Unnamed Data Point") for dp in plan_result.get("required_data_points", [])]
        seed_queries = [dp.get("retrieval_action", "NO_SEARCH_NEEDED") for dp in plan_result.get("required_data_points", [])]


        return {
            "table_of_contents": table_of_contents,
            "seed_queries": seed_queries,
            "usage": plan_result.get("usage"),
            "error": None,
            "full_plan_output": full_plan_output_for_research_flow
        }


    async def perform_librarian_check(
        self,
        reasoning_steps_to_cover: List[str],
        retrieved_chunks_text: List[str],
        model_info: Dict[str, Any],
        api_config: Dict[str, Any],
        user_id: Optional[str], 
        request_id: Optional[str] = None,
        extracted_structures_summary: Optional[str] = None,
        proposed_fact_to_verify: Optional[Tuple[str, str]] = None,
        query_phrase_being_verified: Optional[str] = None, 
        task_date_context: Optional[str] = None,
        is_cancelled_flag: Optional[asyncio.Event] = None 
    ) -> Dict[str, Any]:
        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {
                "analysis": models.LibrarianAnalysisResult(
                    covered_reasoning_steps=[], 
                    key_information_for_covered_steps={},
                    newly_identified_keywords_or_entities=[], 
                    suggested_new_sub_queries=[], 
                    remaining_gaps_summary="Operation cancelled.",
                    verification_outcome="NOT_APPLICABLE"
                ),
                "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
                "error": "Operation cancelled."
            }
        formatted_chunks = "\n\n".join([f"--- Chunk {idx+1} ---\n{text[:1500]}" for idx, text in enumerate(retrieved_chunks_text[:10])])
        if len(formatted_chunks) > 20000:
            formatted_chunks = formatted_chunks[:20000] + "\n...[TRUNCATED]..."
        formatted_reasoning_steps = "\n".join([f"- {step}" for step in reasoning_steps_to_cover])

        structure_info_section = ""
        if extracted_structures_summary:
            structure_info_section = f"""
Additionally, the following key entities and relationships have been extracted from the full content of these chunks:
---
{extracted_structures_summary[:1000]}
---
"""
        verification_instruction = ""
        verification_outcome_instruction = ""
        if proposed_fact_to_verify:
            original_question, proposed_answer = proposed_fact_to_verify
            verification_instruction = f"""
VERIFICATION TASK: The current information was retrieved to verify a previously proposed answer.
Original Question/Topic for this fact: "{original_question}"
Proposed Answer that needs verification: "{proposed_answer}"
Based on the 'Retrieved Content', does it CONFIRM, CONTRADICT, or is it INCONCLUSIVE regarding the 'Proposed Answer'?
If CONFIRMED, what is the confirmed answer/value based *only* on the provided content? This confirmed answer/value is critical.
"""
            verification_outcome_instruction = """- "verification_outcome": "CONFIRMED | CONTRADICTED | INCONCLUSIVE | NOT_APPLICABLE" (must be one of these exact strings, based on the VERIFICATION TASK if provided, otherwise "NOT_APPLICABLE")
- "confirmed_value": "string_or_null" (If verification_outcome is "CONFIRMED", provide the specific confirmed answer/value from the text. This is crucial. Otherwise, null.)"""

        date_context_instruction_librarian = ""
        if task_date_context:
            date_context_instruction_librarian = f"""
IMPORTANT TEMPORAL CONTEXT: This analysis is part of research focused on the timeframe: {task_date_context}.
Interpret the relevance and coverage of information accordingly.
"""

        librarian_model_info = model_info.copy()

        prompt = f"""You are an Analyst reviewing research findings. Your task is to assess a collection of text chunks and extracted structural information against a set of research objectives (reasoning steps).
{date_context_instruction_librarian}
{verification_instruction}
Research Objectives (Reasoning Steps):
{formatted_reasoning_steps}

Retrieved Content (mixture of full text excerpts and concise summaries of related content):
{formatted_chunks}
{structure_info_section}
Based on the provided Content AND any accompanying Extracted Entities/Relationships, perform the following:
1.  Identify which of the Research Objectives are now substantially covered by the information in these chunks. If performing a VERIFICATION TASK, your assessment of coverage for the related objective should reflect the verification outcome.
2.  Extract **up to 5-7** new, highly relevant keywords, named entities (people, organizations, locations, specific technologies), or distinct facets mentioned in the chunks that were NOT explicitly part of the original Research Objectives but seem important for a comprehensive understanding.
3.  If there are still significant gaps in covering the Research Objectives (or if verification was inconclusive/contradictory), **very briefly (1-2 sentences)** suggest what kind of information is still missing or what the contradiction implies. This should be detailed in 'remaining_gaps_summary'.

Output your findings as a JSON object with the following keys. ALL string values, especially those within lists, MUST be enclosed in double quotes. Any double quotes that are part of the string content itself MUST be escaped with a backslash (e.g., "a string with \\"internal quotes\\" like this").
CRITICAL: Do not use string concatenation operators like '+' inside the JSON values. All values must be complete, valid JSON strings.
- "covered_reasoning_steps": [list of strings, where each string is the NAME of a research objective now considered covered].
- "key_information_for_covered_steps": {{{{object, where each key is a string (the name of a covered reasoning step from the list above) and its value is a string containing the concise extracted information/answer for that step. Be very concise with the extracted information. If a step is covered but no single concise piece of info can be extracted, you can omit it from this dictionary or use a brief note like "Details confirmed in source."}}}}.
- "newly_identified_keywords_or_entities": [list of strings, **limit to 5-7 most important, be concise**]
- "suggested_new_sub_queries": [list of strings, **limit to 2-3 most impactful, be concise**]
- "remaining_gaps_summary": "string, **keep this summary to 1-2 sentences.**" (If VERIFICATION TASK, start this summary with CONFIRMED:, CONTRADICTED:, or INCONCLUSIVE: followed by your reasoning.)
- "verification_outcome": "CONFIRMED | CONTRADICTED | INCONCLUSIVE | NOT_APPLICABLE" (CRITICAL: This field MUST contain ONLY one of these four exact uppercase strings and NOTHING ELSE. For example, if confirmed, the value should be EXACTLY "CONFIRMED", not "CONFIRMED: some text".)
- "verification_outcome_reasoning": "string_or_null" (If the 'verification_outcome' string from the LLM initially included explanatory text after the keyword, place that explanatory text here. E.g., if LLM returned 'CONFIRMED: The data supports this.', this field would be 'The data supports this.' while 'verification_outcome' would be 'CONFIRMED'. Null if no extra text.)
- "confirmed_value": "string_or_null" (If verification_outcome is "CONFIRMED", provide the specific confirmed answer/value from the text. This is crucial. Otherwise, null.)

Example of a valid list of strings in JSON:
["simple string", "string with \\"escaped quotes\\"", "another item"]

Example Output (ensure lists are populated appropriately, or empty if nothing applies, and all strings adhere to JSON string rules):
{{{{
  "covered_reasoning_steps": [
    "current state of solar power technology",
    "advancements in wind turbine efficiency"
  ],
  "key_information_for_covered_steps": {{
    "current state of solar power technology": "Solar panel efficiency has reached 22% in commercial products, with perovskite cells showing promise for higher rates.",
    "advancements in wind turbine efficiency": "New blade designs and larger turbines have increased capacity factors to over 50% in optimal offshore locations."
  }},
  "newly_identified_keywords_or_entities": ["Perovskite solar cells", "Grid inertia", "Floating wind farms"],
  "suggested_new_sub_queries": ["detailed economic analysis of Perovskite solar cells", "impact of floating wind farms on marine ecosystems"],
  "remaining_gaps_summary": "Information on geothermal energy's economic viability and specific policy impacts on renewable energy adoption is still sparse.",
  "verification_outcome": "NOT_APPLICABLE",
  "verification_outcome_reasoning": null,
  "confirmed_value": null,
  "verified_query_phrase_if_any": null
}}}}

Provide your analysis for the given objectives and chunks. Ensure the entire output is a single, valid JSON object and all string elements within arrays are proper JSON strings (double-quoted, with internal double quotes escaped).
If this is a VERIFICATION TASK, ensure "verified_query_phrase_if_any" is populated with the query that was used to retrieve the content for verification.
"""
        result = await self._execute_llm_call(
            request_type="librarian_check",
            prompt=prompt,
            model_info=librarian_model_info, 
            api_config=api_config,
            user_id_for_internal_call=user_id, 
            request_id=request_id,
            expected_output_format="json",
            is_cancelled_flag=is_cancelled_flag 
        )

        if is_cancelled_flag and is_cancelled_flag.is_set(): 
             return { "error": "Operation cancelled during librarian check." }


        if result.get("error"):
            logger.error(f"[LLMReasoning:{request_id}] Error in _execute_llm_call for perform_librarian_check: {result['error']}")
            return {
                "analysis": models.LibrarianAnalysisResult(
                    covered_reasoning_steps=[],
                    newly_identified_keywords_or_entities=[],
                    suggested_new_sub_queries=[],
                    remaining_gaps_summary="Error during analysis.",
                    verification_outcome="NOT_APPLICABLE"
                ),
                "usage": result["usage"],
                "error": result["error"]
            }
        try:
            llm_output_dict = result["output"]
            if not isinstance(llm_output_dict, dict): 
                logger.error(f"[LLMReasoning:{request_id}] LLM output for librarian check was not a dictionary. Output: {llm_output_dict}")
                raise ValueError("LLM output for librarian check was not a dictionary.")

            # Robust parsing for verification_outcome and new verification_reasoning
            raw_verification_outcome = llm_output_dict.get("verification_outcome", "NOT_APPLICABLE")
            parsed_verification_outcome = "NOT_APPLICABLE"
            verification_reasoning_text = llm_output_dict.get("verification_outcome_reasoning") 

            if isinstance(raw_verification_outcome, str):
                if raw_verification_outcome.startswith("CONFIRMED"):
                    parsed_verification_outcome = "CONFIRMED"
                    if not verification_reasoning_text and ":" in raw_verification_outcome: 
                        verification_reasoning_text = raw_verification_outcome.split(":", 1)[1].strip()
                elif raw_verification_outcome.startswith("CONTRADICTED"):
                    parsed_verification_outcome = "CONTRADICTED"
                    if not verification_reasoning_text and ":" in raw_verification_outcome:
                        verification_reasoning_text = raw_verification_outcome.split(":", 1)[1].strip()
                elif raw_verification_outcome.startswith("INCONCLUSIVE"):
                    parsed_verification_outcome = "INCONCLUSIVE"
                    if not verification_reasoning_text and ":" in raw_verification_outcome:
                        verification_reasoning_text = raw_verification_outcome.split(":", 1)[1].strip()
                elif raw_verification_outcome == "NOT_APPLICABLE":
                     parsed_verification_outcome = "NOT_APPLICABLE"
                
            llm_output_dict["verification_outcome"] = parsed_verification_outcome
            llm_output_dict["verification_reasoning"] = verification_reasoning_text if verification_reasoning_text else None


            if "confirmed_value" not in llm_output_dict: 
                llm_output_dict["confirmed_value"] = None
            if "covered_reasoning_steps" not in llm_output_dict or not isinstance(llm_output_dict["covered_reasoning_steps"], list):
                llm_output_dict["covered_reasoning_steps"] = [] 
            if "key_information_for_covered_steps" not in llm_output_dict or not isinstance(llm_output_dict["key_information_for_covered_steps"], dict):
                llm_output_dict["key_information_for_covered_steps"] = {} 

            if llm_output_dict["verification_outcome"] == "CONFIRMED" and not llm_output_dict.get("confirmed_value"):
                # If outcome is confirmed but LLM didn't provide a specific value,
                # we can note that it was confirmed by source, but the exact value wasn't extracted by the LLM in this step.
                # The 'remaining_gaps_summary' might also reflect this if the LLM was instructed to.
                # For now, if confirmed_value is None, it stays None. The Pydantic model allows it.
                pass # llm_output_dict["confirmed_value"] = "Confirmed by source (specific value not extracted by LLM)."


            if proposed_fact_to_verify and query_phrase_being_verified and llm_output_dict["verification_outcome"] != "NOT_APPLICABLE":
                llm_output_dict["verified_query_phrase_if_any"] = query_phrase_being_verified
            elif "verified_query_phrase_if_any" not in llm_output_dict: 
                 llm_output_dict["verified_query_phrase_if_any"] = None

            analysis_data = models.LibrarianAnalysisResult(**llm_output_dict)
            return {"analysis": analysis_data, "usage": result["usage"]}
        except Exception as e_pydantic_parse:
            logger.error(f"[LLMReasoning:{request_id}] Failed to parse LibrarianAnalysisResult from LLM output. Error: {e_pydantic_parse}. Output: {result.get('output', 'N/A')}", exc_info=True)
            return {
                "analysis": models.LibrarianAnalysisResult(
                    covered_reasoning_steps=[],
                    key_information_for_covered_steps={},
                    newly_identified_keywords_or_entities=[],
                    suggested_new_sub_queries=[],
                    remaining_gaps_summary="Failed to parse analysis from LLM.",
                    verification_outcome="NOT_APPLICABLE",
                    confirmed_value=None 
                ),
                "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}),
                "error": f"Pydantic parsing error for LibrarianAnalysisResult: {e_pydantic_parse}"
            }


    async def generate_next_hop_queries(
        self,
        original_user_query: str,
        uncovered_reasoning_steps: List[str],
        insights_from_analyst: Optional[models.LibrarianAnalysisResult],
        previous_queries: List[str],
        model_info: Dict[str, Any],
        api_config: Dict[str, Any],
        user_id: Optional[str], 
        request_id: Optional[str] = None,
        document_context_summary: Optional[str] = None,
        is_document_focused_query: bool = False,
        task_date_context: Optional[str] = None,
        is_cancelled_flag: Optional[asyncio.Event] = None 
    ) -> Dict[str, Any]:
        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"queries": [], "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "error": "Operation cancelled."}
        formatted_uncovered_steps = "\n".join([f"- {step}" for step in uncovered_reasoning_steps])
        formatted_previous_queries = "\n".join([f"- {q}" for q in previous_queries])

        document_context_instruction = ""
        if is_document_focused_query and document_context_summary:
            document_context_instruction = f"""
This research is PRIMARILY FOCUSED ON ANALYZING AN UPLOADED DOCUMENT.
Uploaded Document Context Summary (use this as primary information source):
---
{document_context_summary[:1500]}
---
Next queries should be specific analytical tasks to deepen understanding of THIS DOCUMENT CONTEXT or, if absolutely necessary, highly targeted web searches for terms/concepts *within the document* that require external definition.
Avoid generating broad web search queries unless the document context explicitly indicates a need for external information to fulfill one of the Uncovered Research Objectives.
"""
        elif is_document_focused_query:
            document_context_instruction = "\nThis research is PRIMARILY FOCUSED ON ANALYZING AN UPLOADED DOCUMENT, but its summary is not available. Prioritize queries that would help analyze typical document content related to the user's query.\n"

        date_context_instruction_next_hop = ""
        if task_date_context:
            date_context_instruction_next_hop = f"""
IMPORTANT TEMPORAL CONTEXT: All new queries should be formulated considering the research timeframe: {task_date_context}.
This means terms like "latest," "current," or "recent developments" in your generated queries should refer to this specific timeframe.
"""

        prompt = f"""You are a Query Strategist for an advanced research team. Your goal is to generate new, highly focused search queries or analytical tasks for the next round of investigation.
{date_context_instruction_next_hop}
Original User Query: '{original_user_query}'
{document_context_instruction}
Current Research Status:
- Uncovered Research Objectives (Reasoning Steps):
{formatted_uncovered_steps}
- Insights from Previous Hop (Analyst's Report):
  - Newly Identified Keywords/Entities: {insights_from_analyst.newly_identified_keywords_or_entities if insights_from_analyst else 'N/A'}
  - Suggested New Sub-Queries by Analyst: {insights_from_analyst.suggested_new_sub_queries if insights_from_analyst else 'N/A'}
  - Remaining Gaps Summary: {insights_from_analyst.remaining_gaps_summary if insights_from_analyst else 'N/A'}
- Queries/Tasks Already Executed:
{formatted_previous_queries}

Based on this information:
1.  For EACH 'Uncovered Research Objective' listed above:
    - If this is a document-focused analysis (see IMPORTANT CONTEXT above), generate 1-2 specific **analytical tasks or questions phrased as instructions for an internal system to perform on the document content**. Example: "Extract all mentions of 'Project Alpha' from the document." or "ASK_LLM: Summarize the section on 'Project Beta's' budget from the document." These should NOT be web search queries.
    - Otherwise (general web research), generate 1-2 diverse **keyword-based search query variations suitable for a web search engine (like Google or DuckDuckGo)**. These queries should be concise, typically 3-7 words, focusing on key entities, concepts, and actions. Example: "SEC crypto enforcement impact 2024" or "Ripple XRP lawsuit market effects". **DO NOT output full sentences or descriptive tasks as web search queries.**
2.  Additionally, if 'Insights from Previous Hop' suggest promising new leads (keywords or analyst suggestions) not covered by the above, generate 1 query/task for those leads, respecting the document-focus and query/task type distinction above.
3.  All generated queries/tasks MUST be distinct from each other and from 'Queries/Tasks Already Executed'.
4.  **Web search queries MUST be specific, keyword-focused, and directly searchable.** Analytical tasks for documents should be clear instructions for an internal system.
5.  If an 'Uncovered Research Objective' describes an internal calculation, summarization of *already gathered information*, or an action that does not require fetching *new external information via web search*, do NOT generate a web search query for it. Instead, if it's an analytical task on existing data, phrase it as an "ASK_LLM: [specific analytical question or instruction for the internal system]" directive. Example: "ASK_LLM: Based on the previously gathered information about company X's financials and company Y's market share, what is the relative competitive strength?". Focus web search query generation only on objectives that necessitate fetching new external information.

Output ONLY a JSON list of all new search query strings (for web search) or analytical task descriptions (e.g., "ASK_LLM: [question]"). If no new distinct, searchable queries/tasks can be formulated, output an empty list.
Ensure all strings in the JSON list are properly escaped if they contain quotes.

Example (General Web Research for one uncovered objective "ethical AI in news"):
[
  "AI news generation ethics",
  "bias in AI algorithms for journalism",
  "transparency for AI-generated news"
]

Example (Document-Focused Analysis for one uncovered objective "Identify process bottlenecks"):
[
  "Analyze the document to pinpoint steps with explicitly mentioned delays or resource constraints.",
  "Extract any sections describing hand-offs between departments and look for potential wait times."
]

Final JSON Output (combined list of all generated queries/tasks):
"""
        result = await self._execute_llm_call(
            request_type="next_hop_query_generation",
            prompt=prompt,
            model_info=model_info,
            api_config=api_config,
            user_id_for_internal_call=user_id, 
            request_id=request_id,
            expected_output_format="json",
            is_cancelled_flag=is_cancelled_flag 
        )

        if is_cancelled_flag and is_cancelled_flag.is_set(): 
            return {"queries": [], "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": "Operation cancelled during next hop query generation."}

        if result.get("error"):
            logger.error(f"[LLMReasoning:{request_id}] Error in _execute_llm_call for generate_next_hop_queries: {result['error']}")
            return {"queries": [], "usage": result["usage"], "error": result["error"]}

        llm_output = result.get("output")

        # Robustness check: if output is a dict with one key whose value is a list, use that list.
        if isinstance(llm_output, dict) and len(llm_output) == 1:
            potential_list = next(iter(llm_output.values()), None)
            if isinstance(potential_list, list):
                logger.warning(f"[LLMReasoning:{request_id}] LLM returned a dict for next hop queries, but extracting the inner list.")
                llm_output = potential_list

        # Handle both formats: simple list of strings OR list of dicts with "task" key
        if isinstance(llm_output, list):
            extracted_queries = []
            for item in llm_output:
                if isinstance(item, str):
                    # Simple string format
                    extracted_queries.append(item)
                elif isinstance(item, dict) and "task" in item:
                    # Structured format with "task" key
                    extracted_queries.append(item["task"])
                else:
                    logger.warning(f"[LLMReasoning:{request_id}] Skipping invalid item in next hop queries: {item}")
            
            if extracted_queries:
                return {"queries": extracted_queries, "usage": result["usage"]}

        logger.error(f"[LLMReasoning:{request_id}] Next hop query output was not a list of strings or valid structured format: {llm_output}")
        return {"queries": [], "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": "Output not list of strings or valid structured format"}


    async def synthesize_initial_draft(
        self,
        original_user_query: str,
        accumulated_top_chunks_text: List[models.ContentChunk], 
        model_info: Dict[str, Any],
        api_config: Dict[str, Any],
        user_id: Optional[str], 
        request_id: Optional[str] = None,
        overall_entities_summary: Optional[str] = None, 
        overall_relationships_summary: Optional[str] = None, 
        reasoning_steps: Optional[List[str]] = None,
        is_document_focused_query: bool = False,
        document_context_summary_for_synthesis: Optional[str] = None,
        resolved_facts_summary: Optional[str] = None,
        low_confidence_synthesis_mode: bool = False, 
        task_date_context: Optional[str] = None,
        comptroller_feedback: Optional[List[str]] = None,
        existing_draft_for_revision: Optional[str] = None, 
        is_cancelled_flag: Optional[asyncio.Event] = None 
    ) -> Dict[str, Any]:
        
        return await self.synthesize_with_vector_focus(
            original_query=original_user_query,
            reasoning_steps=reasoning_steps,
            model_info=model_info,
            api_config=api_config,
            user_id=user_id,
            request_id=request_id,
            accumulated_top_chunks_text=accumulated_top_chunks_text,
            overall_entities_summary=overall_entities_summary, 
            overall_relationships_summary=overall_relationships_summary, 
            is_cancelled_flag=is_cancelled_flag,
            is_document_focused_query=is_document_focused_query,
            document_context_summary_for_synthesis=document_context_summary_for_synthesis,
            resolved_facts_summary=resolved_facts_summary,
            low_confidence_synthesis_mode=low_confidence_synthesis_mode,
            task_date_context=task_date_context,
            comptroller_feedback=comptroller_feedback,
            existing_draft_for_revision=existing_draft_for_revision
        )

    async def synthesize_with_vector_focus(
        self,
        original_query: str,
        reasoning_steps: Optional[List[str]], 
        model_info: Dict[str, Any],
        api_config: Dict[str, Any],
        user_id: Optional[str],
        request_id: Optional[str],
        accumulated_top_chunks_text: List[models.ContentChunk],
        overall_entities_summary: Optional[str], 
        overall_relationships_summary: Optional[str], 
        is_cancelled_flag: Optional[asyncio.Event],
        is_document_focused_query: bool,
        document_context_summary_for_synthesis: Optional[str],
        resolved_facts_summary: Optional[str],
        low_confidence_synthesis_mode: bool, 
        task_date_context: Optional[str],
        comptroller_feedback: Optional[List[str]],
        existing_draft_for_revision: Optional[str]
    ) -> Dict[str, Any]:
        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"draft_text": "[Draft synthesis cancelled.]", "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "error": "Operation cancelled."}

        quality_filter_result = await self.filter_chunks_for_quality(
            query_context=original_query,
            chunks=accumulated_top_chunks_text,
            model_info=model_info,
            api_config=api_config,
            user_id=user_id,
            request_id=f"{request_id}_pre_synthesis_filter",
            top_n=15,
            is_cancelled_flag=is_cancelled_flag
        )

        if quality_filter_result.get("error"):
            logger.warning(f"[{request_id}] Quality filter failed pre-synthesis. Proceeding with original (unfiltered) chunks. Error: {quality_filter_result['error']}")
            chunks_for_synthesis = accumulated_top_chunks_text
        else:
            chunks_for_synthesis = quality_filter_result.get("filtered_chunks", accumulated_top_chunks_text)
        
        formatted_chunks_parts = [f"--- Source URL: {chunk.original_url} ---\n{chunk.text_content}" for chunk in chunks_for_synthesis if isinstance(chunk, models.ContentChunk)]
        formatted_chunks = "\n\n---\nEnd of Source Material Excerpt\n---\n\n".join(formatted_chunks_parts)
        
        formatted_reasoning_steps = "\n".join([f"- {step}" for step in reasoning_steps]) if reasoning_steps else "N/A"

        entities_summary_section = f"\nOverall Summary of Key Entities Identified:\n{overall_entities_summary}\n" if overall_entities_summary else ""
        relationships_summary_section = f"\nOverall Summary of Key Relationships Identified:\n{overall_relationships_summary}\n" if overall_relationships_summary else ""
        document_context_section = f"\nThis synthesis is focused on the following document context:\n{document_context_summary_for_synthesis}\n" if is_document_focused_query and document_context_summary_for_synthesis else ""
        resolved_facts_section = f"\nConsider these previously resolved facts as true:\n{resolved_facts_summary}\n" if resolved_facts_summary else ""
        date_context_section = f"\nIMPORTANT TEMPORAL CONTEXT: Perform synthesis as if the current date is {task_date_context}.\n" if task_date_context else ""
        
        feedback_section = ""
        if comptroller_feedback:
            formatted_feedback = "\n".join([f"- {fb}" for fb in comptroller_feedback])
            feedback_section = f"\nAddress the following feedback in your revision:\n{formatted_feedback}\n"
        
        revision_instruction = ""
        existing_draft_section = ""
        if existing_draft_for_revision:
            revision_instruction = f"\nRevise the following existing draft based on all provided information and feedback. Ensure the new draft is a significant improvement and addresses any shortcomings noted."
            existing_draft_section = f"\nExisting Draft for Revision:\n---\n{existing_draft_for_revision}\n---\n"

        prompt = f"""You are an Editor tasked with producing a professional, objective, and authoritative research report.
Original Research Request: '{original_query}'{revision_instruction}
Key Aspects to Cover (based on initial research plan):
{formatted_reasoning_steps}{date_context_section}{document_context_section}{resolved_facts_section}{entities_summary_section}{relationships_summary_section}{feedback_section}{existing_draft_section}
Excerpts from relevant source materials (after quality filtering):
{formatted_chunks}

Synthesize a comprehensive and high-quality report of approximately {self.settings.LIVE_SEARCH_SYNTHESIS_TARGET_WORD_COUNT} words based on ALL the provided information.
- Ensure the report directly answers the 'Original Research Request'.
- Integrate information from 'Excerpts from relevant source materials' smoothly.
- If revising, incorporate feedback and improve upon the 'Existing Draft'.
- Maintain a professional, objective, and authoritative tone.
- **CRITICAL FOR CITATIONS:** For every piece of factual information derived from the 'Excerpts from relevant source materials', you MUST cite its origin. Use the format `[ref: FULL_URL_OF_SOURCE]` immediately after the information. Example: "The sky is blue [ref: https://example.com/science/colors]." If multiple sources support a single statement, you can list them like: "The project was successful [ref: https://example.com/projectA/report] [ref: https://example.com/projectA/news]."
"""
        
        synthesis_model_info = model_info.copy()

        result = await self._execute_llm_call(
            request_type="vector_focused_synthesis",
            prompt=prompt,
            model_info=synthesis_model_info,
            api_config=api_config,
            user_id_for_internal_call=user_id,
            request_id=request_id,
            expected_output_format="text",
            is_cancelled_flag=is_cancelled_flag
        )

        return {"draft_text": result.get("output", ""), "usage": result.get("usage", {}), "error": result.get("error")}

    async def review_draft_and_identify_fact_check_queries(
        self, 
        draft_report_text: str, 
        model_info: Dict[str, Any], 
        api_config: Dict[str, Any], 
        user_id: Optional[str], 
        request_id: Optional[str] = None, 
        claims_previously_checked: Optional[Set[str]] = None, 
        is_cancelled_flag: Optional[asyncio.Event] = None
    ) -> Dict[str, Any]: 
        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"fact_check_requests": [], "newly_identified_claims_this_call": set(), "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "error": "Operation cancelled."}

        previously_checked_instruction = ""
        if claims_previously_checked:
            formatted_prev_claims = "\n".join([f"- '{claim}'" for claim in claims_previously_checked])
            previously_checked_instruction = f"""
IMPORTANT: The following claims have already been identified for fact-checking in a previous review step during this synthesis cycle. DO NOT re-identify these exact claims:
{formatted_prev_claims}
"""

        prompt = f"""You are a meticulous Reviewing Editor. An initial draft of a research report has been prepared. Your task is to critically review this draft and identify up to 3-5 specific statements or claims that:
a) Are crucial to the report's main arguments.
b) Might benefit from explicit, targeted fact-checking against a reliable source (like Wikipedia or a domain-specific archive like OpenAlex).
c) Seem potentially ambiguous or could be misinterpreted.
{previously_checked_instruction}
Initial Draft:
---
{draft_report_text[:8000]}
---

For each statement you identify, formulate a concise, keyword-based verification query suitable for a legal search engine like CourtListener or a general web search. The query should consist of the most important names, entities, and concepts.
Output ONLY a JSON list of objects, where each object has:
- "claim_to_verify": "The exact statement or claim from the draft."
- "verification_query": "A concise, keyword-based search query (e.g., 'Ripple Labs SEC lawsuit 2020')."
- "preferred_provider": "Suggest 'courtlistener' for legal cases, 'wikipedia' for general factual claims, or 'general_web' for other claims."

If the draft is exceptionally clear and well-supported and no specific points warrant such immediate verification (or all identifiable points were previously checked), output an empty list.

Example Output:
[
  {{
    "claim_to_verify": "The report states that X technology increased efficiency by 50% in 2023.",
    "verification_query": "X technology efficiency increase 2023 OpenAlex",
    "preferred_provider": "openalex"
  }},
  {{
    "claim_to_verify": "The definition of Y concept is given as Z.",
    "verification_query": "Define Y concept Wikipedia",
    "preferred_provider": "wikipedia"
  }},
  {{
    "claim_to_verify": "The company launched product A in Q2.",
    "verification_query": "company product A launch date Q2",
    "preferred_provider": "general_web"
  }}
]"""
        result = await self._execute_llm_call(
            request_type="fact_check_identification",
            prompt=prompt,
            model_info=model_info,
            api_config=api_config,
            user_id_for_internal_call=user_id, 
            request_id=request_id,
            expected_output_format="json",
            is_cancelled_flag=is_cancelled_flag 
        )

        if is_cancelled_flag and is_cancelled_flag.is_set(): 
            return {"fact_check_requests": [], "newly_identified_claims_this_call": set(), "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": "Operation cancelled during fact check query identification."}

        if result.get("error"):
            logger.error(f"[LLMReasoning:{request_id}] Error in _execute_llm_call for review_draft_and_identify_fact_check_queries: {result['error']}")
            return {"fact_check_requests": [], "newly_identified_claims_this_call": set(), "usage": result["usage"], "error": result["error"]}

        llm_identified_requests = []
        if isinstance(result["output"], list) and all(isinstance(item, dict) for item in result["output"]):
            llm_identified_requests = result["output"]
        elif isinstance(result["output"], str):
            try:
                json_string = result["output"].strip()
                if json_string.startswith("```json"): json_string = json_string[7:]
                if json_string.endswith("```"): json_string = json_string[:-3]
                json_string = json_string.strip()
                json_string = re.sub(r",\s*\]$", "]", json_string)
                parsed_json = json.loads(json_string)
                if isinstance(parsed_json, list) and all(isinstance(item, dict) for item in parsed_json):
                    llm_identified_requests = parsed_json
            except json.JSONDecodeError as e:
                logger.error(f"[LLMReasoning:{request_id}] Fact check query identification output was not a list of dicts and could not be fixed: {result['output']}. Error: {e}")
                return {"fact_check_requests": [], "newly_identified_claims_this_call": set(), "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": "Output not list of dicts"}
        else:
            logger.error(f"[LLMReasoning:{request_id}] Fact check query identification output was not a list of dicts: {result['output']}")
            return {"fact_check_requests": [], "newly_identified_claims_this_call": set(), "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": "Output not list of dicts"}

        final_fact_check_requests = []
        newly_identified_claims_this_call = set()
        for req in llm_identified_requests:
            claim_to_verify = req.get("claim_to_verify")
            if claim_to_verify and (not claims_previously_checked or claim_to_verify not in claims_previously_checked):
                final_fact_check_requests.append(req)
                newly_identified_claims_this_call.add(claim_to_verify)
        
        return {"fact_check_requests": final_fact_check_requests, "newly_identified_claims_this_call": newly_identified_claims_this_call, "usage": result["usage"]}


    async def get_direct_fact(
        self,
        question: str,
        context_summary: Optional[str],
        model_info: Dict[str, Any],
        api_config: Dict[str, Any],
        user_id: Optional[str], 
        request_id: Optional[str] = None,
        is_cancelled_flag: Optional[asyncio.Event] = None 
    ) -> Dict[str, Any]:
        """
        Asks the LLM a direct factual question with very low temperature to get a concise answer.
        """
        context_instruction = ""
        if context_summary:
            context_instruction = f"Use the following context if relevant:\n---\n{context_summary[:1000]}\n---\n"

        prompt = f"""Based on your existing knowledge and the provided context (if any), please answer the following factual question as concisely as possible.
If you do not know the answer or cannot confidently state it based on your training data, respond with "I do not have that specific information."

{context_instruction}
Question: {question}

Concise Answer:"""

        fact_call_model_info = model_info.copy()
        fact_call_model_info["temperature"] = 0.0


        result = await self._execute_llm_call(
            request_type="direct_fact_query",
            prompt=prompt,
            model_info=fact_call_model_info,
            api_config=api_config,
            user_id_for_internal_call=user_id, 
            request_id=request_id,
            expected_output_format="text",
            is_cancelled_flag=is_cancelled_flag 
        )

        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"answer": None, "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": "Operation cancelled during direct fact retrieval."}

        llm_answer = result.get("output")
        error = result.get("error")
        usage = result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0})

        if error:
            logger.error(f"[LLMReasoning:{request_id}] Error in get_direct_fact: {error}")
            return {"answer": None, "usage": usage, "error": error}

        answer_text = llm_answer
        if llm_answer and ("i do not have that specific information" in llm_answer.lower() or                            "i don't know" in llm_answer.lower() or                            "cannot provide" in llm_answer.lower() or                            "unable to determine" in llm_answer.lower()):
            return {"answer": None, "usage": usage, "error": "LLM indicated uncertainty."}

        return {"answer": answer_text, "usage": usage, "error": None}

    async def get_entity_overview(
        self,
        entity_name: str,
        attributes_list: List[str],
        model_info: Dict[str, Any],
        api_config: Dict[str, Any],
        user_id: Optional[str], 
        request_id: Optional[str] = None,
        is_cancelled_flag: Optional[asyncio.Event] = None 
    ) -> Dict[str, Any]:
        """
        Asks the LLM for a general overview of an entity, focusing on specific attributes.
        Attempts to get confidence scores for facts if the model/prompting supports it.
        """
        attributes_str = ", ".join(attributes_list)
        prompt = f"""Provide a factual overview of the entity "{entity_name}".
Focus on the following attributes if known: {attributes_str}.
For each distinct piece of factual information you provide, if possible, also state your confidence in that specific piece of information on a scale of 0.0 (uncertain) to 1.0 (very confident).
If you cannot provide a confidence score, just provide the facts.
Structure your response clearly. If providing multiple facts, list them.

Example for entity "Eiffel Tower" and attributes "height, designer, year built":
"The Eiffel Tower is a wrought-iron lattice tower.
- Height: 330 meters (confidence: 0.95)
- Designer: Gustave Eiffel (confidence: 0.98)
- Year Built: Completed in 1889 (confidence: 0.97)"

If confidence scores are not possible, a plain text summary is acceptable:
"The Eiffel Tower, designed by Gustave Eiffel, was completed in 1889 and stands 330 meters tall."

Factual Overview of "{entity_name}":
"""
        overview_model_info = model_info.copy()
        overview_model_info["temperature"] = model_info.get("temperature_for_entity_overview", 0.1)

        result = await self._execute_llm_call(
            request_type="get_entity_overview",
            prompt=prompt,
            model_info=overview_model_info,
            api_config=api_config,
            user_id_for_internal_call=user_id, 
            request_id=request_id,
            expected_output_format="text",
            is_cancelled_flag=is_cancelled_flag 
        )
        
        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"overview_text": None, "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": "Operation cancelled during entity overview."}
            
        return {"overview_text": result.get("output"), "usage": result.get("usage"), "error": result.get("error")}

    async def extract_specific_attributes_from_text(
        self,
        text_content: str,
        attributes_to_extract: List[str],
        core_entity: str,
        model_info: Dict[str, Any],
        api_config: Dict[str, Any],
        user_id: Optional[str], 
        request_id: Optional[str] = None,
        is_cancelled_flag: Optional[asyncio.Event] = None 
    ) -> Dict[str, Any]:
        """
        Extracts specific attribute values for a core_entity from the given text_content.
        """
        if not text_content or not attributes_to_extract:
            return {"attributes": {}, "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}}

        attributes_json_schema = {attr: "string_or_null" for attr in attributes_to_extract}

        prompt = f"""Given the following text, which is known to be about "{core_entity}", extract the values for the listed attributes.
If an attribute's value is not found in the text, use null for its value.
For numeric values or dates, extract them exactly as they appear.

Attributes to Extract:
{json.dumps(attributes_to_extract, indent=2)}

Text Content:
---
{text_content[:4000]}
---

Output ONLY a single JSON object where keys are the attribute names from the "Attributes to Extract" list and values are the extracted strings or null.
Example for attributes ["engine_type", "production_start_year"]:
{{
  "engine_type": "two-stroke petrol",
  "production_start_year": "1964"
}}
If "engine_type" was found but "production_start_year" was not:
{{
  "engine_type": "two-stroke petrol",
  "production_start_year": null
}}

JSON Output:
"""
        extraction_model_info = model_info.copy()
        extraction_model_info["temperature"] = model_info.get("temperature_for_attribute_extraction", 0.0)


        result = await self._execute_llm_call(
            request_type="extract_specific_attributes",
            prompt=prompt,
            model_info=extraction_model_info,
            api_config=api_config,
            user_id_for_internal_call=user_id, 
            request_id=request_id,
            expected_output_format="json",
            is_cancelled_flag=is_cancelled_flag 
        )

        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"attributes": {}, "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": "Operation cancelled during attribute extraction."}

        extracted_attributes = {}
        if result.get("output") and isinstance(result["output"], dict):
            for attr in attributes_to_extract:
                extracted_attributes[attr] = result["output"].get(attr) 

        if result.get("error"):
             logger.error(f"[LLMReasoning:{request_id}] Error extracting specific attributes: {result['error']}")

        return {"attributes": extracted_attributes, "usage": result.get("usage"), "error": result.get("error")}

    async def formulate_verification_query(
        self,
        question: str,
        proposed_answer: str,
        model_info: Dict[str, Any],
        api_config: Dict[str, Any],
        user_id: Optional[str], 
        request_id: Optional[str] = None,
        is_cancelled_flag: Optional[asyncio.Event] = None 
    ) -> Dict[str, Any]:
        """
        Given a question and a proposed answer from an LLM,
        formulate an optimal web search query to verify the proposed answer.
        """
        prompt = f"""Given the original question and a proposed answer (which might be from an AI), formulate a concise and effective web search query that can be used to verify the accuracy of the proposed answer. The query should be targeted and specific.

Original Question: "{question}"
Proposed Answer to Verify: "{proposed_answer}"

Optimal Web Search Query for Verification:"""

        query_formulation_model_info = model_info.copy()
        query_formulation_model_info["temperature"] = model_info.get("temperature_for_verification_query_formulation", 0.5)

        result = await self._execute_llm_call(
            request_type="formulate_verification_query",
            prompt=prompt,
            model_info=query_formulation_model_info,
            api_config=api_config,
            user_id_for_internal_call=user_id, 
            request_id=request_id,
            expected_output_format="text",
            is_cancelled_flag=is_cancelled_flag 
        )

        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"verification_query": f"{question} {proposed_answer}", "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": "Operation cancelled during verification query formulation."}
            
        verification_query = result.get("output")
        error = result.get("error")
        usage = result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0})

        if error or not verification_query:
            logger.error(f"[LLMReasoning:{request_id}] Error formulating verification query: {error or 'Empty query returned'}. Falling back to simple combination.")
            fallback_query = f"{question} {proposed_answer}"
            return {"verification_query": fallback_query, "usage": usage, "error": error or "Generated alternative query was empty."}

        cleaned_query = verification_query.strip()
        if cleaned_query.lower().startswith("query:"):
            cleaned_query = cleaned_query[len("query:"):].strip()
        cleaned_query = cleaned_query.strip('"\'')

        return {"verification_query": cleaned_query, "usage": usage, "error": None}

    async def refine_report_with_fact_check_results(
        self,
        initial_draft_text: str,
        fact_check_results: List[Dict[str, str]],
        model_info: Dict[str, Any],
        api_config: Dict[str, Any],
        user_id: Optional[str],
        original_user_query: str,
        request_id: Optional[str] = None,
        is_cancelled_flag: Optional[asyncio.Event] = None
    ) -> Dict[str, Any]:
        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"final_report_text": initial_draft_text, "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "error": "Operation cancelled."}

        formatted_fact_checks = "\n".join([
            f"--- Claim: '{item.get('claim_to_verify', 'N/A')}' ---\nVerification Query Used: '{item.get('verification_query', 'N/A')}'\nInformation Found: '{item.get('result_snippet', 'N/A')}'\n---"
            for item in fact_check_results
        ])

        prompt = f"""You are the Bloomberg-style Editor. An initial draft of your report was reviewed, and specific points were fact-checked. Your task is to revise the initial draft based on these verification results to produce the final, polished report.

Original User Query: '{original_user_query}'

Initial Draft:
---
{initial_draft_text[:8000]}
---

Fact-Checking Results (information found from targeted searches, e.g., from Wikipedia):
{formatted_fact_checks}

Revise the Initial Draft. Your revision MUST:
1. Incorporate the Fact-Checking Results to ensure accuracy and clarity.
2. CRITICALLY ensure the revised report directly and comprehensively answers all aspects of the 'Original User Query'.
3. Maintain the Bloomberg style and seamlessly integrates any necessary corrections or clarifications.
If a fact-check confirms the original statement, ensure it remains well-supported. If it contradicts or requires nuance, adjust the report accordingly.
The final report must be consistent with both the verified facts and the full scope of the original user query.

**Important Output Instructions:**
-   **Content Only**: Output ONLY the revised report content.
-   **CRITICAL FOR CITATIONS:** For every piece of factual information derived from the 'Fact-Checking Results' or the 'Initial Draft' (if it contained verifiable information from original sources), you MUST cite its origin. Use the format `[ref: FULL_URL_OF_SOURCE]` immediately after the information. If the information came from the initial draft and its original source URL is known (e.g., from a previous citation step), use that URL. If a fact-check result provides a URL, use that.
-   **No Sources Section**: Do NOT include a "Sources", "References", or similar bibliography section. This will be appended separately by the system.
-   **No Meta-Commentary**: Do NOT include any notes, comments, or reflections about the writing process, your adherence to style, or the instructions themselves.

Output the complete, revised Final Report (aim for approximately {self.settings.LIVE_SEARCH_REFINEMENT_TARGET_WORD_COUNT} words):"""

        result = await self._execute_llm_call(
            request_type="report_refinement",
            prompt=prompt,
            model_info=model_info,
            api_config=api_config,
            user_id_for_internal_call=user_id, 
            request_id=request_id,
            expected_output_format="text",
            is_cancelled_flag=is_cancelled_flag 
        )

        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"final_report_text": initial_draft_text, "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": "Operation cancelled during report refinement."}

        if result.get("error"):
            logger.error(f"[LLMReasoning:{request_id}] Error in _execute_llm_call for refine_report_with_fact_check_results: {result['error']}")
            return {"final_report_text": f"[Refinement failed: {result['error']}]\n\n{initial_draft_text}", "usage": result["usage"], "error": result["error"]}

        return {"final_report_text": result["output"], "usage": result["usage"]}

    async def perform_reasoning_step(self, prompt: str, model_info: Dict[str, Any], api_config: Dict[str, Any], user_id: Optional[str], request_id: Optional[str] = None) -> Dict[str, Any]: 
        logger.warning(f"[LLMReasoning:{request_id}] Generic 'perform_reasoning_step' called. Consider using a more specific method.")
        return await self._execute_llm_call("reasoning", prompt, model_info, api_config, user_id, request_id, expected_output_format="text") 

    async def perform_synthesis_step(self, prompt: str, model_info: Dict[str, Any], api_config: Dict[str, Any], user_id: Optional[str], request_id: Optional[str] = None) -> Dict[str, Any]: 
        logger.warning(f"[LLMReasoning:{request_id}] Generic 'perform_synthesis_step' called. Consider using 'synthesize_initial_draft' or 'refine_report_with_fact_check_results'.")
        return await self._execute_llm_call("synthesis", prompt, model_info, api_config, user_id, request_id, expected_output_format="text") 

    async def summarize_text(
        self,
        text_to_summarize: str,
        model_info: Dict[str, Any],
        api_config: Dict[str, Any],
        user_id: Optional[str], 
        request_id: Optional[str] = None,
        document_name: Optional[str] = None,
        doc_id: Optional[str] = None,
        is_cancelled_flag: Optional[asyncio.Event] = None
    ) -> Dict[str, Any]:
        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"summary": "[Summarization cancelled.]", "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "error": "Operation cancelled."}

        max_summary_input_length = model_info.get("max_input_length_summarize", self.settings.DEFAULT_MAX_SUMMARIZATION_INPUT_LENGTH)
        if len(text_to_summarize) > max_summary_input_length:
            logger.warning(f"[LLMReasoning:{request_id or 'N/A'}:summarization] Truncating text for summarization. Original length: {len(text_to_summarize)}")
            text_to_summarize = text_to_summarize[:max_summary_input_length] + "\n[... text truncated ...]"

        context_header = ""
        if document_name:
            context_header = f"You are analyzing a section of the document titled '{document_name}' (ID: {doc_id or 'N/A'}). "

        prompt = f"{context_header}Provide a concise summary of the following text, aiming for {self.settings.LIVE_SEARCH_SUMMARY_TARGET_SENTENCE_COUNT}. Focus on the main points and key information presented in this specific excerpt. Base your summary ONLY on the text provided below:\n\n---\n{text_to_summarize}\n---\n\nConcise Summary ({self.settings.LIVE_SEARCH_SUMMARY_TARGET_SENTENCE_COUNT}):"

        result = await self._execute_llm_call(
            "summarization", 
            prompt, 
            model_info, 
            api_config, 
            user_id, 
            request_id, 
            expected_output_format="text",
            is_cancelled_flag=is_cancelled_flag 
        )

        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"summary": "[Summarization cancelled.]", "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": "Operation cancelled during summarization."}

        if result.get("error"):
            logger.error(f"[LLMReasoning:{request_id}] Error in _execute_llm_call for summarize_text: {result['error']}")
            return {"summary": f"[Summarization failed: {result['error']}]", "usage": result["usage"], "error": result["error"]}
        return {"summary": result["output"], "usage": result["usage"]}

    async def generate_follow_up_suggestions(self, original_query: str, synthesized_report: str, model_info: Dict[str, Any], api_config: Dict[str, Any], user_id: Optional[str], request_id: Optional[str] = None, is_cancelled_flag: Optional[asyncio.Event] = None) -> Dict[str, Any]:
        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"suggestions": [], "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "error": "Operation cancelled."}

        prompt = f"""Given the original research query and the synthesized report, suggest 3-4 distinct follow-up questions or topics that a user might be interested in exploring further.
These suggestions should be natural extensions of the report's content or delve into related areas not fully covered.
Output ONLY a JSON list of strings, where each string is a follow-up suggestion.

Original Query: "{original_query}"

Synthesized Report (excerpt):
---
{synthesized_report[:3000]}
---

Follow-up Suggestions (JSON list of strings):"""

        try:
            result = await self._execute_llm_call(
                request_type="follow_up_generation",
                prompt=prompt,
                model_info=model_info,
                api_config=api_config,
                user_id_for_internal_call=user_id, 
                request_id=request_id,
                expected_output_format="json",
                is_cancelled_flag=is_cancelled_flag 
            )

            if is_cancelled_flag and is_cancelled_flag.is_set():
                return {"suggestions": [], "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": "Operation cancelled during follow-up generation."}

            if result.get("error"):
                 logger.error(f"[LLMReasoning:{request_id}] Error in _execute_llm_call for generate_follow_up_suggestions: {result['error']}")
                 return {"suggestions": [], "usage": result["usage"], "error": result["error"]}

            llm_output = result.get("output")
            # Robustness check: if output is a dict with one key whose value is a list, use that list.
            if isinstance(llm_output, dict) and len(llm_output) == 1:
                potential_list = next(iter(llm_output.values()), None)
                if isinstance(potential_list, list):
                    logger.warning(f"[LLMReasoning:{request_id}] LLM returned a dict for follow-up suggestions, but extracting the inner list.")
                    llm_output = potential_list

            if isinstance(llm_output, list) and all(isinstance(item, str) for item in llm_output):
                return {"suggestions": llm_output, "usage": result["usage"]}
            else:
                logger.error(f"[LLMReasoning:{request_id}] Follow-up suggestion output was not a list of strings: {llm_output}")
                return {"suggestions": [], "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": "Output not list of strings"}
        except Exception as e:
            logger.error(f"[LLMReasoning:{request_id}] Unexpected error in generate_follow_up_suggestions: {e}", exc_info=True)
            return {"suggestions": [], "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "error": str(e)}

    async def extract_entities_from_text(
        self,
        text_content: str,
        model_info: Dict[str, Any],
        api_config: Dict[str, Any],
        user_id: Optional[str], 
        request_id: Optional[str] = None,
        document_name: Optional[str] = None,
        doc_id: Optional[str] = None,
        is_cancelled_flag: Optional[asyncio.Event] = None
    ) -> Dict[str, Any]:
        """
        Extracts key named entities with their types from the given text content using an LLM.
        """
        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"entities": [], "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "error": "Operation cancelled."}

        if not text_content:
            return {"entities": [], "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}}

        max_text_len_for_prompt = 3000

        context_header = ""
        if document_name:
            context_header = f"The following text is from a document titled '{document_name}' (ID: {doc_id or 'N/A'}). "

        prompt = f"""{context_header}Given the following text, extract up to 5-7 key named entities.
For each entity, provide its text and a type (e.g., PER, ORG, LOC, PRODUCT, CONCEPT, EVENT, MISC).
Focus on entities that are central to the main topics of this specific text excerpt.
Output ONLY a JSON list of objects. Each object must have "text" (string) and "type" (string) keys.
If no significant entities are found, output an empty list.

Text Excerpt:
---
{text_content[:max_text_len_for_prompt]}
---

Example:
If the text is "Apple Inc. announced the new iPhone 15, developed in Cupertino by Tim Cook's team. It's a revolutionary device.", the output might be:
[
  {{"text": "Apple Inc.", "type": "ORG"}},
  {{"text": "iPhone 15", "type": "PRODUCT"}},
  {{"text": "Cupertino", "type": "LOC"}},
  {{"text": "Tim Cook", "type": "PER"}},
  {{"text": "revolutionary device", "type": "CONCEPT"}}
]

JSON Output (list of objects with "text" and "type"):
"""

        result = await self._execute_llm_call(
            request_type="typed_entity_extraction",
            prompt=prompt,
            model_info=model_info,
            api_config=api_config,
            user_id_for_internal_call=user_id,
            request_id=request_id,
            expected_output_format="json",
            is_cancelled_flag=is_cancelled_flag 
        )

        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"entities": [], "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": "Operation cancelled during entity extraction."}

        if result.get("error"):
            logger.error(f"[LLMReasoning:{request_id}] Error in _execute_llm_call for extract_entities_from_text: {result['error']}")
            return {"entities": [], "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": result["error"]}

        output_data = result.get("output")
        if isinstance(output_data, list) and all(
            isinstance(item, dict) and "text" in item and isinstance(item["text"], str)
            for item in output_data
        ):
            valid_entities = []
            for item in output_data:
                try:
                    valid_entities.append(models.TypedEntity(**item).model_dump()) 
                except Exception:
                    logger.warning(f"[LLMReasoning:{request_id}] Invalid entity object in list: {item}")
            return {"entities": valid_entities, "usage": result["usage"]}
        else:
            logger.warning(f"[LLMReasoning:{request_id}] Typed entity extraction output was not a list of valid entity objects: {output_data}")
            return {"entities": [], "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": "Output not list of valid entity objects"}

    async def extract_relationships_from_text(
        self,
        text_content: str,
        model_info: Dict[str, Any],
        api_config: Dict[str, Any],
        user_id: Optional[str], 
        existing_typed_entities: Optional[List[Dict[str, Any]]] = None,
        request_id: Optional[str] = None,
        document_name: Optional[str] = None,
        doc_id: Optional[str] = None,
        is_cancelled_flag: Optional[asyncio.Event] = None
    ) -> Dict[str, Any]:
        """
        Extracts typed relationships (Subject-Predicate-Object triples with typed entities) from text.
        Optionally uses a list of known typed entities to focus the extraction.
        """
        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"relationships": [], "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "error": "Operation cancelled."}

        if not text_content:
            return {"relationships": [], "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}}

        max_text_len_for_prompt = 4000

        context_header = ""
        if document_name:
            context_header = f"The following text is from a document titled '{document_name}' (ID: {doc_id or 'N/A'}). "

        entity_hint = ""
        if existing_typed_entities:
            entity_examples = [f"{entity.get('text', '?')} ({entity.get('type', 'MISC')})" for entity in existing_typed_entities[:5]]
            if entity_examples:
                entity_hint = f"Focus on relationships involving these known entities if possible: {', '.join(entity_examples)}."

        prompt = f"""{context_header}Given the following text excerpt, extract the most salient relationships between entities.
Each relationship should be a triple: (Subject, Predicate, Object).
For Subject and Object, provide their text and type (e.g., PER, ORG, LOC, PRODUCT, CONCEPT, EVENT, MISC).
The Predicate should be a concise textual description of the relationship.
Additionally, provide a "predicate_type": a normalized, canonical type for the predicate (e.g., "PRODUCED_BY", "LOCATED_IN", "HAS_ROLE", "ANNOUNCED", "PART_OF"). Choose from a predefined list if available, or create a sensible uppercase snake_case type.
Also, provide a confidence_score (0.0-1.0) for the extracted relationship and a brief context_snippet (the sentence or part of sentence where it was found).
Extract up to 5-7 most important relationships from THIS EXCERPT.

{entity_hint}

Output ONLY a JSON list of dictionaries. Each dictionary must conform to this structure:
{{{{
  "subject": {{"text": "string", "type": "string"}},
  "predicate": "string",
  "object": {{"text": "string", "type": "string"}},
  "predicate_type": "string" (e.g., "ANNOUNCED", "DEVELOPED_BY", "LOCATED_IN"),
  "confidence_score": float (0.0-1.0),
  "context_snippet": "string"
}}}}
If no clear relationships are found, output an empty list.

Text Excerpt:
---
{text_content[:max_text_len_for_prompt]}
---

Example:
If the text is "Apple Inc., headquartered in Cupertino, announced the new iPhone 15. This revolutionary device was developed by Tim Cook's engineering team in 2023.", the output might be:
[
  {{{{
    "subject": {{"text": "Apple Inc.", "type": "ORG"}},
    "predicate": "announced",
    "object": {{"text": "iPhone 15", "type": "PRODUCT"}},
    "predicate_type": "ANNOUNCED_PRODUCT",
    "confidence_score": 0.95,
    "context_snippet": "Apple Inc., headquartered in Cupertino, announced the new iPhone 15."
  }}}},
  {{{{
    "subject": {{"text": "Tim Cook's engineering team", "type": "ORG"}},
    "predicate": "developed",
    "object": {{"text": "revolutionary device", "type": "PRODUCT"}},
    "predicate_type": "DEVELOPED_BY",
    "confidence_score": 0.85,
    "context_snippet": "This revolutionary device was developed by Tim Cook's engineering team in 2023."
  }}}},
   {{{{
    "subject": {{"text": "Apple Inc.", "type": "ORG"}},
    "predicate": "headquartered in",
    "object": {{"text": "Cupertino", "type": "LOC"}},
    "predicate_type": "LOCATED_IN",
    "confidence_score": 0.9,
    "context_snippet": "Apple Inc., headquartered in Cupertino, announced the new iPhone 15."
  }}}}
]

JSON Output (list of relationship dictionaries):
"""

        result = await self._execute_llm_call(
            request_type="typed_relationship_extraction",
            prompt=prompt,
            model_info=model_info,
            api_config=api_config,
            user_id_for_internal_call=user_id, 
            request_id=request_id,
            expected_output_format="json",
            is_cancelled_flag=is_cancelled_flag 
        )

        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"relationships": [], "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": "Operation cancelled during relationship extraction."}

        if result.get("error"):
            logger.error(f"[LLMReasoning:{request_id}] Error in _execute_llm_call for extract_relationships_from_text: {result['error']}")
            return {"relationships": [], "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": result["error"]}

        output_data = result.get("output")
        valid_relationships = []
        if isinstance(output_data, list):
            for item in output_data:
                try:
                    models.TypedRelationship(**item)
                    valid_relationships.append(item)
                except Exception:
                    logger.warning(f"[LLMReasoning:{request_id}] Invalid relationship object in list: {item}")

        if valid_relationships or (isinstance(output_data, list) and not output_data):
             return {"relationships": valid_relationships, "usage": result["usage"]}
        else:
            logger.warning(f"[LLMReasoning:{request_id}] Typed relationship extraction output was not a list of valid relationship objects: {output_data}")
            return {"relationships": [], "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": "Output not list of valid relationship objects"}

    async def rerank_chunks_for_relevance(
        self,
        query_context: str,
        chunks: List[models.ContentChunk],
        model_info: Dict[str, Any],
        api_config: Dict[str, Any],
        user_id: Optional[str], 
        request_id: Optional[str] = None,
        is_cancelled_flag: Optional[asyncio.Event] = None
    ) -> List[Tuple[models.ContentChunk, float]]:
        """
        Reranks a list of ContentChunks based on their relevance to a given query_context using an LLM.
        Returns a list of tuples, each containing the original chunk and its relevance score.
        This method now processes chunks in batches to reduce LLM calls.
        """
        if is_cancelled_flag and is_cancelled_flag.is_set():
            return [(chunk, 0.0) for chunk in chunks]

        if not query_context or not chunks:
            return [(chunk, 0.0) for chunk in chunks]

        batch_size = self.settings.LIVE_SEARCH_RERANK_LLM_BATCH_SIZE
        all_scored_chunks: List[Tuple[models.ContentChunk, float]] = []

        for i in range(0, len(chunks), batch_size):
            if is_cancelled_flag and is_cancelled_flag.is_set():
                for chunk_obj_remaining in chunks[i:]:
                    all_scored_chunks.append((chunk_obj_remaining, 0.0))
                break

            batch_chunks = chunks[i:i + batch_size]
            if not batch_chunks:
                continue

            formatted_batch_for_prompt = ""
            for batch_idx, chunk_obj in enumerate(batch_chunks):
                formatted_batch_for_prompt += f"CHUNK_ID: {chunk_obj.chunk_id}\n"
                formatted_batch_for_prompt += f"SOURCE: {chunk_obj.original_url}\n"
                formatted_batch_for_prompt += f"SNIPPET:\n{chunk_obj.text_content[:500]}...\n---\n"

            prompt = f"""You are a relevance ranking assistant. Given a Query Context and a batch of text chunk snippets, assign a relevance score to EACH chunk in the batch.

Query Context: "{query_context}"

Batch of Text Chunks to Evaluate:
---
{formatted_batch_for_prompt}
---

Instructions:
For EACH chunk in the batch (identified by its CHUNK_ID):
- Evaluate its direct relevance to the Query Context.
- Assign a relevance_score between 0.0 (not relevant at all) and 1.0 (highly relevant and directly addresses the query context).

Output ONLY a JSON list of objects. Each object MUST have two keys:
- "chunk_id": string (the CHUNK_ID provided in the input for that chunk)
- "relevance_score": float (your assigned score for that chunk)

Example Output for a batch of 2 chunks:
[
  {{"chunk_id": "id_abc", "relevance_score": 0.85}},
  {{"chunk_id": "id_xyz", "relevance_score": 0.30}}
]

Ensure your output is a valid JSON list of these objects, covering all chunks in the provided batch.
JSON list of scored chunks:
"""

            batch_request_id = f"{request_id}_rerank_batch_{i//batch_size}"

            result = await self._execute_llm_call(
                request_type="batch_chunk_reranking",
                prompt=prompt,
                model_info=model_info,
                api_config=api_config,
                user_id_for_internal_call=user_id, 
                request_id=batch_request_id,
                expected_output_format="json",
                is_cancelled_flag=is_cancelled_flag 
            )
            
            if is_cancelled_flag and is_cancelled_flag.is_set():
                for chunk_obj in batch_chunks: all_scored_chunks.append((chunk_obj, 0.0))
                continue


            if result.get("error"):
                logger.warning(f"[LLMReasoning:{batch_request_id}] Error reranking batch: {result['error']}. Assigning default low score to chunks in this batch.")
                for chunk_obj in batch_chunks:
                    all_scored_chunks.append((chunk_obj, 0.05))
                continue

            llm_scored_batch_data = result.get("output")
            
            # Robustness check: if output is a dict with one key whose value is a list, use that list.
            if isinstance(llm_scored_batch_data, dict) and len(llm_scored_batch_data) == 1:
                potential_list = next(iter(llm_scored_batch_data.values()), None)
                if isinstance(potential_list, list):
                    logger.warning(f"[LLMReasoning:{batch_request_id}] LLM returned a dict, but extracting the inner list.")
                    llm_scored_batch_data = potential_list

            if isinstance(llm_scored_batch_data, list):
                scores_for_current_batch_map = {}
                for item in llm_scored_batch_data:
                    if isinstance(item, dict) and "chunk_id" in item and "relevance_score" in item:
                        try:
                            score = float(item["relevance_score"])
                            scores_for_current_batch_map[item["chunk_id"]] = max(0.0, min(1.0, score))
                        except (ValueError, TypeError):
                            logger.warning(f"[LLMReasoning:{batch_request_id}] Could not parse score for chunk_id {item.get('chunk_id')} in batch. Score: {item.get('relevance_score')}")

                for chunk_obj in batch_chunks:
                    score_from_llm = scores_for_current_batch_map.get(chunk_obj.chunk_id, 0.1) 
                    all_scored_chunks.append((chunk_obj, score_from_llm))
            else:
                logger.warning(f"[LLMReasoning:{batch_request_id}] LLM output for batch reranking was not a list. Output: {llm_scored_batch_data}. Assigning default low score to chunks in this batch.")
                for chunk_obj in batch_chunks:
                    all_scored_chunks.append((chunk_obj, 0.05))
            
            if i + batch_size < len(chunks): 
                 await asyncio.sleep(0.1) 

        all_scored_chunks.sort(key=lambda x: x[1], reverse=True)
        return all_scored_chunks

    async def summarize_chunk_cluster(
        self,
        chunk_texts: List[str],
        cluster_topic: str,
        model_info: Dict[str, Any],
        api_config: Dict[str, Any],
        user_id: Optional[str], 
        request_id: Optional[str] = None,
        is_cancelled_flag: Optional[asyncio.Event] = None
    ) -> Dict[str, Any]:
        """
        Generates a focused summary from a small cluster of highly similar or topically related chunks (typically from the same URL).
        """
        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"summary": "[Cluster summarization cancelled.]", "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "error": "Operation cancelled."}

        if not chunk_texts:
            return {"summary": "", "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}}

        combined_text = "\n\n---\nNext Chunk:\n---\n\n".join([text[:2000] for text in chunk_texts[:5]])

        prompt = f"""You are a Research Synthesizer. Given a cluster of related text chunks all pertaining to the topic "{cluster_topic}", your task is to create a single, concise, and focused summary that captures the most important and salient information from these chunks regarding this topic.

Topic: "{cluster_topic}"

Provided Text Chunks (separated by "--- Next Chunk: ---"):
---
{combined_text}
---

Synthesize a focused summary (1-3 paragraphs) based ONLY on the provided text chunks and their relevance to the topic.
The summary should be dense with information, well-organized, and directly address the topic.
Do not introduce external information.
Output only the summary text.

Focused Summary:
"""

        result = await self._execute_llm_call(
            request_type="intra_url_cluster_summarization",
            prompt=prompt,
            model_info=model_info,
            api_config=api_config,
            user_id_for_internal_call=user_id, 
            request_id=request_id,
            expected_output_format="text",
            is_cancelled_flag=is_cancelled_flag 
        )

        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"summary": "[Cluster summarization cancelled.]", "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": "Operation cancelled during cluster summarization."}

        if result.get("error"):
            logger.error(f"[LLMReasoning:{request_id}] Error in _execute_llm_call for summarize_chunk_cluster (intra-URL): {result['error']}")
            return {"summary": f"[Intra-URL Cluster summarization failed: {result['error']}]", "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": result["error"]}

        return {"summary": result["output"], "usage": result["usage"]}

    async def summarize_cross_document_cluster_for_synthesis(
        self,
        chunks_in_cluster: List[models.ContentChunk],
        cluster_theme: str,
        model_info: Dict[str, Any],
        api_config: Dict[str, Any],
        user_id: Optional[str], 
        request_id: Optional[str] = None,
        is_cancelled_flag: Optional[asyncio.Event] = None
    ) -> Dict[str, Any]:
        """
        Generates a synthesized summary from a cluster of chunks originating from *different* documents,
        focusing on integrating information across sources. Uses Langchain's summarize_chain.
        Note: Cancellation for Langchain chains is complex. The primary check is before starting.
        """
        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"summary": "[Cross-document summarization cancelled.]", "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "error": "Operation cancelled."}

        if not chunks_in_cluster:
            return {"summary": "", "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "error": "No chunks provided for cross-document summarization."}

        langchain_documents = []
        for chunk in chunks_in_cluster:
            doc_metadata = {
                "source_url": chunk.original_url,
                "page_title": chunk.page_title or "N/A",
                "chunk_id": chunk.chunk_id,
                "trust_score": chunk.vector_metadata.get("trust_score", 0.5) if chunk.vector_metadata else 0.5
            }
            langchain_documents.append(Document(page_content=chunk.text_content, metadata=doc_metadata))

        try:
            langchain_llm = LiteLLMWrapper(
                model_info=model_info,
                api_config=api_config,
                settings=self.settings,
                llm_reasoning_instance=self,
                # user_id_for_internal_call=user_id # LiteLLMWrapper needs to be adapted if it uses _execute_llm_call internally for local models
            )
        except Exception as e_lc_llm_init:
            logger.error(f"[LLMReasoning:{request_id}] Failed to initialize LiteLLMWrapper for Langchain: {e_lc_llm_init}", exc_info=True)
            return {"summary": "", "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "error": f"Langchain LLM wrapper init failed: {e_lc_llm_init}"}

        try:
            chain = load_summarize_chain(langchain_llm, chain_type="map_reduce", verbose=False)
            themed_langchain_documents = [
                Document(page_content=f"Context: This document relates to the theme '{cluster_theme}'.\n\nContent:\n{doc.page_content}", metadata=doc.metadata)
                for doc in langchain_documents
            ]
            result_dict = await chain.ainvoke(input={"input_documents": themed_langchain_documents}, return_only_outputs=False)
            summary_text = result_dict.get("output_text", "")
            usage_info = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "note": "Token count from Langchain chain is approximate/not fully tracked."}
            return {"summary": summary_text.strip(), "usage": usage_info}

        except Exception as e_lc_chain:
            if isinstance(e_lc_chain, asyncio.CancelledError):
                return {"summary": "[Cross-document summarization cancelled.]", "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "error": "Operation cancelled during Langchain chain."}
            logger.error(f"[LLMReasoning:{request_id}] Error during Langchain cross-document summarization: {e_lc_chain}", exc_info=True)
            return {"summary": f"[Cross-document summarization failed: {e_lc_chain}]", "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "error": str(e_lc_chain)}

    async def resolve_coreferences_in_text(
        self,
        text_content: str,
        model_info: Dict[str, Any],
        api_config: Dict[str, Any],
        user_id: Optional[str], 
        request_id: Optional[str] = None,
        is_cancelled_flag: Optional[asyncio.Event] = None
    ) -> Dict[str, Any]:
        """
        Identifies coreferences (especially pronouns or ambiguous mentions) in the text
        and suggests replacements with the canonical entity they refer to.
        Returns the text with resolved references, or a mapping.
        For now, it will aim to return the modified text.
        """
        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"resolved_text": text_content, "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "error": "Operation cancelled."}

        if not text_content:
            return {"resolved_text": "", "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}}

        max_text_len_for_prompt = 4000

        prompt = f"""You are a linguistic preprocessor. Your task is to identify coreferences in the provided text, focusing on pronouns (he, she, it, they, him, her, them, its, their) and ambiguous noun phrases that refer to previously mentioned entities.
Replace these coreferences with the canonical (main) entity text they refer to.
Be careful not to over-replace or change the meaning. If a pronoun's antecedent is clear and very close, replacement might not be necessary unless it aids clarity for downstream entity/relationship extraction.
Prioritize resolving references that span across sentences or could be ambiguous for an automated system.

Output ONLY the processed text with coreferences resolved.

Original Text:
---
{text_content[:max_text_len_for_prompt]}
---

Example:
Original Text: "Dr. Eleanor Vance published her new paper on quantum entanglement. She argued that it could revolutionize computing. The paper was well-received by her peers."
Processed Text (with coreferences resolved): "Dr. Eleanor Vance published Dr. Eleanor Vance's new paper on quantum entanglement. Dr. Eleanor Vance argued that quantum entanglement could revolutionize computing. The paper was well-received by Dr. Eleanor Vance's peers."
(Note: This example is aggressive for illustration. Your replacement should be more nuanced based on ambiguity and distance).

Another Example:
Original Text: "The company X launched a new product. It is expected to perform well. They also announced a new CEO."
Processed Text: "The company X launched a new product. The new product is expected to perform well. Company X also announced a new CEO."


Processed Text with Coreferences Resolved:
"""

        result = await self._execute_llm_call(
            request_type="coreference_resolution",
            prompt=prompt,
            model_info=model_info,
            api_config=api_config,
            user_id_for_internal_call=user_id, 
            request_id=request_id,
            expected_output_format="text",
            is_cancelled_flag=is_cancelled_flag 
        )

        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"resolved_text": text_content, "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": "Operation cancelled during coreference resolution."}

        if result.get("error"):
            logger.error(f"[LLMReasoning:{request_id}] Error in _execute_llm_call for resolve_coreferences_in_text: {result['error']}")
            return {"resolved_text": text_content, "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": result["error"]}

        resolved_text = result.get("output", text_content)
        if not resolved_text or len(resolved_text) < len(text_content) * 0.5:
            logger.warning(f"[LLMReasoning:{request_id}] Coreference resolution resulted in empty or significantly shorter text. Falling back to original. Original len: {len(text_content)}, Resolved len: {len(resolved_text if resolved_text else '')}")
            return {"resolved_text": text_content, "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": "Resolution produced empty/short text"}

        return {"resolved_text": resolved_text, "usage": result["usage"]}

    async def check_expansion_snippet_relevance(
        self,
        reasoning_step_context: str,
        snippet_to_check: str,
        model_info: Dict[str, Any],
        api_config: Dict[str, Any],
        user_id: Optional[str], 
        request_id: str,
        max_tokens_for_check: int = 100,
        is_cancelled_flag: Optional[asyncio.Event] = None
    ) -> Dict[str, Any]:
        """
        Performs a lightweight LLM call to determine if an expansion chunk's snippet
        is relevant enough to the current reasoning step.
        Returns: {"is_relevant": bool, "reasoning": Optional[str], "usage": Optional[Dict], "error": Optional[str]}
        """
        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"is_relevant": False, "reasoning": "Operation cancelled.", "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "error": "Operation cancelled."}

        if not reasoning_step_context or not snippet_to_check:
            logger.warning(f"[LLMReasoning:{request_id}] Input validation failed for expansion snippet relevance: empty context or snippet.")
            return {
                "is_relevant": False,
                "reasoning": "Reasoning context or snippet was empty.",
                "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
                "error": "Input validation failed: Reasoning context or snippet empty."
            }

        max_snippet_len_for_prompt = 500

        prompt = f"""You are an AI assistant performing a quick relevance check.
Reasoning Context: "{reasoning_step_context}"

Text Snippet to Evaluate:
---
{snippet_to_check[:max_snippet_len_for_prompt]}
---

Is the 'Text Snippet' directly relevant and likely to provide useful information for the 'Reasoning Context'?
Answer with ONLY a JSON object containing:
- "is_relevant": boolean (true if relevant, false otherwise)
- "reasoning": string (a brief explanation for your decision, 1-2 sentences)

Example:
{{"is_relevant": true, "reasoning": "The snippet discusses the core topic mentioned in the reasoning context."}}

JSON Output:
"""
        call_model_info = model_info.copy()
        call_model_info["max_tokens"] = max_tokens_for_check

        result = await self._execute_llm_call(
            request_type="expansion_snippet_relevance_check_bool",
            prompt=prompt,
            model_info=call_model_info,
            api_config=api_config,
            user_id_for_internal_call=user_id, 
            request_id=request_id,
            expected_output_format="json",
            is_cancelled_flag=is_cancelled_flag 
        )
        
        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"is_relevant": False, "reasoning": "Operation cancelled.", "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": "Operation cancelled during relevance check."}

        usage = result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0})
        error = result.get("error")

        if error:
            logger.error(f"[LLMReasoning:{request_id}] Error in relevance check for expansion snippet: {error}")
            return {"is_relevant": False, "reasoning": "LLM call failed during relevance check.", "usage": usage, "error": error}

        output_data = result.get("output")
        if isinstance(output_data, dict) and \
           "is_relevant" in output_data and isinstance(output_data["is_relevant"], bool) and \
           "reasoning" in output_data and isinstance(output_data["reasoning"], str):
            return {
                "is_relevant": output_data["is_relevant"],
                "reasoning": output_data["reasoning"],
                "usage": usage,
                "error": None
            }
        else:
            logger.warning(f"[LLMReasoning:{request_id}] Invalid JSON structure from expansion snippet relevance check. Output: {output_data}")
            return {
                "is_relevant": False,
                "reasoning": "LLM output structure for relevance check was invalid.",
                "usage": usage,
                "error": "Invalid JSON structure from LLM for relevance check."
            }

    async def check_snippet_relevance_for_expansion(
        self,
        query_context: str,
        snippet: str,
        model_info: Dict[str, Any],
        api_config: Dict[str, Any],
        user_id: Optional[str], 
        request_id: Optional[str] = None,
        is_cancelled_flag: Optional[asyncio.Event] = None
    ) -> Dict[str, Any]:
        """
        Checks the relevance of a short text snippet to a given query context using an LLM.
        Aims to return a numerical relevance score.
        """
        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"score": 0.0, "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "error": "Operation cancelled."}

        if not query_context or not snippet:
            return {"score": 0.0, "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "error": "Query context or snippet missing."}

        max_snippet_len = 500

        prompt = f"""Evaluate the relevance of the following 'Text Snippet' to the 'Query Context'.
Provide a relevance score between 0.0 (not relevant at all) and 1.0 (highly relevant and directly related).
Focus ONLY on the information present in the snippet.

Query Context: "{query_context}"

Text Snippet:
---
{snippet[:max_snippet_len]}
---

Output a single JSON object with one key "relevance_score" and a float value.
Example: {{"relevance_score": 0.85}}
Ensure the output is ONLY the JSON object.

JSON Output:
"""

        result = await self._execute_llm_call(
            request_type="expansion_snippet_relevance_check",
            prompt=prompt,
            model_info=model_info,
            api_config=api_config,
            user_id_for_internal_call=user_id,
            request_id=request_id,
            expected_output_format="json",
            is_cancelled_flag=is_cancelled_flag 
        )
        
        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"score": 0.0, "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": "Operation cancelled during snippet relevance check."}

        score = 0.0
        if result.get("error"):
            logger.warning(f"[LLMReasoning:{request_id}] Error in relevance check for expansion snippet: {result['error']}")
        elif isinstance(result.get("output"), dict) and "relevance_score" in result["output"]:
            try:
                raw_score = result["output"]["relevance_score"]
                parsed_score = float(raw_score)
                score = max(0.0, min(1.0, parsed_score))
            except (ValueError, TypeError) as e_score_parse:
                logger.warning(f"[LLMReasoning:{request_id}] Could not parse relevance_score '{result['output']['relevance_score']}' as float. Error: {e_score_parse}")
        else:
            logger.warning(f"[LLMReasoning:{request_id}] Invalid or missing 'relevance_score' in LLM output for snippet check. Output: {result.get('output')}")

        return {"score": score, "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": result.get("error")}

    async def analyze_table_data(
        self,
        table_markdown: str,
        model_info: Dict[str, Any],
        api_config: Dict[str, Any],
        user_id: Optional[str], 
        request_id: Optional[str] = None,
        document_name: Optional[str] = None,
        doc_id: Optional[str] = None,
        table_index: Optional[int] = None,
        is_cancelled_flag: Optional[asyncio.Event] = None
    ) -> Dict[str, Any]:
        """
        Analyzes a Markdown table using an LLM to extract a summary and key insights.
        """
        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"analysis": None, "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "error": "Operation cancelled."}

        if not table_markdown or not table_markdown.strip():
            return {"analysis": None, "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "error": "Table markdown content is empty."}

        max_table_len_for_prompt = 3000

        context_header = f"You are analyzing Table {table_index if table_index is not None else 'N/A'} "
        if document_name:
            context_header += f"from a document titled '{document_name}' (ID: {doc_id or 'N/A'}). "

        prompt = f"""{context_header}
The following is a data table presented in Markdown format:
---
{table_markdown[:max_table_len_for_prompt]}
---
{'(Table content may be truncated if very large)' if len(table_markdown) > max_table_len_for_prompt else ''}

Please perform the following tasks based ONLY on the content of this table:
1.  **Summarize**: Provide a concise summary (1-3 sentences) of the main information or purpose of this table. What key data or trends does it represent?
2.  **Key Insights/Observations**: List 2-3 bullet points of the most significant insights, patterns, or specific data points that can be directly derived from this table.
3.  **Potential Entities**: If applicable, list up to 3-5 key entities (e.g., names, products, categories) mentioned in the table that seem important.

Output ONLY a JSON object with the following keys: "table_summary" (string), "key_insights" (list of strings), and "potential_entities" (list of strings).
If the table is too sparse or unclear to derive meaningful information for a field, provide an empty string or list for that field.

Example Output:
{{{{
  "table_summary": "This table shows quarterly sales figures for different product categories over the last year, indicating strong growth in electronics.",
  "key_insights": [
    "Electronics category had the highest sales in Q4.",
    "Software sales showed a slight decline in Q2 but recovered in Q3.",
    "Overall sales increased by 15% year-over-year."
  ],
  "potential_entities": ["Electronics", "Software", "Hardware", "Q1 Sales", "Q4 Growth Rate"]
}}}}

JSON Output:
"""

        result = await self._execute_llm_call(
            request_type="table_analysis",
            prompt=prompt,
            model_info=model_info,
            api_config=api_config,
            user_id_for_internal_call=user_id, 
            request_id=request_id,
            expected_output_format="json",
            is_cancelled_flag=is_cancelled_flag 
        )
        
        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"analysis": None, "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": "Operation cancelled during table analysis."}


        if result.get("error"):
            logger.error(f"[LLMReasoning:{request_id}] Error in _execute_llm_call for analyze_table_data: {result['error']}")
            return {"analysis": None, "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": result["error"]}

        output_data = result.get("output")
        if isinstance(output_data, dict) and \
           "table_summary" in output_data and \
           "key_insights" in output_data and \
           "potential_entities" in output_data:
            return {"analysis": output_data, "usage": result["usage"]}
        else:
            logger.warning(f"[LLMReasoning:{request_id}] Table analysis output did not match expected structure: {output_data}")
            return {"analysis": None, "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": "Output structure mismatch for table analysis."}

    async def select_best_links_to_follow(
        self,
        original_user_query: str,
        links: List[models.CandidateLinkToExplore],
        uncovered_reasoning_steps: List[str],
        model_info: Dict[str, Any],
        api_config: Dict[str, Any],
        user_id: Optional[str],
        request_id: Optional[str] = None,
        top_n: int = 3,
        is_cancelled_flag: Optional[asyncio.Event] = None
    ) -> Dict[str, Any]:
        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"selected_links": [], "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "error": "Operation cancelled."}

        if not links:
            return {"selected_links": [], "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}}

        # --- Token-aware batching logic using transformers.AutoTokenizer ---
        try:
            # Use a standard, fast tokenizer as a general-purpose estimator.
            tokenizer = AutoTokenizer.from_pretrained("gpt2")
        except Exception as e_tok:
            logger.error(f"Could not load AutoTokenizer: {e_tok}. Batching will be disabled.", exc_info=True)
            # Fallback to old behavior if tokenizer fails to load
            return {"selected_links": links[:top_n], "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "error": "Tokenizer failed to load"}

        SAFE_PROMPT_TOKEN_LIMIT = 30000
        
        formatted_uncovered_steps = "\n".join([f"- {step}" for step in uncovered_reasoning_steps])
        base_prompt_template = f"""You are a Research Assistant helping to prioritize web links for further exploration.
Your primary goal is to select links that are most relevant to fulfilling the 'Original User Query' AND help cover the 'Uncovered Research Objectives'.

Original User Query: "{original_user_query}"

Uncovered Research Objectives:
{formatted_uncovered_steps}

Candidate Links (with their source page, link text, and surrounding context):
{{links_batch}}

Instructions for selecting the top {top_n} links from this batch:
1.  **Overall Relevance:** Prioritize links that directly address the 'Original User Query'.
2.  **Objective Coverage:** Select links that are highly likely to provide information for the 'Uncovered Research Objectives'.
3.  **Context is Key:** Pay very close attention to the 'Link Text' and especially the 'Context Around Link'.
4.  **URL Clues:** Consider the URL itself. Does the domain or path seem relevant?
5.  **Avoid Generic/Utility Links:** Deprioritize links that seem to lead to generic homepages, contact pages, etc.

Output ONLY a JSON list of the URLs (strings) of your selected top {top_n} links from this batch, ordered from most to least promising. If none are relevant, return an empty list.

Example Output (for top_n=2):
[
  "https://example.com/relevant-article-1",
  "https://another-site.org/specific-topic-details"
]

JSON list of selected URLs:
"""
        
        base_prompt_token_count = len(tokenizer.encode(base_prompt_template.format(links_batch="")))

        all_selected_urls = []
        total_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        link_batches: List[List[models.CandidateLinkToExplore]] = []
        current_batch: List[models.CandidateLinkToExplore] = []
        current_batch_token_count = base_prompt_token_count

        for link_obj in links:
            link_text = f"{len(current_batch) + 1}. URL: {link_obj.url}\n   Link Text: {link_obj.anchor_text or 'N/A'}\n   Context Around Link: {link_obj.context_around_link or 'N/A'}\n   Source Page: {link_obj.source_page_url}\n\n"
            link_token_count = len(tokenizer.encode(link_text))

            if current_batch and (current_batch_token_count + link_token_count > SAFE_PROMPT_TOKEN_LIMIT):
                link_batches.append(current_batch)
                current_batch = [link_obj]
                current_batch_token_count = base_prompt_token_count + link_token_count
            else:
                current_batch.append(link_obj)
                current_batch_token_count += link_token_count
        
        if current_batch:
            link_batches.append(current_batch)

        for i, batch in enumerate(link_batches):
            if is_cancelled_flag and is_cancelled_flag.is_set():
                break

            formatted_links_batch = ""
            for j, link_obj in enumerate(batch):
                formatted_links_batch += f"{j+1}. URL: {link_obj.url}\n   Link Text: {link_obj.anchor_text or 'N/A'}\n   Context Around Link: {link_obj.context_around_link or 'N/A'}\n   Source Page: {link_obj.source_page_url}\n\n"
            
            prompt = base_prompt_template.format(links_batch=formatted_links_batch)
            
            link_selection_model_info = model_info.copy()

            result = await self._execute_llm_call(
                request_type="link_selection_batch",
                prompt=prompt,
                model_info=link_selection_model_info,
                api_config=api_config,
                user_id_for_internal_call=user_id,
                request_id=f"{request_id}_batch_{i}",
                expected_output_format="json",
                is_cancelled_flag=is_cancelled_flag
            )

            usage = result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0})
            total_usage["prompt_tokens"] += usage.get("prompt_tokens", 0)
            total_usage["completion_tokens"] += usage.get("completion_tokens", 0)
            total_usage["total_tokens"] += usage.get("total_tokens", 0)

            if result.get("error"):
                logger.error(f"[LLMReasoning:{request_id}] Error processing link selection batch {i}: {result['error']}")
                continue

            selected_urls_from_batch = result.get("output")
            if isinstance(selected_urls_from_batch, list) and all(isinstance(url, str) for url in selected_urls_from_batch):
                all_selected_urls.extend(selected_urls_from_batch)
            else:
                logger.warning(f"[LLMReasoning:{request_id}] Link selection batch {i} output was not a list of strings: {selected_urls_from_batch}")

        unique_selected_urls = list(dict.fromkeys(all_selected_urls))
        url_to_link_obj_map = {link_obj.url: link_obj for link_obj in links}
        final_selected_links = [url_to_link_obj_map[url] for url in unique_selected_urls if url in url_to_link_obj_map]
        
        return {"selected_links": final_selected_links[:top_n], "usage": total_usage}

    async def get_holistic_initial_answer(
        self,
        original_query: str,
        model_info: Dict[str, Any],
        api_config: Dict[str, Any],
        user_id: Optional[str], 
        request_id: Optional[str] = None,
        is_cancelled_flag: Optional[asyncio.Event] = None
    ) -> Dict[str, Any]:
        """
        Asks the LLM to provide a comprehensive initial answer to the user's query
        based on its general knowledge.
        """
        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"answer": None, "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "error": "Operation cancelled."}

        prompt = f"""User's Original Question: "{original_query}"

Based on your general knowledge, please provide a comprehensive, well-structured initial answer to the user's question above, aiming for approximately {self.settings.LIVE_SEARCH_PREFLIGHT_TARGET_WORD_COUNT} words.
Aim for a balanced overview. If the question is complex, try to address its main facets.
This answer will serve as an initial perspective before detailed, evidence-based research is conducted.

Comprehensive Initial Answer (approx. {self.settings.LIVE_SEARCH_PREFLIGHT_TARGET_WORD_COUNT} words):"""
        
        holistic_answer_model_info = model_info.copy()
        # max_tokens is globally removed in _execute_llm_call, relying on prompt.

        result = await self._execute_llm_call(
            request_type="holistic_preflight_answer",
            prompt=prompt,
            model_info=holistic_answer_model_info,
            api_config=api_config,
            user_id_for_internal_call=user_id, 
            request_id=request_id,
            expected_output_format="text",
            is_cancelled_flag=is_cancelled_flag 
        )
        
        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"answer": None, "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": "Operation cancelled during holistic answer generation."}


        answer_text = result.get("output")
        error = result.get("error")
        usage = result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0})

        if error:
            logger.error(f"[LLMReasoning:{request_id}] Error in get_holistic_initial_answer: {error}")
            return {"answer": None, "usage": usage, "error": error}

        if not answer_text or "i do not have enough information" in answer_text.lower() or "i cannot answer" in answer_text.lower():
            return {"answer": None, "usage": usage, "error": "LLM unable to provide initial holistic answer."}

        return {"answer": answer_text, "usage": usage, "error": None}

    async def get_strategic_pivot_suggestions(
        self,
        original_user_query: str,
        current_research_plan: List[Dict[str, Any]], 
        current_stagnation_info: Dict[str, Any], 
        model_info: Dict[str, Any],
        api_config: Dict[str, Any],
        user_id: Optional[str], 
        request_id: Optional[str] = None,
        is_cancelled_flag: Optional[asyncio.Event] = None
    ) -> Dict[str, Any]:
        """
        Acts as a strategist to suggest pivots when research is stuck.
        """
        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"critique": "Operation cancelled.", "abandon_step_names": [], "new_strategic_questions": [], "next_query_type_suggestions": [], "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "error": "Operation cancelled."}

        formatted_plan = "\nCurrent Research Plan Status:\n"
        for i, dp in enumerate(current_research_plan[:15]): 
            formatted_plan += f"- DP {i+1}: {dp.get('name', 'N/A')} (Status: {dp.get('status', 'N/A')}, Verification: {dp.get('verification_status', 'N/A')})\n"
            if dp.get('retrieval_action') and dp.get('retrieval_action') not in ["NO_SEARCH_NEEDED", "NONE"]:
                formatted_plan += f"  Action: {dp['retrieval_action'][:100]}\n"

        stagnation_reason = current_stagnation_info.get("reason_for_pivot_signal", "General stagnation or lack of progress.")

        prompt = f"""You are a Senior Research Strategist. The current research process for the query below seems to be stagnating or ineffective.
Reason for Stagnation: {stagnation_reason}

Original User Query: "{original_user_query}"
{formatted_plan}

Your task is to provide strategic guidance to get the research back on track:
1.  **Critique (Briefly):** What might be going wrong with the current approach based on the plan and stagnation reason?
2.  **Deprioritize/Abandon:** Identify 1-2 data points/objectives from the current plan that seem least promising or might be causing the stagnation and could be temporarily deprioritized or abandoned. List their full 'name'.
3.  **New Strategic Questions/Angles:** Propose 1-3 NEW, high-level research questions or alternative angles that could explore different facets of the original query or break the current impasse. These should be distinct from the existing plan.
4.  **Next Query Type Suggestions:** Suggest 1-2 general *types* of queries or approaches for the next hop (e.g., "broader conceptual queries on [topic]", "historical context queries for [entity]", "queries exploring alternative viewpoints on [issue]", "comparative analysis queries between [X] and [Y]").

Output ONLY a JSON object with the following keys:
- "critique": "string" (Your brief critique)
- "abandon_step_names": ["list of full names of data points to deprioritize/abandon"] (empty if none)
- "new_strategic_questions": ["list of new high-level question strings"] (empty if no new angles)
- "next_query_type_suggestions": ["list of query type suggestion strings"] (empty if no specific types)

Example Output:
{{{{
  "critique": "The research seems too narrowly focused on technical specifications and is missing the broader market context.",
  "abandon_step_names": ["Specific manufacturing process of component Y"],
  "new_strategic_questions": [
    "What are the primary market drivers for [main product category]?",
    "Who are the key competitors to [core_entity] and what are their main strategies?"
  ],
  "next_query_type_suggestions": [
    "Market analysis queries for [main product category]",
    "Competitor analysis queries for [core_entity]"
  ]
}}}}

JSON Output:
"""
        strategist_model_info = model_info.copy()
        strategist_model_info["temperature"] = model_info.get("temperature_for_strategist", 0.6)

        result = await self._execute_llm_call(
            request_type="strategic_pivot_suggestions",
            prompt=prompt,
            model_info=strategist_model_info,
            api_config=api_config,
            user_id_for_internal_call=user_id, 
            request_id=request_id,
            expected_output_format="json",
            is_cancelled_flag=is_cancelled_flag 
        )
        
        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"critique": "Operation cancelled.", "abandon_step_names": [], "new_strategic_questions": [], "next_query_type_suggestions": [], "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": "Operation cancelled during strategic pivot."}


        usage = result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0})
        error = result.get("error")

        if error:
            logger.error(f"[LLMReasoning:{request_id}] Error getting strategic pivot suggestions: {error}")
            return {"critique": "Error in strategic analysis.", "abandon_step_names": [], "new_strategic_questions": [], "next_query_type_suggestions": [], "usage": usage, "error": error}

        output_data = result.get("output")
        if isinstance(output_data, dict) and \
           "critique" in output_data and \
           "abandon_step_names" in output_data and \
           "new_strategic_questions" in output_data and \
           "next_query_type_suggestions" in output_data:
            return {**output_data, "usage": usage, "error": None}
        else:
            logger.error(f"[LLMReasoning:{request_id}] Strategic pivot suggestions output was not in the expected format: {output_data}")
            return {"critique": "Malformed output from strategic analysis.", "abandon_step_names": [], "new_strategic_questions": [], "next_query_type_suggestions": [], "usage": usage, "error": "Malformed LLM output for strategist"}

    async def filter_chunks_for_quality(
        self,
        query_context: str,
        chunks: List[models.ContentChunk],
        model_info: Dict[str, Any],
        api_config: Dict[str, Any],
        user_id: Optional[str], 
        request_id: Optional[str] = None,
        top_n: int = 15,
        is_cancelled_flag: Optional[asyncio.Event] = None
    ) -> Dict[str, Any]:
        """
        Uses an LLM to filter a list of ContentChunks based on their quality and relevance.
        Returns a list of the top_n best chunks *from the filtered set*.
        """
        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"filtered_chunks": chunks[:top_n], "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "error": "Operation cancelled."}

        if not chunks:
            return {"filtered_chunks": [], "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}}

        candidate_batch_size = min(top_n * 2, 20)

        formatted_chunks_for_prompt = ""
        chunk_id_to_object_map = {chunk.chunk_id: chunk for chunk in chunks[:candidate_batch_size]}

        for i, chunk_obj in enumerate(chunks[:candidate_batch_size]):
            source_info = f"(Source: {chunk_obj.original_url}, Chunk ID: {chunk_obj.chunk_id})"
            formatted_chunks_for_prompt += f"Chunk {i+1} {source_info}:\n\"{chunk_obj.text_content[:500]}...\"\n\n"

        prompt = f"""You are a Quality Assurance Editor. Review the following text chunks and select up to {top_n} of the HIGHEST-QUALITY ones based on their informativeness, clarity, and direct relevance to the Query Context.

Query Context: "{query_context}"

Candidate Chunks (snippets provided):
{formatted_chunks_for_prompt}

Instructions:
- Evaluate each chunk for its direct relevance to the Query Context.
- Assess the clarity and coherence of the text.
- Prioritize chunks that offer substantial, specific information over vague or overly general statements.
- Avoid chunks that are primarily navigation, boilerplate, or advertisements if discernible.
- If multiple chunks from the same source are very similar, prefer the most comprehensive or best-phrased one.

Output ONLY a JSON list of the Chunk IDs (strings) of your selected top chunks (up to {top_n}), ordered from most to least preferred.
If fewer than {top_n} chunks meet a high quality standard, return only those that do. If no chunks are suitable, return an empty list.

Example Output (for top_n=2):
[
  "chunk_id_abc",
  "chunk_id_xyz"
]
Example Output (for top_n=3, if only 1 is good):
[
  "chunk_id_def"
]


JSON list of selected Chunk IDs:
"""
        quality_filter_model_info = model_info.copy()

        result = await self._execute_llm_call(
            request_type="quality_filter_chunks",
            prompt=prompt,
            model_info=quality_filter_model_info,
            api_config=api_config,
            user_id_for_internal_call=user_id, 
            request_id=request_id,
            expected_output_format="json",
            is_cancelled_flag=is_cancelled_flag 
        )
        
        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"filtered_chunks": chunks[:top_n], "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": "Operation cancelled during chunk quality filtering."}


        usage = result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0})
        error = result.get("error")

        if error:
            logger.error(f"[LLMReasoning:{request_id}] Error filtering chunks for quality: {error}. Returning original top_n chunks as fallback.")
            return {"filtered_chunks": chunks[:top_n], "usage": usage, "error": error}

        selected_chunk_ids_from_llm = result.get("output")

        # Robustness check: if output is a dict with one key whose value is a list, use that list.
        if isinstance(selected_chunk_ids_from_llm, dict) and len(selected_chunk_ids_from_llm) == 1:
            potential_list = next(iter(llm_output_data.values()), None)
            if isinstance(potential_list, list):
                logger.warning(f"[LLMReasoning:{request_id}] LLM returned a dict for quality filter, but extracting the inner list.")
                selected_chunk_ids_from_llm = potential_list

        if isinstance(selected_chunk_ids_from_llm, list) and all(isinstance(cid, str) for cid in selected_chunk_ids_from_llm):
            final_selected_chunks = []
            for cid in selected_chunk_ids_from_llm:
                if cid in chunk_id_to_object_map:
                    final_selected_chunks.append(chunk_id_to_object_map[cid])

            return {"filtered_chunks": final_selected_chunks[:top_n], "usage": usage}
        else:
            logger.warning(f"[LLMReasoning:{request_id}] Quality filter output was not a list of chunk IDs: {selected_chunk_ids_from_llm}. Returning original top_n chunks.")
            return {"filtered_chunks": chunks[:top_n], "usage": usage, "error": "LLM output for quality filter was not a list of chunk IDs."}

    async def filter_queries_for_relevance_and_novelty(
        self,
        original_user_query: str,
        candidate_queries: List[str],
        executed_queries: List[str],
        model_info: Dict[str, Any],
        api_config: Dict[str, Any],
        user_id: Optional[str], 
        request_id: Optional[str] = None,
        max_queries_to_return: int = 5,
        is_cancelled_flag: Optional[asyncio.Event] = None
    ) -> Dict[str, Any]:
        """
        Filters a list of candidate queries based on their relevance to the original user query
        and novelty compared to already executed queries.
        """
        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"filtered_queries": candidate_queries[:max_queries_to_return], "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "error": "Operation cancelled."}


        if not candidate_queries:
            return {"filtered_queries": [], "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}}

        # Truncate the list of executed queries to avoid an overly long prompt
        truncated_executed_queries = executed_queries[-20:] if executed_queries else []

        formatted_candidates = "\n".join([f"- \"{q}\"" for q in candidate_queries])
        formatted_executed = "\n".join([f"- \"{q}\"" for q in truncated_executed_queries]) if truncated_executed_queries else "None"

        prompt = f"""You are a Query Optimization Specialist. Your task is to review a list of 'Candidate Queries' and filter them to select the most relevant and novel ones for the next research step.

Original User Query: "{original_user_query}"

Candidate Queries to Evaluate:
{formatted_candidates}

Previously Executed Queries (for context, avoid redundancy):
{formatted_executed}

Instructions:
1.  **Relevance to Original Query:** Ensure each selected query directly helps answer the 'Original User Query'.
2.  **Novelty:** Deprioritize candidate queries that are very similar in intent or wording to any 'Previously Executed Queries'.
3.  **Specificity & Actionability:** Prefer queries that are specific and likely to yield useful, distinct information. Avoid overly broad or vague queries.
4.  **Preserve "ASK_LLM:" Tasks:** If a candidate query starts with "ASK_LLM:", it represents an internal analytical task, not a web search. Such tasks should generally be preserved and included in the output if they are relevant and novel, as they will be routed to an internal LLM call, not a web search engine. Do not filter these out simply because they are not web search queries.
5.  **Avoid Redundant Internal Tasks:** If multiple "ASK_LLM:" tasks are very similar, select only the most comprehensive or best-phrased one.
6.  **Limit:** Select up to {max_queries_to_return} of the best queries/tasks based on the above criteria.

Output ONLY a JSON list of up to {max_queries_to_return} selected query strings or "ASK_LLM:" task descriptions. If no candidate queries/tasks are suitable, output an empty list.

Example Output (for max_queries_to_return=2, if two are selected):
[
  "specific novel query A related to original query",
  "another distinct and relevant query B"
]
Example Output (if only one is selected):
[
  "highly_relevant_and_novel_query_c"
]

IMPORTANT: Your output MUST be ONLY a flat JSON list of strings. Do NOT output a JSON object/dictionary. Do NOT include any other keys or structures.
JSON list of selected query strings:
"""
        filter_model_info = model_info.copy()
        # max_tokens is now removed from here and will be handled by _execute_llm_call or prompt engineering.

        result = await self._execute_llm_call(
            request_type="filter_next_hop_queries",
            prompt=prompt,
            model_info=filter_model_info,
            api_config=api_config,
            user_id_for_internal_call=user_id, 
            request_id=request_id,
            expected_output_format="json",
            is_cancelled_flag=is_cancelled_flag 
        )
        
        default_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {
                "filtered_queries": candidate_queries[:max_queries_to_return], # Return candidates if cancelled mid-process
                "usage": result.get("usage", default_usage) if result else default_usage,
                "error": "Operation cancelled during query filtering."
            }

        if result.get("error"):
            logger.error(f"[LLMReasoning:{request_id}] LLM call failed for filter_queries_for_relevance_and_novelty: {result['error']}")
            return {
                "filtered_queries": [],
                "usage": result.get("usage", default_usage),
                "error": result['error']
            }

        llm_output = result.get("output")
        current_provider = model_info.get("provider_name", "").lower()

        if result.get("error") and current_provider == "google" and \
           ("LLM finished due to length but returned no content" in result.get("error") or "LLM response was empty" in result.get("error")):
            logger.warning(f"[{request_id}] LLM query filter (Gemini) failed: {result.get('error')}. Using basic non-LLM fallback.")
            executed_queries_lower = {eq.lower() for eq in executed_queries}
            fallback_filtered_queries = [
                q for q in candidate_queries if q.lower() not in executed_queries_lower
            ]
            # Further simple de-duplication of candidates themselves
            unique_fallback_queries = list(dict.fromkeys(fallback_filtered_queries))
            return {
                "filtered_queries": unique_fallback_queries[:max_queries_to_return],
                "usage": result.get("usage", default_usage),
                "error": "LLM query filter (Gemini) failed, used basic fallback." # Keep error to indicate fallback
            }

        if isinstance(llm_output, list) and all(isinstance(item, str) for item in llm_output):
            return {
                "filtered_queries": llm_output[:max_queries_to_return],
                "usage": result.get("usage", default_usage)
            }
        else:
            logger.error(f"[LLMReasoning:{request_id}] Query filter output was not a list of strings as expected. Output type: {type(llm_output)}, Content: {str(llm_output)[:500]}")
            # Fallback for general malformed output from any provider
            executed_queries_lower = {eq.lower() for eq in executed_queries}
            fallback_filtered_queries_general = [
                q for q in candidate_queries if q.lower() not in executed_queries_lower
            ]
            unique_fallback_queries_general = list(dict.fromkeys(fallback_filtered_queries_general))
            return {
                "filtered_queries": unique_fallback_queries_general[:max_queries_to_return],
                "usage": result.get("usage", default_usage),
                "error": "LLM output for query filter was not a list of strings, used basic fallback."
            }

    async def generate_hypothetical_document(
        self,
        query: str, # Parameter name is 'query'
        model_info: Dict[str, Any],
        api_config: Dict[str, Any],
        user_id: Optional[str],
        request_id: Optional[str] = None,
        is_cancelled_flag: Optional[asyncio.Event] = None
    ) -> Dict[str, Any]:
        """
        Generates a hypothetical document or answer for a given query or reasoning step.
        This is used to improve semantic search relevance (e.g., HyDE).
        """
        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"hypothetical_document": None, "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "error": "Operation cancelled."}

        hyde_model_info = model_info.copy()
        provider_for_hyde_prompt = hyde_model_info.get("provider_name", "").lower()

        if provider_for_hyde_prompt == "google":
            # Prompt engineered for Gemini to control length via instruction
            prompt = f"""Write a short, factual paragraph (max 160 words) that directly answers the following question:
Question: "{query}"
"""
        else:
            prompt = f"""Given the following query or research step, please write a concise, factual paragraph (approximately {self.settings.LIVE_SEARCH_HYDE_TARGET_WORD_COUNT}) that directly and ideally answers it.
This document should be written as if it's the best possible source of information for this query/step.
Focus on providing a direct and factual answer. Avoid conversational filler.

Query/Research Step: "{query}"

Ideal Hypothetical Paragraph (approx. {self.settings.LIVE_SEARCH_HYDE_TARGET_WORD_COUNT}):
"""
        
        # Use a moderate temperature, allow for some creativity but keep it factual
        hyde_model_info["temperature"] = model_info.get("temperature_for_hyde", 0.3)
        
        # For Gemini, do not set max_tokens here; rely on prompt engineering and model defaults.
        # For other models, we also rely on prompt engineering now.
        # hyde_model_info["max_tokens"] = model_info.get("max_tokens_for_hyde", 500)

        result = await self._execute_llm_call(
            request_type="generate_hypothetical_document",
            prompt=prompt,
            model_info=hyde_model_info,
            api_config=api_config,
            user_id_for_internal_call=user_id,
            request_id=request_id,
            expected_output_format="text",
            is_cancelled_flag=is_cancelled_flag
        )

        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"hypothetical_document": None, "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": "Operation cancelled during hypothetical document generation."}

        hypothetical_document_text = result.get("output")
        error = result.get("error")
        usage = result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0})

        if error:
            logger.error(f"[LLMReasoning:{request_id}] Error generating hypothetical document: {error}")
            # Specific fallback for Gemini if it's the "length but no content" error
            if provider_for_hyde_prompt == "google" and error == "LLM finished due to length but returned no content.":
                logger.warning(f"[{request_id}] HyDE generation failed specifically with Gemini (length error, no content). Skipping HyDE for query: '{query}'.")
                return {"hypothetical_document": None, "usage": usage, "error": "HyDE generation failed with Gemini (length error, no content), skipping HyDE."}
            return {"hypothetical_document": None, "usage": usage, "error": error}
        
        if not hypothetical_document_text:
            logger.warning(f"[LLMReasoning:{request_id}] Hypothetical document generation resulted in empty text for query: '{query}'")
            # Specific fallback for Gemini if it's an empty text response
            if provider_for_hyde_prompt == "google":
                 logger.warning(f"[{request_id}] HyDE generation with Gemini resulted in empty text for query: '{query}'. Skipping HyDE.")
                 return {"hypothetical_document": None, "usage": usage, "error": "Generated hypothetical document was empty (Gemini)."}
            return {"hypothetical_document": None, "usage": usage, "error": "Generated hypothetical document was empty."}

        return {"hypothetical_document": hypothetical_document_text.strip(), "usage": usage, "error": None}

    async def generate_alternative_query(
        self,
        original_query: str,
        model_info: Dict[str, Any],
        api_config: Dict[str, Any],
        user_id: Optional[str],
        request_id: Optional[str] = None,
        is_cancelled_flag: Optional[asyncio.Event] = None
    ) -> Dict[str, Any]:
        """
        Generates an alternative phrasing for a given query, aiming for better search results.
        """
        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"alternative_query": original_query, "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "error": "Operation cancelled."}

        prompt = f"""Given the following original search query, which may have yielded poor or no results, please provide one distinct alternative phrasing.
The alternative should aim to capture the same core intent but use different keywords or structure to potentially improve search outcomes.
Focus on creating a concise, keyword-based query suitable for a web search engine.

Original Query: "{original_query}"

Output ONLY the single alternative query string. Do not include any other text, labels, or JSON formatting.

Alternative Query:"""
        
        alt_query_model_info = model_info.copy()
        alt_query_model_info["temperature"] = model_info.get("temperature_for_alt_query", 0.7) 

        result = await self._execute_llm_call(
            request_type="generate_alternative_query",
            prompt=prompt,
            model_info=alt_query_model_info,
            api_config=api_config,
            user_id_for_internal_call=user_id,
            request_id=request_id,
            expected_output_format="text",
            is_cancelled_flag=is_cancelled_flag
        )

        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"alternative_query": original_query, "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": "Operation cancelled during alternative query generation."}

        alternative_query_text = result.get("output")
        error = result.get("error")
        usage = result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0})

        if error or not alternative_query_text:
            logger.error(f"[LLMReasoning:{request_id}] Error generating alternative query for '{original_query}': {error or 'Empty response'}. Using original.")
            return {"alternative_query": original_query, "usage": usage, "error": error or "Generated alternative query was empty."}
        
        cleaned_alt_query = alternative_query_text.strip().strip('"')
        if not cleaned_alt_query or cleaned_alt_query.lower() == original_query.lower():
            return {"alternative_query": original_query, "usage": usage, "error": "Alternative query same as original or empty."}

        return {"alternative_query": cleaned_alt_query, "usage": usage, "error": None}

    async def generate_queries_from_comptroller_feedback(
        self,
        comptroller_feedback: List[str],
        original_query: str,
        model_info: Dict[str, Any],
        api_config: Dict[str, Any],
        user_id: Optional[str],
        request_id: Optional[str] = None,
        is_cancelled_flag: Optional[asyncio.Event] = None
    ) -> Dict[str, Any]:
        """
        Generates new search queries based on Comptroller feedback.
        """
        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"queries": [], "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "error": "Operation cancelled."}

        if not comptroller_feedback:
            return {"queries": [], "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}}

        formatted_feedback = "\n".join([f"- {fb}" for fb in comptroller_feedback])

        prompt = f"""You are a Research Query Specialist. A previous research attempt for the query "{original_query}" was reviewed, and the following feedback was provided to guide the next research iteration:

Comptroller Feedback:
{formatted_feedback}

Based on this feedback, generate 1-3 concise, keyword-based search queries suitable for a web search engine (like Google or DuckDuckGo) that directly address the feedback points.
These queries should be distinct and aim to find information that was missing or correct inaccuracies identified in the feedback.
Focus on creating actionable search terms.

Output ONLY a JSON list of the new query strings. If no new queries can be meaningfully derived from the feedback, output an empty list.

Example Output:
[
  "revised search query based on feedback 1",
  "another targeted query for feedback point 2"
]

JSON list of new query strings:
"""
        
        query_gen_model_info = model_info.copy()
        query_gen_model_info["temperature"] = model_info.get("temperature_for_comptroller_query_gen", 0.4)

        result = await self._execute_llm_call(
            request_type="generate_queries_from_comptroller_feedback",
            prompt=prompt,
            model_info=query_gen_model_info,
            api_config=api_config,
            user_id_for_internal_call=user_id,
            request_id=request_id,
            expected_output_format="json",
            is_cancelled_flag=is_cancelled_flag
        )

        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"queries": [], "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": "Operation cancelled."}

        queries = []
        error = result.get("error")
        usage = result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0})

        if error:
            logger.error(f"[LLMReasoning:{request_id}] Error generating queries from comptroller feedback: {error}")
        elif isinstance(result.get("output"), list) and all(isinstance(q, str) for q in result["output"]):
            queries = result["output"]
        else:
            logger.warning(f"[LLMReasoning:{request_id}] Output for comptroller feedback query generation was not a list of strings: {result.get('output')}")
            error = "LLM output was not a list of strings."
            
        return {"queries": queries, "usage": usage, "error": error}
        
    async def summarize_chunk_in_isolation(
        self,
        chunk_text: str,
        model_info: Dict[str, Any],
        api_config: Dict[str, Any],
        user_id: Optional[str],
        request_id: Optional[str] = None,
        is_cancelled_flag: Optional[asyncio.Event] = None
    ) -> Dict[str, Any]:
        """
        Generates a very concise summary of a single text chunk, focusing on its core message.
        """
        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"summary": None, "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "error": "Operation cancelled."}

        if not chunk_text:
            return {"summary": None, "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "error": "Chunk text is empty."}

        prompt = f"""Concisely summarize the following text chunk in 1-2 sentences, capturing its absolute core message or key facts.
Focus only on the information explicitly present in this chunk.

Text Chunk:
---
{chunk_text[:self.settings.LIVE_SEARCH_ISOLATED_SUMMARY_MAX_INPUT_CHARS]}
---

Core Summary (1-2 sentences):
"""
        
        summary_model_info = model_info.copy()
        summary_model_info["temperature"] = model_info.get("temperature_for_isolated_summary", 0.1)

        result = await self._execute_llm_call(
            request_type="summarize_chunk_in_isolation",
            prompt=prompt,
            model_info=summary_model_info,
            api_config=api_config,
            user_id_for_internal_call=user_id,
            request_id=request_id,
            expected_output_format="text",
            is_cancelled_flag=is_cancelled_flag
        )

        if is_cancelled_flag and is_cancelled_flag.is_set():
            return {"summary": None, "usage": result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}), "error": "Operation cancelled."}

        summary_text = result.get("output")
        error = result.get("error")
        usage = result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0})

        if error:
            logger.error(f"[LLMReasoning:{request_id}] Error summarizing chunk in isolation: {error}")
            return {"summary": None, "usage": usage, "error": error}
        
        if not summary_text:
            logger.warning(f"[LLMReasoning:{request_id}] Isolated chunk summary generation resulted in empty text.")
            return {"summary": None, "usage": usage, "error": "Generated isolated summary was empty."}

        return {"summary": summary_text.strip(), "usage": usage, "error": None}
