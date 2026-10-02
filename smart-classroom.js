const { ObjectId } = require("mongodb");

const getIdFilter = (id) => {
  if (ObjectId.isValid(id)) {
    try {
      return { $or: [{ _id: new ObjectId(id) }, { _id: String(id) }] };
    } catch {
      return { _id: String(id) };
    }
  }
  return { _id: String(id) };
};

// Seed Data for initial launch if database collections are empty
const INITIAL_LIVE_CLASSES = [
  {
    subject: "মিশকাতুল মাসাবীহ (কিতাবুল ঈমান)",
    department: "কিতাব বিভাগ",
    classGrade: "দাওরায়ে হাদিস",
    teacher: "মুফতি মাওলানা মাহমুদুল হাসান",
    time: "সকাল ৯:০০ - ১০:৩০",
    date: new Date().toISOString().split("T")[0],
    platform: "Zoom",
    link: "https://zoom.us/j/1234567890",
    meetingId: "123 456 7890",
    passcode: "AIM2026",
    isLive: true,
    status: "live",
    description: "ঈমানের গুরুত্ব ও হাকিকত সম্পর্কিত হাদিসের বিশ্লেষণ ও আলোচনা।",
    createdAt: new Date(),
  },
  {
    subject: "নাহবেমীর (আমেল ও মামুল আলোচনা)",
    department: "কিতাব বিভাগ",
    classGrade: "মিজান জামাত",
    teacher: "মাওলানা আবু বকর সিদ্দীক",
    time: "আজ দুপুর ২:০০ - ৩:১৫",
    date: new Date().toISOString().split("T")[0],
    platform: "Google Meet",
    link: "https://meet.google.com/abc-defg-hij",
    meetingId: "abc-defg-hij",
    passcode: "1234",
    isLive: false,
    status: "upcoming",
    description: "হরফে আমেলার প্রকারভেদ এবং আমলের নিয়মাবলী।",
    createdAt: new Date(),
  },
  {
    subject: "নূরানী তাজবীদুল কুরআন ও মশ্‌ক",
    department: "নূরানী বিভাগ",
    classGrade: "৩য় জামাত",
    teacher: "ক্বারী মাওলানা আব্দুর রহমান",
    time: "সন্ধ্যা ৬:০০ - ৭:১৫",
    date: new Date().toISOString().split("T")[0],
    platform: "Zoom",
    link: "https://zoom.us/j/9876543210",
    meetingId: "987 654 3210",
    passcode: "QURAN26",
    isLive: false,
    status: "upcoming",
    description: "মাখরাজ ও সিফাত ভিত্তিক বিশুদ্ধ কুরআন তিলাওয়াত মশ্‌ক।",
    createdAt: new Date(),
  },
];

const INITIAL_RECORDED_CLASSES = [
  {
    title: "হিদায়াতুন্নাহু - প্রথম পাঠ (কালেমা ও তার প্রকারভেদ)",
    subject: "নাহব ও ব্যাকরণ",
    department: "কিতাব বিভাগ",
    classGrade: "নাহবেমীর জামাত",
    teacher: "মাওলানা আবু বকর সিদ্দীক",
    duration: "২৫:১৪",
    videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    thumbnail: "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=600&auto=format&fit=crop&q=80",
    date: "১০ অক্টোবর, ২০২৬",
    views: 142,
    description: "কালেমার পরিচয়, ইসম, ফেল এবং হরফের আলামত বিস্তারিত আলোচনা।",
    createdAt: new Date(),
  },
  {
    title: "কাফিয়া - আল-ইসমু আল-মু'রাব ও গাইরে মুনসারিফ",
    subject: "আরবি সাহিত্য ও ব্যাকরণ",
    department: "কিতাব বিভাগ",
    classGrade: "কাফিয়া জামাত",
    teacher: "মুফতি মাওলানা মাহমুদুল হাসান",
    duration: "৩৫:১০",
    videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    thumbnail: "https://images.unsplash.com/photo-1532012164546-f432f2e3777f?w=600&auto=format&fit=crop&q=80",
    date: "০৮ অক্টোবর, ২০২৬",
    views: 98,
    description: "মু'রাব ইসমের এরাব এবং গাইরে মুনসারিফের ৯টি কারণ।",
    createdAt: new Date(),
  },
  {
    title: "নূরুল আনওয়ার - কিতাবুল্লাহ অধ্যায় (হুকুম ও প্রকারভেদ)",
    subject: "উসূলে ফিকহ",
    department: "কিতাব বিভাগ",
    classGrade: "জালালাইন জামাত",
    teacher: "মাওলানা সাইফুল ইসলাম",
    duration: "৪০:০৫",
    videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    thumbnail: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80",
    date: "০৫ অক্টোবর, ২০২৬",
    views: 185,
    description: "কুরআনে কারীমের নযম ও মা'নী সংক্রান্ত মূলনীতিসমূহ।",
    createdAt: new Date(),
  },
  {
    title: "হিফজুল কুরআন - হিফজ রিভিশন ও সুরের চর্চা",
    subject: "তাহফিজুল কুরআন",
    department: "হিফজ বিভাগ",
    classGrade: "হিফজ শাখা",
    teacher: "হাফেজ ক্বারী ফখরুল আলম",
    duration: "৩০:২২",
    videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    thumbnail: "https://images.unsplash.com/photo-1609599006353-e629aaabfeae?w=600&auto=format&fit=crop&q=80",
    date: "০২ অক্টোবর, ২০২৬",
    views: 220,
    description: "পারা ভিত্তিক মুখস্থ সুদৃঢ়করণ এবং তিলাওয়াতে তারতীল রক্ষা করার নিয়ম।",
    createdAt: new Date(),
  },
];

