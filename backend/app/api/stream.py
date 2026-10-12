import asyncio

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.events import hub

router = APIRouter()


@router.get("/api/events")
async def event_stream(request: Request) -> StreamingResponse:
    queue = await hub.subscribe()

    async def generate():
        yield "event: connected\ndata: {\"ok\": true}\n\n"
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    message = await asyncio.wait_for(queue.get(), timeout=20)
                    yield f"event: message\ndata: {message}\n\n"
                except asyncio.TimeoutError:
                    yield "event: ping\ndata: {}\n\n"
        finally:
            await hub.unsubscribe(queue)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
