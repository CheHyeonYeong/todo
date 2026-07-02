FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY package*.json ./
RUN npm install --omit=dev
COPY client ./client
COPY server ./server
COPY data ./data
COPY supabase ./supabase
EXPOSE 3000
CMD ["node", "server/server.js"]
