/**
 * seed.js — One-time migration: copy all data/*.json files into MongoDB.
 * Run once with:  node seed.js
 */

const path = require('path');
const fs   = require('fs');
const {
  connectDB, Settings, Milestone, Team, News, Event,
  Product, Newsletter, Subscriber, Contact, Volunteer, Donation, Order,
} = require('./db');

const DATA_DIR = path.join(__dirname, 'data');

function readJSON(file, defaultVal = []) {
  try {
    const p = path.join(DATA_DIR, file);
    if (!fs.existsSync(p)) return defaultVal;
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) {
    console.warn(`Could not read ${file}:`, e.message);
    return defaultVal;
  }
}

async function seed() {
  await connectDB();

  // --- Settings (singleton) ------------------------------------------------
  const settingsData = readJSON('settings.json', {});
  if (Object.keys(settingsData).length) {
    await Settings.deleteMany({});
    await Settings.create(settingsData);
    console.log('✅ Settings seeded');
  }

  // --- Milestones ----------------------------------------------------------
  const milestones = readJSON('milestones.json');
  if (milestones.length) {
    await Milestone.deleteMany({});
    await Milestone.insertMany(milestones);
    console.log(`✅ ${milestones.length} Milestones seeded`);
  }

  // --- Team profiles -------------------------------------------------------
  const team = readJSON('team.json');
  if (team.length) {
    await Team.deleteMany({});
    await Team.insertMany(team);
    console.log(`✅ ${team.length} Team profiles seeded`);
  }

  // --- News ----------------------------------------------------------------
  const news = readJSON('news.json');
  if (news.length) {
    await News.deleteMany({});
    await News.insertMany(news);
    console.log(`✅ ${news.length} News articles seeded`);
  }

  // --- Events --------------------------------------------------------------
  const events = readJSON('events.json');
  if (events.length) {
    await Event.deleteMany({});
    await Event.insertMany(events);
    console.log(`✅ ${events.length} Events seeded`);
  }

  // --- Products ------------------------------------------------------------
  const products = readJSON('products.json');
  if (products.length) {
    await Product.deleteMany({});
    await Product.insertMany(products);
    console.log(`✅ ${products.length} Products seeded`);
  }

  // --- Newsletters ---------------------------------------------------------
  const newsletters = readJSON('newsletters.json');
  if (newsletters.length) {
    await Newsletter.deleteMany({});
    await Newsletter.insertMany(newsletters);
    console.log(`✅ ${newsletters.length} Newsletters seeded`);
  }

  // --- Subscribers ---------------------------------------------------------
  const subscribers = readJSON('subscribers.json');
  if (subscribers.length) {
    await Subscriber.deleteMany({});
    await Subscriber.insertMany(subscribers);
    console.log(`✅ ${subscribers.length} Subscribers seeded`);
  }

  // --- Contacts ------------------------------------------------------------
  const contacts = readJSON('contacts.json');
  if (contacts.length) {
    await Contact.deleteMany({});
    await Contact.insertMany(contacts);
    console.log(`✅ ${contacts.length} Contacts seeded`);
  }

  // --- Volunteers ----------------------------------------------------------
  const volunteers = readJSON('volunteers.json');
  if (volunteers.length) {
    await Volunteer.deleteMany({});
    await Volunteer.insertMany(volunteers);
    console.log(`✅ ${volunteers.length} Volunteers seeded`);
  }

  // --- Donations -----------------------------------------------------------
  const donations = readJSON('donations.json');
  if (donations.length) {
    await Donation.deleteMany({});
    await Donation.insertMany(donations);
    console.log(`✅ ${donations.length} Donations seeded`);
  }

  // --- Orders --------------------------------------------------------------
  const orders = readJSON('orders.json');
  if (orders.length) {
    await Order.deleteMany({});
    await Order.insertMany(orders);
    console.log(`✅ ${orders.length} Orders seeded`);
  }

  console.log('\n🎉 All data migrated to MongoDB successfully!');
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Seed error:', err);
  process.exit(1);
});
