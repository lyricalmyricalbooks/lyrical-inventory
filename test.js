const fs = require('fs'); const txt = fs.readFileSync('index.html', 'utf8'); console.log('Count:', txt.split('id=\'m-price\'').length - 1);
