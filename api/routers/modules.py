from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query, Header
from loguru import logger

from api.models import (
    GenerateContentRequest,
    GenerateLearningGoalsResponse,
    GenerateOverviewResponse,
    LearningGoalCreate,
    LearningGoalPreview,
    LearningGoalResponse,
    LearningGoalUpdate,
    ModuleCreate,
    ModuleResponse,
    ModuleUpdate,
    PreviewModuleContentRequest,
    PreviewModuleContentResponse,
)
from api.routers.authz import (
    require_authenticated_user_id,
    require_teaching_role,
)
from backpack.database.repository import ensure_record_id, repo_query
from backpack.domain.module import LearningGoal, Module, Source
from backpack.exceptions import InvalidInputError
from backpack.graphs.module import (
    build_sources_context,
    generate_learning_goals,
    generate_overview,
    graph as module_generation_graph,
)

router = APIRouter()


@router.get("/modules", response_model=List[ModuleResponse])
async def get_modules(
    archived: Optional[bool] = Query(None, description="Filter by archived status"),
    order_by: str = Query("updated desc", description="Order by field and direction"),
):
    """Get all modules with optional filtering and ordering."""
    try:
        # Build the query with counts
        query = f"""
            SELECT *,
            count(<-reference) as source_count,
            count(<-artifact) as note_count
            FROM module
            ORDER BY {order_by}
        """

        result = await repo_query(query)

        # Filter by archived status if specified
        if archived is not None:
            result = [nb for nb in result if nb.get("archived") == archived]

        return [
            ModuleResponse(
                id=str(nb.get("id", "")),
                name=nb.get("name", ""),
                description=nb.get("description", ""),
                archived=nb.get("archived", False),
                overview=nb.get("overview"),
                created=str(nb.get("created", "")),
                updated=str(nb.get("updated", "")),
                source_count=nb.get("source_count", 0),
                note_count=nb.get("note_count", 0),
                course_id=str(nb.get("course")) if nb.get("course") else None,
            )
            for nb in result
        ]
    except Exception as e:
        logger.error(f"Error fetching modules: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error fetching modules: {str(e)}"
        )


@router.post("/modules", response_model=ModuleResponse)
async def create_module(module: ModuleCreate, authorization: Optional[str] = Header(None)):
    """Create a new module, optionally associated with a course."""
    try:
        if module.course_id:
            user_id = require_authenticated_user_id(authorization)
            await require_teaching_role(module.course_id, user_id)

        new_module = Module(
            name=module.name,
            description=module.description,
            course=module.course_id,
        )
        await new_module.save()

        return ModuleResponse(
            id=new_module.id or "",
            name=new_module.name,
            description=new_module.description,
            archived=new_module.archived or False,
            overview=new_module.overview,
            created=str(new_module.created),
            updated=str(new_module.updated),
            source_count=0,  # New module has no sources
            note_count=0,  # New module has no notes
            course_id=str(new_module.course) if new_module.course else None,
        )
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating module: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error creating module: {str(e)}"
        )


