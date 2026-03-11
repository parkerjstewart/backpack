import asyncio
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import unquote, urlparse

from ai_prompter import Prompter
from fastapi import APIRouter, HTTPException
from langchain_core.messages import HumanMessage, SystemMessage
from loguru import logger
from pydantic import BaseModel, Field
from surreal_commands import get_command_status

from api.models import StudyToolResultResponse
from api.podcast_service import PodcastService
from backpack.ai.provision import provision_langchain_model
from backpack.database.repository import ensure_record_id, repo_delete, repo_query
from backpack.domain.module import Module, StudyToolResult

router = APIRouter()

IN_PROCESS_GENERATION_TIMEOUT = timedelta(minutes=20)


def _resolve_audio_path(audio_file: str) -> Path:
    """Resolve audio_file to a Path, handling file:// URIs the same way as the podcasts router."""
    if audio_file.startswith("file://"):
        parsed = urlparse(audio_file)
        return Path(unquote(parsed.path))
    return Path(audio_file)


PODCAST_ACTIVE_STATUS_TIMEOUT = timedelta(hours=2)
PODCAST_MISSING_COMMAND_TIMEOUT = timedelta(minutes=3)


# ── Structured output models ──────────────────────────────────────────────────

class Flashcard(BaseModel):
    question: str
    answer: str


class GeneratedFlashcards(BaseModel):
    cards: list[Flashcard]


class QuizOption(BaseModel):
    letter: str
    text: str


class QuizQuestion(BaseModel):
    question: str
    options: list[QuizOption]
    correct_answer: str
    explanation: str


class GeneratedQuiz(BaseModel):
    questions: list[QuizQuestion]


# Mind map uses a fixed-depth (3-level) structure rather than a recursive model
# to ensure compatibility with all LLM providers' structured output / JSON schema.
class MindMapLeaf(BaseModel):
    label: str


class MindMapBranch(BaseModel):
    label: str
    children: list[MindMapLeaf] = Field(default_factory=list)


class MindMapRootNode(BaseModel):
    label: str
    children: list[MindMapBranch] = Field(default_factory=list)


class GeneratedMindMap(BaseModel):
    title: str
    root: MindMapRootNode


# ── Podcast request model ─────────────────────────────────────────────────────

class RenameStudyToolRequest(BaseModel):
    title: str


class PodcastStudyToolRequest(BaseModel):
    episode_profile: str = "solo_expert"
    speaker_profile: str = "solo_expert"
    episode_name: Optional[str] = None
    briefing_suffix: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _build_module_study_context(module_id: str) -> tuple[Module, dict]:
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

    context = {
        "module_name": module.name,
        "overview": module.overview or "",
        "learning_goals": goals_data,
        "sources_context": sources_context,
    }
    return module, context


async def _invoke_structured_study_tool(
    prompt_template: str,
    context: dict,
    output_model: type[BaseModel],
    max_tokens: int,
) -> BaseModel:
    """Render a prompt template and invoke the LLM with structured output.

    Retries once with doubled max_tokens if the model hits its length limit.
    """
    system_prompt = Prompter(prompt_template=prompt_template).render(data=context)
    payload = [
        SystemMessage(content=system_prompt),
        HumanMessage(content="Generate the study material now."),
    ]
    model = await provision_langchain_model(system_prompt, None, "chat", max_tokens=max_tokens)
    try:
        return await model.with_structured_output(output_model).ainvoke(payload)
    except Exception as e:
        if "length limit was reached" not in str(e).lower():
            raise
        retry_max_tokens = max_tokens * 2
        logger.warning(
            f"Structured output hit length limit at max_tokens={max_tokens}; "
            f"retrying with max_tokens={retry_max_tokens}"
        )
        retry_model = await provision_langchain_model(
            system_prompt, None, "chat", max_tokens=retry_max_tokens
        )
        return await retry_model.with_structured_output(output_model).ainvoke(payload)


