const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const mysql = require("mysql2");
const nodemailer = require("nodemailer");
const Razorpay = require("razorpay");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());
app.use(cors());

// MySQL connection

const db = mysql.createConnection({
  host: "157.173.217.98",           // your server IP
  user: "u432539434_farmmarketing", // DB username
  password: "Fm$123&456",           // DB password
  database: "u432539434_farmmarketing" // DB name
});

db.connect(err => {
  if (err) console.error("Database connection failed:", err);
  else console.log("Connected to MySQL");
});

// Nodemailer transporter using App Password
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,   // farmmarketing11@gmail.com
    pass: process.env.EMAIL_PASS    // your app password
  }
});

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// API route to save registration and send email
app.post("/register", async (req, res) => {
  try {
    const { name, age, occupation, student_id, mobile, email } = req.body;

    // Calculate amount (in paise)
    let amount = 29900; // Rs 299
    if (student_id && student_id.toLowerCase().startsWith("l")) {
      amount = 14900; // Rs 149 discount
    }

    // Save registration
    const [regResult] = await db.promise().query(
      `INSERT INTO registrations (name, age, occupation, student_id, mobile, email)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, age, occupation, student_id, mobile, email]
    );
    const registration_id = regResult.insertId;

    // Create Razorpay order
    const order = await razorpay.orders.create({
      amount: amount,
      currency: "INR",
      receipt: `receipt_${registration_id}`
    });

    // Save order in payments table
    await db.promise().query(
      `INSERT INTO payments (registration_id, razorpay_order_id, amount)
       VALUES (?, ?, ?)`,
      [registration_id, order.id, amount / 100]
    );

    res.json({
      registration_id,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Registration failed" });
  }
});

// API route to confirm payment and send email
app.post("/payment-success", async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

    // Update payment status
    await db.promise().query(
      `UPDATE payments 
       SET razorpay_payment_id=?, razorpay_signature=?, status='paid', created_at=NOW()
       WHERE razorpay_order_id=?`,
      [razorpay_payment_id, razorpay_signature, razorpay_order_id]
    );

    // Get user info
    const [rows] = await db.promise().query(
      `SELECT r.name, r.email 
       FROM registrations r
       JOIN payments p ON r.id = p.registration_id
       WHERE p.razorpay_order_id=?`,
      [razorpay_order_id]
    );
    const user = rows[0];

    // Send email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "Kheti se startup Webinar Registration ✅",
      html: `
        <h3>Hello ${user.name},</h3>
        <p>Your payment is successful! Here are your webinar details:</p>
        <ul>
          <li><strong>Date & Time:</strong> 21st September | 11:00 AM – 12:00 PM IST</li>
          <li><strong>Zoom Link:</strong> <a href="https://us05web.zoom.us/j/89611756547?pwd=r0wGecHMRruCadlMyDoAHyXixbJVnG.1">Join Webinar</a></li>
          <li><strong>Meeting ID:</strong> 896 1175 6547</li>
          <li><strong>Passcode:</strong> sq8yAj</li>
          <li><strong>Join instructions</strong> <a href="https://us05web.zoom.us/meetings/89611756547/invitations?signature=UqseGgOuUcxmZe5YHfc9dzlrVbyPMk-9ddyW9ENJzcg"></a></li
        </ul>
        <p>🌱 Farm Marketing Team</p>
      `
    });

    res.json({ message: "Payment confirmed and email sent!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Payment confirmation failed" });
  }
});

app.get("/razorpay-key", (req, res) => {
  res.json({ key: process.env.RAZORPAY_KEY_ID });
});


// Test route
app.get("/", (req, res) => {
  res.send("Backend running with MySQL 🚀");
});

// Start server
const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
