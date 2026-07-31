require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

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
        // ডাটাবেজ কানেকশন
        await client.connect();
        const database = client.db("aimhabiganj");

        // কালেকশনসমূহ
        const admissionCollection = database.collection("admissions");
        const countersCollection = database.collection("counters");
        const studentsCollection = database.collection("students");
        const deletedIdsCollection = database.collection("deleted_student_ids");
        const galleryCollection = database.collection("gallery");
        const settingsCollection = database.collection("settings");
        const fundsCollection = database.collection("finance_funds");
        const feeStructuresCollection = database.collection("fee_structures");
        const receiptsCollection = database.collection("finance_receipts");
		const marksCollection = database.collection("marks");

// ==========================================
// ৫. মার্কস ও রিজাল্ট সংক্রান্ত APIs
// ==========================================

		/**
 * নির্দিষ্ট ক্লাস এবং স্ট্যাটাস অনুযায়ী শিক্ষার্থীদের তালিকা নিয়ে আসার API
 * Endpoint: GET /api/students?class=প্রথম&status=approved
 */
app.get('/api/students', async (req, res) => {
    try {
        const { class: className, status } = req.query;

        // ১. ডায়নামিক ফিল্টার অবজেক্ট তৈরি
        const filter = {};

        // যদি ক্লাস রেসপন্সে পাঠানো হয়ে থাকে
        if (className) {
            filter.$or = [
                { class: className },
                { "academicInfo.class": className }
            ];
        }

        // যদি স্ট্যাটাস পাঠানো হয়ে থাকে (যেমন: status=approved)
        if (status) {
            filter.status = status;
        }

        // ২. ডাটাবেজ থেকে ডাটা খোঁজা এবং রোল নম্বর অনুযায়ী সর্ট (Sort) করা
        const students = await studentsCollection
            .find(filter)
            .sort({ "officeUse.rollNumber": 1, rollNumber: 1, roll: 1 }) // রোল অনুযায়ী সিরিয়াল করা
            .toArray();

        // ৩. ফ্রন্টএন্ডের সাথে মিলিয়ে সঠিক ফরম্যাটে রেসপন্স পাঠানো
        res.status(200).json({
            success: true,
            count: students.length,
            data: students
        });

    } catch (error) {
        console.error("Fetch Students API Error:", error);
        res.status(500).json({ 
            success: false, 
            message: "শিক্ষার্থীদের তথ্য লোড করতে ব্যর্থ হয়েছে।" 
        });
    }
});

/**
 * ১. টিচার প্যানেল থেকে শিক্ষার্থীদের মার্ক ইনপুট বা আপডেট করার API
 * Endpoint: POST /api/marks/input
 */
app.post('/api/marks/input', async (req, res) => {
    try {
        const { studentId, studentName, class: studentClass, subject, examType, ctMark, examMark, year, teacherId } = req.body;

        if (!studentId || !studentClass || !subject || !examType) {
            return res.status(400).json({ 
                success: false, 
                message: "প্রয়োজনীয় তথ্য (Student ID, Class, Subject, Exam Type) দেওয়া হয়নি।" 
            });
        }

        // শিক্ষাবর্ষ না পাঠালে ডিফল্ট হিসেবে '২০২৬-২০২৭' ব্যবহার করা হচ্ছে
        const academicYear = year || "২০২৬-২০২৭";
        const filter = { studentId: String(studentId), class: studentClass, subject, year: academicYear };

        // ডায়নামিকালি 'term1', 'term2', or 'annual' অবজেক্ট আপডেট
        const updateField = {};
        if (ctMark !== undefined && ctMark !== '') {
            updateField[`${examType}.ct`] = parseFloat(ctMark) || 0;
        }
        if (examMark !== undefined && examMark !== '') {
            updateField[`${examType}.exam`] = parseFloat(examMark) || 0;
        }

        const updateDoc = {
            $set: {
                studentName: studentName || "N/A",
                teacherId: teacherId || "N/A",
                updatedAt: new Date(),
                ...updateField
            },
            $setOnInsert: {
                createdAt: new Date()
            }
        };

        // upsert: true রাখার ফলে আগে থেকে মার্কস থাকলে কেবল আপডেট হবে, না থাকলে নতুন তৈরি হবে
        await marksCollection.updateOne(filter, updateDoc, { upsert: true });

        res.status(200).json({
            success: true,
            message: "মার্কস সফলভাবে সংরক্ষিত/আপডেট করা হয়েছে।"
        });

    } catch (error) {
        console.error("Marks input error:", error);
        res.status(500).json({ success: false, message: "মার্কস সেভ করতে সমস্যা হয়েছে।" });
    }
});


