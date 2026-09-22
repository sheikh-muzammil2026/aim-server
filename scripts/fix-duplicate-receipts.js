require("dotenv").config();
const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is not set!");
  process.exit(1);
}

async function fixDuplicates() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db("aimhabiganj");
    const financeIncomesCollection = db.collection("finance_incomes");

    // Find all duplicate INC-26090005 records sorted by createdAt ascending
    const duplicateDocs = await financeIncomesCollection
      .find({ receiptNo: "INC-26090005" })
      .sort({ createdAt: 1, _id: 1 })
      .toArray();

    console.log(`Found ${duplicateDocs.length} records with receiptNo INC-26090005`);

    if (duplicateDocs.length <= 1) {
      console.log("No duplicates to fix.");
      return;
    }

    // Leave the first one as INC-26090005, update the rest to INC-26090006, INC-26090007, etc.
    for (let i = 1; i < duplicateDocs.length; i++) {
      const doc = duplicateDocs[i];
      const newReceiptNo = `INC-2609${String(5 + i).padStart(4, "0")}`;
      await financeIncomesCollection.updateOne(
        { _id: doc._id },
        { $set: { receiptNo: newReceiptNo } }
      );
      console.log(`Updated doc ${doc._id} (${doc.payerName}) -> ${newReceiptNo}`);
    }

    console.log("All duplicate receipts re-sequenced successfully!");
  } catch (err) {
    console.error("Migration error:", err);
  } finally {
    await client.close();
  }
}

fixDuplicates();
