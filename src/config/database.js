// Import the mongoose library package
const mongoose = require('mongoose');


// here async because it can wait for the slow operation like connection of the databse
const connectDb = async () => {
    try {
        // process.env.MONGODB_URI gets the mongodb connection string from your .env files
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDb connected successfully');
    } catch (error) {
        console.error('MongoDb Connection error', error.message);
        process.exit(1);
    }
};

// make this function available to other files
module.exports = connectDb;
