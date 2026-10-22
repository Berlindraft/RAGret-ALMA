# Local setup

Requires Python 3.11+ and Node.js 22+. Run these commands from the repository root in PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
npm --prefix frontend install
Copy-Item backend/.env.example backend/.env
```

Only copy the environment template on a fresh checkout; preserve an existing `backend/.env`. Set `DEEPSEEK_API_KEY` there. For the hackathon endpoint, see the ALMA configuration in the [README](README.md#providers). Restart the backend after environment changes.

Start the backend:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 3005
```

Start the frontend in a separate terminal:

```powershell
npm --prefix frontend run dev -- --host 127.0.0.1
```

Open http://127.0.0.1:5173. API docs are at http://127.0.0.1:3005/docs. Vite proxies `/api` to the backend; no database service is required.

## Load the hackathon demo

Stop the backend and follow [examples/README.md](examples/README.md). The loader backs up and replaces the active workspace. Local data and backups are ignored by Git; pushing the repository does not transfer your current workspace.

## Connection troubleshooting

Click the provider status in the top bar to check access again after changing networks. The app also checks on startup and browser online events. A successful check confirms credentials and configured-model access at that moment; generation can still fail later. Provider transport failures show a labeled saved-evidence fallback for questions. Conversation extraction needs a working provider and can be retried. Reference indexing, stored graph browsing, viewers, and downloads work without generation.

## Verification

```powershell
$env:PYTHONPATH='backend'
.\.venv\Scripts\python.exe -m unittest discover -s backend/tests -v
npm --prefix frontend run build
npm --prefix frontend run lint
```

Backend tests use mocked provider responses and do not spend credits. See [implementation details](docs/IMPLEMENTATION.md) for data flow and UI verification.
