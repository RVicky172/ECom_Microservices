FROM node:26-alpine

WORKDIR /app

COPY package.json ./
COPY packages/frontend/package.json ./packages/frontend/

RUN npm install --workspace=packages/frontend

COPY packages/frontend/ ./packages/frontend/

EXPOSE 3000
CMD ["npm", "run", "dev", "--workspace=packages/frontend", "--", "--host"]
