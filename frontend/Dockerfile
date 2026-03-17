# Použijeme Node.js obraz
FROM node:22-alpine

WORKDIR /app

# Nejdřív zkopírujeme soubory se závislostmi
COPY package*.json ./
RUN npm install

# Pak zkopírujeme zbytek a sestavíme aplikaci
COPY . .
RUN npm run build

# Next.js běží standardně na portu 3000
EXPOSE 3000

CMD ["npm", "start"]