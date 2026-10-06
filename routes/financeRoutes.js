const express = require("express");
const { ObjectId } = require("mongodb");

function financeRoutes(collections) {
  const router = express.Router();
  const {
    financeIncomesCollection,
    financeExpensesCollection,
    financeCategoriesCollection,
    studentsCollection,
  } = collections;

  // ডাইনামিক রসিদ ও ভাউচার আইডি জেনারেশন হেল্পার (EXP-MMYY<Serial> ও INC-MMYY<Serial>)
  const getNextFinanceId = async (type = "income", dateStr) => {
    let yy, mm;
    if (typeof dateStr === "string" && dateStr.includes("-")) {
      const parts = dateStr.split("-");
      if (parts.length >= 2) {
        yy = parts[0].trim().slice(-2);
        mm = parts[1].trim().padStart(2, "0");
      }
    }
    if (!yy || !mm) {
      const now = new Date();
      yy = String(now.getFullYear()).slice(-2);
      mm = String(now.getMonth() + 1).padStart(2, "0");
    }

    const isIncome = type === "income";
    // ফরম্যাট: EXP-MMYY<Serial> অথবা INC-MMYY<Serial> (e.g. EXP-10260007)
    const prefix = isIncome ? `INC-${mm}${yy}` : `EXP-${mm}${yy}`;
    const col = isIncome
      ? financeIncomesCollection
      : financeExpensesCollection;
    const idField = isIncome ? "receiptNo" : "voucherNo";

    // পূর্ববর্তী ভাউচার/রসিদ থেকে সিরিয়াল নম্বর এক্সট্র্যাক্ট করার হেল্পার
    const extractSerial = (val) => {
      if (!val || typeof val !== "string") return 0;
      // EXP-MMYY<serial>, EXP-YYMM<serial>, INC-MMYY<serial>, INC-YYMM<serial>
      const m = val.match(/^(?:EXP|INC)-\d{4}(\d+)$/i);
      if (m) {
        const num = parseInt(m[1], 10);
        if (!isNaN(num) && num < 1000000) return num;
      }
      // ট্রেইলিং ডিজিটস (e.g. EXP-0001, VOUCH-0001 ইত্যাদি)
      const m2 = val.match(/(\d+)$/);
      if (m2) {
        const num = parseInt(m2[1], 10);
        if (!isNaN(num) && num < 1000000) return num;
      }
      return 0;
    };

    // ডেটাবেজ থেকে সর্বশেষ পূর্ববর্তী রেকর্ড(সমূহ) নেওয়া
    const recentDocs = await col
      .find({ [idField]: { $exists: true, $nin: [null, ""] } })
      .sort({ _id: -1 })
      .limit(20)
      .toArray();

    let lastSerial = 0;
    if (recentDocs && recentDocs.length > 0) {
      for (const doc of recentDocs) {
        const s = extractSerial(doc[idField]);
        if (s > 0) {
          lastSerial = s;
          break;
        }
      }
    }

    // পূর্ববর্তী ভাউচার নম্বর থেকে ধারাবাহিক পরবর্তী সিরিয়াল (রিসেট না হয়ে সিকোয়েন্স বজায় থাকবে)
    let candidateCounter = lastSerial + 1;
    let candidateId = `${prefix}${String(candidateCounter).padStart(4, "0")}`;

    // ডেটাবেজে ইউনিকনেস নিশ্চিত করতে সংঘর্ষ প্রতিরোধ লুপ
    while (await col.findOne({ [idField]: candidateId })) {
      candidateCounter++;
      candidateId = `${prefix}${String(candidateCounter).padStart(4, "0")}`;
    }

    return candidateId;
  };

  /**
   * ০. অটো রসিদ / ভাউচার নম্বর জেনারেট করার API
   * Endpoint: GET /api/finance/next-receipt-no
   */
  router.get("/api/finance/next-receipt-no", async (req, res) => {
    try {
      const { date, type = "income" } = req.query;
      const nextId = await getNextFinanceId(type, date);
      res.json({
        success: true,
        nextReceiptNo: nextId,
        type,
      });
    } catch (error) {
      console.error("Error generating next finance ID:", error);
      res.status(500).json({
        success: false,
        message: "রসিদ নম্বর জেনারেট করতে সমস্যা হয়েছে।",
      });
    }
  });

  /**
   * ১. আয় এন্ট্রি করার API
   * Endpoint: POST /api/finance/income
   */
  router.post("/api/finance/income", async (req, res) => {
    try {
      const {
        receiptNo,
        payerName,
        payerType,
        donorName,
        studentId,
        studentName,
        className,
        discount,
        date,
        month,
        items,
        paymentMethod,
        description,
      } = req.body;

      if (!date || !month || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: "তারিখ, মাস এবং অন্তত একটি আয়ের খাত দেওয়া আবশ্যক।",
        });
      }

      // মোট আয় হিসাব
      const itemsTotal = items.reduce(
        (sum, item) => sum + (parseFloat(item.amount) || 0),
        0,
      );
      const parsedDiscount = parseFloat(discount) || 0;
      const totalIncome = itemsTotal - parsedDiscount;
      let finalReceiptNo = receiptNo ? String(receiptNo).trim() : "";
      if (
        !finalReceiptNo ||
        (await financeIncomesCollection.findOne({
          receiptNo: finalReceiptNo,
        }))
      ) {
        finalReceiptNo = await getNextFinanceId("income", date);
      }

      const newIncome = {
        receiptNo: finalReceiptNo,
        payerName: payerName || "N/A",
        payerType: payerType || "donor",
        donorName: donorName || "",
        studentId: studentId || "",
        studentName: studentName || "",
        className: className || "",
        discount: parsedDiscount,
        date,
        month, // format: YYYY-MM
        items: items.map((item) => ({
          head: item.head,
          amount: parseFloat(item.amount) || 0,
        })),
        totalIncome,
        paymentMethod: paymentMethod || "Cash",
        description: description || "",
        status: "pending",
        createdAt: new Date(),
      };

      const result = await financeIncomesCollection.insertOne(newIncome);
      res.status(201).json({
        success: true,
        message: "আয়ের তথ্য সফলভাবে সংরক্ষণ করা হয়েছে!",
        insertedId: result.insertedId,
        data: newIncome,
      });
    } catch (error) {
      console.error("Income save error:", error);
      res.status(500).json({
        success: false,
        message: "সার্ভারে আয়ের তথ্য সংরক্ষণ করতে সমস্যা হয়েছে।",
      });
    }
  });

  /**
   * ২. ব্যয় (ভাউচার) এন্ট্রি করার API
   * Endpoint: POST /api/finance/expense
   */
  router.post("/api/finance/expense", async (req, res) => {
    try {
      const {
        voucherNo,
        receiverName,
        advanceAmount,
        chequeNo,
        date,
        month,
        items,
        description,
        reimbursement,
      } = req.body;

      if (!date || !month || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: "তারিখ, মাস এবং অন্তত একটি ব্যয়ের খাত দেওয়া আবশ্যক।",
        });
      }

      const totalExpense = items.reduce(
        (sum, item) => sum + (parseFloat(item.amount) || 0),
        0,
      );
      const parsedAdvance = parseFloat(advanceAmount) || 0;
      const balance = parsedAdvance - totalExpense;
      let finalVoucherNo = voucherNo ? String(voucherNo).trim() : "";
      if (
        !finalVoucherNo ||
        (await financeExpensesCollection.findOne({
          voucherNo: finalVoucherNo,
        }))
      ) {
        finalVoucherNo = await getNextFinanceId("expense", date);
      }

      const newExpense = {
        voucherNo: finalVoucherNo,
        receiverName: receiverName || "N/A",
        advanceAmount: parsedAdvance,
        chequeNo: chequeNo || "",
        date,
        month, // format: YYYY-MM
        items: items.map((item) => ({
          head: item.head,
          amount: parseFloat(item.amount) || 0,
          institutionName: item.institutionName || "",
          shopName: item.shopName || "",
          shopVoucher: item.shopVoucher || "",
        })),
        totalExpense,
        balance,
        description: description || "",
        reimbursement: reimbursement || null,
        status: "pending",
        createdAt: new Date(),
      };

      const result = await financeExpensesCollection.insertOne(newExpense);
      res.status(201).json({
        success: true,
        message: "ব্যয়ের তথ্য সফলভাবে ভাউচার হিসেবে সংরক্ষণ করা হয়েছে!",
        insertedId: result.insertedId,
        data: newExpense,
      });
    } catch (error) {
      console.error("Expense save error:", error);
      res.status(500).json({
        success: false,
        message: "সার্ভারে ব্যয়ের তথ্য সংরক্ষণ করতে সমস্যা হয়েছে।",
      });
    }
  });

  /**
   * ৩. মাসিক আয়ের ও ব্যয়ের সারসংক্ষেপ এবং খাত-ভিত্তিক হিসাব
   * Endpoint: GET /api/finance/summary
   */
  router.get("/api/finance/summary", async (req, res) => {
    try {
      const { month, year } = req.query;

      // Build filter for period
      const periodIncomeFilter = { status: { $ne: "pending" } };
      const periodExpenseFilter = { status: { $ne: "pending" } };

      let targetMonthLabel = "all";

      if (year && year !== "all") {
        if (month && month !== "all") {
          const formattedMonth = String(month).padStart(2, "0");
          targetMonthLabel = `${year}-${formattedMonth}`;
          periodIncomeFilter.month = targetMonthLabel;
          periodExpenseFilter.month = targetMonthLabel;
        } else {
          targetMonthLabel = `${year}`;
          periodIncomeFilter.month = { $regex: `^${year}-` };
          periodExpenseFilter.month = { $regex: `^${year}-` };
        }
      } else if (month && month !== "all") {
        const formattedMonth = String(month).padStart(2, "0");
        targetMonthLabel = formattedMonth;
        periodIncomeFilter.month = { $regex: `-${formattedMonth}$` };
        periodExpenseFilter.month = { $regex: `-${formattedMonth}$` };
      }

      // মোট আয় হিসাব (Period)
      const incomeAggregation = await financeIncomesCollection
        .aggregate([
          { $match: periodIncomeFilter },
          {
            $group: {
              _id: null,
              total: { $sum: "$totalIncome" },
            },
          },
        ])
        .toArray();

      // মোট ব্যয় হিসাব (Period)
      const expenseAggregation = await financeExpensesCollection
        .aggregate([
          { $match: periodExpenseFilter },
          {
            $group: {
              _id: null,
              total: { $sum: "$totalExpense" },
            },
          },
        ])
        .toArray();

      const totalIncome = incomeAggregation[0]?.total || 0;
      const totalExpense = expenseAggregation[0]?.total || 0;
      const netBalance = totalIncome - totalExpense;

      // সার্বিক (Overall all-time) মোট আয় ও ব্যয় হিসাব
      const overallIncomeAgg = await financeIncomesCollection
        .aggregate([
          { $match: { status: { $ne: "pending" } } },
          { $group: { _id: null, total: { $sum: "$totalIncome" } } },
        ])
        .toArray();

      const overallExpenseAgg = await financeExpensesCollection
        .aggregate([
          { $match: { status: { $ne: "pending" } } },
          { $group: { _id: null, total: { $sum: "$totalExpense" } } },
        ])
        .toArray();

      const overallIncome = overallIncomeAgg[0]?.total || 0;
      const overallExpense = overallExpenseAgg[0]?.total || 0;
      const overallBalance = overallIncome - overallExpense;

      // খাত-ভিত্তিক আয়ের হিসাব
      const incomeCategoryBreakdown = await financeIncomesCollection
        .aggregate([
          { $match: periodIncomeFilter },
          { $unwind: "$items" },
          {
            $group: {
              _id: "$items.head",
              total: { $sum: "$items.amount" },
            },
          },
          { $sort: { total: -1 } },
        ])
        .toArray();

      // খাত-ভিত্তিক ব্যয়ের হিসাব
      const expenseCategoryBreakdown = await financeExpensesCollection
        .aggregate([
          { $match: periodExpenseFilter },
          { $unwind: "$items" },
          {
            $group: {
              _id: "$items.head",
              total: { $sum: "$items.amount" },
            },
          },
          { $sort: { total: -1 } },
        ])
        .toArray();

      // সক্রিয় মাসসমূহ (Active months list)
      const activeIncomeMonths = await financeIncomesCollection.distinct(
        "month",
        { status: { $ne: "pending" } },
      );
      const activeExpenseMonths = await financeExpensesCollection.distinct(
        "month",
        { status: { $ne: "pending" } },
      );
      const activeMonths = Array.from(
        new Set([...activeIncomeMonths, ...activeExpenseMonths]),
      )
        .filter(Boolean)
        .sort()
        .reverse();

      res.status(200).json({
        success: true,
        data: {
          month: targetMonthLabel,
          totalIncome,
          totalExpense,
          netBalance,
          overallIncome,
          overallExpense,
          overallBalance,
          activeMonths,
          incomeBreakdown: incomeCategoryBreakdown.map((item) => ({
            head: item._id,
            amount: item.total,
          })),
          expenseBreakdown: expenseCategoryBreakdown.map((item) => ({
            head: item._id,
            amount: item.total,
          })),
        },
      });
    } catch (error) {
      console.error("Summary query error:", error);
      res.status(500).json({
        success: false,
        message: "সার্ভার থেকে আর্থিক সারসংক্ষেপ আনতে সমস্যা হয়েছে।",
      });
    }
  });

  /**
   * ৪. লেনদেনের ইতিহাস ও অনুসন্ধান (Pagination & Search)
   * Endpoint: GET /api/finance/transactions
   */
  router.get("/api/finance/transactions", async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const type = req.query.type || "all"; // all, income, expense
      const search = req.query.search || "";
      const startDate = req.query.startDate;
      const endDate = req.query.endDate;
      const status = req.query.status;

      const skip = (page - 1) * limit;

      const buildFilter = (isIncome) => {
        const filter = {};

        if (status && status !== "all") {
          filter.status = status;
        } else if (status !== "all") {
          filter.status = { $ne: "pending" };
        }

        if (search) {
          const regex = { $regex: search, $options: "i" };
          if (isIncome) {
            filter.$or = [
              { receiptNo: regex },
              { payerName: regex },
              { description: regex },
              { "items.head": regex },
            ];
          } else {
            filter.$or = [
              { voucherNo: regex },
              { receiverName: regex },
              { chequeNo: regex },
              { description: regex },
              { "items.head": regex },
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

      if (type === "income") {
        const filter = buildFilter(true);
        totalCount = await financeIncomesCollection.countDocuments(filter);
        const list = await financeIncomesCollection
          .find(filter)
          .sort({ date: -1, createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .toArray();
        transactions = list.map((item) => ({ ...item, type: "income" }));
      } else if (type === "expense") {
        const filter = buildFilter(false);
        totalCount = await financeExpensesCollection.countDocuments(filter);
        const list = await financeExpensesCollection
          .find(filter)
          .sort({ date: -1, createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .toArray();
        transactions = list.map((item) => ({ ...item, type: "expense" }));
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
                { $addFields: { type: "expense" } },
              ],
            },
          },
          { $sort: { date: -1, createdAt: -1 } },
          {
            $facet: {
              metadata: [{ $count: "total" }],
              data: [{ $skip: skip }, { $limit: limit }],
            },
          },
        ];

        const result = await financeIncomesCollection
          .aggregate(facetPipeline)
          .toArray();
        transactions = result[0]?.data || [];
        totalCount = result[0]?.metadata[0]?.total || 0;
      }

      res.status(200).json({
        success: true,
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        data: transactions,
      });
    } catch (error) {
      console.error("Transactions query error:", error);
      res.status(500).json({
        success: false,
        message: "সার্ভার থেকে লেনদেনের তালিকা আনতে সমস্যা হয়েছে।",
      });
    }
  });

  /**
   * ৪.৫. ট্রানজেকশন অনুমোদন করার API
   * Endpoint: PUT /api/finance/approve
   */
  router.put("/api/finance/approve", async (req, res) => {
    try {
      const { id, type } = req.body;
      if (!id || !type) {
        return res.status(400).json({
          success: false,
          message: "আইডি এবং প্রকার (income/expense) প্রদান করা আবশ্যক।",
        });
      }

      if (!ObjectId.isValid(id)) {
        return res
          .status(400)
          .json({ success: false, message: "অকার্যকর আইডি।" });
      }

      const collection =
        type === "income"
          ? financeIncomesCollection
          : financeExpensesCollection;
      const result = await collection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "approved", updatedAt: new Date() } },
      );

      if (result.matchedCount === 0) {
        return res
          .status(404)
          .json({ success: false, message: "লেনদেনটি পাওয়া যায়নি।" });
      }

      res.json({
        success: true,
        message: "লেনদেনটি সফলভাবে অনুমোদন করা হয়েছে!",
      });
    } catch (error) {
      console.error("Approve transaction error:", error);
      res
        .status(500)
        .json({ success: false, message: "সার্ভারে সমস্যা হয়েছে।" });
    }
  });

  /**
   * ৪.৬ ট্রানজেকশন ডিলিট করার API
   * Endpoint: DELETE /api/finance/delete
   */
  router.delete("/api/finance/delete", async (req, res) => {
    try {
      const { id, type } = req.body;
      if (!id || !type) {
        return res.status(400).json({
          success: false,
          message: "আইডি এবং প্রকার (income/expense) প্রদান করা আবশ্যক।",
        });
      }

      if (!ObjectId.isValid(id)) {
        return res
          .status(400)
          .json({ success: false, message: "অকার্যকর আইডি।" });
      }

      const collection =
        type === "income"
          ? financeIncomesCollection
          : financeExpensesCollection;

      const result = await collection.deleteOne({ _id: new ObjectId(id) });

      if (result.deletedCount === 0) {
        return res
          .status(404)
          .json({ success: false, message: "লেনদেনটি পাওয়া যায়নি।" });
      }

      res.json({
        success: true,
        message: "লেনদেনটি সফলভাবে মুছে ফেলা হয়েছে!",
      });
    } catch (error) {
      console.error("Delete transaction error:", error);
      res
        .status(500)
        .json({ success: false, message: "সার্ভারে সমস্যা হয়েছে।" });
    }
  });

  /**
   * ১.৫. আয় আপডেট করার API
   * Endpoint: PUT /api/finance/income/:id
   */
  router.put("/api/finance/income/:id", async (req, res) => {
    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res
          .status(400)
          .json({ success: false, message: "অকার্যকর আইডি।" });
      }

      const {
        receiptNo,
        payerName,
        payerType,
        donorName,
        studentId,
        studentName,
        className,
        discount,
        date,
        month,
        items,
        paymentMethod,
        description,
      } = req.body;

      if (!date || !month || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: "তারিখ, মাস এবং অন্তত একটি আয়ের খাত দেওয়া আবশ্যক।",
        });
      }

      // মোট আয় হিসাব
      const itemsTotal = items.reduce(
        (sum, item) => sum + (parseFloat(item.amount) || 0),
        0,
      );
      const parsedDiscount = parseFloat(discount) || 0;
      const totalIncome = itemsTotal - parsedDiscount;

      const updateDoc = {
        $set: {
          receiptNo,
          payerName: payerName || "N/A",
          payerType,
          donorName,
          studentId,
          studentName,
          className,
          discount: parsedDiscount,
          date,
          month,
          items: items.map((item) => ({
            head: item.head,
            amount: parseFloat(item.amount) || 0,
          })),
          totalIncome,
          paymentMethod: paymentMethod || "Cash",
          description: description || "",
          updatedAt: new Date(),
        },
      };

      const result = await financeIncomesCollection.updateOne(
        { _id: new ObjectId(id) },
        updateDoc,
      );
      if (result.matchedCount === 0) {
        return res
          .status(404)
          .json({ success: false, message: "আয়ের তথ্য পাওয়া যায়নি।" });
      }

      res.json({
        success: true,
        message: "আয়ের তথ্য সফলভাবে আপডেট করা হয়েছে!",
      });
    } catch (error) {
      console.error("Income update error:", error);
      res.status(500).json({
        success: false,
        message: "সার্ভারে আয়ের তথ্য আপডেট করতে সমস্যা হয়েছে।",
      });
    }
  });

  /**
   * ২.৫. ব্যয় আপডেট করার API
   * Endpoint: PUT /api/finance/expense/:id
   */
  router.put("/api/finance/expense/:id", async (req, res) => {
    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res
          .status(400)
          .json({ success: false, message: "অকার্যকর আইডি।" });
      }

      const {
        voucherNo,
        receiverName,
        advanceAmount,
        chequeNo,
        date,
        month,
        items,
        description,
        reimbursement,
      } = req.body;

      if (!date || !month || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: "তারিখ, মাস এবং অন্তত একটি ব্যয়ের খাত দেওয়া আবশ্যক।",
        });
      }

      const totalExpense = items.reduce(
        (sum, item) => sum + (parseFloat(item.amount) || 0),
        0,
      );
      const parsedAdvance = parseFloat(advanceAmount) || 0;
      const balance = parsedAdvance - totalExpense;

      const updateDoc = {
        $set: {
          voucherNo,
          receiverName: receiverName || "N/A",
          advanceAmount: parsedAdvance,
          chequeNo: chequeNo || "",
          date,
          month,
          items: items.map((item) => ({
            head: item.head,
            amount: parseFloat(item.amount) || 0,
            institutionName: item.institutionName || "",
            shopName: item.shopName || "",
            shopVoucher: item.shopVoucher || "",
          })),
          totalExpense,
          balance,
          description: description || "",
          reimbursement: reimbursement || null,
          updatedAt: new Date(),
        },
      };

      const result = await financeExpensesCollection.updateOne(
        { _id: new ObjectId(id) },
        updateDoc,
      );
      if (result.matchedCount === 0) {
        return res
          .status(404)
          .json({ success: false, message: "ব্যয়ের তথ্য পাওয়া যায়নি।" });
      }

      res.json({
        success: true,
        message: "ব্যয়ের তথ্য সফলভাবে আপডেট করা হয়েছে!",
      });
    } catch (error) {
      console.error("Expense update error:", error);
      res.status(500).json({
        success: false,
        message: "সার্ভারে ব্যয়ের তথ্য আপডেট করতে সমস্যা হয়েছে।",
      });
    }
  });

  /**
   * ৫.১. ক্যাটাগরি তৈরি করার API
   * Endpoint: POST /api/finance/categories
   */
  router.post("/api/finance/categories", async (req, res) => {
    try {
      const { name, presetFee } = req.body;
      if (!name) {
        return res
          .status(400)
          .json({ success: false, message: "খাতের নাম দেওয়া আবশ্যক।" });
      }

      const newCategory = {
        name,
        presetFee: parseFloat(presetFee) || 0,
        createdAt: new Date(),
      };

      const result = await financeCategoriesCollection.insertOne(newCategory);
      res.status(201).json({
        success: true,
        message: "খাত সফলভাবে তৈরি করা হয়েছে!",
        data: newCategory,
        insertedId: result.insertedId,
      });
    } catch (error) {
      console.error("Category save error:", error);
      res.status(500).json({
        success: false,
        message: "সার্ভারে খাত সংরক্ষণ করতে সমস্যা হয়েছে।",
      });
    }
  });

  /**
   * ৫.২. ক্যাটাগরি তালিকা পাওয়ার API
   * Endpoint: GET /api/finance/categories
   */
  router.get("/api/finance/categories", async (req, res) => {
    try {
      const categories = await financeCategoriesCollection.find({}).toArray();
      res.json({ success: true, data: categories });
    } catch (error) {
      console.error("Category fetch error:", error);
      res.status(500).json({
        success: false,
        message: "সার্ভার থেকে খাতের তালিকা আনতে সমস্যা হয়েছে।",
      });
    }
  });

  /**
   * ৫.৩. ক্যাটাগরি ডিলিট করার API
   * Endpoint: DELETE /api/finance/categories/:id
   */
  router.delete("/api/finance/categories/:id", async (req, res) => {
    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res
          .status(400)
          .json({ success: false, message: "অকার্যকর আইডি।" });
      }

      const result = await financeCategoriesCollection.deleteOne({
        _id: new ObjectId(id),
      });
      if (result.deletedCount === 0) {
        return res
          .status(404)
          .json({ success: false, message: "খাতটি পাওয়া যায়নি।" });
      }

      res.json({ success: true, message: "খাতটি সফলভাবে মুছে ফেলা হয়েছে।" });
    } catch (error) {
      console.error("Category delete error:", error);
      res.status(500).json({
        success: false,
        message: "সার্ভারে খাতটি মুছে ফেলতে সমস্যা হয়েছে।",
      });
    }
  });

  /**
   * ৬. স্টুডেন্ট আইডি দিয়ে খোঁজ করার API
   * Endpoint: GET /api/finance/students/:studentId
   */
  router.get("/api/finance/students/:studentId", async (req, res) => {
    try {
      const { studentId } = req.params;
      const student = await studentsCollection.findOne({
        studentId: String(studentId),
      });
      if (!student) {
        return res
          .status(404)
          .json({ success: false, message: "শিক্ষার্থী পাওয়া যায়নি।" });
      }

      let className = "N/A";
      if (student.divisionPreHifz?.active) {
        className = student.divisionPreHifz.class || "N/A";
      } else if (student.divisionHifz?.active) {
        className = student.divisionHifz.class || "N/A";
      } else if (student.divisionAcademy?.active) {
        className = student.divisionAcademy.class || "N/A";
      } else {
        className = student.officeUse?.recommendedClass || "N/A";
      }

      const name =
        student.studentNameBangla || student.studentNameEnglish || "N/A";
      res.json({ success: true, data: { name, className } });
    } catch (error) {
      console.error("Student fetch error:", error);
      res
        .status(500)
        .json({ success: false, message: "সার্ভারে সমস্যা হয়েছে।" });
    }
  });

  return router;
}

module.exports = financeRoutes;
