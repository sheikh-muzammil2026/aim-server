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
    const settingsCollection = database.collection("settings");

    // ==========================================
    // 📩 ভর্তি ফরম সাবমিট করার POST API
    // ==========================================
    app.post('/api/admissions', async (req, res) => {
        try {
            const newApplication = req.body;
            newApplication.status = "Pending"; 
            newApplication.createdAt = new Date();

            const result = await admissionCollection.insertOne(newApplication);
            
            res.status(201).json({
                success: true,
                message: "ভর্তি ফরমটি সফলভাবে ডাটাবেজে সংরক্ষিত হয়েছে!",
                insertedId: result.insertedId
            });
        } catch (error) {
            console.error("ডাটা সেভ করতে সমস্যা হয়েছে:", error);
            res.status(500).json({ success: false, message: "সার্ভারে কোনো সমস্যা হয়েছে, আবার চেষ্টা করুন।" });
        }
    });

    // ==========================================
    // ১. সমস্ত ভর্তি আবেদনপত্র ডাটাবেজ থেকে নিয়ে আসার GET API
    // ==========================================
    app.get('/api/admissions', async (req, res) => {
        try {
            const applications = await admissionCollection.find({}).sort({ createdAt: -1 }).toArray();
            res.json({ success: true, data: applications });
        } catch (error) {
            res.status(500).json({ success: false, message: "আবেদনপত্র নিয়ে আসতে সমস্যা হয়েছে।" });
        }
    });

    // ==========================================
    // ২. আবেদনের স্ট্যাটাস (Approved / Rejected) পরিবর্তন করার PATCH API
    // ==========================================
    app.patch('/api/admissions/:id', async (req, res) => {
        try {
            const id = req.params.id;
            const { status } = req.body; 
            const filter = { _id: new ObjectId(id) };
            const updateDoc = { $set: { status: status } };

            const result = await admissionCollection.updateOne(filter, updateDoc);
            if (result.modifiedCount === 1) {
                res.json({ success: true, message: `আবেদনটি সফলভাবে ${status === 'Approved' ? 'অনুমোদন' : 'বাতিল'} করা হয়েছে।` });
            } else {
                res.status(404).json({ success: false, message: "আবেদনটি পাওয়া যায়নি।" });
            }
        } catch (error) {
            res.status(500).json({ success: false, message: "সার্ভারে সমস্যা হয়েছে।" });
        }
    });

    // ==========================================
    // 🗑️ নতুন সংযোজন: ভর্তি আবেদন চিরতরে মুছে ফেলার DELETE API
    // ==========================================
    app.delete('/api/admissions/:id', async (req, res) => {
        try {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            
            const result = await admissionCollection.deleteOne(query);
            
            if (result.deletedCount === 1) {
                res.json({ success: true, message: "ভর্তি আবেদনটি সফলভাবে মুছে ফেলা হয়েছে।" });
            } else {
                res.status(404).json({ success: false, message: "আবেদনটি খুঁজে পাওয়া যায়নি।" });
            }
        } catch (error) {
            console.error("আবেদন মুছতে সমস্যা হয়েছে:", error);
            res.status(500).json({ success: false, message: "সার্ভারে সমস্যা হয়েছে, আবার চেষ্টা করুন।" });
        }
    });

    // ==========================================
    // ১. নির্দিষ্ট আইডির শিক্ষার্থীর তথ্য খোঁজার GET API
    // ==========================================
    app.get('/api/admissions/edit/:id', async (req, res) => {
        try {
            const id = req.params.id;
            
            // ObjectId ভ্যালিড কিনা তা চেক করার জন্য
            if (!ObjectId.isValid(id)) {
                return res.status(400).json({ success: false, message: "অকার্যকর আইডি ফর্ম্যাট।" });
            }

            const query = { _id: new ObjectId(id) };
            const student = await admissionCollection.findOne(query);

            if (student) {
                res.json({ success: true, data: student });
            } else {
                res.status(404).json({ success: false, message: "শিক্ষার্থীর কোনো তথ্য পাওয়া যায়নি।" });
            }
        } catch (error) {
            console.error("GET Error:", error);
            res.status(500).json({ success: false, message: "সার্ভারে সমস্যা হয়েছে।" });
        }
    });

    // ==========================================
    // ২. শিক্ষার্থীর সম্পূর্ণ তথ্য পরিবর্তন/আপডেট করার PUT API
    // ==========================================
    app.put('/api/admissions/edit/:id', async (req, res) => {
        try {
            const id = req.params.id;

            if (!ObjectId.isValid(id)) {
                return res.status(400).json({ success: false, message: "অকার্যকর আইডি ফর্ম্যাট।" });
            }

            const filter = { _id: new ObjectId(id) };
            
            // ক্লায়েন্ট থেকে পাঠানো বডি থেকে মঙ্গোডিবির নিজস্ব সিস্টেম জেনারেটেড ফিল্ডগুলো আলাদা করে নেওয়া হচ্ছে
            // যাতে ডাটাবেজে কোনো প্রকার কনফ্লিক্ট বা এরর না আসে।
            const { _id, createdAt, updatedAt, ...updateData } = req.body;

            const updateDoc = {
                $set: updateData
            };

            const result = await admissionCollection.updateOne(filter, updateDoc);

            // matchedCount > 0 হলে বুঝতে হবে ডাটা পাওয়া গেছে (ডাটা মডিফাই হোক বা আগের মতই থাকুক)
            if (result.matchedCount > 0) {
                res.json({ success: true, message: "শিক্ষার্থীর প্রোফাইল সফলভাবে আপডেট করা হয়েছে।" });
            } else {
                res.status(404).json({ success: false, message: "শিক্ষার্থীর তথ্য পাওয়া যায়নি।" });
            }
        } catch (error) {
            console.error("PUT Error:", error);
            res.status(500).json({ success: false, message: "সার্ভারে সমস্যা হয়েছে।" });
        }
    });

    // ==========================================
    // ৩. পাবলিক ভর্তি নির্দেশিকা গাইডলাইন ডাটা সেভ করার PUT API
    // ==========================================
    app.put('/api/admission-settings', async (req, res) => {
        try {
            const { _id, type, ...settingsData } = req.body; 
            
            const result = await settingsCollection.updateOne(
                { type: "admission_guideline" },
                { 
                    $set: { 
                        type: "admission_guideline", 
                        ...settingsData, 
                        updatedAt: new Date() 
                    } 
                },
                { upsert: true }
            );

            res.json({ success: true, message: "ভর্তি নির্দেশিকা সফলভাবে আপডেট হয়েছে!" });
        } catch (error) {
            console.error("সেটিংস আপডেট করার ত্রুটি:", error);
            res.status(500).json({ success: false, message: "সেটিংস আপডেট করা যায়নি।" });
        }
    });

    // ==========================================
    // ৪. পাবলিক পেজে দেখানোর জন্য গাইডলাইন ডাটা নিয়ে আসার GET API
    // ==========================================
    app.get('/api/admission-settings', async (req, res) => {
        try {
            const settings = await settingsCollection.findOne({ type: "admission_guideline" });
            res.json({ success: true, data: settings || {} });
        } catch (error) {
            res.status(500).json({ success: false, message: "ডাটা লোড করা সম্ভব হয়নি।" });
        }
    });

    // ==========================================
    // ১. নতুন গ্যালারি আইটেম (ফটো বা ভিডিও) যোগ করার POST API
    // ==========================================
    app.post('/api/gallery', async (req, res) => {
        try {
            const newItem = req.body; 
            newItem.createdAt = new Date();

            const result = await galleryCollection.insertOne(newItem);
            res.status(201).json({ success: true, message: "আইটেমটি গ্যালারিতে সফলভাবে যোগ করা হয়েছে!", insertedId: result.insertedId });
        } catch (error) {
            res.status(500).json({ success: false, message: "সার্ভারে সমস্যা হয়েছে।" });
        }
    });

    // ==========================================
    // ২. পাবলিক পেজের জন্য সব গ্যালারি ডাটা নিয়ে আসার GET API
    // ==========================================
    app.get('/api/gallery', async (req, res) => {
        try {
            const items = await galleryCollection.find({}).sort({ createdAt: -1 }).toArray();
            
            const photos = items.filter(item => item.type === 'photo');
            const videos = items.filter(item => item.type === 'video');

            res.json({ success: true, photos, videos });
        } catch (error) {
            res.status(500).json({ success: false, message: "ডাটা আনা সম্ভব হয়নি।" });
        }
    });

    // ==========================================
    // 🗑️ গ্যালারির আইটেম মুছে ফেলার DELETE API
    // ==========================================
    app.delete('/api/gallery/:id', async (req, res) => {
        try {
            const id = req.params.id;
            const result = await galleryCollection.deleteOne({ _id: new ObjectId(id) });
            
            if (result.deletedCount === 1) {
                res.json({ success: true, message: "মিডিয়াটি সফলভাবে মুছে ফেলা হয়েছে।" });
            } else {
                res.status(404).json({ success: false, message: "আইটেমটি খুঁজে পাওয়া যায়নি।" });
            }
        } catch (error) {
            res.status(500).json({ success: false, message: "সার্ভারে সমস্যা হয়েছে।" });
        }
    });

    // টেস্ট রুট
    app.get('/', (req, res) => {
        res.send('As-Salam Madrasah Server is Running!');
    });

    console.log("MongoDB-র সাথে সফলভাবে কানেক্টেড হয়েছে! 🚀");
  } catch (error) {
    console.error("MongoDB কানেকশন ত্রুটি:", error);
  }
}
run().catch(console.dir);

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});
