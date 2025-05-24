FROM node:18-alpine

# Install necessary packages
RUN apk add --no-cache python3 make g++ git

# Create app directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Don't build in Dockerfile for dev - let docker-compose handle it
# The dev container will build on startup with watch mode

# Command for development mode (can be overridden by docker-compose)
CMD ["npm", "run", "dev"]
