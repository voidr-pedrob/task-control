# Task Control

Lightweight personal task manager that runs locally in your browser. No accounts, no cloud — your data stays on your machine.

## Quick Start

```bash
git clone <repo-url>
cd task-control
./tasks
```

That's it. The browser opens automatically at `http://localhost:3777`.

## Requirements

- **Node.js** (any recent version)
- A modern browser

## How It Works

A minimal Node.js server (`server.cjs`) serves the static files from `app/` and persists your data to a local `context.json` file. The `tasks` script starts the server, opens the browser, and handles cleanup on exit.

```
task-control/
├── app/
│   ├── index.html   # page structure
│   ├── style.css    # styles
│   └── app.js       # application logic
├── server.cjs       # local server for data persistence
├── tasks            # executable entry point (bash)
└── context.json     # your data (auto-created, git-ignored)
```

## Features

- **Clients & tasks** — group tasks by client, add/remove/edit inline
- **Statuses** — PENDING, DOING, BLOCKED, WATCHING, DONE (click badge to change)
- **Priority** — configurable priority levels (P0–P4 by default), shown as badges next to task titles
- **Weight** — configurable difficulty/complexity levels (Trivial–Complex by default)
- **Sorting** — sort tasks by default order, priority, weight, or status
- **Filters** — filter tasks by status
- **Daily Report** — auto-generated report with priority and weight info, ready to copy and share
- **Settings** — customize priority and weight levels (rename, add, remove) via the Settings panel
- **Dates** — automatic creation and completion date tracking
- **Persistence** — data saved to `context.json` next to the app; falls back to `localStorage` if opened directly via `file://`

## Usage

| Action | How |
|---|---|
| Start | `./tasks` |
| Stop | `Ctrl+C` in terminal |
| Custom port | `PORT=4000 ./tasks` |
| Open without script | `node server.cjs` then open `http://localhost:3777` |

## Data

Your tasks and settings are stored in `context.json` (auto-created on first save, git-ignored). To reset, just delete it. To migrate between machines, copy the file.

## License

MIT
