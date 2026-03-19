import os
import re
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, TypeVar, Union

from loguru import logger
from surrealdb import AsyncSurreal, RecordID  # type: ignore

T = TypeVar("T", Dict[str, Any], List[Dict[str, Any]])
_TRANSIENT_DB_MAX_ATTEMPTS = 3
_TRANSIENT_DB_BASE_DELAY_SECONDS = 0.25
_UUID_KEY_PATTERN = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


def get_database_url():
    """Get database URL with backward compatibility"""
    surreal_url = os.getenv("SURREAL_URL")
    if surreal_url:
        return surreal_url

    # Fallback to old format - WebSocket URL format
    address = os.getenv("SURREAL_ADDRESS", "localhost")
    port = os.getenv("SURREAL_PORT", "8000")
    return f"ws://{address}/rpc:{port}"


def get_database_password():
    """Get password with backward compatibility"""
    return os.getenv("SURREAL_PASSWORD") or os.getenv("SURREAL_PASS")


def parse_record_ids(obj: Any) -> Any:
    """Recursively parse and convert RecordIDs into strings."""
    if isinstance(obj, dict):
        return {k: parse_record_ids(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [parse_record_ids(item) for item in obj]
    elif isinstance(obj, RecordID):
        return str(obj)
    return obj


def ensure_record_id(value: Union[str, RecordID]) -> RecordID:
    """Ensure a value is a RecordID."""
    if isinstance(value, RecordID):
        return value
    return RecordID.parse(value)


def _is_transient_database_error(exc: Exception) -> bool:
    """Return True for transient transport/websocket DB failures."""
    if isinstance(exc, (ConnectionError, TimeoutError, asyncio.TimeoutError)):
        return True

    # SurrealDB websocket client can raise KeyError('<query-uuid>') after
    # cancelled futures. Treat that as transient and retry with a fresh connection.
    if isinstance(exc, KeyError):
        key = str(exc).strip("\"'")
        if _UUID_KEY_PATTERN.fullmatch(key):
            return True

    message = str(exc).lower()
    transient_markers = (
        "timed out during opening handshake",
        "future cancelled",
        "cancellederror",
        "connection closed",
        "connection reset",
        "broken pipe",
        "temporarily unavailable",
        "websocket",
    )
    return any(marker in message for marker in transient_markers)


async def _run_with_transient_db_retry(coro_factory, operation_name: str):
    """Run a DB operation with retries for transient transport failures."""
    for attempt in range(1, _TRANSIENT_DB_MAX_ATTEMPTS + 1):
        try:
            return await coro_factory()
        except RuntimeError:
            # Preserve transaction conflict semantics.
            raise
        except Exception as exc:
            is_last_attempt = attempt == _TRANSIENT_DB_MAX_ATTEMPTS
            if not _is_transient_database_error(exc) or is_last_attempt:
                raise
            delay = _TRANSIENT_DB_BASE_DELAY_SECONDS * (2 ** (attempt - 1))
            logger.warning(
                f"{operation_name} transient error (attempt {attempt}/"
                f"{_TRANSIENT_DB_MAX_ATTEMPTS}): {exc}. Retrying in {delay:.2f}s"
            )
            await asyncio.sleep(delay)


@asynccontextmanager
async def db_connection():
    db = AsyncSurreal(get_database_url())
    await db.signin(
        {
            "username": os.environ.get("SURREAL_USER"),
            "password": get_database_password(),
        }
    )
    await db.use(
        os.environ.get("SURREAL_NAMESPACE"), os.environ.get("SURREAL_DATABASE")
    )
    try:
        yield db
    finally:
        await db.close()


async def repo_query(
    query_str: str, vars: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """Execute a SurrealQL query and return the results"""
    async def _execute():
        async with db_connection() as connection:
            result = parse_record_ids(await connection.query(query_str, vars))
            if isinstance(result, str):
                raise RuntimeError(result)
            return result

    try:
        return await _run_with_transient_db_retry(_execute, "repo_query")
    except RuntimeError as e:
        # RuntimeError is raised for retriable transaction conflicts - log at debug to avoid noise
        logger.debug(str(e))
        raise
    except Exception as e:
        logger.exception(e)
        raise


async def repo_create(table: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new record in the specified table"""
    # Remove 'id' attribute if it exists in data
    data.pop("id", None)
    data["created"] = datetime.now(timezone.utc)
    data["updated"] = datetime.now(timezone.utc)
    async def _execute():
        async with db_connection() as connection:
            result = parse_record_ids(await connection.insert(table, data))
            if isinstance(result, str):
                raise RuntimeError(result)
            return result

    try:
        return await _run_with_transient_db_retry(_execute, "repo_create")
    except RuntimeError as e:
        logger.error(str(e))
        raise
    except Exception as e:
        logger.exception(e)
        raise RuntimeError("Failed to create record")


async def repo_relate(
    source: str, relationship: str, target: str, data: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """Create a relationship between two records with optional data"""
    if data is None:
        data = {}
    query = f"RELATE {source}->{relationship}->{target} CONTENT $data;"
    # logger.debug(f"Relate query: {query}")

    return await repo_query(
        query,
        {
            "data": data,
        },
    )


async def repo_upsert(
    table: str, id: Optional[str], data: Dict[str, Any], add_timestamp: bool = False
) -> List[Dict[str, Any]]:
    """Create or update a record in the specified table"""
    data.pop("id", None)
    if add_timestamp:
        data["updated"] = datetime.now(timezone.utc)
    query = f"UPSERT {id if id else table} MERGE $data;"
    return await repo_query(query, {"data": data})


async def repo_update(
    table: str, id: str, data: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """Update an existing record by table and id"""
    # If id already contains the table name, use it as is
    try:
        if isinstance(id, RecordID) or (":" in id and id.startswith(f"{table}:")):
            record_id = id
        else:
            record_id = f"{table}:{id}"
        data.pop("id", None)
        if "created" in data and isinstance(data["created"], str):
            data["created"] = datetime.fromisoformat(data["created"])
        data["updated"] = datetime.now(timezone.utc)
        query = f"UPDATE {record_id} MERGE $data;"
        # logger.debug(f"Update query: {query}")
        result = await repo_query(query, {"data": data})
        # if isinstance(result, list):
        #     return [_return_data(item) for item in result]
        return parse_record_ids(result)
    except Exception as e:
        raise RuntimeError(f"Failed to update record: {str(e)}")


async def repo_delete(record_id: Union[str, RecordID]):
    """Delete a record by record id"""
    async def _execute():
        async with db_connection() as connection:
            return await connection.delete(ensure_record_id(record_id))
    try:
        return await _run_with_transient_db_retry(_execute, "repo_delete")
    except Exception as e:
        logger.exception(e)
        raise RuntimeError(f"Failed to delete record: {str(e)}")


async def repo_insert(
    table: str, data: List[Dict[str, Any]], ignore_duplicates: bool = False
) -> List[Dict[str, Any]]:
    """Create a new record in the specified table"""
    async def _execute():
        async with db_connection() as connection:
            return parse_record_ids(await connection.insert(table, data))

    try:
        return await _run_with_transient_db_retry(_execute, "repo_insert")
    except Exception as e:
        if ignore_duplicates and "already contains" in str(e):
            return []
        logger.exception(e)
        raise RuntimeError("Failed to create record")
