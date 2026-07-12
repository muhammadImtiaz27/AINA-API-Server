const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const app = express();

// Allow frontend to call backend
app.use(cors());

app.use(express.json());

app.get("/api/test", function (req, res) {
  // Send response back to frontend
  res.json({
    message: "API is working!",
  });
});

//- Helper functions

// Get all customers from "customers" collection
async function getAllCustomers() {
  try {
    // Stores all customers data
    let customers = [];

    // Get all customer documents
    const querySnapshot = await db.collection("customers").get();

    // Loop through each customer document
    querySnapshot.forEach((customerDoc) => {
      // Current customer
      const customer = customerDoc.data();

      // Include the customer's document id
      customer.id = customerDoc.id;

      customers.push(customer);
    });

    return customers;
  } catch (error) {
    console.error("getAllCustomers error:\n", error);

    return {
      success: false,
      customers: [],
      error: error.message,
    };
  }
}

// Get all reservations from "reservations" collection
async function getAllReservations() {
  try {
    // Stores all reservations data
    let reservations = [];

    // Get all reservation documents
    const querySnapshot = await db.collection("reservations").get();

    // Loop through each reservation document
    querySnapshot.forEach((reservationDoc) => {
      // Current reservation
      const reservation = reservationDoc.data();

      // Include the reservation's document id
      reservation.id = reservationDoc.id;

      reservations.push(reservation);
    });

    return reservations;
  } catch (error) {
    console.error("getAllReservations error:\n", error);

    return {
      success: false,
      reservations: [],
      error: error.message,
    };
  }
}

function getCustomerLastVisitDate(customers) {
  // Get today's date
  const today = new Date();

  for (const customer of customers) {
    // Store the customer's most recent past reservation
    // Start with null because we haven't found one yet
    let lastVisitDate = null;

    // Loop through all reservation dates (it has time too) for this customer
    for (const reservation of customer.dates) {
      // Extract day, month and year from the date string
      // (Example: 18/06/2026) Extract 18, 6, 2026
      const [day, month, year] = reservation.date.split("/");

      // Convert the string date into a JavaScript Date object
      // Month - 1 is needed because JavaScript months start from 0
      const reservationDate = new Date(year, month - 1, day);

      // Check if this reservation happened before today
      if (reservationDate < today) {
        // If we haven't found a past reservation yet,
        // OR this reservation is more recent than the current lastVisitDate
        if (lastVisitDate === null || reservationDate > lastVisitDate) {
          // Save this date as the new last visit date
          lastVisitDate = reservationDate;
        }
      }
    }

    // Convert the Date object back into a readable format
    // Example: "01/06/2026"
    // If no past reservation exists, store an empty string instead
    if (lastVisitDate === null) {
      customer.lastVisitDate = "";
    } else {
      customer.lastVisitDate = lastVisitDate.toLocaleDateString("en-GB");
    }
  }

  return customers;
}

function getCustomerUpcomingVisitDate(customers) {
  // Get today's date
  const today = new Date();

  for (const customer of customers) {
    // Store the customer's nearest future reservation
    // Start with null because we haven't found one yet
    let upcomingVisitDate = null;

    // Loop through all reservation dates for this customer
    for (const reservation of customer.dates) {
      // Split the date string "18/06/2026" into:
      // day = "18", month = "06", year = "2026"
      const [day, month, year] = reservation.date.split("/");

      // Convert the string date into a JavaScript Date object
      // Month - 1 is needed because JavaScript months start from 0
      const reservationDate = new Date(year, month - 1, day);

      // Check if this reservation is today or in the future
      if (reservationDate >= today) {
        // If we haven't found a future reservation yet,
        // OR this reservation is closer than the current upcomingVisitDate
        if (upcomingVisitDate === null || reservationDate < upcomingVisitDate) {
          // Save this date as the new upcoming visit date
          upcomingVisitDate = reservationDate;
        }
      }
    }

    // Convert the Date object back into a readable format
    // Example: "18/06/2026"
    // If no future reservation exists, store an empty string instead
    if (upcomingVisitDate === null) {
      customer.upcomingVisitDate = "";
    } else {
      customer.upcomingVisitDate =
        upcomingVisitDate.toLocaleDateString("en-GB");
    }
  }

  return customers;
}

// Get all tables that can accomodate this many guests
function getSuitableTables(arrTables, totalGuests) {
  // 2, 4, 6
  // 1/2 guests can book tables with 2 seats
  // 3/4 guests can book tables with 4 seats
  // 5/6 guests can book tables with 6 seats
  let arrSuitableTables = arrTables.filter(function (currTable) {
    return (
      currTable.totalSeats - totalGuests == 1 ||
      currTable.totalSeats - totalGuests == 0
    );
  });

  // Keep only tables that have enough seats
  // let arrSuitableTables = arrTables.filter((arrTables) => {
  //   return arrTables.totalSeats >= totalGuests;
  // });

  // Sort by smallest suitable table first
  arrSuitableTables.sort((a, b) => a.totalSeats - b.totalSeats);

  return arrSuitableTables;
}

// Calculate reservation duration based on total guests (For addReservations POST)
function getReservationDuration(totalGuests) {
  if (totalGuests < 4) return 60;
  else if (totalGuests == 4) return 90;
  else return 120;
}

// Get all tables in "tables" collection from firebase
async function getTables() {
  // Get all table documents from Firestore
  const querySnapshot = await db.collection("tables").get();

  // Store table data here
  let arrTables = [];

  // Add each table into the array
  querySnapshot.forEach((doc) => {
    arrTables.push(doc.data());
  });

  // Sort tables by smallest table ID first
  arrTables.sort((a, b) => a.id - b.id);

  // Return all tables
  return arrTables;
}

