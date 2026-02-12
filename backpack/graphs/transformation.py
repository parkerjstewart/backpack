import asyncio

from ai_prompter import Prompter
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langgraph.graph import END, START, StateGraph
from loguru import logger
from typing_extensions import TypedDict

from backpack.ai.provision import provision_langchain_model
from backpack.domain.module import Source
from backpack.domain.transformation import DefaultPrompts, Transformation
from backpack.utils import clean_thinking_content
from backpack.utils.token_utils import token_count

# Leave room for system prompt (~2k tokens) and output (~5k tokens)
MAX_CHUNK_TOKENS = 90_000
CHUNK_OVERLAP_TOKENS = 200
MAX_RECURSION_DEPTH = 3

_splitter = RecursiveCharacterTextSplitter(
    chunk_size=MAX_CHUNK_TOKENS,
    chunk_overlap=CHUNK_OVERLAP_TOKENS,
    length_function=token_count,
)


def _build_system_prompt(transformation: Transformation, state: dict) -> str:
    """Build the system prompt for a transformation."""
    transformation_template_text = transformation.prompt
    default_prompts: DefaultPrompts = DefaultPrompts(transformation_instructions=None)
    if default_prompts.transformation_instructions:
        transformation_template_text = (
            f"{default_prompts.transformation_instructions}\n\n{transformation_template_text}"
        )
    transformation_template_text = f"{transformation_template_text}\n\n# INPUT"
    return Prompter(template_text=transformation_template_text).render(data=state)


def _build_merge_prompt(transformation: Transformation, num_parts: int) -> str:
    """Build the merge/consolidation prompt from the Jinja template."""
    return Prompter(prompt_template="transformation/merge").render(
        data={
            "title": transformation.title,
            "prompt": transformation.prompt,
            "num_parts": num_parts,
        }
    )


async def _invoke_model(
    system_prompt: str, content: str, model_id: str | None, max_tokens: int = 5055
) -> str:
    """Invoke the LLM with a system prompt and content, return cleaned response."""
    payload = [SystemMessage(content=system_prompt), HumanMessage(content=content)]
    chain = await provision_langchain_model(
        str(payload), model_id, "transformation", max_tokens=max_tokens,
    )
    response = await chain.ainvoke(payload)
    response_content = (
        response.content if isinstance(response.content, str) else str(response.content)
    )
    return clean_thinking_content(response_content)


async def _chunked_transform(
    system_prompt: str,
    content: str,
    transformation: Transformation,
    model_id: str | None,
    depth: int = 0,
) -> str:
    """Recursively chunk, transform in parallel, and merge content.

    If the content fits within MAX_CHUNK_TOKENS, processes it in a single call.
    Otherwise, splits into chunks, processes them concurrently, and merges.
    If the merged result is still too large, recurses up to MAX_RECURSION_DEPTH.
    """
    tokens = token_count(content)

    if tokens <= MAX_CHUNK_TOKENS:
        return await _invoke_model(system_prompt, content, model_id)

    if depth >= MAX_RECURSION_DEPTH:
        logger.warning(
            f"Reached max recursion depth ({MAX_RECURSION_DEPTH}), "
            f"truncating merge input to fit"
        )
        truncated = content[: MAX_CHUNK_TOKENS * 4]
        return await _invoke_model(system_prompt, truncated, model_id, max_tokens=10000)

    chunks = _splitter.split_text(content)
    logger.info(
        f"[depth={depth}] Content has {tokens} tokens (>{MAX_CHUNK_TOKENS}), "
        f"split into {len(chunks)} chunks"
    )

    # Transform chunks in parallel
    async def _process_chunk(i: int, chunk: str) -> str:
        logger.debug(f"[depth={depth}] Transforming chunk {i + 1}/{len(chunks)} ({len(chunk)} chars)")
        chunk_prompt = f"{system_prompt}\n\n(Part {i + 1} of {len(chunks)})"
        return await _invoke_model(chunk_prompt, chunk, model_id)

    chunk_results = await asyncio.gather(
        *[_process_chunk(i, chunk) for i, chunk in enumerate(chunks)]
    )

    # Merge chunk results
    merged_input = "\n\n---\n\n".join(
        f"## Part {i + 1}\n{r}" for i, r in enumerate(chunk_results)
    )
    merge_prompt = _build_merge_prompt(transformation, len(chunks))

    # Recurse if merged results are still too large
    return await _chunked_transform(
        merge_prompt, merged_input, transformation, model_id, depth + 1
    )


class TransformationState(TypedDict):
    input_text: str
    source: Source
    transformation: Transformation
    output: str


async def run_transformation(state: dict, config: RunnableConfig) -> dict:
    source_obj = state.get("source")
    source: Source = source_obj if isinstance(source_obj, Source) else None  # type: ignore[assignment]
    content = state.get("input_text")
    assert source or content, "No content to transform"
    transformation: Transformation = state["transformation"]
    if not content:
        content = source.full_text
    content_str = str(content) if content else ""

    model_id = config.get("configurable", {}).get("model_id")
    system_prompt = _build_system_prompt(transformation, state)

    cleaned_content = await _chunked_transform(
        system_prompt, content_str, transformation, model_id
    )

    if source:
        await source.add_insight(transformation.title, cleaned_content)

    return {
        "output": cleaned_content,
    }


agent_state = StateGraph(TransformationState)
agent_state.add_node("agent", run_transformation)  # type: ignore[type-var]
agent_state.add_edge(START, "agent")
agent_state.add_edge("agent", END)
graph = agent_state.compile()
