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

let crm = {};
async function getAllReservationsWithCustomers() {
  try {
    // Get all reservation documents
    const querySnapshot = await db.collection("reservations").get();

    // Store combined reservation + customer data in this array
    let arrReservations = [];

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
      arrReservations.push({
        reservation,
        customer,
      });
    }

    console.log(arrReservations);
    return { success: true, arrReservations };
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

function setDates(reservation, customer) {
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

//- Add new reservation (CREATE)
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
    console.log(data);

    console.log("customerID:", req.params.customerID);
    console.log("type:", typeof req.params.customerID);

    //- Step 1: Calculate the duration of reservation time based on total guests
    let duration = getReservationDuration(data.totalGuests);
    console.log("Duration", duration);

    //- Step 2: Get all tables in "tables" collection from firebase
    let arrTables = await getTables();
    console.log("All Tables", arrTables);

    //- Step 3: Get all tables that can accomodate this many guests
    let arrSuitableTables = getSuitableTables(arrTables, data.totalGuests);
    console.log(
      "All tables that can accomodate this many guests",
      arrSuitableTables,
    );

    //- Step 4: Get all reservations in "reservations" collection from firebase
    let allReservations = await getReservations();
    console.log("All Reservations:", allReservations);

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
      console.log("YOOOOOOOOOOOOOOOOOOOOOOOOOOOOO");
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

//- Get all tables from "tables" collection (READ)
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

//- Get a customer via its customer ID in "customers" collection (READ)
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

//- Get all reservations including their respective customer data (READ)
app.get("/api/get-all-reservations-with-customers", async function (req, res) {
  try {
    const result = await getAllReservationsWithCustomers();
    console.log(result);

    // Always return 200 because request succeeded eventhough data does not exist
    if (!result.success) {
      return res.status(200).json({
        success: true,
        code: "NO_RESERVATIONS_FOUND",
        arrReservations: [],
        message: "No reservations found",
      });
    }
    // If data exists
    else {
      return res.status(200).json({
        success: true,
        code: "RESERVATIONS_FOUND",
        arrReservations: result.arrReservations,
      });
    }
  } catch (error) {
    console.error("Get reservations error:", error);

    return res.status(500).json({
      success: false,
      code: "GET_RESERVATIONS_FAILED",
      message: "Failed to fetch reservations",
    });
  }
});

// Get booking counts for each customer (For CRM only)
app.get("/api/get-customer-booking-count", async function (req, res) {
  try {
    // Get all reservations data (including their respective customer data)
    const result = await getAllReservationsWithCustomers();

    // If data exist
    if (result.success) {
      const arrReservationsWithCustomer = result.arrReservations;
      console.log(arrReservationsWithCustomer);

      for (const { reservation, customer } of arrReservationsWithCustomer) {
        // STEP 1: COUNT HOW MANY TIMES A CUSTOMER HAS MADE RESERVATIONS

        if (Object.hasOwn(crm, customer.name)) {
          // crm[customer.name]++;
          crm[customer.name].totalReservations =
            crm[customer.name].totalReservations + 1;
        }
        //
        else {
          // Create a new property
          // customer name as key. value is the number of reservations they made.
          // crm[customer.name] = 1;
          crm[customer.name] = {
            lastVisitDate: "",
            upcomingVisitDate: "",
            phoneNumber: customer.phoneNumber,
          };
          crm[customer.name].totalReservations = 1;
        }

        // STEP 2: FIND EACH CUSTOMER'S LAST VISIT DATE AND UPCOMING DATE
        // Create two more properties (upcomingVisitDate and lastVisitDate)
        // In this else block,
        // it is the first reservation record found for this customer.
        // Since it is at the top of the database, it is the latest reservation.
        // Check whether the reservation date is today/future
        // so it can be stored in the correct property.

        // Parse the dates so it can be compared
        setDates(reservation, customer);
      }
      console.log(crm);

      return res.status(200).json({
        success: true,
        crm,
      });
    }
    // If data does not exist
    else {
      console.log("Error at get-customer-booking-count (else block)");
      return res.status(200).json({
        success: false,
        code: "NO_DATA_RETURNED",
        message: "No reservation data returned",
      });
    }
  } catch (error) {
    console.error("Get customer booking count error:", error);

    return res.status(500).json({
      success: false,
      code: "GET_CUSTOMER_BOOKING_COUNT_FAILED",
      message: "Internal server error",
    });
  }
});

// Get dashboard summary
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

      for (const { reservation, customer } of result.arrReservations) {
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