// Get all reservations in "reservations" collection from firebase
async function getReservations() {
  // Get all reservation documents
  const querySnapshot = await db.collection("reservations").get();

  // Store reservations here
  let arrReservations = [];

  // Add each reservation into array
  querySnapshot.forEach((doc) => {
    arrReservations.push(doc.data());
  });

  // Return all reservations
  return arrReservations;
}

// Calculate what time the reservation ends
function calculateReservationEndTime(startTime, durationMinutes) {
  // Split hour and minute from time string
  let [hours, minutes] = startTime.split(":").map(Number);

  // Create a new Date object
  let date = new Date();

  // Set the reservation start time
  date.setHours(hours);
  date.setMinutes(minutes);

  // Add reservation duration
  date.setMinutes(date.getMinutes() + durationMinutes);

  // Get updated end time
  let endHours = String(date.getHours()).padStart(2, "0");
  let endMinutes = String(date.getMinutes()).padStart(2, "0");

  // Return formatted time range
  return `${endHours}:${endMinutes}`;
}

// Check if the reservation has finished, ongoing or in the future
function getReservationStatus(
  reservationDate,
  reservationTime,
  reservationEndTime,
  parsedToday,
) {
  //- Step 1: Compare reservation date with today's date
  let reservationStatus = compareDates(reservationDate, parsedToday);

  //- Step 2: Compare reservation time with current time if it's happening today
  // If reservation is happening today
  if (reservationStatus == "Ongoing") {
    reservationStatus = compareTimes(reservationTime, reservationEndTime);
  }

  return reservationStatus;
}

// Compare two dates
function compareDates(reservationDate, parsedToday) {
  //- Parse both dates so they can be compared later
  // Today's date is already parsed in the global scope
  // So, just parse reservatioDate
  let parsedReservationDate = parseDate(reservationDate);

  //- Compare reservation date with today
  if (parsedToday > parsedReservationDate)
    return "Success"; // If reservation is in the past
  else if (parsedToday < parsedReservationDate)
    return "Booked"; // If reservation is in the future
  else return "Ongoing"; // If reservation is today

  // IMPORTANT NOTE: You can compare dates like that using >, <, >=, <=
  // But you cannot compare using ==
  // It will compare the memory location of both Date objects
  // To check if both parsed date are equal, add getTime() method
  // Example: parsedToday.getTime() == parsedReservationDate.getTime()
}

// Compare two times
function compareTimes(reservationTime, reservationEndTime) {
  // Get current date
  let currentDate = new Date();

  // Extract hours and minutes from currentDate
  let currentHours = currentDate.getHours();
  let currentMinutes = currentDate.getMinutes();

  // Extract hours and minutes from reservationTime
  // Split the string to an array.
  // Each element (Index 0 is hours, Index 1 is minutes), convert string to number data type
  let [reservationHours, reservationMinutes] = reservationTime
    .split(":")
    .map(Number);

  // Extract hours and minutes from reservationEndTime
  // Split the string to an array.
  // Each element (Index 0 is hours, Index 1 is minutes), convert string to number data type
  let [reservationEndHours, reservationEndMinutes] = reservationEndTime
    .split(":")
    .map(Number);

  // Calculate the total minutes for current time
  // Calculate the total minutes for reservation time
  // Calculate the total minutes for reservation end time
  let currentTimeTotalHours = currentHours * 60 + currentMinutes;
  let reservationTimeTotalHours = reservationHours * 60 + reservationMinutes;
  let reservationEndTimeTotalHours =
    reservationEndHours * 60 + reservationEndMinutes;

  // Compare both values. The one with smaller value, is in the past

  // Example 1:
  // 18:00 = 1080
  // 2:30 = 150

  // Example 2:
  // 00:00 = 0
  // 08:00 = 480

  console.log("Current Time:", currentTimeTotalHours);
  console.log("Reservation Time:", reservationTimeTotalHours);
  console.log("Reservation End Time: ", reservationEndTimeTotalHours);
  console.log(
    currentTimeTotalHours >= reservationTimeTotalHours &&
      currentTimeTotalHours <= reservationEndTimeTotalHours,
  );

  if (
    currentTimeTotalHours >= reservationTimeTotalHours &&
    currentTimeTotalHours <= reservationEndTimeTotalHours
  )
    // If reservation is happening now
    return "Ongoing";
  else if (reservationTimeTotalHours < currentTimeTotalHours)
    return "Success"; // If reservation's finished
  else return "Booked"; // If reservation not yet started
}

// The four functions below work together to find which table is not occupied
function findAvailableTable(
  arrSuitableTables,
  allReservations,
  newReservationDate,
  newReservationTime,
  newReservationDuration,
) {
  // Check tables one by one
  for (let currSuitableTable of arrSuitableTables) {
    // Check if this table (currSuitableTable) is available at this date and time
    let tableAvailable = isTableAvailable(
      allReservations,
      currSuitableTable.id,
      newReservationDate,
      newReservationTime,
      newReservationDuration,
    );

    // If available, return this table
    // In other words, if table is available (tableAvailable == true), return this table
    // In other words, this table is free. Return this table
    if (tableAvailable) {
      return currSuitableTable;
    }
  }

  // No table available
  return null;
}

