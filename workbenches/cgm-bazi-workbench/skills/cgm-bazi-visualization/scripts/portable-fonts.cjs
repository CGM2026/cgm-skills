const fs=require('node:fs'),{subsetTTF}=require('./export-font.cjs');process.stdout.write(subsetTTF(fs.readFileSync(process.argv[2]),fs.readFileSync(0,'utf8')).toString('base64'));