/**
 * ২. নির্দিষ্ট শিক্ষার্থীর একক আইডি দিয়ে রেজাল্ট সার্চ API
 * Endpoint: GET /api/results/student/:studentId
 */
app.get('/api/results/student/:studentId', async (req, res) => {
    try {
        const { studentId } = req.params;
        const year = req.query.year || "২০২৬-২০২৭";

        // ১. স্টুডেন্ট প্রোফাইল ডাটা ব্যাকএন্ড ডাটাবেজ থেকে চেক
        const studentInfo = await studentsCollection.findOne({ 
            $or: [
                { studentId: studentId }, 
                { studentId: String(studentId) },
                { _id: ObjectId.isValid(studentId) ? new ObjectId(studentId) : null }
            ] 
        });

        if (!studentInfo) {
            return res.status(404).json({ success: false, message: "শিক্ষার্থী খুঁজে পাওয়া যায়নি।" });
        }

        const targetStudentId = studentInfo.studentId || studentId;

        // ২. উক্ত স্টুডেন্টের সব সাবজেক্টের ইনপুট করা মার্কস নিয়ে আসা
        const markSheets = await marksCollection.find({ 
            studentId: targetStudentId, 
            year: year 
        }).toArray();

        res.json({
            success: true,
            student: {
                studentId: targetStudentId,
                // ক্লায়েন্ট সাইড ফর্মে থাকা বাংলা বা ইংরেজি নাম হ্যান্ডলিং
                name: studentInfo.studentNameBangla || studentInfo.studentNameEnglish || studentInfo.name || "N/A",
                class: studentInfo.class || studentInfo.academicInfo?.class,
                roll: studentInfo.officeUse?.rollNumber || studentInfo.rollNumber || studentInfo.roll || "N/A"
            },
            year,
            results: markSheets
        });

    } catch (error) {
        console.error("Single Student Result Fetch Error:", error);
        res.status(500).json({ success: false, message: "রেজাল্ট লোড করতে সমস্যা হয়েছে।" });
    }
});


/**
 * ৩. সম্পূর্ণ ক্লাসের সামারি/মেরিট লিস্ট এর জন্য API (MongoDB Aggregation)
 * Endpoint: GET /api/results/class
 */
