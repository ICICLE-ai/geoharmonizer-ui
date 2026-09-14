# Earth Data Hub

A browser-based geospatial data discovery and collection interface with four main workflows:

1. **Geospatial assistant** — interact with the GeoHarmonizer chat assistant for geospatial data exploration.
2. **Satellite availability** — upload and select an area of interest (AOI), configure collection parameters, and check available satellite scenes.
3. **HPC collection** — submit GeoHarmonizer collection workflows through [Tapis](https://tapis-project.github.io/live-docs/?service=Jobs) to available HPC resources and monitor their status.
4. **Explore Lake** — view harmonized satellite imagery over time, colour field boundaries by aggregate statistics, and see which sensors produced what is on screen.

## Documentation

| Document | What it covers |
| --- | --- |
| [HOW_TO_USE.md](HOW_TO_USE.md) | Using the assistant, selecting an AOI, checking satellite availability, and submitting Tapis jobs. |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Development setup and pull request expectations. |
| [docs/TESTING.md](docs/TESTING.md) | How a change is verified before merge and before deployment. |
| [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md) | What must be complete before a public release. |
| [docs/MAINTAINER_ROLES.md](docs/MAINTAINER_ROLES.md) | Who is responsible for review, release, security, and deployment. |
| [SECURITY.md](SECURITY.md) | Reporting a vulnerability, and the security properties of a browser-side application. |

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

## Project Layout

| Path | What it is |
| --- | --- |
| `src/components/` | Main UI components for the map, AOI selection, chat, availability, and job submission. |
| `src/components/lake/` | Explore Lake — raster imagery, time slider, field polygons, zonal statistics, and the provenance panel. |
| `src/services/` | Service integrations for the GeoHarmonizer assistant, satellite availability, and Tapis APIs. |
| `src/hooks/` | React hooks supporting the map and application workflows. |
| `src/state/` | Shared application state and configuration. |
| `src/utils/` | Utility functions used across the frontend. |
| `src/App.jsx` | Main Earth Data Hub application component. |

## Quick Start

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

## Deploying to Tapis Pods

The image serves the built SPA with nginx on **port 5000**, which is the port Tapis Pods route to. If your pod definition uses a different `networking.port`, override it at run time — no rebuild needed:

```
-e PORT=8080
```

Build and push for the **cluster's architecture**. A plain `docker build` on an Apple Silicon Mac produces a linux/arm64 image that the x86_64 pod hosts cannot run, and the failure surfaces as a 502 from the ingress:

```bash
docker buildx build --platform linux/amd64 \
  --build-arg VITE_TAPIS_API_URL=https://icicle.tapis.io \
  --build-arg VITE_SLURM_ACCOUNT=<account> \
  --build-arg VITE_USE_MOCK_SERVICES=false \
  --build-arg VITE_AVAILABILITY_API_URL=https://<availability-host> \
  --build-arg VITE_CHAT_API_URL=https://<assist-host> \
  --build-arg VITE_LAKE_API_URL=https://<lake-api-host> \
  -t <registry>/geoharmonizer-ui:<tag> --push .
```

`VITE_*` values are inlined into the bundle at build time, so they must be passed as `--build-arg`. Setting them on the running container does nothing.

### Checking a failed deploy

```
curl -s https://tapis.io/v3/pods/<pod_id>       -H "X-Tapis-Token: $TOKEN"  # status
curl -s https://tapis.io/v3/pods/<pod_id>/logs  -H "X-Tapis-Token: $TOKEN"  # container logs
```

A 502 means the ingress reached the pod but nothing answered on the routed port: wrong port, wrong image architecture, or a container that exited.

## Explore Lake: backend status

The Explore Lake view is written against the lake query API contract, and
every endpoint in it is now implemented server-side (harvest-iceberg-datalake):

| Endpoint | Status |
| --- | --- |
| `GET /layers` | implemented |
| `GET /sources` | implemented |
| `GET /vector/features` | implemented (empty until a boundary is drawn or ingested) |
| `GET /observations/timeseries` | implemented, but keyed by **H3 cell**, not `lon`/`lat` |
| `GET /layers/{layer_id}/timesteps` | implemented — reads a new `acquisition_registry` table |
| `GET /tiles/{layer_id}/{date}/{z}/{x}/{y}.png` | implemented — reads the original provider COG live, nothing copied into our own storage |
| `GET /zonal/stats` | implemented — the vector↔raster H3 join |
| `POST /vector/upload` | implemented |
| `POST /uploads/presign` | implemented — the browser PUTs straight to S3 |
| `POST /layers/raster-upload` | implemented — single-scene ingest |
| `POST /layers/manifest-upload` | implemented — multi-scene ingest, partial batches allowed |
| `GET /layers/mine` | implemented |
| `PATCH /layers/{layer_id}/visibility`, `*/grants` | implemented — owner-only |

`VITE_USE_MOCK_SERVICES=false` talks to the real backend end-to-end, including
real satellite imagery tiles. Mocks remain useful offline or for fast layout
iteration.

`services/lake.js` adapts one live/contract difference: the point time series
contract takes `lon`/`lat`, but the live endpoint is keyed by H3 cell, so a
clicked point is snapped to one before querying — H3 stays an internal query
mechanism and never reaches the UI.

Every layer in the lake today declares no `valid_min`/`valid_max`, so imagery
has no server-declared display stretch either. When one is absent, the UI
samples a handful of cells via `/observations/cells` (H3 res chosen for the
layer's extent — coarse for wide layers, finer for a small uploaded scene
that would otherwise land in a single cell and yield a degenerate stretch;
used only to estimate a range, never to draw hexagons) and computes one
the same way the zonal choropleth already does, holding it fixed across every
date in the layer.

## Tech Stack

- **Frontend:** React + Vite
- **Geospatial:** Interactive map and AOI selection
- **Assistant:** GeoHarmonizer chat service
- **Satellite availability:** GeoHarmonizer STAC availability service
- **HPC:** Tapis + GeoHarmonizer collection jobs
- **Deployment:** Docker + Nginx

## Acknowledgements

*National Science Foundation (NSF) funded AI institute for Intelligent Cyberinfrastructure with Computational Learning in the Environment (ICICLE) (OAC 2112606).*

## Issue Reporting

Please report issues through the GitHub Issues page for this repository.