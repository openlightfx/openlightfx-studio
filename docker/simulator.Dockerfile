FROM python:3.12-slim

# Headless mode does not import PyQt. aiohttp is the only runtime dependency.
RUN pip install --no-cache-dir 'aiohttp>=3.9'

WORKDIR /app
COPY docker/simulator-src/src /app/src
ENV PYTHONPATH=/app/src

ENTRYPOINT ["python", "-m", "openlightfx_simulator", "--no-gui", "--config", "/config/simulator.toml"]
