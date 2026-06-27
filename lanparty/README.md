# Lanparty

Lanparty feature for event registration, price calculation, and payment handling.

## Overview

- Public registration under `/register`
- Event setup under `/setup`
- Admin areas for users, prices, and payments
- Price calculation based on arrival and departure dates

## Important Paths

- `feature.json`: manifest and route metadata
- `api/lanparty_api.js`: REST endpoints
- `lib/lanparty_service.js`: event, price, and payment logic
- `registration/`: registration hook
- `public/lanparty_registration.js`: registration frontend
- `templates/email/`: payment email
- `migrations/`: database migration

## Config

The default config lives in `config/lanparty.default.json`.

- On first start it is copied to `config/lanparty.json`
- Missing keys are merged in from the default file
- The config contains event data, bank details, rules, terms, fields, and prices

### Important Config Fields

- `EventName`, `EventStartDate`, `EventEndDate`
- `ZVR`, `Veranstalter`, `Street`, `PLZORT`, `Country`
- `KontoInhaber`, `KontoIban`, `KontoBank`, `Verwendungszweck`
- `rules`, `agb`
- `fields`: custom registration fields
- `FixKostenProTag`, `PauschalkostenProTag`: daily price blocks

### Note

- `fields` control the additional data collected during registration.
- Price lists can also be saved through the admin endpoint.
- For initial setup, usually only `lanparty.default.json` needs to be adjusted.
