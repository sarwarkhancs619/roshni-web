const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
envContent.split('\n').forEach(line => {
  const [key, ...vals] = line.split('=');
  if (key && key.trim()) process.env[key.trim()] = vals.join('=').trim().replace(/\r/g, '');
});

const { MongoClient } = require('mongodb');

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('roshni');
  
  const audits = await db.collection('audit_reports').find({}).toArray();
  console.log('AUDIT REPORTS (' + audits.length + '):');
  audits.forEach(a => console.log('  ', JSON.stringify(a).substring(0, 200)));
  
  const newsletters = await db.collection('newsletters').find({}).toArray();
  console.log('\nNEWSLETTERS (' + newsletters.length + '):');
  newsletters.forEach(n => {
    const copy = {...n};
    if (copy.pdfData) copy.pdfData = '[BASE64 ' + (copy.pdfData.length) + ' chars]';
    console.log('  ', JSON.stringify(copy).substring(0, 300));
  });

  // List all collections
  const cols = await db.listCollections().toArray();
  console.log('\nALL COLLECTIONS:', cols.map(c => c.name).join(', '));
  
  await client.close();
}

main().catch(console.error);

