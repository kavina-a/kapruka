# ChatRuka Pipecat voice server — Railway / Docker
FROM python:3.11-slim-bookworm

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY pyproject.toml uv.lock ./
# Pipecat [webrtc] pulls opencv-python (needs libxcb). Swap to headless for audio-only voice.
RUN uv sync --frozen --no-dev \
    && uv pip uninstall opencv-python \
    && uv pip install "opencv-python-headless>=5.0.0.93"

COPY . .

ENV PIPECAT_HOST=0.0.0.0

EXPOSE 8080

CMD ["uv", "run", "bot.py"]
