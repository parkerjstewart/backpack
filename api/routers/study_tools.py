from ai_prompter import Prompter
from fastapi import APIRouter, HTTPException
from langchain_core.messages import HumanMessage, SystemMessage
from loguru import logger

from api.models import StudyToolResponse
from backpack.ai.provision import provision_langchain_model
from backpack.domain.module import Module
from backpack.utils.text_utils import clean_thinking_content

router = APIRouter()


async def _build_module_study_context(module_id: str) -> dict:
    """Build context dict used by all study tool prompt templates."""
    module = await Module.get(module_id)
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")

    sources = await module.get_sources()
    sources_context = []
    for source in sources:
        try:
            ctx = await source.get_context(context_size="short")
            sources_context.append(ctx)
        except Exception as e:
            logger.warning(f"Error getting context for source {source.id}: {e}")

    learning_goals = await module.get_learning_goals()
    goals_data = [
        {
            "title": g.title,
            "description": g.description,
            "takeaways": g.takeaways,
        }
        for g in learning_goals
    ]

    return {
        "module_name": module.name,
        "overview": module.overview or "",
        "learning_goals": goals_data,
        "sources_context": sources_context,
    }


async def _invoke_study_tool(prompt_template: str, context: dict) -> str:
    """Render a study tool prompt template and invoke the LLM."""
    system_prompt = Prompter(prompt_template=prompt_template).render(data=context)
    payload = [
        SystemMessage(content=system_prompt),
        HumanMessage(content="Generate the study material now."),
    ]
    model = await provision_langchain_model(system_prompt, None, "chat", max_tokens=4000)
    response = await model.ainvoke(payload)
    return clean_thinking_content(str(response.content))


@router.post(
    "/modules/{module_id}/study-tools/flashcards",
    response_model=StudyToolResponse,
)
async def generate_flashcards(module_id: str):
    """Generate Q&A flashcards from module sources and learning goals."""
    try:
        context = await _build_module_study_context(module_id)
        content = await _invoke_study_tool("study_tools/flashcards", context)
        return StudyToolResponse(content=content, module_id=module_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating flashcards for module {module_id}: {e}")
        raise HTTPException(
            status_code=500, detail=f"Error generating flashcards: {str(e)}"
        )


@router.post(
    "/modules/{module_id}/study-tools/quiz",
    response_model=StudyToolResponse,
)
async def generate_quiz(module_id: str):
    """Generate a multiple-choice practice quiz from module sources."""
    try:
        context = await _build_module_study_context(module_id)
        content = await _invoke_study_tool("study_tools/quiz", context)
        return StudyToolResponse(content=content, module_id=module_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating quiz for module {module_id}: {e}")
        raise HTTPException(
            status_code=500, detail=f"Error generating quiz: {str(e)}"
        )


@router.post(
    "/modules/{module_id}/study-tools/key-concepts",
    response_model=StudyToolResponse,
)
async def generate_key_concepts(module_id: str):
    """Generate key terms and definitions from module sources."""
    try:
        context = await _build_module_study_context(module_id)
        content = await _invoke_study_tool("study_tools/key_concepts", context)
        return StudyToolResponse(content=content, module_id=module_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating key concepts for module {module_id}: {e}")
        raise HTTPException(
            status_code=500, detail=f"Error generating key concepts: {str(e)}"
        )
