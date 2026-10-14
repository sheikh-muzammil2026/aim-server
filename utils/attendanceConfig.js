// Fixed Geofence Configuration for Madrasa premises
// As-Salam Ideal Madrasah (AIM), Habiganj Campus
const MADRASA_LOCATION = {
  LATITUDE: parseFloat(process.env.MADRASA_LAT || "24.381197"),
  LONGITUDE: parseFloat(process.env.MADRASA_LNG || "91.416974"),
  RADIUS_METERS: parseFloat(process.env.MADRASA_RADIUS || "200"),
  NAME: "আস-সালাম আইডিয়াল মাদরাসা (AIM) ক্যাম্পাস",
  ADDRESS: "হবিগঞ্জ সদর, হবিগঞ্জ, বাংলাদেশ",
};

// Attendance Schedule & Rules (Teachers)
// Office Hours: Morning 8:00 AM to 1:10 PM (13:10)
const ATTENDANCE_RULES = {
  OFFICE_START_HOUR: 8,
  OFFICE_START_MINUTE: 0,
  ON_TIME_CHECKIN_CUTOFF_HOUR: 8,
  ON_TIME_CHECKIN_CUTOFF_MINUTE: 5, // <= 8:05 AM is 'On Time', > 8:05 AM is 'Late'
  OFFICE_END_HOUR: 13,
  OFFICE_END_MINUTE: 10, // >= 1:10 PM is 'On Time' departure, < 1:10 PM is 'Early'
};

// Staff Attendance Schedule & Rules (2 Terms Per Day)
// Term 1 (Morning Check-in): Last time is 5:30 AM
// Term 2 (Night Check-out): Window is 10:00 PM to 10:10 PM (22:00 to 22:10)
const STAFF_ATTENDANCE_RULES = {
  // টার্ম ১: সকালের হাজিরা / চেক-ইন (সর্বশেষ সময় ভোর ৫:৩০)
  TERM_1_TITLE: "১ম টার্ম (সকালের প্রবেশ হাজিরা)",
  TERM_1_CUTOFF_HOUR: 5,
  TERM_1_CUTOFF_MINUTE: 30, // <= 05:30 AM 'On Time', > 05:30 AM 'Late'
  TERM_1_CUTOFF_LABEL: "ভোর ০৫:৩০ টা",

  // টার্ম ২: রাতের হাজিরা / চেক-আউট (রাত ১০:০০ থেকে ১০:১০)
  TERM_2_TITLE: "২য় টার্ম (রাতের প্রস্থান হাজিরা)",
  TERM_2_START_HOUR: 22,
  TERM_2_START_MINUTE: 0,
  TERM_2_END_HOUR: 22,
  TERM_2_END_MINUTE: 10,
  TERM_2_WINDOW_LABEL: "রাত ১০:০০ টা - ১০:১০ টা",
};

/**
 * Calculates distance between two GPS coordinates using the Haversine formula
 */
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  if (
    typeof lat1 !== "number" ||
    typeof lon1 !== "number" ||
    typeof lat2 !== "number" ||
    typeof lon2 !== "number" ||
    isNaN(lat1) ||
    isNaN(lon1) ||
    isNaN(lat2) ||
    isNaN(lon2)
  ) {
    return Infinity;
  }

  const R = 6371e3; // Earth's mean radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Validates whether user coordinates are within the madrasa geofence radius
 */
function isWithinMadrasaGeofence(
  userLat,
  userLng,
  customRadius = MADRASA_LOCATION.RADIUS_METERS
) {
  const distance = calculateDistanceMeters(
    Number(userLat),
    Number(userLng),
    MADRASA_LOCATION.LATITUDE,
    MADRASA_LOCATION.LONGITUDE
  );

  return {
    isInside: distance <= customRadius,
    distance: Math.round(distance),
    threshold: customRadius,
  };
}

/**
 * Extract time parts in Asia/Dhaka timezone (UTC+6)
 */
function getDhakaTime(date = new Date()) {
  const dateObj = date instanceof Date ? date : new Date(date);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(dateObj);
  const map = {};
  for (const part of parts) {
    map[part.type] = part.value;
  }

  const year = map.year;
  const month = map.month;
  const day = map.day;
  const hour = parseInt(map.hour, 10);
  const minute = parseInt(map.minute, 10);
  const second = parseInt(map.second, 10);

  const dateStr = `${year}-${month}-${day}`;
  const minutesSinceMidnight = hour * 60 + minute;

  return {
    dateStr,
    hour,
    minute,
    second,
    minutesSinceMidnight,
    formattedTime: `${hour.toString().padStart(2, "0")}:${minute
      .toString()
      .padStart(2, "0")}:${second.toString().padStart(2, "0")}`,
  };
}

