const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// ── MongoDB / Mongoose ──────────────────────────────────────────────────────
const {
  connectDB,
  Settings, Milestone, Team, News, Event,
  Product, Newsletter, Subscriber, Contact, Volunteer, Donation, Order,
} = require('./db');

// Ensure database is connected before handling API requests (critical for serverless / Vercel)
app.use(async (req, res, next) => {
  if (req.path.startsWith('/api') || req.path === '/admin') {
    try {
      await connectDB();
    } catch(e) {}
  }
  next();
});

// Connect to MongoDB at startup (non-blocking for local server)
connectDB().catch(() => {});

// Middlewares - Support large uploads for user's own photos
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ── STATIC FILE SERVING (must be early so Vercel serves assets correctly) ──
app.use(express.static(path.join(__dirname)));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Helper to safely read and write JSON files (fallback / seed)
const DATA_DIR = path.join(__dirname, 'data');
const IMAGES_DIR = path.join(__dirname, 'assets', 'images');
const DOCS_DIR = path.join(__dirname, 'assets', 'documents');

try {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
} catch(e) {}
try {
  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
} catch(e) {}
try {
  if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true });
} catch(e) {}

function readData(file, defaultVal = []) {
  const filePath = path.join(DATA_DIR, file);
  try {
    if (!fs.existsSync(filePath)) {
      try {
        fs.writeFileSync(filePath, JSON.stringify(defaultVal, null, 2), 'utf-8');
      } catch(wErr) {}
      return defaultVal;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Error reading ${file}:`, err.message);
    return defaultVal;
  }
}

function writeData(file, data) {
  const filePath = path.join(DATA_DIR, file);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error(`Error writing ${file}:`, err.message);
    return false;
  }
}

// Helper: check if mongoose is connected
function isMongoReady() {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
}

// ── API ROUTES ─────────────────────────────────────────────────────────────

// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Roshni Association API',
    mongoReady: isMongoReady(),
    hasMongoUri: Boolean(process.env.MONGO_URI),
    timestamp: new Date().toISOString()
  });
});

// 2. Real-Time Settings & Verified Organizational Figures
app.get('/api/settings', async (req, res) => {
  const defaults = {
    foundedYear: 1991, specialResidentsCount: 42, studentsEnrolledCount: 400,
    activeWorkshopsCount: 5, residentialHousesCount: 4,
    organizationName: 'Roshni Association',
    tagline: 'Society for the Welfare of Special Persons',
    phone: '+92 42 37167791', whatsapp: '+92 322 4767808',
    email: 'pr@roshni.org.pk', address: 'Karbath Soling, Bedian Road, Lahore, Pakistan'
  };
  try {
    if (isMongoReady()) {
      let doc = await Settings.findOne();
      if (!doc) doc = await Settings.create(defaults);
      return res.json(doc.toObject());
    }
  } catch(e) { console.error('[Settings GET]', e.message); }
  res.json(readData('settings.json', defaults));
});

app.put('/api/settings', async (req, res) => {
  try {
    if (isMongoReady()) {
      const doc = await Settings.findOneAndUpdate({}, { $set: req.body }, { new: true, upsert: true });
      writeData('settings.json', doc.toObject()); // keep JSON in sync
      return res.json({ ok: true, data: doc.toObject() });
    }
  } catch(e) { console.error('[Settings PUT]', e.message); }
  const existing = readData('settings.json', {});
  const updated = { ...existing, ...req.body };
  writeData('settings.json', updated);
  res.json({ ok: true, data: updated });
});

// 3. User Photo, Monogram & Newsletter PDF Upload
app.post('/api/upload', (req, res) => {
  const { slot, base64Data, filename } = req.body;
  if (!base64Data) {
    return res.status(400).json({ ok: false, error: 'base64Data is required.' });
  }

  const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  const buffer = matches ? Buffer.from(matches[2], 'base64') : Buffer.from(base64Data, 'base64');

  const slotMap = {
    monogram: 'roshni_logo.jpg',
    village: 'village_community.jpg',
    school: 'green_earth_school.jpg',
    bakery: 'organic_bakery.jpg',
    farm: 'organic_farm.jpg',
    crafts: 'crafts_workshop.jpg'
  };

  const isPdf = (filename && filename.toLowerCase().endsWith('.pdf')) || (matches && matches[1] === 'application/pdf');
  const cleanName = filename ? path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_') : (isPdf ? `newsletter_${Date.now()}.pdf` : `upload_${Date.now()}.jpg`);
  const targetFilename = (slot && slotMap[slot]) ? slotMap[slot] : cleanName;
  
  const destDir = isPdf ? DOCS_DIR : IMAGES_DIR;
  const targetPath = path.join(destDir, targetFilename);
  const publicUrl = isPdf ? `assets/documents/${targetFilename}` : `assets/images/${targetFilename}`;

  try {
    fs.writeFileSync(targetPath, buffer);
    console.log(`[UPLOAD] Uploaded: ${targetFilename} (${buffer.length} bytes) to ${publicUrl}`);
    res.json({ ok: true, slot, url: publicUrl, filename: targetFilename });
  } catch (err) {
    console.error(`[UPLOAD] Error writing file:`, err.message);
    res.status(500).json({ ok: false, error: 'Failed to save file on server.' });
  }
});

// 4. Milestones CRUD
app.get('/api/milestones', async (req, res) => {
  try {
    if (isMongoReady()) return res.json(await Milestone.find().sort({ year: 1 }).lean());
  } catch(e) { console.error('[Milestones GET]', e.message); }
  res.json(readData('milestones.json'));
});

app.post('/api/milestones', async (req, res) => {
  const { year, title, description } = req.body;
  if (!year || !title) return res.status(400).json({ ok: false, error: 'Year and title are required.' });
  const doc = { id: Date.now(), year: String(year).trim(), title: String(title).trim(), description: description ? String(description).trim() : '' };
  try {
    if (isMongoReady()) {
      const saved = await Milestone.create(doc);
      return res.status(201).json({ ok: true, data: saved.toObject() });
    }
  } catch(e) { console.error('[Milestones POST]', e.message); }
  const list = readData('milestones.json'); list.push(doc); writeData('milestones.json', list);
  res.status(201).json({ ok: true, data: doc });
});

app.delete('/api/milestones/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    if (isMongoReady()) { await Milestone.deleteOne({ id }); return res.json({ ok: true }); }
  } catch(e) { console.error('[Milestones DELETE]', e.message); }
  let list = readData('milestones.json'); writeData('milestones.json', list.filter(m => m.id !== id));
  res.json({ ok: true, message: 'Milestone deleted.' });
});

// 4b. Team & Profiles CRUD
app.get('/api/team', async (req, res) => {
  try {
    if (isMongoReady()) return res.json(await Team.find().sort({ createdAt: -1 }).lean());
  } catch(e) { console.error('[Team GET]', e.message); }
  res.json(readData('team.json'));
});

app.post('/api/team', async (req, res) => {
  const { name, role, category, bio, image } = req.body;
  if (!name || !role) return res.status(400).json({ ok: false, error: 'Name and role are required.' });
  const doc = { id: Date.now(), name: String(name).trim(), role: String(role).trim(), category: category || 'staff', bio: bio ? String(bio).trim() : '', image: image ? String(image).trim() : '/assets/images/roshni_logo.jpg', createdAt: new Date() };
  try {
    if (isMongoReady()) {
      const saved = await Team.create(doc);
      return res.status(201).json({ ok: true, data: saved.toObject() });
    }
  } catch(e) { console.error('[Team POST]', e.message); }
  const list = readData('team.json'); list.push(doc); writeData('team.json', list);
  res.status(201).json({ ok: true, data: doc });
});

app.delete('/api/team/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    if (isMongoReady()) { await Team.deleteOne({ id }); return res.json({ ok: true }); }
  } catch(e) { console.error('[Team DELETE]', e.message); }
  let list = readData('team.json'); writeData('team.json', list.filter(t => t.id !== id));
  res.json({ ok: true, message: 'Team member deleted.' });
});

// 5. Live Real-Time Statistics
app.get('/api/stats', async (req, res) => {
  try {
    if (isMongoReady()) {
      const [contacts, volunteers, donations, orders, subscribers, news, events, products, milestones, settings] = await Promise.all([
        Contact.countDocuments(), Volunteer.countDocuments(), Donation.find().lean(),
        Order.find().lean(), Subscriber.countDocuments(), News.countDocuments(),
        Event.countDocuments(), Product.countDocuments(), Milestone.countDocuments(),
        Settings.findOne().lean()
      ]);
      const s = settings || { foundedYear: 1991, specialResidentsCount: 42, studentsEnrolledCount: 400, activeWorkshopsCount: 5, residentialHousesCount: 4 };
      const totalDonationAmount = donations.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
      const totalSalesAmount = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
      const yearsOfService = new Date().getFullYear() - (Number(s.foundedYear) || 1991);
      return res.json({ yearsOfService, foundedYear: s.foundedYear, specialResidentsCount: Number(s.specialResidentsCount) || 42, studentsEnrolledCount: Number(s.studentsEnrolledCount) || 400, activeWorkshopsCount: Number(s.activeWorkshopsCount) || 5, residentialHousesCount: Number(s.residentialHousesCount) || 4, totalMilestones: milestones, totalVolunteers: volunteers, totalContacts: contacts, totalDonations: donations.length, totalDonationAmount, totalOrders: orders.length, totalSalesAmount, totalSubscribers: subscribers, totalNews: news, totalEvents: events, totalProducts: products });
    }
  } catch(e) { console.error('[Stats GET]', e.message); }
  // JSON fallback
  const contacts = readData('contacts.json');
  const volunteers = readData('volunteers.json');
  const donations = readData('donations.json');
  const orders = readData('orders.json');
  const subscribers = readData('subscribers.json');
  const news = readData('news.json');
  const events = readData('events.json');
  const products = readData('products.json');
  const milestones = readData('milestones.json');
  const settings = readData('settings.json', { foundedYear: 1991, specialResidentsCount: 42, studentsEnrolledCount: 400, activeWorkshopsCount: 5, residentialHousesCount: 4 });
  const totalDonationAmount = donations.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  const totalSalesAmount = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const yearsOfService = new Date().getFullYear() - (Number(settings.foundedYear) || 1991);
  res.json({ yearsOfService, foundedYear: settings.foundedYear, specialResidentsCount: Number(settings.specialResidentsCount) || 42, studentsEnrolledCount: Number(settings.studentsEnrolledCount) || 400, activeWorkshopsCount: Number(settings.activeWorkshopsCount) || 5, residentialHousesCount: Number(settings.residentialHousesCount) || 4, totalMilestones: milestones.length, totalVolunteers: volunteers.length, totalContacts: contacts.length, totalDonations: donations.length, totalDonationAmount, totalOrders: orders.length, totalSalesAmount, totalSubscribers: subscribers.length, totalNews: news.length, totalEvents: events.length, totalProducts: products.length });
});

// 6. News & Media CRUD
app.get('/api/news', async (req, res) => {
  try {
    if (isMongoReady()) return res.json(await News.find().sort({ createdAt: -1 }).lean());
  } catch(e) { console.error('[News GET]', e.message); }
  res.json(readData('news.json'));
});

app.post('/api/news', async (req, res) => {
  const { title, category, date, image, images, summary, content } = req.body;
  if (!title || !summary) return res.status(400).json({ ok: false, error: 'Title and summary are required.' });
  let imgList = [];
  if (Array.isArray(images)) imgList = images.map(i => String(i).trim()).filter(Boolean);
  else if (typeof images === 'string') imgList = images.split(',').map(i => i.trim()).filter(Boolean);
  if (!imgList.length && image) imgList = [image];
  if (!imgList.length) imgList = ['assets/images/village_community.jpg'];
  const doc = { id: Date.now(), title: String(title).trim(), category: category || 'Village Life', date: date || new Date().toISOString().split('T')[0], image: imgList[0], images: imgList, summary: String(summary).trim(), content: content ? String(content).trim() : String(summary).trim(), createdAt: new Date() };
  try {
    if (isMongoReady()) {
      const saved = await News.create(doc);
      return res.status(201).json({ ok: true, data: saved.toObject() });
    }
  } catch(e) { console.error('[News POST]', e.message); }
  const list = readData('news.json'); list.unshift(doc); writeData('news.json', list);
  res.status(201).json({ ok: true, data: doc });
});

app.delete('/api/news/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    if (isMongoReady()) { await News.deleteOne({ id }); return res.json({ ok: true }); }
  } catch(e) { console.error('[News DELETE]', e.message); }
  let list = readData('news.json'); writeData('news.json', list.filter(n => n.id !== id));
  res.json({ ok: true, message: 'News item deleted.' });
});

// 7. Events CRUD
app.get('/api/events', async (req, res) => {
  try {
    if (isMongoReady()) return res.json(await Event.find().sort({ createdAt: -1 }).lean());
  } catch(e) { console.error('[Events GET]', e.message); }
  res.json(readData('events.json'));
});

app.post('/api/events', async (req, res) => {
  const { title, date, time, location, category, description } = req.body;
  if (!title || !date) return res.status(400).json({ ok: false, error: 'Title and date are required.' });
  const doc = { id: Date.now(), title: String(title).trim(), date: String(date).trim(), time: time || '10:00 AM', location: location || 'Roshni Village, Bedian Road, Lahore', category: category || 'Community Event', description: description ? String(description).trim() : '', createdAt: new Date() };
  try {
    if (isMongoReady()) {
      const saved = await Event.create(doc);
      return res.status(201).json({ ok: true, data: saved.toObject() });
    }
  } catch(e) { console.error('[Events POST]', e.message); }
  const list = readData('events.json'); list.unshift(doc); writeData('events.json', list);
  res.status(201).json({ ok: true, data: doc });
});

app.delete('/api/events/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    if (isMongoReady()) { await Event.deleteOne({ id }); return res.json({ ok: true }); }
  } catch(e) { console.error('[Events DELETE]', e.message); }
  let list = readData('events.json'); writeData('events.json', list.filter(e => e.id !== id));
  res.json({ ok: true, message: 'Event deleted.' });
});

// 8. Products CRUD
app.get('/api/products', async (req, res) => {
  try {
    if (isMongoReady()) return res.json(await Product.find().sort({ createdAt: -1 }).lean());
  } catch(e) { console.error('[Products GET]', e.message); }
  res.json(readData('products.json'));
});

app.post('/api/products', async (req, res) => {
  const { title, category, workshop, price, icon, image, images, desc } = req.body;
  if (!title || !price) return res.status(400).json({ ok: false, error: 'Product title and price are required.' });
  let imgList = [];
  if (Array.isArray(images)) imgList = images.map(i => String(i).trim()).filter(Boolean);
  else if (typeof images === 'string') imgList = images.split(',').map(i => i.trim()).filter(Boolean);
  if (!imgList.length && image) imgList = [image];
  if (!imgList.length) imgList = ['assets/images/crafts_workshop.jpg'];
  const doc = { id: Date.now(), category: category || 'bakery', title: String(title).trim(), workshop: workshop || 'Roshni Workshop', price: Number(price) || 500, icon: icon || '🎁', image: imgList[0], images: imgList, desc: desc ? String(desc).trim() : '', inStock: true, createdAt: new Date() };
  try {
    if (isMongoReady()) {
      const saved = await Product.create(doc);
      return res.status(201).json({ ok: true, data: saved.toObject() });
    }
  } catch(e) { console.error('[Products POST]', e.message); }
  const list = readData('products.json'); list.unshift(doc); writeData('products.json', list);
  res.status(201).json({ ok: true, data: doc });
});

app.delete('/api/products/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    if (isMongoReady()) { await Product.deleteOne({ id }); return res.json({ ok: true }); }
  } catch(e) { console.error('[Products DELETE]', e.message); }
  let list = readData('products.json'); writeData('products.json', list.filter(p => p.id !== id));
  res.json({ ok: true, message: 'Product deleted.' });
});

// 9. Newsletters CRUD
app.get('/api/newsletters', async (req, res) => {
  try {
    if (isMongoReady()) return res.json(await Newsletter.find().sort({ createdAt: -1 }).lean());
  } catch(e) { console.error('[Newsletters GET]', e.message); }
  res.json(readData('newsletters.json'));
});

app.post('/api/newsletters', async (req, res) => {
  const { subject, issueTitle, previewText, content, pdfUrl } = req.body;
  if (!subject) return res.status(400).json({ ok: false, error: 'Subject is required.' });
  let subCount = 0;
  try {
    subCount = isMongoReady() ? await Subscriber.countDocuments() : readData('subscribers.json').length;
  } catch(e) {}
  const nlCount = isMongoReady() ? (await Newsletter.countDocuments().catch(() => 0)) : readData('newsletters.json').length;
  const doc = { id: Date.now(), subject: String(subject).trim(), issueTitle: issueTitle || `Roshni Chronicle #${nlCount + 1}`, sentDate: new Date().toISOString().split('T')[0], previewText: previewText ? String(previewText).trim() : '', content: content ? String(content).trim() : '', pdfUrl: pdfUrl ? String(pdfUrl).trim() : '', sentToCount: subCount, createdAt: new Date() };
  try {
    if (isMongoReady()) {
      const saved = await Newsletter.create(doc);
      return res.status(201).json({ ok: true, data: saved.toObject() });
    }
  } catch(e) { console.error('[Newsletters POST]', e.message); }
  const list = readData('newsletters.json'); list.unshift(doc); writeData('newsletters.json', list);
  res.status(201).json({ ok: true, data: doc });
});

app.delete('/api/newsletters/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    if (isMongoReady()) { await Newsletter.deleteOne({ id }); return res.json({ ok: true }); }
  } catch(e) { console.error('[Newsletters DELETE]', e.message); }
  let list = readData('newsletters.json'); writeData('newsletters.json', list.filter(n => n.id !== id));
  res.json({ ok: true, message: 'Newsletter deleted.' });
});

