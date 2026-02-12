from typing import ClassVar, Optional

from loguru import logger
from pydantic import Field

from backpack.database.repository import repo_query
from backpack.domain.base import ObjectModel, RecordModel


class Transformation(ObjectModel):
    table_name: ClassVar[str] = "transformation"
    name: str
    title: str
    description: str
    prompt: str
    apply_default: bool

    @classmethod
    async def get_by_title(cls, title: str) -> Optional["Transformation"]:
        """Look up a transformation by its title (case-insensitive)."""
        try:
            results = await repo_query(
                "SELECT * FROM transformation WHERE string::lowercase(title) = $title LIMIT 1",
                {"title": title.lower()},
            )
            if results:
                return cls(**results[0])
        except Exception as e:
            logger.warning(f"Failed to look up transformation by title '{title}': {e}")
        return None


class DefaultPrompts(RecordModel):
    record_id: ClassVar[str] = "backpack:default_prompts"
    transformation_instructions: Optional[str] = Field(
        None, description="Instructions for executing a transformation"
    )
