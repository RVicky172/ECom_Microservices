FROM node:26-alpine

WORKDIR /app

COPY package.json ./
COPY tsconfig.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/auth-service/package.json ./packages/auth-service/
COPY packages/auth-service/tsconfig.json ./packages/auth-service/

RUN npm install --workspace=packages/auth-service --workspace=packages/shared

COPY packages/shared/ ./packages/shared/
COPY packages/auth-service/ ./packages/auth-service/

RUN npm run build --workspace=packages/shared && npm run build --workspace=packages/auth-service

EXPOSE 4001
USER node
CMD ["node", "packages/auth-service/dist/index.js"]
