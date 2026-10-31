FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Placeholders satisfy module loading only; real secrets are supplied at runtime.
RUN npx prisma generate && BETTER_AUTH_SECRET=build-only DATABASE_URL=postgresql://build/build APP_DATABASE_URL=postgresql://build/build npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
USER node
COPY --from=build --chown=node:node /app ./
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
