FROM node:22-alpine
WORKDIR /app
# System deps for sharp, ffmpeg, bcrypt, wrtc
RUN apk add --no-cache python3 make g++ ffmpeg
COPY package.json package-lock.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY . .
# No .env is copied. Coolify Cloud supplies all env vars at runtime.
# See .env.example for the list.
EXPOSE 3010
CMD ["node", "server.js"]
