# Data Specification

This document defines the JSON contracts used by the map application.

For repository layout and index file design, see [election-data-repository-design.md](election-data-repository-design.md).
For setup and configuration, see [README.md](README.md).

## File Roles In App Flow

1. The app loads `elections.index.json` from configured URLs.
2. The selected election entry points to `dataUrl` and `precinctsUrl`.
3. `dataUrl` resolves to the election results file (`data.json` in this specification).
4. `precinctsUrl` resolves to precinct GeoJSON, commonly named `precincts.gis.json`.

## data.json

### Description

`data.json` stores contest definitions, choices, and precinct-level election results.

### Specification

| Element             | Description                       | Type              |
|---------------------|-----------------------------------|-------------------|
| **Top-level object**|                                   |                   |
| contests            | Array of contest objects          | Array             |
| **Contest object**  |                                   |                   |
| index               | Contest index in array            | Integer           |
| id                  | Stable contest identifier         | String            |
| label               | Contest display name              | String            |
| choices             | Array of choice objects           | Array             |
| precincts           | Precinct ID to precinct data map  | Object            |
| **Choice object**   |                                   |                   |
| index               | Choice index in array             | Integer           |
| id                  | Stable choice identifier          | Integer or String |
| label               | Choice display name               | String            |
| party (optional)    | Party label                       | String            |
| color (optional)    | Color value used by UI            | String            |
| votes               | Total votes for the choice        | Integer           |
| **Precinct object** |                                   |                   |
| label               | Precinct display label            | String            |
| total (optional)    | Total votes in this contest       | Integer           |
| winner (optional)   | Winning choice index              | Integer           |
| results (optional)  | Votes per choice                  | Array of Integers |
| percentage (optional)| Vote share per choice            | Array of Floats   |
| registeredVoters    | Registered voters in precinct     | Integer           |
| totalVoters         | Voters who cast ballots           | Integer           |

### Example

```json
{
  "contests": [
    {
      "index": 0,
      "id": "C1",
      "label": "Governor",
      "choices": [
        {
          "index": 0,
          "id": 100,
          "label": "John Doe",
          "party": "Democrat",
          "color": "#1f78b4",
          "votes": 1500
        },
        {
          "index": 1,
          "id": 101,
          "label": "Jane Smith",
          "votes": 1000
        }
      ],
      "precincts": {
        "P1": {
          "label": "Precinct 1",
          "total": 200,
          "winner": 0,
          "results": [120, 80],
          "percentage": [0.6, 0.4],
          "registeredVoters": 300,
          "totalVoters": 200
        },
        "P2": {
          "label": "Precinct 2",
          "registeredVoters": 200,
          "totalVoters": 100
        }
      }
    }
  ]
}
```

## precincts.gis.json

### Description

`precincts.gis.json` is a GeoJSON FeatureCollection used for precinct geometry and map rendering.

Required integration rule:

- Each feature must include the field named by `precinctIdField` in `elections.index.json`.
- Values in that field must match keys in each contest's `precincts` object in `data.json`.

Common optional fields:

- Label field named by `precinctLabelField`
- Additional properties used for popup content or filtering

### Minimal Example

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "PrecinctID": "P1",
        "PrecinctNM": "Precinct 1"
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[-122.5, 37.7], [-122.4, 37.7], [-122.4, 37.8], [-122.5, 37.8], [-122.5, 37.7]]]
      }
    }
  ]
}
```

## Troubleshooting

- If precincts render but have no results, check that `precinctIdField` values match `data.json` precinct keys exactly.
- If popup titles are blank, confirm `precinctLabelField` exists in GeoJSON feature properties.
- If contest totals look wrong, verify `results` array order matches `choices` array order for each contest.

## Credit

Some content on this page was originally generated with assistance from [OpenAI](https://openai.com/).