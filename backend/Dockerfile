# ---- Base Python image ----
FROM python:3.12-slim

# ---- Set work directory ----
WORKDIR /app

# ---- Copy dependencies ----
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# ---- Copy app source ----
COPY . .

# ---- Ensure .env is available ----
ENV PYTHONUNBUFFERED=1

# ---- Start server ----
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5747"]