const express = require("express");
const { ObjectId } = require("mongodb");
const {
  isWithinMadrasaGeofence,
  getDhakaTime,
  evaluateCheckInStatus,
  evaluateCheckOutStatus,
  MADRASA_LOCATION,
  ATTENDANCE_RULES,
} = require("../utils/attendanceConfig");

function teacherRoutes(collections) {
  const router = express.Router();
  const { teachersCollection, usersCollection, teacherAttendanceCollection } = collections;

  /**
   * শিক্ষকের প্রোফাইল সেভ বা আপডেট করা (POST / Upsert)
   * Endpoint: POST /api/teacher/profile
   */
  router.post("/api/teacher/profile", async (req, res) => {
    try {
      const {
        email,
        fullName,
        designation,
        phone,
        address,
        bio,
        profileImage,
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
        references,
      } = req.body;

      if (!email || !fullName) {
        return res.status(400).json({
          success: false,
          message: "প্রয়োজনীয় তথ্য (ইমেইল ও নাম) প্রদান করুন।",
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
          profileImage: profileImage || "",
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
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      };

      const result = await teachersCollection.updateOne(filter, updateDoc, {
        upsert: true,
      });

      res.status(200).json({
        success: true,
        message: "প্রোফাইল তথ্য সফলভাবে সেভ ও আপডেট করা হয়েছে।",
        data: result,
      });
    } catch (error) {
      console.error("Profile save error:", error);
      res.status(500).json({
        success: false,
        message: "সার্ভারে প্রোফাইল সেভ করতে সমস্যা হয়েছে।",
        error: error.message,
      });
    }
  });

  /**
   * শিক্ষকের প্রোফাইল তথ্য আনা (GET)
   * Endpoint: GET /api/teacher/profile/:email
   */
  router.get("/api/teacher/profile/:email", async (req, res) => {
    try {
      const { email } = req.params;
      if (!email) {
        return res
          .status(400)
          .json({ success: false, message: "ইমেইল প্রয়োজন।" });
      }

      const teacher = await teachersCollection.findOne({ email });
      if (!teacher) {
        return res.status(404).json({
          success: false,
          message: "শিক্ষকের প্রোফাইল পাওয়া যায়নি।",
        });
      }

      res.status(200).json({
        success: true,
        data: teacher,
      });
    } catch (error) {
      console.error("Fetch profile error:", error);
      res.status(500).json({
        success: false,
        message: "সার্ভারে সমস্যা হয়েছে।",
        error: error.message,
      });
    }
  });

  /**
   * পাবলিক ফ্যাকাল্টি ও শিক্ষকদের তালিকা (GET)
   * Endpoints: GET /api/faculty, GET /api/teachers
   */
  const getPublicFacultyHandler = async (req, res) => {
    try {
      let teacherUsers = [];
      if (usersCollection) {
        teacherUsers = await usersCollection
          .find({ role: { $regex: /^teacher$/i } })
          .toArray()
          .catch(() => []);
      }

      const teachersProfiles = await teachersCollection
        .find({})
        .toArray()
        .catch(() => []);

      const profileMap = new Map();
      teachersProfiles.forEach((t) => {
        if (t.email) {
          profileMap.set(t.email.trim().toLowerCase(), t);
        }
      });

      const faculty = [];
      const addedEmails = new Set();

      teacherUsers.forEach((user, index) => {
        const emailKey = (user.email || "").trim().toLowerCase();
        if (emailKey) addedEmails.add(emailKey);

        const profile = emailKey ? profileMap.get(emailKey) : null;

        let education = "";
        if (typeof profile?.education === "string" && profile.education.trim()) {
          education = profile.education.trim();
        } else if (Array.isArray(profile?.academic) && profile.academic.length > 0) {
          education = profile.academic
            .map((a) => a.degree || a.title || a.name || "")
            .filter(Boolean)
            .join(", ");
        }

        faculty.push({
          id: user._id?.toString() || profile?._id?.toString() || `faculty-${index + 1}`,
          name: profile?.fullName?.trim() || user.name?.trim() || "সম্মানিত শিক্ষক",
          designation: profile?.designation?.trim() || user.designation?.trim() || "শিক্ষক",
          department: profile?.department?.trim() || profile?.subject?.trim() || "",
          subject: profile?.subject?.trim() || profile?.department?.trim() || "",
          education: education || "উচ্চতর ইসলামী ও সাধারণ শিক্ষা",
          image: profile?.profileImage || profile?.image || user.image || "",
          email: user.email || profile?.email || "",
          phone: profile?.phone || profile?.mobile || user.phone || "",
          socialLinks: profile?.socialLinks || {},
          bio: profile?.bio || "",
        });
      });

      teachersProfiles.forEach((profile, index) => {
        const emailKey = (profile.email || "").trim().toLowerCase();
        if (!emailKey || !addedEmails.has(emailKey)) {
          if (profile.fullName || profile.name) {
            let education = "";
            if (typeof profile.education === "string" && profile.education.trim()) {
              education = profile.education.trim();
            } else if (Array.isArray(profile.academic) && profile.academic.length > 0) {
              education = profile.academic
                .map((a) => a.degree || a.title || a.name || "")
                .filter(Boolean)
                .join(", ");
            }

            faculty.push({
              id: profile._id?.toString() || `faculty-ext-${index + 1}`,
              name: profile.fullName?.trim() || profile.name?.trim() || "সম্মানিত শিক্ষক",
              designation: profile.designation?.trim() || "শিক্ষক",
              department: profile.department?.trim() || profile.subject?.trim() || "",
              subject: profile.subject?.trim() || profile.department?.trim() || "",
              education: education || "উচ্চতর ইসলামী ও সাধারণ শিক্ষা",
              image: profile.profileImage || profile.image || "",
              email: profile.email || "",
              phone: profile.phone || profile.mobile || "",
              socialLinks: profile.socialLinks || {},
              bio: profile.bio || "",
            });
          }
        }
      });

      res.status(200).json({
        success: true,
        count: faculty.length,
        data: faculty,
      });
    } catch (error) {
      console.error("Fetch faculty error:", error);
      res.status(500).json({
        success: false,
        message: "শিক্ষকমণ্ডলীর তথ্য লোড করতে সমস্যা হয়েছে।",
        error: error.message,
      });
    }
  };

  router.get("/api/faculty", getPublicFacultyHandler);
  router.get("/api/teachers", getPublicFacultyHandler);

  // Teacher Authentication Helper
  async function getAuthTeacher(req, body = {}) {
    const email =
      req.headers["x-user-email"] ||
      body.teacherEmail ||
      body.email ||
      req.query.email ||
      req.query.teacherEmail;

    if (!email) return null;
    const cleanEmail = String(email).trim().toLowerCase();

    let user = null;
    if (usersCollection) {
      user = await usersCollection.findOne({
        email: { $regex: new RegExp(`^${cleanEmail}$`, "i") },
      });
    }

    let teacher = null;
    if (teachersCollection) {
      teacher = await teachersCollection.findOne({
        email: { $regex: new RegExp(`^${cleanEmail}$`, "i") },
      });
    }

    return {
      id: user?._id?.toString() || teacher?._id?.toString() || "teacher-id",
      email: cleanEmail,
      name: teacher?.fullName || teacher?.name || user?.name || cleanEmail.split("@")[0],
      role: (user?.role || "teacher").toLowerCase(),
      designation: teacher?.designation || user?.designation || "শিক্ষক",
      profileImage: teacher?.profileImage || teacher?.image || user?.image || "",
    };
  }

  /**
   * শিক্ষকের উপস্থিতি হাজিরা (Check-In)
   * Endpoint: POST /api/attendance/check-in
   */
  router.post("/api/attendance/check-in", async (req, res) => {
    try {
      const body = req.body || {};
      const { lat, lng, mockInPremises } = body;

      const user = await getAuthTeacher(req, body);
      if (!user) {
        return res.status(401).json({
          success: false,
          message: "অনুমতি নেই। অনুগ্রহ করে লগইন করুন।",
        });
      }

      if (lat === undefined || lng === undefined) {
        return res.status(400).json({
          success: false,
          message: "ডিভাইসের অবস্থান (Latitude ও Longitude) প্রয়োজন।",
        });
      }

      const effectiveLat = Number(lat);
      const effectiveLng = Number(lng);

      if (!mockInPremises) {
        const geofenceResult = isWithinMadrasaGeofence(effectiveLat, effectiveLng);
        if (!geofenceResult.isInside) {
          return res.status(403).json({
            success: false,
            message: "You must be inside the madrasa premises to submit attendance.",
            distance: geofenceResult.distance,
            threshold: geofenceResult.threshold,
          });
        }
      }

      const { dateStr } = getDhakaTime();
      const now = new Date();
      const checkInStatus = evaluateCheckInStatus(now);

      const existing = await teacherAttendanceCollection.findOne({
        teacherEmail: user.email,
        date: dateStr,
      });

      if (existing && existing.checkInTime) {
        return res.status(400).json({
          success: false,
          message: "আপনি আজকের হাজিরা (Check-In) ইতিমধ্যে সম্পন্ন করেছেন।",
          attendance: existing,
        });
      }

      const checkInComment = (body.checkInComment || body.comment || "").trim();

      const attendanceDoc = {
        teacherEmail: user.email,
        teacherName: user.name || user.email.split("@")[0],
        teacherId: user.id,
        date: dateStr,
        checkInTime: now.toISOString(),
        checkInStatus: checkInStatus, // 'On Time' | 'Late'
        checkInComment: checkInComment || null,
        checkInLocation: {
          lat: effectiveLat,
          lng: effectiveLng,
        },
        checkOutTime: null,
        checkOutStatus: null,
        checkOutLocation: null,
        createdAt: now,
        updatedAt: now,
      };

      if (existing) {
        await teacherAttendanceCollection.updateOne(
          { _id: existing._id },
          {
            $set: {
              checkInTime: attendanceDoc.checkInTime,
              checkInStatus: attendanceDoc.checkInStatus,
              checkInComment: attendanceDoc.checkInComment,
              checkInLocation: attendanceDoc.checkInLocation,
              updatedAt: now,
            },
          }
        );
        attendanceDoc._id = existing._id;
      } else {
        const result = await teacherAttendanceCollection.insertOne(attendanceDoc);
        attendanceDoc._id = result.insertedId;
      }

      res.status(200).json({
        success: true,
        message:
          checkInStatus === "On Time"
            ? "সফলভাবে সময়মতো প্রবেশ হাজিরা নিশ্চিত হয়েছে! (On Time)"
            : "দেরিতে প্রবেশ হাজিরা নিশ্চিত হয়েছে! (Late)",
        checkInStatus,
        attendance: attendanceDoc,
      });
    } catch (error) {
      console.error("Teacher Check-in error:", error);
      res.status(500).json({
        success: false,
        message: "হাজিরা সাবমিট করতে সমস্যা হয়েছে।",
        error: error.message,
      });
    }
  });

  /**
   * শিক্ষকের প্রস্থান হাজিরা (Check-Out)
   * Endpoint: POST /api/attendance/check-out
   */
  router.post("/api/attendance/check-out", async (req, res) => {
    try {
      const body = req.body || {};
      const { lat, lng, mockInPremises } = body;

      const user = await getAuthTeacher(req, body);
      if (!user) {
        return res.status(401).json({
          success: false,
          message: "অনুমতি নেই। অনুগ্রহ করে লগইন করুন।",
        });
      }

      if (lat === undefined || lng === undefined) {
        return res.status(400).json({
          success: false,
          message: "ডিভাইসের অবস্থান (Latitude ও Longitude) প্রয়োজন।",
        });
      }

      const effectiveLat = Number(lat);
      const effectiveLng = Number(lng);

      if (!mockInPremises) {
        const geofenceResult = isWithinMadrasaGeofence(effectiveLat, effectiveLng);
        if (!geofenceResult.isInside) {
          return res.status(403).json({
            success: false,
            message: "You must be inside the madrasa premises to submit attendance.",
            distance: geofenceResult.distance,
            threshold: geofenceResult.threshold,
          });
        }
      }

      const { dateStr } = getDhakaTime();
      const now = new Date();
      const checkOutStatus = evaluateCheckOutStatus(now);

      const existing = await teacherAttendanceCollection.findOne({
        teacherEmail: user.email,
        date: dateStr,
      });

      if (!existing || !existing.checkInTime) {
        return res.status(400).json({
          success: false,
          message:
            "আজকের কোনো প্রবেশ হাজিরা (Check-In) পাওয়া যায়নি। আগে Check-In সম্পন্ন করুন।",
        });
      }

      if (existing.checkOutTime) {
        return res.status(400).json({
          success: false,
          message: "আপনি আজকের প্রস্থান হাজিরা (Check-Out) ইতিমধ্যে সম্পন্ন করেছেন।",
          attendance: existing,
        });
      }

      const checkOutComment = (body.checkOutComment || body.comment || "").trim();
      const checkOutLocation = {
        lat: effectiveLat,
        lng: effectiveLng,
      };

      await teacherAttendanceCollection.updateOne(
        { _id: existing._id },
        {
          $set: {
            checkOutTime: now.toISOString(),
            checkOutStatus: checkOutStatus, // 'On Time' | 'Early'
            checkOutComment: checkOutComment || null,
            checkOutLocation: checkOutLocation,
            updatedAt: now,
          },
        }
      );

      const updatedDoc = {
        ...existing,
        checkOutTime: now.toISOString(),
        checkOutStatus,
        checkOutComment: checkOutComment || null,
        checkOutLocation,
        updatedAt: now,
      };

      res.status(200).json({
        success: true,
        message:
          checkOutStatus === "On Time"
            ? "সফলভাবে প্রস্থান হাজিরা নিশ্চিত হয়েছে! (Completed / On Time Departure)"
            : "সময় শেষ হওয়ার পূর্বে প্রস্থান সম্পন্ন হয়েছে! (Early Departure)",
        checkOutStatus,
        attendance: updatedDoc,
      });
    } catch (error) {
      console.error("Teacher Check-out error:", error);
      res.status(500).json({
        success: false,
        message: "প্রস্থান হাজিরা সাবমিট করতে সমস্যা হয়েছে।",
        error: error.message,
      });
    }
  });

  /**
   * আজকের হাজিরা স্টেটাস
   * Endpoint: GET /api/attendance/today
   */
  router.get("/api/attendance/today", async (req, res) => {
    try {
      const user = await getAuthTeacher(req);
      if (!user) {
        return res.status(401).json({
          success: false,
          message: "অনুমতি নেই। অনুগ্রহ করে লগইন করুন।",
        });
      }

      const { dateStr } = getDhakaTime();
      const attendanceRecord = await teacherAttendanceCollection.findOne({
        teacherEmail: user.email,
        date: dateStr,
      });

      res.status(200).json({
        success: true,
        today: dateStr,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          designation: user.designation,
          profileImage: user.profileImage,
        },
        attendance: attendanceRecord || null,
        madrasaLocation: MADRASA_LOCATION,
        rules: ATTENDANCE_RULES,
      });
    } catch (error) {
      console.error("Error fetching today teacher attendance:", error);
      res.status(500).json({
        success: false,
        message: "সার্ভারে সমস্যা হয়েছে।",
        error: error.message,
      });
    }
  });

  /**
   * শিক্ষকের পূর্ববর্তী হাজিরা হিস্ট্রি
   * Endpoint: GET /api/attendance/history
   */
  router.get("/api/attendance/history", async (req, res) => {
    try {
      const user = await getAuthTeacher(req);
      if (!user) {
        return res.status(401).json({
          success: false,
          message: "অনুমতি নেই।",
        });
      }

      const limit = parseInt(req.query.limit || "30", 10);
      const history = await teacherAttendanceCollection
        .find({ teacherEmail: user.email })
        .sort({ date: -1, createdAt: -1 })
        .limit(limit)
        .toArray();

      res.status(200).json({
        success: true,
        history,
      });
    } catch (error) {
      console.error("History fetch error:", error);
      res.status(500).json({
        success: false,
        message: "হিস্ট্রি লোড করতে ব্যর্থ হয়েছে।",
        error: error.message,
      });
    }
  });

  /**
   * এডমিন: শিক্ষক হাজিরা ব্যবস্থাপনা
   * Endpoint: GET /api/admin/teachers-attendance
   */
  router.get("/api/admin/teachers-attendance", async (req, res) => {
    try {
      const dateParam = req.query.date;
      const search = (req.query.search || "").trim().toLowerCase();
      const statusFilter = req.query.status || "all";

      const { dateStr: todayStr } = getDhakaTime();
      const targetDate = dateParam || todayStr;

      let teacherUsers = [];
      if (usersCollection) {
        teacherUsers = await usersCollection
          .find({ role: { $regex: /^teacher$/i } })
          .toArray()
          .catch(() => []);
      }

      const teachersProfileList = teachersCollection
        ? await teachersCollection.find({}).toArray().catch(() => [])
        : [];

      const teacherProfileByEmail = new Map();
      teachersProfileList.forEach((t) => {
        if (t.email) {
          teacherProfileByEmail.set(t.email.toLowerCase(), t);
        }
      });

      const totalTeachersCount = teacherUsers.length;

      const attendanceLogs = await teacherAttendanceCollection
        .find({ date: targetDate })
        .toArray();

      const presentTeachers = attendanceLogs.filter((log) => !!log.checkInTime);
      const presentCount = presentTeachers.length;
      const absentCount = Math.max(0, totalTeachersCount - presentCount);

      const onTimeCount = attendanceLogs.filter(
        (log) => log.checkInStatus === "On Time"
      ).length;

      const lateCount = attendanceLogs.filter(
        (log) => log.checkInStatus === "Late"
      ).length;

      const attendanceByEmail = new Map();
      attendanceLogs.forEach((log) => {
        if (log.teacherEmail) {
          attendanceByEmail.set(log.teacherEmail.toLowerCase(), log);
        }
      });

      const unifiedList = [];
      const processedEmails = new Set();

      for (const teacher of teacherUsers) {
        const emailLower = (teacher.email || "").toLowerCase();
        processedEmails.add(emailLower);

        const profile = teacherProfileByEmail.get(emailLower);
        const attendance = attendanceByEmail.get(emailLower);

        unifiedList.push({
          teacherId: teacher._id.toString(),
          teacherName:
            teacher.name || profile?.fullName || profile?.name || "নাম পাওয়া যায়নি",
          teacherEmail: teacher.email || "",
          designation: profile?.designation || teacher.designation || "শিক্ষক",
          phone: profile?.phone || teacher.phone || "",
          profileImage: teacher.image || profile?.profileImage || "",
          date: targetDate,
          hasCheckedIn: !!attendance?.checkInTime,
          checkInTime: attendance?.checkInTime || null,
          checkInStatus: attendance?.checkInStatus || "Absent",
          checkInLocation: attendance?.checkInLocation || null,
          checkInComment: attendance?.checkInComment || null,
          hasCheckedOut: !!attendance?.checkOutTime,
          checkOutTime: attendance?.checkOutTime || null,
          checkOutStatus: attendance?.checkOutStatus || null,
          checkOutLocation: attendance?.checkOutLocation || null,
          checkOutComment: attendance?.checkOutComment || null,
          attendanceId: attendance?._id?.toString() || null,
        });
      }

      for (const attendance of attendanceLogs) {
        const emailLower = (attendance.teacherEmail || "").toLowerCase();
        if (!processedEmails.has(emailLower)) {
          unifiedList.push({
            teacherId: attendance.teacherId || attendance._id.toString(),
            teacherName: attendance.teacherName || attendance.teacherEmail,
            teacherEmail: attendance.teacherEmail,
            designation: "শিক্ষক",
            phone: "",
            profileImage: "",
            date: targetDate,
            hasCheckedIn: !!attendance.checkInTime,
            checkInTime: attendance.checkInTime || null,
            checkInStatus: attendance.checkInStatus || "On Time",
            checkInLocation: attendance.checkInLocation || null,
            checkInComment: attendance.checkInComment || null,
            hasCheckedOut: !!attendance.checkOutTime,
            checkOutTime: attendance.checkOutTime || null,
            checkOutStatus: attendance.checkOutStatus || null,
            checkOutLocation: attendance.checkOutLocation || null,
            checkOutComment: attendance.checkOutComment || null,
            attendanceId: attendance._id.toString(),
          });
        }
      }

      let filteredList = unifiedList;
      if (search) {
        filteredList = filteredList.filter(
          (item) =>
            item.teacherName.toLowerCase().includes(search) ||
            item.teacherEmail.toLowerCase().includes(search) ||
            item.designation.toLowerCase().includes(search)
        );
      }

      if (statusFilter === "present") {
        filteredList = filteredList.filter((item) => item.hasCheckedIn);
      } else if (statusFilter === "absent") {
        filteredList = filteredList.filter((item) => !item.hasCheckedIn);
      } else if (statusFilter === "onTime") {
        filteredList = filteredList.filter((item) => item.checkInStatus === "On Time");
      } else if (statusFilter === "late") {
        filteredList = filteredList.filter((item) => item.checkInStatus === "Late");
      }

      res.status(200).json({
        success: true,
        date: targetDate,
        isToday: targetDate === todayStr,
        metrics: {
          totalTeachers: totalTeachersCount,
          presentToday: presentCount,
          absentToday: absentCount,
          onTimeToday: onTimeCount,
          lateToday: lateCount,
        },
        attendanceList: filteredList,
      });
    } catch (error) {
      console.error("Admin teachers attendance error:", error);
      res.status(500).json({
        success: false,
        message: "শিক্ষক হাজিরা তথ্য লোড করতে সমস্যা হয়েছে।",
        error: error.message,
      });
    }
  });

  /**
   * এডমিন: শিক্ষক মাসিক হাজিরা রিপোর্ট
   * Endpoint: GET /api/admin/teachers-attendance/monthly
   */
  router.get("/api/admin/teachers-attendance/monthly", async (req, res) => {
    try {
      const { dateStr } = getDhakaTime();
      const currentMonth = dateStr.slice(0, 7);
      const month = req.query.month || currentMonth;

      let teacherUsers = [];
      if (usersCollection) {
        teacherUsers = await usersCollection
          .find({ role: { $regex: /^teacher$/i } })
          .toArray()
          .catch(() => []);
      }

      const teachersProfileList = teachersCollection
        ? await teachersCollection.find({}).toArray().catch(() => [])
        : [];

      const teacherProfileByEmail = new Map();
      teachersProfileList.forEach((t) => {
        if (t.email) {
          teacherProfileByEmail.set(t.email.toLowerCase(), t);
        }
      });

      const attendanceLogs = await teacherAttendanceCollection
        .find({ date: { $regex: `^${month}` } })
        .sort({ date: 1 })
        .toArray();

      const distinctDates = Array.from(new Set(attendanceLogs.map((l) => l.date))).sort();
      const totalWorkingDays = distinctDates.length > 0 ? distinctDates.length : 1;

      const logsByEmail = new Map();
      attendanceLogs.forEach((log) => {
        if (!log.teacherEmail) return;
        const emailLower = log.teacherEmail.toLowerCase();
        if (!logsByEmail.has(emailLower)) {
          logsByEmail.set(emailLower, []);
        }
        logsByEmail.get(emailLower).push(log);
      });

      const teacherSummaries = [];
      const processedEmails = new Set();

      for (const teacher of teacherUsers) {
        const emailLower = (teacher.email || "").toLowerCase();
        processedEmails.add(emailLower);

        const profile = teacherProfileByEmail.get(emailLower);
        const logs = logsByEmail.get(emailLower) || [];

        const presentLogs = logs.filter((l) => !!l.checkInTime);
        const presentDays = presentLogs.length;
        const onTimeDays = logs.filter((l) => l.checkInStatus === "On Time").length;
        const lateDays = logs.filter((l) => l.checkInStatus === "Late").length;
        const earlyExitDays = logs.filter((l) => l.checkOutStatus === "Early").length;
        const absentDays = Math.max(0, totalWorkingDays - presentDays);
        const attendanceRate =
          totalWorkingDays > 0 ? Math.round((presentDays / totalWorkingDays) * 100) : 0;

        const lateComments = logs
          .filter((l) => l.checkInComment)
          .map((l) => ({ date: l.date, comment: l.checkInComment }));
        const earlyComments = logs
          .filter((l) => l.checkOutComment)
          .map((l) => ({ date: l.date, comment: l.checkOutComment }));

        teacherSummaries.push({
          teacherId: teacher._id.toString(),
          teacherName: teacher.name || profile?.fullName || profile?.name || "নাম পাওয়া যায়নি",
          teacherEmail: teacher.email || "",
          designation: profile?.designation || teacher.designation || "শিক্ষক",
          phone: profile?.phone || teacher.phone || "",
          presentDays,
          onTimeDays,
          lateDays,
          earlyExitDays,
          absentDays,
          attendanceRate,
          lateComments,
          earlyComments,
        });
      }

      res.status(200).json({
        success: true,
        month,
        totalTeachers: teacherUsers.length,
        totalWorkingDays,
        distinctDates,
        summary: teacherSummaries,
      });
    } catch (error) {
      console.error("Monthly attendance summary error:", error);
      res.status(500).json({
        success: false,
        message: "মাসিক শিক্ষক হাজিরা লোড করতে সমস্যা হয়েছে।",
        error: error.message,
      });
    }
  });

  /**
   * এডমিন: সকল শিক্ষক তালিকা (ID Card & Management)
   * Endpoint: GET /api/admin/teachers
   */
  router.get("/api/admin/teachers", async (req, res) => {
    try {
      const search = (req.query.search || "").trim();

      const query = {};
      if (search) {
        const searchRegex = new RegExp(search, "i");
        query.$or = [
          { fullName: searchRegex },
          { name: searchRegex },
          { designation: searchRegex },
          { email: searchRegex },
          { phone: searchRegex },
          { mobile: searchRegex },
          { teacherId: searchRegex },
        ];
      }

      const rawTeachers = await teachersCollection
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();

      const teachers = rawTeachers.map((t, index) => {
        const idStr = t._id ? t._id.toString() : `t-${index + 1}`;
        const fallbackIdNo = `ID NO-AIM ${String(index + 1).padStart(3, "0")}`;

        return {
          _id: idStr,
          id: idStr,
          fullName: t.fullName || t.name || "নামহীন শিক্ষক",
          designation: t.designation || "শিক্ষক",
          dateOfBirth: t.dateOfBirth || t.dob || "",
          phone: t.phone || t.mobile || "",
          bloodGroup: t.bloodGroup || t.blood || "",
          teacherId: t.teacherId || t.idNo || fallbackIdNo,
          email: t.email || "",
          profileImage: t.profileImage || t.image || t.photo || "",
          address: t.address || "",
          bio: t.bio || "",
          academic: t.academic || [],
          experience: t.experience || [],
          createdAt: t.createdAt,
        };
      });

      res.status(200).json({
        success: true,
        data: teachers,
        total: teachers.length,
      });
    } catch (error) {
      console.error("GET /api/admin/teachers error:", error);
      res.status(500).json({
        success: false,
        message: "শিক্ষকদের তালিকা লোড করতে সমস্যা হয়েছে।",
        error: error.message,
      });
    }
  });

  /**
   * এডমিন: শিক্ষক তথ্য আপডেট (ID Card & Management)
   * Endpoint: PATCH /api/admin/teachers
   */
  router.patch("/api/admin/teachers", async (req, res) => {
    try {
      const body = req.body || {};
      const { id, _id, ...updateFields } = body;
      const targetId = id || _id;

      if (!targetId) {
        return res.status(400).json({
          success: false,
          message: "শিক্ষকের আইডি দেওয়া হয়নি।",
        });
      }

      let filter = {};
      if (ObjectId.isValid(targetId)) {
        try {
          filter = { $or: [{ _id: new ObjectId(targetId) }, { _id: targetId }] };
        } catch {
          filter = { _id: targetId };
        }
      } else {
        filter = { _id: targetId };
      }

      delete updateFields._id;
      delete updateFields.id;
      updateFields.updatedAt = new Date().toISOString();

      const result = await teachersCollection.updateOne(filter, {
        $set: updateFields,
      });

      res.status(200).json({
        success: true,
        message: "শিক্ষকের তথ্য সফলভাবে সংরক্ষণ করা হয়েছে।",
        modifiedCount: result.modifiedCount,
      });
    } catch (error) {
      console.error("PATCH /api/admin/teachers error:", error);
      res.status(500).json({
        success: false,
        message: "তথ্য সংরক্ষণ করতে সমস্যা হয়েছে।",
        error: error.message,
      });
    }
  });

  return router;
}

module.exports = teacherRoutes;
