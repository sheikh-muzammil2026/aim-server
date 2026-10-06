const express = require("express");

function teacherRoutes(collections) {
  const router = express.Router();
  const { teachersCollection } = collections;

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

  return router;
}

module.exports = teacherRoutes;
