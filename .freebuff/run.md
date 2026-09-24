# Run Doc — SH-305 Backend + Frontend

## Reproduce artifacts (fresh checkout)

1. **Backend dependencies** (Python 3.13):
   ```
   pip install -r requirements.txt
   ```
2. **Frontend dependencies** (npm, in `frontend/`):
   ```
   cd frontend && npm install
   ```
3. **Frontend build artifacts** (served by FastAPI from `frontend/dist/`):
   ```
   cd frontend && npm run build
   ```
4. **Environment files**: no `.env` is required. Only `frontend/.env.example` exists
   (copy to `frontend/.env.local` if you need to override Vite vars); the backend
   reads its SQLite path from `app/core/config.py` defaults (`data/sh305.db`).
5. **Database**: `data/sh305.db` is seeded automatically on first run via
   `app/db/init_db.py` (called from `app/api/deps.py` when the app imports).

## Run the server

The FastAPI app serves both the REST/WebSocket API and the built frontend from
`frontend/dist/`. Default port is **8000**:

```
python -m uvicorn app.main:app --port 8000
```

Then open http://127.0.0.1:8000/ — the dashboard UI loads from `frontend/dist/`
and talks to the API on the same origin (`/api/*`, `/ws/state`).

For frontend hot-reload development instead:
```
cd frontend && npm run dev
```
(Vite dev server, port 5173; set the API base URL in `frontend/.env.local` if the
backend runs on a different port.)
