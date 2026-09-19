require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error("❌ Error: MONGODB_URI is not defined in .env");
  process.exit(1);
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: false,
    deprecationErrors: true,
  },
});

async function migrate() {
  console.log("🚀 Starting database migration: Initializing 'activity' field on students...");
  const startTime = Date.now();

  try {
    await client.connect();
    console.log("✅ Connected to MongoDB Atlas");

    const database = client.db("aimhabiganj");
    const studentsCollection = database.collection("students");
    const admissionCollection = database.collection("admissions");

    // 1. Check existing students collection
    const totalStudents = await studentsCollection.countDocuments();
    console.log(`📊 Total student documents in 'students' collection: ${totalStudents}`);

    // Update students where activity is missing, null, or not set
    const studentUpdateResult = await studentsCollection.updateMany(
      {
        $or: [
          { activity: { $exists: false } },
          { activity: null },
          { activity: "" },
        ],
      },
      {
        $set: {
          activity: "active",
          updatedAt: new Date(),
        },
      }
    );

    console.log(`✅ 'students' collection updated: ${studentUpdateResult.modifiedCount} documents set to activity: 'active' (matched ${studentUpdateResult.matchedCount})`);

    // 2. Also ensure approved admissions have activity: 'active' for consistent sync
    const admissionUpdateResult = await admissionCollection.updateMany(
      {
        status: { $regex: /^approved$/i },
        $or: [
          { activity: { $exists: false } },
          { activity: null },
          { activity: "" },
        ],
      },
      {
        $set: {
          activity: "active",
          updatedAt: new Date(),
        },
      }
    );

    console.log(`✅ Approved 'admissions' collection updated: ${admissionUpdateResult.modifiedCount} documents set to activity: 'active' (matched ${admissionUpdateResult.matchedCount})`);

    // 3. Verification check
    const unmigratedCount = await studentsCollection.countDocuments({
      $or: [
        { activity: { $exists: false } },
        { activity: null },
      ],
    });

    if (unmigratedCount === 0) {
      console.log("🎉 Verification PASSED: 100% of student documents now possess an 'activity' field.");
    } else {
      console.warn(`⚠️ Warning: ${unmigratedCount} student documents still do not have an 'activity' field.`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✨ Migration completed successfully in ${elapsed}s.`);
  } catch (error) {
    console.error("❌ Migration failed with error:", error);
    process.exitCode = 1;
  } finally {
    await client.close();
    console.log("🔌 Database connection closed.");
  }
}

migrate();
