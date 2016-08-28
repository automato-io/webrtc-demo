FROM node:6

WORKDIR /application

ADD public /application/public
ADD server.js /application/server.js

ADD node_modules /application/node_modules
ADD devkeys /application/devkeys

EXPOSE 8080

CMD ["node", "server.js"]