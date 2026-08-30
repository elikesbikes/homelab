FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_PB_URL
ARG VITE_PROXY_URL
ENV VITE_PB_URL=$VITE_PB_URL
ENV VITE_PROXY_URL=$VITE_PROXY_URL
RUN npm run build

FROM node:20-alpine
RUN npm install -g serve
COPY --from=builder /app/dist /app/dist
COPY serve.json /app/serve.json
EXPOSE 8181
CMD ["serve", "-s", "/app/dist", "-l", "8181", "-c", "/app/serve.json"]