function isTableAvailable(
  allReservations,
  tableId,
  newReservationDate,
  newReservationTime,
  newReservationDuration,
) {
  // Loop through all reservations
  for (let reservation of allReservations) {
    // Check if reservation uses the same table
    let sameTable = reservation.tableID == tableId;

    // Check if reservation is on the same date
    let sameDate = reservation.date == newReservationDate;

    // Only check time if same table and same date
    if (sameTable && sameDate) {
      // Check if reservation times overlap
      let timeClashing = isTimeClashing(
        reservation.time,
        reservation.duration,
        newReservationTime,
        newReservationDuration,
      );

      // If time overlaps, table is unavailable
      if (timeClashing) {
        console.log("Same date, table and time");
        return false;
      }
    }
  }

  // No clashes found, table is available
  return true;
}

function isTimeClashing(
  existingStartTime,
  existingDuration,
  newStartTime,
  newDuration,
) {
  // Convert existing reservation start time into minutes
  let existingStart = convertTimeToMinutes(existingStartTime);

  // Calculate existing reservation end time
  let existingEnd = existingStart + existingDuration;

  // Convert new reservation start time into minutes
  let newStart = convertTimeToMinutes(newStartTime);

  // Calculate new reservation end time
  let newEnd = newStart + newDuration;

  // Check if both reservations overlap
  return newStart < existingEnd && newEnd > existingStart;
}

function convertTimeToMinutes(time) {
  // Split time into hours and minutes
  let [hours, minutes] = time.split(":").map(Number);

  // Convert time into total minutes
  return hours * 60 + minutes;
}

async function getAllReservationsWithCustomers() {
  try {
    // Get all reservation documents
    const querySnapshot = await db.collection("reservations").get();

    // Store combined reservation + customer data in this array
    let reservationData = [];

    // Loop through each reservation document
    for (const reservationDoc of querySnapshot.docs) {
      // Get reservation data
      const reservation = reservationDoc.data();

      // Get customer document using reservation.customerId
      const customerSnap = await db
        .collection("customers")
        .doc(reservation.customerId)
        .get();

      // Get customer data
      const customer = customerSnap.data();

      // Create new property (id) in reservation to store this document's reservation id
      reservation.id = reservationDoc.id;

      // Add both reservation and customer into array
      reservationData.push({
        reservation,
        customer,
      });
    }

    return { success: true, reservationData };
  } catch (error) {
    console.error("getAllReservationsWithCustomers error:\n", error);

    return {
      success: false,
      arrReservations: [],
      error: error.message,
    };
  }
}

// async function getAllReservationsWithCustomers() {
//   // Get all reservation documents
//   const querySnapshot = await db.collection("reservations").get();

//   // Store combined reservation + customer data in this array
//   let arrReservations = [];

//   // Loop through each reservation document
//   for (const reservationDoc of querySnapshot.docs) {
//     // Get reservation data
//     const reservation = reservationDoc.data();

//     // Get customer document using reservation.customerId
//     const customerSnap = await db
//       .collection("customers")
//       .doc(reservation.customerId)
//       .get();

//     // Get customer data
//     const customer = customerSnap.data();

//     // Add both reservation and customer into array
//     arrReservations.push({
//       reservationId: reservationDoc.id,
//       reservation,
//       customer,
//     });
//   }

//   // console.log(arrReservations);

//   // If no data
//   if (arrReservations.length == 0) {
//     return { success: false };
//   }
//   // If got data
//   else {
//     return {
//       success: true,
//       arrReservations,
//     };
//   }
// }

// CRMMMMMMM
function setDates(crm, reservation, customer) {
  // Get today's date and format it
  const today = new Date();
  const day = String(today.getDate());
  const month = String(today.getMonth() + 1);
  const year = today.getFullYear();
  const formattedDate = `${day}/${month}/${year}`;

  // Parse today's date and current reservation date
  const parsedTodayDate = parseDate(formattedDate);
  const parsedReservationDate = parseDate(reservation.date);

  // console.log({ name: customer.name, date: reservation.reservationDate });

  // Compare both dates
  // If reservation is in the future
  if (parsedTodayDate < parsedReservationDate) {
    // Check if the object has upcoming date value (upcomingVisitDate property)
    // Has a value
    if (crm[customer.name].upcomingVisitDate != "") {
      // If yes, parse it so we can compare it with the current reservation date
      const parsedUpcomingReservationDate = parseDate(
        crm[customer.name].upcomingVisitDate,
      );

      // Check if the current reservation date is before the crm.upcomingVisitDate
      // In other words, it is closer to today but after today
      if (parsedReservationDate < parsedUpcomingReservationDate) {
        // crm.lastVisitDate = reservation.reservationDate;
        crm[customer.name].upcomingVisitDate = reservation.date;
      }
    } else {
      // crm.upcomingVisitDate = reservation.reservationDate;
      crm[customer.name].upcomingVisitDate = reservation.date;
    }
  }
  // If reservation is in the past
  else if (parsedTodayDate > parsedReservationDate) {
    // Check if the object has last visit date value (lastVisitDate property)
    // Has a value
    if (crm[customer.name].lastVisitDate != "") {
      // If yes, parse it so we can compare it with the current reservation date
      const parsedPastReservationDate = parseDate(
        crm[customer.name].lastVisitDate,
      );

      // Check if the current reservation date is after the crm.lastVisitDate
      // In other words, check if this reservation happened more closer to today or today
      // If it is more closer to today
      if (parsedReservationDate > parsedPastReservationDate) {
        crm[customer.name].lastVisitDate = reservation.date;
        // crm.lastVisitDate = reservation.reservationDate;
      }
      // If it is today
      else if (parsedReservationDate == parsedPastReservationDate) {
        crm[customer.name].lastVisitDate = reservation.reservationDate;
        // crm.lastVisitDate = reservation.reservationDate;
      }
    }
    // Does not have a value
    else {
      crm[customer.name].lastVisitDate = reservation.date;
      // crm.lastVisitDate = reservation.reservationDate;
    }
  }
  // If reservation is today
  else {
    // (Finish this! if you can figure out)
    crm[customer.name].lastVisitDate = reservation.date;
    // crm.lastVisitDate = reservation.reservationDate;
  }

  return crm;
}

