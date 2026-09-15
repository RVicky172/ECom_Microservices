FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY tsconfig.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/notification-service/package.json ./packages/notification-service/
COPY packages/notification-service/tsconfig.json ./packages/notification-service/

RUN npm install --workspace=packages/notification-service --workspace=packages/shared

COPY packages/shared/ ./packages/shared/
COPY packages/notification-service/ ./packages/notification-service/

RUN npm run build --workspace=packages/notification-service

EXPOSE 4007
USER node
CMD ["node", "packages/notification-service/dist/index.js"]
