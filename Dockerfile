FROM node:22.14.0-alpine
WORKDIR /app
COPY . .
ENV HOST=0.0.0.0 PORT=8790 DEMO_MODE=true
EXPOSE 8790
USER node
CMD ["node", "src/server.js"]
