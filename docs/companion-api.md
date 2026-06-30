# NexusDeck Companion HTTP API

The companion PWA talks to NexusDeck over HTTP on port **8731** (same Wi‑Fi, **Receive** enabled in Settings).

## Versioning

`GET /ping` returns `companion_api` (currently **6**). Older app builds may not expose newer routes; the companion shows an update prompt when endpoints return 404.

## Authentication

1. `GET /ping` — unauthenticated; returns device name, version, games, companion URLs.
2. `POST /pair` — body `{ "code": "123456" }` → `{ "token": "…" }`.
3. All other routes require `Authorization: Bearer <token>`.
4. `GET /heartbeat` — lightweight keepalive (~12s from phone).

## Browse & install (v1+)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/games/list` | Profiles available for remote install |
| GET | `/categories/list?domain=` | Mod categories for filter UI (v4+) |
| GET | `/search/mods?domain=&q=` | Nexus search with optional filters (v4+) |
| GET | `/browse/trending?domain=` | Trending mods |
| GET | `/browse/latest?domain=&offset=` | Recently updated |
| GET | `/browse/discovery?domain=` | Full discovery shelves |
| GET | `/browse/shelf?domain=&sort=&offset=&updated_since_days=` | Paginated shelf browse (v5+) |
| GET | `/mods/detail?domain=&mod_id=` | Mod detail |
| GET | `/mods/files?domain=&mod_id=` | Downloadable files |
| POST | `/install/session/start` | Start remote install session |
| GET | `/install/session/:id` | Poll session (download → prepare → ready) |
| POST | `/install/session/:id/confirm` | Confirm FOMOD/deploy |
| GET | `/install/session/:id/fomod-asset?path=` | FOMOD wizard image bytes (v6+) |

### Search filters (v4+)

`GET /search/mods` accepts:

| Param | Description |
|-------|-------------|
| `domain` | Game domain (required) |
| `q` | Text search (optional) |
| `sort` | `downloads` (default), `endorsements`, `created` |
| `offset`, `count` | Pagination (default count 20) |
| `category` | Category name |
| `tags` | Comma-separated tag names (AND) |
| `min_endorsements` | Minimum endorsement count |
| `hide_adult` | `true` or `1` |
| `updated_since_days` | Only mods updated within N days |
| `author` | Exact author name |

Response shape (v4+):

```json
{ "mods": [ /* ModSummary[] */ ], "total_count": 1234 }
```

## Library (v2+)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/library/mods?domain=` | Installed mods list |
| POST | `/library/mod/toggle` | Body: `{ game_domain, mod_id, enabled }` — syncs plugins.txt |
| POST | `/library/mod/uninstall` | Body: `{ mod_id }` |
| POST | `/library/mod/reorder` | Body: `{ game_domain, mod_id, direction }` — `"up"` or `"down"` |
| POST | `/library/mod/position` | Body: `{ game_domain, mod_id, position }` — 0-based index (v5+) |
| POST | `/library/mod/update` | Body: `{ game_domain, mod_id }` — start mod update download (v5+) |
| POST | `/library/updates/all` | Body: `{ game_domain }` — queue all available updates (v5+) |
| POST | `/library/rescan` | Body: `{ game_domain }` — rescan library from disk (v5+) |

## Load order & LOOT (v3)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/loadorder/state?domain=` | Full load order + LOOT issues |
| POST | `/loadorder/sort` | Body: `{ game_domain }` — LOOT auto-sort + plugins.txt sync |
| POST | `/loadorder/sync-plugins` | Body: `{ game_domain }` — write plugins.txt from DB order |

## Downloads & updates (v3)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/downloads?domain=` | Active/recent downloads for profile |
| POST | `/downloads/cancel` | Body: `{ download_id }` (v5+) |
| POST | `/downloads/retry` | Body: `{ download_id }` (v5+) |
| GET | `/library/updates?domain=` | Mods with newer Nexus file versions |

## Collections (v3)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/collections/list?domain=&offset=` | Nexus collections list |
| GET | `/collections/detail?domain=&slug=` | Collection + install diff summary |
| POST | `/collections/install/start` | Body: `{ game_domain, slug, include_optional?, include_outdated? }` — queue mods |

## Device settings & sync (v3)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/settings/device` | Read-only device snapshot (version, download settings, API key status) |
| POST | `/sync/presets` | Body: `{ game_domain }` — configure BodySlide paths on device |
| POST | `/sync/apply-loadorder` | Body: `{ game_domain }` — LOOT sort + plugins.txt on device |

## Essentials (v2+)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/essentials/manifest?domain=` | Game essentials manifest |
| GET | `/essentials/status?domain=` | Per-mod install status |
| POST | `/essentials/start` | Queue essentials batch |

## Install prepare payload (v3)

When session status is `ready`, `prepare.conflicts` lists potential file overlaps:

```json
{
  "path": "textures/foo.dds",
  "existing_mod": "Other Mod",
  "new_mod": "New Mod"
}
```

## Static PWA

`GET /app/*` serves the bundled companion web assets from the running NexusDeck instance.
