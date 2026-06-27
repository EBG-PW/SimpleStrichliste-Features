# SimpleStrichliste Features

This repository contains optional features for SimpleStrichliste.

## Creating A Manifest

Each feature is described by a `feature.json` file in the feature root. This file is the manifest and should follow the existing feature structure.

### Minimal structure

- `name`: technical feature name
- `version`: feature version
- `minCoreVersion`: minimum supported core version
- `navbar`: optional navigation entry
- `adminCard`: admin dashboard card
- `localsMap`: locale groups loaded per route
- `db`: SQL migrations and optional seeds

### Workflow

1. Create a new feature folder.
2. Add `feature.json` as the manifest.
3. Store routes, views, libs, templates, and migrations inside the feature folder.
4. Keep all paths in `feature.json` relative to the feature root.
5. If the feature needs configuration, ship a default config file so the core can copy it on first start.
6. Bump the manifest version whenever feature behavior changes.

### Recommendation

- Only register locale groups in `localsMap` that a route actually needs.
- Prefer additive migrations instead of rewriting existing history.
- Ship default config files and let runtime code create the live config from them.
