# AEROSIM - Phase 1

## Architecture
React/TS/Tailwind/shadcn/Three.js/Plotly (Phase 1b, localhost:5173)  --HTTP/JSON-->  FastAPI (backend/app/main.py)
FastAPI --> SQLite (data/aerosim.db) + local files (data/atmosphere, later data/geometry, data/sparta)
Later phases add backend modules: fmf/ (engine), dsmc/ (config, SPARTA script generator, job manager), compare/, reports/.
All profiles are stored in SI (m, K, kg/m^3, m^-3); the original upload is kept byte-for-byte.

## Schema
All 15 suggested tables plus dataset_versions and activity_log are created from backend/app/schema.sql (dsmc_jobs.status is constrained to draft/validating/ready/running/completed/failed).

## Plan
1. Foundation, DB, atmospheric upload, column mapping, preview, validation, duplicates, versions (this phase).
2. Geometry (STL, versions), FMF engine (Maxwell, Sentman, panel method with shadowing), results.
3. DSMC parameter manager, SPARTA script generation.
4. Local SPARTA runner (background jobs), output import.
5. FMF vs DSMC comparison, graphs, PDF/CSV/JSON reports.

## Run
    cd backend && pip install -r requirements.txt
    uvicorn app.main:app --reload      # API docs at http://localhost:8000/docs
    pytest

## Upload flow
POST /api/atmosphere/inspect (header, preview, suggested mapping, duplicate check) -> user edits mapping/units ->
POST /api/atmosphere/datasets (validates, converts to SI, stores). Validation checks: numeric/finite values, altitude >= 0 and unique,
density > 0, T in 50-5000 K, species mass density vs total density (warn above 20%).
