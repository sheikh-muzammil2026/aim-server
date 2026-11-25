const express = require("express");

function examRoutes(collections, helpers, database) {
  const router = express.Router();
  const { studentsCollection, seatPlansCollection, routinesCollection } =
    collections;
  const { sanitizeYear } = helpers;

  /**
   * সীট প্ল্যান সামারি রিপোর্ট API
   * Endpoint: GET /api/seat-plans/summary
   */
  router.get("/api/seat-plans/summary", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");

      const bnToEn = (str) => {
        if (!str && str !== 0) return "";
        const bnDigits = { "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4", "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9" };
        return String(str).replace(/[০-৯]/g, (d) => bnDigits[d] || d);
      };

      const enToBn = (str) => {
        if (!str && str !== 0) return "";
        const enDigits = { "0": "০", "1": "১", "2": "২", "3": "৩", "4": "৪", "5": "৫", "6": "৬", "7": "৭", "8": "৮", "9": "৯" };
        return String(str).replace(/[0-9]/g, (d) => enDigits[d] || d);
      };

      const extractDigits = (val) => {
        if (!val && val !== 0) return "";
        const enStr = bnToEn(val);
        const match = enStr.match(/\d+/);
        return match ? match[0] : String(val).trim();
      };

      const normalizeYearBn = (raw) => {
        const clean = sanitizeYear(String(raw || ""));
        if (!clean) return "";
        const enDigits = bnToEn(clean).match(/\d{4}/)?.[0];
        return enDigits ? enToBn(enDigits) : "";
      };

      const requestedYearParam = (req.query.year || req.query.sessionYear || "").trim();
      const requestedYearBn =
        requestedYearParam && requestedYearParam.toLowerCase() !== "all"
          ? normalizeYearBn(requestedYearParam)
          : "";

      // ১. স্টুডেন্টদের তালিকা খোঁজা (Approved এবং Active স্ট্যাটাসসহ, রোল অনুযায়ী সর্ট)
      const allActiveStudents = await studentsCollection
        .find({
          status: { $regex: /^approved$/i },
          activity: { $regex: /^active$/i },
        })
        .sort({ roll: 1, studentId: 1 })
        .collation({ locale: "en", numericOrdering: true })
        .toArray();

      // সক্রিয় শিক্ষার্থী ও রুটিন থেকে শিক্ষাবর্ষের তালিকা সংগ্রহ
      const yearSet = new Set();
      allActiveStudents.forEach((s) => {
        const y = normalizeYearBn(s.sessionYear);
        if (y) yearSet.add(y);
      });
      try {
        const routineYears = await routinesCollection.distinct("gregorianYear");
        routineYears.forEach((ry) => {
          const y = normalizeYearBn(ry);
          if (y) yearSet.add(y);
        });
      } catch (yrErr) {
        console.warn("Could not fetch routine years for summary:", yrErr);
      }

      if (requestedYearBn) {
        yearSet.add(requestedYearBn);
      }

      const years = Array.from(yearSet).sort(
        (a, b) => Number(bnToEn(b)) - Number(bnToEn(a))
      );
      const academicYear = requestedYearBn || years[0] || "২০২৬";
      if (!years.includes(academicYear)) {
        years.unshift(academicYear);
      }

      const students = requestedYearBn
        ? allActiveStudents.filter(
            (s) => normalizeYearBn(s.sessionYear) === requestedYearBn
          )
        : allActiveStudents;

      // ২. seat_plan কালেকশন থেকে ডাটা নিয়ে আসা
      const seatPlans = await seatPlansCollection.find().toArray();

      // ৩. seatPlans কে ইন-মেমোরি ম্যাপে রূপান্তর করা সহজ অনুসন্ধানের জন্য
      const seatPlanMap = {};
      seatPlans.forEach((sp) => {
        if (sp.studentId) {
          seatPlanMap[sp.studentId] = sp;
        }
      });

      // Helper to normalize Bengali class names to NFC
      const normalizeClassName = (name) => {
        if (!name) return "N/A";
        return String(name).normalize("NFC").trim();
      };

      // ৪. শিক্ষার্থীদের হল ভিত্তিক গ্রুপ করা ও ডুপ্লিকেশন দূর করা
      const seenStudentIds = new Set();
      const seenMongoIds = new Set();

      const allocatedSeats = [];
      const unassignedStudents = [];

      students.forEach((student) => {
        const sId = student.studentId;
        const sMongoId = student._id.toString();

        if (sId && seenStudentIds.has(sId)) return;
        if (seenMongoIds.has(sMongoId)) return;

        if (sId) seenStudentIds.add(sId);
        seenMongoIds.add(sMongoId);

        let rawClass = "N/A";
        if (student.divisionPreHifz?.active) {
          rawClass = student.divisionPreHifz.class || "N/A";
        } else if (student.divisionHifz?.active) {
          rawClass = student.divisionHifz.class || "N/A";
        } else if (student.divisionAcademy?.active) {
          rawClass = student.divisionAcademy.class || "N/A";
        } else {
          rawClass = student.officeUse?.recommendedClass || "N/A";
        }

        const className = normalizeClassName(rawClass);

        const matchedPlan = seatPlanMap[sId] || seatPlanMap[sMongoId];
        let rawHallNo =
          matchedPlan?.room ||
          matchedPlan?.building ||
          student.seatPlan?.hallNo ||
          student.hallNo;
        let rawSeatNo =
          matchedPlan?.seatNo || student.seatPlan?.seatNo || student.seatNo;

        const hallNo = extractDigits(rawHallNo);
        const seatNo = extractDigits(rawSeatNo);

        if (hallNo && seatNo && hallNo !== "" && seatNo !== "") {
          allocatedSeats.push({
            studentId: sId,
            studentMongoId: sMongoId,
            student: {
              ...student,
              class: className,
            },
            hallNo,
            seatNo,
          });
        } else {
          unassignedStudents.push({
            studentId: sId,
            studentMongoId: sMongoId,
            student: {
              ...student,
              class: className,
            },
          });
        }
      });

      // ৫. allocatedSeats থেকে সরাসরি Summary গণনা করা (reduce ব্যবহার করে)
      const groupedData = allocatedSeats.reduce((acc, seat) => {
        const hall = seat.hallNo;
        const className = seat.student.class;

        if (!acc[hall]) {
          acc[hall] = {};
        }
        acc[hall][className] = (acc[hall][className] || 0) + 1;
        return acc;
      }, {});

      // ৬. সেলফ-ভ্যালিডেশন এবং ক্রস-চেক লেয়ার
      const totalUniqueStudents = seenMongoIds.size;
      const totalAllocatedSeats = allocatedSeats.length;
      const totalUnassignedStudents = unassignedStudents.length;

      const isCountConsistent =
        totalUniqueStudents === totalAllocatedSeats + totalUnassignedStudents;

      let classSummarySum = 0;
      Object.keys(groupedData).forEach((hall) => {
        Object.keys(groupedData[hall]).forEach((cls) => {
          classSummarySum += groupedData[hall][cls];
        });
      });

      const isSumConsistent = classSummarySum === totalAllocatedSeats;

      if (!isCountConsistent || !isSumConsistent) {
        console.warn(`[SeatPlanSummary] Crosscheck failed!
                    - Unique Students: ${totalUniqueStudents}
                    - Allocated + Unassigned: ${totalAllocatedSeats + totalUnassignedStudents} (Allocated: ${totalAllocatedSeats}, Unassigned: ${totalUnassignedStudents})
                    - Class Summary Sum: ${classSummarySum}
                    - Total Assigned Seat Count: ${totalAllocatedSeats}
                    Recalculating using real-time fallback...`);

        const fallbackGrouped = {};
        const fallbackProcessed = new Set();

        allocatedSeats.forEach((seat) => {
          const uniqueKey = seat.studentId || seat.studentMongoId;
          if (fallbackProcessed.has(uniqueKey)) return;
          fallbackProcessed.add(uniqueKey);

          const hall = seat.hallNo;
          const cls = seat.student.class;
          if (!fallbackGrouped[hall]) {
            fallbackGrouped[hall] = {};
          }
          fallbackGrouped[hall][cls] = (fallbackGrouped[hall][cls] || 0) + 1;
        });

        res.status(200).json({
          success: true,
          data: fallbackGrouped,
          academicYear,
          years,
          validationError: true,
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: groupedData,
        academicYear,
        years,
      });
    } catch (error) {
      console.error("Seat Plan Summary Error:", error);
      res.status(500).json({
        success: false,
        message: "সার্ভারে সিট প্ল্যান সামারি প্রস্তুত করতে সমস্যা হয়েছে।",
        error: error.message,
      });
    }
  });

  /**
   * নির্দিষ্ট হলের বিস্তারিত সিট প্ল্যান পাওয়ার API
   * Endpoint: GET /api/seat-plan
   */
  router.get("/api/seat-plan", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");

      console.log("Incoming Query Params:", req.query);
      const {
        hallNo,
        academicYear: rawAcademicYear,
        examName: rawExamName,
        semester,
        year,
        sessionYear,
      } = req.query;

      if (!hallNo) {
        return res.status(400).json({
          success: false,
          message: "Hall number is required",
        });
      }

      // Convert English to Bengali and Bengali to English helper
      const bnToEn = (str) => {
        if (!str && str !== 0) return "";
        const bnDigits = { "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4", "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9" };
        return String(str).replace(/[০-৯]/g, (d) => bnDigits[d] || d);
      };

      const enToBn = (str) => {
        if (!str && str !== 0) return "";
        const enDigits = { "0": "০", "1": "১", "2": "২", "3": "৩", "4": "৪", "5": "৫", "6": "৬", "7": "৭", "8": "৮", "9": "৯" };
        return String(str).replace(/[0-9]/g, (d) => enDigits[d] || d);
      };

      const extractDigits = (val) => {
        if (!val && val !== 0) return "";
        const enStr = bnToEn(val);
        const match = enStr.match(/\d+/);
        return match ? match[0] : String(val).trim();
      };

      const normalizeYearBn = (raw) => {
        const clean = sanitizeYear(String(raw || ""));
        if (!clean) return "";
        const enDigits = bnToEn(clean).match(/\d{4}/)?.[0];
        return enDigits ? enToBn(enDigits) : "";
      };

      const requestedYearParam = String(
        rawAcademicYear || year || sessionYear || ""
      ).trim();
      const requestedYearBn =
        requestedYearParam && requestedYearParam.toLowerCase() !== "all"
          ? normalizeYearBn(requestedYearParam)
          : "";
      const requestedYearEn = bnToEn(requestedYearBn);

      const requestedExam = String(rawExamName || semester || "").trim();

      const isAllHalls = String(hallNo).trim().toLowerCase() === "all";
      const cleanHall = isAllHalls ? "" : extractDigits(hallNo);
      const bnHall = isAllHalls ? "" : enToBn(cleanHall);
      const numHall = isAllHalls ? 0 : parseInt(cleanHall, 10);

      if (!isAllHalls && (!cleanHall || isNaN(numHall))) {
        return res.status(400).json({
          success: false,
          message: "Valid hall number is required",
        });
      }

      // ১. Students কালেকশন থেকে সক্রিয় ও অনুমোদিত শিক্ষার্থীদের ডাটা ফেচ করা: { academicYear, examName, hallNo }
      const studentQuery = {
        status: { $regex: /^approved$/i },
        activity: { $regex: /^active$/i },
        $and: [],
      };

      if (!isAllHalls) {
        studentQuery.$and.push({
          $or: [
            { hallNo: cleanHall },
            { hallNo: numHall },
            { hallNo: bnHall },
            { hallNo: { $regex: new RegExp(`^(?:(হল|hall)\\s*(নং|no\\.?)?\\s*[-—]?)?\\s*(${cleanHall}|${bnHall})$`, "i") } },
            { "seatPlan.hallNo": cleanHall },
            { "seatPlan.hallNo": numHall },
            { "seatPlan.hallNo": bnHall },
            { "seatPlan.hallNo": { $regex: new RegExp(`^(?:(হল|hall)\\s*(নং|no\\.?)?\\s*[-—]?)?\\s*(${cleanHall}|${bnHall})$`, "i") } },
          ],
        });
      }

      if (requestedYearBn) {
        studentQuery.$and.push({
          $or: [
            { sessionYear: requestedYearBn },
            { sessionYear: requestedYearEn },
            { sessionYear: { $regex: new RegExp(requestedYearEn || requestedYearBn, "i") } },
            { academicYear: requestedYearBn },
            { academicYear: requestedYearEn },
            { "seatPlan.academicYear": requestedYearBn },
            { "seatPlan.academicYear": requestedYearEn },
            { "seatPlan.sessionYear": requestedYearBn },
            { "seatPlan.sessionYear": requestedYearEn },
          ],
        });
      }

      if (studentQuery.$and.length === 0) {
        delete studentQuery.$and;
      }

      const allHallStudents = await database
        .collection("students")
        .find(studentQuery)
        .toArray();

      // শিক্ষাবর্ষের তালিকা ও সক্রিয় শিক্ষাবর্ষ নির্ধারণ (রুটিন + শিক্ষার্থী থেকে)
      const yearSet = new Set();
      allHallStudents.forEach((s) => {
        const y = normalizeYearBn(s.sessionYear);
        if (y) yearSet.add(y);
      });

      let routineYearBn = "";
      try {
        if (requestedExam) {
          const matchedRoutine = await routinesCollection.findOne(
            { examTitle: { $regex: new RegExp(`^${requestedExam}$`, "i") } },
            { sort: { updatedAt: -1 } }
          );
          if (matchedRoutine?.gregorianYear) {
            routineYearBn = normalizeYearBn(matchedRoutine.gregorianYear);
            if (routineYearBn) yearSet.add(routineYearBn);
          }
        }
        const [studentSessionYears, routineYears] = await Promise.all([
          database
            .collection("students")
            .distinct("sessionYear", {
              status: { $regex: /^approved$/i },
              activity: { $regex: /^active$/i },
            }),
          routinesCollection.distinct("gregorianYear"),
        ]);
        [...studentSessionYears, ...routineYears].forEach((rawY) => {
          const y = normalizeYearBn(rawY);
          if (y) yearSet.add(y);
        });
      } catch (yrErr) {
        console.warn("Could not fetch academic years for seat plan:", yrErr);
      }

      if (requestedYearBn) {
        yearSet.add(requestedYearBn);
      }

      const years = Array.from(yearSet).sort(
        (a, b) => Number(bnToEn(b)) - Number(bnToEn(a))
      );
      const academicYear = requestedYearBn || routineYearBn || years[0] || "২০২৬";
      if (!years.includes(academicYear)) {
        years.unshift(academicYear);
      }

      const students = requestedYearBn
        ? allHallStudents.filter(
            (s) => normalizeYearBn(s.sessionYear) === requestedYearBn
          )
        : allHallStudents;

      const data = students
        .map((student) => {
          let classVal = "N/A";
          let divisionName = "N/A";
          if (student.divisionPreHifz?.active) {
            classVal = student.divisionPreHifz.class || "N/A";
            divisionName = "প্রি-হিফজ";
          } else if (student.divisionHifz?.active) {
            classVal = student.divisionHifz.class || "N/A";
            divisionName = "হিফজ বিভাগ";
          } else if (student.divisionAcademy?.active) {
            classVal = student.divisionAcademy.class || "N/A";
            divisionName = "একাডেমিক";
          } else {
            classVal = student.officeUse?.recommendedClass || "N/A";
          }

          const currentSeatPlan = student.seatPlan || {};
          const rawStudentHall = student.hallNo || currentSeatPlan.hallNo || "";
          const studentHallDigits = extractDigits(rawStudentHall);
          const parsedStudentHall = parseInt(studentHallDigits, 10) || 0;

          // নির্দিষ্ট হল ফিল্টারে অন্য হলের শিক্ষার্থীকে বাদ দেয়া (Cross-hall bleed-through প্রতিরোধ)
          if (!isAllHalls && parsedStudentHall !== numHall) {
            return null;
          }

          const actualHallNo = isAllHalls
            ? parsedStudentHall
            : numHall;

          const rawSeatNo = student.seatNo || currentSeatPlan.seatNo || "";
          const seatDigits = extractDigits(rawSeatNo);
          const actualSeatNo = parseInt(seatDigits, 10) || 0;

          const rawBenchNo = student.benchNo || currentSeatPlan.benchNo || "";
          const benchDigits = extractDigits(rawBenchNo);

          return {
            _id: student._id.toString(),
            hallNo: actualHallNo,
            seatNo: actualSeatNo,
            benchNo: benchDigits ? Number(benchDigits) : (actualSeatNo > 0 ? Math.ceil(actualSeatNo / 2) : ""),
            class: classVal,
            divisionName,
            name:
              student.studentNameBangla ||
              student.studentNameEnglish ||
              student.name ||
              "নাম নেই",
            studentId: student.studentId || "",
            roll:
              student.roll ||
              student.officeUse?.rollNumber ||
              student.studentId ||
              "",
            sessionYear: normalizeYearBn(student.sessionYear) || "",
            studentImage:
              student.studentImage ||
              student.profilePhoto ||
              student.photoUrl ||
              student.profileImage ||
              student.image ||
              student.avatar ||
              "",
            semester: requestedExam || "২য় সাময়িক পরীক্ষা",
          };
        })
        .filter((s) => Boolean(s) && (isAllHalls ? true : s.seatNo > 0 && s.hallNo === numHall))
        .sort((a, b) => {
          if (isAllHalls) {
            const aAssigned = a.hallNo > 0 && a.seatNo > 0 ? 0 : 1;
            const bAssigned = b.hallNo > 0 && b.seatNo > 0 ? 0 : 1;
            if (aAssigned !== bAssigned) return aAssigned - bAssigned;
            if (a.hallNo !== b.hallNo) return a.hallNo - b.hallNo;
            if (a.seatNo !== b.seatNo) return a.seatNo - b.seatNo;
            const rollA = parseInt(bnToEn(a.roll), 10) || Infinity;
            const rollB = parseInt(bnToEn(b.roll), 10) || Infinity;
            return rollA - rollB;
          }
          return a.seatNo - b.seatNo;
        });

      console.log("MongoDB Search Results (data count):", data.length);

      res.status(200).json({
        success: true,
        data,
        academicYear,
        years,
      });
    } catch (error) {
      console.error("Fetch Seat Plan Error:", error);
      res.status(500).json({
        success: false,
        message: "সার্ভারে সিট প্ল্যানের তথ্য পেতে সমস্যা হয়েছে।",
        error: error.message,
      });
    }
  });

  /**
   * সিট প্ল্যান সেভ অথবা আপডেট করার API (POST/PUT /api/seat-plan)
   */
  const handleSeatPlanSaveOrUpdate = async (req, res) => {
    try {
      const { studentId, id, roll, hallNo, benchNo, seatNo, academicYear, examName, year, semester, sessionYear } = req.body;
      const targetId = id || studentId;

      const bnToEn = (str) => {
        if (!str && str !== 0) return "";
        const bnDigits = { "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4", "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9" };
        return String(str).replace(/[০-৯]/g, (d) => bnDigits[d] || d);
      };

      const enToBn = (str) => {
        if (!str && str !== 0) return "";
        const enDigits = { "0": "০", "1": "১", "2": "২", "3": "৩", "4": "৪", "5": "৫", "6": "৬", "7": "৭", "8": "৮", "9": "৯" };
        return String(str).replace(/[0-9]/g, (d) => enDigits[d] || d);
      };

      const extractDigits = (val) => {
        if (!val && val !== 0) return "";
        const enStr = bnToEn(val);
        const match = enStr.match(/\d+/);
        return match ? match[0] : String(val).trim();
      };

      const getStudentClassName = (student) => {
        if (!student) return "N/A";
        if (student.divisionPreHifz?.active && student.divisionPreHifz.class) {
          return student.divisionPreHifz.class;
        }
        if (student.divisionHifz?.active && student.divisionHifz.class) {
          return student.divisionHifz.class;
        }
        if (student.divisionAcademy?.active && student.divisionAcademy.class) {
          return student.divisionAcademy.class;
        }
        return student.officeUse?.recommendedClass || student.class || "N/A";
      };

      const getStudentDisplayName = (student) => {
        if (!student) return "শিক্ষার্থী";
        return (
          student.studentNameBangla ||
          student.studentNameEnglish ||
          student.name ||
          "শিক্ষার্থী"
        );
      };

      const getStudentRoll = (student) => {
        if (!student) return "N/A";
        return (
          student.roll ||
          student.officeUse?.rollNumber ||
          student.studentId ||
          "N/A"
        );
      };

      const cleanHallNo = extractDigits(hallNo);
      const cleanBenchNo = extractDigits(benchNo);
      const cleanSeatNo = extractDigits(seatNo);

      let filter;
      let currentObjectId = null;
      if (targetId) {
        try {
          const { ObjectId } = require("mongodb");
          currentObjectId = new ObjectId(targetId);
          filter = { _id: currentObjectId };
        } catch (e) {
          filter = { studentId: String(targetId) };
        }
      } else if (roll) {
        filter = { roll: String(roll) };
      } else {
        return res.status(400).json({ success: false, message: "Student identifier is required" });
      }

      const currentStudent = await studentsCollection.findOne(filter);
      if (!currentStudent) {
        return res.status(404).json({ success: false, message: "শিক্ষার্থী পাওয়া যায়নি।" });
      }
      if (currentStudent._id) currentObjectId = currentStudent._id;

      const rawYear = academicYear || year || sessionYear || currentStudent.academicYear || currentStudent.sessionYear || "";
      const cleanYear = extractDigits(rawYear);
      const bnYear = enToBn(cleanYear);
      const cleanExamName = String(examName || semester || currentStudent.seatPlan?.examName || currentStudent.examName || "").trim();

      if (cleanHallNo && cleanSeatNo) {
        const bnHallNo = enToBn(cleanHallNo);
        const bnSeatNo = enToBn(cleanSeatNo);

        const conflictQuery = {
          status: { $regex: /^approved$/i },
          activity: { $regex: /^active$/i },
          $and: [
            {
              $or: [
                { hallNo: cleanHallNo },
                { hallNo: Number(cleanHallNo) },
                { hallNo: bnHallNo },
                { hallNo: { $regex: new RegExp(`^(?:(হল|hall)\\s*(নং|no\\.?)?\\s*[-—]?)?\\s*(${cleanHallNo}|${bnHallNo})$`, "i") } },
                { "seatPlan.hallNo": cleanHallNo },
                { "seatPlan.hallNo": Number(cleanHallNo) },
                { "seatPlan.hallNo": bnHallNo },
                { "seatPlan.hallNo": { $regex: new RegExp(`^(?:(হল|hall)\\s*(নং|no\\.?)?\\s*[-—]?)?\\s*(${cleanHallNo}|${bnHallNo})$`, "i") } },
              ],
            },
            {
              $or: [
                { seatNo: cleanSeatNo },
                { seatNo: Number(cleanSeatNo) },
                { seatNo: bnSeatNo },
                { "seatPlan.seatNo": cleanSeatNo },
                { "seatPlan.seatNo": Number(cleanSeatNo) },
                { "seatPlan.seatNo": bnSeatNo },
              ],
            },
          ],
        };

        const exclude = [];
        if (currentObjectId) exclude.push({ _id: { $ne: currentObjectId } });
        if (currentStudent.studentId) exclude.push({ studentId: { $ne: String(currentStudent.studentId) } });
        if (currentStudent.roll) exclude.push({ roll: { $ne: String(currentStudent.roll) } });
        if (exclude.length > 0) conflictQuery.$and.push(...exclude);

        if (cleanYear) {
          conflictQuery.$and.push({
            $or: [
              { sessionYear: cleanYear },
              { sessionYear: bnYear },
              { sessionYear: { $regex: new RegExp(cleanYear, "i") } },
              { academicYear: cleanYear },
              { academicYear: bnYear },
              { "seatPlan.academicYear": cleanYear },
              { "seatPlan.academicYear": bnYear },
              { "seatPlan.sessionYear": cleanYear },
              { "seatPlan.sessionYear": bnYear },
            ],
          });
        }

        const existingOccupant = await studentsCollection.findOne(conflictQuery);
        if (existingOccupant) {
          const occupantName = getStudentDisplayName(existingOccupant);
          const occupantRoll = getStudentRoll(existingOccupant);
          const occupantClass = getStudentClassName(existingOccupant);
          return res.status(409).json({
            success: false,
            message: `Seat No ${cleanSeatNo} in Hall ${cleanHallNo} is already booked for ${occupantName} (Roll: ${occupantRoll}, Class: ${occupantClass}).`,
          });
        }
      }

      const updateDoc = {
        $set: {
          "seatPlan.hallNo": cleanHallNo,
          "seatPlan.benchNo": cleanBenchNo,
          "seatPlan.seatNo": cleanSeatNo,
          "seatPlan.academicYear": rawYear || "২০২৬",
          "seatPlan.examName": cleanExamName,
          hallNo: cleanHallNo,
          benchNo: cleanBenchNo,
          seatNo: cleanSeatNo,
          academicYear: rawYear || "২০২৬",
          examName: cleanExamName,
          updatedAt: new Date(),
        },
      };

      await studentsCollection.updateOne({ _id: currentStudent._id }, updateDoc);

      res.status(200).json({
        success: true,
        message: "সিট প্ল্যান সফলভাবে আপডেট করা হয়েছে।",
        data: {
          hallNo: cleanHallNo,
          benchNo: cleanBenchNo,
          seatNo: cleanSeatNo,
          academicYear: rawYear || "২০২৬",
          examName: cleanExamName,
        },
      });
    } catch (error) {
      console.error("Save/Update Seat Plan Error:", error);
      res.status(500).json({
        success: false,
        message: "সার্ভারে সিট প্ল্যান আপডেট করতে সমস্যা হয়েছে।",
      });
    }
  };

  router.post("/api/seat-plan", handleSeatPlanSaveOrUpdate);
  router.put("/api/seat-plan", handleSeatPlanSaveOrUpdate);

  /**
   * পরীক্ষার তালিকা পাওয়ার API
   * Endpoint: GET /api/exams/list
   */
  router.get("/api/exams/list", async (req, res) => {
    try {
      const examTitles = await routinesCollection.distinct("examTitle");
      res.status(200).json({ success: true, data: examTitles });
    } catch (error) {
      console.error("Fetch exams error:", error);
      res.status(500).json({
        success: false,
        message: "পরীক্ষার তালিকা লোড করতে সমস্যা হয়েছে।",
        error: error.message,
      });
    }
  });

  /**
   * পরীক্ষা কক্ষের উপস্থিতি স্বাক্ষরপত্র তৈরির API
   * Endpoint: GET /api/exams/attendance-sheet
   */
  router.get("/api/exams/attendance-sheet", async (req, res) => {
    try {
      const { className, examName } = req.query;

      if (!className || !examName) {
        return res.status(400).json({
          success: false,
          message: "className এবং examName উভয়ই প্রয়োজন।",
        });
      }

      // ১. স্টুডেন্টদের তালিকা খোঁজা (নির্দিষ্ট ক্লাস, Approved এবং Active স্ট্যাটাস)
      const query = {
        status: "Approved",
        activity: "active",
        $or: [
          {
            "divisionPreHifz.active": true,
            "divisionPreHifz.class": className,
          },
          { "divisionHifz.active": true, "divisionHifz.class": className },
          {
            "divisionAcademy.active": true,
            "divisionAcademy.class": className,
          },
          { "officeUse.recommendedClass": className },
        ],
      };

      const students = await studentsCollection
        .find(query)
        .sort({ roll: 1, studentId: 1 })
        .collation({ locale: "en", numericOrdering: true })
        .toArray();

      // ২. রুটিন ও সাবজেক্ট শিডিউল খোঁজা
      const routine = await routinesCollection.findOne({
        examTitle: examName,
      });

      let subjectsList = [];
      let hijriYear = "";
      let englishYear = "";

      if (routine) {
        hijriYear = routine.hijriYear || "";
        englishYear = routine.gregorianYear || "";

        if (
          Array.isArray(routine.dates) &&
          Array.isArray(routine.routineData)
        ) {
          const classRoutine = routine.routineData.find(
            (r) =>
              r.class === className ||
              r.class?.toLowerCase() === className?.toLowerCase(),
          );

          if (classRoutine && classRoutine.subjects) {
            // রুটিনের তারিখগুলো ম্যাপ করে সাবজেক্ট শিডিউল তৈরি করা
            subjectsList = routine.dates
              .map((d) => {
                const subjectName = classRoutine.subjects[d.id];
                return {
                  id: d.id,
                  name: subjectName || "",
                  date: d.gregorian + " ইং:",
                  gregorianRaw: d.gregorianRaw || "",
                };
              })
              .filter(
                (sub) =>
                  sub.name && sub.name.trim() !== "" && sub.name !== "—",
              );

            // তারিখ অনুযায়ী সর্ট করা (earliest/upcoming exam first)
            subjectsList.sort((a, b) => {
              const dateA = a.gregorianRaw
                ? new Date(a.gregorianRaw)
                : new Date(
                    a.date.split(" ")[0].split("/").reverse().join("-"),
                  );
              const dateB = b.gregorianRaw
                ? new Date(b.gregorianRaw)
                : new Date(
                    a.date.split(" ")[0].split("/").reverse().join("-"),
                  );
              return dateA - dateB;
            });
          }
        }
      }

      // ৩. স্টুডেন্টদের ডাটা ফরম্যাট করা
      const formattedStudents = students.map((student) => {
        return {
          roll: student.officeUse?.rollNumber || student.roll || "N/A",
          studentId: student.studentId || "N/A",
          studentName:
            student.studentNameBangla ||
            student.studentNameEnglish ||
            "নাম বিহীন",
        };
      });

      // রোল অনুযায়ী সর্ট করা
      const parseRoll = (r) => {
        if (!r || r === "N/A") return Infinity;
        const bnToEn = {
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
        const enStr = String(r)
          .split("")
          .map((char) => bnToEn[char] || char)
          .join("");
        const num = parseInt(enStr, 10);
        return isNaN(num) ? Infinity : num;
      };

      formattedStudents.sort((a, b) => parseRoll(a.roll) - parseRoll(b.roll));

      res.status(200).json({
        success: true,
        metaData: {
          className,
          examName,
          englishYear: sanitizeYear(englishYear, "২০২৬"),
          hijriYear: sanitizeYear(hijriYear, "১৪৪৭"),
        },
        subjects: subjectsList,
        students: formattedStudents,
      });
    } catch (error) {
      console.error("Attendance Sheet API Error:", error);
      res.status(500).json({
        success: false,
        message:
          "উপস্থিতি স্বাক্ষরপত্র শিটের তথ্য প্রস্তুত করতে সমস্যা হয়েছে।",
        error: error.message,
      });
    }
  });

  return router;
}

module.exports = examRoutes;
