"""
LangGraph workflow and standalone helpers for module content generation.

Generates module names, overviews, and learning goals from source materials.
Each generation function can be called individually or composed via the graph.
"""

import json
from typing import Optional

from ai_prompter import Prompter
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph
from loguru import logger
from pydantic import BaseModel, Field
from typing_extensions import TypedDict

from backpack.ai.provision import provision_langchain_model
from backpack.domain.module import LearningGoal, Module, Source
from backpack.utils import clean_thinking_content
from backpack.utils.token_utils import token_count


# ============================================
# Pydantic output models for structured AI responses
# ============================================


class GeneratedLearningGoal(BaseModel):
    """A single learning goal as returned by the AI."""

    description: str = Field(..., description="Action-verb learning goal statement")
    takeaways: str = Field(
        default="", description="Key concepts or ideas as bullet points"
    )
    competencies: str = Field(
        default="", description="Demonstrable skills as bullet points"
    )


class ModuleGenerationResult(BaseModel):
    """Complete result of module content generation."""

    name: Optional[str] = None
    overview: Optional[str] = None
    learning_goals: list[GeneratedLearningGoal] = Field(default_factory=list)


# ============================================
# Constants
# ============================================

MAX_CONTEXT_TOKENS = 200_000


# ============================================
# Graph state
# ============================================


class ModuleGenerationState(TypedDict, total=False):
    # Inputs
    source_ids: list[str]
    module_id: str
    name: str
    description: str
    model_id: str
    # Built by build_context node
    sources_context: list[dict]
    notes_context: list[dict]
    # Outputs
    generated_name: str
    overview: str
    learning_goals: list[dict]


# ============================================
# Standalone generation functions
# ============================================


async def build_sources_context(sources: list[Source]) -> list[dict]:
    """Build the sources context list used by AI prompts.

    Uses full text when total is under ~200k tokens.
    Falls back to dense summaries when over budget.
    """
    all_text = "".join(s.full_text or "" for s in sources)
    total_tokens = token_count(all_text)
    use_full_text = total_tokens <= MAX_CONTEXT_TOKENS

    sources_context = []
    for source in sources:
        if use_full_text:
            content = source.full_text or ""
        else:
            content = None
            try:
                insights = await source.get_insights()
                for insight in insights:
                    if insight.insight_type.lower() == "dense summary":
                        content = insight.content
                        break
            except Exception as e:
                logger.warning(
                    f"Error getting insights for source {source.id}: {e}"
                )

            if not content:
                full = source.full_text or ""
                content = full[:4000] + ("..." if len(full) > 4000 else "")

        sources_context.append(
            {
                "title": source.title,
                "content": content,
            }
        )
    return sources_context


async def generate_name(
    sources_context: list[dict],
    model_id: str | None = None,
) -> str:
    """Generate a short module title from sources context."""
    prompt_data = {"sources": sources_context}
    system_prompt = Prompter(prompt_template="module/name").render(
        data=prompt_data
    )
    model = await provision_langchain_model(
        system_prompt,
        model_id,
        "transformation",
        max_tokens=100,
    )
    ai_message = await model.ainvoke(system_prompt)
    content = (
        ai_message.content
        if isinstance(ai_message.content, str)
        else str(ai_message.content)
    )
    return clean_thinking_content(content).strip().strip("\"'")


async def generate_overview(
    sources_context: list[dict],
    notes_context: list[dict] | None = None,
    name: str = "",
    description: str = "",
    model_id: str | None = None,
) -> str:
    """Generate an overview string from sources/notes context."""
    prompt_data = {
        "name": name,
        "description": description,
        "sources": sources_context,
        "notes": notes_context or [],
    }
    system_prompt = Prompter(prompt_template="module/overview").render(
        data=prompt_data
    )
    model = await provision_langchain_model(
        system_prompt,
        model_id,
        "transformation",
        max_tokens=500,
    )
    ai_message = await model.ainvoke(system_prompt)
    content = (
        ai_message.content
        if isinstance(ai_message.content, str)
        else str(ai_message.content)
    )
    return clean_thinking_content(content)


