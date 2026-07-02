# Moved to `pipecat-server/`

This folder is kept for backwards compatibility. **Use `pipecat-server/` instead.**

```bash
cd ../pipecat-server
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python bot.py
```

Or from the repo root: `npm run pipecat:dev`

See [pipecat-server/README.md](../pipecat-server/README.md) for architecture.
