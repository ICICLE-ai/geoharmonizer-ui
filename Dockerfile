FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Vite inlines VITE_* values at build time, so these must be supplied
# with --build-arg. Setting them on the running container has no effect.
ARG VITE_USE_MOCK_SERVICES
ARG VITE_CHAT_API_URL
ARG VITE_AVAILABILITY_API_URL
ARG VITE_TAPIS_API_URL
ARG VITE_TAPIS_TOKEN_COOKIE
ARG VITE_SLURM_ACCOUNT

RUN npm run build


FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html

# Tapis Pods route to port 5000. The stock nginx config listens on 80,
# which is what an ingress cannot reach — hence 502. The template is
# rendered at start-up by the nginx image's envsubst hook.
ENV PORT=5000

COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template

RUN rm -f /etc/nginx/conf.d/default.conf

EXPOSE 5000

CMD ["nginx", "-g", "daemon off;"]