/**
 * Evaluates arrival check-in status (Teacher)
 */
function evaluateCheckInStatus(date = new Date()) {
  const { minutesSinceMidnight } = getDhakaTime(date);
  const cutoffMinutes =
    ATTENDANCE_RULES.ON_TIME_CHECKIN_CUTOFF_HOUR * 60 +
    ATTENDANCE_RULES.ON_TIME_CHECKIN_CUTOFF_MINUTE;

  return minutesSinceMidnight <= cutoffMinutes ? "On Time" : "Late";
}

/**
 * Evaluates departure check-out status (Teacher)
 */
function evaluateCheckOutStatus(date = new Date()) {
  const { minutesSinceMidnight } = getDhakaTime(date);
  const cutoffMinutes =
    ATTENDANCE_RULES.OFFICE_END_HOUR * 60 +
    ATTENDANCE_RULES.OFFICE_END_MINUTE;

  return minutesSinceMidnight >= cutoffMinutes ? "On Time" : "Early";
}

/**
 * Evaluates Staff Term 1 Check-In (Morning):
 * Last time is 5:30 AM (05:30)
 */
function evaluateStaffCheckInStatus(date = new Date()) {
  const { minutesSinceMidnight } = getDhakaTime(date);
  const cutoffMinutes =
    STAFF_ATTENDANCE_RULES.TERM_1_CUTOFF_HOUR * 60 +
    STAFF_ATTENDANCE_RULES.TERM_1_CUTOFF_MINUTE; // 330 (05:30 AM)

  return minutesSinceMidnight <= cutoffMinutes ? "On Time" : "Late";
}

/**
 * Evaluates Staff Term 2 Check-Out (Night):
 * Official window is 10:00 PM to 10:10 PM (22:00 to 22:10)
 */
function evaluateStaffCheckOutStatus(date = new Date()) {
  const { minutesSinceMidnight } = getDhakaTime(date);
  const startWindowMinutes =
    STAFF_ATTENDANCE_RULES.TERM_2_START_HOUR * 60 +
    STAFF_ATTENDANCE_RULES.TERM_2_START_MINUTE; // 1320 (10:00 PM)
  const endWindowMinutes =
    STAFF_ATTENDANCE_RULES.TERM_2_END_HOUR * 60 +
    STAFF_ATTENDANCE_RULES.TERM_2_END_MINUTE; // 1330 (10:10 PM)

  if (minutesSinceMidnight < startWindowMinutes) {
    return "Early";
  }
  if (minutesSinceMidnight <= endWindowMinutes) {
    return "On Time";
  }
  return "Overtime";
}

/**
 * Returns current phase information for Staff 2-term attendance
 */
function getStaffShiftPhase(date = new Date()) {
  const { minutesSinceMidnight, formattedTime } = getDhakaTime(date);
  const t1Cutoff =
    STAFF_ATTENDANCE_RULES.TERM_1_CUTOFF_HOUR * 60 +
    STAFF_ATTENDANCE_RULES.TERM_1_CUTOFF_MINUTE;
  const t2Start =
    STAFF_ATTENDANCE_RULES.TERM_2_START_HOUR * 60 +
    STAFF_ATTENDANCE_RULES.TERM_2_START_MINUTE;
  const t2End =
    STAFF_ATTENDANCE_RULES.TERM_2_END_HOUR * 60 +
    STAFF_ATTENDANCE_RULES.TERM_2_END_MINUTE;

  return {
    currentTime: formattedTime,
    isTerm1OnTime: minutesSinceMidnight <= t1Cutoff,
    isTerm2Open: minutesSinceMidnight >= t2Start && minutesSinceMidnight <= t2End,
    isTerm2Early: minutesSinceMidnight < t2Start,
    isTerm2Overtime: minutesSinceMidnight > t2End,
    term1CutoffTime: "05:30 AM",
    term2Window: "10:00 PM - 10:10 PM",
  };
}

module.exports = {
  MADRASA_LOCATION,
  ATTENDANCE_RULES,
  STAFF_ATTENDANCE_RULES,
  calculateDistanceMeters,
  isWithinMadrasaGeofence,
  getDhakaTime,
  evaluateCheckInStatus,
  evaluateCheckOutStatus,
  evaluateStaffCheckInStatus,
  evaluateStaffCheckOutStatus,
  getStaffShiftPhase,
};