function parseDate(dateStr) {
  const [day, month, year] = dateStr.split("/");

  // Month starts from 0 in JavaScript
  return new Date(year, month - 1, day);
}

function calculateReservationEndTime(startTime, durationMinutes) {
  console.log(startTime, durationMinutes);

  // Split hour and minute from time string
  let [hours, minutes] = startTime.split(":").map(Number);

  // Create a new Date object
  let date = new Date();

  // Set the reservation start time
  date.setHours(hours);
  date.setMinutes(minutes);

  // Add reservation duration
  date.setMinutes(date.getMinutes() + durationMinutes);

  // Get updated end time
  let endHours = String(date.getHours()).padStart(2, "0");
  let endMinutes = String(date.getMinutes()).padStart(2, "0");

  // Return formatted time range
  return `${endHours}:${endMinutes}`;
}

function isReservationToday(reservationDateStr) {
  // Get today's date and format it as dd/mm/yyyy
  const date = new Date();
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const todayDate = `${day}/${month}/${year}`;

  // Parse today's date and reservation date string so they can be compared
  const parsedTodayDate = parseDate(todayDate);
  const parsedReservationDate = parseDate(reservationDateStr);

  if (parsedTodayDate.getTime() == parsedReservationDate.getTime())
    return true; // If reservation is today
  else return false; // If reservation is not today
}

function isDateInCurrentWeek(reservationDate) {
  // Parse reservation date
  let parsedReservationDate = parseDate(reservationDate);

  // Get today's date
  let today = new Date();

  // Get current day number ---> Use getDay() method
  // Sunday = 0
  // Monday = 1
  // Tuesday = 2
  // Wednesday = 3
  // Thursday = 4
  // Friday = 5
  // Saturday = 6
  // If today is Friday, getDay() returns 5
  // currentDay = 5
  let currentDay = today.getDay();

  // Get start of current week (for now, it is equal to today's date)
  let startOfWeek = new Date(today);

  // Start of week is always Sunday. Not Monday. Sunday = 0
  // Let's say today is Friday. Friday = 5
  // We need move back from Friday to Sunday
  // We move back by subtracting 5
  // To move back, we need the day value of today
  // Today Friday is 15/5/2026
  // today.getDate() = 15
  // 15 - 5 = 10
  // 10/5/2026 (Sunday)
  // startOfWeek.setDate(10) becomes 10 May 2026
  startOfWeek.setDate(today.getDate() - currentDay);

  // This sets the time to 00:00:00.000
  // Basically means the VERY START of the day
  startOfWeek.setHours(0, 0, 0, 0);

  // Get end of current week
  let endOfWeek = new Date(startOfWeek);

  // Since we have the start of the current week
  // we can easily move from the start to the end by adding 6,
  // cuz it takes 6 days from Sunday to Saturday
  // we need to move from Sunday to the end of current week
  // From Sunday to Saturday. Saturday is always the end of the week.
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  // This sets the time to 23:59:59.999
  // Basically means the VERY END of the day
  endOfWeek.setHours(23, 59, 59, 999);

  // Check if the reservation date is between the start of current week and end of current week
  return (
    parsedReservationDate >= startOfWeek && parsedReservationDate <= endOfWeek
  );
}

function getReservationDay(reservationDate) {
  // Use getDay() method to find out if reservation date is monday, tuesday, etc.
  // Sunday = 0
  // Monday = 1
  // Tuesday = 2
  // Wednesday = 3
  // Thursday = 4
  // Friday = 5
  // Saturday = 6
  // If it returns 5, then it means reservation date is friday

  // To use getDay(), convert the reservation date string to date object
  // Extract day, month, year
  let [day, month, year] = reservationDate.split("/").map(Number);
  let date = new Date(year, month - 1, day); // Create Date object

  // List of day names
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  // Return matching day name
  return days[date.getDay()];
}

function isFutureReservation(date, time) {
  // date format: DD/MM/YYYY

  const [day, month, year] = date.split("/").map(Number);

  const [hours, minutes] = time.split(":").map(Number);

  const reservationDateTime = new Date(year, month - 1, day, hours, minutes);

  const currentDateTime = new Date();

  return reservationDateTime > currentDateTime;
}

