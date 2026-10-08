const express = require("express");

function teacherRoutes(collections) {
  const router = express.Router();
  const { teachersCollection, usersCollection } = collections;

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

  return router;
}

module.exports = teacherRoutes;