@router.get("/modules/{module_id}", response_model=ModuleResponse)
async def get_module(module_id: str):
    """Get a specific module by ID."""
    try:
        # Query with counts for single module
        query = """
            SELECT *,
            count(<-reference) as source_count,
            count(<-artifact) as note_count
            FROM $module_id
        """
        result = await repo_query(query, {"module_id": ensure_record_id(module_id)})

        if not result:
            raise HTTPException(status_code=404, detail="Module not found")

        nb = result[0]
        return ModuleResponse(
            id=str(nb.get("id", "")),
            name=nb.get("name", ""),
            description=nb.get("description", ""),
            archived=nb.get("archived", False),
            overview=nb.get("overview"),
            created=str(nb.get("created", "")),
            updated=str(nb.get("updated", "")),
            source_count=nb.get("source_count", 0),
            note_count=nb.get("note_count", 0),
            course_id=str(nb.get("course")) if nb.get("course") else None,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching module {module_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error fetching module: {str(e)}"
        )


@router.put("/modules/{module_id}", response_model=ModuleResponse)
async def update_module(
    module_id: str,
    module_update: ModuleUpdate,
    authorization: Optional[str] = Header(None),
):
    """Update a module."""
    try:
        module = await Module.get(module_id)
        if not module:
            raise HTTPException(status_code=404, detail="Module not found")

        user_id = None
        if module.course or module_update.course_id:
            user_id = require_authenticated_user_id(authorization)
        if module.course and user_id:
            await require_teaching_role(str(module.course), user_id)
        if module_update.course_id and user_id:
            await require_teaching_role(module_update.course_id, user_id)

        # Update only provided fields
        if module_update.name is not None:
            module.name = module_update.name
        if module_update.description is not None:
            module.description = module_update.description
        if module_update.archived is not None:
            module.archived = module_update.archived
        if module_update.overview is not None:
            module.overview = module_update.overview
        if module_update.course_id is not None:
            module.course = module_update.course_id

        await module.save()

        # Query with counts after update
        query = """
            SELECT *,
            count(<-reference) as source_count,
            count(<-artifact) as note_count
            FROM $module_id
        """
        result = await repo_query(query, {"module_id": ensure_record_id(module_id)})

        if result:
            nb = result[0]
            return ModuleResponse(
                id=str(nb.get("id", "")),
                name=nb.get("name", ""),
                description=nb.get("description", ""),
                archived=nb.get("archived", False),
                overview=nb.get("overview"),
                created=str(nb.get("created", "")),
                updated=str(nb.get("updated", "")),
                source_count=nb.get("source_count", 0),
                note_count=nb.get("note_count", 0),
                course_id=str(nb.get("course")) if nb.get("course") else None,
            )

        # Fallback if query fails
        return ModuleResponse(
            id=module.id or "",
            name=module.name,
            description=module.description,
            archived=module.archived or False,
            overview=module.overview,
            created=str(module.created),
            updated=str(module.updated),
            source_count=0,
            note_count=0,
            course_id=str(module.course) if module.course else None,
        )
    except HTTPException:
        raise
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating module {module_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error updating module: {str(e)}"
        )


@router.post("/modules/{module_id}/sources/{source_id}")
async def add_source_to_module(
    module_id: str,
    source_id: str,
    authorization: Optional[str] = Header(None),
):
    """Add an existing source to a module (create the reference)."""
    try:
        # Check if module exists
        module = await Module.get(module_id)
        if not module:
            raise HTTPException(status_code=404, detail="Module not found")

        if module.course:
            user_id = require_authenticated_user_id(authorization)
            await require_teaching_role(str(module.course), user_id)

        # Check if source exists
        source = await Source.get(source_id)
        if not source:
            raise HTTPException(status_code=404, detail="Source not found")

        # Check if reference already exists (idempotency)
        existing_ref = await repo_query(
            "SELECT * FROM reference WHERE out = $source_id AND in = $module_id",
            {
                "module_id": ensure_record_id(module_id),
                "source_id": ensure_record_id(source_id),
            },
        )

        # If reference doesn't exist, create it
        if not existing_ref:
            await repo_query(
                "RELATE $source_id->reference->$module_id",
                {
                    "module_id": ensure_record_id(module_id),
                    "source_id": ensure_record_id(source_id),
                },
            )

        return {"message": "Source linked to module successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"Error linking source {source_id} to module {module_id}: {str(e)}"
        )
        raise HTTPException(
            status_code=500, detail=f"Error linking source to module: {str(e)}"
        )


@router.delete("/modules/{module_id}/sources/{source_id}")
async def remove_source_from_module(
    module_id: str,
    source_id: str,
    authorization: Optional[str] = Header(None),
):
    """Remove a source from a module (delete the reference)."""
    try:
        # Check if module exists
        module = await Module.get(module_id)
        if not module:
            raise HTTPException(status_code=404, detail="Module not found")

        if module.course:
            user_id = require_authenticated_user_id(authorization)
            await require_teaching_role(str(module.course), user_id)

        # Delete the reference record linking source to module
        # Note: RELATE source->reference->module means out=source, in=module
        await repo_query(
            "DELETE FROM reference WHERE out = $source_id AND in = $module_id",
            {
                "module_id": ensure_record_id(module_id),
                "source_id": ensure_record_id(source_id),
            },
        )

        return {"message": "Source removed from module successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"Error removing source {source_id} from module {module_id}: {str(e)}"
        )
        raise HTTPException(
            status_code=500, detail=f"Error removing source from module: {str(e)}"
        )


@router.delete("/modules/{module_id}")
async def delete_module(module_id: str, authorization: Optional[str] = Header(None)):
    """Delete a module."""
    try:
        module = await Module.get(module_id)
        if not module:
            raise HTTPException(status_code=404, detail="Module not found")

        if module.course:
            user_id = require_authenticated_user_id(authorization)
            await require_teaching_role(str(module.course), user_id)

        await module.delete()

        return {"message": "Module deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting module {module_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error deleting module: {str(e)}"
        )


async def _resolve_generation_context(
    request: GenerateContentRequest,
    authorization: Optional[str] = None,
):
    """Resolve sources+notes context from either module_id or source_ids.

    Returns (module_or_none, sources_context, notes_context, name, description).
    """
    if request.module_id:
        module = await Module.get(request.module_id)
        if not module:
            raise HTTPException(status_code=404, detail="Module not found")

        if module.course:
            user_id = require_authenticated_user_id(authorization)
            await require_teaching_role(str(module.course), user_id)

        sources = await module.get_sources()
        notes = await module.get_notes()
        notes_context = [{"title": n.title, "content": n.content} for n in notes]
        name = request.name or module.name
        description = module.description
    else:
        module = None
        sources = await Source.get_sources(request.source_ids)
        notes_context = []
        name = request.name
        description = ""

    sources_context = await build_sources_context(sources)
    return module, sources_context, notes_context, name, description


@router.post("/modules/generate-overview", response_model=GenerateOverviewResponse)
async def generate_module_overview(
    request: GenerateContentRequest,
    authorization: Optional[str] = Header(None),
):
    """Generate an AI overview from a module or from specific sources.

    If module_id is provided, generates from the module's sources+notes and saves the result.
    If source_ids is provided, generates from those sources without saving (preview mode).
    """
    try:
        module, sources_context, notes_context, name, description = (
            await _resolve_generation_context(request, authorization)
        )

        if not sources_context:
            return GenerateOverviewResponse(overview="")

        overview_content = await generate_overview(
            sources_context, notes_context, name, description,
        )

        if module:
            module.overview = overview_content
            await module.save()

        return GenerateOverviewResponse(overview=overview_content)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating overview: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error generating overview: {str(e)}"
        )


