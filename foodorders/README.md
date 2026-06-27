# FoodOrders

Food ordering feature for shared group orders.

## Overview

- Admins can manage vendors, categories, items, and orders.
- Users can view open orders and add or remove their own items.
- Completed items are booked when the order item is finalized.

## Important Paths

- `feature.json`: manifest and route metadata
- `api/foodorders.js`: REST endpoints
- `lib/sqlite/foodorders.js`: database logic
- `views/`: admin and user interfaces
- `templates/email/`: notification emails
- `migrations/`: database migrations
- `seeds/foodorders.sql`: initial seed data

## Notes

- The feature uses notifications for new orders and arrived orders.
- Prices and status transitions are validated in the SQLite layer.
- Menu import is handled through the admin API and uses parsers defined in `api/foodorders.js`.
