"""Utility for draining a tutor token_queue with LangGraph replay-buffer filtering.

When LangGraph resumes from an interrupt(), it re-runs the interrupted node
(tutor_turn), causing the previous message to be re-streamed. This module
provides a shared async generator that buffers those "replay" tokens and
discards them once the sentinel arrives while the graph is still running,
yielding only the real new-response tokens.

Used by:
  - api/routers/tutor.py   (HTTP SSE streaming endpoint)
  - api/voice_service.py   (WebSocket voice streaming)
"""

import asyncio
import queue as _queue
from typing import AsyncIterator

from loguru import logger

# Hard cap on replay buffer size. The replay pass re-streams the previous
# tutor message (~200–500 tokens typically); 4000 is a generous upper bound.
# Tokens beyond this cap are silently dropped — they're all replay tokens
# destined to be discarded anyway.
_MAX_REPLAY_BUFFER = 4000


async def drain_token_queue(
    token_queue: _queue.Queue,
    graph_task: "asyncio.Future[object]",
    session_id: str,
) -> AsyncIterator[str]:
    """Yield real response tokens from a tutor token_queue, skipping replay tokens.

    LangGraph re-runs the interrupted tutor_turn node on resume, so the first
    batch of tokens is a replay of the previous message.  We buffer them and
    discard when we see the sentinel (None) while the graph is still alive.
    The second run's tokens (the actual new response) are yielded immediately.

    If only one tutor_turn ran (no replay), the buffer is flushed at the final
    sentinel or when the graph task finishes without a sentinel.

    Args:
        token_queue: Queue fed by tutor_turn via token_queue.put(token/None).
        graph_task:  The asyncio Future wrapping the graph.invoke() call.
        session_id:  Used only for log messages.

    Yields:
        str — individual token strings in emission order.
    """
    loop = asyncio.get_running_loop()
    token_buffer: list[str] = []
    streaming_active = False  # True once replay sentinel is received

    while True:
        try:
            item = await loop.run_in_executor(
                None, lambda: token_queue.get(timeout=0.1)
            )
            if item is None:  # sentinel from tutor_turn finally block
                if graph_task.done():
                    # Final sentinel — flush buffer if only one tutor_turn ran
                    if not streaming_active and token_buffer:
                        logger.info(
                            f"drain [{session_id}]: single tutor_turn, "
                            f"flushing {len(token_buffer)}-token buffer"
                        )
                        for tok in token_buffer:
                            yield tok
                    logger.info(f"drain [{session_id}]: final sentinel, done")
                    break
                else:
                    # Graph still running — sentinel is from the replay pass.
                    # Discard buffered replay tokens and switch to live streaming.
                    logger.info(
                        f"drain [{session_id}]: replay sentinel — discarding "
                        f"{len(token_buffer)} replay tokens, switching to live streaming"
                    )
                    token_buffer.clear()
                    streaming_active = True
            else:
                if streaming_active:
                    yield item
                else:
                    if len(token_buffer) < _MAX_REPLAY_BUFFER:
                        token_buffer.append(item)
                    elif len(token_buffer) == _MAX_REPLAY_BUFFER:
                        logger.warning(
                            f"drain [{session_id}]: replay buffer hit "
                            f"{_MAX_REPLAY_BUFFER}-token cap — dropping excess replay tokens"
                        )
        except _queue.Empty:
            if graph_task.done():
                # Graph finished without sending a final sentinel — flush if needed
                if not streaming_active and token_buffer:
                    logger.info(
                        f"drain [{session_id}]: graph done (no sentinel), "
                        f"flushing {len(token_buffer)}-token buffer"
                    )
                    for tok in token_buffer:
                        yield tok
                logger.info(f"drain [{session_id}]: graph done (queue empty)")
                break
            continue
