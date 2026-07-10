const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const { ObjectId } = require('mongodb');
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
    const galleryCollection = database.collection("gallery");


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

    // ১. নতুন গ্যালারি আইটেম (ফটো বা ভিডিও) যোগ করার POST API
    app.post('/api/gallery', async (req, res) => {
        try {
            const newItem = req.body; // { type: 'photo'/'video', title, url, tag, length, platform }
            newItem.createdAt = new Date();

            const result = await galleryCollection.insertOne(newItem);
            res.status(201).json({ success: true, message: "আইটেমটি গ্যালারিতে সফলভাবে যোগ করা হয়েছে!", insertedId: result.insertedId });
        } catch (error) {
            res.status(500).json({ success: false, message: "সার্ভারে সমস্যা হয়েছে।" });
        }
    });

    // ২. পাবলিক পেজের জন্য সব গ্যালারি ডাটা নিয়ে আসার GET API
    app.get('/api/gallery', async (req, res) => {
        try {
            const items = await galleryCollection.find({}).sort({ createdAt: -1 }).toArray();
            
            // পাবলিক পেজের ফরম্যাট অনুযায়ী আলাদা অবজেক্ট তৈরি
            const photos = items.filter(item => item.type === 'photo');
            const videos = items.filter(item => item.type === 'video');

            res.json({ success: true, photos, videos });
        } catch (error) {
            res.status(500).json({ success: false, message: "ডাটা আনা সম্ভব হয়নি।" });
        }
    });

// 🗑️ গ্যালারির আইটেম মুছে ফেলার DELETE API
app.delete('/api/gallery/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const query = { _identity: new ObjectId(id) }; // অথবা _id ব্যবহার করুন আপনার ডাটাবেজ অনুযায়ী
        const result = await galleryCollection.deleteOne({ _id: new ObjectId(id) });
        
        if (result.deletedCount === 1) {
            res.json({ success: true, message: "মিডিয়াটি সফলভাবে মুছে ফেলা হয়েছে।" });
        } else {
            res.status(404).json({ success: false, message: "আইটেমটি খুঁজে পাওয়া যায়নি।" });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "সার্ভারে সমস্যা হয়েছে।" });
    }
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
