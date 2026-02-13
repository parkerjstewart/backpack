from typing import ClassVar, Optional

from pydantic import Field

from backpack.domain.base import ObjectModel, RecordModel


class Transformation(ObjectModel):
    table_name: ClassVar[str] = "transformation"

    # Fixed record IDs for built-in transformations (assigned via migration 17)
    DENSE_SUMMARY: ClassVar[str] = "transformation:dense_summary"
    ANALYZE_PAPER: ClassVar[str] = "transformation:analyze_paper"
    KEY_INSIGHTS: ClassVar[str] = "transformation:key_insights"
    REFLECTIONS: ClassVar[str] = "transformation:reflections"
    TABLE_OF_CONTENTS: ClassVar[str] = "transformation:table_of_contents"
    SIMPLE_SUMMARY: ClassVar[str] = "transformation:simple_summary"

    name: str
    title: str
    description: str
    prompt: str
    apply_default: bool


class DefaultPrompts(RecordModel):
    record_id: ClassVar[str] = "backpack:default_prompts"
    transformation_instructions: Optional[str] = Field(
        None, description="Instructions for executing a transformation"
    )