// 10. Contact Inquiries
app.get('/api/contacts', async (req, res) => {
  try {
    if (isMongoReady()) return res.json(await Contact.find().sort({ createdAt: -1 }).lean());
  } catch(e) { console.error('[Contacts GET]', e.message); }
  res.json(readData('contacts.json'));
});

app.post('/api/contact', async (req, res) => {
  const { name, email, phone, subject, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ ok: false, error: 'Missing required fields.' });
  const doc = { id: Date.now(), name: String(name).trim(), email: String(email).trim(), phone: phone ? String(phone).trim() : 'N/A', subject: subject || 'General Inquiry', message: String(message).trim(), createdAt: new Date() };
  try {
    if (isMongoReady()) {
      const saved = await Contact.create(doc);
      return res.status(201).json({ ok: true, id: saved.id, message: 'Inquiry received!' });
    }
  } catch(e) { console.error('[Contact POST]', e.message); }
  const list = readData('contacts.json'); list.unshift(doc); writeData('contacts.json', list);
  res.status(201).json({ ok: true, id: doc.id, message: 'Inquiry received!' });
});

app.delete('/api/contacts/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    if (isMongoReady()) { await Contact.deleteOne({ id }); return res.json({ ok: true }); }
  } catch(e) { console.error('[Contacts DELETE]', e.message); }
  let list = readData('contacts.json'); writeData('contacts.json', list.filter(c => c.id !== id));
  res.json({ ok: true, message: 'Contact deleted.' });
});

// 11. Volunteer Applications
app.get('/api/volunteers', async (req, res) => {
  try {
    if (isMongoReady()) return res.json(await Volunteer.find().sort({ createdAt: -1 }).lean());
  } catch(e) { console.error('[Volunteers GET]', e.message); }
  res.json(readData('volunteers.json'));
});

app.post('/api/volunteer', async (req, res) => {
  const { name, age, email, phone, city, volunteerType, areaOfInterest, motivation } = req.body;
  if (!name || !email || !phone) return res.status(400).json({ ok: false, error: 'Missing required fields.' });
  const doc = { id: Date.now(), name: String(name).trim(), age: age || 'N/A', email: String(email).trim(), phone: String(phone).trim(), city: city || 'Lahore', volunteerType: volunteerType || 'General Volunteer', areaOfInterest: areaOfInterest || 'General Support', motivation: motivation ? String(motivation).trim() : '', createdAt: new Date() };
  try {
    if (isMongoReady()) {
      const saved = await Volunteer.create(doc);
      return res.status(201).json({ ok: true, id: saved.id, message: 'Volunteer application submitted!' });
    }
  } catch(e) { console.error('[Volunteer POST]', e.message); }
  const list = readData('volunteers.json'); list.unshift(doc); writeData('volunteers.json', list);
  res.status(201).json({ ok: true, id: doc.id, message: 'Volunteer application submitted!' });
});

app.delete('/api/volunteers/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    if (isMongoReady()) { await Volunteer.deleteOne({ id }); return res.json({ ok: true }); }
  } catch(e) { console.error('[Volunteers DELETE]', e.message); }
  let list = readData('volunteers.json'); writeData('volunteers.json', list.filter(v => v.id !== id));
  res.json({ ok: true, message: 'Volunteer deleted.' });
});

// 12. Donations & Pledges
app.get('/api/donations', async (req, res) => {
  try {
    if (isMongoReady()) return res.json(await Donation.find().sort({ createdAt: -1 }).lean());
  } catch(e) { console.error('[Donations GET]', e.message); }
  res.json(readData('donations.json'));
});

app.post('/api/donate', async (req, res) => {
  const { name, email, phone, purpose, amount, paymentMethod } = req.body;
  if (!name || !email || !amount) return res.status(400).json({ ok: false, error: 'Missing required fields.' });
  const doc = { id: Date.now(), name: String(name).trim(), email: String(email).trim(), phone: phone ? String(phone).trim() : 'N/A', purpose: purpose || 'General Donation', amount: Number(amount) || amount, paymentMethod: paymentMethod || 'Direct Bank Transfer', createdAt: new Date() };
  try {
    if (isMongoReady()) {
      const saved = await Donation.create(doc);
      return res.status(201).json({ ok: true, id: saved.id, message: 'Donation recorded!' });
    }
  } catch(e) { console.error('[Donate POST]', e.message); }
  const list = readData('donations.json'); list.unshift(doc); writeData('donations.json', list);
  res.status(201).json({ ok: true, id: doc.id, message: 'Donation recorded!' });
});

app.delete('/api/donations/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    if (isMongoReady()) { await Donation.deleteOne({ id }); return res.json({ ok: true }); }
  } catch(e) { console.error('[Donations DELETE]', e.message); }
  let list = readData('donations.json'); writeData('donations.json', list.filter(d => d.id !== id));
  res.json({ ok: true, message: 'Donation deleted.' });
});

// 13. Shop Orders
app.get('/api/orders', async (req, res) => {
  try {
    if (isMongoReady()) return res.json(await Order.find().sort({ orderDate: -1 }).lean());
  } catch(e) { console.error('[Orders GET]', e.message); }
  res.json(readData('orders.json'));
});

