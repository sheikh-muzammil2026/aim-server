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
        strict: false,
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
        const examsCollection = database.collection("exams");
        const feesCollection = database.collection("fees");
        const routinesCollection = database.collection("routine")
        const seatPlansCollection = database.collection("seat_plan")
        const financeIncomesCollection = database.collection("finance_incomes");
        const financeExpensesCollection = database.collection("finance_expenses");
        const teachersCollection = database.collection("teachers")


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

        // ==========================================
        // ৫. মার্কস ও রিজাল্ট সংক্রান্ত APIs
        // ==========================================


        /**
     * নির্দিষ্ট ক্লাস এবং স্ট্যাটাস অনুযায়ী শিক্ষার্থীদের তালিকা নিয়ে আসার API
     * Endpoint: GET /api/students?class=প্লে&status=approved
     */
        app.get('/api/students', async (req, res) => {
            try {
                const {
                    class: className,
                    status,
                    search,
                    sessionYear,
                    division,
                    academyType,
                    type,
                    feeCategory,
                    page,
                    limit
                } = req.query;

                // ১. ডায়নামিক ফিল্টার অবজেক্ট
                const andClauses = [];

                if (status) {
                    andClauses.push({ status: { $regex: new RegExp(`^${status}$`, 'i') } });
                }

                if (sessionYear && sessionYear !== "all") {
                    andClauses.push({ sessionYear: sessionYear });
                }

                if (division && division !== "all") {
                    if (division === "preHifz") {
                        andClauses.push({ "divisionPreHifz.active": true });
                    } else if (division === "hifz") {
                        andClauses.push({ "divisionHifz.active": true });
                    } else if (division === "academy") {
                        andClauses.push({ "divisionAcademy.active": true });
                    }
                }

                if (academyType && academyType !== "all") {
                    andClauses.push({ "divisionAcademy.active": true, "divisionAcademy.academyType": academyType });
                }

                if (className && className !== "all" && className) {
                    andClauses.push({
                        $or: [
                            { "divisionAcademy.class": className },
                            { "divisionHifz.class": className },
                            { "divisionPreHifz.class": className }
                        ]
                    });
                }

                if (type && type !== "all") {
                    andClauses.push({
                        $or: [
                            { "divisionPreHifz.active": true, "divisionPreHifz.type": type },
                            { "divisionHifz.active": true, "divisionHifz.type": type },
                            { "divisionAcademy.active": true, "divisionAcademy.type": type }
                        ]
                    });
                }

                if (feeCategory && feeCategory !== "all") {
                    andClauses.push({ "officeUse.feeCategory": feeCategory });
                }

                if (search) {
                    const searchRegex = { $regex: search, $options: "i" };
                    andClauses.push({
                        $or: [
                            { studentNameBangla: searchRegex },
                            { studentNameEnglish: searchRegex },
                            { "officeUse.rollNumber": searchRegex },
                            { studentId: searchRegex }
                        ]
                    });
                }

                const filter = andClauses.length > 0 ? { $and: andClauses } : {};

                // ২. ডাটাবেজ থেকে ডাটা খোঁজা এবং রোল নম্বর অনুযায়ী সর্টিং
                let queryCursor = studentsCollection
                    .find(filter)
                    .sort({ "officeUse.rollNumber": 1, studentId: 1 }); // রোল না থাকলে studentId দিয়ে সর্ট করবে

                let total = 0;
                let totalPages = 1;
                let currentPage = 1;

                if (page !== undefined) {
                    currentPage = parseInt(page) || 1;
                    const limitNumber = Math.min(parseInt(limit) || 10, 10);
                    const skip = (currentPage - 1) * limitNumber;

                    total = await studentsCollection.countDocuments(filter);
                    totalPages = Math.ceil(total / limitNumber);

                    queryCursor = queryCursor.skip(skip).limit(limitNumber);
                }

                const students = await queryCursor.toArray();

                // ৩. ফ্রন্টএন্ডের প্রত্যাশিত ফরম্যাটে রেসপন্স পাঠানো
                res.status(200).json({
                    success: true,
                    count: students.length,
                    total: page !== undefined ? total : students.length,
                    totalPages: page !== undefined ? totalPages : 1,
                    currentPage: page !== undefined ? currentPage : 1,
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




        // ==========================================
        // এডমিট কার্ড সংক্রান্ত APIs
        // ==========================================

        app.get('/api/admit-cards/exams', async (req, res) => {
            try {
                const examTitles = await routinesCollection.distinct("examTitle");
                res.status(200).json({
                    success: true,
                    data: examTitles.filter(Boolean)
                });
            } catch (error) {
                console.error("Fetch Exam Titles Error:", error);
                res.status(500).json({
                    success: false,
                    message: "পরীক্ষার তালিকা লোড করা যায়নি।"
                });
            }
        });

        app.get('/api/admit-cards', async (req, res) => {
            try {
                const { studentIds, examName } = req.query;

                if (!examName) {
                    return res.status(400).json({
                        success: false,
                        message: "examName প্রয়োজন।"
                    });
                }

                let ids = [];
                if (studentIds) {
                    ids = studentIds.split(',').map(id => id.trim()).filter(Boolean);
                }

                if (ids.length === 0) {
                    return res.status(200).json({
                        success: true,
                        data: []
                    });
                }

                // ১. স্টুডেন্টদের তথ্য খোঁজা
                const objectIds = ids.map(id => {
                    try {
                        return new ObjectId(id);
                    } catch (e) {
                        return null;
                    }
                }).filter(Boolean);

                const students = await studentsCollection.find({
                    $or: [
                        { _id: { $in: objectIds } },
                        { studentId: { $in: ids } }
                    ]
                }).toArray();

                // ২. রুটিন খোঁজা
                const routines = await routinesCollection.find({ examTitle: examName }).toArray();

                // ৩. সিট প্ল্যান খোঁজা
                const studentIdCodes = students.map(s => s.studentId).filter(Boolean);
                const studentMongoIds = students.map(s => s._id.toString());
                const seatPlans = await seatPlansCollection.find({
                    $or: [
                        { studentId: { $in: studentIdCodes } },
                        { studentId: { $in: studentMongoIds } }
                    ]
                }).toArray();

                // ৪. এডমিট কার্ড সেটিংস খোঁজা (ডাটাবেস থেকে ডায়নামিকলি লোড করা)
                let admitCardSettings = await settingsCollection.findOne({ type: "admit_card_settings" });
                if (!admitCardSettings) {
                    admitCardSettings = {
                        type: "admit_card_settings",
                        examCenter: "আল-ইসলাহ একাডেমী হবিগঞ্জ",
                        instructions: [
                            "পরীক্ষা শুরু হওয়ার ২০ মিনিট পূর্বে পরীক্ষা কক্ষে প্রবেশ করে নিজ আসনে বসতে হবে",
                            "এডমিট কার্ড, আইডি কার্ড সাথে নিয়ে আসতে হবে",
                            "মাদরাসার ড্রেস পরে আসতে হবে",
                            "কলম/পেন্সিল, রাবারসহ প্রয়োজনীয় জিনিস সাথে আনতে হবে"
                        ],
                        signatures: {
                            principal: "/principle's_signature.jpg",
                            controller: "/principle's_signature.jpg"
                        }
                    };
                    await settingsCollection.insertOne(admitCardSettings);
                }

                // ৫. প্রত্যেক স্টুডেন্টের জন্য এডমিট কার্ডের ডাটা সাজানো
                const admitCards = students.map(student => {
                    // স্টুডেন্টের একটিভ বিভাগ ও শ্রেণি বের করা
                    let divisionKey = "none";
                    let divisionName = "অন্যান্য";
                    let className = "N/A";
                    let academyType = "";

                    if (student.divisionPreHifz?.active) {
                        divisionKey = "preHifz";
                        divisionName = "প্রি-হিফজ";
                        className = student.divisionPreHifz.class || "N/A";
                    } else if (student.divisionHifz?.active) {
                        divisionKey = "hifz";
                        divisionName = "হিফজ";
                        className = student.divisionHifz.class || "N/A";
                    } else if (student.divisionAcademy?.active) {
                        divisionKey = "academy";
                        divisionName = "একাডেমিক";
                        className = student.divisionAcademy.class || "N/A";
                        academyType = student.divisionAcademy.academyType || "";
                    } else {
                        className = student.officeUse?.recommendedClass || "N/A";
                    }

                    // সংশ্লিষ্ট রুটিন খোঁজা (বিভাগ অনুযায়ী বা generic)
                    const routine = routines.find(r =>
                        r.division === divisionKey || r.division === "all"
                    ) || routines[0];

                    let routineList = [];
                    if (routine && Array.isArray(routine.dates) && Array.isArray(routine.routineData)) {
                        const classRoutine = routine.routineData.find(r =>
                            r.class === className || r.class?.toLowerCase() === className?.toLowerCase()
                        );

                        if (classRoutine && classRoutine.subjects) {
                            routineList = routine.dates.map(d => {
                                const subject = classRoutine.subjects[d.id];
                                return {
                                    date: d.gregorian,
                                    day: d.day,
                                    subject: subject || ""
                                };
                            }).filter(row => row.subject && row.subject.trim() !== "" && row.subject !== "—");
                        }
                    }

                    // সিট প্ল্যান খোঁজা
                    const seatPlan = seatPlans.find(sp =>
                        sp.studentId === student.studentId || sp.studentId === student._id.toString()
                    );

                    return {
                        _id: student._id,
                        studentId: student.studentId,
                        roll: student.officeUse?.rollNumber || student.roll || seatPlan?.roll || "N/A",
                        studentNameBangla: student.studentNameBangla || student.studentNameEnglish || "N/A",
                        studentNameEnglish: student.studentNameEnglish || "N/A",
                        fatherNameBangla: student.fatherNameBangla || student.fatherNameEnglish || "N/A",
                        fatherNameEnglish: student.fatherNameEnglish || "N/A",
                        studentImage: student.studentImage || student.photoUrl || "",
                        photoUrl: student.photoUrl || student.studentImage || "",
                        sessionYear: student.sessionYear || "২০২৬",
                        divisionName,
                        divisionKey,
                        className,
                        academyType,
                        upazila: student.currentAddress?.thana || student.permanentAddress?.thana || "হবিগঞ্জ সদর",
                        district: student.currentAddress?.district || student.permanentAddress?.district || "হবিগঞ্জ",
                        hallNo: seatPlan?.room || seatPlan?.building || student.seatPlan?.hallNo || student.hallNo || "১",
                        seatNo: seatPlan?.seatNo || student.seatPlan?.seatNo || student.seatNo || "১",
                        examName,
                        examTime: routine?.note || "সকাল ৯:০০ টা হইতে দুপুর ১২:০০ টা পর্যন্ত",
                        examCenter: admitCardSettings.examCenter,
                        routine: routineList.length > 0 ? routineList : null,
                        instructions: admitCardSettings.instructions,
                        signatures: admitCardSettings.signatures
                    };
                });

                res.status(200).json({
                    success: true,
                    count: admitCards.length,
                    data: admitCards
                });

            } catch (error) {
                console.error("Fetch Admit Cards Error:", error);
                res.status(500).json({
                    success: false,
                    message: "সার্ভারে এডমিট কার্ডের তথ্য প্রস্তুত করতে সমস্যা হয়েছে।",
                    error: error.message
                });
            }
        });

        app.get('/api/admit-cards/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const { examName } = req.query;

                if (!examName) {
                    return res.status(400).json({
                        success: false,
                        message: "examName প্রয়োজন।"
                    });
                }

                let student;
                try {
                    student = await studentsCollection.findOne({ _id: new ObjectId(id) });
                } catch (e) {
                    // ignore and try studentId
                }

                if (!student) {
                    student = await studentsCollection.findOne({ studentId: id });
                }

                if (!student) {
                    return res.status(404).json({
                        success: false,
                        message: "শিক্ষার্থী পাওয়া যায়নি।"
                    });
                }

                const routines = await routinesCollection.find({ examTitle: examName }).toArray();

                const seatPlan = await seatPlansCollection.findOne({
                    $or: [
                        { studentId: student.studentId },
                        { studentId: student._id.toString() }
                    ]
                });

                let admitCardSettings = await settingsCollection.findOne({ type: "admit_card_settings" });
                if (!admitCardSettings) {
                    admitCardSettings = {
                        type: "admit_card_settings",
                        examCenter: "আল-সালাম আইডিয়াল মাদরাসাহ, হবিগঞ্জ",
                        instructions: [
                            "পরীক্ষা শুরু হওয়ার ২০ মিনিট পূর্বে পরীক্ষা কক্ষে প্রবেশ করে নিজ আসনে বসতে হবে",
                            "এডমিট কার্ড, আইডি কার্ড সাথে নিয়ে আসতে হবে",
                            "মাদরাসার ড্রেস পরে আসতে হবে",
                            "কলম/পেন্স일, রাবারসহ প্রয়োজনীয় জিনিস সাথে আনতে হবে"
                        ],
                        signatures: {
                            principal: "/principle's_signature.jpg",
                            controller: "/principle's_signature.jpg"
                        }
                    };
                    await settingsCollection.insertOne(admitCardSettings);
                }

                let divisionKey = "none";
                let divisionName = "অন্যান্য";
                let className = "N/A";
                let academyType = "";

                if (student.divisionPreHifz?.active) {
                    divisionKey = "preHifz";
                    divisionName = "প্রি-হিফজ";
                    className = student.divisionPreHifz.class || "N/A";
                } else if (student.divisionHifz?.active) {
                    divisionKey = "hifz";
                    divisionName = "হিফজ";
                    className = student.divisionHifz.class || "N/A";
                } else if (student.divisionAcademy?.active) {
                    divisionKey = "academy";
                    divisionName = "একাডেমিক";
                    className = student.divisionAcademy.class || "N/A";
                    academyType = student.divisionAcademy.academyType || "";
                } else {
                    className = student.officeUse?.recommendedClass || "N/A";
                }

                const routine = routines.find(r =>
                    r.division === divisionKey || r.division === "all"
                ) || routines[0];

                let routineList = [];
                if (routine && Array.isArray(routine.dates) && Array.isArray(routine.routineData)) {
                    const classRoutine = routine.routineData.find(r =>
                        r.class === className || r.class?.toLowerCase() === className?.toLowerCase()
                    );

                    if (classRoutine && classRoutine.subjects) {
                        routineList = routine.dates.map(d => {
                            const subject = classRoutine.subjects[d.id];
                            return {
                                date: d.gregorian,
                                day: d.day,
                                subject: subject || ""
                            };
                        }).filter(row => row.subject && row.subject.trim() !== "" && row.subject !== "—");
                    }
                }

                const admitCard = {
                    _id: student._id,
                    studentId: student.studentId,
                    roll: student.officeUse?.rollNumber || student.roll || seatPlan?.roll || "N/A",
                    studentNameBangla: student.studentNameBangla || student.studentNameEnglish || "N/A",
                    studentNameEnglish: student.studentNameEnglish || "N/A",
                    fatherNameBangla: student.fatherNameBangla || student.fatherNameEnglish || "N/A",
                    fatherNameEnglish: student.fatherNameEnglish || "N/A",
                    studentImage: student.studentImage || student.photoUrl || "",
                    photoUrl: student.photoUrl || student.studentImage || "",
                    sessionYear: student.sessionYear || "২০২৬",
                    divisionName,
                    divisionKey,
                    className,
                    academyType,
                    upazila: student.currentAddress?.thana || student.permanentAddress?.thana || "হবিগঞ্জ সদর",
                    district: student.currentAddress?.district || student.permanentAddress?.district || "হবিগঞ্জ",
                    hallNo: seatPlan?.room || seatPlan?.building || student.seatPlan?.hallNo || student.hallNo || "১",
                    seatNo: seatPlan?.seatNo || student.seatPlan?.seatNo || student.seatNo || "১",
                    examName,
                    examTime: routine?.note || "সকাল ৯:০০ টা হইতে দুপুর ১২:০০ টা পর্যন্ত",
                    examCenter: admitCardSettings.examCenter,
                    routine: routineList.length > 0 ? routineList : null,
                    instructions: admitCardSettings.instructions,
                    signatures: admitCardSettings.signatures
                };

                res.status(200).json({
                    success: true,
                    data: admitCard
                });

            } catch (error) {
                console.error("Fetch Single Admit Card Error:", error);
                res.status(500).json({
                    success: false,
                    message: "সার্ভারে এডমিট কার্ডের তথ্য প্রস্তুত করতে সমস্যা হয়েছে।",
                    error: error.message
                });
            }
        });

        app.patch('/api/students/:id/seat-plan', async (req, res) => {
            try {
                const { id } = req.params;
                const { hallNo, seatNo } = req.body;

                let filter;
                try {
                    filter = { _id: new ObjectId(id) };
                } catch (e) {
                    filter = { studentId: id };
                }

                const updateDoc = {
                    $set: {
                        "seatPlan.hallNo": hallNo,
                        "seatPlan.seatNo": seatNo,
                        "hallNo": hallNo,
                        "seatNo": seatNo,
                        updatedAt: new Date()
                    }
                };

                const result = await studentsCollection.updateOne(filter, updateDoc);

                if (result.matchedCount === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "শিক্ষার্থী পাওয়া যায়নি।"
                    });
                }

                res.status(200).json({
                    success: true,
                    message: "সিট প্ল্যান সফলভাবে আপডেট করা হয়েছে।"
                });
            } catch (error) {
                console.error("Update Seat Plan Error:", error);
                res.status(500).json({
                    success: false,
                    message: "সার্ভারে সিট প্ল্যান আপডেট করতে সমস্যা হয়েছে।"
                });
            }
        });




        /**
         * ২. নির্দিষ্ট শ্রেণি ও বিষয়ের ইনপুট করা মার্কস চেক/লোড করার API (সহজ ও কার্যকরী)
         * Endpoint: GET /api/marks/get
         * Query Params: ?class=...&subject=...&year=...
         */
        app.get('/api/marks/get', async (req, res) => {
            try {
                const { class: studentClass, subject, year } = req.query;

                if (!studentClass || !subject) {
                    return res.status(400).json({
                        success: false,
                        message: "শ্রেণি (Class) এবং বিষয় (Subject) প্রয়োজনীয়।"
                    });
                }

                const query = {
                    class: studentClass,
                    subject: subject,
                    year: year || "২০২৬-২০২৭"
                };

                const marks = await marksCollection.find(query).toArray();

                res.status(200).json({
                    success: true,
                    data: marks
                });
            } catch (error) {
                console.error("Get Marks Error:", error);
                res.status(500).json({
                    success: false,
                    message: "মার্কস লোড করতে সার্ভারে সমস্যা হয়েছে।"
                });
            }
        });

        /**
         * ৩. নির্দিষ্ট ক্লাসের সকল শিক্ষার্থীর রেজাল্ট / মেরিট লিস্ট দেখার API
         * Endpoint: GET /api/results/class
         * Query Params: ?class=...&year=...
         */
        app.get('/api/results/class', async (req, res) => {
            try {
                const { class: className, year } = req.query;

                if (!className) {
                    return res.status(400).json({
                        success: false,
                        message: "শ্রেণি (Class) প্রয়োজনীয়।"
                    });
                }

                const targetYear = year || "২০২৬-২০২৭";

                // ১. ডায়নামিক ফিল্টার অবজেক্ট দিয়ে ওই ক্লাসের Approved শিক্ষার্থীদের খুঁজে বের করা
                const studentQuery = {
                    $or: [
                        { "divisionAcademy.class": className },
                        { "divisionHifz.class": className },
                        { "divisionPreHifz.class": className }
                    ],
                    status: { $regex: /^approved$/i }
                };

                const students = await studentsCollection.find(studentQuery).toArray();

                // ২. marksCollection থেকে ওই ক্লাসের ও সেশনের সকল শিক্ষার্থীর মার্কস নিয়ে আসা
                const marksList = await marksCollection.find({
                    class: className,
                    year: targetYear
                }).toArray();

                // studentId দিয়ে মার্কস গ্রুপ করা
                const marksByStudent = {};
                marksList.forEach(mark => {
                    const sId = String(mark.studentId);
                    if (!marksByStudent[sId]) {
                        marksByStudent[sId] = [];
                    }
                    marksByStudent[sId].push(mark);
                });

                // ৩. শিক্ষার্থীদের লিস্ট ও মার্কস মার্জ করে মেরিট শিট তৈরি করা
                const results = students.map(student => {
                    const sId = String(student.studentId);
                    const studentMarks = marksByStudent[sId] || [];

                    const allSubjects = studentMarks.map(item => ({
                        subject: item.subject,
                        term1: item.term1 || {},
                        term2: item.term2 || {},
                        annual: item.annual || {}
                    }));

                    return {
                        studentId: sId,
                        studentName: student.studentNameBangla || student.studentNameEnglish || student.studentName || 'N/A',
                        rollNumber: student.officeUse?.rollNumber || student.rollNumber || 'N/A',
                        allSubjects: allSubjects
                    };
                });

                // রোল নম্বর অনুযায়ী সর্ট করা
                results.sort((a, b) => {
                    const rollA = parseInt(a.rollNumber) || Infinity;
                    const rollB = parseInt(b.rollNumber) || Infinity;
                    return rollA - rollB;
                });

                res.status(200).json({
                    success: true,
                    data: results
                });

            } catch (error) {
                console.error("Get Class Results Error:", error);
                res.status(500).json({
                    success: false,
                    message: "শ্রেণিভিত্তিক ফলাফল লোড করতে সার্ভারে সমস্যা হয়েছে।"
                });
            }
        });

        /**
         * ৪. নির্দিষ্ট শিক্ষার্থীর রেজাল্ট / মার্কশিট দেখার API
         * Endpoint: GET /api/results/student/:studentId
         * Query Params: ?year=...
         */
        app.get('/api/results/student/:studentId', async (req, res) => {
            try {
                const { studentId } = req.params;
                const { year } = req.query;

                const targetYear = year || "২০২৬-২০২৭";

                // studentId দিয়ে শিক্ষার্থী খোঁজা
                let student = await studentsCollection.findOne({ studentId: String(studentId) });

                // যদি studentsCollection-এ না থাকে, তবে admissions-এ approved স্ট্যাটাসসহ খোঁজা
                if (!student) {
                    student = await admissionCollection.findOne({
                        studentId: String(studentId),
                        status: { $regex: /^approved$/i }
                    });
                }

                if (!student) {
                    return res.status(404).json({
                        success: false,
                        message: "শিক্ষার্থীর কোনো তথ্য পাওয়া যায়নি।"
                    });
                }

                // marksCollection থেকে মার্কস নিয়ে আসা
                const marksList = await marksCollection.find({
                    studentId: String(studentId),
                    year: targetYear
                }).toArray();

                const results = marksList.map(item => ({
                    subject: item.subject,
                    term1: item.term1 || {},
                    term2: item.term2 || {},
                    annual: item.annual || {}
                }));

                const getStudentClass = (s) => {
                    if (s.divisionAcademy?.active) return s.divisionAcademy.class;
                    if (s.divisionHifz?.active) return s.divisionHifz.class;
                    if (s.divisionPreHifz?.active) return s.divisionPreHifz.class;
                    return s.class || "N/A";
                };

                res.status(200).json({
                    success: true,
                    year: targetYear,
                    student: {
                        name: student.studentNameBangla || student.studentNameEnglish || student.studentName || 'N/A',
                        studentId: student.studentId,
                        class: getStudentClass(student),
                        roll: student.officeUse?.rollNumber || student.rollNumber || 'N/A'
                    },
                    results: results
                });

            } catch (error) {
                console.error("Get Student Results Error:", error);
                res.status(500).json({
                    success: false,
                    message: "শিক্ষার্থীর ফলাফল লোড করতে সার্ভারে সমস্যা হয়েছে।"
                });
            }
        });

        /**
         * ৫. টিচার প্যানেল থেকে শিক্ষার্থীদের মার্ক ইনপুট বা আপডেট করার API
         * Endpoint: POST /api/marks/input
         */
        app.post('/api/marks/input', async (req, res) => {
            try {
                const { class: studentClass, subject, examType, year, marksData } = req.body;

                if (!studentClass || !subject || !examType || !Array.isArray(marksData) || marksData.length === 0) {
                    return res.status(400).json({
                        success: false,
                        message: "প্রয়োজনীয় তথ্য (Class, Subject, Exam Type এবং Marks Data) সঠিকভাবে দেওয়া হয়নি।"
                    });
                }

                const academicYear = year || "২০২৬-২০২৭";

                const operations = marksData.map((student) => {
                    const { studentId, studentName, rollNumber, ctMark, examMark } = student;

                    const filter = {
                        studentId: String(studentId),
                        class: studentClass,
                        subject: subject,
                        year: academicYear
                    };

                    // ফাঁকা স্ট্রিং থাকলে null সেট হবে, সংখ্যা হলে Float হবে
                    const ctVal = ctMark !== "" && ctMark !== null && !isNaN(ctMark) ? parseFloat(ctMark) : null;
                    const examVal = examMark !== "" && examMark !== null && !isNaN(examMark) ? parseFloat(examMark) : null;

                    const updateField = {};
                    updateField[`${examType}.ct`] = ctVal;
                    updateField[`${examType}.exam`] = examVal;

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

                const result = await marksCollection.bulkWrite(operations);

                res.status(200).json({
                    success: true,
                    message: "সকল শিক্ষার্থীর মার্কস সফলভাবে সংরক্ষণ ও আপডেট করা হয়েছে।",
                    data: result
                });

            } catch (error) {
                console.error("Save Marks Error:", error);
                res.status(500).json({
                    success: false,
                    message: "মার্কস সংরক্ষণ করতে সার্ভারে সমস্যা হয়েছে।"
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

                // Sync back to admissionCollection if studentId exists
                const updatedStudent = await studentsCollection.findOne(filter);
                if (updatedStudent && updatedStudent.studentId) {
                    const admissionFilter = { studentId: updatedStudent.studentId };
                    const admissionDoc = { ...updatedStudent };
                    delete admissionDoc._id; // Ensure we don't try to change original _id

                    await admissionCollection.updateOne(
                        admissionFilter,
                        { $set: admissionDoc }
                    );
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

                    if (status === 'Approved') {
                        // Copy/update in studentsCollection
                        const studentFilter = { studentId: updatedStudent.studentId };
                        const studentDoc = { ...updatedStudent };
                        delete studentDoc._id; // Ensure we don't duplicate/change original _id

                        await studentsCollection.updateOne(
                            studentFilter,
                            { $set: studentDoc },
                            { upsert: true }
                        );
                    } else {
                        // If updated to a non-Approved status, remove from studentsCollection
                        if (updatedStudent.studentId) {
                            await studentsCollection.deleteOne({ studentId: updatedStudent.studentId });
                        }
                    }

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
                    if (student.studentId) {
                        await studentsCollection.deleteOne({ studentId: student.studentId });
                    }
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
                    // Sync to studentsCollection if approved
                    const updatedAdmission = await admissionCollection.findOne({ _id: new ObjectId(id) });
                    if (updatedAdmission && updatedAdmission.status === 'Approved' && updatedAdmission.studentId) {
                        const studentFilter = { studentId: updatedAdmission.studentId };
                        const studentDoc = { ...updatedAdmission };
                        delete studentDoc._id; // Ensure we don't try to change original _id

                        await studentsCollection.updateOne(
                            studentFilter,
                            { $set: studentDoc },
                            { upsert: true }
                        );
                    }
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



        // ২. শিক্ষকের প্রোফাইল সেভ বা আপডেট করা (POST / Upsert)
        app.post('/api/teacher/profile', async (req, res) => {
            try {
                const {
                    email,
                    fullName,
                    designation,
                    phone,
                    address,
                    bio,
                    profileImage, // <-- নতুন ইমেজ URL ফিল্ড
                    socialLinks,
                    academic,
                    experience,
                    publications,
                    isPublicView,
                    hardSkills,
                    softSkills,
                    edTechSkills,
                    certifications,
                    awards,
                    references
                } = req.body;

                if (!email || !fullName) {
                    return res.status(400).json({
                        success: false,
                        message: "প্রয়োজনীয় তথ্য (ইমেইল ও নাম) প্রদান করুন।"
                    });
                }

                const filter = { email: email };
                const updateDoc = {
                    $set: {
                        fullName,
                        designation: designation || "",
                        phone: phone || "",
                        address: address || "",
                        bio: bio || "",
                        profileImage: profileImage || "", // <-- ইমেজ URL ডাটাবেসে সেভ হচ্ছে
                        socialLinks: socialLinks || {},
                        academic: Array.isArray(academic) ? academic : [],
                        experience: Array.isArray(experience) ? experience : [],
                        publications: Array.isArray(publications) ? publications : [],
                        hardSkills: hardSkills || "",
                        softSkills: softSkills || "",
                        edTechSkills: edTechSkills || "",
                        certifications: Array.isArray(certifications) ? certifications : [],
                        awards: Array.isArray(awards) ? awards : [],
                        references: Array.isArray(references) ? references : [],
                        isPublicView: isPublicView ?? true,
                        updatedAt: new Date()
                    },
                    $setOnInsert: {
                        createdAt: new Date()
                    }
                };

                const result = await teachersCollection.updateOne(filter, updateDoc, { upsert: true });

                res.status(200).json({
                    success: true,
                    message: "প্রোফাইল তথ্য সফলভাবে সেভ ও আপডেট করা হয়েছে।",
                    data: result
                });

            } catch (error) {
                console.error("Profile save error:", error);
                res.status(500).json({
                    success: false,
                    message: "সার্ভারে প্রোফাইল সেভ করতে সমস্যা হয়েছে।",
                    error: error.message
                });
            }
        });

        // ১. শিক্ষকের প্রোফাইল তথ্য আনা (GET)
        app.get('/api/teacher/profile/:email', async (req, res) => {
            try {
                const { email } = req.params;
                if (!email) {
                    return res.status(400).json({ success: false, message: "ইমেইল প্রয়োজন।" });
                }

                const teacher = await teachersCollection.findOne({ email });
                if (!teacher) {
                    return res.status(404).json({ success: false, message: "শিক্ষকের প্রোফাইল পাওয়া যায়নি।" });
                }

                res.status(200).json({
                    success: true,
                    data: teacher
                });
            } catch (error) {
                console.error("Fetch profile error:", error);
                res.status(500).json({ success: false, message: "সার্ভারে সমস্যা হয়েছে।", error: error.message });
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