app.get('/api/results/class', async (req, res) => {
    try {
        const { class: className, year } = req.query;

        if (!className) {
            return res.status(400).json({ success: false, message: "ক্লাসের নাম সিলেক্ট করুন।" });
        }

        const selectedYear = year || "২০২৬-২০২৭";

        // Aggregation দিয়ে নির্দিষ্ট ক্লাসের সব স্টুডেন্টের মার্কস একটি এরেতে গ্রুপ করে আনা
        const classResults = await marksCollection.aggregate([
            {
                $match: {
                    class: className,
                    year: selectedYear
                }
            },
            {
                $group: {
                    _id: "$studentId",
                    studentName: { $first: "$studentName" },
                    allSubjects: {
                        $push: {
                            subject: "$subject",
                            term1: "$term1",
                            term2: "$term2",
                            annual: "$annual"
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    studentId: "$_id",
                    studentName: 1,
                    allSubjects: 1
                }
            }
        ]).toArray();

        res.json({
            success: true,
            class: className,
            year: selectedYear,
            count: classResults.length,
            data: classResults
        });

    } catch (error) {
        console.error("Class Result Fetch Error:", error);
        res.status(500).json({ success: false, message: "ক্লাস রেজাল্ট লোড করতে সমস্যা হয়েছে।" });
    }
});


        // ১. শুধুমাত্র Approved বা ফিল্টার করা শিক্ষার্থীদের তালিকা পাওয়ার API
app.get('/api/students', async (req, res) => {
    try {
        const { status, class: studentClass, search } = req.query;

        // ডিফল্টভাবে শুধু 'approved' শিক্ষার্থীদের ফিল্টার করবে
        let query = { status: status || "approved" };

        // নির্দিষ্ট ক্লাস অনুযায়ী ফিল্টার (যদি পাঠানো হয়)
        if (studentClass) {
            query.class = studentClass;
        }

        // নাম বা রোল নম্বর অনুযায়ী সার্চ (যদি পাঠানো হয়)
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: "i" } },
                { rollNumber: { $regex: search, $options: "i" } },
                { studentId: { $regex: search, $options: "i" } }
            ];
        }

        const students = await studentsCollection
            .find(query)
            .sort({ rollNumber: 1, createdAt: -1 })
            .toArray();

        res.json({ success: true, count: students.length, data: students });
    } catch (error) {
        console.error("Error fetching students:", error);
        res.status(500).json({ 
            success: false, 
            message: "শিক্ষার্থী তথ্যসমূহ নিয়ে আসতে সমস্যা হয়েছে।" 
        });
    }
});

       
// ১. স্টুডেন্টের নির্দিষ্ট তথ্য লোড করার জন্য (GET API)
app.get('/api/students/edit/:id', async (req, res) => {
    try {
        const id = req.params.id;
        
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ 
                success: false, 
                message: "অকার্যকর আইডি ফর্ম্যাট।" 
            });
        }

        const student = await studentsCollection.findOne({ _id: new ObjectId(id) });

        if (student) {
            res.json({ success: true, data: student });
        } else {
            res.status(404).json({ 
                success: false, 
                message: "শিক্ষার্থীর কোনো তথ্য পাওয়া যায়নি।" 
            });
        }
    } catch (error) {
        console.error("GET Student Error:", error);
        res.status(500).json({ 
            success: false, 
            message: "সার্ভারে সমস্যা হয়েছে।" 
        });
    }
});