const INITIAL_EBOOKS = [
  {
    name: "সহীহ বুখারী (আরবি-বাংলা) - ১ম খণ্ড",
    category: "দরসি কিতাব",
    department: "কিতাব বিভাগ",
    classGrade: "দাওরায়ে হাদিস",
    author: "ইমাম বুখারী (রহ.)",
    type: "PDF কিতাব",
    size: "৪৫.২ MB",
    pages: 680,
    fileUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    downloads: 320,
    description: "ওহীর সূচনা এবং কিতাবুল ঈমানের পূর্ণাঙ্গ বাংলা অনুবাদ ও সংক্ষিপ্ত ব্যাখ্যা।",
    createdAt: new Date(),
  },
  {
    name: "কাফিয়া কিতাবের সহজ ও সাবলীল শরাহ",
    category: "লেকচার শিট",
    department: "কিতাব বিভাগ",
    classGrade: "কাফিয়া জামাত",
    author: "মাওলানা আবু বকর সিদ্দীক",
    type: "PDF নোট",
    size: "৪.৮ MB",
    pages: 85,
    fileUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    downloads: 145,
    description: "পরীক্ষার্থীদের সুবিধার্থে কাফিয়া কিতাবের গুরুত্বপূর্ণ তারকীব ও সহজ প্রশ্নোত্তর নোট।",
    createdAt: new Date(),
  },
  {
    name: "মিশকাতুল মাসাবীহ - দরস নোট ও তাহকীক (পর্ব ১)",
    category: "লেকচার শিট",
    department: "কিতাব বিভাগ",
    classGrade: "মেশকাত জামাত",
    author: "মুফতি মাওলানা মাহমুদুল হাসান",
    type: "PDF নোট",
    size: "৩.২ MB",
    pages: 52,
    fileUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    downloads: 210,
    description: "রাবীদের পরিচয়, সনদ যাচাই এবং হাদিসের ফিকহী বিশ্লেষণের সমন্বিত লেকচার শিট।",
    createdAt: new Date(),
  },
  {
    name: "তাজবীদ শিক্ষা ও মাখরাজ নির্দেশিকা",
    category: "সহায়ক গাইড",
    department: "নূরানী বিভাগ",
    classGrade: "সকল জামাত",
    author: "ক্বারী মাওলানা আব্দুর রহমান",
    type: "PDF গাইড",
    size: "২.১ MB",
    pages: 36,
    fileUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    downloads: 415,
    description: "বিশুদ্ধ কুরআন শিক্ষার প্রাথমিক তাজবীদ ও উচ্চারণের সচিত্র গাইড।",
    createdAt: new Date(),
  },
];

