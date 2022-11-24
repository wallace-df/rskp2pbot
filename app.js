require('dotenv').config();
const { SocksProxyAgent } = require('socks-proxy-agent');
const { start } = require('./bot');
const mongoConnect = require('./db_connect');
const logger = require('./logger');

(async () => {
  process.on('unhandledRejection', e => {
    logger.error(`Unhandled Rejection: ${e.message}`);
    console.log(e);
  });

  process.on('uncaughtException', e => {
    logger.error(`Uncaught Exception: ${e.message}`);
    console.log(e);
  });

  const mongoose = mongoConnect();
  mongoose.connection
    .once('open', async () => {
      logger.info('Connected to Mongo instance.');
      let options = { handlerTimeout: 60000 };
      if (process.env.SOCKS_PROXY_HOST) {
        const agent = new SocksProxyAgent(process.env.SOCKS_PROXY_HOST);
        options = {
          telegram: {
            agent,
          },
        };
      }

      start(process.env.BOT_TOKEN, options);
    })
    .on('error', error => logger.error(`Error connecting to Mongo: ${error}`));
})();