def _parse_learning_goals_response(raw: str) -> list[GeneratedLearningGoal]:
    """Parse LLM output into a list of GeneratedLearningGoal models.

    Tries JSON first, falls back to line-by-line parsing.
    """
    content = raw.strip()

    # Strip markdown code fences if the model wrapped the JSON
    if content.startswith("```"):
        content = content.split("\n", 1)[1] if "\n" in content else content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

    # Try JSON parsing into Pydantic models
    try:
        parsed = json.loads(content)
        if isinstance(parsed, list):
            goals = []
            for item in parsed:
                if isinstance(item, dict) and "description" in item:
                    # Normalize arrays to bullet-point strings
                    takeaways = item.get("takeaways", "")
                    if isinstance(takeaways, list):
                        takeaways = "\n".join(f"- {t}" for t in takeaways)
                    competencies = item.get("competencies", "")
                    if isinstance(competencies, list):
                        competencies = "\n".join(f"- {c}" for c in competencies)
                    goals.append(
                        GeneratedLearningGoal(
                            description=item["description"],
                            takeaways=takeaways,
                            competencies=competencies,
                        )
                    )
            return goals
    except json.JSONDecodeError:
        logger.warning(
            "Failed to parse learning goals as JSON, falling back to line parsing"
        )

    # Fallback: one goal per line (no takeaways/competencies)
    goal_lines = [
        line.strip()
        for line in content.strip().split("\n")
        if line.strip() and not line.strip().startswith("#")
    ]
    goals = []
    for line in goal_lines:
        cleaned = line.lstrip("0123456789.-*) ").strip()
        if cleaned:
            goals.append(GeneratedLearningGoal(description=cleaned))
    return goals


async def generate_learning_goals(
    sources_context: list[dict],
    notes_context: list[dict] | None = None,
    name: str = "",
    description: str = "",
    model_id: str | None = None,
) -> list[GeneratedLearningGoal]:
    """Generate a list of learning goals from sources/notes context."""
    prompt_data = {
        "name": name,
        "description": description,
        "sources": sources_context,
        "notes": notes_context or [],
    }
    system_prompt = Prompter(prompt_template="module/learning_goals").render(
        data=prompt_data
    )
    model = await provision_langchain_model(
        system_prompt,
        model_id,
        "transformation",
        max_tokens=2000,
    )
    ai_message = await model.ainvoke(system_prompt)
    content = (
        ai_message.content
        if isinstance(ai_message.content, str)
        else str(ai_message.content)
    )
    content = clean_thinking_content(content)
    return _parse_learning_goals_response(content)


# ============================================
# LangGraph nodes
# ============================================


async def _node_build_context(state: dict, config: RunnableConfig) -> dict:
    """Fetch sources and notes, build context dicts."""
    source_ids = state.get("source_ids", [])
    module_id = state.get("module_id")

    if module_id:
        module = await Module.get(module_id)
        if not module:
            raise ValueError(f"Module {module_id} not found")
        sources = await module.get_sources()
        notes = await module.get_notes()
        name = state.get("name") or module.name
        description = state.get("description") or module.description
    else:
        sources = await Source.get_sources(source_ids)
        notes = []
        name = state.get("name", "")
        description = state.get("description", "")

    sources_context = await build_sources_context(sources)
    notes_context = [{"title": n.title, "content": n.content} for n in notes]

    return {
        "sources_context": sources_context,
        "notes_context": notes_context,
        "name": name,
        "description": description,
    }


async def _node_generate_name(state: dict, config: RunnableConfig) -> dict:
    """Generate a module name from context."""
    model_id = config.get("configurable", {}).get("model_id") or state.get(
        "model_id"
    )
    name = await generate_name(state["sources_context"], model_id)
    return {"generated_name": name, "name": name}


async def _node_generate_overview(state: dict, config: RunnableConfig) -> dict:
    """Generate a module overview from context."""
    model_id = config.get("configurable", {}).get("model_id") or state.get(
        "model_id"
    )
    overview = await generate_overview(
        state["sources_context"],
        state.get("notes_context"),
        state.get("name", ""),
        state.get("description", ""),
        model_id,
    )
    return {"overview": overview}


async def _node_generate_learning_goals(
    state: dict, config: RunnableConfig
) -> dict:
    """Generate learning goals from context."""
    model_id = config.get("configurable", {}).get("model_id") or state.get(
        "model_id"
    )
    goals = await generate_learning_goals(
        state["sources_context"],
        state.get("notes_context"),
        state.get("name", ""),
        state.get("description", ""),
        model_id,
    )
    return {"learning_goals": [g.model_dump() for g in goals]}


# ============================================
# Compiled graph: build_context → generate_name → [overview, goals] in parallel → END
# ============================================

_graph_builder = StateGraph(ModuleGenerationState)
_graph_builder.add_node("build_context", _node_build_context)
_graph_builder.add_node("generate_name", _node_generate_name)
_graph_builder.add_node("generate_overview", _node_generate_overview)
_graph_builder.add_node("generate_learning_goals", _node_generate_learning_goals)

_graph_builder.add_edge(START, "build_context")
_graph_builder.add_edge("build_context", "generate_name")
_graph_builder.add_edge("generate_name", "generate_overview")
_graph_builder.add_edge("generate_name", "generate_learning_goals")
_graph_builder.add_edge("generate_overview", END)
_graph_builder.add_edge("generate_learning_goals", END)

graph = _graph_builder.compile()
