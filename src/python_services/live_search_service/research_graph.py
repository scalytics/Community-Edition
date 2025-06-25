import asyncio
from typing import Dict, Any, Literal, Optional
import functools 

from langgraph.graph import StateGraph, START, END
from . import models
from . import graph_nodes
from .utils import setup_logger
logger = setup_logger(__name__, level="WARN") 

def create_research_graph(services: Dict[str, Any], output_queue: asyncio.Queue) -> StateGraph:
    """
    Creates and compiles the LangGraph for the simplified RAG process.
    """
    builder = StateGraph(models.OverallState)

    def _bind_node_args(node_func):
        @functools.wraps(node_func)
        async def wrapped_node(state: models.OverallState): 
            return await node_func(state, services, output_queue)
        return wrapped_node

    builder.add_node("initialize_task", _bind_node_args(graph_nodes.initialize_task_node))
    builder.add_node("generate_search_queries", _bind_node_args(graph_nodes.generate_search_queries_node))
    builder.add_node("web_search", _bind_node_args(graph_nodes.web_search_node))
    builder.add_node("process_content", _bind_node_args(graph_nodes.process_content_node))
    builder.add_node("synthesize_report", _bind_node_args(graph_nodes.synthesize_report_node))
    builder.add_node("finalize_task", _bind_node_args(graph_nodes.finalize_task_node))

    builder.add_edge(START, "initialize_task")
    builder.add_edge("initialize_task", "generate_search_queries")
    builder.add_edge("generate_search_queries", "web_search")
    builder.add_edge("web_search", "process_content")
    builder.add_edge("process_content", "synthesize_report")
    builder.add_edge("synthesize_report", "finalize_task")
    builder.add_edge("finalize_task", END)
    
    graph = builder.compile()
    return graph

if __name__ == '__main__':
    pass
