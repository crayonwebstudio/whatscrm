FROM node:22-bookworm-slim
WORKDIR /app
# Debian (glibc) base is required: @roamhq/wrtc ships prebuilt binaries for glibc,
# not for Alpine musl, so on Alpine the app crashes at startup with
# "Could not find wrtc binary". System deps for sharp, ffmpeg, bcrypt, wrtc.
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 make g++ ffmpeg \
  libnss3 libnspr4 libx11-6 libxext6 libxcomposite1 libxdamage1 libxfixes3 \
  libxrandr2 libgbm1 libasound2 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libdrm2 libxkbcommon0 libpango-1.0-0 libcairo2 libatspi2.0-0 \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY . .
# No .env is copied. Coolify Cloud supplies all env vars at runtime.
# See .env.example for the list.
EXPOSE 3010
CMD ["node", "server.js"]
