# GitHub Election Data Repository Design

This document defines a GitHub-hosted repository format for election datasets that this app can consume.

For onboarding and deployment, see [README.md](README.md).
For file-level schema, see [dataSpecification.md](dataSpecification.md).

## Goals
- Publish election datasets as static JSON and GeoJSON files.
- Provide one machine-readable index that lists all elections.
- Support direct hosting with GitHub Pages and no backend.
- Keep each election self-contained and easy to version.
- Allow flexible folder structure and file naming while preserving a stable index contract.

## Required Contract

Only these requirements are mandatory for app compatibility:

- A reachable `elections.index.json` file
- A top-level `elections` array in that file
- For each election entry: `id`, `label`, and either legacy area fields or `layers`
- Legacy area mode fields: `dataUrl`, `areasUrl`, `areaIdField`, `areaLabelField`
- Layer mode fields: `layers[].id`, `layers[].label`, `layers[].dataUrl`, `layers[].gisUrl`, `layers[].joinField`
- Legacy aliases supported by the app: `precinctsUrl`, `precinctIdField`, `precinctLabelField`

Everything else in this document is recommended structure for maintainability.

## Recommended Repository Structure

/elections.index.json
/elections/
  /2026-11-03-general/
    data.json
    precincts.gis.json
    metadata.json

Optional deeper organization if needed:
 /elections/
  /2026-11-03-general/
    /ca/
      /contra-costa/
        data.json
        precincts.gis.json
        metadata.json

Recommended election folder name format:
- yyyy-mm-dd-type
- type can be primary, general, special

Examples:
- 2026-11-03-general
- 2026-06-02-primary
- 2026-08-18-special

The election id in elections.index.json can follow this same pattern, but it is not required for app compatibility.

Previous county-first layout is fully supported.

/legacy-example/
/elections/
  /ca/
    /sample-county/
      /2026-11-03-general/
        data.json
        precincts.gis.json
        metadata.json

## Index Contract

Top-level file: elections.index.json

Required top-level fields:
- version: integer schema version
- updated: ISO date string
- elections: array of election entries

Optional top-level fields:
- defaultElectionId: id to auto-load by default

Election entry fields:
- id: unique stable ID (any string)
- label: display name used by the app
- date: election date (YYYY-MM-DD)
- type: optional metadata (for example primary, general, special)
- county: county name
- state: state abbreviation
- dataUrl: relative path or absolute URL to election results JSON
- areasUrl: relative path or absolute URL to election GeoJSON in legacy area mode
- areaIdField: property name in GeoJSON that maps to election area keys in legacy area mode
- areaLabelField: property name used for popup titles in legacy area mode
- layers: optional array of geography-specific data and GIS artifacts
- grouped: boolean used by app behavior

Minimum required per election entry for this app:

- id
- label
- Either legacy area mode (`dataUrl`, `areasUrl`, `areaIdField`, `areaLabelField`) or `layers`

Recommended optional fields:
- source.name
- source.url
- tags array
- description

## Hosting Pattern

Use GitHub Pages from main branch root.

Example base URL:
https://YOUR_ORG.github.io/election-data-repo/

Example index URL:
https://YOUR_ORG.github.io/election-data-repo/elections.index.json

The app should read the index URL, pick defaultElectionId when present, and load selected election data in either legacy area mode or layer mode.

Path resolution rules:
- Relative paths are resolved relative to the index file location.
- Absolute URLs are used as-is, so data can live in another repository or domain.

## App Integration Pattern

This app now supports reading:
- https://raw.githubusercontent.com/YOUR_ORG/YOUR_REPO/main/elections.index.json

Behavior:
- App loads an external index URL and selects defaultElectionId or first entry.
- App applies mapped fields and file URLs from selected entry.
- If a snapshot includes `layers`, the app uses snapshot layers only.
- If a snapshot includes legacy area fields, the app uses those snapshot fields directly.
- Relative and absolute URLs are both supported in index entries.
- If index or data files fail to load, app remains usable and renders an empty map state.

Configuration touchpoints in this repository:

- `electionsIndexFiles` in [public/index.js](public/index.js)
- `precinctIDField` and `precinctLabelField` fallbacks in [public/index.js](public/index.js)
- `grouped` fallback behavior in [public/index.js](public/index.js)

## Query Parameter Contract

Canonical query parameters used by the app:

- `election`: Tilde-delimited hierarchy path in this format: `{electionid}~{snapshotid}~{layerid}`
- `datasource`: Alternate index host or full index URL
- `advanced`: Boolean flag to show advanced dataset controls
- `contest`: Optional contest selector value applied after dataset load
- `view`: Optional view selector value applied after dataset load
- `vision`: Optional vision mode value: `normal`, `highContrast`, or `colorblind`
- `opacity`: Optional overlay opacity value from `0` to `100`

Hierarchy behavior:

- `election={electionid}` selects the election group only.
- `election={electionid}~{snapshotid}` selects election and snapshot.
- `election={electionid}~{snapshotid}~{layerid}` selects election, snapshot, and layer.

Examples:

- `?election=2026-06-02-primary`
- `?election=2026-06-02-primary~2026-06-27T01-01-58Z-final`
- `?election=2026-06-02-primary~2026-06-27T01-01-58Z-final~precincts`
- `?datasource=localhost:8080&advanced=true`
- `?election=2026-06-02-primary~final~precincts&contest=0&view=w&vision=colorblind&opacity=70`

Selector param behavior:

- `contest`, `view`, `vision`, and `opacity` are optional deep-link inputs.
- These values are read on initial load and browser navigation.
- Changing contest, view, vision mode, or opacity in the UI does not rewrite the URL.
- When election, snapshot, or layer changes rewrite the hierarchy param, existing selector params are preserved.

Compatibility policy:

- The app intentionally supports only canonical keys listed above.
- Legacy aliases such as `electionid`, `snapshotid`, `geographyid`, and `ds` are not supported.

## Validation Checklist
- Every election.id is unique.
- defaultElectionId exists in elections array.
- Legacy mode entries have dataUrl + areasUrl and valid areaIdField/areaLabelField.
- Layer mode entries have at least one valid layers item.
- All referenced data and GIS URLs resolve successfully from the index file context.
- GeoJSON feature properties contain the configured join field (`areaIdField` or `layers[].joinField`).
- data.json area keys match join field values.

Additional recommended checks:

- Every election entry includes `label` and a valid date.
- Label fields (`areaLabelField` or `layers[].labelField`) exist on features expected in UI popups.
- Mixed absolute and relative URLs are tested from a deployed environment.

## Minimal Example Index

```json
{
  "version": 1,
  "updated": "2026-05-31",
  "defaultElectionId": "2026-11-03-general",
  "elections": [
    {
      "id": "2026-11-03-general",
      "type": "general",
      "label": "Sample County General Election Results",
      "date": "2026-11-03",
      "county": "Sample County",
      "state": "CA",
      "dataUrl": "elections/2026-11-03-general/data.json",
      "areasUrl": "https://raw.githubusercontent.com/YOUR_ORG/another-repo/main/elections/2026-11-03-general/precincts.gis.json",
      "areaIdField": "PrecinctID",
      "areaLabelField": "PrecinctNM",
      "grouped": false
    }
  ]
}
```
