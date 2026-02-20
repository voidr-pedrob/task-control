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

A minimal Node.js server (`serve.cjs`) serves the UI and persists your data to a local `context.json` file. The `tasks` script starts the server, opens the browser, and handles cleanup on exit.

```
task-control/
├── tasks          # executable entry point (bash)
├── tasks.html     # UI (HTML + CSS + JS, single file)
├── serve.cjs      # local server for data persistence
└── context.json   # your data (auto-created, git-ignored)
```

## Features

- **Clients & tasks** — group tasks by client, add/remove/edit inline
- **Statuses** — PENDING, DOING, BLOCKED, WATCHING, DONE (click badge to change)
- **Filters** — filter tasks by status
- **Daily Report** — auto-generated report ready to copy and share
- **Dates** — automatic creation and completion date tracking
- **Persistence** — data saved to `context.json` next to the app; falls back to `localStorage` if opened directly via `file://`

## Usage

| Action | How |
|---|---|
| Start | `./tasks` |
| Stop | `Ctrl+C` in terminal |
| Custom port | `PORT=4000 ./tasks` |
| Open without script | `node serve.cjs` then open `http://localhost:3777` |

## Data

Your tasks are stored in `context.json` (auto-created on first save, git-ignored). To reset, just delete it. To migrate between machines, copy the file.

## License

MIT
