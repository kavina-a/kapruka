# ChatRuka Pipecat voice server
# opencv-python-headless (4.x) is used instead of opencv-python, so no X11/libxcb needed.
FROM python:3.11-slim-bookworm

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY . .

ENV PIPECAT_HOST=0.0.0.0

EXPOSE 8080

CMD ["uv", "run", "bot.py"]