// ২. স্টুডেন্টের আপডেটকৃত তথ্য সেভ করার জন্য (PUT API)
app.put('/api/students/edit/:id', async (req, res) => {
    try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ 
                success: false, 
                message: "অকার্যকর আইডি ফর্ম্যাট।" 
            });
        }

        // ক্লায়েন্ট পেজ থেকে পাঠানো ডেটা
        const updatedData = req.body;

        // আপডেট করার সময় MongoDB-র ডিফল্ট `_id` ফিল্ডটি বাদ রাখা সুরক্ষিত
        delete updatedData._id;

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
            $set: {
                ...updatedData,
                updatedAt: new Date() // আপডেট করার সময় রেকর্ড রাখার জন্য
            }
        };

        const result = await studentsCollection.updateOne(filter, updateDoc);

        if (result.matchedCount === 0) {
            return res.status(404).json({ 
                success: false, 
                message: "আপডেট করার জন্য শিক্ষার্থীর তথ্য পাওয়া যায়নি।" 
            });
        }

        res.json({
            success: true,
            message: "শিক্ষার্থীর তথ্য সফলভাবে আপডেট করা হয়েছে।",
            modifiedCount: result.modifiedCount
        });

    } catch (error) {
        console.error("PUT Student Error:", error);
        res.status(500).json({ 
            success: false, 
            message: "তথ্য আপডেট করার সময় সার্ভারে সমস্যা হয়েছে।" 
        });
    }
});

        
        // ==========================================
        // ১. ফান্ড সম্পর্কিত APIs
        // ==========================================
        app.post('/api/finance/funds', async (req, res) => {
            try {
                const { name, code, description, initBalance } = req.body;

                if (!name || !code) {
                    return res.status(400).json({ success: false, message: "ফান্ডের নাম এবং কোড দেওয়া আবশ্যক।" });
                }

                const existingFund = await fundsCollection.findOne({ code: code.toUpperCase() });
                if (existingFund) {
                    return res.status(400).json({ success: false, message: "এই কোড দিয়ে অলরেডি ফান্ড তৈরি করা আছে।" });
                }

                const newFund = {
                    name,
                    code: code.toUpperCase(),
                    description: description || "",
                    currentBalance: parseFloat(initBalance) || 0,
                    createdAt: new Date()
                };

                const result = await fundsCollection.insertOne(newFund);
                res.status(201).json({
                    success: true,
                    message: "নতুন আর্থিক খাত/তহবিল সফলভাবে সংরক্ষিত হয়েছে!",
                    insertedId: result.insertedId
                });
            } catch (error) {
                console.error("ফান্ড সেভ করতে সমস্যা হয়েছে:", error);
                res.status(500).json({ success: false, message: "সার্ভারে সমস্যা হয়েছে, আবার চেষ্টা করুন।" });
            }
        });

        // ==========================================
        // ২. ফি সেটআপ ও কালেকশন APIs
        // ==========================================
        app.post('/api/finance/fee-setup', async (req, res) => {
            try {
                const { className, feeType, amount, fundCode } = req.body;

                if (!className || !feeType || !amount || !fundCode) {
                    return res.status(400).json({ success: false, message: "সবগুলো ফিল্ড পূরণ করা বাধ্যতামূলক।" });
                }

                const feeData = {
                    className: className.toLowerCase(),
                    feeType: feeType.toLowerCase(),
                    amount: parseFloat(amount),
                    fundCode: fundCode.toUpperCase(),
                    updatedAt: new Date()
                };

                await feeStructuresCollection.updateOne(
                    { className: feeData.className, feeType: feeData.feeType },
                    { $set: feeData },
                    { upsert: true }
                );

                res.status(200).json({
                    success: true,
                    message: "ফি স্ট্রাকচার সফলভাবে সেটআপ/আপডেট হয়েছে!"
                });
            } catch (error) {
                console.error("ফি সেটআপ করতে সমস্যা হয়েছে:", error);
                res.status(500).json({ success: false, message: "সার্ভারে সমস্যা হয়েছে, আবার চেষ্টা করুন।" });
            }
        });

        app.get('/api/finance/settings', async (req, res) => {
            try {
                const funds = await fundsCollection.find({}).toArray();
                const feeStructures = await feeStructuresCollection.find({}).toArray();

                res.status(200).json({ success: true, funds, feeStructures });
            } catch (error) {
                console.error("ডাটা রিড করতে সমস্যা হয়েছে:", error);
                res.status(500).json({ success: false, message: "সার্ভার থেকে ডাটা আনা যায়নি।" });
            }
        });

        app.get('/api/finance/student-fees/:studentId', async (req, res) => {
            try {
                const { studentId } = req.params;
                const query = ObjectId.isValid(studentId)
                    ? { $or: [{ _id: new ObjectId(studentId) }, { studentId: studentId }] }
                    : { studentId: studentId };

                const student = await admissionCollection.findOne(query);

                if (!student) {
                    return res.status(404).json({ success: false, message: "এই আইডি দিয়ে কোনো শিক্ষার্থী পাওয়া যায়নি।" });
                }

                const studentClass = student.class || student.className || "";
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
                console.error("শিক্ষার্থীর ফি খুঁজতে সমস্যা হয়েছে:", error);
                res.status(500).json({ success: false, message: "সার্ভারে সমস্যা হয়েছে।" });
            }
        });

        app.post('/api/finance/collect-fee', async (req, res) => {
            try {
                const { studentId, studentName, className, feeType, amount, fundCode, paymentMethod } = req.body;

                if (!studentId || !feeType || !amount || !fundCode) {
                    return res.status(400).json({ success: false, message: "প্রয়োজনীয় সকল তথ্য দেওয়া হয়নি।" });
                }

                const parsedAmount = parseFloat(amount);
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

                const receiptResult = await receiptsCollection.insertOne(newReceipt);

                await fundsCollection.updateOne(
                    { code: fundCode.toUpperCase() },
                    { $inc: { currentBalance: parsedAmount } }
                );

                res.status(201).json({
                    success: true,
                    message: "ফি সফলভাবে গ্রহণ করা হয়েছে এবং ফান্ড আপডেট হয়েছে।",
                    receiptNo,
                    insertedId: receiptResult.insertedId
                });
            } catch (error) {
                console.error("ফি কালেকশনে সমস্যা হয়েছে:", error);
                res.status(500).json({ success: false, message: "সার্ভারে সমস্যা হয়েছে, আবার চেষ্টা করুন।" });
            }
        });

        // ==========================================
        // ৩. ভর্তি (Admissions) সম্পর্কিত APIs
        // ==========================================
        app.post('/api/admissions', async (req, res) => {
            try {
                const newApplication = req.body;

                newApplication.studentId = "Pending"; // প্রারম্ভিক অবস্থায় Pending থাকবে
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

        app.get('/api/admissions', async (req, res) => {
            try {
                const applications = await admissionCollection.find({}).sort({ createdAt: -1 }).toArray();
                res.json({ success: true, data: applications });
            } catch (error) {
                res.status(500).json({ success: false, message: "আবেদনপত্র নিয়ে আসতে সমস্যা হয়েছে।" });
            }
        });

        app.patch('/api/admissions/:id', async (req, res) => {
            try {
                const id = req.params.id;
                const { status } = req.body;

                if (!ObjectId.isValid(id)) {
                    return res.status(400).json({ success: false, message: "অকার্যকর আইডি ফর্ম্যাট।" });
                }

                const filter = { _id: new ObjectId(id) };
                const existingStudent = await admissionCollection.findOne(filter);

                if (!existingStudent) {
                    return res.status(404).json({ success: false, message: "আবেদনটি পাওয়া যায়নি।" });
                }

                let updateDoc = { $set: { status: status } };

                if (status === 'Approved' && (existingStudent.studentId === 'Pending' || !existingStudent.studentId)) {
                    let nextIdNumber;

                    const reusableId = await deletedIdsCollection.findOneAndDelete(
                        {},
                        { sort: { sequence_value: 1 } }
                    );

                    if (reusableId) {
                        nextIdNumber = reusableId.sequence_value;
                    } else {
                        const counterResult = await countersCollection.findOneAndUpdate(
                            { _id: "studentId" },
                            { $inc: { sequence_value: 1 } },
                            { returnDocument: "after", upsert: true }
                        );
                        nextIdNumber = counterResult.sequence_value;
                    }

                    const formattedSequence = String(nextIdNumber).padStart(2, '0');
                    const generatedStudentId = `04${formattedSequence}`;

                    updateDoc.$set.studentId = generatedStudentId;
                }

                const result = await admissionCollection.updateOne(filter, updateDoc);

                if (result.modifiedCount === 1 || result.matchedCount === 1) {
                    const updatedStudent = await admissionCollection.findOne(filter);
                    res.json({
                        success: true,
                        message: `আবেদনটি সফলভাবে ${status === 'Approved' ? 'অনুমোদন' : 'আপডেট'} করা হয়েছে।`,
                        studentId: updatedStudent.studentId
                    });
                } else {
                    res.status(400).json({ success: false, message: "কোনো পরিবর্তন করা হয়নি।" });
                }
            } catch (error) {
                console.error("স্ট্যাটাস আপডেট করতে সমস্যা হয়েছে:", error);
                res.status(500).json({ success: false, message: "সার্ভারে সমস্যা হয়েছে।" });
            }
        });

        app.delete('/api/admissions/:id', async (req, res) => {
            try {
                const id = req.params.id;
                if (!ObjectId.isValid(id)) {
                    return res.status(400).json({ success: false, message: "অকার্যকর আইডি ফর্ম্যাট।" });
                }

                const query = { _id: new ObjectId(id) };
                const student = await admissionCollection.findOne(query);

                if (!student) {
                    return res.status(404).json({ success: false, message: "আবেদনটি খুঁজে পাওয়া যায়নি।" });
                }

                if (student.status === 'Approved' && student.studentId && student.studentId.startsWith('04')) {
                    const rawSeqNumber = parseInt(student.studentId.slice(2), 10);

                    if (!isNaN(rawSeqNumber)) {
                        await deletedIdsCollection.insertOne({
                            sequence_value: rawSeqNumber,
                            deletedAt: new Date()
                        });
                    }
                }

                const result = await admissionCollection.deleteOne(query);

                if (result.deletedCount === 1) {
                    res.json({ success: true, message: "ভর্তি আবেদনটি সফলভাবে মুছে ফেলা হয়েছে এবং আইডিটি পুনরায় ব্যবহারের জন্য খালি করা হয়েছে।" });
                } else {
                    res.status(404).json({ success: false, message: "আবেদনটি খুঁজে পাওয়া যায়নি।" });
                }
            } catch (error) {
                console.error("আবেদন মুছতে সমস্যা হয়েছে:", error);
                res.status(500).json({ success: false, message: "সার্ভারে সমস্যা হয়েছে, আবার চেষ্টা করুন।" });
            }
        });

        app.get('/api/admissions/edit/:id', async (req, res) => {
            try {
                const id = req.params.id;
                if (!ObjectId.isValid(id)) {
                    return res.status(400).json({ success: false, message: "অকার্যকর আইডি ফর্ম্যাট।" });
                }

                const student = await admissionCollection.findOne({ _id: new ObjectId(id) });
                if (student) {
                    res.json({ success: true, data: student });
                } else {
                    res.status(404).json({ success: false, message: "শিক্ষার্থীর কোনো তথ্য পাওয়া যায়নি।" });
                }
            } catch (error) {
                console.error("GET Error:", error);
                res.status(500).json({ success: false, message: "সার্ভারে সমস্যা হয়েছে।" });
            }
        });

        app.put('/api/admissions/edit/:id', async (req, res) => {
            try {
                const id = req.params.id;
                if (!ObjectId.isValid(id)) {
                    return res.status(400).json({ success: false, message: "অকার্যকর আইডি ফর্ম্যাট।" });
                }

                const { _id, createdAt, updatedAt, ...updateData } = req.body;

                const result = await admissionCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: updateData }
                );

                if (result.matchedCount > 0) {
                    res.json({ success: true, message: "শিক্ষার্থীর প্রোফাইল সফলভাবে আপডেট করা হয়েছে।" });
                } else {
                    res.status(404).json({ success: false, message: "শিক্ষার্থীর তথ্য পাওয়া যায়নি।" });
                }
            } catch (error) {
                console.error("PUT Error:", error);
                res.status(500).json({ success: false, message: "সার্ভারে সমস্যা হয়েছে।" });
            }
        });

        // ==========================================
        // ৪. সেটিংস ও গ্যালারি APIs
        // ==========================================
        app.put('/api/admission-settings', async (req, res) => {
            try {
                const { _id, type, ...settingsData } = req.body;

                await settingsCollection.updateOne(
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

        app.get('/api/admission-settings', async (req, res) => {
            try {
                const settings = await settingsCollection.findOne({ type: "admission_guideline" });
                res.json({ success: true, data: settings || {} });
            } catch (error) {
                res.status(500).json({ success: false, message: "ডাটা লোড করা সম্ভব হয়নি।" });
            }
        });

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

        app.delete('/api/gallery/:id', async (req, res) => {
            try {
                const id = req.params.id;
                if (!ObjectId.isValid(id)) {
                    return res.status(400).json({ success: false, message: "অকার্যকর আইডি ফর্ম্যাট।" });
                }

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

        // মূল রুট
        app.get('/', (req, res) => {
            res.send('As-Salam Madrasah Server is Running!');
        });

        console.log("MongoDB-র সাথে সফলভাবে কানেক্টেড হয়েছে! 🚀");

        // সার্ভার চালুকরণ (MongoDB কানেকশনের পর)
        app.listen(port, () => {
            console.log(`Server is running on port: ${port}`);
        });

    } catch (error) {
        console.error("MongoDB কানেকশন ত্রুটি:", error);
    }
}

run().catch(console.dir);