//- ----------------- ENDPOINTS FOR ARTIFICIAL INTELLIGENCE -----------------
//- Add reservation from AI chatbot
app.post("/api/ai/addReservation", async function (req, res) {
  try {
    const data = req.body;

    // Step 1: Check required fields
    if (
      !data.name ||
      !data.phoneNumber ||
      !data.email ||
      data.totalGuests == null ||
      !data.date ||
      !data.time
    ) {
      return res.status(400).json({
        success: false,
        code: "MISSING_FIELDS",
        message: "All fields are required",
      });
    }

    // Step 2: Convert guest count to number
    data.totalGuests = Number(data.totalGuests);

    // Step 3: Validate guest count
    // Guest count must be a whole number
    if (!Number.isInteger(data.totalGuests)) {
      return res.status(400).json({
        success: false,
        code: "INVALID_GUEST_COUNT",
        message: "Guest count must be a whole number",
      });
    }

    // Guest number must be between 1 and 6
    if (
      Number.isNaN(data.totalGuests) ||
      data.totalGuests < 1 ||
      data.totalGuests > 6
    ) {
      return res.status(400).json({
        success: false,
        code: "INVALID_GUEST_COUNT",
        message: "Guest count must be between 1 and 6",
      });
    }

    // Step 4: Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(data.email)) {
      return res.status(400).json({
        success: false,
        code: "INVALID_EMAIL",
        message: "Invalid email address",
      });
    }

    // Step 5: Validate date format (DD/MM/YYYY)
    const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;

    if (!dateRegex.test(data.date)) {
      return res.status(400).json({
        success: false,
        code: "INVALID_DATE_FORMAT",
        message: "Date must be in DD/MM/YYYY format",
      });
    }

    // Step 6: Validate time format (HH:mm)
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

    if (!timeRegex.test(data.time)) {
      return res.status(400).json({
        success: false,
        code: "INVALID_TIME_FORMAT",
        message: "Time must be in HH:mm format",
      });
    }

    // Step 7: Check if the date actually exists
    const [day, month, year] = data.date.split("/").map(Number);

    const reservationDate = new Date(year, month - 1, day);

    // Make sure JavaScript didn't auto-correct the date
    if (
      reservationDate.getFullYear() !== year ||
      reservationDate.getMonth() !== month - 1 ||
      reservationDate.getDate() !== day
    ) {
      return res.status(400).json({
        success: false,
        code: "INVALID_DATE",
        message: "Invalid date",
      });
    }

    // Step 8: Combine date and time into one datetime
    // Extract hours and minutes
    const [hours, minutes] = data.time.split(":").map(Number);

    // Create reservation date and time
    const reservationDateTime = new Date(year, month - 1, day, hours, minutes);

    // Step 9: Get current date and time
    const currentDateTime = new Date();

    // Step 10: Reservation must be in the future
    if (reservationDateTime <= currentDateTime) {
      return res.status(400).json({
        success: false,
        code: "INVALID_RESERVATION_DATETIME",
        message: "Reservation date and time must be in the future",
      });
    }

    // Step 11: Calculate reservation duration
    let duration = getReservationDuration(data.totalGuests);

    // Step 12: Get all tables
    let arrTables = await getTables();

    // Step 13: Find tables that can fit the guests
    let arrSuitableTables = getSuitableTables(arrTables, data.totalGuests);

    // Step 14: Get all reservations
    let allReservations = await getReservations();

    // Step 15: Find an available table
    let availableTable = findAvailableTable(
      arrSuitableTables,
      allReservations,
      data.date,
      data.time,
      duration,
    );

    // Step 16: Stop if no table is available
    if (availableTable == null) {
      return res.status(409).json({
        success: false,
        code: "NO_TABLE_AVAILABLE",
        message: "No available table for this reservation",
      });
    }

    // Step 17: Check if customer already exists
    const customerQuery = await db
      .collection("customers")
      .where("phoneNumber", "==", data.phoneNumber)
      .get();

    let customerId;

    // Existing customer found
    if (!customerQuery.empty) {
      customerId = customerQuery.docs[0].id;
    }

    // Customer does not exist
    else {
      const customerDoc = await db.collection("customers").add({
        name: data.name,
        phoneNumber: data.phoneNumber,
        email: data.email,
      });

      customerId = customerDoc.id;
    }

    // Step 18: Create reservation record
    await db.collection("reservations").add({
      customerId: customerId,
      totalGuests: data.totalGuests,
      date: data.date,
      time: data.time,
      duration: duration,
      tableID: availableTable.id,
    });

    // Step 19: Return success response
    return res.status(201).json({
      success: true,
      message: "Reservation created successfully",
      tableID: availableTable.id,
    });
  } catch (error) {
    console.error("AI reservation error:", error);

    return res.status(500).json({
      success: false,
      code: "UNKNOWN_ERROR",
      message: "Internal server error",
    });
  }
});

//- Get all reservations of a customer
app.post("/api/ai/getCustomerReservations", async function (req, res) {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        code: "MISSING_PHONE_NUMBER",
        message: "Phone number is required",
      });
    }

    // Step 1: Find customer using phone number
    const customerQuery = await db
      .collection("customers")
      .where("phoneNumber", "==", phoneNumber)
      .get();

    // Step 2: If customer does not exist
    // If the customer has never made a reservation before,
    // simply return an empty reservation list.
    if (customerQuery.empty) {
      return res.status(200).json({
        success: true,
        reservations: [],
      });
    }

    // Step 3: Store customer's document ID
    const customerId = customerQuery.docs[0].id;

    // Step 4: Find all reservations belonging to this customer in Firebase
    const reservationQuery = await db
      .collection("reservations")
      .where("customerId", "==", customerId)
      .get();

    // Step 5:
    // Create an array of objects
    // Each object stores a reservation
    // It has reservation ID, customer ID, date, time and totalGuests
    let reservations = [];
    reservationQuery.forEach((doc) => {
      reservations.push({
        reservationId: doc.id,
        ...doc.data(),
      });
    });

    // Step 6: Check if the reservation is in the future
    // Filter the reservations. Only store reservations not yet done (future reservations)
    reservations = reservations.filter((reservation) =>
      isFutureReservation(reservation.date, reservation.time),
    );

    // Step 7: Return all future reservations
    return res.status(200).json({
      success: true,
      reservations,
    });
  } catch (error) {
    console.error("Get customer reservations error:", error);

    return res.status(500).json({
      success: false,
      code: "UNKNOWN_ERROR",
      message: "Internal server error",
    });
  }
});

