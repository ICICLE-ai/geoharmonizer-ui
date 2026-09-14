# Earth Data Hub

A browser-based geospatial data discovery and collection interface for selecting an area of interest, checking satellite scene availability, configuring collection parameters, and submitting GeoHarmonizer collection jobs to HPC resources through Tapis.

**Tags:** CI4AI, Geospatial, Earth-Observation, Visual-Analytics, Software

### License

[![License](https://img.shields.io/badge/License-BSD_3--Clause-blue.svg)](https://opensource.org/licenses/BSD-3-Clause)

## References

- [Tapis Jobs API](https://tapis-project.github.io/live-docs/?service=Jobs) — HPC job submission and monitoring.
- [GeoHarmonizer](https://github.com/OSU-SAI-Lab/geoharmonizer) — backend collection and harmonization workflows.
- [Earth Data Hub UI](https://github.com/ICICLE-ai/geoharmonizer-ui) — frontend application.

## Acknowledgements

*National Science Foundation (NSF) funded AI institute for Intelligent Cyberinfrastructure with Computational Learning in the Environment (ICICLE) (OAC 2112606).*

## Issue Reporting

Please report issues through the [GitHub Issues](https://github.com/ICICLE-ai/geoharmonizer-ui/issues) page.

---

# Tutorials

## Open Earth Data Hub

Open the Earth Data Hub interface.

![Earth Data Hub interface](docs/images/earth-data-hub.png)

The main interface provides access to the interactive map, boundary upload, Job Setup, and Jobs monitoring.

## Upload and Select an Area of Interest

Click **Upload Boundary** and upload a supported geospatial boundary file.

![Uploaded Area of Interest](docs/images/aoi-selection.png)

After the boundary is loaded:

1. The uploaded boundary appears on the map.
2. Select the field or polygon you want to use.
3. The selected area becomes the Area of Interest (AOI).

Earth Data Hub supports two AOI options:

- **Bounding box** — uses the geographic extent of the selected area.
- **Exact geometry** — uses the complete selected geometry.

The selected AOI is used for satellite availability checking and collection job submission.

## Configure Satellite Collection

Open **Job Setup** after selecting an AOI.

Configure the collection settings based on the satellite imagery you want to retrieve.

## Check Satellite Availability

Click **Check Availability** after configuring the collection.

![Satellite availability results](docs/images/availability.png)

Earth Data Hub displays the number of usable satellite scenes and their acquisition dates.

Review the availability results before submitting the collection job.

## Configure the Tapis Job

A valid Tapis session is required for job submission.

If an active Tapis session is available, Earth Data Hub recognizes it and loads the available execution systems and queues.

Configure the execution settings and review the generated GeoHarmonizer job arguments before submitting.

![Tapis collection job configuration](docs/images/job-submission.png)

## Submit the Collection Job

Click **Submit Collection Job**.

After Tapis accepts the request, Earth Data Hub displays a submission confirmation and Job ID.

The submitted job can then be monitored from the **Jobs** page.

## Monitor the Job

Open the **Jobs** page to view submitted GeoHarmonizer collection jobs.

![Tapis job monitoring](docs/images/jobs.png)

The Jobs page shows the current status of submitted jobs. Use the available filters and **Refresh** to retrieve the latest information.


## Explore Lake

Open **Explore Lake** to view harmonized satellite imagery over Madison County,
Ohio, and the statistics derived from it.

### Choose a layer

The layer list is one row per sensor-and-band. Each row shows its source, its
ground resolution, and its revisit cadence.

- **All sources** lists every layer. The source buttons beside it narrow the
  list to a single sensor — use this when a blended view is not appropriate and
  you need a clean one-sensor read.
- A layer marked **no imagery** has no Cloud Optimized GeoTIFF behind it. It can
  still be queried for statistics and time series, but cannot be displayed.

### Step through dates

The slider below the map holds one stop per acquisition — not a continuous
scrub, because observations exist on those dates and nowhere between them.

Each stop is tinted by the sensor that produced it. **Where the colour changes,
the ground resolution changes**: stepping from a 10 m Sentinel-2 image to a 30 m
Landsat one is a change in the data, not only in time. The current date, sensor,
resolution and cloud cover are shown above the track.

Use the arrows to step, or play for an animation with a speed control. The
adjacent dates are preloaded so stepping is immediate.

### Read the imagery

The **Opacity** slider fades the imagery against the basemap. **Greyscale**,
**Viridis** and **RdYlGn** change the colour stretch.

The stretch itself is **held fixed across every date in a layer**. This matters:
if each date rescaled to its own range, unchanged ground would shift colour every
time you moved the slider, which looks exactly like real change.

### Field boundaries and zonal statistics

Field boundaries are drawn as outlines so the imagery underneath stays visible.
Click one to see its attributes.

**Show zonal stats** fills each boundary with its aggregate value for the current
layer instead. A polygon outlined in **amber** has a statistic that blends
sensors of different ground resolution — that number is a mean over measurements
that are not directly comparable. A dashed outline means no statistic was
returned for that polygon.

### Draw a polygon

**Draw** starts a new boundary:

- **click** to place a vertex
- **double-click** or **Enter** to close the shape and save it
- **Backspace** to remove the last vertex
- **Esc** to cancel

### Point time series

Click anywhere on the map that is not a polygon to open the time series for that
location.

**Each sensor is plotted as its own line, and they are never merged.** A 10 m and
a 30 m measurement of the same ground are different quantities; a single combined
line would draw a resolution difference as though it were change over time. Each
legend entry carries its source's ground resolution for that reason. The date
currently shown on the map is marked on the chart.

### Provenance

The panel on the right always shows what produced the view: every contributing
source with its resolution and cadence, the resolution range, the cadences
present, and any warnings.

**Warnings are not advisory.** A warning that a result mixes 10 m and 30 m
observations means the numbers should be read differently than they would be
without it. When more than one ground resolution is present, the range is
flagged at the top of the source list.

### Upload your own layers

**Sign in first.** The identity strip at the top of the panel names the account
that will own whatever you upload, read from your Tapis session. Uploading is
unavailable while signed out, because a layer with no owner cannot be shared or
made private later.

Press **Upload**. A single `.tif` / `.tiff` is the simple case: choose it, and
the file is drawn on the map from your browser before anything is sent —
nothing reaches S3 until you have seen what the scene actually contains. Fill
in the layer name, units and date, then upload. Ingestion runs in the
background; the layer appears under **My layers** as `queued` and turns `ready`
when its pixels are queryable.

#### Several scenes at once

A single GeoTIFF is self-describing — its CRS, extent and resolution are read
straight out of the file. A *set* of files is not: nothing inside
`ndvi_2024-07.tif` says it is July's NDVI scene rather than August's, and
nothing relates it to the files beside it. A manifest is what writes that
relationship down, and it is the only thing it is for.

Select a `.json` manifest alongside the rasters. Scenes sharing a `name` become
timesteps of **one** layer, which is what makes the time slider meaningful for
your own data:

```json
{
  "title": "Molly Caren 2024",
  "visibility": "private",
  "units": "index",
  "layers": [
    {
      "name": "ndvi",
      "times": [
        { "date": "2024-06-01", "file": "ndvi_2024-06.tif", "cloud_cover": 3.1 },
        { "date": "2024-07-01", "file": "ndvi_2024-07.tif" }
      ]
    }
  ]
}
```

`date` is a full ISO date, and `file` names a file you are uploading — not a key
that already exists in S3. YAML is accepted too, since it is the same shape.

#### Uploading across several sittings

The files do not all have to arrive at once. The manifest describes the whole
set; each upload ingests whichever of those files you selected this time.

Choose the manifest on its own and the scene table appears immediately, every
row marked **need file**. Add rasters with **Add files** or **Add folder** — the
summary above the table keeps a running count:

```
2 in the lake   |   1 ready now   |   3 still needed
```

Upload what you have. Later, reopen the panel and select the *same manifest*
again: scenes already ingested come back marked **in the lake** and are skipped,
so re-selecting a file you have already uploaded costs nothing and creates no
duplicate timestep. There is no upload session to resume and nothing to keep
track of between sittings — what has landed is read back from the lake itself.

A selected raster the manifest never mentions is called out by name rather than
ignored, since a mistyped filename would otherwise look like a clean upload that
is quietly missing a scene.

#### Who can see it

Each layer under **My layers** carries **Private**, **Public** and **Share**.
Private is the default. Share takes a list of usernames. Only the owner sees
these controls, and visibility can be changed at any time after upload.

### Fixture data

With `VITE_USE_MOCK_SERVICES` enabled the panel says so, and the whole workflow
runs against realistic fixtures instead of the live lake. Every endpoint the
view uses is implemented on the backend — set it to `false` for the real
thing, including real satellite imagery. If a backend endpoint is ever
unreachable or rolled back, live mode names exactly what is missing rather
than showing an empty map.

---

# How-To Guides

## Run Earth Data Hub Locally

Install the frontend dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Build the production frontend:

```bash
npm run build
```

## Run with Docker

Build the Earth Data Hub frontend image:

```bash
docker build -t earth-data-hub-ui:latest .
```

Run the container:

```bash
docker run --rm -p 8080:80 earth-data-hub-ui:latest
```
---

# Explanation

## Area of Interest

The Area of Interest (AOI) defines the geographic region used for satellite data discovery and collection.

Earth Data Hub allows users to upload geospatial boundaries and select a field or polygon from the interactive map.

The selected AOI can be represented as either a bounding box or exact geometry.

## Satellite Availability

Before submitting a collection job, Earth Data Hub can check whether satellite imagery is available for the selected AOI and collection settings.

```text
Earth Data Hub
      │
      ▼
GeoHarmonizer Availability Service
      │
      ▼
Earth Search STAC
```

The available scenes are returned to Earth Data Hub and displayed to the user before job submission.

## Tapis Collection Workflow

Earth Data Hub converts the selected AOI and collection configuration into a GeoHarmonizer collection job and submits it through Tapis.

```text
Earth Data Hub
      │
      ▼
Tapis Jobs API
      │
      ▼
HPC Execution System
      │
      ▼
geoharmonizer-collect
```

After submission, the job can be monitored from the **Jobs** page until the collection workflow completes.