const express = require("express");

const EN_TO_BN = {
  0: "০",
  1: "১",
  2: "২",
  3: "৩",
  4: "৪",
  5: "৫",
  6: "৬",
  7: "৭",
  8: "৮",
  9: "৯",
};

const BN_TO_EN = {
  "০": "0",
  "১": "1",
  "২": "2",
  "৩": "3",
  "৪": "4",
  "৫": "5",
  "৬": "6",
  "৭": "7",
  "৮": "8",
  "৯": "9",
};

function toBengaliDigits(val) {
  if (val === null || val === undefined) return "";
  return String(val).replace(/[0-9]/g, (d) => EN_TO_BN[d] ?? d);
}

function toEnglishDigits(val) {
  if (val === null || val === undefined) return "";
  return String(val).replace(/[০-৯]/g, (d) => BN_TO_EN[d] ?? d);
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractStudentClass(student) {
  if (!student) return "";
  if (student.divisionAcademy?.active && student.divisionAcademy.class) {
    return student.divisionAcademy.class;
  }
  if (student.divisionPreHifz?.active && student.divisionPreHifz.class) {
    return student.divisionPreHifz.class;
  }
  if (student.divisionHifz?.active && student.divisionHifz.class) {
    return student.divisionHifz.class;
  }
  if (student.officeUse?.recommendedClass) {
    return student.officeUse.recommendedClass;
  }
  return student.className || student.previousClass || "";
}

function parentFeedbackRoutes(collections, authHelpers, database) {
  const router = express.Router();
  const studentsCollection =
    collections.studentsCollection || database.collection("students");
  const syllabusCollection =
    collections.syllabusCollection || database.collection("syllabus");
  const parentFeedbacksCollection =
    collections.parentFeedbacksCollection ||
    database.collection("parent_feedbacks");

  const { getAuthUser, isAdminUser } = authHelpers;

  /**
   * 1. PUBLIC META & SYLLABUS REUSE ENDPOINT
   * GET /api/parent-feedback/meta
   * Fetches dynamic classes & class-wise subjects directly from existing `syllabus` collection
   */
  router.get("/api/parent-feedback/meta", async (req, res) => {
    try {
      const allSyllabus = await syllabusCollection
        .find({})
        .sort({ order: 1 })
        .toArray();

      const classes = [];
      const classSubjects = {};

      allSyllabus.forEach((item) => {
        if (item.class) {
          if (!classes.includes(item.class)) {
            classes.push(item.class);
          }
          classSubjects[item.class] = Array.isArray(item.subjects)
            ? item.subjects
            : [];
        }
      });

      res.status(200).json({
        success: true,
        classes,
        classSubjects,
      });
    } catch (error) {
      console.error("Parent feedback meta error:", error);
      res.status(500).json({
        success: false,
        message: "শ্রেণি ও বিষয়ের তথ্য লোড করতে সমস্যা হয়েছে।",
      });
    }
  });

  /**
   * 2. PUBLIC STUDENT LOOKUP ENDPOINT (Controlled Search by ID / Roll / Name)
   * GET /api/parent-feedback/lookup?q=...&className=...
   * Queries existing `students` collection and returns matched students + class subjects from `syllabus`
   */
  router.get("/api/parent-feedback/lookup", async (req, res) => {
    try {
      const rawQuery = (req.query.q || "").trim();
      const filterClass = (req.query.className || "").trim();

      if (!rawQuery) {
        return res.status(400).json({
          success: false,
          message: "অনুগ্রহ করে শিক্ষার্থীর আইডি, রোল অথবা নাম লিখুন।",
          students: [],
        });
      }

      const qEn = toEnglishDigits(rawQuery);
      const qBn = toBengaliDigits(rawQuery);
      const safeRaw = escapeRegex(rawQuery);
      const safeEn = escapeRegex(qEn);
      const safeBn = escapeRegex(qBn);

      const orConditions = [
        { studentId: { $regex: new RegExp(safeRaw, "i") } },
        { studentId: { $regex: new RegExp(safeEn, "i") } },
        { studentId: { $regex: new RegExp(safeBn, "i") } },
        { studentNameBangla: { $regex: new RegExp(safeRaw, "i") } },
        { studentNameEnglish: { $regex: new RegExp(safeRaw, "i") } },
        { roll: rawQuery },
        { roll: qEn },
        { roll: qBn },
        { "officeUse.rollNumber": rawQuery },
        { "officeUse.rollNumber": qEn },
        { "officeUse.rollNumber": qBn },
      ];

      const numRoll = parseInt(qEn, 10);
      if (!isNaN(numRoll)) {
        orConditions.push({ roll: numRoll });
      }

      const andClauses = [
        { status: { $ne: "Deleted" } },
        {
          $or: [
            { activity: "active" },
            { activity: { $exists: false } },
          ],
        },
        { $or: orConditions },
      ];

      if (filterClass && filterClass !== "all") {
        andClauses.push({
          $or: [
            { "divisionAcademy.class": filterClass },
            { "divisionHifz.class": filterClass },
            { "divisionPreHifz.class": filterClass },
            { "officeUse.recommendedClass": filterClass },
          ],
        });
      }

      const matchedStudents = await studentsCollection
        .find({ $and: andClauses })
        .limit(15)
        .toArray();

      // Preload syllabus map so each matched student includes its class subjects from DB
      const allSyllabus = await syllabusCollection
        .find({})
        .sort({ order: 1 })
        .toArray();
      const classSubjectsMap = {};
      allSyllabus.forEach((s) => {
        if (s.class) {
          classSubjectsMap[s.class] = Array.isArray(s.subjects)
            ? s.subjects
            : [];
        }
      });

      const formattedStudents = matchedStudents.map((st) => {
        const className = extractStudentClass(st);
        return {
          _id: st._id,
          studentId: st.studentId || "",
          roll: st.roll || st.officeUse?.rollNumber || "",
          studentNameBangla: st.studentNameBangla || "",
          studentNameEnglish: st.studentNameEnglish || "",
          studentName:
            st.studentNameBangla || st.studentNameEnglish || "",
          fatherNameBangla: st.fatherNameBangla || "",
          className,
          subjects: classSubjectsMap[className] || [],
        };
      });

      res.status(200).json({
        success: true,
        students: formattedStudents,
      });
    } catch (error) {
      console.error("Student lookup error:", error);
      res.status(500).json({
        success: false,
        message: "শিক্ষার্থীর তথ্য অনুসন্ধানে সমস্যা হয়েছে।",
        students: [],
      });
    }
  });

  /**
   * 3. PUBLIC SUBMIT FEEDBACK ENDPOINT
   * POST /api/parent-feedback
   */
  router.post("/api/parent-feedback", async (req, res) => {
    try {
      const body = req.body || {};

      const studentName = String(body.studentName || "").trim();
      const className = String(body.className || "").trim();

      if (!studentName || !className) {
        return res.status(400).json({
          success: false,
          message: "শিক্ষার্থীর নাম এবং শ্রেণি প্রদান করা আবশ্যক।",
        });
      }

      const requiredMcqs = [
        "q3_overallProgress",
        "q4_islamicEducation",
        "q5_teachingCare",
        "q6_disciplineManagement",
        "q7_moralBehavioralChange",
        "q8_overallSatisfaction",
      ];

      for (const key of requiredMcqs) {
        if (!body[key] || !String(body[key]).trim()) {
          return res.status(400).json({
            success: false,
            message: "অনুগ্রহ করে ৩ থেকে ৮ নম্বর পর্যন্ত সকল প্রশ্নের উত্তর নির্বাচন করুন।",
          });
        }
      }

      // Normalize subject-wise teacher comments (Subject Name ONLY — no teacher names)
      let subjectFeedbacks = [];
      if (Array.isArray(body.q10_subjectFeedbacks)) {
        subjectFeedbacks = body.q10_subjectFeedbacks
          .filter(
            (item) =>
              item &&
              String(item.subject || "").trim() &&
              String(item.comment || "").trim(),
          )
          .map((item) => ({
            subject: String(item.subject).trim(),
            comment: String(item.comment).trim(),
          }));
      }

      const selectedSubject = String(body.q10_selectedSubject || "").trim();
      const teacherComment = String(body.q10_teacherComment || "").trim();

      if (
        selectedSubject &&
        teacherComment &&
        !subjectFeedbacks.some((sf) => sf.subject === selectedSubject)
      ) {
        subjectFeedbacks.unshift({
          subject: selectedSubject,
          comment: teacherComment,
        });
      }

      const doc = {
        academicYear: String(body.academicYear || "2026").trim(),
        studentId: String(body.studentId || "").trim(),
        studentRoll: String(body.studentRoll || "").trim(),
        studentName,
        className,
        q3_overallProgress: String(body.q3_overallProgress).trim(),
        q4_islamicEducation: String(body.q4_islamicEducation).trim(),
        q5_teachingCare: String(body.q5_teachingCare).trim(),
        q6_disciplineManagement: String(body.q6_disciplineManagement).trim(),
        q7_moralBehavioralChange: String(body.q7_moralBehavioralChange).trim(),
        q8_overallSatisfaction: String(body.q8_overallSatisfaction).trim(),
        q9_improvementAreas: Array.isArray(body.q9_improvementAreas)
          ? body.q9_improvementAreas.map((i) => String(i).trim()).filter(Boolean)
          : [],
        q10_selectedSubject:
          selectedSubject || (subjectFeedbacks[0]?.subject ?? ""),
        q10_teacherComment:
          teacherComment || (subjectFeedbacks[0]?.comment ?? ""),
        q10_subjectFeedbacks: subjectFeedbacks,
        q11_suggestionsOrComplaints: String(
          body.q11_suggestionsOrComplaints || "",
        ).trim(),
        createdAt: new Date(),
      };

      const result = await parentFeedbacksCollection.insertOne(doc);

      res.status(201).json({
        success: true,
        message: "আপনার মূল্যবান মতামত সফলভাবে সংরক্ষিত হয়েছে। আপনাকে আন্তরিক ধন্যবাদ!",
        insertedId: result.insertedId,
      });
    } catch (error) {
      console.error("Submit parent feedback error:", error);
      res.status(500).json({
        success: false,
        message: "মতামত সংরক্ষণে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।",
      });
    }
  });

  /**
   * 4. ADMIN-ONLY GET FEEDBACKS ENDPOINT
   * GET /api/parent-feedback
   * Strictly protected: Only `admin` / `superadmin` role users can view submitted parent feedbacks.
   */
  router.get("/api/parent-feedback", async (req, res) => {
    try {
      const authUser = await getAuthUser(req);
      if (!isAdminUser(authUser)) {
        return res.status(403).json({
          success: false,
          message: "অ্যাক্সেস অনুমোদিত নয়। শুধুমাত্র অ্যাডমিন এই মতামতসমূহ দেখতে পারবেন।",
        });
      }

      const {
        className,
        subject,
        academicYear,
        search,
      } = req.query;

      const andClauses = [];

      if (academicYear && academicYear !== "all") {
        const yEn = toEnglishDigits(academicYear);
        const yBn = toBengaliDigits(academicYear);
        andClauses.push({
          academicYear: { $in: [academicYear, yEn, yBn] },
        });
      }

      if (className && className !== "all") {
        andClauses.push({ className });
      }

      if (subject && subject !== "all") {
        andClauses.push({
          $or: [
            { q10_selectedSubject: subject },
            { "q10_subjectFeedbacks.subject": subject },
          ],
        });
      }

      if (search && search.trim()) {
        const sRaw = escapeRegex(search.trim());
        const sEn = escapeRegex(toEnglishDigits(search.trim()));
        const sBn = escapeRegex(toBengaliDigits(search.trim()));
        andClauses.push({
          $or: [
            { studentName: { $regex: new RegExp(sRaw, "i") } },
            { studentId: { $regex: new RegExp(sRaw, "i") } },
            { studentId: { $regex: new RegExp(sEn, "i") } },
            { studentId: { $regex: new RegExp(sBn, "i") } },
            { studentRoll: { $regex: new RegExp(sRaw, "i") } },
            { q10_teacherComment: { $regex: new RegExp(sRaw, "i") } },
            { "q10_subjectFeedbacks.comment": { $regex: new RegExp(sRaw, "i") } },
            { q11_suggestionsOrComplaints: { $regex: new RegExp(sRaw, "i") } },
          ],
        });
      }

      const filter = andClauses.length > 0 ? { $and: andClauses } : {};

      const feedbacks = await parentFeedbacksCollection
        .find(filter)
        .sort({ createdAt: -1 })
        .toArray();

      res.status(200).json({
        success: true,
        total: feedbacks.length,
        data: feedbacks,
      });
    } catch (error) {
      console.error("Admin fetch parent feedbacks error:", error);
      res.status(500).json({
        success: false,
        message: "মতামত তালিকা লোড করতে সমস্যা হয়েছে।",
      });
    }
  });

  return router;
}

module.exports = parentFeedbackRoutes;
