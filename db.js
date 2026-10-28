/**
 * db.js — MongoDB connection + all Mongoose models for Roshni Association
 * Connects to local MongoDB (same machine) using the "roshni" database.
 */

const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/roshni';

let connected = false;
let lastError = null;

async function connectDB() {
  if (connected && mongoose.connection.readyState === 1) return;
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    connected = true;
    lastError = null;
    console.log(`✅ MongoDB connected → ${MONGO_URI.replace(/:([^@]+)@/, ':****@')}`);
  } catch (err) {
    connected = false;
    lastError = err.message;
    console.error('❌ MongoDB connection failed:', err.message);
    console.warn('⚠️  Falling back to JSON file storage.');
  }
}

function getLastError() {
  return lastError;
}

// ── Shared helper: auto-generate numeric id from Date.now() if not set ─────
const autoId = {
  id: { type: Number, default: () => Date.now() },
};

// ── 1. Settings (single document) ─────────────────────────────────────────
const settingsSchema = new mongoose.Schema({
  foundedYear:          { type: Number, default: 1991 },
  specialResidentsCount:{ type: Number, default: 42 },
  studentsEnrolledCount:{ type: Number, default: 400 },
  activeWorkshopsCount: { type: Number, default: 5 },
  residentialHousesCount:{ type: Number, default: 4 },
  organizationName:     { type: String, default: 'Roshni Association' },
  tagline:              { type: String, default: 'Society for the Welfare of Special Persons' },
  phone:                { type: String, default: '+92 42 37167791' },
  whatsapp:             { type: String, default: '+92 322 4767808' },
  email:                { type: String, default: 'pr@roshni.org.pk' },
  address:              { type: String, default: 'Karbath Soling, Bedian Road, Lahore, Pakistan' },
});

// ── 2. Milestones ──────────────────────────────────────────────────────────
const milestoneSchema = new mongoose.Schema({
  ...autoId,
  year:        { type: String, required: true },
  title:       { type: String, required: true },
  description: { type: String, default: '' },
  createdAt:   { type: Date, default: Date.now },
});

// ── 3. Team profiles ──────────────────────────────────────────────────────
const teamSchema = new mongoose.Schema({
  ...autoId,
  name:      { type: String, required: true },
  role:      { type: String, required: true },
  category:  { type: String, default: 'staff' }, // board | living | staff
  bio:       { type: String, default: '' },
  image:     { type: String, default: '/assets/images/roshni_logo.jpg' },
  createdAt: { type: Date, default: Date.now },
});

