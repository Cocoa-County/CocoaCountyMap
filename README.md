# CocoaCountyMap

CocoaCountyMap is an interactive election map template for publishing precinct-level results with static files only.

Deploy the contents of [public](public) to GitHub Pages to run the app.

If you would like more information or a demo, please reach out on [LinkedIn](https://www.linkedin.com/in/spinnernicholas/).

## Features

- Interactive precinct-level election results visualization
- Multiple views: winner by precinct, contest turnout, and candidate vote percentages
- Support for multiple contests and counties
- Adjustable map opacity for geographic context
- Customizable candidate colors
- Responsive layout for desktop and mobile
- Guided tour for first-time users
- Precinct-level turnout and voter statistics

## Quick Start

1. Publish this repository with GitHub Pages and serve the [public](public) folder.
2. Configure one or more index URLs in [public/index.js](public/index.js) by editing the `electionsIndexFiles` array.
3. Ensure each index URL points to an `elections.index.json` file.
4. For each election entry, set `dataUrl`, `precinctsUrl`, `precinctIdField`, and `precinctLabelField`.
5. Open the site and load a dataset from the election browser.

## Data Files And Contracts

- File schema details: [dataSpecification.md](dataSpecification.md)
- Repository design and index contract: [election-data-repository-design.md](election-data-repository-design.md)

The app selects `defaultElectionId` when present in `elections.index.json`, otherwise it falls back to the first election entry.

### URL Resolution Rules

- `dataUrl` and `precinctsUrl` may be relative paths.
- `dataUrl` and `precinctsUrl` may also be full absolute URLs.
- Relative paths are resolved from the location of `elections.index.json`.

## Configuration Notes

Common configuration variables in [public/index.js](public/index.js):

- `electionsIndexFiles`: candidate index URLs loaded at startup
- `precinctIDField`: active GeoJSON join field used by the map renderer
- `precinctLabelField`: field used for precinct labels in popups and UI
- `grouped`: enables grouped election behavior when supported by index entries
- `defaultMapView`: default center and zoom when no election is loaded

## Troubleshooting

- If no elections appear, confirm `electionsIndexFiles` points to a reachable `elections.index.json` URL.
- If precincts do not color correctly, verify election precinct keys match GeoJSON values in `precinctIdField`.
- If labels look wrong or empty, verify `precinctLabelField` exists on GeoJSON features.
- If files fail to load from another repository, check URL paths and hosting permissions.

## Credits

Built with [Leaflet](https://leafletjs.com/)

Basemap provided by [OpenStreetMap](https://www.openstreetmap.org/)

### County Elections Departments

Add your relevant county election department links here for your deployment.