const INITIAL_EXAMS = [
  {
    title: "নাহব ও সরফ সাপ্তাহিক মূল্যায়ন পরীক্ষা",
    subject: "আরবি ব্যাকরণ",
    department: "কিতাব বিভাগ",
    classGrade: "মিজান জামাত",
    duration: "৩০ মিনিট",
    totalMarks: 50,
    passMarks: 25,
    examDate: new Date().toISOString().split("T")[0],
    startTime: "রাত ৯:০০",
    endTime: "রাত ৯:৩০",
    status: "upcoming",
    examLink: "https://forms.google.com",
    instructions: "সকল প্রশ্নের উত্তর বাধ্যতামূলক। নির্ধারিত ৩০ মিনিটের মধ্যে সাবমিট করতে হবে।",
    createdAt: new Date(),
  },
  {
    title: "হিফজুল কুরআন ১ম পর্ব - হিফজ দওর পরীক্ষা",
    subject: "তাহফিজুল কুরআন",
    department: "হিফজ বিভাগ",
    classGrade: "হিফজ শাখা",
    duration: "৪৫ মিনিট",
    totalMarks: 100,
    passMarks: 70,
    examDate: new Date().toISOString().split("T")[0],
    startTime: "সকাল ১০:০০",
    endTime: "সকাল ১০:৪৫",
    status: "active",
    examLink: "https://forms.google.com",
    instructions: "তাজবীদ ও তারতীলের সাথে মুখস্থ তিলাওয়াত শোনা হবে।",
    createdAt: new Date(),
  },
  {
    title: "উসূলে হাদিস ও মেশকাত প্রথম সাময়িক পরীক্ষা",
    subject: "হাদিস শাস্ত্র",
    department: "কিতাব বিভাগ",
    classGrade: "মেশকাত জামাত",
    duration: "৬০ মিনিট",
    totalMarks: 100,
    passMarks: 40,
    examDate: "২০২৬-১০-১৫",
    startTime: "সকাল ১০:০০",
    endTime: "সকাল ১১:০০",
    status: "upcoming",
    examLink: "https://forms.google.com",
    instructions: "কিতাবুল ঈমান ও কিতাবুল ইলমের পূর্ণাঙ্গ সিলেবাস থেকে প্রশ্ন থাকবে।",
    createdAt: new Date(),
  },
];