// ── 4. News articles ──────────────────────────────────────────────────────
const newsSchema = new mongoose.Schema({
  ...autoId,
  title:     { type: String, required: true },
  category:  { type: String, default: 'Village Life' },
  date:      { type: String },
  image:     { type: String },
  images:    [String],
  summary:   { type: String, required: true },
  content:   { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

// ── 5. Events ─────────────────────────────────────────────────────────────
const eventSchema = new mongoose.Schema({
  ...autoId,
  title:       { type: String, required: true },
  date:        { type: String, required: true },
  time:        { type: String, default: '10:00 AM' },
  location:    { type: String, default: 'Roshni Village, Bedian Road, Lahore' },
  category:    { type: String, default: 'Community Event' },
  description: { type: String, default: '' },
  createdAt:   { type: Date, default: Date.now },
});

// ── 6. Products ───────────────────────────────────────────────────────────
const productSchema = new mongoose.Schema({
  ...autoId,
  category:  { type: String, default: 'bakery' },
  title:     { type: String, required: true },
  workshop:  { type: String, default: 'Roshni Workshop' },
  price:     { type: Number, default: 500 },
  icon:      { type: String, default: '🎁' },
  image:     { type: String },
  images:    [String],
  desc:      { type: String, default: '' },
  inStock:   { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

// ── 7. Newsletters ────────────────────────────────────────────────────────
const newsletterSchema = new mongoose.Schema({
  ...autoId,
  subject:      { type: String, required: true },
  issueTitle:   { type: String, default: '' },
  sentDate:     { type: String },
  previewText:  { type: String, default: '' },
  content:      { type: String, default: '' },
  pdfUrl:       { type: String, default: '' },
  sentToCount:  { type: Number, default: 0 },
  createdAt:    { type: Date, default: Date.now },
});

// ── 8. Subscribers ────────────────────────────────────────────────────────
const subscriberSchema = new mongoose.Schema({
  ...autoId,
  email:        { type: String, required: true, unique: true },
  subscribedAt: { type: Date, default: Date.now },
});

// ── 9. Contacts ───────────────────────────────────────────────────────────
const contactSchema = new mongoose.Schema({
  ...autoId,
  name:      { type: String, required: true },
  email:     { type: String, required: true },
  phone:     { type: String, default: 'N/A' },
  subject:   { type: String, default: 'General Inquiry' },
  message:   { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

// ── 10. Volunteers ────────────────────────────────────────────────────────
const volunteerSchema = new mongoose.Schema({
  ...autoId,
  name:           { type: String, required: true },
  age:            { type: String, default: 'N/A' },
  email:          { type: String, required: true },
  phone:          { type: String },
  city:           { type: String, default: 'Lahore' },
  volunteerType:  { type: String, default: 'General Volunteer' },
  areaOfInterest: { type: String, default: 'General Support' },
  motivation:     { type: String, default: '' },
  createdAt:      { type: Date, default: Date.now },
});

// ── 11. Donations ─────────────────────────────────────────────────────────
const donationSchema = new mongoose.Schema({
  ...autoId,
  name:          { type: String, required: true },
  email:         { type: String, required: true },
  phone:         { type: String, default: 'N/A' },
  purpose:       { type: String, default: 'General Donation' },
  amount:        { type: Number },
  paymentMethod: { type: String, default: 'Direct Bank Transfer' },
  createdAt:     { type: Date, default: Date.now },
});

// ── 12. Orders ────────────────────────────────────────────────────────────
const orderSchema = new mongoose.Schema({
  ...autoId,
  customerName:    { type: String, required: true },
  customerPhone:   { type: String, required: true },
  deliveryAddress: { type: String, required: true },
  items:           [mongoose.Schema.Types.Mixed],
  total:           { type: Number, default: 0 },
  status:          { type: String, default: 'Pending Dispatch' },
  orderDate:       { type: Date, default: Date.now },
});

// ── Export models ─────────────────────────────────────────────────────────
const Settings   = mongoose.models.Settings   || mongoose.model('Settings',   settingsSchema);
const Milestone  = mongoose.models.Milestone  || mongoose.model('Milestone',  milestoneSchema);
const Team       = mongoose.models.Team       || mongoose.model('Team',       teamSchema);
const News       = mongoose.models.News       || mongoose.model('News',       newsSchema);
const Event      = mongoose.models.Event      || mongoose.model('Event',      eventSchema);
const Product    = mongoose.models.Product    || mongoose.model('Product',    productSchema);
const Newsletter = mongoose.models.Newsletter || mongoose.model('Newsletter', newsletterSchema);
const Subscriber = mongoose.models.Subscriber || mongoose.model('Subscriber', subscriberSchema);
const Contact    = mongoose.models.Contact    || mongoose.model('Contact',    contactSchema);
const Volunteer  = mongoose.models.Volunteer  || mongoose.model('Volunteer',  volunteerSchema);
const Donation   = mongoose.models.Donation   || mongoose.model('Donation',   donationSchema);
const Order      = mongoose.models.Order      || mongoose.model('Order',      orderSchema);

module.exports = {
  connectDB,
  getLastError,
  Settings,
  Milestone,
  Team,
  News,
  Event,
  Product,
  Newsletter,
  Subscriber,
  Contact,
  Volunteer,
  Donation,
  Order,
};