# ============================================
# Learning Goals Endpoints
# ============================================


@router.get(
    "/modules/{module_id}/learning-goals", response_model=List[LearningGoalResponse]
)
async def get_module_learning_goals(module_id: str):
    """Get all learning goals for a module."""
    try:
        module = await Module.get(module_id)
        if not module:
            raise HTTPException(status_code=404, detail="Module not found")

        goals = await module.get_learning_goals()
        return [
            LearningGoalResponse(
                id=str(goal.id),
                module=str(goal.module),
                description=goal.description,
                takeaways=goal.takeaways,
                competencies=goal.competencies,
                order=goal.order,
                created=str(goal.created),
                updated=str(goal.updated),
            )
            for goal in goals
        ]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching learning goals for module {module_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error fetching learning goals: {str(e)}"
        )


@router.post(
    "/modules/{module_id}/learning-goals", response_model=LearningGoalResponse
)
async def create_learning_goal(
    module_id: str,
    request: LearningGoalCreate,
    authorization: Optional[str] = Header(None),
):
    """Create a new learning goal for a module."""
    try:
        module = await Module.get(module_id)
        if not module:
            raise HTTPException(status_code=404, detail="Module not found")

        if module.course:
            user_id = require_authenticated_user_id(authorization)
            await require_teaching_role(str(module.course), user_id)

        # Get current max order for this module if order not provided
        order = request.order
        if order is None:
            existing_goals = await module.get_learning_goals()
            order = max([g.order for g in existing_goals], default=-1) + 1

        goal = LearningGoal(
            module=str(ensure_record_id(module_id)),
            description=request.description,
            takeaways=request.takeaways,
            competencies=request.competencies,
            order=order,
        )
        await goal.save()

        return LearningGoalResponse(
            id=str(goal.id),
            module=str(goal.module),
            description=goal.description,
            takeaways=goal.takeaways,
            competencies=goal.competencies,
            order=goal.order,
            created=str(goal.created),
            updated=str(goal.updated),
        )
    except HTTPException:
        raise
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating learning goal: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error creating learning goal: {str(e)}"
        )


