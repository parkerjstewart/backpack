"""
Stateless refinement function for module overview and learning goals.

Takes the current content + user instructions + conversation history,
and returns updated content with an explanation of changes.
"""

from ai_prompter import Prompter
from pydantic import BaseModel, Field

from backpack.ai.provision import provision_langchain_model


class RefinedGoal(BaseModel):
    """A single refined learning goal."""

    description: str = Field(..., description="Action-verb learning goal statement")
    takeaways: str = Field(default="", description="Key concepts as bullet points")
    competencies: str = Field(
        default="", description="Demonstrable skills as bullet points"
    )


class RefinedModuleContent(BaseModel):
    """Structured output from the refinement model."""

    overview: str = Field(..., description="The updated module overview")
    goals: list[RefinedGoal] = Field(
        ..., description="The complete updated list of learning goals"
    )
    explanation: str = Field(
        ...,
        description="Brief explanation of what was changed and why",
    )


async def refine_module_content(
    current_overview: str,
    current_goals: list[dict],
    user_message: str,
    message_history: list[dict],
    sources_context: list[dict] | None = None,
    notes_context: list[dict] | None = None,
    name: str = "",
    description: str = "",
    model_id: str | None = None,
) -> RefinedModuleContent:
    """Refine module overview and learning goals based on user instructions.

    Args:
        current_overview: The current overview text.
        current_goals: List of dicts with description, takeaways, competencies.
        user_message: The user's refinement instruction.
        message_history: Previous conversation turns for context.
        sources_context: Source materials for grounding edits.
        notes_context: Note materials for additional context.
        name: Module name.
        description: Module description.
        model_id: Optional model override.

    Returns:
        RefinedModuleContent with updated overview, goals, and explanation.
    """
    prompt_data = {
        "name": name,
        "description": description,
        "current_overview": current_overview,
        "current_goals": current_goals,
        "user_message": user_message,
        "message_history": message_history,
        "sources": sources_context or [],
        "notes": notes_context or [],
    }

    system_prompt = Prompter(prompt_template="module/refine").render(
        data=prompt_data
    )

    model = await provision_langchain_model(
        system_prompt,
        model_id,
        "transformation",
        max_tokens=3000,
    )
    structured_model = model.with_structured_output(RefinedModuleContent)
    result = await structured_model.ainvoke(system_prompt)
    return result
