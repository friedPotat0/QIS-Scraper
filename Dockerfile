FROM node:9-alpine

RUN apk update && apk upgrade && \
    echo @edge http://nl.alpinelinux.org/alpine/edge/community >> /etc/apk/repositories && \
    echo @edge http://nl.alpinelinux.org/alpine/edge/main >> /etc/apk/repositories && \
    apk add --no-cache \
      chromium@edge \
      nss@edge \
      freetype@edge \
      harfbuzz@edge

ADD https://github.com/Yelp/dumb-init/releases/download/v1.2.0/dumb-init_1.2.0_amd64 /usr/local/bin/dumb-init
RUN chmod +x /usr/local/bin/dumb-init

ENV NODE_PATH="/usr/local/share/.config/yarn/global/node_modules:${NODE_PATH}"
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true

RUN yarn global add puppeteer@1.4.0

ENV NODE_ENV=production

WORKDIR /usr/src/app

COPY ["package.json", "package-lock.json*", "npm-shrinkwrap.json*", "./"]
RUN yarn install --production --silent
COPY . .

USER node
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]
