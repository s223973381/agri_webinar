const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const cors = require("cors");
const mysql = require("mysql2");
const nodemailer = require("nodemailer");
const Razorpay = require("razorpay");
require("dotenv").config();

const app = express(); // Must come first

// Serve static files (CSS, JS, images) from root
app.use(express.static(path.join(__dirname, "..")));

app.use(bodyParser.json());
app.use(cors());

// Landing page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../webinar.html")); // points to root webinar.html
});

// MySQL connection
const db = mysql.createConnection({
  host: "157.173.217.98",
  user: "u432539434_farmmarketing",
  password: "Fm$123&456",
  database: "u432539434_farmmarketing"
});

db.connect(err => {
  if (err) console.error("Database connection failed:", err);
  else console.log("Connected to MySQL");
});

// Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// API route to save registration
app.post("/register", async (req, res) => {
  try {
    const { name, age, occupation, student_id, mobile, email } = req.body;
    let amount = student_id?.toLowerCase().startsWith("l") ? 14900 : 29900;
    let amount_final = amount;

    const [regResult] = await db.promise().query(
      `INSERT INTO registrations (name, age, occupation, student_id, mobile, email)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, age, occupation, student_id, mobile, email]
    );
    const registration_id = regResult.insertId;

    const order = await razorpay.orders.create({
      amount,
      currency: "INR",
      receipt: `receipt_${registration_id}`
    });

    await db.promise().query(
      `INSERT INTO payments (registration_id, razorpay_order_id, amount)
       VALUES (?, ?, ?)`,
      [registration_id, order.id, amount/100 ]
    );

    res.json({
      registration_id,
      orderId: order.id,
      amount: amount_final,
      currency: order.currency
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Registration failed" });
  }
});

// API route to confirm payment
app.post("/payment-success", async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

    await db.promise().query(
      `UPDATE payments 
       SET razorpay_payment_id=?, razorpay_signature=?, status='paid', created_at=NOW()
       WHERE razorpay_order_id=?`,
      [razorpay_payment_id, razorpay_signature, razorpay_order_id]
    );

    const [rows] = await db.promise().query(
      `SELECT r.name, r.email 
       FROM registrations r
       JOIN payments p ON r.id = p.registration_id
       WHERE p.razorpay_order_id=?`,
      [razorpay_order_id]
    );
    const user = rows[0];

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "Kheti se startup Webinar Registration ✅",
      html: `
        <h3>Hello ${user.name},</h3>
        <p>Your payment is successful! Here are your webinar details:</p>
        <ul>
          <li><strong>Date & Time:</strong> 21st September | 11:00 AM – 12:00 PM IST</li>
          <li><strong>Zoom Link:</strong> <a href="https://us05web.zoom.us/j/88262994112?pwd=VqqU6ar2jlZCmpAssOgmqqAea19QDN.1">Join Webinar</a></li>
          <li><strong>Join instructions:</strong> <a href="https://us05web.zoom.us/meetings/88262994112/invitations?signature=Hk5sjUln47wIsNnayG90yjnqUf8fVlDMXI5h1AjKEak "></a></li>
          <li><strong>Meeting ID:</strong> 882 6299 4112</li>
          <li><strong>Passcode:</strong> 814106</li>

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

// Health Check API
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "API is healthy and running 🚀",
    timestamp: new Date().toISOString()
  });
});


// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));






