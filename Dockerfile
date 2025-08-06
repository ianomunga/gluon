# -------- Stage 1: Build Dependencies --------
FROM node:22-slim as build

# Working directory
WORKDIR /app

# Copying only package.json and lock first (to leverage cache)
COPY package*.json ./

# Install only production dependencies
RUN npm install --production

# Copy rest of the app
COPY . .

# -------- Stage 2: Production Image --------
FROM node:22-slim

WORKDIR /app

# Copying only built artifacts and node_modules
COPY --from=build /app /app

# Expose app port (if applicable)
EXPOSE 3000

# Run app
CMD ["npm", "start"]