app.post('/api/shop/order', async (req, res) => {
  const { customerName, customerPhone, deliveryAddress, items, total } = req.body;
  if (!customerName || !customerPhone || !deliveryAddress || !items || !items.length)
    return res.status(400).json({ ok: false, error: 'Customer details, delivery address, and items are required.' });
  const doc = { id: Date.now(), customerName: String(customerName).trim(), customerPhone: String(customerPhone).trim(), deliveryAddress: String(deliveryAddress).trim(), items, total: total || 0, status: 'Pending Dispatch', orderDate: new Date() };
  try {
    if (isMongoReady()) {
      const saved = await Order.create(doc);
      return res.status(201).json({ ok: true, id: saved.id, message: 'Order placed!' });
    }
  } catch(e) { console.error('[Orders POST]', e.message); }
  const list = readData('orders.json'); list.unshift(doc); writeData('orders.json', list);
  res.status(201).json({ ok: true, id: doc.id, message: 'Order placed!' });
});

app.put('/api/orders/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;
  try {
    if (isMongoReady()) {
      const doc = await Order.findOneAndUpdate({ id }, { $set: { status } }, { new: true });
      return res.json({ ok: true, data: doc });
    }
  } catch(e) { console.error('[Orders PUT]', e.message); }
  const orders = readData('orders.json');
  const order = orders.find(o => o.id === id);
  if (!order) return res.status(404).json({ ok: false, error: 'Order not found.' });
  order.status = status || order.status; writeData('orders.json', orders);
  res.json({ ok: true, data: order });
});

app.delete('/api/orders/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    if (isMongoReady()) { await Order.deleteOne({ id }); return res.json({ ok: true }); }
  } catch(e) { console.error('[Orders DELETE]', e.message); }
  let list = readData('orders.json'); writeData('orders.json', list.filter(o => o.id !== id));
  res.json({ ok: true, message: 'Order deleted.' });
});

// 14. Newsletter Subscribers
app.get('/api/subscribers', async (req, res) => {
  try {
    if (isMongoReady()) return res.json(await Subscriber.find().sort({ subscribedAt: -1 }).lean());
  } catch(e) { console.error('[Subscribers GET]', e.message); }
  res.json(readData('subscribers.json'));
});

app.post('/api/newsletter', async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ ok: false, error: 'Valid email required.' });
  const normalized = email.toLowerCase().trim();
  try {
    if (isMongoReady()) {
      const existing = await Subscriber.findOne({ email: normalized });
      if (!existing) await Subscriber.create({ id: Date.now(), email: normalized, subscribedAt: new Date() });
      return res.status(200).json({ ok: true, message: 'Subscribed successfully!' });
    }
  } catch(e) { console.error('[Subscribe POST]', e.message); }
  const subscribers = readData('subscribers.json');
  if (!subscribers.some(s => s.email.toLowerCase() === normalized)) {
    subscribers.unshift({ id: Date.now(), email: normalized, subscribedAt: new Date().toISOString() });
    writeData('subscribers.json', subscribers);
  }
  res.status(200).json({ ok: true, message: 'Subscribed successfully!' });
});