@router.put("/learning-goals/{goal_id}", response_model=LearningGoalResponse)
async def update_learning_goal(
    goal_id: str,
    request: LearningGoalUpdate,
    authorization: Optional[str] = Header(None),
):
    """Update a learning goal."""
    try:
        goal = await LearningGoal.get(goal_id)
        if not goal:
            raise HTTPException(status_code=404, detail="Learning goal not found")

        module = await Module.get(str(goal.module))
        if module and module.course:
            user_id = require_authenticated_user_id(authorization)
            await require_teaching_role(str(module.course), user_id)

        if request.description is not None:
            goal.description = request.description
        if request.takeaways is not None:
            goal.takeaways = request.takeaways
        if request.competencies is not None:
            goal.competencies = request.competencies
        if request.order is not None:
            goal.order = request.order

        await goal.save()

        return LearningGoalResponse(
            id=str(goal.id),
            module=str(goal.module),
            description=goal.description,
            takeaways=goal.takeaways,
            competencies=goal.competencies,
            order=goal.order,
            created=str(goal.created),
            updated=str(goal.updated),
        )
    except HTTPException:
        raise
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating learning goal {goal_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error updating learning goal: {str(e)}"
        )


@router.delete("/learning-goals/{goal_id}")
async def delete_learning_goal(goal_id: str, authorization: Optional[str] = Header(None)):
    """Delete a learning goal."""
    try:
        goal = await LearningGoal.get(goal_id)
        if not goal:
            raise HTTPException(status_code=404, detail="Learning goal not found")

        module = await Module.get(str(goal.module))
        if module and module.course:
            user_id = require_authenticated_user_id(authorization)
            await require_teaching_role(str(module.course), user_id)

        await goal.delete()
        return {"message": "Learning goal deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting learning goal {goal_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error deleting learning goal: {str(e)}"
        )


@router.post(
    "/modules/generate-learning-goals",
    response_model=GenerateLearningGoalsResponse,
)
async def generate_module_learning_goals(
    request: GenerateContentRequest,
    authorization: Optional[str] = Header(None),
):
    """Generate AI-powered learning goals from a module or from specific sources.

    If module_id is provided, generates from the module's sources+notes,
    replaces existing goals, and saves the new ones.
    If source_ids is provided, generates from those sources without saving (preview mode).
    """
    try:
        module, sources_context, notes_context, name, description = (
            await _resolve_generation_context(request, authorization)
        )

        if not sources_context:
            return GenerateLearningGoalsResponse(learning_goals=[])

        generated_goals = await generate_learning_goals(
            sources_context, notes_context, name, description,
        )

        if module:
            # Delete existing learning goals for this module
            existing_goals = await module.get_learning_goals()
            for existing in existing_goals:
                await existing.delete()

            # Create new learning goals
            created_goals = []
            for i, goal_data in enumerate(generated_goals):
                goal = LearningGoal(
                    module=str(ensure_record_id(request.module_id)),
                    description=goal_data.description,
                    takeaways=goal_data.takeaways,
                    competencies=goal_data.competencies,
                    order=i,
                )
                await goal.save()
                created_goals.append(LearningGoalPreview(
                    description=goal.description,
                    takeaways=goal.takeaways,
                    competencies=goal.competencies,
                ))

            return GenerateLearningGoalsResponse(learning_goals=created_goals)
        else:
            return GenerateLearningGoalsResponse(
                learning_goals=[
                    LearningGoalPreview(
                        description=g.description,
                        takeaways=g.takeaways,
                        competencies=g.competencies,
                    )
                    for g in generated_goals
                ]
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating learning goals: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error generating learning goals: {str(e)}"
        )


# ============================================
# Preview Content Endpoints (for draft modules)
# ============================================



@router.post("/modules/preview-content", response_model=PreviewModuleContentResponse)
async def preview_module_content(request: PreviewModuleContentRequest):
    """Generate both overview and learning goals from sources without creating a module.

    This endpoint is used during the draft module creation flow for initial
    auto-generation when all sources finish processing.
    Uses the full module generation graph (overview and goals run in parallel).
    """
    try:
        result = await module_generation_graph.ainvoke(
            {"source_ids": request.source_ids, "name": request.name}
        )

        return PreviewModuleContentResponse(
            name=result.get("generated_name"),
            overview=result.get("overview"),
            learning_goals=result.get("learning_goals", []),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating preview content: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error generating preview content: {str(e)}"
        )
