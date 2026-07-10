const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8000;
const uri = process.env.MONGODB_URI;

// Middleware Configurations
app.use(cors());
app.use(express.json());

// MongoDB Client Setup
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // ডাটাবেজ এবং কালেকশন নাম (মাদরাসা ডাটাবেজ)
    const database = client.db("aimhabiganj");
    const admissionCollection = database.collection("admissions");

    // 📩 ভর্তি ফরম সাবমিট করার POST API
    app.post('/api/admissions', async (req, res) => {
        try {
            const newApplication = req.body;
            
            // সিকিউরিটির জন্য ডিফল্ট স্ট্যাটাস এবং সাবমিট টাইম ব্যাকএন্ড থেকে সেট করা
            newApplication.status = "Pending"; 
            newApplication.createdAt = new Date();

            const result = await admissionCollection.insertOne(newApplication);
            
            res.status(201).json({
                success: true,
                message: "ভর্তি ফরমটি সফলভাবে ডাটাবেজে সংরক্ষিত হয়েছে!",
                insertedId: result.insertedId
            });
        } catch (error) {
            console.error("ডাটা সেভ করতে সমস্যা হয়েছে:", error);
            res.status(500).json({ success: false, message: "সার্ভারে কোনো সমস্যা হয়েছে, আবার চেষ্টা করুন।" });
        }
    });

    // টেস্ট রুট
    app.get('/', (req, res) => {
        res.send('As-Salam Madrasah Server is Running!');
    });

    console.log("MongoDB-র সাথে সফলভাবে কানেক্টেড হয়েছে! 🚀");
  } catch (error) {
    console.error("MongoDB কানেকশন ত্রুটি:", error);
  }
}
run().catch(console.dir);

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});
