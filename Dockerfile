FROM docker.m.daocloud.io/library/node:18-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM docker.m.daocloud.io/library/nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html/admin
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
ENV API_BACKEND=tsdd:8090
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
