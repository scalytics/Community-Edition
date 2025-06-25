"""
Research Controller Module
Manages the overall flow, state, and decision-making for a multi-hop deep research task.
"""
import asyncio
from typing import List, Set, Optional, Dict, Any, Tuple

from .. import models
from .. import config as app_config
from ..utils import agent_dialogue 
from ..utils import setup_logger

logger = setup_logger(__name__) 

class ResearchController:
    def __init__(self, task_id: str, 
                 initial_query: str,
                 app_settings: app_config.Settings, 
                 output_queue: asyncio.Queue,
                 max_hops_override: Optional[int] = None,
                 max_total_urls_override: Optional[int] = None):
        
        self.task_id = task_id
        self.initial_query = initial_query
        self.settings = app_settings
        self.output_queue = output_queue

        self.state = models.ResearchControllerState(
            max_hops=max_hops_override if max_hops_override is not None else self.settings.DEFAULT_MAX_HOPS,
            max_total_urls_per_task=max_total_urls_override if max_total_urls_override is not None else self.settings.LIVE_SEARCH_MAX_TOTAL_URLS_PER_TASK,
            max_stagnation_limit=self.settings.DEFAULT_STAGNATION_LIMIT,
            current_reasoning_dynamic_temperature=self.settings.LIVE_SEARCH_REASONING_DEFAULT_TEMP,
        )

        # Placeholders for other state if needed by controller directly
        # self.executed_search_queries_count: int = 0 
        # self.links_to_explore_pq_size: int = 0

        logger.info(
            f"[ResearchController:{self.task_id}] Initialized. Max Hops: {self.state.max_hops}, Max URLs: {self.state.max_total_urls_per_task}, Stagnation Limit: {self.state.max_stagnation_limit}, Initial Reasoning Temp: {self.state.current_reasoning_dynamic_temperature}"
        )

    def increment_total_urls_scraped(self, count: int = 1):
        self.state.total_urls_scraped_count += count
        logger.debug(
            f"[ResearchController:{self.task_id}] Total URLs scraped incremented to {self.state.total_urls_scraped_count}"
        )

    def increment_total_chunks_indexed(self, count: int = 1):
        self.state.total_chunks_indexed_count += count
        logger.debug(
            f"[ResearchController:{self.task_id}] Total chunks indexed incremented to {self.state.total_chunks_indexed_count}"
        )

    def initialize_control_state(self, 
                                 all_reasoning_steps: List[str]):
        """Sets up the initial state based on query decomposition."""
        self.state.all_reasoning_steps = list(all_reasoning_steps)
        self.state.covered_reasoning_steps = set()
        self.state.current_hop = 0
        self.state.stagnation_counter = 0
        self.state.total_urls_scraped_count = 0
        
        # Initialize dynamic temperature settings on new task/state initialization
        self.state.current_reasoning_dynamic_temperature = self.settings.LIVE_SEARCH_REASONING_DEFAULT_TEMP
        self.state.hops_since_last_temp_increase = 0
        self.state.significant_progress_after_temp_increase = False
        self.state.consecutive_low_diversity_hops = 0

        logger.info(
            f"[ResearchController:{self.task_id}] Control state initialized with {len(self.state.all_reasoning_steps)} reasoning steps. Reasoning temp set to {self.state.current_reasoning_dynamic_temperature:.2f}."
        )

    def set_cancellation_flag(self):
        self.state.is_cancelled_flag = True
        logger.info(f"[ResearchController:{self.task_id}] Cancellation flag set by runner.")

    def _are_all_steps_covered(self) -> bool:
        if not self.state.all_reasoning_steps:
            return False
        return len(self.state.covered_reasoning_steps) >= len(self.state.all_reasoning_steps)

    def should_start_new_hop(self, current_links_to_explore_pq_size: int, current_queries_for_hop_count: int) -> Tuple[bool, Optional[str]]:
        """
        Determines if a new research hop should be initiated.
        Returns a tuple: (should_continue: bool, event_key_for_message: Optional[str])
        The event_key can be used to fetch a formatted message if should_continue is False.
        """
        if self.state.is_cancelled_flag:
            logger.info(f"[ResearchController:{self.task_id}] Stop condition: Cancelled.")
            return False, "SYSTEM_CANCELLED_BY_USER"
        if self.state.current_hop >= self.state.max_hops:
            logger.info(f"[ResearchController:{self.task_id}] Stop condition: Max hops ({self.state.max_hops}) reached.")
            return False, "CONTROLLER_MAX_HOPS_REACHED"
        if self._are_all_steps_covered():
            logger.info(f"[ResearchController:{self.task_id}] Stop condition: All reasoning steps covered.")
            return False, "CONTROLLER_ALL_COVERED"
        if self.state.stagnation_counter >= self.state.max_stagnation_limit:
            logger.info(f"[ResearchController:{self.task_id}] Stop condition: Stagnation limit ({self.state.max_stagnation_limit}) reached.")
            return False, "CONTROLLER_STAGNATION_STOP"
        if self.state.total_urls_scraped_count >= self.state.max_total_urls_per_task:
            logger.info(f"[ResearchController:{self.task_id}] Stop condition: Max total URLs ({self.state.max_total_urls_per_task}) reached.")
            return False, "CONTROLLER_MAX_URLS_REACHED"
        if self.state.similarity_stop_triggered_this_hop and current_queries_for_hop_count == 0 and current_links_to_explore_pq_size == 0:
            logger.info(f"[ResearchController:{self.task_id}] Stop condition: Similarity stop triggered with no other leads.")
            # This specific message might be better handled by the runner after similarity_stop_triggered_this_hop is set
            return False, "CONTROLLER_NO_FURTHER_ACTIONS"
            
        return True, None 

    def start_new_hop(self) -> int:
        """Increments hop count and resets hop-specific flags."""
        self.state.current_hop += 1
        self.state.similarity_stop_triggered_this_hop = False
        logger.info(f"[ResearchController:{self.task_id}] Starting Hop {self.state.current_hop}.")
        return self.state.current_hop

    def update_coverage(self, newly_covered_steps_this_hop: List[str]) -> bool:
        """Updates covered reasoning steps. Returns True if new steps were covered."""
        initial_covered_count = len(self.state.covered_reasoning_steps)
        for step in newly_covered_steps_this_hop:
            if step in self.state.all_reasoning_steps:
                self.state.covered_reasoning_steps.add(step)

        newly_added_count = len(self.state.covered_reasoning_steps) - initial_covered_count
        if newly_added_count > 0:
            logger.info(
                f"[ResearchController:{self.task_id}] Updated coverage. Newly covered: {newly_added_count}. Total covered: {len(self.state.covered_reasoning_steps)}/{len(self.state.all_reasoning_steps)}."
            )
            return True
        return False

    def update_stagnation(self, made_progress_on_coverage: bool, has_new_queries: bool, has_new_links: bool) -> Optional[str]:
        """
        Updates stagnation counter based on hop's outcome.
        Returns an event key for a warning message if stagnation is progressing but not yet at limit.
        """
        if made_progress_on_coverage or has_new_queries or has_new_links:
            self.state.stagnation_counter = 0
            logger.debug(f"[ResearchController:{self.task_id}] Stagnation counter reset due to progress/new leads.")
            return None
        else:
            self.state.stagnation_counter += 1
            logger.info(
                f"[ResearchController:{self.task_id}] Stagnation counter incremented to {self.state.stagnation_counter}/{self.state.max_stagnation_limit}."
            )
            if self.state.stagnation_counter > 0 and self.state.stagnation_counter < self.state.max_stagnation_limit:
                return "CONTROLLER_STAGNATION_WARNING"
            return None

    def record_urls_processed_in_hop(self, count: int):
        """Records the number of URLs processed in a hop."""
        self.state.total_urls_scraped_count += count
        logger.info(
            f"[ResearchController:{self.task_id}] URLs processed this hop: {count}. Total URLs processed: {self.state.total_urls_scraped_count}/{self.state.max_total_urls_per_task}."
        )

    def set_similarity_stop_flag(self, value: bool):
        self.state.similarity_stop_triggered_this_hop = value
        if value:
            logger.info(f"[ResearchController:{self.task_id}] Similarity stop flag set for current hop.")

    async def get_formatted_controller_message(self, event_key: str, **kwargs) -> Optional[str]:
        """
        Retrieves and formats a message template for the Research Controller.
        Sends it to the output queue.
        """
        template = getattr(agent_dialogue, event_key, None)
        if not template:
            logger.warning(f"[ResearchController:{self.task_id}] Dialogue template for key '{event_key}' not found.")
            return None
        
        try:
            # Ensure all necessary kwargs for the specific template are present
            # This is a basic check; more robust validation might be needed if templates get complex
            required_args_for_template = {
                "CONTROLLER_HOP_START": ["current_hop", "max_hops", "focus_topics_str"],
                "CONTROLLER_HOP_START_NO_FOCUS": ["current_hop", "max_hops"],
                "CONTROLLER_MAX_HOPS_REACHED": ["max_hops"],
                "CONTROLLER_MAX_URLS_REACHED": ["max_total_urls_per_task"],
            }
            if event_key in required_args_for_template:
                for req_arg in required_args_for_template[event_key]:
                    if req_arg not in kwargs:
                        logger.warning(f"Missing kwarg '{req_arg}' for template '{event_key}'. Using default.")
                        if "str" in req_arg: kwargs[req_arg] = "N/A"
                        else: kwargs[req_arg] = 0


            formatted_message = template.format(**kwargs)
            
            # Construct the SSEEvent payload for a simple progress update
            # The runner will typically handle the full SSEEvent construction
            return formatted_message
        except KeyError as e_key:
            logger.error(f"[ResearchController:{self.task_id}] Missing key '{e_key}' for formatting dialogue template '{event_key}'. Args: {kwargs}")
            return f"**[Research Controller]** Error: Message template {event_key} is missing a parameter."
        except Exception as e_format:
            logger.error(f"[ResearchController:{self.task_id}] Error formatting dialogue template '{event_key}': {e_format}. Args: {kwargs}", exc_info=True)
            return f"**[Research Controller]** Error: Could not format message for {event_key}."

    def get_final_status_message(self) -> str:
        """Returns a summary message based on why the research concluded."""
        if self.state.is_cancelled_flag:
            return "SYSTEM_CANCELLED_BY_USER"
        if self._are_all_steps_covered():
            return "CONTROLLER_ALL_COVERED"
        if self.state.current_hop >= self.state.max_hops:
            return "CONTROLLER_MAX_HOPS_REACHED"
        if self.state.total_urls_scraped_count >= self.state.max_total_urls_per_task:
            return "CONTROLLER_MAX_URLS_REACHED"
        if self.state.stagnation_counter >= self.state.max_stagnation_limit:
            return "CONTROLLER_STAGNATION_STOP"
        
        # If loop ended due to similarity stop and no other leads (this condition is checked in should_start_new_hop)
        # This might be redundant if should_start_new_hop already returned a specific key for this.
        # For now, let's assume CONTROLLER_NO_FURTHER_ACTIONS covers cases where the loop ends because
        # should_start_new_hop returned False due to lack of leads after similarity stop.
        # if self.similarity_stop_triggered_this_hop and not has_new_queries and not has_new_links:
        #    return "CONTROLLER_SIMILARITY_STOP_FINAL" # Need a template for this

        return "CONTROLLER_FINALIZING" 