def _to_response(result: StudyToolResult) -> StudyToolResultResponse:
    module_id = result.module
    if ":" in module_id:
        module_id = module_id.split(":", 1)[1]
    return StudyToolResultResponse(
        id=result.id or "",
        module_id=module_id,
        tool_type=result.tool_type,
        title=result.title,
        data=result.data,
        status=result.status,
        created=str(result.created) if result.created else "",
        updated=str(result.updated) if result.updated else "",
    )


def _as_utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _is_result_older_than(result: StudyToolResult, threshold: timedelta) -> bool:
    reference_time = _as_utc(result.updated) or _as_utc(result.created)
    if reference_time is None:
        return False
    return datetime.now(timezone.utc) - reference_time > threshold


async def _mark_result_failed(result: StudyToolResult, reason: str) -> StudyToolResult:
    logger.warning(f"Marking study tool result {result.id} as failed: {reason}")
    await repo_query(
        "UPDATE $id SET status = 'failed', updated = time::now()",
        {"id": ensure_record_id(result.id)},
    )
    result.status = "failed"
    return result


async def _run_generation_task(
    result_id: str,
    context: dict,
    prompt_template: str,
    output_model: type[BaseModel],
    max_tokens: int,
    title: str,
    title_from_result: bool = False,
) -> None:
    """Background task: run LLM generation and update the study_tool_result record."""
    try:
        generated = await _invoke_structured_study_tool(
            prompt_template, context, output_model, max_tokens
        )
        final_title = title
        if title_from_result and hasattr(generated, "title") and generated.title:
            final_title = generated.title
        await repo_query(
            "UPDATE $id SET data = $data, status = 'completed', title = $title, updated = time::now()",
            {
                "id": ensure_record_id(result_id),
                "data": generated.model_dump(),
                "title": final_title,
            },
        )
        logger.info(f"Background generation completed for {result_id}")
    except Exception as e:
        logger.error(f"Background generation failed for {result_id}: {e}")
        await repo_query(
            "UPDATE $id SET status = 'failed', updated = time::now()",
            {"id": ensure_record_id(result_id)},
        )


# ── Generate endpoints ────────────────────────────────────────────────────────

