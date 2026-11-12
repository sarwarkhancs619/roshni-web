const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'server.js');
let content = fs.readFileSync(filePath, 'utf8');

// Fix 1: Update audit status message to match actual button text
content = content.replace(
  /statusEl\.innerHTML = '✅ <strong>PDF attached \(' \+ file\.name \+ ' - ' \+ sz \+ '\)!<\/strong><br><span style="color:#1E40AF;font-weight:700;">👉 Click the blue.*?<\/span>';/s,
  `statusEl.innerHTML = '✅ <strong>PDF attached (' + file.name + ' - ' + sz + ')!</strong><br><span style="color:#059669;font-weight:700;">👉 Now click the green "Publish Audit Report to Website" button below to save!</span>';`
);

// Fix 2: Update newsletter status message
content = content.replace(
  /statusEl\.innerHTML = '✅ <strong>PDF attached \(' \+ file\.name \+ '\)!<\/strong><br><span style="color:#1E40AF;">Now click the blue "Broadcast to Subscribers.*?<\/span>';/s,
  `statusEl.innerHTML = '✅ <strong>PDF attached (' + file.name + ')!</strong><br><span style="color:#059669;font-weight:700;">👉 Now click "Broadcast to Subscribers & Publish to Web" to save!</span>';`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done patching server.js status messages');

