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
MAX_CHUNK_CHARS = MAX_CHUNK_TOKENS * 4  # ~360k chars
CHUNK_OVERLAP_CHARS = 500


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

    tokens = token_count(content_str)

    if tokens <= MAX_CHUNK_TOKENS:
        # Content fits in a single call
        cleaned_content = await _invoke_model(system_prompt, content_str, model_id)
    else:
        # Content too large — chunk, transform each, then merge
        logger.info(
            f"Content has {tokens} tokens (>{MAX_CHUNK_TOKENS}), "
            f"using chunked transformation"
        )
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=MAX_CHUNK_CHARS,
            chunk_overlap=CHUNK_OVERLAP_CHARS,
            length_function=len,
        )
        chunks = splitter.split_text(content_str)
        logger.info(f"Split into {len(chunks)} chunks")

        # Transform each chunk
        chunk_results = []
        for i, chunk in enumerate(chunks):
            logger.debug(f"Transforming chunk {i + 1}/{len(chunks)} ({len(chunk)} chars)")
            chunk_prompt = f"{system_prompt}\n\n(Part {i + 1} of {len(chunks)})"
            result = await _invoke_model(chunk_prompt, chunk, model_id)
            chunk_results.append(result)

        # Merge chunk results with a consolidation pass
        merged_input = "\n\n---\n\n".join(
            f"## Part {i + 1}\n{r}" for i, r in enumerate(chunk_results)
        )
        merge_prompt = (
            f"You previously applied the following transformation to a long document "
            f"in {len(chunks)} parts:\n\n"
            f"**Transformation**: {transformation.title}\n"
            f"**Instructions**: {transformation.prompt}\n\n"
            f"Below are the results from each part. Consolidate them into a single, "
            f"cohesive result as if the transformation had been applied to the entire "
            f"document at once. Remove redundancy and ensure completeness.\n\n"
            f"# PARTIAL RESULTS"
        )
        cleaned_content = await _invoke_model(
            merge_prompt, merged_input, model_id, max_tokens=10000,
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
