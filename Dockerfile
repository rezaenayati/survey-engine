# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# HUSKY=0 makes the package.json `prepare` script (which runs `husky`) a no-op,
# since husky is a devDependency that may not be installed in CI/Docker layers.
ENV HUSKY=0

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

ENV HUSKY=0

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/main.js"]
