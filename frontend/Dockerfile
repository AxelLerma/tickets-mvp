FROM node:26-alpine

WORKDIR /app

ARG API_URL=http://backend:4000
ENV API_URL=$API_URL

COPY package.json package-lock.json* ./

RUN npm install

COPY . .

RUN npm run build

RUN chown -R node:node /app

USER node

EXPOSE 3000

CMD ["npm", "run", "start"]