//- Cancel a reservation
app.post("/api/ai/cancelReservation", async function (req, res) {
  try {
    const { reservationId } = req.body;

    // Step 1: Check if reservation ID is provided
    if (!reservationId) {
      return res.status(400).json({
        success: false,
        code: "MISSING_RESERVATION_ID",
        message: "Reservation ID is required",
      });
    }

    // Step 2: Find reservation document
    const reservationDoc = await db
      .collection("reservations")
      .doc(reservationId)
      .get();

    // Step 3: Check if reservation exists
    if (!reservationDoc.exists) {
      return res.status(404).json({
        success: false,
        code: "RESERVATION_NOT_FOUND",
        message: "Reservation not found",
      });
    }

    // Step 4: Delete reservation
    await db.collection("reservations").doc(reservationId).delete();

    // Step 5: Return success response
    return res.status(200).json({
      success: true,
      message: "Reservation cancelled successfully",
    });
  } catch (error) {
    console.error("Cancel reservation error:", error);

    return res.status(500).json({
      success: false,
      code: "UNKNOWN_ERROR",
      message: "Internal server error",
    });
  }
});

//- Get a customer
app.post("/api/ai/getCustomer", async function (req, res) {
  try {
    const { phoneNumber } = req.body;

    // Make sure phone number is sent
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        code: "MISSING_PHONE_NUMBER",
        message: "Phone number is required",
      });
    }

    // Find customer via phone number
    const customerQuery = await db
      .collection("customers")
      .where("phoneNumber", "==", phoneNumber)
      .get();

    // If customer not found in the customers collection
    if (customerQuery.empty) {
      return res.status(404).json({
        success: false,
        code: "CUSTOMER_NOT_FOUND",
        message: "Customer not found",
      });
    }

    // Customer found
    const customer = customerQuery.docs[0].data();

    return res.status(200).json({
      success: true,
      customer,
    });
  } catch (error) {
    console.error("Get customer error:", error);

    return res.status(500).json({
      success: false,
      code: "UNKNOWN_ERROR",
      message: "Internal server error",
    });
  }
});

//- ----------------- ENDPOINTS FOR ADMIN WEBSITE -----------------
//- Add new reservation from Admin website >>>>
app.post("/api/addReservation/:customerID", async function (req, res) {
  // Note:
  // In the frontend:
  // fetch(`/api/addReservation/${urlCustomerId}`)
  // if urlCustomerId = null
  // Here in the backend, it won't be null. it will be automatically turned to "null"

  try {
    // data is the new reservation details entered by the admin
    // name, phone number, email, total guests, date and time
    const data = req.body;

    //- Step 1: Calculate the duration of reservation time based on total guests
    let duration = getReservationDuration(data.totalGuests);
    console.log("Duration", duration);

    //- Step 2: Get all tables in "tables" collection from firebase
    let arrTables = await getTables();

    //- Step 3: Get all tables that can accomodate this many guests
    let arrSuitableTables = getSuitableTables(arrTables, data.totalGuests);

    //- Step 4: Get all reservations in "reservations" collection from firebase
    let allReservations = await getReservations();

    //- Step 5: Find which table is not occupied
    let availableTable = findAvailableTable(
      arrSuitableTables,
      allReservations,
      data.date,
      data.time,
      duration,
    );
    console.log("Available table:", availableTable);

    //- Step 6: Display error message if table is not available for this new reservation
    if (availableTable == null) {
      // This line will skip all the way down to the catch block
      throw new Error("NO_TABLE_AVAILABLE");
    }

    //- Step 6: If table is available, store customer details to "customers" collection
    // Save customer data into the "customers" collection
    // In other words,
    // store the result in customerDoc so we can access the new customer document ID
    // If a record of this customer already exist, then only store reservation data

    if (req.params.customerID != "null") {
      console.log("HEREEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE");
      //- Step 7: Store reservation details to "reservation" collection
      await db.collection("reservations").add({
        customerId: req.params.customerID,
        totalGuests: data.totalGuests,
        date: data.date,
        time: data.time,
        duration: duration,
        tableID: availableTable.id,
      });
    }
    // Only add a new document to the customers collection if this customer does not already exist.
    // Each customer document should be unique, so duplicate customer records are not allowed.
    else {
      const customerDoc = await db.collection("customers").add({
        name: data.name,
        phoneNumber: data.phoneNumber,
        email: data.email,
      });

      //- Step 7: Store reservation details to "reservation" collection
      await db.collection("reservations").add({
        customerId: customerDoc.id,
        totalGuests: data.totalGuests,
        date: data.date,
        time: data.time,
        duration: duration,
        tableID: availableTable.id,
      });
    }

    //- Step 8: Send successful message back to frontend
    console.log("Customer and reservation added successfully!");
    return res.status(201).json({
      success: true,
      message: "Customer and reservation added successfully!",
    });
  } catch (error) {
    //- Dealing with errors
    console.error("Add reservation error:\n", error);

    // Identify what is the exact error

    // Possible Error #1: Could not find any available table
    if (error.message == "NO_TABLE_AVAILABLE") {
      return res.status(409).json({
        success: false,
        code: "NO_TABLE_AVAILABLE",
        message: "No available table for this reservation",
      });
    }

    // Unexpected error
    return res.status(500).json({
      success: false,
      code: "UNKNOWN_ERROR",
      message: "Internal server error",
    });
  }

  //   res.json({
  //     message: "Backend received reservation data!",
  //     data,
  //   });
});

