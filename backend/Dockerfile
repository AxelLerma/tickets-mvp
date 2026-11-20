FROM node:26-alpine

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm install

COPY . .

RUN chown -R node:node /app

USER node

EXPOSE 4000

CMD ["npm", "run", "start"]