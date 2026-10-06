const express = require("express");

function routineRoutes(collections, helpers) {
  let app, actualCollections;
  if (collections && typeof collections.use === "function") {
    app = collections;
    actualCollections = helpers;
  } else {
    actualCollections = collections;
  }

  const router = express.Router();
  const { routinesCollection } = actualCollections;

  /**
   * রুটিন সেভ ও আপডেট করার API
   * Endpoint: POST /api/admin/routine
   */
  router.post("/api/admin/routine", async (req, res) => {
    try {
      const {
        examTitle,
        hijriYear,
        gregorianYear,
        note,
        dates,
        routineData,
        division,
        academyType,
      } = req.body;

      // ১. ভ্যালিডেশন চেক
      if (
        !examTitle ||
        !Array.isArray(dates) ||
        dates.length === 0 ||
        !Array.isArray(routineData) ||
        routineData.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "প্রয়োজনীয় তথ্য (Exam Title, Dates এবং Routine Data) সঠিকভাবে দেওয়া হয়নি।",
        });
      }

      // ২. ফিল্টার অবজেক্ট তৈরি (পরীক্ষার নাম, বিভাগ ও হিজরী বছরকে ইউনিক আইডেন্টিফায়ার হিসেবে ধরা হয়েছে)
      const filter = {
        examTitle: examTitle,
        hijriYear: hijriYear || "",
        division: division || "all",
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
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      };

      // ৪. MongoDB তে Upsert (Save or Update) করা
      const result = await routinesCollection.updateOne(filter, updateDoc, {
        upsert: true,
      });

      // ৫. সফল রেসপন্স
      res.status(200).json({
        success: true,
        message: "রুটিন ডেটাবেসে সফলভাবে সেভ ও আপডেট করা হয়েছে।",
        data: result,
      });
    } catch (error) {
      console.error("Routine save error:", error);
      res.status(500).json({
        success: false,
        message: "সার্ভারে রুটিন সেভ করতে সমস্যা হয়েছে।",
        error: error.message,
      });
    }
  });

  /**
   * পরীক্ষার রুটিন লোড করার API
   * Endpoint: GET /api/admin/routine
   */
  router.get("/api/admin/routine", async (req, res) => {
    try {
      const { examTitle, hijriYear, division } = req.query;

      if (!examTitle) {
        return res
          .status(400)
          .json({ success: false, message: "examTitle প্রয়োজন" });
      }

      const filter = {
        examTitle: examTitle,
        hijriYear: hijriYear || "",
        division: division || "all",
      };

      const existingRoutine = await routinesCollection.findOne(filter);

      if (existingRoutine) {
        res.status(200).json({ success: true, data: existingRoutine });
      } else {
        res
          .status(404)
          .json({ success: false, message: "কোনো রুটিন পাওয়া যায়নি" });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  if (app) {
    app.use(router);
  }
  return router;
}

module.exports = routineRoutes;
