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
        const routinesCollection = database.collection("routine")
        const financeIncomesCollection = database.collection("finance_incomes");
        const financeExpensesCollection = database.collection("finance_expenses");


        app.post('/api/admin/routine', async (req, res) => {
            try {
                const {
                    examTitle,
                    hijriYear,
                    gregorianYear,
                    note,
                    dates,
                    routineData,
                    division,
                    academyType
                } = req.body;

                // ১. ভ্যালিডেশন চেক
                if (!examTitle || !Array.isArray(dates) || dates.length === 0 || !Array.isArray(routineData) || routineData.length === 0) {
                    return res.status(400).json({
                        success: false,
                        message: "প্রয়োজনীয় তথ্য (Exam Title, Dates এবং Routine Data) সঠিকভাবে দেওয়া হয়নি।"
                    });
                }

                // ২. ফিল্টার অবজেক্ট তৈরি (পরীক্ষার নাম, বিভাগ ও হিজরী বছরকে ইউনিক আইডেন্টিফায়ার হিসেবে ধরা হয়েছে)
                const filter = {
                    examTitle: examTitle,
                    hijriYear: hijriYear || "",
                    division: division || "all"
                };

                // ৩. আপডেট ডাটা অবজেক্ট
                const updateDoc = {
                    $set: {
                        examTitle,
                        hijriYear: hijriYear || "",
                        gregorianYear: gregorianYear || "",
                        note: note || "",
                        dates,
                        routineData,
                        division: division || "all",
                        academyType: academyType || "all",
                        updatedAt: new Date()
                    },
                    $setOnInsert: {
                        createdAt: new Date()
                    }
                };

                // ৪. MongoDB তে Upsert (Save or Update) করা
                // নোট: 'routinesCollection' এর জায়গায় আপনার MongoDB collection নামটি দিন
                const result = await routinesCollection.updateOne(filter, updateDoc, { upsert: true });

                // ৫. সফল রেসপন্স
                res.status(200).json({
                    success: true,
                    message: "রুটিন ডেটাবেসে সফলভাবে সেভ ও আপডেট করা হয়েছে।",
                    data: result
                });

            } catch (error) {
                console.error("Routine save error:", error);
                res.status(500).json({
                    success: false,
                    message: "সার্ভারে রুটিন সেভ করতে সমস্যা হয়েছে।",
                    error: error.message
                });
            }
        });

        app.get('/api/admin/routine', async (req, res) => {
            try {
                const { examTitle, hijriYear, division } = req.query;

                if (!examTitle) {
                    return res.status(400).json({ success: false, message: "examTitle প্রয়োজন" });
                }

                const filter = {
                    examTitle: examTitle,
                    hijriYear: hijriYear || "",
                    division: division || "all"
                };

                const existingRoutine = await routinesCollection.findOne(filter);

                if (existingRoutine) {
                    res.status(200).json({ success: true, data: existingRoutine });
                } else {
                    res.status(404).json({ success: false, message: "কোনো রুটিন পাওয়া যায়নি" });
                }
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        /**
 * ৭. এডমিট কার্ড ডাটা পাওয়ার API
 * Endpoint: GET /api/admit-card/:studentId
 */
        app.get('/api/admit-card/:studentId', async (req, res) => {
            try {
                const { studentId } = req.params;
                const examName = req.query.examName || "প্রথম সাময়িক পরীক্ষা";
                const sessionYear = req.query.sessionYear || "২০২৬-২০২৭ইঃ/১৪৪৭-১৪৪৮ হিজরী";

                // শিক্ষার্থী খোঁজা (studentId অথবা _id দিয়ে)
                const query = ObjectId.isValid(studentId)
                    ? { $or: [{ _id: new ObjectId(studentId) }, { studentId: studentId }] }
                    : { studentId: studentId };

                const student = await studentsCollection.findOne(query) || await admissionCollection.findOne(query);

                if (!student) {
                    return res.status(404).json({ success: false, message: "শিক্ষার্থী খুঁজে পাওয়া যায়নি।" });
                }

                const studentClass = student.divisionAcademy?.class
                    || student.divisionHifz?.class
                    || student.divisionPreHifz?.class
                    || student.class
                    || student.className
                    || "N/A";

                // পরীক্ষার রুটিন ডায়নামিকভাবে সেট সেটিংস/কালেকশন থেকে আনা বা ডিফল্ট ডাটা
                const defaultRoutine = [
                    { date: "০৫/০৫/২০২৬", day: "মঙ্গলবার", subject: "আরবি" },
                    { date: "০৭/০৫/২০২৬", day: "বৃহস্পতিবার", subject: "ইংরেজি" },
                    { date: "১১/০৫/২০২৬", day: "সোমবার", subject: "গণিত" },
                    { date: "১৩/০৫/২০২৬", day: "বুধবার", subject: "বাংলা" },
                    { date: "১৬/০৫/২০২৬", day: "শনিবার", subject: "আকিদাহ" },
                    { date: "১৮/০৫/২০২৬", day: "সোমবার", subject: "কুরআন-১" },
                    { date: "২১/০৫/২০২৬", day: "বৃহস্পতিবার", subject: "সাধারণ জ্ঞান" }
                ];

                res.status(200).json({
                    success: true,
                    data: {
                        student: {
                            nameBangla: student.studentNameBangla || student.name || "N/A",
                            fatherName: student.fatherNameBangla || student.fatherName || "N/A",
                            upazila: student.upazila || student.presentAddress?.upazila || "হবিগঞ্জ সদর",
                            district: student.district || student.presentAddress?.district || "হবিগঞ্জ",
                            id: student.studentId || "N/A",
                            roll: student.officeUse?.rollNumber || student.roll || "N/A",
                            class: studentClass,
                            hallNo: student.hallNo || "১",
                            seatNo: student.seatNo || "১",
                            photoUrl: student.photoUrl || student.imageUrl || "https://via.placeholder.com/150"
                        },
                        examInfo: {
                            examName,
                            sessionYear,
                            examTime: "সকাল ৯:০০ থেকে ১১:৩০ মিনিট পর্যন্ত"
                        },
                        routine: defaultRoutine
                    }
                });

            } catch (error) {
                console.error("Admit Card Fetch Error:", error);
                res.status(500).json({ success: false, message: "এডমিট কার্ডের তথ্য আনতে সমস্যা হয়েছে।" });
            }
        });
        // ==========================================
        // ৫. মার্কস ও রিজাল্ট সংক্রান্ত APIs
        // ==========================================

        /**
     * নির্দিষ্ট ক্লাস এবং স্ট্যাটাস অনুযায়ী শিক্ষার্থীদের তালিকা নিয়ে আসার API
     * Endpoint: GET /api/students?class=প্লে&status=approved
     */
        app.get('/api/students', async (req, res) => {
            try {
                const { class: className, status, search } = req.query;

                // ১. ডায়নামিক ফিল্টার অবজেক্ট
                const filter = {};

                // ক্লাস ফিল্টারিং (PreHifz, Hifz অথবা Academy - যেকোনো একটির মধ্যে ক্লাস মিললেই হবে)
                if (className) {
                    filter.$or = [
                        { "divisionAcademy.class": className },
                        { "divisionHifz.class": className },
                        { "divisionPreHifz.class": className }
                    ];
                }

                // স্ট্যাটাস ফিল্টারিং (Case-Insensitive করার জন্য Case Ignore Regex ব্যবহার করা হয়েছে)
                if (status) {
                    filter.status = { $regex: new RegExp(`^${status}$`, 'i') }; // "Approved" বা "approved" উভয়ই ম্যাচ করবে
                }

                // সার্চ ফিল্টারিং (যদি পাঠানো হয়)
                if (search) {
                    const searchRegex = { $regex: search, $options: "i" };
                    const searchFilter = [
                        { studentNameBangla: searchRegex },
                        { studentNameEnglish: searchRegex },
                        { "officeUse.rollNumber": searchRegex },
                        { studentId: searchRegex }
                    ];
                    if (filter.$or) {
                        filter.$and = [
                            { $or: filter.$or },
                            { $or: searchFilter }
                        ];
                        delete filter.$or;
                    } else {
                        filter.$or = searchFilter;
                    }
                }

                // ২. ডাটাবেজ থেকে ডাটা খোঁজা এবং রোল নম্বর অনুযায়ী সর্টিং
                const students = await studentsCollection
                    .find(filter)
                    .sort({ "officeUse.rollNumber": 1, studentId: 1 }) // রোল না থাকলে studentId দিয়ে সর্ট করবে
                    .toArray();

                // ৩. ফ্রন্টএন্ডের প্রত্যাশিত ফরম্যাটে রেসপন্স পাঠানো
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
                const { class: studentClass, subject, examType, year, marksData } = req.body;

                // ভ্যালিডেশন চেক
                if (!studentClass || !subject || !examType || !Array.isArray(marksData) || marksData.length === 0) {
                    return res.status(400).json({
                        success: false,
                        message: "প্রয়োজনীয় তথ্য (Class, Subject, Exam Type এবং Marks Data) সঠিকভাব দেওয়া হয়নি।"
                    });
                }

                const academicYear = year || "২০২৬-২০২৭";

                // সকল শিক্ষার্থীর জন্য bulk operations তৈরি করা
                const operations = marksData.map((student) => {
                    const { studentId, studentName, rollNumber, ctMark, examMark } = student;

                    const filter = {
                        studentId: String(studentId),
                        class: studentClass,
                        subject: subject,
                        year: academicYear
                    };

                    const parsedCt = parseFloat(ctMark);
                    const parsedExam = parseFloat(examMark);

                    const updateField = {};
                    updateField[`${examType}.ct`] = isNaN(parsedCt) ? 0 : parsedCt;
                    updateField[`${examType}.exam`] = isNaN(parsedExam) ? 0 : parsedExam;

                    return {
                        updateOne: {
                            filter: filter,
                            update: {
                                $set: {
                                    studentName: studentName || "N/A",
                                    rollNumber: rollNumber || "N/A",
                                    updatedAt: new Date(),
                                    ...updateField
                                },
                                $setOnInsert: {
                                    createdAt: new Date()
                                }
                            },
                            upsert: true
                        }
                    };
                });

                // bulkWrite এর মাধ্যমে একসাথে সব শিক্ষার্থীর ডাটা আপডেট/ইনসার্ট করা
                const result = await marksCollection.bulkWrite(operations);

                res.status(200).json({
                    success: true,
                    message: "সকল শিক্ষার্থীর মার্কস সফলভাবে সংরক্ষণ ও আপডেট করা হয়েছে।",
                    data: result
                });

            } catch (error) {
                console.error("Marks input error:", error);
                res.status(500).json({
                    success: false,
                    message: "সার্ভারে মার্কস সেভ করতে সমস্যা হয়েছে।"
                });
            }
        });

        /**
 * ২. পূর্বের ইনপুট করা মার্কস চেক/লোড করার API
 * Endpoint: GET /api/marks/get
 * Query Params: ?studentId=...&class=...&subject=...&year=...
 */
        app.get('/api/marks/get', async (req, res) => {
            try {
                const { class: studentClass, subject, year } = req.query;

                // ভ্যালিডেশন: নির্দিষ্ট ক্লাসের সব ডাটা আনার জন্য Class এবং Subject আবশ্যক
                if (!studentClass || !subject) {
                    return res.status(400).json({
                        success: false,
                        message: "প্রয়োজনীয় তথ্য (Class এবং Subject) দেওয়া হয়নি।"
                    });
                }

                const academicYear = year || "২০২৬-২০২৭";

                // ফিল্টার (studentId বাদ দেওয়া হয়েছে যেন ক্লাসের সব শিক্ষার্থীর ডাটা পাওয়া যায়)
                const filter = {
                    class: studentClass,
                    subject: subject,
                    year: academicYear
                };

                // ডাটাবেজ থেকে ওই ক্লাসের ও সাবজেক্টের সব শিক্ষার্থীর মার্কস বের করা
                const marksData = await marksCollection.find(filter).toArray();

                res.status(200).json({
                    success: true,
                    count: marksData.length,
                    data: marksData
                });

            } catch (error) {
                console.error("Marks fetch error:", error);
                res.status(500).json({
                    success: false,
                    message: "মার্কস লোড করতে সমস্যা হয়েছে।"
                });
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
                const studentQuery = {
                    $or: [
                        { studentId: studentId },
                        { studentId: String(studentId) }
                    ]
                };
                if (ObjectId.isValid(studentId)) {
                    studentQuery.$or.push({ _id: new ObjectId(studentId) });
                }

                const studentInfo = await studentsCollection.findOne(studentQuery);

                if (!studentInfo) {
                    return res.status(404).json({ success: false, message: "শিক্ষার্থী খুঁজে পাওয়া যায়নি।" });
                }

                const targetStudentId = studentInfo.studentId || studentId;

                // ২. ডাটাবেজ ফিল্ড স্ট্রাকচার থেকে সঠিক Class নির্বাচন
                const studentClass = studentInfo.divisionAcademy?.class
                    || studentInfo.divisionHifz?.class
                    || studentInfo.divisionPreHifz?.class
                    || studentInfo.class
                    || "N/A";

                // ৩. উক্ত স্টুডেন্টের সব সাবজেক্টের ইনপুট করা মার্কস নিয়ে আসা
                const markSheets = await marksCollection.find({
                    studentId: targetStudentId,
                    year: year
                }).toArray();

                res.json({
                    success: true,
                    student: {
                        studentId: targetStudentId,
                        name: studentInfo.studentNameBangla || studentInfo.studentNameEnglish || "N/A",
                        class: studentClass,
                        roll: studentInfo.officeUse?.rollNumber || "N/A",
                        sessionYear: studentInfo.sessionYear || year
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
         * Endpoint: GET /api/results/class?class=প্রথম&year=২০২৬-২০২৭&term=term1
         */
        app.get('/api/results/class', async (req, res) => {
            try {
                const { class: className, year, term } = req.query;

                if (!className) {
                    return res.status(400).json({
                        success: false,
                        message: "ক্লাসের নাম সরবরাহ করা হয়নি।"
                    });
                }

                const selectedYear = year || "২০২৬-২০২৭";
                const selectedTerm = term || "annual";

                // ১. কেস-ইনসেনসিটিভ ও ট্রিমড ফিল্টারিং
                const classRegex = new RegExp(`^${className.trim()}$`, 'i');
                const yearRegex = new RegExp(`^${selectedYear.trim()}$`, 'i');

                // ২. Aggregation Pipeline
                const classResults = await marksCollection.aggregate([
                    {
                        $match: {
                            class: classRegex,
                            year: yearRegex
                        }
                    },
                    {
                        $group: {
                            _id: { $toString: "$studentId" },
                            studentId: { $first: { $toString: "$studentId" } },
                            studentName: { $first: "$studentName" },
                            rollNumber: { $first: "$rollNumber" },
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
                        $sort: {
                            rollNumber: 1,
                            studentId: 1
                        }
                    }
                ]).toArray();

                res.status(200).json({
                    success: true,
                    count: classResults.length,
                    term: selectedTerm,
                    data: classResults
                });

            } catch (error) {
                console.error("Class Results Aggregation Error:", error);
                res.status(500).json({
                    success: false,
                    message: "ক্লাসের ফলাফলের তথ্য লোড করতে সমস্যা হয়েছে।"
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

        // ==========================================
        // ৬. ফাইনান্স (Income & Expense) সম্পর্কিত APIs
        // ==========================================

        // ১. আয় এন্ট্রি করার API
        app.post('/api/finance/income', async (req, res) => {
            try {
                const { receiptNo, payerName, date, month, items, paymentMethod, description } = req.body;

                if (!date || !month || !Array.isArray(items) || items.length === 0) {
                    return res.status(400).json({ success: false, message: "তারিখ, মাস এবং অন্তত একটি আয়ের খাত দেওয়া আবশ্যক।" });
                }

                // মোট আয় হিসাব
                const totalIncome = items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
                const finalReceiptNo = receiptNo || "INC-" + Date.now().toString().slice(-9);

                const newIncome = {
                    receiptNo: finalReceiptNo,
                    payerName: payerName || "N/A",
                    date,
                    month, // format: YYYY-MM
                    items: items.map(item => ({
                        head: item.head,
                        amount: parseFloat(item.amount) || 0
                    })),
                    totalIncome,
                    paymentMethod: paymentMethod || "Cash",
                    description: description || "",
                    createdAt: new Date()
                };

                const result = await financeIncomesCollection.insertOne(newIncome);
                res.status(201).json({
                    success: true,
                    message: "আয়ের তথ্য সফলভাবে সংরক্ষণ করা হয়েছে!",
                    insertedId: result.insertedId,
                    data: newIncome
                });
            } catch (error) {
                console.error("Income save error:", error);
                res.status(500).json({ success: false, message: "সার্ভারে আয়ের তথ্য সংরক্ষণ করতে সমস্যা হয়েছে।" });
            }
        });

        // ২. ব্যয় (ভাউচার) এন্ট্রি করার API
        app.post('/api/finance/expense', async (req, res) => {
            try {
                const { voucherNo, receiverName, advanceAmount, chequeNo, date, month, items, description } = req.body;

                if (!date || !month || !Array.isArray(items) || items.length === 0) {
                    return res.status(400).json({ success: false, message: "তারিখ, মাস এবং অন্তত একটি ব্যয়ের খাত দেওয়া আবশ্যক।" });
                }

                const totalExpense = items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
                const parsedAdvance = parseFloat(advanceAmount) || 0;
                const balance = parsedAdvance - totalExpense;
                const finalVoucherNo = voucherNo || "EXP-" + Date.now().toString().slice(-9);

                const newExpense = {
                    voucherNo: finalVoucherNo,
                    receiverName: receiverName || "N/A",
                    advanceAmount: parsedAdvance,
                    chequeNo: chequeNo || "",
                    date,
                    month, // format: YYYY-MM
                    items: items.map(item => ({
                        head: item.head,
                        amount: parseFloat(item.amount) || 0
                    })),
                    totalExpense,
                    balance,
                    description: description || "",
                    createdAt: new Date()
                };

                const result = await financeExpensesCollection.insertOne(newExpense);
                res.status(201).json({
                    success: true,
                    message: "ব্যয়ের তথ্য সফলভাবে ভাউচার হিসেবে সংরক্ষণ করা হয়েছে!",
                    insertedId: result.insertedId,
                    data: newExpense
                });
            } catch (error) {
                console.error("Expense save error:", error);
                res.status(500).json({ success: false, message: "সার্ভারে ব্যয়ের তথ্য সংরক্ষণ করতে সমস্যা হয়েছে।" });
            }
        });

        // ৩. মাসিক আয়ের ও ব্যয়ের সারসংক্ষেপ এবং খাত-ভিত্তিক হিসাব
        app.get('/api/finance/summary', async (req, res) => {
            try {
                const { month, year } = req.query;

                if (!month || !year) {
                    return res.status(400).json({ success: false, message: "মাস এবং বছর সরবরাহ করা আবশ্যক।" });
                }

                const targetMonth = `${year}-${String(month).padStart(2, '0')}`;

                // মোট আয় হিসাব
                const incomeAggregation = await financeIncomesCollection.aggregate([
                    { $match: { month: targetMonth } },
                    {
                        $group: {
                            _id: null,
                            total: { $sum: "$totalIncome" }
                        }
                    }
                ]).toArray();

                // মোট ব্যয় হিসাব
                const expenseAggregation = await financeExpensesCollection.aggregate([
                    { $match: { month: targetMonth } },
                    {
                        $group: {
                            _id: null,
                            total: { $sum: "$totalExpense" }
                        }
                    }
                ]).toArray();

                const totalIncome = incomeAggregation[0]?.total || 0;
                const totalExpense = expenseAggregation[0]?.total || 0;
                const netBalance = totalIncome - totalExpense;

                // খাত-ভিত্তিক আয়ের হিসাব
                const incomeCategoryBreakdown = await financeIncomesCollection.aggregate([
                    { $match: { month: targetMonth } },
                    { $unwind: "$items" },
                    {
                        $group: {
                            _id: "$items.head",
                            total: { $sum: "$items.amount" }
                        }
                    },
                    { $sort: { total: -1 } }
                ]).toArray();

                // খাত-ভিত্তিক ব্যয়ের হিসাব
                const expenseCategoryBreakdown = await financeExpensesCollection.aggregate([
                    { $match: { month: targetMonth } },
                    { $unwind: "$items" },
                    {
                        $group: {
                            _id: "$items.head",
                            total: { $sum: "$items.amount" }
                        }
                    },
                    { $sort: { total: -1 } }
                ]).toArray();

                res.status(200).json({
                    success: true,
                    data: {
                        month: targetMonth,
                        totalIncome,
                        totalExpense,
                        netBalance,
                        incomeBreakdown: incomeCategoryBreakdown.map(item => ({ head: item._id, amount: item.total })),
                        expenseBreakdown: expenseCategoryBreakdown.map(item => ({ head: item._id, amount: item.total }))
                    }
                });
            } catch (error) {
                console.error("Summary query error:", error);
                res.status(500).json({ success: false, message: "সার্ভার থেকে আর্থিক সারসংক্ষেপ আনতে সমস্যা হয়েছে।" });
            }
        });

        // ৪. লেনদেনের ইতিহাস ও অনুসন্ধান (Pagination & Search)
        app.get('/api/finance/transactions', async (req, res) => {
            try {
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 10;
                const type = req.query.type || 'all'; // all, income, expense
                const search = req.query.search || '';
                const startDate = req.query.startDate;
                const endDate = req.query.endDate;

                const skip = (page - 1) * limit;

                const buildFilter = (isIncome) => {
                    const filter = {};

                    if (search) {
                        const regex = { $regex: search, $options: 'i' };
                        if (isIncome) {
                            filter.$or = [
                                { receiptNo: regex },
                                { payerName: regex },
                                { description: regex },
                                { "items.head": regex }
                            ];
                        } else {
                            filter.$or = [
                                { voucherNo: regex },
                                { receiverName: regex },
                                { chequeNo: regex },
                                { description: regex },
                                { "items.head": regex }
                            ];
                        }
                    }

                    if (startDate || endDate) {
                        filter.date = {};
                        if (startDate) filter.date.$gte = startDate;
                        if (endDate) filter.date.$lte = endDate;
                    }

                    return filter;
                };

                let transactions = [];
                let totalCount = 0;

                if (type === 'income') {
                    const filter = buildFilter(true);
                    totalCount = await financeIncomesCollection.countDocuments(filter);
                    const list = await financeIncomesCollection.find(filter)
                        .sort({ date: -1, createdAt: -1 })
                        .skip(skip)
                        .limit(limit)
                        .toArray();
                    transactions = list.map(item => ({ ...item, type: 'income' }));
                } else if (type === 'expense') {
                    const filter = buildFilter(false);
                    totalCount = await financeExpensesCollection.countDocuments(filter);
                    const list = await financeExpensesCollection.find(filter)
                        .sort({ date: -1, createdAt: -1 })
                        .skip(skip)
                        .limit(limit)
                        .toArray();
                    transactions = list.map(item => ({ ...item, type: 'expense' }));
                } else {
                    const filterIncome = buildFilter(true);
                    const filterExpense = buildFilter(false);

                    const facetPipeline = [
                        { $match: filterIncome },
                        { $addFields: { type: "income" } },
                        {
                            $unionWith: {
                                coll: "finance_expenses",
                                pipeline: [
                                    { $match: filterExpense },
                                    { $addFields: { type: "expense" } }
                                ]
                            }
                        },
                        { $sort: { date: -1, createdAt: -1 } },
                        {
                            $facet: {
                                metadata: [{ $count: "total" }],
                                data: [{ $skip: skip }, { $limit: limit }]
                            }
                        }
                    ];

                    const result = await financeIncomesCollection.aggregate(facetPipeline).toArray();
                    transactions = result[0]?.data || [];
                    totalCount = result[0]?.metadata[0]?.total || 0;
                }

                res.status(200).json({
                    success: true,
                    page,
                    limit,
                    totalCount,
                    totalPages: Math.ceil(totalCount / limit),
                    data: transactions
                });
            } catch (error) {
                console.error("Transactions query error:", error);
                res.status(500).json({ success: false, message: "সার্ভার থেকে লেনদেনের তালিকা আনতে সমস্যা হয়েছে।" });
            }
        });

        // ==========================================
        // স্টুডেন্ট পোর্টাল ও পরীক্ষার সেটিং সংক্রান্ত APIs (Task 1 & 2)
        // ==========================================
        const examsCollection = database.collection("exams");
        const feesCollection = database.collection("fees");
        const seatPlansCollection = database.collection("seat_plans");

        // ডাটাবেজে মক ডাটা সিড (যদি পূর্বে সিড করা না থাকে)
        (async () => {
            try {
                const examsCount = await examsCollection.countDocuments();
                if (examsCount === 0) {
                    await examsCollection.insertMany([
                        {
                            class: "দশম",
                            className: "দশম",
                            batch: "২০২৬-২০২৭",
                            sessionYear: "২০২৬-২০২৭",
                            isAdmitPublished: true,
                            routine: [
                                { subject: "বাংলা ১ম", date: "২০২৬-০৮-১০", time: "১০:০০ AM - ০১:০০ PM", room: "২০১" },
                                { subject: "ইংরেজি ১ম", date: "২০২৬-০৮-১২", time: "১০:০০ AM - ০১:০০ PM", room: "২০১" },
                                { subject: "গণিত", date: "২০২৬-০৮-১৪", time: "১০:০০ AM - ০১:০০ PM", room: "২০২" },
                                { subject: "পদার্থবিজ্ঞান", date: "২০২৬-০৮-১৬", time: "১০:০০ AM - ০১:০০ PM", room: "২০৩" }
                            ]
                        },
                        {
                            class: "নবম",
                            className: "নবম",
                            batch: "২০২৬-২০২৭",
                            sessionYear: "২০২৬-২০২৭",
                            isAdmitPublished: true,
                            routine: [
                                { subject: "বাংলা ১ম", date: "২০২৬-০৮-১০", time: "১০:০০ AM - ০১:০০ PM", room: "১০১" },
                                { subject: "ইংরেজি ১ম", date: "২০২৬-০৮-১২", time: "১০:০০ AM - ০১:০০ PM", room: "১০১" },
                                { subject: "গণিত", date: "২০২৬-০৮-১৪", time: "১০:০০ AM - ০১:০০ PM", room: "১০২" }
                            ]
                        }
                    ]);
                }

                const existingStudents = await studentsCollection.find({}).limit(5).toArray();
                const feesCount = await feesCollection.countDocuments();
                const seatPlansCount = await seatPlansCollection.countDocuments();

                if (existingStudents.length > 0) {
                    if (feesCount === 0) {
                        const feesToInsert = existingStudents.map((s, idx) => ({
                            studentId: s.studentId || String(s._id),
                            status: idx % 2 === 0 ? "PAID" : "UNPAID",
                            amount: 1500,
                            transactionId: idx % 2 === 0 ? `TXN${Date.now()}${idx}` : undefined,
                            paymentMethod: idx % 2 === 0 ? "bKash" : undefined,
                            paidAt: idx % 2 === 0 ? new Date() : undefined
                        }));
                        await feesCollection.insertMany(feesToInsert);
                    }
                    if (seatPlansCount === 0) {
                        const seatsToInsert = existingStudents.map((s, idx) => ({
                            studentId: s.studentId || String(s._id),
                            building: idx % 2 === 0 ? "প্রধান ভবন" : "নতুন ভবন",
                            room: String(201 + idx),
                            seatNo: `A-${idx + 10}`,
                            roll: s.officeUse?.rollNumber || s.roll || String(idx + 1)
                        }));
                        await seatPlansCollection.insertMany(seatsToInsert);
                    }
                } else {
                    if (feesCount === 0) {
                        await feesCollection.insertMany([
                            { studentId: "04337", status: "PAID", amount: 1500, transactionId: "TXN123456789", paymentMethod: "bKash", paidAt: new Date() },
                            { studentId: "04338", status: "UNPAID", amount: 1500 }
                        ]);
                    }
                    if (seatPlansCount === 0) {
                        await seatPlansCollection.insertMany([
                            { studentId: "04337", building: "প্রধান ভবন", room: "২০১", seatNo: "A-12", roll: "১০" },
                            { studentId: "04338", building: "নতুন ভবন", room: "১০২", seatNo: "B-05", roll: "১১" }
                        ]);
                    }
                }
            } catch (err) {
                console.error("Error seeding mock data:", err);
            }
        })();


        // ১. GET /api/student/routine -> শিক্ষার্থীদের জন্য রুটিন ডাটা ফেচ করা
        app.get('/api/student/routine', async (req, res) => {
            try {
                const { studentId, class: reqClass, academyType, section } = req.query;

                let studentClass = reqClass;
                let studentAcademyType = academyType;
                let studentSection = section;

                // যদি studentId দিয়ে রিকোয়েস্ট আসে, তবে স্টুডেন্ট প্রোফাইল থেকে বিস্তারিত বের করে নেওয়া
                if (studentId) {
                    const query = ObjectId.isValid(studentId)
                        ? { $or: [{ _id: new ObjectId(studentId) }, { studentId: studentId }] }
                        : { studentId: studentId };

                    const student = (await studentsCollection.findOne(query)) || (await admissionCollection.findOne(query));

                    if (student) {
                        // স্টুডেন্টের শ্রেণি, বিভাগ এবং সেকশন সংগ্রহ
                        studentClass =
                            student.divisionAcademy?.class ||
                            student.divisionHifz?.class ||
                            student.divisionPreHifz?.class ||
                            student.class ||
                            student.className;

                        studentAcademyType = student.academyType || student.division;
                        studentSection = student.section || student.branch;
                    }
                }

                // রুটিন খোঁজার ফিল্টার কোয়েরি
                const queryFilter = {};

                // ১. যদি নির্দিষ্ট শ্রেণি থাকে, তবে routineData অ্যারের ভেতরে 'class' অথবা 'jamaat' এর সাথে ম্যাচ করানো
                if (studentClass) {
                    queryFilter['routineData'] = {
                        $elemMatch: {
                            $or: [
                                { class: studentClass },
                                { jamaat: studentClass },
                                { class: { $regex: new RegExp(`^${studentClass}$`, 'i') } }
                            ]
                        }
                    };
                }

                // ২. বিভাগ (Academy Type) ফিল্টার (যদি থাকে)
                if (studentAcademyType) {
                    queryFilter.$or = [
                        { academyType: studentAcademyType },
                        { academyType: { $exists: false } }, // সকল বিভাগের জন্য উন্মুক্ত রুটিন
                        { academyType: "" }
                    ];
                }

                // ৩. সেকশন/শাখা ফিল্টার (যদি থাকে)
                if (studentSection) {
                    const sectionFilter = [
                        { section: studentSection },
                        { section: { $exists: false } },
                        { section: "" }
                    ];

                    if (queryFilter.$or) {
                        queryFilter.$and = [
                            { $or: queryFilter.$or },
                            { $or: sectionFilter }
                        ];
                        delete queryFilter.$or;
                    } else {
                        queryFilter.$or = sectionFilter;
                    }
                }

                // ডাটাবেজ থেকে রুটিন ফেচ করা (সর্বশেষ রুটিন আগে দেখাবে)
                const routines = await examsCollection.find(queryFilter).sort({ _id: -1 }).toArray();

                // যদি স্টুডেন্ট ক্লাসের ফিল্টার থাকে, তবে শুধু ঐ স্টুডেন্টের ক্লাসের ডাটা রেখে রেসপন্স ফিল্টার করা (Optional Client Optimization)
                const formattedRoutines = routines.map((routine) => {
                    if (!studentClass || !routine.routineData) return routine;

                    // শুধু মাত্র উক্ত শিক্ষার্থীর জামাত/ক্লাসের সারিটুকু ফিল্টার করে পাঠানো
                    const studentClassData = routine.routineData.filter(
                        (item) =>
                            item.class?.toLowerCase() === studentClass.toLowerCase() ||
                            item.jamaat?.toLowerCase() === studentClass.toLowerCase()
                    );

                    return {
                        ...routine,
                        routineData: studentClassData.length > 0 ? studentClassData : routine.routineData
                    };
                });

                res.status(200).json({
                    success: true,
                    data: formattedRoutines
                });
            } catch (error) {
                console.error("Routine fetch error:", error);
                res.status(500).json({
                    success: false,
                    message: "রুটিন লোড করতে সমস্যা হয়েছে।"
                });
            }
        });

        // ২. GET /api/student/fees -> ফি এর তথ্য আনা
        app.get('/api/student/fees', async (req, res) => {
            try {
                const { studentId } = req.query;
                if (!studentId) {
                    return res.status(400).json({ success: false, message: "স্টুডেন্ট আইডি প্রয়োজন।" });
                }

                const query = { $or: [{ studentId: studentId }, { studentId: String(studentId) }] };
                if (ObjectId.isValid(studentId)) {
                    query.$or.push({ _id: new ObjectId(studentId) });
                }

                const feeRecord = await feesCollection.findOne(query);
                if (feeRecord) {
                    res.status(200).json({ success: true, data: feeRecord });
                } else {
                    res.status(200).json({
                        success: true,
                        data: {
                            studentId,
                            status: 'UNPAID',
                            amount: 1500,
                            message: "কোনো পেমেন্ট রেকর্ড খুঁজে পাওয়া যায়নি।"
                        }
                    });
                }
            } catch (error) {
                console.error("Fees fetch error:", error);
                res.status(500).json({ success: false, message: "ফি এর তথ্য লোড করতে সমস্যা হয়েছে।" });
            }
        });

        // ৩. POST /api/student/pay-fee -> ফি পেমেন্ট করা (সিমুলেশন)
        app.post('/api/student/pay-fee', async (req, res) => {
            try {
                const { studentId, paymentMethod } = req.body;
                if (!studentId) {
                    return res.status(400).json({ success: false, message: "স্টুডেন্ট আইডি প্রয়োজন।" });
                }

                const query = { $or: [{ studentId: studentId }, { studentId: String(studentId) }] };
                if (ObjectId.isValid(studentId)) {
                    query.$or.push({ _id: new ObjectId(studentId) });
                }

                const transactionId = "TXN" + Math.random().toString(36).substring(2, 11).toUpperCase();

                await feesCollection.updateOne(
                    query,
                    {
                        $set: {
                            status: 'PAID',
                            transactionId,
                            paymentMethod: paymentMethod || 'bKash',
                            paidAt: new Date()
                        }
                    },
                    { upsert: true }
                );

                res.status(200).json({
                    success: true,
                    message: "ফি সফলভাবে পরিশোধ করা হয়েছে।",
                    transactionId
                });
            } catch (error) {
                console.error("Pay fee error:", error);
                res.status(500).json({ success: false, message: "ফি পরিশোধ করতে সমস্যা হয়েছে।" });
            }
        });

        // ৪. GET /api/student/seat-plan -> সীট প্ল্যান আনা
        app.get('/api/student/seat-plan', async (req, res) => {
            try {
                const { studentId } = req.query;
                if (!studentId) {
                    return res.status(400).json({ success: false, message: "স্টুডেন্ট আইডি প্রয়োজন।" });
                }

                const query = { $or: [{ studentId: studentId }, { studentId: String(studentId) }] };
                if (ObjectId.isValid(studentId)) {
                    query.$or.push({ _id: new ObjectId(studentId) });
                }
                const seatPlan = await seatPlansCollection.findOne(query);

                res.status(200).json({ success: true, data: seatPlan });
            } catch (error) {
                console.error("Seat plan fetch error:", error);
                res.status(500).json({ success: false, message: "সীট প্ল্যান লোড করতে সমস্যা হয়েছে।" });
            }
        });

        // ৫. GET /api/student/admit-card -> প্রবেশপত্র অনুমোদন চেক ও ডাটা প্রদান
        app.get('/api/student/admit-card', async (req, res) => {
            try {
                const { studentId } = req.query;
                if (!studentId) {
                    return res.status(400).json({ success: false, message: "স্টুডেন্ট আইডি প্রয়োজন।" });
                }

                const studentQuery = ObjectId.isValid(studentId)
                    ? { $or: [{ _id: new ObjectId(studentId) }, { studentId: studentId }] }
                    : { studentId: studentId };
                const studentData = await studentsCollection.findOne(studentQuery) || await admissionCollection.findOne(studentQuery);

                if (!studentData) {
                    return res.status(404).json({ success: false, message: "শিক্ষার্থী খুঁজে পাওয়া যায়নি।" });
                }

                const targetStudentId = studentData.studentId || String(studentData._id);

                const feeQuery = { $or: [{ studentId: targetStudentId }, { studentId: String(targetStudentId) }] };
                if (ObjectId.isValid(studentId)) {
                    feeQuery.$or.push({ _id: new ObjectId(studentId) });
                }
                const feeRecord = await feesCollection.findOne(feeQuery);
                const isPaid = feeRecord?.status === 'PAID';

                const studentClass = studentData.divisionAcademy?.class || studentData.divisionHifz?.class || studentData.divisionPreHifz?.class || studentData.class || studentData.className || "N/A";
                const studentBatch = studentData.batch || studentData.sessionYear || "২০২৬-২০২৭";

                const examRecord = await examsCollection.findOne({
                    $or: [
                        { class: studentClass },
                        { className: studentClass },
                        { batch: studentBatch },
                        { sessionYear: studentBatch }
                    ],
                    isAdmitPublished: true
                }) || await examsCollection.findOne({ isAdmitPublished: true });

                const isAdmitPublished = examRecord ? (examRecord.isAdmitPublished === true) : false;

                const formattedStudent = {
                    studentId: targetStudentId,
                    studentNameBangla: studentData.studentNameBangla || studentData.studentName || studentData.name || "N/A",
                    studentNameEnglish: studentData.studentNameEnglish || studentData.name || "N/A",
                    fatherNameBangla: studentData.fatherNameBangla || studentData.fatherName || "N/A",
                    roll: studentData.officeUse?.rollNumber || studentData.roll || "N/A",
                    class: studentClass,
                    sessionYear: studentBatch,
                    photoUrl: studentData.photoUrl || "",
                    hallNo: studentData.hallNo || "১০২",
                    seatNo: studentData.seatNo || "১২",
                    currentAddress: studentData.currentAddress || studentData.presentAddress || {},
                    permanentAddress: studentData.permanentAddress || {}
                };

                // Add seat plan details to formattedStudent if available
                const seatPlan = await seatPlansCollection.findOne({ $or: [{ studentId: targetStudentId }, { studentId: String(targetStudentId) }] });
                if (seatPlan) {
                    formattedStudent.hallNo = seatPlan.room || formattedStudent.hallNo;
                    formattedStudent.seatNo = seatPlan.seatNo || formattedStudent.seatNo;
                    formattedStudent.building = seatPlan.building || "প্রধান ভবন";
                    formattedStudent.roll = seatPlan.roll || formattedStudent.roll;
                }

                res.status(200).json({
                    success: true,
                    isPaid,
                    isAdmitPublished,
                    studentData: formattedStudent
                });
            } catch (error) {
                console.error("Admit card condition check error:", error);
                res.status(500).json({ success: false, message: "প্রবেশপত্র পরীক্ষা করতে সমস্যা হয়েছে।" });
            }
        });

        // ৬. GET /api/student/info -> স্টুডেন্ট তথ্য খোঁজা (ইমেইল বা আইডি দিয়ে)
        app.get('/api/student/info', async (req, res) => {
            try {
                const { email, studentId } = req.query;
                let query = {};
                if (studentId) {
                    query = ObjectId.isValid(studentId)
                        ? { $or: [{ _id: new ObjectId(studentId) }, { studentId: studentId }] }
                        : { studentId: studentId };
                } else if (email) {
                    query = {
                        $or: [
                            { email: email },
                            { "officeUse.email": email },
                            { studentEmail: email },
                            { "studentEmail": email },
                            { "fatherInfo.email": email }
                        ]
                    };
                } else {
                    return res.status(400).json({ success: false, message: "ইমেইল বা স্টুডেন্ট আইডি প্রয়োজন।" });
                }

                const student = await studentsCollection.findOne(query) || await admissionCollection.findOne(query);
                if (student) {
                    res.status(200).json({ success: true, data: student });
                } else {
                    res.status(404).json({ success: false, message: "শিক্ষার্থী খুঁজে পাওয়া যায়নি।" });
                }
            } catch (error) {
                console.error("Student info error:", error);
                res.status(500).json({ success: false, message: "সার্ভারে সমস্যা হয়েছে।" });
            }
        });

        // মূল রুট
        app.get('/', (req, res) => {
            res.send('As-Salam Ideal Madrasah  (AIM) Server is Running!');
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
