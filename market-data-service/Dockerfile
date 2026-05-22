FROM node:20-alpine
WORKDIR /app
COPY market-data-service/package*.json ./
RUN npm install
COPY market-data-service/ .
RUN npm run build
EXPOSE 3001
CMD ["npm", "start"]
