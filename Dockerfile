FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_USE_MOCK_SERVICES
ARG VITE_CHAT_API_URL
ARG VITE_AVAILABILITY_API_URL
ARG VITE_TAPIS_API_URL
ARG VITE_TAPIS_TOKEN_COOKIE
ARG VITE_SLURM_ACCOUNT

RUN npm run build


FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]