require('dotenv').config();

// MONGODB_URI=mongodb://aimhabiganj:r9eTrIxDeV8lsUKI@ac-famfzlt-shard-00-00.w9cbrwo.mongodb.net:27017,ac-famfzlt-shard-00-01.w9cbrwo.mongodb.net:27017,ac-famfzlt-shard-00-02.w9cbrwo.mongodb.net:27017/aimhabiganj?ssl=true&replicaSet=atlas-131uq2-shard-0&authSource=admin&appName=Cluster0

const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const { ObjectId } = require('mongodb');


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
        const countersCollection = database.collection("counters");
        const galleryCollection = database.collection("gallery");
        const settingsCollection = database.collection("settings");
        const fundsCollection = database.collection("finance_funds");
        const feeStructuresCollection = database.collection("fee_structures");
        const receiptsCollection = database.collection("finance_receipts");

        // ==========================================
        // ১. নতুন ফান্ড বা আর্থিক অ্যাকাউন্ট তৈরি (POST API)
        // ==========================================
        app.post('/api/finance/funds', async (req, res) => {
            try {
                const { name, code, description, initBalance } = req.body;

                if (!name || !code) {
                    return res.status(400).json({ success: false, message: "ফান্ডের নাম এবং কোড দেওয়া আবশ্যক।" });
                }

                // ডুপ্লিকেট ফান্ড কোড চেক
                const existingFund = await fundsCollection.findOne({ code: code.toUpperCase() });
                if (existingFund) {
                    return res.status(400).json({ success: false, message: "এই কোড দিয়ে অলরেডি ফান্ড তৈরি করা আছে।" });
                }

                const newFund = {
                    name,                               // যেমন: জেনারেল ব্যাংক হিসাব-১৫
                    code: code.toUpperCase(),           // যেমন: GENERAL_BANK
                    description: description || "",     // খাতের অতিরিক্ত বিবরণ
                    currentBalance: parseFloat(initBalance) || 0, // শুরুর ব্যাংকে স্থিতি/নগদ স্থিতি
                    createdAt: new Date()
                };

                const result = await fundsCollection.insertOne(newFund);
                res.status(201).json({
                    success: true,
                    message: "নতুন আর্থিক খাত/তহবিল সফলভাবে সংরক্ষিত হয়েছে!",
                    insertedId: result.insertedId
                });
            } catch (error) {
                console.error("ফান্ড সেভ করতে সমস্যা হয়েছে:", error);
                res.status(500).json({ success: false, message: "সার্ভারে সমস্যা হয়েছে, আবার চেষ্টা করুন।" });
            }
        });

        // ==========================================
        // ২. ক্লাসভিত্তিক ফি স্ট্রাকচার কনফিগার (POST API - Upsert)
        // ==========================================
        app.post('/api/finance/fee-setup', async (req, res) => {
            try {
                const { className, feeType, amount, fundCode } = req.body;

                if (!className || !feeType || !amount || !fundCode) {
                    return res.status(400).json({ success: false, message: "সবগুলো ফিল্ড পূরণ করা বাধ্যতামূলক।" });
                }

                const feeData = {
                    className: className.toLowerCase(), // যেমন: play, nursery, hifz
                    feeType: feeType.toLowerCase(),     // যেমন: admission_fee, tuition_fee, exam_fee
                    amount: parseFloat(amount),         // টাকার পরিমাণ
                    fundCode: fundCode.toUpperCase(),   // এই আয়ের টাকা কোন ফান্ডে ঢুকবে
                    updatedAt: new Date()
                };

                // একই ক্লাসের একই ফি আগে থাকলে আপডেট হবে, না থাকলে নতুন তৈরি হবে (Upsert)
                const result = await feeStructuresCollection.updateOne(
                    { className: feeData.className, feeType: feeData.feeType },
                    { $set: feeData },
                    { upsert: true }
                );

                res.status(200).json({
                    success: true,
                    message: "ফি স্ট্রাকচার সফলভাবে সেটআপ/আপডেট হয়েছে!"
                });
            } catch (error) {
                console.error("ফি সেটআপ করতে সমস্যা হয়েছে:", error);
                res.status(500).json({ success: false, message: "সার্ভারে সমস্যা হয়েছে, আবার চেষ্টা করুন।" });
            }
        });

        // ==========================================
        // ৩. সকল ফান্ড এবং ফি সেটিংস ডাটা একসাথে পাওয়ার GET API
        // ==========================================
        app.get('/api/finance/settings', async (req, res) => {
            try {
                const funds = await fundsCollection.find({}).toArray();
                const feeStructures = await feeStructuresCollection.find({}).toArray();

                res.status(200).json({
                    success: true,
                    funds,
                    feeStructures
                });
            } catch (error) {
                console.error("ডাটা রিড করতে সমস্যা হয়েছে:", error);
                res.status(500).json({ success: false, message: "সার্ভার থেকে ডাটা আনা যায়নি।" });
            }
        });

        // ==========================================
        // 🧾 ফি কালেকশনের জন্য নতুন কালেকশন
        // ==========================================


        // ==========================================
        // ১. স্টুডেন্ট আইডি দিয়ে তার ফি'র তথ্য খোঁজা (GET API)
        // ==========================================
        app.get('/api/finance/student-fees/:studentId', async (req, res) => {
            try {
                const { studentId } = req.params;

                // ১. শিক্ষার্থীর তথ্য খোঁজা (আপনার admissions কালেকশন থেকে)
                const student = await admissionCollection.findOne({
                    $or: [{ _id: new ObjectId(studentId) }, { studentId: studentId }]
                });

                if (!student) {
                    return res.status(404).json({ success: false, message: "এই আইডি দিয়ে কোনো শিক্ষার্থী পাওয়া যায়নি।" });
                }

                // ২. শিক্ষার্থীর ক্লাসের উপর ভিত্তি করে সব ফি স্ট্রাকচার খুঁজে বের করা
                const studentClass = student.class || student.className; // আপনার ভর্তির ফর্মে যেভাবে সেভ করা আছে
                const fees = await feeStructuresCollection.find({ className: studentClass.toLowerCase() }).toArray();

                res.status(200).json({
                    success: true,
                    student: {
                        id: student._id,
                        name: student.name || student.studentName,
                        class: studentClass,
                        roll: student.roll || "N/A"
                    },
                    fees
                });
            } catch (error) {
                console.error("শিক্ষার্থীর ফি খুঁজতে সমস্যা হয়েছে:", error);
                res.status(500).json({ success: false, message: "সার্ভারে সমস্যা হয়েছে।" });
            }
        });

        // ==========================================
        // ২. ফি গ্রহণ এবং রসিদ জেনারেট করা (POST API)
        // ==========================================
        app.post('/api/finance/collect-fee', async (req, res) => {
            try {
                const { studentId, studentName, className, feeType, amount, fundCode, paymentMethod } = req.body;

                if (!studentId || !feeType || !amount || !fundCode) {
                    return res.status(400).json({ success: false, message: "প্রয়োজনীয় সকল তথ্য দেওয়া হয়নি।" });
                }

                const parsedAmount = parseFloat(amount);

                // ১. একটি ইউনিক রসিদ নম্বর তৈরি (যেমন: R-171856983)
                const receiptNo = "R-" + Date.now().toString().slice(-9);

                const newReceipt = {
                    receiptNo,
                    studentId,
                    studentName,
                    className,
                    feeType,
                    amount: parsedAmount,
                    fundCode,
                    paymentMethod: paymentMethod || "Cash",
                    collectedAt: new Date()
                };

                // ২. রসিদ সেভ করা
                const receiptResult = await receiptsCollection.insertOne(newReceipt);

                // ৩. সংশ্লিষ্ট ফান্ডের ব্যালেন্স (currentBalance) বাড়িয়ে দেওয়া (ACID Transaction এর বিকল্প হিসেবে নিরাপদ আপডেট)
                await fundsCollection.updateOne(
                    { code: fundCode.toUpperCase() },
                    { $inc: { currentBalance: parsedAmount } }
                );

                res.status(201).json({
                    success: true,
                    message: "ফি সফলভাবে গ্রহণ করা হয়েছে এবং ফান্ড আপডেট হয়েছে।",
                    receiptNo,
                    insertedId: receiptResult.insertedId
                });
            } catch (error) {
                console.error("ফি কালেকশনে সমস্যা হয়েছে:", error);
                res.status(500).json({ success: false, message: "সার্ভারে সমস্যা হয়েছে, আবার চেষ্টা করুন।" });
            }
        });

        // ==========================================
        // 📩 ভর্তি ফরম সাবমিট করার POST API
        // ==========================================
        app.post('/api/admissions', async (req, res) => {
            try {
                const newApplication = req.body;

                // মঙ্গোডিবির অ্যাটমিক অপারেশনের মাধ্যমে আইডি ১ বাড়িয়ে নেওয়া হচ্ছে
                // যদি counters কালেকশনে 'studentId' না থাকে, upsert: true সেটা তৈরি করে নেবে
                const counterResult = await countersCollection.findOneAndUpdate(
                    { _id: "studentId" },
                    { $inc: { sequence_value: 1 } },
                    { returnDocument: "after", upsert: true }
                );

                // কারেন্ট সিকোয়েন্স নাম্বার নেওয়া হচ্ছে
                const nextIdNumber = counterResult.sequence_value;

                // আপনার রিকোয়ারমেন্ট: ১ থেকে ৯ পর্যন্ত সংখ্যার আগে '0' বসানো (যেমন: 01, 02...)
                // padStart(2, '0') দিয়ে খুব সহজেই এটি করা যায়। ১০ বা তার বেশি হলে এটি অটোমেটিক ১১, ১২ হয়ে যাবে।
                const formattedStudentId = String(nextIdNumber).padStart(2, '0');

                // স্টুডেন্ট অবজেক্টে আইডি সেট করা হচ্ছে
                newApplication.studentId = formattedStudentId;
                newApplication.status = "Pending";
                newApplication.createdAt = new Date();

                const result = await admissionCollection.insertOne(newApplication);

                res.status(201).json({
                    success: true,
                    message: "ভর্তি ফরমটি সফলভাবে ডাটাবেজে সংরক্ষিত হয়েছে!",
                    studentId: formattedStudentId, // রেসপন্সে আইডিটি ফেরত পাঠানো হচ্ছে যাতে নেক্সট জেএস-এ দেখানো যায়
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
