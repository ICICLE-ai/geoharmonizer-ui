# Earth Data Hub

A browser-based geospatial data discovery and collection interface with three main workflows:

1. **Geospatial assistant** — interact with the GeoHarmonizer chat assistant for geospatial data exploration.
2. **Satellite availability** — upload and select an area of interest (AOI), configure collection parameters, and check available satellite scenes.
3. **HPC collection** — submit GeoHarmonizer collection workflows through [Tapis](https://tapis-project.github.io/live-docs/?service=Jobs) to available HPC resources and monitor their status.

📖 **[HOW_TO_USE.md](HOW_TO_USE.md)** — using the assistant, selecting an AOI, checking satellite availability, and submitting Tapis jobs.

## Architecture

```text
┌───────────────────────────────────────────────────────────────┐
│                 Earth Data Hub (React + Vite)                 │
│                                                               │
│   Chat Assistant │ AOI / Availability │ Tapis Jobs            │
└────────┬─────────────────┬──────────────────┬─────────────────┘
         │ HTTP            │ HTTP             │ HTTPS
         │                 │                  │
 ┌───────▼────────┐ ┌──────▼──────────┐ ┌─────▼──────────────┐
 │ GeoHarmonizer  │ │  Availability   │ │   Tapis Tenant    │
 │ Chat Service   │ │  STAC Service   │ │  Systems / Jobs   │
 └────────────────┘ └─────────────────┘ └─────────┬──────────┘
                                                  │ runs
                                         ┌────────▼──────────┐
                                         │  GeoHarmonizer   │
                                         │  Collection Job  │
                                         └───────────────────┘
```

## Project layout

| Path | What it is |
| --- | --- |
| `src/components/` | Main UI components for the map, AOI selection, chat, availability, and job submission. |
| `src/services/` | Service integrations for the GeoHarmonizer assistant, satellite availability, and Tapis APIs. |
| `src/hooks/` | React hooks supporting the map and application workflows. |
| `src/state/` | Shared application state and configuration. |
| `src/utils/` | Utility functions used across the frontend. |
| `src/App.jsx` | Main Earth Data Hub application component. |

## Quick start

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

## Tech stack

- **Frontend:** React + Vite
- **Geospatial:** Interactive map and AOI selection
- **Assistant:** GeoHarmonizer chat service
- **Satellite availability:** GeoHarmonizer STAC availability service
- **HPC:** Tapis + GeoHarmonizer collection jobs
- **Deployment:** Docker + Nginx

## Acknowledgements

*National Science Foundation (NSF) funded AI institute for Intelligent Cyberinfrastructure with Computational Learning in the Environment (ICICLE) (OAC 2112606).*

## Issue reporting

Please report issues through the GitHub Issues page for this repository.