// ── FULL ADMIN MANAGEMENT DASHBOARD ─────────────────────────────────────────
app.get('/admin', (req, res) => {
  const html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Portal | Roshni Association Lahore</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
    <link rel="stylesheet" href="/assets/css/shared.css">
    <style>
      body { background-color: #F8FAFC; }
      .admin-top-bar {
        background: linear-gradient(135deg, #1E40AF 0%, #3B82F6 50%, #F97316 100%);
        color: #fff; padding: 2rem 1.5rem; box-shadow: 0 4px 20px rgba(30,64,175,0.2);
      }
      .admin-nav { display: flex; gap: 0.5rem; flex-wrap: wrap; margin: 1.5rem 0; }
      .admin-tab {
        padding: 0.65rem 1.25rem; border-radius: 9999px; font-size: 0.82rem; font-weight: 700;
        border: 1px solid #CBD5E1; background: #fff; color: #475569; cursor: pointer;
        transition: all 0.2s; display: inline-flex; align-items: center; gap: 0.5rem;
      }
      .admin-tab:hover, .admin-tab.active {
        background: linear-gradient(135deg, #1E40AF, #F97316); color: #fff; border-color: transparent;
        box-shadow: 0 4px 12px rgba(30,64,175,0.25);
      }
      .admin-card {
        background: #fff; border-radius: 1.25rem; border: 1px solid #E2E8F0;
        padding: 2rem; box-shadow: 0 2px 10px rgba(0,0,0,0.03); margin-bottom: 2rem;
      }
      .admin-stat-box {
        background: #fff; border-radius: 1rem; padding: 1.25rem 1.5rem; border: 1px solid #E2E8F0;
      }
      .admin-stat-num { font-size: 2rem; font-weight: 800; color: #1E40AF; line-height: 1.1; margin-top: 0.35rem; }
      .data-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
      .data-table th {
        background: #F8FAFC; color: #1E3A8A; text-align: left; padding: 0.85rem 1rem;
        font-weight: 700; border-bottom: 2px solid #E2E8F0;
      }
      .data-table td { padding: 0.85rem 1rem; border-bottom: 1px solid #E2E8F0; color: #334155; }
      .data-table tr:hover { background: #F8FAFC; }
      .btn-del {
        background: #FEE2E2; color: #DC2626; border: 1px solid #FECACA;
        padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.75rem; font-weight: 700;
        cursor: pointer; transition: background 0.2s;
      }
      .btn-del:hover { background: #DC2626; color: #fff; }
      .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; margin-bottom: 1rem; }
      .img-preview-thumb { width: 50px; height: 50px; border-radius: 8px; object-fit: cover; }
      .upload-slot-card {
        background: #F8FAFC; border: 2px dashed #CBD5E1; border-radius: 1rem; padding: 1.5rem;
        text-align: center; transition: border-color 0.2s;
      }
      .upload-slot-card:hover { border-color: #3B82F6; background: #EFF6FF; }
    </style>
  </head>
  <body>
    <!-- Top Bar -->
    <div class="admin-top-bar">
      <div class="container" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1.5rem;">
        <div style="display:flex;align-items:center;gap:1rem;">
          <img id="adminHeaderLogo" src="/assets/images/roshni_logo.jpg" alt="Roshni Monogram" style="width:55px;height:55px;border-radius:50%;background:#fff;padding:3px;box-shadow:0 4px 10px rgba(0,0,0,0.15);object-fit:cover;">
          <div>
            <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.12em;opacity:0.85;">Administration &amp; Real Data Management</div>
            <h1 class="serif-heading" style="font-size:1.9rem;margin:0.2rem 0;">Roshni Association Admin Portal</h1>
            <p style="font-size:0.85rem;opacity:0.9;margin:0;">Milestones &bull; Multi-Picture News &amp; Products &bull; Real Figures &bull; Media Uploader</p>
          </div>
        </div>
        <div style="display:flex;gap:0.75rem;">
          <a href="/" target="_blank" style="background:#fff;color:#1E40AF;padding:0.65rem 1.4rem;border-radius:9999px;font-weight:700;font-size:0.82rem;text-decoration:none;display:inline-flex;align-items:center;gap:6px;box-shadow:0 4px 12px rgba(0,0,0,0.1);">
            <i class="fas fa-globe"></i> Open Website
          </a>
          <button onclick="loadAllData()" style="background:rgba(255,255,255,0.2);color:#fff;border:1px solid rgba(255,255,255,0.4);padding:0.65rem 1.2rem;border-radius:9999px;font-weight:700;font-size:0.82rem;cursor:pointer;">
            <i class="fas fa-sync-alt"></i> Refresh
          </button>
        </div>
      </div>
    </div>

    <div class="container" style="padding-top:1.5rem;">
      <!-- Real-Time Metrics Overview -->
      <div class="grid-4" style="margin-bottom:2rem;">
        <div class="admin-stat-box">
          <div style="font-size:0.75rem;font-weight:700;color:#64748B;text-transform:uppercase;">Special Adult Residents</div>
          <div class="admin-stat-num" id="statResidentsCount">0</div>
          <div style="font-size:0.72rem;color:#94A3B8;margin-top:2px;">Real-Time Community Living</div>
        </div>
        <div class="admin-stat-box">
          <div style="font-size:0.75rem;font-weight:700;color:#64748B;text-transform:uppercase;">Enrolled Students</div>
          <div class="admin-stat-num" id="statStudentsCount" style="color:#EA580C;">0</div>
          <div style="font-size:0.72rem;color:#94A3B8;margin-top:2px;">Green Earth Waldorf School</div>
        </div>
        <div class="admin-stat-box">
          <div style="font-size:0.75rem;font-weight:700;color:#64748B;text-transform:uppercase;">Active Volunteers</div>
          <div class="admin-stat-num" id="statVolunteersCount" style="color:#16A34A;">0</div>
          <div style="font-size:0.72rem;color:#94A3B8;margin-top:2px;">Registered in System</div>
        </div>
        <div class="admin-stat-box">
          <div style="font-size:0.75rem;font-weight:700;color:#64748B;text-transform:uppercase;">Total Donations Recorded</div>
          <div class="admin-stat-num" id="statDonationsAmount" style="color:#7C3AED;">PKR 0</div>
          <div style="font-size:0.72rem;color:#94A3B8;margin-top:2px;" id="statDonationsCount">0 Pledges</div>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div class="admin-nav">
        <button class="admin-tab active" onclick="switchTab('milestones', this)"><i class="fas fa-flag-checkered"></i> 🏆 Milestones &amp; History</button>
        <button class="admin-tab" onclick="switchTab('team', this)"><i class="fas fa-users-cog"></i> 👥 Board, Staff &amp; Living</button>
        <button class="admin-tab" onclick="switchTab('upload', this)"><i class="fas fa-camera"></i> 📸 Upload Monogram &amp; Pictures</button>
        <button class="admin-tab" onclick="switchTab('figures', this)"><i class="fas fa-chart-line"></i> 📊 Real-Time Figures</button>
        <button class="admin-tab" onclick="switchTab('news', this)"><i class="fas fa-newspaper"></i> News (Multi-Photo)</button>
        <button class="admin-tab" onclick="switchTab('products', this)"><i class="fas fa-shopping-bag"></i> Products (Multi-Photo)</button>
        <button class="admin-tab" onclick="switchTab('events', this)"><i class="fas fa-calendar-alt"></i> Events &amp; Festivals</button>
        <button class="admin-tab" onclick="switchTab('newsletter', this)"><i class="fas fa-paper-plane"></i> Newsletter</button>
        <button class="admin-tab" onclick="switchTab('orders', this)"><i class="fas fa-box"></i> Orders (<span id="tabOrderCount">0</span>)</button>
        <button class="admin-tab" onclick="switchTab('volunteers', this)"><i class="fas fa-hands-helping"></i> Volunteers (<span id="tabVolCount">0</span>)</button>
        <button class="admin-tab" onclick="switchTab('donations', this)"><i class="fas fa-heart"></i> Donations (<span id="tabDonCount">0</span>)</button>
        <button class="admin-tab" onclick="switchTab('contacts', this)"><i class="fas fa-envelope"></i> Inquiries (<span id="tabContactCount">0</span>)</button>
      </div>

      <!-- TAB 1: MILESTONES & HISTORY (REAL DATA) -->
      <div id="view-milestones" class="admin-card">
        <div style="margin-bottom:1.5rem;">
          <span class="tag-gradient" style="margin-bottom:0.5rem;">Authentic Timeline</span>
          <h2 class="serif-heading" style="font-size:1.5rem;color:#1E3A8A;margin:0.25rem 0;">Manage Real Milestones &amp; History</h2>
          <p style="color:#64748B;font-size:0.88rem;margin:0;">Add, update, or remove real historical milestones. These immediately display on the About Us page timeline.</p>
        </div>

        <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:1rem;padding:1.5rem;margin-bottom:2rem;">
          <h3 style="font-size:1rem;font-weight:700;color:#1E3A8A;margin-bottom:1rem;"><i class="fas fa-plus-circle" style="color:#F97316;"></i> Add New Milestone</h3>
          <form id="formAddMilestone" onsubmit="handleAddMilestone(event)">
            <div class="form-grid">
              <div class="form-group" style="margin:0;">
                <label>Year / Date *</label>
                <input type="text" name="year" required placeholder="e.g. 1991 or 2006" class="form-control">
              </div>
              <div class="form-group" style="margin:0;grid-column:span 2;">
                <label>Milestone Title *</label>
                <input type="text" name="title" required placeholder="e.g. Foundation of Roshni Village on Bedian Road" class="form-control">
              </div>
            </div>
            <div class="form-group">
              <label>Milestone Description *</label>
              <textarea name="description" rows="2" required placeholder="Describe the historical achievement, land acquisition, or program launch..." class="form-control"></textarea>
            </div>
            <button type="submit" class="btn-submit" style="width:auto;padding:0.75rem 2rem;">
              <i class="fas fa-save" style="margin-right:6px;"></i> Add Milestone to Timeline
            </button>
          </form>
        </div>

        <div style="overflow-x:auto;">
          <table class="data-table">
            <thead>
              <tr><th>Year</th><th>Title</th><th>Description</th><th>Action</th></tr>
            </thead>
            <tbody id="milestonesTableBody"></tbody>
          </table>
        </div>
      </div>

      <!-- TAB 1b: BOARD, STAFF & COMMUNITY LIVING PROFILES -->
      <div id="view-team" class="admin-card" style="display:none;">
        <div style="margin-bottom:1.5rem;">
          <span class="tag-gradient" style="margin-bottom:0.5rem;">Leadership &amp; Community Care</span>
          <h2 class="serif-heading" style="font-size:1.5rem;color:#1E3A8A;margin:0.25rem 0;">Board, Staff &amp; Community Living Profiles</h2>
          <p style="color:#64748B;font-size:0.88rem;margin:0;">Add authentic profiles of Board members, workshop master staff, and residential house parents living with special friends. Displays dynamically on the About Us page.</p>
        </div>

        <!-- Add Profile Form -->
        <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:1rem;padding:1.5rem;margin-bottom:2rem;">
          <h3 style="font-size:1rem;font-weight:700;color:#1E3A8A;margin-bottom:1rem;"><i class="fas fa-user-plus" style="color:#F97316;"></i> Add Person Profile</h3>
          <form id="formAddTeam" onsubmit="handleAddTeam(event)">
            <div class="form-grid">
              <div class="form-group" style="margin:0;">
                <label>Full Name *</label>
                <input type="text" name="name" required placeholder="e.g. Dr. Shahida Perveen" class="form-control">
              </div>
              <div class="form-group" style="margin:0;">
                <label>Designation / Role *</label>
                <input type="text" name="role" required placeholder="e.g. General Secretary / House Mother" class="form-control">
              </div>
              <div class="form-group" style="margin:0;">
                <label>Category *</label>
                <select name="category" class="form-control">
                  <option value="board">🏛️ Board of Trustees / Governance</option>
                  <option value="living">🏡 Community Living / House Parents</option>
                  <option value="staff">🛠️ Master Craftspeople &amp; Teachers / Staff</option>
                </select>
              </div>
              <div class="form-group" style="margin:0;">
                <label>Photo URL or File</label>
                <input type="text" name="image" placeholder="/assets/images/roshni_logo.jpg" class="form-control">
              </div>
            </div>
            <div class="form-group">
              <label>Biography / Contribution Details *</label>
              <textarea name="bio" rows="2" required placeholder="Brief description of experience, dedication, and care role in Roshni Association..." class="form-control"></textarea>
            </div>
            <button type="submit" class="btn-submit" style="width:auto;padding:0.75rem 2rem;">
              <i class="fas fa-save" style="margin-right:6px;"></i> Save Profile
            </button>
          </form>
        </div>

        <div style="overflow-x:auto;">
          <table class="data-table">
            <thead>
              <tr><th>Photo</th><th>Name</th><th>Role</th><th>Category</th><th>Bio / Role Summary</th><th>Action</th></tr>
            </thead>
            <tbody id="teamTableBody"></tbody>
          </table>
        </div>
      </div>

      <!-- TAB 2: UPLOAD OWN MONOGRAM & REAL PICTURES -->
      <div id="view-upload" class="admin-card" style="display:none;">
        <div style="margin-bottom:1.5rem;">
          <span class="tag-gradient" style="margin-bottom:0.5rem;">Custom Media Upload</span>
          <h2 class="serif-heading" style="font-size:1.5rem;color:#1E3A8A;margin:0.25rem 0;">Upload Your Own Monogram &amp; Real Photographs</h2>
          <p style="color:#64748B;font-size:0.88rem;margin:0;">Select your actual files from your computer. Once uploaded, they will immediately replace the images across all website pages in real time.</p>
        </div>

        <div class="grid-3" style="gap:1.5rem;">
          <!-- Slot 1: Monogram / Logo -->
          <div class="upload-slot-card">
            <h4 style="font-weight:700;color:#1E3A8A;margin-bottom:0.5rem;"><i class="fas fa-certificate" style="color:#F97316;"></i> Official Roshni Monogram</h4>
            <p style="font-size:0.75rem;color:#64748B;margin-bottom:1rem;">Your organization's official logo / emblem file (PNG, JPG, or SVG).</p>
            <div style="margin-bottom:1rem;">
              <img id="preview-monogram" src="/assets/images/roshni_logo.jpg" style="width:90px;height:90px;border-radius:50%;object-fit:cover;border:3px solid #BFDBFE;margin:0 auto;display:block;">
            </div>
            <input type="file" id="file-monogram" accept="image/*" style="display:none;" onchange="handleFileSelected('monogram', this)">
            <button onclick="document.getElementById('file-monogram').click()" class="btn-gradient" style="padding:0.55rem 1.25rem;border-radius:9999px;font-size:0.8rem;font-weight:700;">
              <i class="fas fa-upload"></i> Upload Our Monogram
            </button>
          </div>

          <!-- Slot 2: Roshni Village -->
          <div class="upload-slot-card">
            <h4 style="font-weight:700;color:#1E3A8A;margin-bottom:0.5rem;"><i class="fas fa-home" style="color:#1E40AF;"></i> Roshni Village Photo</h4>
            <p style="font-size:0.75rem;color:#64748B;margin-bottom:1rem;">Actual picture of Roshni Village residential houses or grounds.</p>
            <div style="margin-bottom:1rem;">
              <img id="preview-village" src="/assets/images/village_community.jpg" style="width:100%;height:110px;border-radius:8px;object-fit:cover;border:1px solid #E2E8F0;display:block;">
            </div>
            <input type="file" id="file-village" accept="image/*" style="display:none;" onchange="handleFileSelected('village', this)">
            <button onclick="document.getElementById('file-village').click()" class="btn-gradient" style="padding:0.55rem 1.25rem;border-radius:9999px;font-size:0.8rem;font-weight:700;">
              <i class="fas fa-upload"></i> Upload Village Photo
            </button>
          </div>

          <!-- Slot 3: Green Earth School -->
          <div class="upload-slot-card">
            <h4 style="font-weight:700;color:#1E3A8A;margin-bottom:0.5rem;"><i class="fas fa-graduation-cap" style="color:#16A34A;"></i> Green Earth School Photo</h4>
            <p style="font-size:0.75rem;color:#64748B;margin-bottom:1rem;">Actual picture of children, teachers, or classrooms.</p>
            <div style="margin-bottom:1rem;">
              <img id="preview-school" src="/assets/images/green_earth_school.jpg" style="width:100%;height:110px;border-radius:8px;object-fit:cover;border:1px solid #E2E8F0;display:block;">
            </div>
            <input type="file" id="file-school" accept="image/*" style="display:none;" onchange="handleFileSelected('school', this)">
            <button onclick="document.getElementById('file-school').click()" class="btn-gradient" style="padding:0.55rem 1.25rem;border-radius:9999px;font-size:0.8rem;font-weight:700;">
              <i class="fas fa-upload"></i> Upload School Photo
            </button>
          </div>

          <!-- Slot 4: Bakery -->
          <div class="upload-slot-card">
            <h4 style="font-weight:700;color:#1E3A8A;margin-bottom:0.5rem;"><i class="fas fa-bread-slice" style="color:#D97706;"></i> Bakery Workshop Photo</h4>
            <p style="font-size:0.75rem;color:#64748B;margin-bottom:1rem;">Actual picture of our sourdough bread, bakers, or oven.</p>
            <div style="margin-bottom:1rem;">
              <img id="preview-bakery" src="/assets/images/organic_bakery.jpg" style="width:100%;height:110px;border-radius:8px;object-fit:cover;border:1px solid #E2E8F0;display:block;">
            </div>
            <input type="file" id="file-bakery" accept="image/*" style="display:none;" onchange="handleFileSelected('bakery', this)">
            <button onclick="document.getElementById('file-bakery').click()" class="btn-gradient" style="padding:0.55rem 1.25rem;border-radius:9999px;font-size:0.8rem;font-weight:700;">
              <i class="fas fa-upload"></i> Upload Bakery Photo
            </button>
          </div>

          <!-- Slot 5: Organic Farm -->
          <div class="upload-slot-card">
            <h4 style="font-weight:700;color:#1E3A8A;margin-bottom:0.5rem;"><i class="fas fa-seedling" style="color:#059669;"></i> Biodynamic Farm Photo</h4>
            <p style="font-size:0.75rem;color:#64748B;margin-bottom:1rem;">Actual picture of our crops, cows, vegetables, or fields.</p>
            <div style="margin-bottom:1rem;">
              <img id="preview-farm" src="/assets/images/organic_farm.jpg" style="width:100%;height:110px;border-radius:8px;object-fit:cover;border:1px solid #E2E8F0;display:block;">
            </div>
            <input type="file" id="file-farm" accept="image/*" style="display:none;" onchange="handleFileSelected('farm', this)">
            <button onclick="document.getElementById('file-farm').click()" class="btn-gradient" style="padding:0.55rem 1.25rem;border-radius:9999px;font-size:0.8rem;font-weight:700;">
              <i class="fas fa-upload"></i> Upload Farm Photo
            </button>
          </div>

          <!-- Slot 6: Crafts Studio -->
          <div class="upload-slot-card">
            <h4 style="font-weight:700;color:#1E3A8A;margin-bottom:0.5rem;"><i class="fas fa-tools" style="color:#9333EA;"></i> Handloom &amp; Crafts Photo</h4>
            <p style="font-size:0.75rem;color:#64748B;margin-bottom:1rem;">Actual picture of handloom weavers, woodwork, or candles.</p>
            <div style="margin-bottom:1rem;">
              <img id="preview-crafts" src="/assets/images/crafts_workshop.jpg" style="width:100%;height:110px;border-radius:8px;object-fit:cover;border:1px solid #E2E8F0;display:block;">
            </div>
            <input type="file" id="file-crafts" accept="image/*" style="display:none;" onchange="handleFileSelected('crafts', this)">
            <button onclick="document.getElementById('file-crafts').click()" class="btn-gradient" style="padding:0.55rem 1.25rem;border-radius:9999px;font-size:0.8rem;font-weight:700;">
              <i class="fas fa-upload"></i> Upload Crafts Photo
            </button>
          </div>
        </div>

        <!-- Universal Multi-Image File Uploader Tool for Non-Technical Staff -->
        <div style="margin-top:2.5rem;background:#EFF6FF;border:2px dashed #93C5FD;border-radius:1rem;padding:2rem;">
          <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem;">
            <div style="font-size:1.8rem;color:#1E40AF;"><i class="fas fa-cloud-upload-alt"></i></div>
            <div>
              <h3 style="font-size:1.2rem;font-weight:700;color:#1E3A8A;margin:0;">Instant Picture Uploader (For Any Page or Device)</h3>
              <p style="font-size:0.82rem;color:#64748B;margin:0;">Select photos directly from your computer or phone. They will be saved to your website library instantly.</p>
            </div>
          </div>
          <div style="margin-top:1.25rem;display:flex;gap:1rem;align-items:center;flex-wrap:wrap;">
            <input type="file" id="file-universal" accept="image/*" multiple style="display:none;" onchange="handleUniversalFileUpload(this)">
            <button onclick="document.getElementById('file-universal').click()" class="btn-gradient" style="padding:0.75rem 1.8rem;border-radius:9999px;font-size:0.88rem;font-weight:700;">
              <i class="fas fa-folder-open" style="margin-right:6px;"></i> Choose Pictures From Computer / Phone
            </button>
            <span id="universalUploadStatus" style="font-size:0.85rem;color:#1E40AF;font-weight:600;"></span>
          </div>
          <div id="universalUploadPreviews" style="display:flex;gap:0.75rem;flex-wrap:wrap;margin-top:1.25rem;"></div>
        </div>
      </div>

      <!-- TAB 3: REAL-TIME FIGURES & SETTINGS -->
      <div id="view-figures" class="admin-card" style="display:none;">
        <div style="margin-bottom:1.5rem;">
          <span class="tag-gradient" style="margin-bottom:0.5rem;">Real-Time Data Engine</span>
          <h2 class="serif-heading" style="font-size:1.5rem;color:#1E3A8A;margin:0.25rem 0;">Edit Verified Organizational Figures</h2>
          <p style="color:#64748B;font-size:0.88rem;margin:0;">These numbers are served live to the home page, project pages, and impact counters via the real-time API. No dummy numbers!</p>
        </div>

        <form id="formSettings" onsubmit="handleSaveSettings(event)" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:1rem;padding:2rem;">
          <div class="form-grid">
            <div class="form-group">
              <label>Founded Year *</label>
              <input type="number" id="settingFoundedYear" name="foundedYear" required class="form-control" placeholder="1991">
            </div>
            <div class="form-group">
              <label>Special Adults in Residential Care *</label>
              <input type="number" id="settingSpecialResidents" name="specialResidentsCount" required class="form-control" placeholder="42">
            </div>
            <div class="form-group">
              <label>Students Enrolled (Green Earth School) *</label>
              <input type="number" id="settingStudentsEnrolled" name="studentsEnrolledCount" required class="form-control" placeholder="165">
            </div>
            <div class="form-group">
              <label>Therapeutic Workshops Operating *</label>
              <input type="number" id="settingWorkshopsCount" name="activeWorkshopsCount" required class="form-control" placeholder="5">
            </div>
            <div class="form-group">
              <label>Residential Family Houses *</label>
              <input type="number" id="settingHousesCount" name="residentialHousesCount" required class="form-control" placeholder="4">
            </div>
          </div>

          <div class="form-grid">
            <div class="form-group">
              <label>Official Phone Number</label>
              <input type="text" id="settingPhone" name="phone" class="form-control">
            </div>
            <div class="form-group">
              <label>Official WhatsApp Number</label>
              <input type="text" id="settingWhatsApp" name="whatsapp" class="form-control">
            </div>
            <div class="form-group">
              <label>Official Email</label>
              <input type="email" id="settingEmail" name="email" class="form-control">
            </div>
          </div>

          <button type="submit" class="btn-submit" style="width:auto;padding:0.8rem 2.5rem;">
            <i class="fas fa-save" style="margin-right:6px;"></i> Save Real-Time Figures
          </button>
        </form>
      </div>

      <!-- TAB 4: NEWS & MEDIA (MULTI-PICTURE) -->
      <div id="view-news" class="admin-card" style="display:none;">
        <h2 class="serif-heading" style="font-size:1.4rem;color:#1E3A8A;margin-bottom:0.25rem;">News &amp; Media Articles (Multiple Pictures Option)</h2>
        <p style="color:#64748B;font-size:0.85rem;margin-bottom:1.5rem;">Publish real news and media stories with one or multiple photos.</p>

        <!-- Add News Form -->
        <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:1rem;padding:1.5rem;margin-bottom:2rem;">
          <h3 style="font-size:1rem;font-weight:700;color:#1E3A8A;margin-bottom:1rem;"><i class="fas fa-plus-circle" style="color:#F97316;"></i> Add Article / Press Release</h3>
          <form id="formAddNews" onsubmit="handleAddNews(event)">
            <div class="form-grid">
              <div class="form-group" style="margin:0;">
                <label>Article Title *</label>
                <input type="text" name="title" required placeholder="e.g. Winter Open Day & Bread Festival" class="form-control">
              </div>
              <div class="form-group" style="margin:0;">
                <label>Category *</label>
                <select name="category" class="form-control">
                  <option value="Village Life">Village Life</option>
                  <option value="Workshop Update">Workshop Update</option>
                  <option value="Waldorf Education">Waldorf Education</option>
                  <option value="Volunteers">Volunteers</option>
                  <option value="Press & Media">Press &amp; Media</option>
                </select>
              </div>
              <div class="form-group" style="margin:0;">
                <label>Date *</label>
                <input type="date" name="date" class="form-control" value="${new Date().toISOString().split('T')[0]}">
              </div>
            </div>
            
            <div class="form-group">
              <label>Pictures (Upload Files Directly or Paste Paths) *</label>
              <div style="display:flex;gap:0.75rem;margin-bottom:0.5rem;flex-wrap:wrap;align-items:center;">
                <input type="file" id="file-news-upload" accept="image/*" multiple style="display:none;" onchange="handleNewsPhotoUpload(this)">
                <button type="button" onclick="document.getElementById('file-news-upload').click()" class="btn-gradient" style="padding:0.5rem 1.25rem;border-radius:9999px;font-size:0.8rem;font-weight:700;">
                  <i class="fas fa-camera" style="margin-right:4px;"></i> Upload Photos from Computer / Phone
                </button>
                <span id="newsUploadStatus" style="font-size:0.75rem;color:#1E40AF;font-weight:600;"></span>
              </div>
              <input type="text" id="newsImagesInput" name="images" required value="assets/images/village_community.jpg" class="form-control" placeholder="assets/images/photo1.jpg, assets/images/photo2.jpg">
              <div id="newsUploadThumbs" style="display:flex;gap:6px;margin-top:0.5rem;flex-wrap:wrap;"></div>
              <small style="color:#64748B;font-size:0.75rem;">Click the button to select photos from your device — paths will automatically fill in above.</small>
            </div>

            <div class="form-group">
              <label>Summary / Short Description *</label>
              <textarea name="summary" rows="2" required placeholder="Brief excerpt..." class="form-control"></textarea>
            </div>
            <div class="form-group">
              <label>Full Content</label>
              <textarea name="content" rows="3" placeholder="Full body content..." class="form-control"></textarea>
            </div>
            <button type="submit" class="btn-submit" style="width:auto;padding:0.75rem 2rem;">
              <i class="fas fa-upload" style="margin-right:6px;"></i> Publish Live Article
            </button>
          </form>
        </div>

        <div style="overflow-x:auto;">
          <table class="data-table">
            <thead>
              <tr><th>Pictures</th><th>Date</th><th>Category</th><th>Title</th><th>Summary</th><th>Action</th></tr>
            </thead>
            <tbody id="newsTableBody"></tbody>
          </table>
        </div>
      </div>

      <!-- TAB 5: SHOP PRODUCTS (MULTI-PICTURE) -->
      <div id="view-products" class="admin-card" style="display:none;">
        <h2 class="serif-heading" style="font-size:1.4rem;color:#1E3A8A;margin-bottom:0.25rem;">Artisanal &amp; Bakery Products (Multiple Pictures Option)</h2>
        <p style="color:#64748B;font-size:0.85rem;margin-bottom:1.5rem;">Add handcrafted products with multiple photos so customers can view different angles.</p>

        <!-- Add Product Form -->
        <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:1rem;padding:1.5rem;margin-bottom:2rem;">
          <h3 style="font-size:1rem;font-weight:700;color:#1E3A8A;margin-bottom:1rem;"><i class="fas fa-cart-plus" style="color:#F97316;"></i> Add Shop Product</h3>
          <form id="formAddProduct" onsubmit="handleAddProduct(event)">
            <div class="form-grid">
              <div class="form-group" style="margin:0;">
                <label>Product Title *</label>
                <input type="text" name="title" required placeholder="e.g. Sourdough Loaf" class="form-control">
              </div>
              <div class="form-group" style="margin:0;">
                <label>Category *</label>
                <select name="category" class="form-control">
                  <option value="bakery">Organic Bakery</option>
                  <option value="textile">Textiles &amp; Handloom</option>
                  <option value="wood">Woodwork</option>
                  <option value="candles">Beeswax Candles &amp; Art</option>
                  <option value="farm">Farm &amp; Honey</option>
                </select>
              </div>
              <div class="form-group" style="margin:0;">
                <label>Workshop *</label>
                <input type="text" name="workshop" required placeholder="e.g. Roshni Stone-Oven Bakery" class="form-control">
              </div>
              <div class="form-group" style="margin:0;">
                <label>Price (PKR) *</label>
                <input type="number" name="price" required min="10" placeholder="e.g. 450" class="form-control">
              </div>
              <div class="form-group" style="margin:0;">
                <label>Icon Emoji</label>
                <input type="text" name="icon" value="🍞" class="form-control">
              </div>
            </div>

            <div class="form-group">
              <label>Product Photos (Upload Files Directly or Paste Paths) *</label>
              <div style="display:flex;gap:0.75rem;margin-bottom:0.5rem;flex-wrap:wrap;align-items:center;">
                <input type="file" id="file-prod-upload" accept="image/*" multiple style="display:none;" onchange="handleProductPhotoUpload(this)">
                <button type="button" onclick="document.getElementById('file-prod-upload').click()" class="btn-gradient" style="padding:0.5rem 1.25rem;border-radius:9999px;font-size:0.8rem;font-weight:700;">
                  <i class="fas fa-camera" style="margin-right:4px;"></i> Upload Photos from Computer / Phone
                </button>
                <span id="prodUploadStatus" style="font-size:0.75rem;color:#1E40AF;font-weight:600;"></span>
              </div>
              <input type="text" id="prodImagesInput" name="images" required value="assets/images/crafts_workshop.jpg" class="form-control" placeholder="assets/images/prod1.jpg, assets/images/prod2.jpg">
              <div id="prodUploadThumbs" style="display:flex;gap:6px;margin-top:0.5rem;flex-wrap:wrap;"></div>
              <small style="color:#64748B;font-size:0.75rem;">Click the button to select photos from your device — multiple photos can be selected at once.</small>
            </div>

            <div class="form-group">
              <label>Description *</label>
              <textarea name="desc" rows="2" required placeholder="Description of craftsmanship and materials..." class="form-control"></textarea>
            </div>
            <button type="submit" class="btn-submit" style="width:auto;padding:0.75rem 2rem;">
              <i class="fas fa-plus" style="margin-right:6px;"></i> Add Product to Catalog
            </button>
          </form>
        </div>

        <div style="overflow-x:auto;">
          <table class="data-table">
            <thead>
              <tr><th>Icon &amp; Photos</th><th>Title</th><th>Workshop</th><th>Category</th><th>Price</th><th>Description</th><th>Action</th></tr>
            </thead>
            <tbody id="productsTableBody"></tbody>
          </table>
        </div>
      </div>

      <!-- TAB 6: EVENTS -->
      <div id="view-events" class="admin-card" style="display:none;">
        <h2 class="serif-heading" style="font-size:1.4rem;color:#1E3A8A;margin-bottom:0.25rem;">Upcoming Events &amp; Festivals</h2>
        <p style="color:#64748B;font-size:0.85rem;margin-bottom:1.5rem;">Schedule real events and community gatherings on Bedian Road.</p>

        <!-- Add Event Form -->
        <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:1rem;padding:1.5rem;margin-bottom:2rem;">
          <h3 style="font-size:1rem;font-weight:700;color:#1E3A8A;margin-bottom:1rem;"><i class="fas fa-calendar-plus" style="color:#F97316;"></i> Add New Event</h3>
          <form id="formAddEvent" onsubmit="handleAddEvent(event)">
            <div class="form-grid">
              <div class="form-group" style="margin:0;">
                <label>Event Title *</label>
                <input type="text" name="title" required placeholder="e.g. Winter Artisanal Craft Bazaar 2026" class="form-control">
              </div>
              <div class="form-group" style="margin:0;">
                <label>Date *</label>
                <input type="date" name="date" required class="form-control">
              </div>
              <div class="form-group" style="margin:0;">
                <label>Time</label>
                <input type="text" name="time" placeholder="e.g. 10:00 AM – 4:00 PM" class="form-control">
              </div>
              <div class="form-group" style="margin:0;">
                <label>Category</label>
                <select name="category" class="form-control">
                  <option value="Community Bazaar">Community Bazaar</option>
                  <option value="Educational Workshop">Educational Workshop</option>
                  <option value="Volunteer Gathering">Volunteer Gathering</option>
                  <option value="Cultural Festival">Cultural Festival</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label>Location</label>
              <input type="text" name="location" value="Roshni Village, Karbath Soling, Bedian Road, Lahore" class="form-control">
            </div>
            <div class="form-group">
              <label>Description *</label>
              <textarea name="description" rows="2" required placeholder="Details..." class="form-control"></textarea>
            </div>
            <button type="submit" class="btn-submit" style="width:auto;padding:0.75rem 2rem;">
              <i class="fas fa-plus" style="margin-right:6px;"></i> Schedule Event
            </button>
          </form>
        </div>

        <div style="overflow-x:auto;">
          <table class="data-table">
            <thead>
              <tr><th>Date &amp; Time</th><th>Category</th><th>Title</th><th>Location</th><th>Description</th><th>Action</th></tr>
            </thead>
            <tbody id="eventsTableBody"></tbody>
          </table>
        </div>
      </div>

      <!-- TAB 7: NEWSLETTER CAMPAIGNS -->
      <div id="view-newsletter" class="admin-card" style="display:none;">
        <h2 class="serif-heading" style="font-size:1.4rem;color:#1E3A8A;margin-bottom:0.25rem;">Newsletter Broadcasts &amp; Subscribers</h2>
        <p style="color:#64748B;font-size:0.85rem;margin-bottom:1.5rem;">Broadcast community newsletters to real registered subscribers.</p>

        <!-- Broadcast Form -->
        <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:1rem;padding:1.5rem;margin-bottom:2rem;">
          <h3 style="font-size:1rem;font-weight:700;color:#1E3A8A;margin-bottom:1rem;"><i class="fas fa-paper-plane" style="color:#F97316;"></i> Create &amp; Broadcast Newsletter</h3>
          <form id="formAddNewsletter" onsubmit="handleAddNewsletter(event)">
            <div class="form-grid">
              <div class="form-group" style="margin:0;">
                <label>Subject Line *</label>
                <input type="text" name="subject" required placeholder="e.g. Roshni Autumn Edition: Winter Bazaar Announcement" class="form-control">
              </div>
              <div class="form-group" style="margin:0;">
                <label>Issue Title *</label>
                <input type="text" name="issueTitle" required placeholder="e.g. Issue #50 - Autumn 2026" class="form-control">
              </div>
              <div class="form-group" style="margin:0;">
                <label>Newsletter PDF Document</label>
                <div style="display:flex;gap:0.5rem;align-items:center;">
                  <input type="text" name="pdfUrl" id="newsletterPdfInput" placeholder="/assets/documents/roshni_newsletter.pdf" class="form-control" style="flex:1;">
                  <input type="file" id="newsletterPdfFile" accept=".pdf,application/pdf" style="display:none;" onchange="handleNewsletterPdfUpload(this)">
                  <button type="button" onclick="document.getElementById('newsletterPdfFile').click()" style="background:#EF4444;color:#fff;border:none;padding:0.75rem 1rem;border-radius:0.75rem;font-weight:700;font-size:0.8rem;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:6px;">
                    <i class="fas fa-file-pdf"></i> Upload PDF File
                  </button>
                </div>
                <div id="newsletterPdfStatus" style="font-size:0.72rem;color:#16A34A;margin-top:4px;font-weight:600;"></div>
              </div>
            </div>
            <div class="form-group">
              <label>Newsletter Preview / Summary *</label>
              <textarea name="previewText" rows="2" required placeholder="Summary sent to email subscribers and shown in newsletter cards..." class="form-control"></textarea>
            </div>
            <div class="form-group">
              <label>Full Newsletter Article Content (Optional - for web reading)</label>
              <textarea name="content" rows="4" placeholder="Full chronicle text for online reading on the website archive..." class="form-control"></textarea>
            </div>
            <button type="submit" class="btn-submit" style="width:auto;padding:0.75rem 2rem;">
              <i class="fas fa-paper-plane" style="margin-right:6px;"></i> Broadcast to Subscribers &amp; Publish to Web
            </button>
          </form>
        </div>

        <h3 style="font-size:1.1rem;font-weight:700;color:#1E3A8A;margin:1.5rem 0 0.75rem;">Campaign History</h3>
        <div style="overflow-x:auto;margin-bottom:2rem;">
          <table class="data-table">
            <thead>
              <tr><th>Date</th><th>Issue</th><th>Subject</th><th>Content</th><th>Recipients</th><th>Action</th></tr>
            </thead>
            <tbody id="newsletterTableBody"></tbody>
          </table>
        </div>

        <h3 style="font-size:1.1rem;font-weight:700;color:#1E3A8A;margin:1.5rem 0 0.75rem;">Real Registered Subscribers (<span id="subscribersListCount">0</span>)</h3>
        <div style="overflow-x:auto;">
          <table class="data-table">
            <thead>
              <tr><th>Date Subscribed</th><th>Email Address</th></tr>
            </thead>
            <tbody id="subscribersTableBody"></tbody>
          </table>
        </div>
      </div>

      <!-- TAB 8: ORDERS -->
      <div id="view-orders" class="admin-card" style="display:none;">
        <h2 class="serif-heading" style="font-size:1.4rem;color:#1E3A8A;margin-bottom:0.25rem;">Live Customer Orders</h2>
        <p style="color:#64748B;font-size:0.85rem;margin-bottom:1.5rem;">Orders submitted via the online shop for Cash on Delivery.</p>
        <div style="overflow-x:auto;">
          <table class="data-table">
            <thead>
              <tr><th>Order Date</th><th>Customer</th><th>Phone / WhatsApp</th><th>Delivery Address</th><th>Items</th><th>Total</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody id="ordersTableBody"></tbody>
          </table>
        </div>
      </div>

      <!-- TAB 9: VOLUNTEERS -->
      <div id="view-volunteers" class="admin-card" style="display:none;">
        <h2 class="serif-heading" style="font-size:1.4rem;color:#1E3A8A;margin-bottom:0.25rem;">Live Volunteer Applications</h2>
        <p style="color:#64748B;font-size:0.85rem;margin-bottom:1.5rem;">Registered applicants waiting for community orientation.</p>
        <div style="overflow-x:auto;">
          <table class="data-table">
            <thead>
              <tr><th>Date</th><th>Name</th><th>Age</th><th>Contact</th><th>City</th><th>Format</th><th>Interest</th><th>Motivation</th><th>Action</th></tr>
            </thead>
            <tbody id="volunteersTableBody"></tbody>
          </table>
        </div>
      </div>

      <!-- TAB 10: DONATIONS -->
      <div id="view-donations" class="admin-card" style="display:none;">
        <h2 class="serif-heading" style="font-size:1.4rem;color:#1E3A8A;margin-bottom:0.25rem;">Live Donation Pledges</h2>
        <p style="color:#64748B;font-size:0.85rem;margin-bottom:1.5rem;">Pledges received through Habib Bank &amp; JazzCash.</p>
        <div style="overflow-x:auto;">
          <table class="data-table">
            <thead>
              <tr><th>Date</th><th>Donor</th><th>Email &amp; Phone</th><th>Purpose</th><th>Amount (PKR)</th><th>Payment Intent</th><th>Action</th></tr>
            </thead>
            <tbody id="donationsTableBody"></tbody>
          </table>
        </div>
      </div>

      <!-- TAB 11: CONTACT INQUIRIES -->
      <div id="view-contacts" class="admin-card" style="display:none;">
        <h2 class="serif-heading" style="font-size:1.4rem;color:#1E3A8A;margin-bottom:0.25rem;">Live Contact Inquiries</h2>
        <p style="color:#64748B;font-size:0.85rem;margin-bottom:1.5rem;">Messages and visit requests received via website.</p>
        <div style="overflow-x:auto;">
          <table class="data-table">
            <thead>
              <tr><th>Date</th><th>Name</th><th>Contact</th><th>Subject</th><th>Message</th><th>Action</th></tr>
            </thead>
            <tbody id="contactsTableBody"></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Scripts -->
    <script>
      let currentTab = 'milestones';

      function switchTab(tab, btn) {
        currentTab = tab;
        document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        const views = ['milestones', 'team', 'upload', 'figures', 'news', 'products', 'events', 'newsletter', 'orders', 'volunteers', 'donations', 'contacts'];
        views.forEach(v => {
          const el = document.getElementById('view-' + v);
          if (el) el.style.display = (v === tab) ? 'block' : 'none';
        });
      }

      async function fetchJSON(url) {
        try {
          const res = await fetch(url);
          return await res.json();
        } catch(e) {
          console.error(e);
          return [];
        }
      }

      function handleFileSelected(slot, input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = async function(e) {
          const base64Data = e.target.result;
          const previewEl = document.getElementById('preview-' + slot);
          if (previewEl) previewEl.src = base64Data;
          if (slot === 'monogram') {
            const headerLogo = document.getElementById('adminHeaderLogo');
            if (headerLogo) headerLogo.src = base64Data;
          }

          try {
            const res = await fetch('/api/upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ slot, base64Data, filename: file.name })
            });
            const json = await res.json();
            if (json.ok) {
              alert('✅ Your ' + slot + ' image was saved successfully and is now active across the website!');
            } else {
              alert('Upload failed: ' + (json.error || 'Server error'));
            }
          } catch(err) {
            alert('Upload error: ' + err.message);
          }
        };
        reader.readAsDataURL(file);
      }

      // Helper to upload a single file via base64
      async function uploadFilePromise(file, slot = null) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = async function(e) {
            try {
              const res = await fetch('/api/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slot, base64Data: e.target.result, filename: file.name })
              });
              const json = await res.json();
              if (json.ok) resolve(json.url);
              else reject(new Error(json.error || 'Upload failed'));
            } catch(err) {
              reject(err);
            }
          };
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsDataURL(file);
        });
      }

      // Universal Uploader (Tab 2)
      async function handleUniversalFileUpload(input) {
        if (!input.files || !input.files.length) return;
        const statusEl = document.getElementById('universalUploadStatus');
        const previewsEl = document.getElementById('universalUploadPreviews');
        statusEl.textContent = '⏳ Uploading ' + input.files.length + ' photo(s)...';

        const files = Array.from(input.files);
        for (const file of files) {
          try {
            const url = await uploadFilePromise(file);
            const thumb = document.createElement('div');
            thumb.style.cssText = 'position:relative;background:#fff;padding:6px;border-radius:8px;border:1px solid #BFDBFE;box-shadow:0 2px 6px rgba(0,0,0,0.08);';
            thumb.innerHTML = '<img src="/' + url + '" style="width:70px;height:70px;object-fit:cover;border-radius:6px;display:block;"><small style="display:block;max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.68rem;color:#1E40AF;margin-top:4px;">' + escapeHtml(file.name) + '</small>';
            previewsEl.appendChild(thumb);
          } catch(err) {
            console.error('File upload failed:', err);
          }
        }
        statusEl.textContent = '✅ Successfully uploaded ' + files.length + ' photo(s)!';
      }

      // News Photos Uploader
      async function handleNewsPhotoUpload(input) {
        if (!input.files || !input.files.length) return;
        const statusEl = document.getElementById('newsUploadStatus');
        const thumbsEl = document.getElementById('newsUploadThumbs');
        const inputEl = document.getElementById('newsImagesInput');
        statusEl.textContent = '⏳ Uploading ' + input.files.length + ' photo(s)...';

        const files = Array.from(input.files);
        const uploadedUrls = [];
        for (const file of files) {
          try {
            const url = await uploadFilePromise(file);
            uploadedUrls.push(url);
            const img = document.createElement('img');
            img.src = '/' + url;
            img.className = 'img-preview-thumb';
            img.style.border = '2px solid #1E40AF';
            thumbsEl.appendChild(img);
          } catch(err) {
            console.error('News photo upload error:', err);
          }
        }
        if (uploadedUrls.length) {
          inputEl.value = uploadedUrls.join(', ');
          statusEl.textContent = '✅ ' + uploadedUrls.length + ' photo(s) uploaded and attached!';
        }
      }

      // Product Photos Uploader
      async function handleProductPhotoUpload(input) {
        if (!input.files || !input.files.length) return;
        const statusEl = document.getElementById('prodUploadStatus');
        const thumbsEl = document.getElementById('prodUploadThumbs');
        const inputEl = document.getElementById('prodImagesInput');
        statusEl.textContent = '⏳ Uploading ' + input.files.length + ' photo(s)...';

        const files = Array.from(input.files);
        const uploadedUrls = [];
        for (const file of files) {
          try {
            const url = await uploadFilePromise(file);
            uploadedUrls.push(url);
            const img = document.createElement('img');
            img.src = '/' + url;
            img.className = 'img-preview-thumb';
            img.style.border = '2px solid #F97316';
            thumbsEl.appendChild(img);
          } catch(err) {
            console.error('Product photo upload error:', err);
          }
        }
        if (uploadedUrls.length) {
          inputEl.value = uploadedUrls.join(', ');
          statusEl.textContent = '✅ ' + uploadedUrls.length + ' photo(s) uploaded and attached!';
        }
      }

      // Newsletter PDF Uploader
      async function handleNewsletterPdfUpload(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];
        const statusEl = document.getElementById('newsletterPdfStatus');
        const inputEl = document.getElementById('newsletterPdfInput');
        statusEl.textContent = '⏳ Uploading PDF (' + file.name + ')...';
        try {
          const url = await uploadFilePromise(file);
          inputEl.value = '/' + url;
          statusEl.textContent = '✅ PDF uploaded successfully! (' + file.name + ')';
        } catch(err) {
          statusEl.textContent = '❌ Upload failed: ' + err.message;
        }
      }

      async function loadAllData() {
        const [stats, settings, milestones, team, news, events, products, newsletters, orders, volunteers, donations, contacts, subscribers] = await Promise.all([
          fetchJSON('/api/stats'),
          fetchJSON('/api/settings'),
          fetchJSON('/api/milestones'),
          fetchJSON('/api/team'),
          fetchJSON('/api/news'),
          fetchJSON('/api/events'),
          fetchJSON('/api/products'),
          fetchJSON('/api/newsletters'),
          fetchJSON('/api/orders'),
          fetchJSON('/api/volunteers'),
          fetchJSON('/api/donations'),
          fetchJSON('/api/contacts'),
          fetchJSON('/api/subscribers')
        ]);

        // Populate Real Figures Form
        document.getElementById('settingFoundedYear').value = settings.foundedYear || 1991;
        document.getElementById('settingSpecialResidents').value = settings.specialResidentsCount || 42;
        document.getElementById('settingStudentsEnrolled').value = settings.studentsEnrolledCount || 165;
        document.getElementById('settingWorkshopsCount').value = settings.activeWorkshopsCount || 5;
        document.getElementById('settingHousesCount').value = settings.residentialHousesCount || 4;
        document.getElementById('settingPhone').value = settings.phone || '+92 42 37167791';
        document.getElementById('settingWhatsApp').value = settings.whatsapp || '+92 322 4767808';
        document.getElementById('settingEmail').value = settings.email || 'pr@roshni.org.pk';

        // Update real-time overview counts
        document.getElementById('statResidentsCount').textContent = stats.specialResidentsCount;
        document.getElementById('statStudentsCount').textContent = stats.studentsEnrolledCount;
        document.getElementById('statVolunteersCount').textContent = volunteers.length;
        document.getElementById('statDonationsAmount').textContent = 'PKR ' + (stats.totalDonationAmount || 0).toLocaleString();
        document.getElementById('statDonationsCount').textContent = donations.length + ' Pledges Recorded';

        document.getElementById('tabOrderCount').textContent = orders.length;
        document.getElementById('tabVolCount').textContent = volunteers.length;
        document.getElementById('tabDonCount').textContent = donations.length;
        document.getElementById('tabContactCount').textContent = contacts.length;
        document.getElementById('subscribersListCount').textContent = subscribers.length;

        // Render Milestones
        document.getElementById('milestonesTableBody').innerHTML = milestones.map(m => \`
          <tr>
            <td><strong style="color:#1E40AF;font-size:1.1rem;">\${escapeHtml(m.year)}</strong></td>
            <td><strong>\${escapeHtml(m.title)}</strong></td>
            <td>\${escapeHtml(m.description)}</td>
            <td><button onclick="deleteItem('/api/milestones/\${m.id}')" class="btn-del"><i class="fas fa-trash"></i> Delete</button></td>
          </tr>
        \`).join('') || '<tr><td colspan="4" style="text-align:center;color:#94A3B8;">No milestones recorded yet. Add your first above!</td></tr>';

        // Render Team & Profiles
        const categoryLabels = {
          board: '🏛️ Board of Trustees',
          living: '🏡 Community Living',
          staff: '🛠️ Master Staff / Teachers'
        };
        const categoryBadges = {
          board: 'badge-blue',
          living: 'badge-orange',
          staff: 'badge-green'
        };
        const teamBody = document.getElementById('teamTableBody');
        if (teamBody) {
          teamBody.innerHTML = team.map(t => \`
            <tr>
              <td>
                <img src="\${t.image || '/assets/images/roshni_logo.jpg'}" style="width:42px;height:42px;border-radius:50%;object-fit:cover;border:2px solid #BFDBFE;">
              </td>
              <td><strong>\${escapeHtml(t.name)}</strong></td>
              <td>\${escapeHtml(t.role)}</td>
              <td><span class="badge \${categoryBadges[t.category] || 'badge-blue'}">\${categoryLabels[t.category] || t.category}</span></td>
              <td>\${escapeHtml(t.bio || '')}</td>
              <td><button onclick="deleteItem('/api/team/\${t.id}')" class="btn-del"><i class="fas fa-trash"></i> Delete</button></td>
            </tr>
          \`).join('') || '<tr><td colspan="6" style="text-align:center;color:#94A3B8;">No team profiles recorded. Add your first above!</td></tr>';
        }

        // Render News with Multiple Images
        document.getElementById('newsTableBody').innerHTML = news.map(n => {
          const imgs = (n.images && n.images.length) ? n.images : [n.image || '/assets/images/village_community.jpg'];
          const thumbs = imgs.map(src => \`<img src="\${src}" class="img-preview-thumb" style="margin-right:4px;">\`).join('');
          return \`
            <tr>
              <td><div style="display:flex;gap:4px;flex-wrap:wrap;">\${thumbs}</div><small style="color:#64748B;">\${imgs.length} photo(s)</small></td>
              <td>\${n.date}</td>
              <td><span class="badge badge-blue">\${escapeHtml(n.category)}</span></td>
              <td><strong>\${escapeHtml(n.title)}</strong></td>
              <td>\${escapeHtml(n.summary)}</td>
              <td><button onclick="deleteItem('/api/news/\${n.id}')" class="btn-del"><i class="fas fa-trash"></i> Delete</button></td>
            </tr>
          \`;
        }).join('') || '<tr><td colspan="6" style="text-align:center;color:#94A3B8;">No news stories.</td></tr>';

        // Render Products with Multiple Images
        document.getElementById('productsTableBody').innerHTML = products.map(p => {
          const imgs = (p.images && p.images.length) ? p.images : [p.image || '/assets/images/crafts_workshop.jpg'];
          const thumbs = imgs.map(src => \`<img src="\${src}" class="img-preview-thumb" style="margin-right:4px;">\`).join('');
          return \`
            <tr>
              <td>
                <div style="font-size:1.5rem;margin-bottom:4px;">\${p.icon || '🎁'}</div>
                <div style="display:flex;gap:4px;flex-wrap:wrap;">\${thumbs}</div>
                <small style="color:#64748B;">\${imgs.length} photo(s)</small>
              </td>
              <td><strong>\${escapeHtml(p.title)}</strong></td>
              <td>\${escapeHtml(p.workshop || '')}</td>
              <td><span class="badge badge-blue">\${escapeHtml(p.category)}</span></td>
              <td style="font-weight:700;color:#EA580C;">PKR \${Number(p.price).toLocaleString()}</td>
              <td>\${escapeHtml(p.desc || '')}</td>
              <td><button onclick="deleteItem('/api/products/\${p.id}')" class="btn-del"><i class="fas fa-trash"></i> Delete</button></td>
            </tr>
          \`;
        }).join('') || '<tr><td colspan="7" style="text-align:center;color:#94A3B8;">No products in catalog.</td></tr>';

        // Render Events
        document.getElementById('eventsTableBody').innerHTML = events.map(e => \`
          <tr>
            <td><strong>\${e.date}</strong><br><small style="color:#64748B;">\${escapeHtml(e.time || '')}</small></td>
            <td><span class="badge badge-orange">\${escapeHtml(e.category)}</span></td>
            <td><strong>\${escapeHtml(e.title)}</strong></td>
            <td>\${escapeHtml(e.location)}</td>
            <td>\${escapeHtml(e.description)}</td>
            <td><button onclick="deleteItem('/api/events/\${e.id}')" class="btn-del"><i class="fas fa-trash"></i> Delete</button></td>
          </tr>
        \`).join('') || '<tr><td colspan="6" style="text-align:center;color:#94A3B8;">No scheduled events.</td></tr>';

        // Render Newsletters
        document.getElementById('newsletterTableBody').innerHTML = newsletters.map(nl => {
          const pdfBtn = nl.pdfUrl ? '<br><a href="' + nl.pdfUrl + '" target="_blank" style="color:#1E40AF;font-size:0.75rem;font-weight:700;"><i class="fas fa-file-pdf" style="color:#EF4444;"></i> Open PDF Document</a>' : '';
          return \`
            <tr>
              <td>\${nl.sentDate}</td>
              <td><strong>\${escapeHtml(nl.issueTitle)}</strong></td>
              <td><strong>\${escapeHtml(nl.subject)}</strong>\${pdfBtn}</td>
              <td>\${escapeHtml(nl.previewText)}</td>
              <td><span class="badge badge-green">\${nl.sentToCount || 0} Sent</span></td>
              <td><button onclick="deleteItem('/api/newsletters/\${nl.id}')" class="btn-del"><i class="fas fa-trash"></i> Delete</button></td>
            </tr>
          \`;
        }).join('') || '<tr><td colspan="6" style="text-align:center;color:#94A3B8;">No campaigns issued.</td></tr>';

        // Render Subscribers
        document.getElementById('subscribersTableBody').innerHTML = subscribers.map(s => \`
          <tr>
            <td>\${new Date(s.subscribedAt).toLocaleDateString()}</td>
            <td><strong>\${escapeHtml(s.email)}</strong></td>
          </tr>
        \`).join('') || '<tr><td colspan="2" style="text-align:center;color:#94A3B8;">No subscribers yet.</td></tr>';

        // Render Orders
        document.getElementById('ordersTableBody').innerHTML = orders.map(o => \`
          <tr>
            <td>\${new Date(o.orderDate).toLocaleDateString()}</td>
            <td><strong>\${escapeHtml(o.customerName)}</strong></td>
            <td><a href="https://wa.me/\${(o.customerPhone||'').replace(/[^0-9]/g,'')}" target="_blank" style="color:#16A34A;font-weight:600;"><i class="fab fa-whatsapp"></i> \${escapeHtml(o.customerPhone)}</a></td>
            <td>\${escapeHtml(o.deliveryAddress)}</td>
            <td>
              <ul style="padding-left:1.2rem;margin:0;">
                \${(o.items || []).map(i => \`<li>\${escapeHtml(i.title)} x\${i.qty}</li>\`).join('')}
              </ul>
            </td>
            <td style="font-weight:700;color:#EA580C;">PKR \${Number(o.total).toLocaleString()}</td>
            <td>
              <select onchange="updateOrderStatus(\${o.id}, this.value)" style="padding:0.25rem 0.5rem;border-radius:4px;border:1px solid #CBD5E1;font-size:0.75rem;">
                <option value="Pending Dispatch" \${o.status === 'Pending Dispatch' ? 'selected' : ''}>Pending Dispatch</option>
                <option value="Out for Delivery" \${o.status === 'Out for Delivery' ? 'selected' : ''}>Out for Delivery</option>
                <option value="Delivered" \${o.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
              </select>
            </td>
            <td><button onclick="deleteItem('/api/orders/\${o.id}')" class="btn-del"><i class="fas fa-trash"></i></button></td>
          </tr>
        \`).join('') || '<tr><td colspan="8" style="text-align:center;color:#94A3B8;">No orders yet.</td></tr>';

        // Render Volunteers
        document.getElementById('volunteersTableBody').innerHTML = volunteers.map(v => \`
          <tr>
            <td>\${new Date(v.createdAt).toLocaleDateString()}</td>
            <td><strong>\${escapeHtml(v.name)}</strong></td>
            <td>\${escapeHtml(v.age || '')}</td>
            <td>\${escapeHtml(v.email)}<br><a href="https://wa.me/\${(v.phone||'').replace(/[^0-9]/g,'')}" target="_blank" style="color:#16A34A;"><i class="fab fa-whatsapp"></i> \${escapeHtml(v.phone||'')}</a></td>
            <td>\${escapeHtml(v.city || '')}</td>
            <td><span class="badge badge-orange">\${escapeHtml(v.volunteerType || '')}</span></td>
            <td><span class="badge badge-blue">\${escapeHtml(v.areaOfInterest || '')}</span></td>
            <td>\${escapeHtml(v.motivation || '')}</td>
            <td><button onclick="deleteItem('/api/volunteers/\${v.id}')" class="btn-del"><i class="fas fa-trash"></i></button></td>
          </tr>
        \`).join('') || '<tr><td colspan="9" style="text-align:center;color:#94A3B8;">No volunteers yet.</td></tr>';

        // Render Donations
        document.getElementById('donationsTableBody').innerHTML = donations.map(d => \`
          <tr>
            <td>\${new Date(d.createdAt).toLocaleDateString()}</td>
            <td><strong>\${escapeHtml(d.name)}</strong></td>
            <td>\${escapeHtml(d.email)}<br><small>\${escapeHtml(d.phone || '')}</small></td>
            <td>\${escapeHtml(d.purpose || '')}</td>
            <td style="font-weight:700;color:#16A34A;">PKR \${Number(d.amount).toLocaleString()}</td>
            <td><span class="badge badge-green">\${escapeHtml(d.paymentMethod || '')}</span></td>
            <td><button onclick="deleteItem('/api/donations/\${d.id}')" class="btn-del"><i class="fas fa-trash"></i></button></td>
          </tr>
        \`).join('') || '<tr><td colspan="7" style="text-align:center;color:#94A3B8;">No donations recorded yet.</td></tr>';

        // Render Contacts
        document.getElementById('contactsTableBody').innerHTML = contacts.map(c => \`
          <tr>
            <td>\${new Date(c.createdAt).toLocaleDateString()}</td>
            <td><strong>\${escapeHtml(c.name)}</strong></td>
            <td>\${escapeHtml(c.email)}<br><a href="https://wa.me/\${(c.phone||'').replace(/[^0-9]/g,'')}" target="_blank" style="color:#16A34A;"><i class="fab fa-whatsapp"></i> \${escapeHtml(c.phone||'')}</a></td>
            <td><span class="badge badge-blue">\${escapeHtml(c.subject || '')}</span></td>
            <td>\${escapeHtml(c.message || '')}</td>
            <td><button onclick="deleteItem('/api/contacts/\${c.id}')" class="btn-del"><i class="fas fa-trash"></i></button></td>
          </tr>
        \`).join('') || '<tr><td colspan="6" style="text-align:center;color:#94A3B8;">No inquiries received yet.</td></tr>';
      }

      async function handleAddTeam(e) {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target).entries());
        const res = await fetch('/api/team', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (res.ok) {
          alert('✅ Profile added successfully! It will now appear on the About Us page.');
          e.target.reset();
          loadAllData();
        } else {
          alert('Failed to add profile.');
        }
      }

      async function handleAddMilestone(e) {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target).entries());
        const res = await fetch('/api/milestones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (res.ok) {
          alert('✅ Milestone added to real timeline!');
          e.target.reset();
          loadAllData();
        } else {
          alert('Failed to add milestone.');
        }
      }

      async function handleSaveSettings(e) {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target).entries());
        const res = await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (res.ok) {
          alert('✅ Real-time figures saved! The website and API now reflect these figures.');
          loadAllData();
        } else {
          alert('Failed to save settings.');
        }
      }

      async function handleAddNews(e) {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target).entries());
        try {
          const res = await fetch('/api/news', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          const json = await res.json();
          if (res.ok && json.ok) {
            alert('✅ Article with pictures published successfully!');
            e.target.reset();
            const thumbs = document.getElementById('newsUploadThumbs');
            if (thumbs) thumbs.innerHTML = '';
            const status = document.getElementById('newsUploadStatus');
            if (status) status.textContent = '';
            loadAllData();
          } else {
            alert('Failed to publish article: ' + (json.error || 'Server error'));
          }
        } catch(err) {
          alert('Network error while publishing article: ' + err.message);
        }
      }

      async function handleAddProduct(e) {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target).entries());
        try {
          const res = await fetch('/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          const json = await res.json();
          if (res.ok && json.ok) {
            alert('✅ Product with pictures added to catalog!');
            e.target.reset();
            const thumbs = document.getElementById('prodUploadThumbs');
            if (thumbs) thumbs.innerHTML = '';
            const status = document.getElementById('prodUploadStatus');
            if (status) status.textContent = '';
            loadAllData();
          } else {
            alert('Failed to add product: ' + (json.error || 'Server error'));
          }
        } catch(err) {
          alert('Network error while adding product: ' + err.message);
        }
      }

      async function handleAddEvent(e) {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target).entries());
        try {
          const res = await fetch('/api/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          const json = await res.json();
          if (res.ok && json.ok) {
            alert('✅ Event scheduled successfully!');
            e.target.reset();
            loadAllData();
          } else {
            alert('Failed to schedule event: ' + (json.error || 'Server error'));
          }
        } catch(err) {
          alert('Network error while scheduling event: ' + err.message);
        }
      }

      async function handleAddNewsletter(e) {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target).entries());
        try {
          const res = await fetch('/api/newsletters', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          const json = await res.json();
          if (res.ok && json.ok) {
            alert('✅ Newsletter broadcast recorded and published!');
            e.target.reset();
            const pdfStatus = document.getElementById('newsletterPdfStatus');
            if (pdfStatus) pdfStatus.textContent = '';
            loadAllData();
          } else {
            alert('Failed to publish newsletter: ' + (json.error || 'Server error'));
          }
        } catch(err) {
          alert('Network error while broadcasting newsletter: ' + err.message);
        }
      }

      async function deleteItem(url) {
        if (!confirm('Are you sure you want to delete this item?')) return;
        try {
          const res = await fetch(url, { method: 'DELETE' });
          const json = await res.json();
          if (res.ok && json.ok) {
            loadAllData();
          } else {
            alert('Failed to delete item: ' + (json.error || 'Server error'));
          }
        } catch(err) {
          alert('Network error while deleting item: ' + err.message);
        }
      }

      async function updateOrderStatus(id, status) {
        await fetch('/api/orders/' + id + '/status', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });
      }

      function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
      }

      window.addEventListener('DOMContentLoaded', loadAllData);
    </script>
  </body>
  </html>
  `;
  res.send(html);
});

// ── STATIC FILE SERVING ────────────────────────────────────────────────────
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server locally; export for Vercel serverless
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 Roshni Association Web & Backend Server active!`);
    console.log(`🌐 Website URL:  http://localhost:${PORT}`);
    console.log(`📊 Admin Panel:  http://localhost:${PORT}/admin`);
    console.log(`📡 Real Stats:   http://localhost:${PORT}/api/stats`);
    console.log(`====================================================`);
  });
}

module.exports = app;
