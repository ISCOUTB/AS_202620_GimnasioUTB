FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --chown=node:node package.json package-lock.json ./

RUN chown -R node:node /app

USER node
RUN npm ci --omit=dev

COPY --chown=node:node src/ ./src/
COPY --chown=node:node scripts/ ./scripts/

EXPOSE 3000

CMD ["npm", "start"]