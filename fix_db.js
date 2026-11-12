const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
envContent.split(/\r?\n/).forEach(line => {
  const eqIdx = line.indexOf('=');
  if (eqIdx > 0) {
    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
});

const { MongoClient } = require('mongodb');
const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('roshni');
  
  // Fix newsletter pdfUrl: ensure it starts with /
  const newsletters = await db.collection('newsletters').find({}).toArray();
  for (const nl of newsletters) {
    if (nl.pdfUrl && !nl.pdfUrl.startsWith('/') && !nl.pdfUrl.startsWith('data:') && !nl.pdfUrl.startsWith('http')) {
      const fixedUrl = '/' + nl.pdfUrl;
      await db.collection('newsletters').updateOne({ _id: nl._id }, { $set: { pdfUrl: fixedUrl } });
      console.log('Fixed newsletter pdfUrl:', nl.pdfUrl, '->', fixedUrl);
    } else {
      console.log('Newsletter pdfUrl OK:', nl.pdfUrl);
    }
  }
  
  await client.close();
}

main().catch(console.error);
