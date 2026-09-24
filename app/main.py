import os
import sys
# Ensure src is in the python path for sh305 imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.api.rest import router as api_router
from app.api.websocket import router as ws_router
from app.api.deps import get_simulation_runtime

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    runtime = get_simulation_runtime()
    await runtime.shutdown()

app = FastAPI(
    title="SH-305 Backend API",
    description="Authoritative backend REST contract for Smart EV Charging.",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration for frontend/3D integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include the routers
app.include_router(api_router)
app.include_router(ws_router)

class ImmutableStaticFiles(StaticFiles):
    """StaticFiles without cache policy made every page load revalidate each chunk.

    Build chunk names are content-hashed, so a given name can never change — it is
    safe (and much faster) to let the browser reuse them for a year. index.html is
    still served with `no-cache`, so a rebuild is picked up on the next reload.
    """

    def file_response(self, *args, **kwargs):  # type: ignore[no-untyped-def]
        response = super().file_response(*args, **kwargs)
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response


# Serve frontend build
frontend_dist = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount(
        "/assets",
        ImmutableStaticFiles(directory=os.path.join(frontend_dist, "assets")),
        name="assets",
    )
    
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # The SPA fallback must never shadow the API/WebSocket namespaces —
        # previously an unknown or wrong-method /api route returned index.html
        # with HTTP 200 instead of a 404/405, silently corrupting API responses.
        if full_path == "api" or full_path.startswith("api/") or full_path == "ws" or full_path.startswith("ws/"):
            raise HTTPException(status_code=404, detail="Not found")
        file_path = os.path.join(frontend_dist, full_path)
        if os.path.isfile(file_path):
            if full_path.startswith("assets/"):
                # Hashed build chunks are immutable — cache forever.
                return FileResponse(file_path, headers={"Cache-Control": "public, max-age=31536000, immutable"})
            return FileResponse(file_path, headers={"Cache-Control": "no-cache"})
        # A missing hashed chunk is a hard error: returning index.html here made
        # stale cached pages boot against wrong/HTML 'JS' and fail silently.
        if full_path.startswith("assets/"):
            raise HTTPException(status_code=404, detail="Asset not found")
        # index.html must always be revalidated so a rebuild is picked up
        # immediately (stale cached index.html was serving dead chunk names).
        return FileResponse(os.path.join(frontend_dist, "index.html"), headers={"Cache-Control": "no-cache"})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
