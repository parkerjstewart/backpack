"""
LangGraph workflow and standalone helpers for module content generation.

Generates module names, overviews, and learning goals from source materials.
Each generation function can be called individually or composed via the graph.
"""

from ai_prompter import Prompter
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph
from loguru import logger
from pydantic import BaseModel, Field
from typing_extensions import TypedDict

from backpack.ai.provision import provision_langchain_model
from backpack.domain.module import LearningGoal, Module, Source
from backpack.domain.transformation import Transformation
from backpack.graphs.transformation import graph as transform_graph
from backpack.utils.token_utils import token_count


# ============================================
# Pydantic output models for structured AI responses
# ============================================


class GeneratedName(BaseModel):
    """Structured output for module name generation."""

    name: str = Field(..., description="Short, descriptive module title (under 5 words)")


class GeneratedOverview(BaseModel):
    """Structured output for module overview generation."""

    overview: str = Field(..., description="3-4 sentence high-level summary")


class GeneratedLearningGoal(BaseModel):
    """A single learning goal as returned by the AI."""

    description: str = Field(..., description="Action-verb learning goal statement")
    takeaways: str = Field(
        default="", description="Key concepts or ideas as bullet points"
    )
    competencies: str = Field(
        default="", description="Demonstrable skills as bullet points"
    )


class GeneratedLearningGoals(BaseModel):
    """Structured output wrapper for learning goals generation."""

    goals: list[GeneratedLearningGoal] = Field(
        ..., description="List of 3-5 learning goals"
    )



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
    Falls back to dense summaries when over budget, generating them
    on the fly if they don't exist yet.
    """
    all_text = "".join(s.full_text or "" for s in sources)
    total_tokens = token_count(all_text)
    use_full_text = total_tokens <= MAX_CONTEXT_TOKENS

    if use_full_text:
        return [
            {"title": s.title, "content": s.full_text or ""}
            for s in sources
        ]

    # Over budget — use dense summaries
    dense_transform = await Transformation.get(Transformation.DENSE_SUMMARY)

    sources_context = []
    for source in sources:
        content = None
        try:
            for insight in await source.get_insights():
                if insight.insight_type.lower() == "dense summary":
                    content = insight.content
                    break
        except Exception as e:
            logger.warning(
                f"Error getting insights for source {source.id}: {e}"
            )

        if not content and dense_transform and source.full_text:
            logger.info(f"Generating dense summary for source {source.id} on the fly")
            result = await transform_graph.ainvoke(
                dict(
                    input_text=source.full_text,
                    source=source,
                    transformation=dense_transform,
                )
            )
            content = result["output"]

        if not content:
            full = source.full_text or ""
            content = full[:4000] + ("..." if len(full) > 4000 else "")

        sources_context.append({"title": source.title, "content": content})
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
    structured_model = model.with_structured_output(GeneratedName)
    result = await structured_model.ainvoke(system_prompt)
    return result.name


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
    structured_model = model.with_structured_output(GeneratedOverview)
    result = await structured_model.ainvoke(system_prompt)
    return result.overview


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
    structured_model = model.with_structured_output(GeneratedLearningGoals)
    result = await structured_model.ainvoke(system_prompt)
    return result.goals


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