function smartClassroomRoutes(app, db) {
  const liveCol = db.collection("smart_live_classes");
  const recordedCol = db.collection("smart_recorded_classes");
  const ebooksCol = db.collection("smart_ebooks");
  const examsCol = db.collection("smart_exams");

  // Helper to ensure collections have initial seed data
  async function ensureSeedData() {
    try {
      const liveCount = await liveCol.countDocuments().catch(() => 0);
      if (liveCount === 0) {
        await liveCol.insertMany(INITIAL_LIVE_CLASSES).catch(() => {});
      }
      const recCount = await recordedCol.countDocuments().catch(() => 0);
      if (recCount === 0) {
        await recordedCol.insertMany(INITIAL_RECORDED_CLASSES).catch(() => {});
      }
      const ebookCount = await ebooksCol.countDocuments().catch(() => 0);
      if (ebookCount === 0) {
        await ebooksCol.insertMany(INITIAL_EBOOKS).catch(() => {});
      }
      const examCount = await examsCol.countDocuments().catch(() => 0);
      if (examCount === 0) {
        await examsCol.insertMany(INITIAL_EXAMS).catch(() => {});
      }
    } catch (e) {
      console.warn("Smart Classroom seed warning:", e.message);
    }
  }
  ensureSeedData();

  // 1. GET /api/smart-classroom/overview - Aggregated metrics & previews
  app.get("/api/smart-classroom/overview", async (req, res) => {
    try {
      await ensureSeedData();

      const [liveClasses, recordedClasses, ebooks, exams] = await Promise.all([
        liveCol.find({}).sort({ createdAt: -1 }).limit(4).toArray(),
        recordedCol.find({}).sort({ createdAt: -1 }).limit(4).toArray(),
        ebooksCol.find({}).sort({ createdAt: -1 }).limit(4).toArray(),
        examsCol.find({}).sort({ createdAt: -1 }).limit(4).toArray(),
      ]);

      const [liveCount, recordedCount, ebooksCount, examsCount] = await Promise.all([
        liveCol.countDocuments(),
        recordedCol.countDocuments(),
        ebooksCol.countDocuments(),
        examsCol.countDocuments(),
      ]);

      const ongoingLive = liveClasses.filter((c) => c.isLive || c.status === "live");

      res.json({
        success: true,
        stats: {
          liveTotal: liveCount,
          ongoingLiveCount: ongoingLive.length,
          recordedTotal: recordedCount,
          ebooksTotal: ebooksCount,
          examsTotal: examsCount,
        },
        data: {
          liveClasses,
          recordedClasses,
          ebooks,
          exams,
          activeLiveClass: ongoingLive[0] || null,
        },
      });
    } catch (error) {
      console.error("GET /api/smart-classroom/overview error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // 2. LIVE CLASSES
  app.get("/api/smart-classroom/live", async (req, res) => {
    try {
      await ensureSeedData();
      const classes = await liveCol.find({}).sort({ createdAt: -1 }).toArray();
      res.json({ success: true, data: classes });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post("/api/smart-classroom/live", async (req, res) => {
    try {
      const {
        subject,
        department = "কিতাব বিভাগ",
        classGrade = "",
        teacher = "",
        time = "",
        date = new Date().toISOString().split("T")[0],
        platform = "Zoom",
        link = "",
        meetingId = "",
        passcode = "",
        isLive = false,
        status = "upcoming",
        description = "",
      } = req.body;

      if (!subject || !link) {
        return res.status(400).json({
          success: false,
          message: "বিষয়ের নাম এবং ক্লাসের লিংক দেওয়া আবশ্যক।",
        });
      }

      const newClass = {
        subject: subject.trim(),
        department: department.trim(),
        classGrade: classGrade.trim(),
        teacher: teacher.trim(),
        time: time.trim(),
        date: date || new Date().toISOString().split("T")[0],
        platform: platform.trim(),
        link: link.trim(),
        meetingId: (meetingId || "").trim(),
        passcode: (passcode || "").trim(),
        isLive: Boolean(isLive),
        status: isLive ? "live" : status,
        description: (description || "").trim(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await liveCol.insertOne(newClass);
      res.status(201).json({
        success: true,
        message: "নতুন লাইভ ক্লাস সফলভাবে তৈরি হয়েছে!",
        data: { ...newClass, _id: result.insertedId },
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.delete("/api/smart-classroom/live/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await liveCol.deleteOne(getIdFilter(id));
      if (result.deletedCount === 0) {
        return res.status(404).json({ success: false, message: "ক্লাস পাওয়া যায়নি।" });
      }
      res.json({ success: true, message: "লাইভ ক্লাস মুছে ফেলা হয়েছে।" });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // 3. RECORDED CLASSES
  app.get("/api/smart-classroom/recorded", async (req, res) => {
    try {
      await ensureSeedData();
      const records = await recordedCol.find({}).sort({ createdAt: -1 }).toArray();
      res.json({ success: true, data: records });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post("/api/smart-classroom/recorded", async (req, res) => {
    try {
      const {
        title,
        subject,
        department = "কিতাব বিভাগ",
        classGrade = "",
        teacher = "",
        duration = "৩০:০০",
        videoUrl = "",
        thumbnail = "",
        description = "",
      } = req.body;

      if (!title || !videoUrl) {
        return res.status(400).json({
          success: false,
          message: "ভিডিওর শিরোনাম এবং ভিডিও URL আবশ্যক।",
        });
      }

      const newRecord = {
        title: title.trim(),
        subject: (subject || "সাধারণ পাঠ").trim(),
        department: department.trim(),
        classGrade: classGrade.trim(),
        teacher: teacher.trim(),
        duration: duration.trim(),
        videoUrl: videoUrl.trim(),
        thumbnail:
          thumbnail.trim() ||
          "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=600&auto=format&fit=crop&q=80",
        date: new Date().toLocaleDateString("bn-BD"),
        views: 0,
        description: (description || "").trim(),
        createdAt: new Date(),
      };

      const result = await recordedCol.insertOne(newRecord);
      res.status(201).json({
        success: true,
        message: "রেকর্ডেড ক্লাস সফলভাবে আপলোড করা হয়েছে!",
        data: { ...newRecord, _id: result.insertedId },
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.delete("/api/smart-classroom/recorded/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await recordedCol.deleteOne(getIdFilter(id));
      if (result.deletedCount === 0) {
        return res.status(404).json({ success: false, message: "ভিডিও পাওয়া যায়নি।" });
      }
      res.json({ success: true, message: "রেকর্ডেড ক্লাস মুছে ফেলা হয়েছে।" });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // 4. EBOOKS & STUDY MATERIALS
  app.get("/api/smart-classroom/ebooks", async (req, res) => {
    try {
      await ensureSeedData();
      const ebooks = await ebooksCol.find({}).sort({ createdAt: -1 }).toArray();
      res.json({ success: true, data: ebooks });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post("/api/smart-classroom/ebooks", async (req, res) => {
    try {
      const {
        name,
        category = "দরসি কিতাব",
        department = "কিতাব বিভাগ",
        classGrade = "",
        author = "",
        type = "PDF কিতাব",
        size = "৫.০ MB",
        pages = 50,
        fileUrl = "",
        description = "",
      } = req.body;

      if (!name || !fileUrl) {
        return res.status(400).json({
          success: false,
          message: "কিতাব বা শিটের নাম এবং ফাইল লিঙ্ক আবশ্যক।",
        });
      }

      const newEbook = {
        name: name.trim(),
        category: category.trim(),
        department: department.trim(),
        classGrade: classGrade.trim(),
        author: (author || "উস্তাদ / লেখক").trim(),
        type: type.trim(),
        size: size.trim(),
        pages: parseInt(pages) || 1,
        fileUrl: fileUrl.trim(),
        downloads: 0,
        description: (description || "").trim(),
        createdAt: new Date(),
      };

      const result = await ebooksCol.insertOne(newEbook);
      res.status(201).json({
        success: true,
        message: "ই-বুক / শিট সফলভাবে যোগ করা হয়েছে!",
        data: { ...newEbook, _id: result.insertedId },
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.delete("/api/smart-classroom/ebooks/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await ebooksCol.deleteOne(getIdFilter(id));
      if (result.deletedCount === 0) {
        return res.status(404).json({ success: false, message: "কিতাব পাওয়া যায়নি।" });
      }
      res.json({ success: true, message: "ই-বুক মুছে ফেলা হয়েছে।" });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // 5. ONLINE EXAMS
  app.get("/api/smart-classroom/exams", async (req, res) => {
    try {
      await ensureSeedData();
      const exams = await examsCol.find({}).sort({ createdAt: -1 }).toArray();
      res.json({ success: true, data: exams });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post("/api/smart-classroom/exams", async (req, res) => {
    try {
      const {
        title,
        subject,
        department = "কিতাব বিভাগ",
        classGrade = "",
        duration = "৪০ মিনিট",
        totalMarks = 50,
        passMarks = 25,
        examDate = new Date().toISOString().split("T")[0],
        startTime = "সকাল ১০:০০",
        endTime = "সকাল ১০:৪০",
        status = "upcoming",
        examLink = "",
        instructions = "",
      } = req.body;

      if (!title || !subject) {
        return res.status(400).json({
          success: false,
          message: "পরীক্ষার শিরোনাম এবং বিষয় আবশ্যক।",
        });
      }

      const newExam = {
        title: title.trim(),
        subject: subject.trim(),
        department: department.trim(),
        classGrade: classGrade.trim(),
        duration: duration.trim(),
        totalMarks: parseInt(totalMarks) || 50,
        passMarks: parseInt(passMarks) || 25,
        examDate: examDate || new Date().toISOString().split("T")[0],
        startTime: startTime.trim(),
        endTime: endTime.trim(),
        status: status.trim(),
        examLink: (examLink || "https://forms.google.com").trim(),
        instructions: (instructions || "").trim(),
        createdAt: new Date(),
      };

      const result = await examsCol.insertOne(newExam);
      res.status(201).json({
        success: true,
        message: "অনলাইন পরীক্ষা সফলভাবে তৈরি করা হয়েছে!",
        data: { ...newExam, _id: result.insertedId },
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.delete("/api/smart-classroom/exams/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await examsCol.deleteOne(getIdFilter(id));
      if (result.deletedCount === 0) {
        return res.status(404).json({ success: false, message: "পরীক্ষা পাওয়া যায়নি।" });
      }
      res.json({ success: true, message: "পরীক্ষা মুছে ফেলা হয়েছে।" });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });
}

module.exports = smartClassroomRoutes;
