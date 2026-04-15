# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app

# Copy only the files needed for dependency installation
COPY package*.json vite.config.mjs tailwind.config.cjs postcss.config.cjs ./

# Install dependencies
RUN npm install

# Copy the rest of the app, including the public folder
COPY index.html ./
COPY src ./src
COPY public ./public

# Accept build-time variable (from docker-compose args)
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Build the app (Vite embeds env vars prefixed with VITE_)
RUN echo "🔧 Building frontend with API URL: $VITE_API_URL" && npm run build

# ---- Serve stage ----
FROM nginx:alpine
WORKDIR /usr/share/nginx/html

# Copy built static files from previous stage (the main app files)
COPY --from=build /app/dist ./

# CRITICAL FIX: Explicitly copy the public directory contents from the build stage 
# to the Nginx root. This ensures dark_romance_banner.png is available at /
COPY --from=build /app/public ./

# Custom minimal nginx config - FIXED WHITESPACE ISSUE
# Uses \n and \t for explicit newlines and tabs to prevent hidden characters from crashing Nginx.
RUN printf 'server {\n\tlisten 5050;\n\tserver_name _;\n\troot /usr/share/nginx/html;\n\tindex index.html;\n\tlocation / {\n\t\ttry_files $uri /index.html;\n\t}\n}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 5050
CMD ["nginx", "-g", "daemon off;"]