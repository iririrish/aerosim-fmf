# Changelog

All notable changes to AEROSIM are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).
Every release must bump `backend/app/__init__.py` and add an entry below (enforced by `tests/test_changelog.py`).

## [0.3.0] - 2026-11-25
### Added
- DSMC parameter manager: save, edit (versioned), duplicate, compare, and export (JSON/CSV) configurations; link them to atmospheric datasets and spacecraft geometries.
- `POST /api/dsmc/defaults`: pre-fills a configuration from a geometry, an atmosphere (uploaded dataset or manual) and an altitude (domain, grid, time step, statistical weight, sampling windows).
- Validation of gas, collision, domain, particle, time-sampling and surface settings, including geometry/domain fit, cell size versus mean free path, and CFL-style step checks.
- SPARTA input generation (`in.sparta`, `geom.surf`, `collide.vss`) and upload of user-written SPARTA scripts; each is stored as a job (`ready` or `draft`).
- Capability registry (`/api/dsmc/capabilities`); unsupported options (species-pair overrides, grid adaptation, particle tracking) are not exposed.
- `/api/version`, `dsmc_versions` table, GitHub Actions CI, MIT license, `.gitignore`, changelog enforcement test.
### Notes
- Configuration-only: no SPARTA process is ever started and no result is claimed. Generated scripts have **not** been run against a SPARTA build; Phase 4 will verify them.

## [0.2.0] - 2026-11-25
### Added
- Spacecraft geometry (CubeSat box + conical membrane sail, STL import/export, versions, duplication, mesh inspection).
- Free-molecular engine: Maxwell and Sentman models, panel method with ray-traced shadowing, per-species speed ratios, Kn and regime warnings, forces, moments, stored results.
- Tests against analytic limits (flat plate, cone, shadowing).

## [0.1.0] - 2026-11-25
### Added
- FastAPI + SQLite foundation, full database schema, atmospheric dataset upload with column mapping, SI conversion, validation, duplicate detection, version history, dashboard counts.
