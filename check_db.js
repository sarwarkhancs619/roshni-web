const fs = require('fs');
const path = require('path');

// Read .env manually
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
envContent.split('\n').forEach(line => {
  const [key, ...vals] = line.split('=');
  if (key && key.trim()) process.env[key.trim()] = vals.join('=').trim().replace(/\r/g, '');
});

const { MongoClient } = require('mongodb');

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  console.log('URI:', uri ? uri.substring(0,30)+'...' : 'NOT FOUND');
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('roshni');
  
  const audits = await db.collection('audit_reports').find({}).toArray();
  console.log('AUDIT REPORTS:');
  audits.forEach(a => console.log(`  ID: ${a._id}, title: ${a.title}`));
  
  const newsletters = await db.collection('newsletters').find({}).toArray();
  console.log('\nNEWSLETTERS:');
  newsletters.forEach(n => console.log(`  ID: ${n._id}, title: ${n.title}`));
  
  await client.close();
}

main().catch(console.error);