//- Get all reservations including their respective customer data (READ)
// app.get("/api/get-all-reservations-with-customers", async function (req, res) {
//   try {
//     const result = await getAllReservationsWithCustomers();
//     console.log(result);

//     // Always return 200 because request succeeded eventhough data does not exist
//     if (!result.success) {
//       return res.status(200).json({
//         success: true,
//         code: "NO_RESERVATIONS_FOUND",
//         arrReservations: [],
//         message: "No reservations found",
//       });
//     }
//     // If data exists
//     else {
//       return res.status(200).json({
//         success: true,
//         code: "RESERVATIONS_FOUND",
//         arrReservations: result.arrReservations,
//       });
//     }
//   } catch (error) {
//     console.error("Get reservations error:", error);

//     return res.status(500).json({
//       success: false,
//       code: "GET_RESERVATIONS_FAILED",
//       message: "Failed to fetch reservations",
//     });
//   }
// });

//- Get all reservations and customers who made those reservations (New version)
app.get("/api/get-reservations-and-customers", async function (req, res) {
  try {
    // Step 1: Get today's date and parse it
    const date = new Date();
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    const today = `${day}/${month}/${year}`;

    // Parse today's date, so it can be compared with other dates
    const parsedToday = parseDate(today);

    // Step 2: Get all reservations and customers
    const reservationResult = await getAllReservationsWithCustomers();
    console.log(reservationResult);

    // Step 3: Loop each reservation to do calculate reservation end time and status
    for (const { reservation, customer } of reservationResult.reservationData) {
      console.log(reservation);
      console.log(customer);

      // Calculate what time the reservation ends
      reservation.endTime = calculateReservationEndTime(
        reservation.time,
        reservation.duration,
      );

      // Check if the reservation is in the past, present or future
      reservation.status = getReservationStatus(
        reservation.date,
        reservation.time,
        reservation.endTime,
        parsedToday,
      );

      // Step 4: Create a button that tells reservation's status
      if (reservation.status == "Ongoing") {
        reservation.button = `<button type="button" class="btn btn-outline-warning">${reservation.status}</button>`;
      } else if (reservation.status == "Success") {
        reservation.button = `<button type="button" class="btn btn-outline-success">${reservation.status}</button>`;
      } else if (reservation.status == "Booked") {
        reservation.button = `<button data-id=${reservation.id} type="button" class="btn btn-outline-primary btn-delete">${reservation.status}</button>`;
      } else {
        reservation.button = `<button type="button" class="btn btn-outline-danger">${reservation.status}</button>`;
      }
    }

    // Step 4: Send data back
    return res.status(200).json({
      success: true,
      code: "RESERVATIONS_CUSTOMERS_FOUND",
      reservationResult,
    });
  } catch (error) {
    console.error("Get reservations error:", error);

    return res.status(500).json({
      success: false,
      code: "GET_RESERVATIONS_FAILED",
      message: "Failed to fetch reservations",
    });
  }
});

//- Get all tables from "tables" collection (READ) >>>>
app.get("/api/getAllTables", async function (req, res) {
  try {
    let arrTables = await getTables();
    res.json({
      success: true,
      arrTables,
    });
  } catch (error) {
    // Deal with errors
    console.error("Get all tables error:\n", error);

    return res.status(500).json({
      success: false,
      code: "GET_TABLES_FAILED",
      message: "Failed to fetch tables",
    });
  }
});

//- Get a customer via its customer ID in "customers" collection (READ) >>>>
// (customer id is that customer's document id)
app.get("/api/getCustomer/:id", async function (req, res) {
  try {
    // Get customer id from url
    const customerID = req.params.id;

    // Point to customer document
    const customerRef = db.collection("customers").doc(customerID);

    // Get customer document
    const customerSnap = await customerRef.get();

    // Customer exist
    if (customerSnap.exists) {
      console.log(customerSnap.data());
      return res.status(200).json({
        success: true,
        customer: customerSnap.data(),
      });
    }
    // Customer does not exist
    else {
      return res.status(404).json({
        success: false,
        code: "CUSTOMER_NOT_FOUND",
        message: "Customer not found",
      });
    }
  } catch (error) {
    console.error("Get customer error:", error);

    return res.status(500).json({
      success: false,
      code: "GET_CUSTOMER_FAILED",
      message: "Failed to fetch customer",
    });
  }
});

//- Get CRM details (Another version) >>>>
app.get("/api/get-crm", async function (req, res) {
  try {
    // Step 1: Get all customers
    let customers = await getAllCustomers();

    // Step 2: Get all reservations
    const reservations = await getAllReservations();

    // Step 3: Create four new properties in each customer object
    for (const customer of customers) {
      customer.totalBookings = 0;
      customer.lastVisitDate = "";
      customer.upcomingVisitDate = "";
      customer.dates = [];
    }

    // Step 4: Count total bookings made by each customer
    for (const customer of customers) {
      for (const reservation of reservations) {
        if (customer.id == reservation.customerId) {
          customer.totalBookings++;
        }
      }
    }

    // Step 5: For each customer, store all of their reservation dates
    for (const customer of customers) {
      for (const reservation of reservations) {
        if (customer.id == reservation.customerId) {
          customer.dates.push({
            date: reservation.date,
            time: reservation.time,
          });
        }
      }
    }

    // Step 6: For each customer, find their last visit date
    customers = getCustomerLastVisitDate(customers);

    // Step 7: For each customer, find their upcoming visit date
    customers = getCustomerUpcomingVisitDate(customers);

    return res.status(200).json({
      status: "success",
      customers,
    });
  } catch (error) {
    console.error("get crm error\n:", error);

    return res.status(500).json({
      success: false,
      code: "GET_CRM_ERROR",
      message: "Internal server error",
    });
  }
});

