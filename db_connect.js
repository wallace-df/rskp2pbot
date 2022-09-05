
const mongoose = require('mongoose');

// connect to database
const credentials = process.env.DB_USER
  ? `${process.env.DB_USER}:${process.env.DB_PASS}@`
  : '';
//const MONGO_URI = `mongodb://${credentials}${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}?authSource=admin`;

const MONGO_URI = `mongodb://${credentials}${process.env.DB_HOST}/${process.env.DB_NAME}?ssl=true&replicaSet=atlas-vv9t4r-shard-0&authSource=admin&retryWrites=true&w=majority`;

if (!MONGO_URI) {
  throw new Error('You must provide a MongoDB URI');
}

const connect = () => {
  mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  return mongoose;
};

module.exports = connect;





