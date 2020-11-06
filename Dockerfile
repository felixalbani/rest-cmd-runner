FROM node:14

# Create app directory
WORKDIR /usr/src/app
RUN mkdir uploads
# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN yarn install
# If you are building your code for production
# RUN npm ci --only=production

# Bundle app source
COPY src .

EXPOSE 4041
CMD [ "node", "index.js" ]