'use strict';
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, './.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('Error: MONGODB_URI not found in environment variables.');
    process.exit(1);
}

const UserSchema = new mongoose.Schema({
    role: {
        type: String,
        default: 'member'
    }
}, { strict: false });

const User = mongoose.model('User', UserSchema);

async function run() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(MONGODB_URI);
        console.log('Connected! Updating user roles to admin...');

        const result = await User.updateMany({}, { $set: { role: 'admin' } });
        console.log(`Success! Updated ${result.modifiedCount} user(s) to 'admin'.`);

        mongoose.connection.close();
    } catch (err) {
        console.error('Error during database update:', err);
    }
}

run();
