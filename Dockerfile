# Node API image for free hosts that run containers (Render, Koyeb, Fly.io, Railway).
# The database lives in Turso (remote libSQL), so no persistent disk is needed.
FROM node:20-slim

WORKDIR /app/server

# Install dependencies first so Docker caches this layer.
COPY server/package.json ./package.json
RUN npm install

# Copy the server source (includes src/db/schema.sql used at runtime) and build.
COPY server ./
RUN npm run build

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