@router.post(
    "/modules/{module_id}/study-tools/flashcards",
    response_model=StudyToolResultResponse,
)
async def generate_flashcards(module_id: str):
    """Start async flashcard generation for the module."""
    try:
        module, context = await _build_module_study_context(module_id)
        title = f"{module.name} Flashcards"
        result = StudyToolResult(
            module=module.id,
            tool_type="flashcards",
            title=title,
            data={},
            status="generating",
        )
        await result.save()
        asyncio.create_task(
            _run_generation_task(
                result.id, context, "study_tools/flashcards",
                GeneratedFlashcards, 6000, title,
            )
        )
        return _to_response(result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting flashcard generation for module {module_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error starting flashcard generation: {str(e)}")


@router.post(
    "/modules/{module_id}/study-tools/quiz",
    response_model=StudyToolResultResponse,
)
async def generate_quiz(module_id: str):
    """Start async quiz generation for the module."""
    try:
        module, context = await _build_module_study_context(module_id)
        title = f"{module.name} Quiz"
        result = StudyToolResult(
            module=module.id,
            tool_type="quiz",
            title=title,
            data={},
            status="generating",
        )
        await result.save()
        asyncio.create_task(
            _run_generation_task(
                result.id, context, "study_tools/quiz",
                GeneratedQuiz, 8000, title,
            )
        )
        return _to_response(result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting quiz generation for module {module_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error starting quiz generation: {str(e)}")


@router.post(
    "/modules/{module_id}/study-tools/mind-map",
    response_model=StudyToolResultResponse,
)
async def generate_mind_map(module_id: str):
    """Start async mind map generation for the module."""
    try:
        module, context = await _build_module_study_context(module_id)
        title = f"{module.name} Mind Map"
        result = StudyToolResult(
            module=module.id,
            tool_type="mind_map",
            title=title,
            data={},
            status="generating",
        )
        await result.save()
        asyncio.create_task(
            _run_generation_task(
                result.id, context, "study_tools/mind_map",
                GeneratedMindMap, 4000, title, title_from_result=True,
            )
        )
        return _to_response(result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting mind map generation for module {module_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error starting mind map generation: {str(e)}")


@router.post(
    "/modules/{module_id}/study-tools/podcast",
    response_model=StudyToolResultResponse,
)
async def generate_podcast_study_tool(module_id: str, body: PodcastStudyToolRequest = PodcastStudyToolRequest()):
    """Start podcast generation, tracked as a study tool result."""
    try:
        module = await Module.get(module_id)
        if not module:
            raise HTTPException(status_code=404, detail="Module not found")

        episode_name = body.episode_name or module.name
        title = f"{episode_name} Podcast"

        result = StudyToolResult(
            module=module.id,
            tool_type="podcast",
            title=title,
            data={},
            status="generating",
        )
        await result.save()

        try:
            job_id = await PodcastService.submit_generation_job(
                episode_profile_name=body.episode_profile,
                speaker_profile_name=body.speaker_profile,
                episode_name=episode_name,
                module_id=module_id,
                briefing_suffix=body.briefing_suffix,
            )
            # Store command_id for status polling
            await repo_query(
                "UPDATE $id SET command_id = $command_id, updated = time::now()",
                {"id": ensure_record_id(result.id), "command_id": job_id},
            )
            result.command_id = job_id
        except Exception as e:
            logger.error(f"Failed to submit podcast job for module {module_id}: {e}")
            await repo_query(
                "UPDATE $id SET status = 'failed', updated = time::now()",
                {"id": ensure_record_id(result.id)},
            )
            result.status = "failed"

        return _to_response(result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting podcast study tool for module {module_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error starting podcast: {str(e)}")


# ── List / Delete endpoints ───────────────────────────────────────────────────

async def _resolve_in_process_status(result: StudyToolResult) -> StudyToolResult:
    """Resolve stale in-process generation jobs (flashcards/quiz/mind map)."""
    if result.tool_type == "podcast" or result.status != "generating":
        return result

    if _is_result_older_than(result, IN_PROCESS_GENERATION_TIMEOUT):
        return await _mark_result_failed(
            result,
            f"in-process generation exceeded {IN_PROCESS_GENERATION_TIMEOUT}",
        )

    return result


async def _resolve_podcast_status(result: StudyToolResult) -> StudyToolResult:
    """Lazily check command status for podcast entries that need resolution.

    Runs for podcasts that are still 'generating', or that were marked 'completed'
    but have no audio data (race condition recovery).
    """
    if result.tool_type != "podcast":
        return result

    needs_audio = (
        result.status == "completed"
        and isinstance(result.data, dict)
        and not result.data.get("audio_file")
    )
    if result.status != "generating" and not needs_audio:
        return result

    if not result.command_id:
        if result.status == "generating" and _is_result_older_than(
            result, PODCAST_ACTIVE_STATUS_TIMEOUT
        ):
            return await _mark_result_failed(
                result,
                "podcast generation has no command_id and timed out",
            )
        return result

    try:
        cmd_status = await get_command_status(result.command_id)
        if cmd_status is None:
            if result.status == "generating" and _is_result_older_than(
                result, PODCAST_MISSING_COMMAND_TIMEOUT
            ):
                return await _mark_result_failed(
                    result,
                    f"podcast command {result.command_id} no longer exists",
                )
            return result

        # Use .value if it's an enum (CommandStatus.COMPLETED.value == "completed")
        # to avoid str(enum) producing "CommandStatus.COMPLETED" which never matches
        raw_status = cmd_status.status if hasattr(cmd_status, "status") else cmd_status
        status_str = getattr(raw_status, "value", str(raw_status)).lower()

        if status_str in ("completed", "success"):
            episodes = await repo_query(
                "SELECT * FROM episode WHERE command = $cmd_id LIMIT 1",
                {"cmd_id": ensure_record_id(result.command_id)},
            )
            episode_data: dict = {}
            if episodes:
                ep = episodes[0]
                ep_id = str(ep.get("id", ""))
                audio_file = ep.get("audio_file", "") or ""
                audio_url = f"/api/podcasts/episodes/{ep_id}/audio" if audio_file else ""
                episode_data = {
                    "episode_id": ep_id,
                    "audio_file": audio_file,
                    "audio_url": audio_url,
                }

            if not episode_data.get("audio_file"):
                if _is_result_older_than(result, PODCAST_ACTIVE_STATUS_TIMEOUT):
                    return await _mark_result_failed(
                        result,
                        "podcast command completed without an audio artifact",
                    )
                return result

            # Verify the audio file actually exists on disk before marking complete
            audio_path = _resolve_audio_path(episode_data["audio_file"])
            if not audio_path.exists():
                logger.debug(
                    f"Podcast command completed but audio not on disk yet: {audio_path}"
                )
                if _is_result_older_than(result, PODCAST_ACTIVE_STATUS_TIMEOUT):
                    return await _mark_result_failed(
                        result,
                        f"podcast audio file missing on disk: {audio_path}",
                    )
                return result

            await repo_query(
                "UPDATE $id SET status = 'completed', data = $data, updated = time::now()",
                {"id": ensure_record_id(result.id), "data": episode_data},
            )
            result.status = "completed"
            result.data = episode_data

        elif status_str in ("failed", "error", "cancelled", "canceled"):
            await repo_query(
                "UPDATE $id SET status = 'failed', updated = time::now()",
                {"id": ensure_record_id(result.id)},
            )
            result.status = "failed"
        elif result.status == "generating" and status_str in (
            "queued",
            "running",
            "new",
            "pending",
            "submitted",
            "unknown",
        ):
            if _is_result_older_than(result, PODCAST_ACTIVE_STATUS_TIMEOUT):
                return await _mark_result_failed(
                    result,
                    f"podcast command stuck in '{status_str}' beyond timeout",
                )

    except Exception as e:
        logger.warning(f"Failed to check podcast command status for {result.id}: {e}")

    return result


@router.get(
    "/modules/{module_id}/study-tools",
    response_model=list[StudyToolResultResponse],
)
async def list_study_tool_results(module_id: str):
    """List all study tool results for a module, ordered by created DESC."""
    try:
        module = await Module.get(module_id)
        if not module:
            raise HTTPException(status_code=404, detail="Module not found")
        results = await module.get_study_tool_results()
        # Lazily resolve stale in-process items and podcast command statuses
        resolved = []
        for r in results:
            current = await _resolve_in_process_status(r)
            current = await _resolve_podcast_status(current)
            resolved.append(current)
        return [_to_response(r) for r in resolved]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing study tool results for module {module_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error listing results: {str(e)}")


@router.patch("/study-tools/{result_id}", response_model=StudyToolResultResponse)
async def rename_study_tool_result(result_id: str, body: RenameStudyToolRequest):
    """Rename a study tool result."""
    try:
        if not result_id.startswith("study_tool_result:"):
            result_id = f"study_tool_result:{result_id}"
        rows = await repo_query(
            "UPDATE $id SET title = $title, updated = time::now() RETURN AFTER",
            {"id": ensure_record_id(result_id), "title": body.title},
        )
        if not rows:
            raise HTTPException(status_code=404, detail="Result not found")
        result = StudyToolResult(**rows[0])
        return _to_response(result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error renaming study tool result {result_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error renaming result: {str(e)}")


@router.delete("/study-tools/{result_id}", status_code=204)
async def delete_study_tool_result(result_id: str):
    """Delete a single study tool result."""
    try:
        if not result_id.startswith("study_tool_result:"):
            result_id = f"study_tool_result:{result_id}"
        await repo_delete(result_id)
    except Exception as e:
        logger.error(f"Error deleting study tool result {result_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error deleting result: {str(e)}")
