FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
# The image renders /etc/nginx/templates/*.template through envsubst on start.
COPY nginx.default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

ENV APP_HOST=localhost
ENV BACKEND=backend:8787
ENV NGINX_ENVSUBST_TEMPLATE_SUFFIX=.template

EXPOSE 80
