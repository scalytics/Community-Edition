"""
Research Comptroller Module
Oversees the research process for efficiency, policy adherence, and quality control.
"""
import json 
from typing import Dict, List, Any, Optional, Set 

from .. import models
from .. import config as app_config
from ..utils import setup_logger
from .llm_reasoning import LLMReasoning 

logger = setup_logger(__name__, level="WARN") 

class ResearchComptroller:
    def __init__(self, settings: app_config.Settings, services: Dict[str, Any]):
        self.settings = settings
        self.services = services 

    def check_hard_constraints(self, state: models.OverallState) -> bool: 
        """
        Checks if any hard operational limits have been reached.
        Returns True if a hard stop is mandated, False otherwise.
        Max Hops check is primarily handled by should_continue_hopping in research_graph.py
        to allow for Comptroller credit overrides.
        """
        task_id = state.task_id
        stop_due_to_constraint = False

        # 1. Max Total URLs Scraped
        if state.total_urls_scraped_count >= state.max_total_urls_per_task:
            logger.warning(f"[{task_id}] Comptroller: Hard constraint reached - Max Total URLs Scraped ({state.max_total_urls_per_task}).")
            stop_due_to_constraint = True
        return stop_due_to_constraint

    async def recommend_targeted_site_reinvestigation(
        self,
        site_domain: str, 
        initial_page_url: str, 
        initial_page_summary: str, 
        candidate_internal_links: List[models.ExtractedLinkItem], 
        uncovered_objectives: List[str],
        current_state: models.OverallState
    ) -> Optional[models.TargetedSiteExplorationDirective]:
        """
        Decides if a specific, highly relevant site warrants deeper, targeted exploration.
        If so, uses an LLM to identify promising internal links/paths.
        """
        task_id = current_state.task_id

        if not self.settings.LIVE_SEARCH_ENABLE_FOCUSED_SITE_EXPLORATION:
            return None

        if not candidate_internal_links:
            return None
            
        llm_reasoner: Optional[LLMReasoning] = self.services.get("llm_reasoner")
        if not llm_reasoner:
            logger.error(f"[{task_id}] Comptroller: LLMReasoning service not found, cannot recommend site reinvestigation.")
            return None

        prioritization_result = await llm_reasoner.prioritize_internal_links_for_exploration(
            original_user_query=current_state.original_query,
            uncovered_objectives=uncovered_objectives,
            trigger_page_url=initial_page_url,
            trigger_page_summary=initial_page_summary,
            candidate_internal_links=candidate_internal_links,
            model_info=current_state.request_params.reasoning_model_info or {}, 
            api_config=current_state.api_config,
            user_id=current_state.user_id,
            request_id=f"{task_id}_comptroller_site_reinvestigation",
            top_n=self.settings.LIVE_SEARCH_FOCUSED_SITE_MAX_PAGES_PER_TRIGGER or 3 
        )
        
        selected_urls = prioritization_result.get("selected_links", [])

        if selected_urls:
            return models.TargetedSiteExplorationDirective(
                target_domain=site_domain,
                prioritized_internal_urls=selected_urls,
                max_pages_for_this_exploration=self.settings.LIVE_SEARCH_FOCUSED_SITE_MAX_PAGES_PER_TRIGGER or 3,
                reasoning=f"LLM identified promising internal links on {site_domain} for uncovered objectives: {', '.join(uncovered_objectives[:2])}."
            )
        else:
            return None

    def assess_latency_and_cost(self, state: models.OverallState, current_node_name: str):
        task_id = state.task_id
        unverified_count = 0
        total_relevant_dps = 0
        low_confidence_threshold = self.settings.LIVE_SEARCH_LOW_CONFIDENCE_THRESHOLD_PERCENTAGE 
        
        for dp in state.full_research_plan_data_points:
            if dp.get("status") not in ["NEEDS_CALCULATION", "NOT_APPLICABLE_FOR_STRATEGY"] and \
               dp.get("retrieval_action") not in ["NO_SEARCH_NEEDED", "NONE"]:
                total_relevant_dps += 1
                ver_status = dp.get("verification_status", "UNVERIFIED").upper() 
                if "UNVERIFIED" in ver_status or \
                   "PENDING" in ver_status or \
                   "FAILED" in ver_status or \
                   "CONTRADICTED" in ver_status or \
                   "INCONCLUSIVE" in ver_status or \
                   "ASK_LLM_FAILED" in ver_status or \
                   "LLM_PROPOSED_NEEDS_VERIFICATION" in ver_status:
                    unverified_count += 1
        
        if total_relevant_dps > 0 and (unverified_count / total_relevant_dps) > low_confidence_threshold:
            logger.warning(f"[{task_id}] Comptroller: High proportion of unverified/low-confidence data points ({unverified_count}/{total_relevant_dps}). Setting low_confidence_synthesis_mode.")

    def should_enable_low_confidence_synthesis_mode(self, state: models.OverallState) -> bool:
        task_id = state.task_id
        unverified_count = 0
        total_relevant_dps = 0
        low_confidence_threshold_percentage = self.settings.LIVE_SEARCH_LOW_CONFIDENCE_THRESHOLD_PERCENTAGE 

        for dp in state.full_research_plan_data_points:
            if dp.get("status") not in ["NEEDS_CALCULATION", "NOT_APPLICABLE_FOR_STRATEGY", "RESOLVED_BY_CALCULATION"] and \
               dp.get("retrieval_action") not in ["NO_SEARCH_NEEDED", "NONE"]:
                total_relevant_dps += 1
                ver_status = dp.get("verification_status", "UNVERIFIED").upper()
                
                if not (ver_status == "WEB_VERIFIED_CONFIRMED" or ver_status == "LLM_DIRECT_ANSWER_UNVERIFIED" or ver_status == "SOURCE_EXTRACTED_TRUST_UNKNOWN"):
                    if "PENDING" in ver_status or \
                       "FAILED" in ver_status or \
                       "CONTRADICTED" in ver_status or \
                       "INCONCLUSIVE" in ver_status or \
                       "NEEDS_VERIFICATION" in ver_status or \
                       ver_status == "UNVERIFIED":
                        unverified_count += 1
        
        if total_relevant_dps == 0: 
            return False

        proportion_unverified = unverified_count / total_relevant_dps
        if proportion_unverified > low_confidence_threshold_percentage:
            logger.warning(
                f"[{task_id}] Comptroller: Low confidence mode triggered. "
                f"Unverified/Low-Confidence DPs: {unverified_count}/{total_relevant_dps} ({proportion_unverified:.2%}), "
                f"Threshold: {low_confidence_threshold_percentage:.0%}"
            )
            return True
        return False

    def check_for_strategic_pivot_signals(self, state: models.OverallState) -> bool:
        task_id = state.task_id
        pivot_needed = False

        if state.consecutive_low_diversity_hops >= self.settings.LIVE_SEARCH_MAX_CONSECUTIVE_LOW_DIVERSITY_HOPS_FOR_PIVOT:
            logger.warning(f"[{task_id}] Comptroller: Strategic pivot signal - Persistent low diversity for {state.consecutive_low_diversity_hops} hops.")
            pivot_needed = True
        
        if len(state.aggregated_token_usage) > 5: 
            recent_token_usage = sum(usage.total_tokens for usage in state.aggregated_token_usage[-3:]) 
            if len(state.covered_reasoning_steps) < len(state.all_reasoning_steps) * 0.5: 
                if recent_token_usage > (self.settings.LIVE_SEARCH_TOKEN_BUDGET_WARNING_THRESHOLD_PER_TASK * 0.2): 
                    logger.warning(f"[{task_id}] Comptroller: Strategic pivot signal - High recent token cost ({recent_token_usage}) with low overall progress ({len(state.covered_reasoning_steps)}/{len(state.all_reasoning_steps)}).")
                    pivot_needed = True
        
        return pivot_needed

    async def review_final_draft(
        self,
        draft_report_text: str,
        original_query: str,
        all_reasoning_steps: List[str],
        covered_reasoning_steps: Set[str],
        full_research_plan_data_points: List[Dict[str, Any]],
        current_state: models.OverallState,
        full_context_chunks: List[models.ContentChunk],
        previous_draft_text: Optional[str] = None,
        feedback_given_on_previous_draft: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        task_id = current_state.task_id

        llm_reasoner: Optional[LLMReasoning] = self.services.get("llm_reasoner")
        if not llm_reasoner:
            logger.error(f"[{task_id}] Comptroller: LLMReasoning service not found for final draft review.")
            return {"approved": False, "feedback_points": ["Comptroller LLM service unavailable."], "usage": {}, "error": "LLM Service unavailable"}

        uncovered_steps_list = [step for step in all_reasoning_steps if step not in covered_reasoning_steps]
        formatted_uncovered_steps = "\n - ".join(uncovered_steps_list) if uncovered_steps_list else "All planned steps appear to have been addressed or attempted."
        
        facts_summary_for_review_parts = ["Key Data Points from Research Plan:"]
        for dp in full_research_plan_data_points[:15]:
            dp_name = dp.get("name", "N/A")
            dp_status = dp.get("status", "N/A")
            dp_value = dp.get("value", "Not explicitly resolved")
            dp_verification = dp.get("verification_status", "N/A")
            facts_summary_for_review_parts.append(f"- {dp_name}: Status='{dp_status}', Value='{str(dp_value)[:100]}', Verification='{dp_verification}'")
        facts_summary_for_review = "\n".join(facts_summary_for_review_parts)

        # Prepare the full context for the prompt, with truncation for safety
        formatted_full_context_parts = []
        for i, chunk in enumerate(full_context_chunks[:30]): # Limit to 30 chunks for prompt safety
            formatted_full_context_parts.append(f"--- Source {i+1} (URL: {chunk.original_url}) ---\n{chunk.text_content[:1000]}")
        formatted_full_context = "\n\n".join(formatted_full_context_parts)
        if len(full_context_chunks) > 30:
            formatted_full_context += "\n\n[Full context truncated for review prompt...]"

        draft_for_review = draft_report_text

        review_model_info = current_state.request_params.reasoning_model_info or {}
        review_model_info = {**review_model_info, "temperature": 0.1, "max_tokens": 1000}

        previous_draft_context = ""
        if previous_draft_text and feedback_given_on_previous_draft:
            formatted_prev_feedback = "\n - ".join(feedback_given_on_previous_draft)
            previous_draft_context = f"""
CONTEXT OF PREVIOUS REVIEW CYCLE:
A prior version of this report was generated and reviewed. The key feedback points given were:
- {formatted_prev_feedback}

The 'Draft Report to Review' below is a NEW attempt to address this feedback.
Your primary task is to determine if this NEW draft successfully resolves ALL the 'Feedback Points' listed above.
"""

        prompt_text = f"""You are a Chief Editor reviewing a research report draft.
Your task is to assess the draft against the original query, research objectives, and the FULL available context.

Original User Query: "{original_query}"

Planned Research Objectives/Reasoning Steps:
- {", ".join(all_reasoning_steps)}

Summary of Uncovered/Partially Covered Objectives (if any):
- {formatted_uncovered_steps}

Summary of Key Data Points and their Status (use this to check if report aligns with findings):
{facts_summary_for_review}

Full Source Material Context (This is the complete set of information the research gathered. The draft may have been written using a truncated version of this. Your review should be based on this full context.):
---
{formatted_full_context}
---
{previous_draft_context}
Draft Report to Review (This is the LATEST version):
---
{draft_for_review}
---


Please evaluate the LATEST 'Draft Report to Review' based on the following criteria:
1.  **Feedback Resolution (If Applicable):** If 'CONTEXT OF PREVIOUS REVIEW CYCLE' is provided, has the LATEST draft successfully and comprehensively addressed EACH of the 'Feedback Points' given for the previous draft? This is the MOST CRITICAL criterion if feedback was given.
2.  **Completeness for Original Query:** Does the LATEST draft comprehensively address all main aspects of the 'Original User Query'?
3.  **Coverage of Planned Objectives:** Does the LATEST report adequately reflect findings for the 'Planned Research Objectives'? Are any explicitly 'Uncovered Objectives' appropriately acknowledged or handled?
4.  **Alignment with Facts Summary:** Do the conclusions and statements in the LATEST report align with the 'Summary of Key Data Points'?
5.  **Objectivity and Tone:** Is the tone neutral, objective, and factual?
6.  **Clarity and Coherence:** Is the LATEST report well-structured and easy to understand?

Output ONLY a JSON object with the following keys:
- "approved": boolean (true if the report is satisfactory, ESPECIALLY if it addresses all prior feedback; false if significant issues remain, PARTICULARLY if prior feedback was not addressed)
- "feedback_points": [list of strings] (Specific, actionable feedback points if not approved. If prior feedback was given and not fully addressed, reiterate or refine those points. If approved, this can be an empty list or a brief positive comment.)

Example for a report needing revisions (especially if prior feedback wasn't met):
{{
  "approved": false,
  "feedback_points": [
    "Prior feedback regarding 'long-term effects' for 'Market Impact' is still not fully addressed in the new draft.",
    "The new draft still uses speculative language (e.g., 'guaranteed success'); please rephrase.",
    "Data point 'dp3_revenue_2023' remains misaligned with the facts summary."
  ]
}}
Example for an approved report (especially if it successfully addressed prior feedback):
{{
  "approved": true,
  "feedback_points": ["The revised report successfully addresses all previous feedback points and is now comprehensive and clear."]
}}

JSON Output:
"""

        result = await llm_reasoner._execute_llm_call(
            request_type="comptroller_final_draft_review",
            prompt=prompt_text, 
            model_info=review_model_info,
            api_config=current_state.api_config,
            user_id_for_internal_call=current_state.user_id, 
            request_id=f"{task_id}_comptroller_review",      
            expected_output_format="json"
        )

        usage = result.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0})
        error = result.get("error")
        
        if error:
            logger.error(f"[{task_id}] Comptroller: LLM call for final draft review failed: {error}")
            return {"approved": False, "feedback_points": [f"Draft review LLM call failed: {error}"], "usage": usage, "error": error}

        review_output = result.get("output")
        if isinstance(review_output, dict) and "approved" in review_output and "feedback_points" in review_output:
            return {"approved": review_output["approved"], "feedback_points": review_output["feedback_points"], "usage": usage, "error": None}
        else:
            logger.error(f"[{task_id}] Comptroller: Final draft review LLM output was not in the expected format: {review_output}")
            return {"approved": False, "feedback_points": ["Draft review LLM output malformed."], "usage": usage, "error": "Malformed LLM output for draft review"}
