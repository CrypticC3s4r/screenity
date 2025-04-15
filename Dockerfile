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

# Build the extension for production
RUN npm run build

# Command for development mode
CMD ["npm", "run", "dev"]
