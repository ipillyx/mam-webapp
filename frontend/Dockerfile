# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app

# Copy only the files needed for dependency installation
COPY package*.json vite.config.mjs tailwind.config.cjs postcss.config.cjs ./

# Install dependencies
RUN npm install

# Copy the rest of the app
COPY index.html ./
COPY src ./src

# Accept build-time variable (from docker-compose args)
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Build the app (Vite embeds env vars prefixed with VITE_)
RUN echo "🔧 Building frontend with API URL: $VITE_API_URL" && npm run build

# ---- Serve stage ----
FROM nginx:alpine
WORKDIR /usr/share/nginx/html

# Copy built static files from previous stage
COPY --from=build /app/dist ./

# Custom minimal nginx config
RUN printf 'server {\n\
    listen 5050;\n\
    server_name _;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    location / {\n\
        try_files $uri /index.html;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 5050
CMD ["nginx", "-g", "daemon off;"]