//- Get Customer Details >>>>
app.get("/api/get-customer-details", async function (req, res) {
  try {
    const customerId = req.query.id;

    // Find customer by ID
    const customerDoc = await db.collection("customers").doc(customerId).get();

    // If customer does not exist
    if (!customerDoc.exists) {
      return res.status(404).json({
        status: "error",
        message: "Customer not found",
      });
    }

    // If customer exist, store it in an object including their customer document id
    const customerDetails = {
      id: customerDoc.id,
      ...customerDoc.data(),
    };

    // Get customer's reservations
    const reservationSnapshot = await db
      .collection("reservations")
      .where("customerId", "==", customerId)
      .get();

    const reservationDetails = [];

    // Store reservation data in array. An array of objects
    reservationSnapshot.forEach((reservationDoc) => {
      reservationDetails.push({
        reservationId: reservationDoc.id,
        ...reservationDoc.data(),
      });
    });

    // Send customer and reservation data
    return res.status(200).json({
      status: "success",
      customerDetails,
      reservationDetails,
    });
  } catch (error) {
    console.error("getCustomerDetails error:\n", error);

    // Handle server error
    return res.status(500).json({
      status: "error",
      customerDetails: null,
      reservationDetails: [],
      error: error.message,
    });
  }
});

//- Delete a reservation >>>>
app.delete("/api/delete-reservation/:reservationId", async (req, res) => {
  try {
    const reservationId = req.params.reservationId;

    await db.collection("reservations").doc(reservationId).delete();

    res.json({
      success: true,
      message: "Reservation deleted successfully",
    });
  } catch (error) {
    console.error(error);

    res.json({
      success: false,
      error: error.message,
    });
  }
});

//- Get dashboard summary >>>>
app.get("/api/get-dashboard-summary", async function (req, res) {
  try {
    //- Step 1: Get all reservations and their respective customers
    const result = await getAllReservationsWithCustomers();
    console.log(result);

    // If got data
    if (result.success) {
      //- Step 2: Loop each object in the array (each object contains reservation and their respective customer)
      // At the end of this loop, it will:
      // 1. count the total customers
      // 2. count total reservations
      // 3. count how many reservations are happening today
      // Variables defined outside of then() scope
      let totalCustomers = 0;
      let totalReservations = 0;
      let totalTodayReservations = 0;
      let arrOfTodayReservations = []; // Array of objects
      let currWeekOfReservations = {
        Monday: 0,
        Tuesday: 0,
        Wednesday: 0,
        Thursday: 0,
        Friday: 0,
        Saturday: 0,
        Sunday: 0,
      };

      for (const { reservation, customer } of result.reservationData) {
        // Get total customers this reservation has and add it to totalCustomers
        totalCustomers = totalCustomers + Number(reservation.totalGuests);

        // Add 1 to store total reservations
        totalReservations = totalReservations + 1;

        // Check if this reservation is happening today
        if (isReservationToday(reservation.date)) {
          totalTodayReservations++; // If yes, add 1

          // Calculate today's reservation end time
          let todayReservationEndTime = calculateReservationEndTime(
            reservation.time,
            reservation.duration,
          );

          // Store this reservation (this is today's reservation) in the array
          // So that we can display a table of today's reservation later
          arrOfTodayReservations.push({
            customerName: customer.name,
            customerPhoneNumber: customer.phoneNumber,
            customerTableNumber: reservation.tableID,
            customerReservationTime: `${reservation.time}-${todayReservationEndTime}`,
          });
        }

        // Check if this reservation date is happening this week
        if (isDateInCurrentWeek(reservation.date)) {
          // If yes, get this reservation's day (Like Monday, Tuesday, ..., Sunday)
          let reservationDay = getReservationDay(reservation.date);

          // This will store total count reservation happening on this day
          // Example, on Monday, 2 reservations are happening
          // On tuesday, 4 reservations are happening.
          // Do for Monday until Sunday
          currWeekOfReservations[reservationDay]++;
        }
      }

      //- Step 3: Loop each property in this object to calculate how many reservations are happening this week
      let totalReservationsThisWeek = 0;
      for (const [day, totalReservations] of Object.entries(
        currWeekOfReservations,
      )) {
        totalReservationsThisWeek =
          totalReservationsThisWeek + totalReservations;
      }

      return res.status(200).json({
        totalCustomers,
        totalReservations,
        totalTodayReservations,
        totalReservationsThisWeek,
        arrOfTodayReservations,
        currWeekOfReservations,
      });
    }
    // If no data
    else {
      return res.status(200).json({
        success: false,
        code: "NO_DATA_RETURNED",
        message: "No reservation data returned",
      });
    }
  } catch (error) {
    console.error("get dashboard summary error\n:", error);

    return res.status(500).json({
      success: false,
      code: "GET_DASHBOARD_SUMMARY_ERROR",
      message: "Internal server error",
    });
  }
});

// Test API route
app.get("/", function (req, res) {
  res.send("Backend server is running!");
});

// Start backend server
app.listen(3000, function () {
  console.log("Server running on port 3000");
});
